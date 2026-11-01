/**
 * Local demo — real Postgres if DATABASE_URL is set, else StubProvider.
 *
 * Usage (PowerShell):
 *   docker compose up -d
 *   $env:DATABASE_URL = "postgres://readonly:readonly@localhost:5434/boundary"
 *   npx tsx scripts/demo.ts
 *
 * Or without Docker (synthetic data only):
 *   npx tsx scripts/demo.ts
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { readFileSync } from "node:fs";
import { Boundary } from "../src/boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../src/policy/engine.js";
import { ReceiptLog, verifyReceipt, verifyReceiptChain } from "../src/receipt/log.js";
import { loadOrCreateKeyPair } from "../src/receipt/crypto.js";
import { StubProvider } from "../src/data/provider.js";
import type { DataProvider } from "../src/data/provider.js";

function section(title: string) {
  console.log("\n" + "─".repeat(60));
  console.log(title);
  console.log("─".repeat(60));
}

function brief(result: {
  ok: boolean;
  decision: { outcome: string; reason?: string };
  payload?: { data?: unknown; stats?: unknown };
  error?: string;
  receipt: { id: string; contentHash: string; signature: string };
}) {
  const data = result.payload?.data;
  const line = {
    ok: result.ok,
    outcome: result.decision.outcome,
    reason: result.decision.reason,
    error: result.error,
    dataPreview: data
      ? Array.isArray(data)
        ? `rows=${data.length}`
        : typeof data
      : undefined,
    stats: result.payload?.stats,
    receiptId: result.receipt.id.slice(0, 8) + "…",
    contentHash: result.receipt.contentHash.slice(0, 12) + "…",
  };
  console.log(JSON.stringify(line, null, 2));
}

async function main() {
  const root = process.cwd();
  const policyPath = resolve(root, "policies/example.yaml");
  const keyPath = resolve(root, "keys/demo.ed25519");
  const logPath = resolve(root, "logs/demo-receipts.jsonl");
  mkdirSync(resolve(root, "keys"), { recursive: true });
  mkdirSync(resolve(root, "logs"), { recursive: true });

  const policy = new PolicyEngine(
    loadPolicyFromObject(YAML.parse(readFileSync(policyPath, "utf8"))),
  );
  const keyPair = loadOrCreateKeyPair(keyPath);
  const log = new ReceiptLog(keyPair, logPath);

  let provider: DataProvider;
  let mode: string;
  if (process.env.DATABASE_URL) {
    const { createPostgresProviderFromEnv } = await import(
      "../src/data/postgres.js"
    );
    provider = await createPostgresProviderFromEnv();
    mode = "LIVE Postgres (read-only probe passed)";
  } else {
    provider = new StubProvider();
    mode = "StubProvider (no DATABASE_URL — synthetic data only)";
  }

  const boundary = new Boundary(policy, provider, log);

  section(`Aletheia Boundary demo — ${mode}`);
  console.log(`policy: ${policyPath}`);
  console.log(`keyId:  ${keyPair.keyId}`);
  console.log(`log:    ${logPath}`);

  section("1. ALLOW — query public.analytics_daily (constrained columns)");
  const allow = await boundary.handle({
    action: "query",
    resource: "public.analytics_daily",
    params: { columns: ["date", "metric", "value"], limit: 10 },
    purpose: "weekly ops report",
  });
  brief(allow);
  if (allow.payload?.data)
    console.log("sample rows:", JSON.stringify(allow.payload.data, null, 2));

  section("2. DENY — query public.users (PII rule)");
  const deny = await boundary.handle({
    action: "query",
    resource: "public.users",
    params: { columns: ["id", "email"], limit: 5 },
    purpose: "should be denied",
  });
  brief(deny);

  section("3. REJECT — encoded resource (fail closed, Invalid request)");
  const encoded = await boundary.handle({
    action: "query",
    resource: "cHVibGljLnVzZXJz",
    params: { limit: 5 },
  });
  brief(encoded);

  section("4. REJECT — unknown param sql");
  const sql = await boundary.handle({
    action: "query",
    resource: "public.orders",
    params: { sql: "SELECT * FROM users" } as Record<string, unknown>,
  });
  brief(sql);

  section("5. ALLOW — query public.orders (limit constrained by policy)");
  const orders = await boundary.handle({
    action: "query",
    resource: "public.orders",
    params: { columns: ["id", "status", "amount"], limit: 20 },
    purpose: "order status check",
  });
  brief(orders);
  if (orders.payload?.data)
    console.log("sample rows:", JSON.stringify(orders.payload.data, null, 2));

  section("6. ALLOW — schema *");
  const schema = await boundary.handle({
    action: "schema",
    resource: "*",
  });
  brief(schema);
  if (schema.payload?.data) {
    const tables = Array.isArray(schema.payload.data)
      ? schema.payload.data
      : [schema.payload.data];
    console.log(
      "tables visible:",
      tables.map((t: { name?: string; table?: string }) => t.name ?? t.table ?? t),
    );
  }

  section("7. VERIFY — offline receipt + chain");
  const all = log.getAll();
  const v1 = verifyReceipt(allow.receipt, keyPair.publicKey);
  const v2 = verifyReceipt(deny.receipt, keyPair.publicKey);
  const chain = verifyReceiptChain(all, keyPair.publicKey);
  console.log(
    JSON.stringify(
      {
        allowReceiptOk: v1.ok,
        denyReceiptOk: v2.ok,
        chainOk: chain.ok,
        chainLength: all.length,
      },
      null,
      2,
    ),
  );

  section("Demo complete");
  console.log(
    mode.startsWith("LIVE")
      ? "Live path exercised. Receipts are in logs/demo-receipts.jsonl."
      : "Stub path only. Set DATABASE_URL and re-run for real Postgres.",
  );
  console.log(
    "MCP product path: npm run dev  (stdio) with the same env vars.",
  );
}

main().catch((err) => {
  console.error("[demo] failed:", err);
  process.exit(1);
});
