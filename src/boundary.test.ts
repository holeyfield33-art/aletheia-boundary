/**
 * Lightweight smoke test (no test runner required yet).
 * Run with: npx tsx src/boundary.test.ts
 */

import { Boundary } from "./boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "./policy/engine.js";
import { ReceiptLog } from "./receipt/log.js";
import { StubProvider } from "./data/provider.js";

async function main() {
  const doc = loadPolicyFromObject({
    version: "0.1",
    defaultEffect: "deny",
    rules: [
      {
        id: "allow-schema",
        match: { action: "schema" },
        effect: "allow",
        reason: "schema ok",
        priority: 10,
      },
      {
        id: "deny-pii",
        match: { resource: "*users*" },
        effect: "deny",
        reason: "pii denied",
        priority: 100,
      },
    ],
  });

  const policy = new PolicyEngine(doc);
  const provider = new StubProvider();
  const log = new ReceiptLog("test-key", "test-secret");
  const boundary = new Boundary(policy, provider, log);

  // 1. Allowed schema
  const r1 = await boundary.handle({
    action: "schema",
    resource: "public.orders",
  });
  console.assert(r1.ok === true, "schema should be allowed");
  console.assert(r1.decision.outcome === "allow");
  console.assert(r1.receipt.contentHash.length === 64);

  // 2. Denied PII
  const r2 = await boundary.handle({
    action: "query",
    resource: "public.users",
  });
  console.assert(r2.ok === false, "users should be denied");
  console.assert(r2.decision.outcome === "deny");

  // 3. Default deny
  const r3 = await boundary.handle({
    action: "export",
    resource: "private.secrets",
  });
  console.assert(r3.ok === false, "default should deny");

  // 4. Hash chain
  const all = log.getAll();
  console.assert(all.length === 3);
  console.assert(all[1].prevHash === all[0].contentHash);
  console.assert(all[2].prevHash === all[1].contentHash);

  console.log("All smoke checks passed.");
  console.log("Last receipt hash:", log.getLastHash());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
