/**
 * Hardened read-only Postgres provider for Aletheia Boundary.
 *
 * Ported and adapted from aletheia-sandbox's postgres provider.
 * Defense in depth:
 *   1. Startup write probe (catalog inspection, fail-closed)
 *   2. Protocol-level single statement (pg-cursor / prepared)
 *   3. READ ONLY transaction, always rolled back
 *   4. Classifier (skeleton tokenizer + denylist)
 *   5. Bounded cursor fetch
 *   6. statement_timeout
 */

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import Cursor from "pg-cursor";
import type { BoundaryRequest, Constraint, MinimizedPayload } from "../types.js";
import type { DataProvider } from "./provider.js";

export interface PostgresProviderOptions {
  pool: Pool;
  /** Label for receipts — never the connection string. */
  identity: string;
  maxRows?: number;
  statementTimeoutMs?: number;
  requireReadOnlyRole?: boolean;
}

const READ_LEADERS = new Set(["select", "with", "explain", "show", "table", "values"]);

const DANGEROUS_FUNCTIONS = [
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "pg_logfile_rotate",
  "lo_import", "lo_export", "lo_from_bytea", "lo_get", "lo_put", "lo_unlink",
  "dblink", "dblink_exec", "dblink_connect", "dblink_send_query", "dblink_get_result", "dblink_fdw_validator",
  "pg_execute_server_program", "copy_file", "dbms_lob",
];
const DANGEROUS_RE = new RegExp(`\\b(${DANGEROUS_FUNCTIONS.join("|")})\\s*\\(`, "i");

/** Single-pass tokenizer: blank strings/comments/dollar-quotes so classification cannot desync. */
export function skeleton(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      i += 2;
      while (i < n && sql[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (two === "/*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql.slice(i, i + 2) === "/*") { depth++; i += 2; }
        else if (sql.slice(i, i + 2) === "*/") { depth--; i += 2; }
        else i++;
      }
      out += " ";
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += "''";
      continue;
    }
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*|)\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        i += tag.length;
        const end = sql.indexOf(tag, i);
        i = end === -1 ? n : end + tag.length;
        out += "''";
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export interface Classification { ok: boolean; reason?: string; leader?: string; }

export function classifyStatement(sql: string): Classification {
  if (typeof sql !== "string" || !sql.trim()) return { ok: false, reason: "empty statement" };
  const sk = skeleton(sql).trim().replace(/;+\s*$/, "");
  if (!sk) return { ok: false, reason: "empty statement" };
  if (sk.includes(";")) return { ok: false, reason: "multiple statements are not allowed" };

  const m = /^\(*\s*([A-Za-z]+)/.exec(sk);
  const leader = m?.[1]?.toLowerCase();
  if (!leader || !READ_LEADERS.has(leader))
    return { ok: false, reason: `only read-class statements are allowed (got ${leader ? leader.toUpperCase() : "?"})`, leader };

  const danger = DANGEROUS_RE.exec(sk);
  if (danger) return { ok: false, reason: `dangerous function blocked: ${danger[1].toLowerCase()}()`, leader };

  return { ok: true, leader };
}

export function isSafeIdentifier(id: string): boolean {
  return typeof id === "string" && /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/.test(id);
}

function quoteIdent(id: string): string {
  return id.split(".").map((p) => `"${p}"`).join(".");
}

class RoleCanWrite extends Error {}

export async function assertReadOnlyRole(pool: Pool): Promise<void> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const attr = await client.query(
      `SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`,
    );
    const a = attr.rows[0];
    if (a && (a.rolsuper || a.rolcreatedb || a.rolcreaterole))
      throw new RoleCanWrite("role has elevated attributes (superuser/createdb/createrole)");

    const w = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables t
        WHERE t.table_schema NOT IN ('pg_catalog','information_schema')
          AND t.table_type IN ('BASE TABLE','VIEW','FOREIGN')
          AND (has_table_privilege(format('%I.%I', t.table_schema, t.table_name), 'INSERT')
            OR has_table_privilege(format('%I.%I', t.table_schema, t.table_name), 'UPDATE')
            OR has_table_privilege(format('%I.%I', t.table_schema, t.table_name), 'DELETE')
            OR (t.table_type = 'BASE TABLE'
                AND has_table_privilege(format('%I.%I', t.table_schema, t.table_name), 'TRUNCATE')))`,
    );
    if ((w.rows[0]?.n ?? 0) > 0) throw new RoleCanWrite(`role has write privilege on ${w.rows[0].n} relation(s)`);

    const db = await client.query(`SELECT has_database_privilege(current_database(), 'CREATE') AS can_create`);
    if (db.rows[0]?.can_create) throw new RoleCanWrite("role has CREATE on the current database");

    const c = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.schemata s
        WHERE s.schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
          AND has_schema_privilege(s.schema_name, 'CREATE')`,
    );
    if ((c.rows[0]?.n ?? 0) > 0) throw new RoleCanWrite(`role can CREATE objects in ${c.rows[0].n} schema(s)`);
  } catch (e) {
    if (e instanceof RoleCanWrite)
      throw new Error(`aletheia-boundary: ${e.message}. Refusing to start — use a read-only role or a replica.`);
    throw new Error(
      `aletheia-boundary: could not verify the role is read-only (${String(e instanceof Error ? e.message : e)}). Refusing to start.`,
    );
  } finally {
    client?.release();
  }
}

