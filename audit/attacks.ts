/**
 * Adversarial audit: an agent using only boundary_request inputs tries to
 * get data the policy forbids. Each attack prints LEAK / HELD with evidence.
 * Run: DATABASE_URL=... npx tsx audit/attacks.ts
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import Cursor from "pg-cursor";
import YAML from "yaml";
import { Boundary } from "../src/boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../src/policy/engine.js";
import {
  ReceiptLog,
  computeContentHash,
  verifyReceipt,
} from "../src/receipt/log.js";
import { generateKeyPair } from "../src/receipt/crypto.js";
import { PostgresProvider } from "../src/data/postgres.js";
import { StubProvider } from "../src/data/provider.js";

const url =
  process.env.DATABASE_URL ??
  "postgres://readonly:readonly@localhost:5434/boundary";
const writableUrl =
  process.env.DATABASE_URL_WRITABLE ??
  "postgres://writable:writable@localhost:5434/boundary";
const SSNS = ["111-22-3333", "222-33-4444", "333-44-5555"];
const results: { id: string; verdict: "LEAK" | "HELD"; evidence: string }[] =
  [];
const report = (id: string, leaked: boolean, evidence: string) =>
  results.push({ id, verdict: leaked ? "LEAK" : "HELD", evidence });
const containsSsn = (x: unknown) =>
  SSNS.some((s) => JSON.stringify(x ?? null).includes(s));

/**
 * Replace the provider's next SELECT cursor with an INSERT into the canary,
 * as if SQL had been injected past the statement builder. With
 * escapeReadOnly, the provider's SET LOCAL is first replaced by a read-write
 * escape. Records whether the substitution happened and the SQLSTATE.
 */
function injectWrite(
  target: pg.Pool,
  escapeReadOnly: boolean,
): { injected: boolean; code?: string } {
  const seen: { injected: boolean; code?: string } = { injected: false };
  const connect = target.connect.bind(target);
  target.connect = (async () => {
    const client = await connect();
    const query = client.query.bind(client);
    client.query = ((q: unknown, ...rest: unknown[]) => {
      if (q instanceof Cursor && !seen.injected) {
        seen.injected = true;
        const evil = new Cursor("INSERT INTO public.write_canary (note) VALUES ('A7') RETURNING id");
        const read = evil.read.bind(evil);
        evil.read = (count, cb) =>
          read(count, (err, rows, result) => {
            seen.code = (err as { code?: string } | undefined)?.code;
            cb(err, rows, result);
          });
        return query(evil);
      }
      if (
        escapeReadOnly &&
        typeof q === "string" &&
        q.startsWith("SET LOCAL statement_timeout")
      ) {
        return query("SET LOCAL transaction_read_only = off");
      }
      return (query as (...a: unknown[]) => unknown)(q, ...rest);
    }) as typeof client.query;
    return client;
  }) as typeof target.connect;
  return seen;
}

