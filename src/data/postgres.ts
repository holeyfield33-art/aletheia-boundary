/**
 * Hardened read-only Postgres provider for Aletheia Boundary.
 *
 * Defense in depth:
 *   1. Startup write probe (catalog inspection, fail-closed)
 *   2. READ ONLY transaction, always rolled back
 *   3. Structured reads only — no agent-supplied SQL (I1 / F1)
 *   4. Bounded cursor fetch (F9) with honest truncation (I6)
 *   5. statement_timeout
 *   6. Minimizer applies policy constraints after fetch
 */

import type { Pool, PoolClient } from "pg";
import Cursor from "pg-cursor";
import type { BoundaryRequest, Constraint, MinimizedPayload } from "../types.js";
import type { DataProvider } from "./provider.js";
import { DEFAULT_MAX_ROWS, HARD_MAX_ROWS, resolveMaxRows } from "./limits.js";

export interface PostgresProviderOptions {
  pool: Pool;
  /** Label for receipts — never the connection string. */
  identity: string;
  maxRows?: number;
  statementTimeoutMs?: number;
  requireReadOnlyRole?: boolean;
}

export function isSafeIdentifier(id: string): boolean {
  return (
    typeof id === "string" &&
    /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/.test(id)
  );
}

function quoteIdent(id: string): string {
  return id
    .split(".")
    .map((p) => `"${p}"`)
    .join(".");
}