interface QueryResult {
  rows: Record<string, unknown>[];
  fields: { name: string }[];
  truncated: boolean;
  rowCount: number;
}

/** Apply policy constraints to a result set (minimizer). */
function minimize(
  result: QueryResult,
  constraints?: Constraint[],
): MinimizedPayload {
  const transforms: string[] = [];
  let rows = result.rows;
  let truncated = result.truncated;

  if (!constraints || constraints.length === 0) {
    return {
      data: { rows, fields: result.fields, truncated, rowCount: rows.length },
      transforms: ["none"],
      stats: { rows: rows.length, truncated },
    };
  }

  for (const c of constraints) {
    if (c.type === "columns" && Array.isArray(c.value)) {
      const allowed = new Set(c.value.map(String));
      rows = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(row)) {
          if (allowed.has(k)) out[k] = row[k];
        }
        return out;
      });
      transforms.push(`columns:${[...allowed].join(",")}`);
    }

    if (c.type === "redact" && Array.isArray(c.value)) {
      const keys = c.value.map(String);
      rows = rows.map((row) => {
        const out = { ...row };
        for (const k of keys) {
          if (k in out) out[k] = "[REDACTED]";
        }
        return out;
      });
      transforms.push(`redact:${keys.join(",")}`);
    }

    if (c.type === "limit" && typeof c.value === "number") {
      const lim = Math.max(0, Math.floor(c.value));
      if (rows.length > lim) {
        rows = rows.slice(0, lim);
        truncated = true;
      }
      transforms.push(`limit:${lim}`);
    }

    if (c.type === "sample" && typeof c.value === "number") {
      const n = Math.max(0, Math.floor(c.value));
      if (rows.length > n) {
        // deterministic subsample for auditability
        rows = rows.slice(0, n);
        truncated = true;
      }
      transforms.push(`sample:${n}`);
    }
  }

  return {
    data: { rows, fields: result.fields, truncated, rowCount: rows.length },
    transforms: transforms.length ? transforms : ["none"],
    stats: { rows: rows.length, truncated },
  };
}

export class PostgresProvider implements DataProvider {
  private readonly maxRows: number;
  private readonly stmtTimeout: number;
  private schemaCache: { schema: string; name: string; columns: { name: string; type: string; nullable: boolean }[] }[] | null = null;
  private tableKeys: Set<string> = new Set();

  constructor(private readonly opts: PostgresProviderOptions) {
    this.maxRows = opts.maxRows ?? 10_000;
    this.stmtTimeout = opts.statementTimeoutMs ?? 10_000;
  }

  /** Call once at startup. Fails closed if role can write. */
  async init(): Promise<void> {
    if (this.opts.requireReadOnlyRole !== false) {
      await assertReadOnlyRole(this.opts.pool);
    }
    await this.loadSchema();
  }

