/** Re-audit 2026-11-02: new attacks not in audit/attacks.ts. Scratch copy only; not committed. */
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { Boundary } from "../src/boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../src/policy/engine.js";
import { ReceiptLog } from "../src/receipt/log.js";
import { generateKeyPair } from "../src/receipt/crypto.js";
import { PostgresProvider } from "../src/data/postgres.js";
import { StubProvider } from "../src/data/provider.js";
import { looksEncoded } from "../src/request/validate.js";

const url = process.env.DATABASE_URL!;
const SSNS = ["111-22-3333", "222-33-4444", "333-44-5555"];
const hasSsn = (x: unknown) => SSNS.some((s) => JSON.stringify(x ?? null).includes(s));
const out: string[] = [];
const rec = (id: string, bad: boolean, ev: string) => out.push(`${bad ? "FAIL" : "HELD"}  ${id}\n      ${ev}`);
const pol = (rules: unknown[]) => new PolicyEngine(loadPolicyFromObject({ version: "1", defaultEffect: "deny", rules }));

async function main() {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const provider = new PostgresProvider({ pool, identity: "reaudit", requireReadOnlyRole: true });
  await provider.init();
  const keys = generateKeyPair();
  const run = (p: PolicyEngine, req: any) => new Boundary(p, provider, new ReceiptLog(keys)).handle(req);

  // N1: policy sees the string the agent sent; the provider reads public.<name>. Exact deny on one spelling, broad allow.
  {
    const p = pol([
      { id: "deny-users", match: { resource: "public.users" }, effect: "deny", priority: 100 },
      { id: "sample-any", match: { action: "sample", resource: "*" }, effect: "allow_with_constraints", constraints: [{ type: "limit", value: 10 }] },
    ]);
    const direct = await run(p, { action: "sample", resource: "public.users" });
    const bare = await run(p, { action: "sample", resource: "users" });
    rec("N1a deny 'public.users' bypassed with bare 'users'", hasSsn(bare.payload?.data),
      `public.users ok=${direct.ok} rule=${direct.decision.ruleId} | users ok=${bare.ok} rule=${bare.decision.ruleId} transforms=${bare.payload?.transforms}`);
    const p2 = pol([
      { id: "deny-users", match: { resource: "users" }, effect: "deny", priority: 100 },
      { id: "sample-public", match: { action: "sample", resource: "public.*" }, effect: "allow_with_constraints", constraints: [{ type: "limit", value: 10 }] },
    ]);
    const q = await run(p2, { action: "sample", resource: "public.users" });
    rec("N1b deny 'users' bypassed with qualified 'public.users'", hasSsn(q.payload?.data), `ok=${q.ok} rule=${q.decision.ruleId}`);
  }

  // N2: constraint `value` is z.unknown(); a wrong-typed value is accepted at load and silently not enforced.
  for (const [label, c] of [
    ["columns as string", { type: "columns", value: "id" }],
    ["redact as string", { type: "redact", value: "ssn" }],
    ["limit as string", { type: "limit", value: "1" }],
  ] as const) {
    let loaded = true;
    let p: PolicyEngine | null = null;
    try { p = pol([{ id: "r", match: { action: "sample", resource: "public.users" }, effect: "allow_with_constraints", constraints: [c] }]); }
    catch { loaded = false; }
    if (!loaded || !p) { rec(`N2 ${label}`, false, "rejected at load"); continue; }
    const r = await run(p, { action: "sample", resource: "public.users" });
    const rows = ((r.payload?.data as any)?.rows ?? []) as Record<string, unknown>[];
    const leak = label === "limit as string" ? rows.length > 1 : hasSsn(rows);
    rec(`N2 ${label}: accepted at load, enforced?`, leak, `ok=${r.ok} rows=${rows.length} cols=${Object.keys(rows[0] ?? {})} transforms=${r.payload?.transforms}`);
  }

  // N3: purpose is agent-supplied text; a purpose-gated rule is unlocked by just claiming it.
  {
    const p = pol([{ id: "audit-only", match: { action: "sample", resource: "public.users", purpose: "compliance-audit" }, effect: "allow_with_constraints", constraints: [{ type: "limit", value: 5 }] }]);
    const r = await run(p, { action: "sample", resource: "public.users", purpose: "compliance-audit" });
    rec("N3 purpose-gated rule unlocked by agent's own claim", hasSsn(r.payload?.data), `ok=${r.ok} rule=${r.decision.ruleId}`);
  }

  // N4: equal priority, allow listed before deny -> allow wins (doc order tie-break).
  {
    const p = pol([
      { id: "allow", match: { action: "sample", resource: "public.users" }, effect: "allow_with_constraints", constraints: [{ type: "limit", value: 5 }] },
      { id: "deny", match: { resource: "public.users" }, effect: "deny" },
    ]);
    const r = await run(p, { action: "sample", resource: "public.users" });
    rec("N4 equal-priority allow beats deny by document order", r.ok, `ok=${r.ok} rule=${r.decision.ruleId}`);
  }
  await pool.end();

  // N5: request validator rejects ordinary identifiers and purposes as "encoded".
  const names = ["CustomerOrders2024", "MonthlyRevenueByRegion", "OrderLineItems", "QuarterlyBusinessReview", "analytics_daily", "deadbeefdeadbeefdeadbeef"];
  rec("N5 looksEncoded false positives on normal names", names.slice(0, 4).some(looksEncoded),
    names.map((n) => `${n}=${looksEncoded(n) ? "REJECTED" : "ok"}`).join(" "));

  // N6: receipt log append cost grows with log size (whole file re-read each append) + startup verify cost.
  {
    const dir = mkdtempSync(join(tmpdir(), "rl-"));
    const path = join(dir, "r.jsonl");
    const mem = new ReceiptLog(keys);
    const b = new Boundary(pol([]), new StubProvider(), mem);
    for (let i = 0; i < 20000; i++) await b.handle({ action: "sample", resource: "public.orders" });
    writeFileSync(path, mem.getAll().map((r) => JSON.stringify(r)).join("\n") + "\n");
    let t = Date.now();
    const disk = new ReceiptLog(keys, path);
    const startupMs = Date.now() - t;
    const bb = new Boundary(pol([]), new StubProvider(), disk);
    t = Date.now();
    for (let i = 0; i < 20; i++) await bb.handle({ action: "sample", resource: "public.orders" });
    const perAppend = (Date.now() - t) / 20;
    rec("N6 receipt append/startup cost at 20,000 receipts", perAppend > 20, `startup verify=${startupMs}ms, per-request append=${perAppend.toFixed(1)}ms (log re-read in full on every append)`);
  }

  console.log(out.join("\n"));
}
main().catch((e) => { console.error("RUN FAILED", e); process.exit(2); });
