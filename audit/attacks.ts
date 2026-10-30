/**
 * Adversarial audit: an agent using only boundary_request inputs tries to
 * get data the policy forbids. Each attack prints LEAK / HELD with evidence.
 * Run: DATABASE_URL=... npx tsx audit/attacks.ts
 */
import { readFileSync } from "node:fs";
import pg from "pg";
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
const SSNS = ["111-22-3333", "222-33-4444", "333-44-5555"];
const results: { id: string; verdict: "LEAK" | "HELD"; evidence: string }[] =
  [];
const report = (id: string, leaked: boolean, evidence: string) =>
  results.push({ id, verdict: leaked ? "LEAK" : "HELD", evidence });
const containsSsn = (x: unknown) =>
  SSNS.some((s) => JSON.stringify(x ?? null).includes(s));

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
  // A7: structured path cannot run set_config; canary stays empty.
  {
    const pol = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [
          { id: "q", match: { action: "query" }, effect: "allow" },
        ],
      }),
    );
    const bb = new Boundary(pol, provider, new ReceiptLog(keys));
    // Attempt via SQL (must fail closed)
    const r1 = await bb.handle({
      action: "query",
      resource: "public.orders",
      params: { sql: "SELECT set_config('transaction_read_only','off',true)" },
    });
    const c = await pool.connect();
    const n = (await c.query("SELECT count(*)::int n FROM public.write_canary"))
      .rows[0].n;
    c.release();
    report(
      "A7 set_config read-write escape",
      n > 0,
      `ok=${r1.ok} reason=${(r1.decision.reason ?? "").slice(0, 120)} canaryRows=${n}`,
    );
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
