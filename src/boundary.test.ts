/**
 * Unit smoke tests. Real runner: node:test.
 * Failures exit non-zero (G3).
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Boundary } from "./boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "./policy/engine.js";
import { ReceiptLog } from "./receipt/log.js";
import { generateKeyPair, verifyHash } from "./receipt/crypto.js";
import { StubProvider } from "./data/provider.js";

function makeBoundary() {
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
  const keyPair = generateKeyPair();
  const log = new ReceiptLog(keyPair);
  const boundary = new Boundary(policy, provider, log);
  return { boundary, log, keyPair };
}

describe("Boundary smoke", () => {
  it("allows schema and produces a verifiable receipt", async () => {
    const { boundary, keyPair } = makeBoundary();
    const r = await boundary.handle({
      action: "schema",
      resource: "public.orders",
    });
    assert.equal(r.ok, true);
    assert.equal(r.decision.outcome, "allow");
    assert.equal(r.receipt.contentHash.length, 64);
    assert.equal(
      verifyHash(keyPair.publicKey, r.receipt.contentHash, r.receipt.signature),
      true,
      "receipt signature must verify",
    );
  });

  it("denies PII resource and still signs the receipt", async () => {
    const { boundary, keyPair } = makeBoundary();
    const r = await boundary.handle({
      action: "query",
      resource: "public.users",
    });
    assert.equal(r.ok, false);
    assert.equal(r.decision.outcome, "deny");
    assert.equal(
      verifyHash(keyPair.publicKey, r.receipt.contentHash, r.receipt.signature),
      true,
      "deny receipt must also verify",
    );
  });

  it("applies default deny for unmatched requests", async () => {
    const { boundary } = makeBoundary();
    const r = await boundary.handle({
      action: "export",
      resource: "private.secrets",
    });
    assert.equal(r.ok, false);
    assert.equal(r.decision.outcome, "deny");
  });

  it("maintains a hash chain across receipts", async () => {
    const { boundary, log } = makeBoundary();
    await boundary.handle({ action: "schema", resource: "public.orders" });
    await boundary.handle({ action: "query", resource: "public.users" });
    await boundary.handle({ action: "export", resource: "private.secrets" });

    const all = log.getAll();
    assert.equal(all.length, 3);
    assert.equal(all[1].prevHash, all[0].contentHash);
    assert.equal(all[2].prevHash, all[1].contentHash);
  });

  it("exposes a stable ed25519 key id", async () => {
    const { log } = makeBoundary();
    assert.match(log.keyId, /^ed25519:/);
  });
});

describe("N1 resource spelling binds policy to the table that is read", () => {
  function engine(rules: unknown[]) {
    return new PolicyEngine(
      loadPolicyFromObject({ version: "0.1", defaultEffect: "deny", rules }),
    );
  }
  const req = (action: "query" | "sample", resource: string) => ({
    id: "n1",
    action,
    resource,
    receivedAt: new Date().toISOString(),
  });

  it("N1a: deny on public.users also denies the bare name users", () => {
    const p = engine([
      { id: "deny", match: { resource: "public.users" }, effect: "deny", priority: 100 },
      { id: "allow", match: { action: "sample", resource: "*" }, effect: "allow", priority: 1 },
    ]);
    assert.equal(p.evaluate(req("sample", "users")).outcome, "deny");
    assert.equal(p.evaluate(req("sample", "public.users")).outcome, "deny");
  });

  it("N1b: deny on bare users also denies public.users", () => {
    const p = engine([
      { id: "deny", match: { resource: "users" }, effect: "deny", priority: 100 },
      { id: "allow", match: { resource: "public.*" }, effect: "allow", priority: 1 },
    ]);
    assert.equal(p.evaluate(req("query", "public.users")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "users")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "orders")).outcome, "allow");
  });

  it("dotless globs mean the public schema, like bare requests", () => {
    const p = engine([
      { id: "deny", match: { resource: "user*" }, effect: "deny", priority: 100 },
      { id: "allow", match: { resource: "*" }, effect: "allow", priority: 1 },
    ]);
    assert.equal(p.evaluate(req("query", "public.users")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "users")).outcome, "deny");
  });

  it("deny resource matches ignore case", () => {
    const p = engine([
      { id: "deny", match: { resource: "public.users" }, effect: "deny", priority: 100 },
      { id: "allow", match: { resource: "*" }, effect: "allow", priority: 1 },
    ]);
    assert.equal(p.evaluate(req("query", "PUBLIC.USERS")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "Users")).outcome, "deny");
  });

  it("allows match case exactly, so a case-only twin table is not released", () => {
    const p = engine([
      { id: "exact", match: { resource: "public.users" }, effect: "allow" },
      { id: "glob", match: { resource: "public.user*" }, effect: "allow" },
    ]);
    assert.equal(p.evaluate(req("query", "public.users")).outcome, "allow");
    assert.equal(p.evaluate(req("query", "public.Users")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "Users")).outcome, "deny");
    assert.equal(p.evaluate(req("query", "public.USERS")).outcome, "deny");
  });

  it("an allow on a bare name does not reach another schema", () => {
    const p = engine([
      { id: "allow", match: { resource: "orders" }, effect: "allow" },
    ]);
    assert.equal(p.evaluate(req("query", "public.orders")).outcome, "allow");
    assert.equal(p.evaluate(req("query", "secret.orders")).outcome, "deny");
  });
});