async function main() {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const provider = new PostgresProvider({
    pool,
    identity: "audit",
    requireReadOnlyRole: true,
  });
  await provider.init();
  const keys = generateKeyPair();

  const shipped = new PolicyEngine(
    loadPolicyFromObject(
      YAML.parse(readFileSync("policies/example.yaml", "utf8")),
    ),
  );
  const b = new Boundary(shipped, provider, new ReceiptLog(keys));

  // A1: free-form SQL under an allowed label must not run (F1).
  {
    const r = await b.handle({
      action: "query",
      resource: "analytics.daily",
      params: {
        sql: "SELECT ssn AS value, email AS metric, name AS segment FROM public.users",
      },
    });
    report(
      "A1 label/SQL mismatch + column alias (shipped policy)",
      containsSsn(r.payload?.data),
      `ok=${r.ok} rule=${r.decision.ruleId} err=${(r.error ?? r.decision.reason ?? "").slice(0, 120)}`,
    );
  }
  // A2: row_to_json via agent SQL must be rejected.
  {
    const r = await b.handle({
      action: "query",
      resource: "analytics.x",
      params: { sql: "SELECT row_to_json(u)::text AS value FROM public.users u" },
    });
    report(
      "A2 row_to_json into allowed column",
      containsSsn(r.payload?.data),
      `ok=${r.ok} err=${(r.error ?? "").slice(0, 120)}`,
    );
  }
  // A3: orders label + users SQL must not release users rows.
  {
    const integ = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [
          {
            id: "deny-users",
            match: { resource: ["*users*"] },
            effect: "deny",
            priority: 100,
          },
          {
            id: "allow-orders-query",
            match: { action: "query", resource: "public.orders" },
            effect: "allow_with_constraints",
            constraints: [{ type: "limit", value: 50 }],
            priority: 25,
          },
        ],
      }),
    );
    const r = await new Boundary(integ, provider, new ReceiptLog(keys)).handle({
      action: "query",
      resource: "public.orders",
      params: { sql: "SELECT * FROM public.users" },
    });
    report(
      "A3 integration-test policy: orders label, users SQL",
      containsSsn(r.payload?.data),
      `ok=${r.ok} rule=${r.decision.ruleId} err=${(r.error ?? "").slice(0, 100)}`,
    );
  }
  // A4
  {
    let rejected = false;
    try {
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [
          {
            id: "agg-only",
            match: { action: "query", resource: "public.users" },
            effect: "allow_with_constraints",
            constraints: [{ type: "aggregate", value: "count" }],
          },
        ],
      });
    } catch {
      rejected = true;
    }
    report(
      "A4 'aggregate' constraint rejected at load",
      !rejected,
      rejected ? "policy load threw (held)" : "policy load accepted aggregate (leak)",
    );
  }
  // A5
  {
    let rejected = false;
    try {
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [
          {
            id: "typo",
            match: { resource: "public.users" },
            effect: "denny",
          },
        ],
      });
    } catch {
      rejected = true;
    }
    report(
      "A5 misspelled effect 'denny' rejected at load",
      !rejected,
      rejected ? "policy load threw (held)" : "policy load accepted denny (leak)",
    );
  }
  // A6
  {
    const log = new ReceiptLog(keys);
    const r = await new Boundary(shipped, new StubProvider(), log).handle({
      action: "query",
      resource: "public.users",
    });
    const forged = JSON.parse(JSON.stringify(r.receipt));
    forged.decision.outcome = "allow";
    forged.decision.reason = "forged";
    forged.request.resource = "public.orders";
    const recomputed = computeContentHash(forged);
    const hashMatches = recomputed === forged.contentHash;
    const v = verifyReceipt(forged, keys.publicKey);
    report(
      "A6 edit decision deny->allow, receipt still verifies",
      hashMatches || v.ok,
      `hashUnchanged=${hashMatches} verifyOk=${v.ok} reason=${v.reason ?? "n/a"}`,
    );
  }
  // A7 (N3): write protection is exercised against Postgres itself. Agent
  // input cannot carry SQL (A1-A3), so a write is injected into the
  // provider's own transaction at the driver layer to prove each layer holds.
  {
    // A7a: the startup probe refuses a role that can write.
    const wpool = new pg.Pool({ connectionString: writableUrl, max: 2 });
    let refused = false;
    try {
      await new PostgresProvider({ pool: wpool, identity: "audit-a7a", requireReadOnlyRole: true }).init();
    } catch {
      refused = true;
    }
    await wpool.end();
    report("A7a startup probe refuses writable role", !refused, refused ? "init threw (held)" : "init accepted a writable role");
  }
  // A7c also injects `SET LOCAL transaction_read_only = off` before the first
  // query (Postgres allows that), so only the role's privileges remain.
  for (const [id, connectionString, requireReadOnlyRole, escape, expectCode] of [
    ["A7b READ ONLY transaction refuses injected INSERT (writable role, probe bypassed)", writableUrl, false, false, "25006"],
    ["A7c read-only role refuses injected INSERT after read-write escape", url, true, true, "42501"],
  ] as const) {
    const ipool = new pg.Pool({ connectionString, max: 1 });
    const seen = injectWrite(ipool, escape);
    const iprov = new PostgresProvider({ pool: ipool, identity: "audit-a7", requireReadOnlyRole });
    await iprov.init();
    const pol = new PolicyEngine(loadPolicyFromObject({ version: "0.1", defaultEffect: "deny", rules: [
      { id: "q", match: { action: "query", resource: "public.orders" }, effect: "allow" },
    ] }));
    const r = await new Boundary(pol, iprov, new ReceiptLog(keys)).handle({ action: "query", resource: "public.orders" });
    await ipool.end();
    const c = await pool.connect();
    const n = (await c.query("SELECT count(*)::int n FROM public.write_canary")).rows[0].n;
    c.release();
    const held = seen.injected && seen.code === expectCode && !r.ok && n === 0;
    report(id, !held, `injected=${seen.injected} sqlstate=${seen.code ?? "none"} expected=${expectCode} ok=${r.ok} canaryRows=${n}`);
  }
  // A8: schema must not disclose columns removed or redacted on read paths.
  {
    const pol = new PolicyEngine(loadPolicyFromObject({version: "1", defaultEffect: "deny", rules: [
      {id: "schema", match: {action: "schema"}, effect: "allow"},
      {id: "read", match: {action: ["query", "sample"], resource: "public.users"}, effect: "allow_with_constraints", constraints: [{type: "columns", value: ["id"]}]},
    ]}));
    const r = await new Boundary(pol, provider, new ReceiptLog(keys)).handle({action: "schema", resource: "*"});
    const tables = r.payload?.data as {schema: string; name: string; columns: {name: string}[]}[];
    const held = r.ok && tables.length === 1 && tables[0].name === "users" && tables[0].columns.every(c => c.name === "id");
    report("A8 restricted schema metadata", !held, JSON.stringify(tables));
  }
  // A9: provider exception strings never reach agent results or signed decisions.
  {
    const pol = new PolicyEngine(loadPolicyFromObject({version: "1", defaultEffect: "allow", rules: []}));
    const r = await new Boundary(pol, {async execute() {throw new Error("SYNTHETIC_SECRET postgres://password@private");}}, new ReceiptLog(keys)).handle({action: "query", resource: "public.orders"});
    report("A9 secret-bearing provider error", r.ok || /SYNTHETIC_SECRET|password@private/.test(JSON.stringify(r)), `ok=${r.ok} error=${r.error}`);
    for (const resource of ["public.orders;SELECT", "../private", "cHVibGljLnVzZXJz"]) {
      const bad = await new Boundary(pol, provider, new ReceiptLog(keys)).handle({action: "query", resource});
      report(`A10 malformed/encoded identifier ${resource}`, bad.ok || bad.payload !== undefined, `ok=${bad.ok}`);
    }
  }
  // N1: policy must bind to the canonical schema.table the provider reads.
  {
    const n1a = new PolicyEngine(loadPolicyFromObject({version: "0.1", defaultEffect: "deny", rules: [
      {id: "deny-public-users", match: {resource: "public.users"}, effect: "deny", priority: 100},
      {id: "allow-sample", match: {action: "sample", resource: "*"}, effect: "allow", priority: 1},
    ]}));
    const r = await new Boundary(n1a, provider, new ReceiptLog(keys)).handle({action: "sample", resource: "users"});
    report("N1a deny public.users, request bare users", containsSsn(r.payload?.data), `ok=${r.ok} rule=${r.decision.ruleId}`);
  }
  {
    const n1b = new PolicyEngine(loadPolicyFromObject({version: "0.1", defaultEffect: "deny", rules: [
      {id: "deny-users", match: {resource: "users"}, effect: "deny", priority: 100},
      {id: "allow-public", match: {resource: "public.*"}, effect: "allow", priority: 1},
    ]}));
    const r = await new Boundary(n1b, provider, new ReceiptLog(keys)).handle({action: "query", resource: "public.users"});
    report("N1b deny bare users, request public.users", containsSsn(r.payload?.data), `ok=${r.ok} rule=${r.decision.ruleId}`);
  }
  // N2: mistyped constraint values must not load (and so cannot silently release).
  for (const [type, value] of [["columns", "id"], ["redact", "ssn"], ["limit", "1"]] as const) {
    let pol: PolicyEngine | undefined;
    try {
      pol = new PolicyEngine(loadPolicyFromObject({version: "0.1", defaultEffect: "deny", rules: [
        {id: "n2", match: {action: "sample", resource: "public.users"}, effect: "allow_with_constraints", constraints: [{type, value}]},
      ]}));
    } catch {
      pol = undefined;
    }
    if (!pol) {
      report(`N2 ${type}: ${JSON.stringify(value)} rejected at load`, false, "policy load threw (held)");
      continue;
    }
    const r = await new Boundary(pol, provider, new ReceiptLog(keys)).handle({action: "sample", resource: "public.users"});
    report(`N2 ${type}: ${JSON.stringify(value)} rejected at load`, true, `loaded; ok=${r.ok} ssnReleased=${containsSsn(r.payload?.data)} transforms=${r.payload?.transforms.join(",")}`);
  }
  // N6: a byte cap bounds what one tool result can carry, not only rows.
  {
    const capped = new PostgresProvider({ pool, identity: "audit-n6", requireReadOnlyRole: true, maxBytes: 120 });
    await capped.init();
    const pol = new PolicyEngine(loadPolicyFromObject({ version: "0.1", defaultEffect: "deny", rules: [
      { id: "q", match: { action: "query", resource: "public.orders" }, effect: "allow" },
    ] }));
    const r = await new Boundary(pol, capped, new ReceiptLog(keys)).handle({ action: "query", resource: "public.orders" });
    const rows = (r.payload?.data as { rows?: unknown[] } | undefined)?.rows ?? [];
    const bytes = Buffer.byteLength(JSON.stringify(rows));
    const honest = r.payload?.stats?.truncated === true;
    report("N6 byte cap 120 on public.orders", !r.ok || bytes > 120 || !honest, `ok=${r.ok} rows=${rows.length} bytes=${bytes} truncated=${r.payload?.stats?.truncated} transforms=${r.payload?.transforms.join(",")}`);
  }
  await pool.end();

  for (const r of results)
    console.log(`${r.verdict}  ${r.id}\n      ${r.evidence}`);
  const leaks = results.filter((r) => r.verdict === "LEAK").length;
  console.log(JSON.stringify({ leaks, total: results.length }));
  process.exitCode = leaks > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("AUDIT FAILED TO RUN:", e);
  process.exit(2);
});