function assertNoAgentSql(params?: Record<string, unknown>): void {
  if (!params) return;
  if (typeof params.sql === "string" || typeof params.query === "string") {
    throw new Error(
      "free-form SQL is not allowed. Use structured params: resource is the table; optional params.columns (string[]) and params.limit (number). The boundary builds the statement itself.",
    );
  }
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
      throw new RoleCanWrite(
        "role has elevated attributes (superuser/createdb/createrole)",
      );

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
    if ((w.rows[0]?.n ?? 0) > 0)
      throw new RoleCanWrite(
        `role has write privilege on ${w.rows[0].n} relation(s)`,
      );

    const db = await client.query(
      `SELECT has_database_privilege(current_database(), 'CREATE') AS can_create`,
    );
    if (db.rows[0]?.can_create)
      throw new RoleCanWrite("role has CREATE on the current database");

    const c = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.schemata s
        WHERE s.schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
          AND has_schema_privilege(s.schema_name, 'CREATE')`,
    );
    if ((c.rows[0]?.n ?? 0) > 0)
      throw new RoleCanWrite(
        `role can CREATE objects in ${c.rows[0].n} schema(s)`,
      );
  } catch (e) {
    if (e instanceof RoleCanWrite)
      throw new Error(
        `aletheia-boundary: ${e.message}. Refusing to start — use a read-only role or a replica.`,
      );
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `aletheia-boundary: could not verify the role is read-only (${msg || "connection failed"}). Refusing to start.`,
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

function minimize(
  result: QueryResult,
  constraints?: Constraint[],
): MinimizedPayload {
  const transforms: string[] = [];
  let rows = result.rows;
  let fields = result.fields;
  let truncated = result.truncated;

  if (!constraints || constraints.length === 0) {
    return {
      data: { rows, fields, truncated, rowCount: rows.length },
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
      fields = fields.filter((f) => allowed.has(f.name));
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

    // limit/sample already applied at SQL with honest truncation; only
    // re-slice if constraints ask for a *lower* bound than what we fetched.
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
        rows = rows.slice(0, n);
        truncated = true;
      }
      transforms.push(`sample:${n}`);
    }
  }

  return {
    data: { rows, fields, truncated, rowCount: rows.length },
    transforms: transforms.length ? transforms : ["none"],
    stats: { rows: rows.length, truncated },
  };
}

export class PostgresProvider implements DataProvider {
  private readonly maxRows: number;
  private readonly stmtTimeout: number;
  private schemaCache:
    | {
        schema: string;
        name: string;
        columns: { name: string; type: string; nullable: boolean }[];
      }[]
    | null = null;
  private tableKeys: Set<string> = new Set();

  constructor(private readonly opts: PostgresProviderOptions) {
    this.maxRows = resolveMaxRows(opts.maxRows ?? DEFAULT_MAX_ROWS);
    this.stmtTimeout = opts.statementTimeoutMs ?? 10_000;
  }

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
      await client.query(
        `SET LOCAL statement_timeout = ${Number(this.stmtTimeout)}`,
      );
      return await fn(client);
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* gone */
      }
      client.release();
    }
  }

  /**
   * Fetch up to `fetchCap` rows. Caller is responsible for slicing to the
   * public limit and setting truncated when fetchCap was used as limit+1.
   */
  private readLimited(
    client: PoolClient,
    text: string,
    values: unknown[],
    fetchCap: number,
  ): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const cursor = client.query(new Cursor(text, values));
      cursor.read(
        fetchCap,
        (err: Error | undefined, rows: any[], result: any) => {
          if (err) {
            cursor.close(() => {});
            reject(err);
            return;
          }
          const fields = ((result?.fields ?? []) as { name: string }[]).map(
            (f) => ({ name: f.name }),
          );
          cursor.close(() =>
            resolve({
              rows,
              fields,
              truncated: false, // set by applyRowCap
              rowCount: rows.length,
            }),
          );
        },
      );
    });
  }

  /** Slice to public limit; mark truncated if a sentinel extra row was present. */
  private applyRowCap(result: QueryResult, lim: number): QueryResult {
    if (result.rows.length > lim) {
      return {
        rows: result.rows.slice(0, lim),
        fields: result.fields,
        truncated: true,
        rowCount: lim,
      };
    }
    return {
      ...result,
      truncated: false,
      rowCount: result.rows.length,
    };
  }

  private async loadSchema() {
    const tables = await this.readOnly(async (client) => {
      const cols = await client.query(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog','information_schema')
          ORDER BY table_schema, table_name, ordinal_position`,
      );
      const map: Record<
        string,
        {
          schema: string;
          name: string;
          columns: { name: string; type: string; nullable: boolean }[];
        }
      > = {};
      for (const r of cols.rows) {
        const key = `${r.table_schema}.${r.table_name}`;
        (map[key] ??= {
          schema: r.table_schema,
          name: r.table_name,
          columns: [],
        }).columns.push({
          name: r.column_name,
          type: r.data_type,
          nullable: r.is_nullable === "YES",
        });
      }
      return Object.values(map);
    });
    this.schemaCache = tables;
    this.tableKeys = new Set(tables.map((t) => `${t.schema}.${t.name}`));
  }

  private resolveTable(resource: string): string {
    if (!isSafeIdentifier(resource)) {
      throw new Error("invalid table identifier");
    }
    const key = resource.includes(".") ? resource : `public.${resource}`;
    if (!this.tableKeys.has(key)) {
      throw new Error(`unknown table: ${resource}`);
    }
    return key;
  }

  /**
   * Build SELECT with LIMIT lim+1 so we can detect truncation without
   * releasing the extra row (I6 honest completion).
   */
  private buildSelect(
    tableKey: string,
    params?: Record<string, unknown>,
    constraints?: Constraint[],
  ): { sql: string; lim: number; transforms: string[] } {
    const transforms: string[] = [`table:${tableKey}`];

    let cols = "*";
    const paramCols = Array.isArray(params?.columns)
      ? (params!.columns as unknown[]).map(String)
      : null;
    const constraintCols = constraints?.find((c) => c.type === "columns");
    const allowedFromPolicy =
      constraintCols && Array.isArray(constraintCols.value)
        ? constraintCols.value.map(String)
        : null;

    if (paramCols && paramCols.length > 0) {
      for (const c of paramCols) {
        if (!isSafeIdentifier(c) || c.includes("."))
          throw new Error(`invalid column identifier: ${c}`);
      }
      const finalCols =
        allowedFromPolicy != null
          ? paramCols.filter((c) => allowedFromPolicy.includes(c))
          : paramCols;
      if (finalCols.length === 0) {
        throw new Error("no columns remain after policy projection");
      }
      cols = finalCols.map(quoteIdent).join(", ");
      transforms.push(`select-columns:${finalCols.join(",")}`);
    } else if (allowedFromPolicy != null && allowedFromPolicy.length > 0) {
      for (const c of allowedFromPolicy) {
        if (!isSafeIdentifier(c) || c.includes("."))
          throw new Error(`invalid policy column identifier: ${c}`);
      }
      cols = allowedFromPolicy.map(quoteIdent).join(", ");
      transforms.push(`select-columns:${allowedFromPolicy.join(",")}`);
    }

    let lim = this.maxRows;
    const paramLimit =
      typeof params?.limit === "number" ? Math.floor(params.limit) : null;
    const constraintLimit = constraints?.find(
      (c) => c.type === "limit" || c.type === "sample",
    );
    const policyLim =
      constraintLimit && typeof constraintLimit.value === "number"
        ? Math.floor(constraintLimit.value)
        : null;
    if (paramLimit != null) lim = Math.min(lim, Math.max(0, paramLimit));
    if (policyLim != null) lim = Math.min(lim, Math.max(0, policyLim));
    lim = Math.max(1, Math.min(lim, this.maxRows, HARD_MAX_ROWS));

    // Fetch one extra row to learn if more data exists; never release it.
    const sql = `SELECT ${cols} FROM ${quoteIdent(tableKey)} LIMIT ${lim + 1}`;
    transforms.push(`limit:${lim}`);
    return { sql, lim, transforms };
  }

  async execute(
    req: BoundaryRequest,
    constraints?: Constraint[],
  ): Promise<MinimizedPayload> {
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
        assertNoAgentSql(req.params);
        const tableKey = this.resolveTable(req.resource);
        const built = this.buildSelect(tableKey, req.params, constraints);
        const raw = await this.readOnly((client) =>
          this.readLimited(client, built.sql, [], built.lim + 1),
        );
        const capped = this.applyRowCap(raw, built.lim);
        const minimized = minimize(capped, constraints);
        minimized.transforms = [
          ...built.transforms,
          ...minimized.transforms.filter((t) => t !== "none"),
        ];
        // Preserve SQL-level truncation flag if minimizer didn't clear it
        if (capped.truncated && minimized.stats) {
          minimized.stats.truncated = true;
          if (minimized.data && typeof minimized.data === "object") {
            (minimized.data as { truncated?: boolean }).truncated = true;
          }
        }
        return minimized;
      }

      case "query":
      case "export": {
        assertNoAgentSql(req.params);
        const tableKey = this.resolveTable(req.resource);
        const built = this.buildSelect(tableKey, req.params, constraints);
        const raw = await this.readOnly((client) =>
          this.readLimited(client, built.sql, [], built.lim + 1),
        );
        const capped = this.applyRowCap(raw, built.lim);
        const minimized = minimize(capped, constraints);
        minimized.transforms = [
          ...built.transforms,
          ...minimized.transforms.filter((t) => t !== "none"),
        ];
        if (capped.truncated && minimized.stats) {
          minimized.stats.truncated = true;
          if (minimized.data && typeof minimized.data === "object") {
            (minimized.data as { truncated?: boolean }).truncated = true;
          }
        }
        return minimized;
      }

      default:
        throw new Error(`unsupported action: ${req.action}`);
    }
  }
}

export async function createPostgresProviderFromEnv(): Promise<PostgresProvider> {
  if (process.env.NODE_ENV === "production" && process.env.BOUNDARY_SKIP_READONLY_PROBE === "1") {
    throw new Error("Production cannot bypass read-only verification");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for Postgres provider");

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 4 });

  const provider = new PostgresProvider({
    pool,
    identity: process.env.BOUNDARY_DB_IDENTITY ?? "postgres",
    maxRows: resolveMaxRows(process.env.BOUNDARY_MAX_ROWS),
    statementTimeoutMs: Number(process.env.BOUNDARY_STMT_TIMEOUT_MS ?? 10_000),
    requireReadOnlyRole: process.env.BOUNDARY_SKIP_READONLY_PROBE !== "1",
  });

  await provider.init();
  return provider;
}

export function skeleton(sql: string): string {
  return sql;
}
export function classifyStatement(sql: string): {
  ok: boolean;
  reason?: string;
  leader?: string;
} {
  return {
    ok: false,
    reason: "free-form SQL is not allowed; structured requests only",
  };
}