  private async readOnly<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.opts.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${Number(this.stmtTimeout)}`);
      return await fn(client);
    } finally {
      try { await client.query("ROLLBACK"); } catch { /* gone */ }
      client.release();
    }
  }

  private readLimited(client: PoolClient, text: string, values: unknown[]): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const cursor = client.query(new Cursor(text, values));
      cursor.read(this.maxRows + 1, (err: Error | undefined, rows: any[], result: any) => {
        if (err) { cursor.close(() => {}); reject(err); return; }
        const truncated = rows.length > this.maxRows;
        const out = truncated ? rows.slice(0, this.maxRows) : rows;
        const fields = ((result?.fields ?? []) as { name: string }[]).map((f) => ({ name: f.name }));
        cursor.close(() => resolve({ rows: out, fields, truncated, rowCount: out.length }));
      });
    });
  }

  private async loadSchema() {
    const tables = await this.readOnly(async (client) => {
      const cols = await client.query(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog','information_schema')
          ORDER BY table_schema, table_name, ordinal_position`,
      );
      const map: Record<string, { schema: string; name: string; columns: { name: string; type: string; nullable: boolean }[] }> = {};
      for (const r of cols.rows) {
        const key = `${r.table_schema}.${r.table_name}`;
        (map[key] ??= { schema: r.table_schema, name: r.table_name, columns: [] }).columns.push({
          name: r.column_name, type: r.data_type, nullable: r.is_nullable === "YES",
        });
      }
      return Object.values(map);
    });
    this.schemaCache = tables;
    this.tableKeys = new Set(tables.map((t) => `${t.schema}.${t.name}`));
  }

  async execute(req: BoundaryRequest, constraints?: Constraint[]): Promise<MinimizedPayload> {
    switch (req.action) {
      case "schema": {
        if (!this.schemaCache) await this.loadSchema();
        const resource = req.resource;
        let data = this.schemaCache!;
        if (resource && resource !== "*") {
          data = data.filter(
            (t) =>
              `${t.schema}.${t.name}` === resource ||
              t.name === resource ||
              t.schema === resource,
          );
        }
        return {
          data,
          transforms: ["schema"],
          stats: { rows: data.length },
        };
      }

      case "sample": {
        const table = req.resource;
        if (!isSafeIdentifier(table)) throw new Error("invalid table identifier");
        const key = table.includes(".") ? table : `public.${table}`;
        if (!this.tableKeys.has(key)) throw new Error(`unknown table: ${table}`);

        let lim = 50;
        const limitC = constraints?.find((c) => c.type === "limit" || c.type === "sample");
        if (limitC && typeof limitC.value === "number") lim = limitC.value;
        lim = Math.max(1, Math.min(lim, this.maxRows));

        const result = await this.readOnly((client) =>
          this.readLimited(client, `SELECT * FROM ${quoteIdent(table)} LIMIT ${lim}`, []),
        );
        return minimize(result, constraints);
      }

      case "query":
      case "export": {
        const sql = typeof req.params?.sql === "string"
          ? req.params.sql
          : typeof req.params?.query === "string"
            ? req.params.query
            : null;
        if (!sql) throw new Error("query/export requires params.sql (or params.query)");

        const cls = classifyStatement(sql);
        if (!cls.ok) throw new Error("rejected: " + cls.reason);

        const values = Array.isArray(req.params?.values) ? (req.params!.values as unknown[]) : [];
        const result = await this.readOnly((client) => this.readLimited(client, sql, values));
        return minimize(result, constraints);
      }

      default:
        throw new Error(`unsupported action: ${req.action}`);
    }
  }
}

/** Helper to build a provider from DATABASE_URL. */
export async function createPostgresProviderFromEnv(): Promise<PostgresProvider> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for Postgres provider");

  // Dynamic import so the package can still load without pg installed in stub mode
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 4 });

  const provider = new PostgresProvider({
    pool,
    identity: process.env.BOUNDARY_DB_IDENTITY ?? "postgres",
    maxRows: Number(process.env.BOUNDARY_MAX_ROWS ?? 10_000),
    statementTimeoutMs: Number(process.env.BOUNDARY_STMT_TIMEOUT_MS ?? 10_000),
    requireReadOnlyRole: process.env.BOUNDARY_SKIP_READONLY_PROBE !== "1",
  });

  await provider.init();
  return provider;
}
