/**
 * Receipt integrity tests (F2 / A6).
 * Run via: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Boundary } from "../boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "../policy/engine.js";
import { ReceiptLog, computeContentHash, verifyReceipt } from "./log.js";
import { generateKeyPair, verifyHash } from "./crypto.js";
import { StubProvider } from "../data/provider.js";
import { canonicalJson } from "./canonical.js";

describe("receipt integrity (F2)", () => {
  it("canonicalJson includes nested keys", () => {
    const a = canonicalJson({
      id: "1",
      decision: { outcome: "deny", reason: "no" },
      request: { resource: "users" },
    });
    const b = canonicalJson({
      id: "1",
      decision: { outcome: "allow", reason: "forged" },
      request: { resource: "users" },
    });
    assert.notEqual(a, b, "changing nested decision must change canonical form");
    assert.match(a, /deny/);
    assert.match(b, /allow/);
  });

  it("old broken replacer would drop nested fields (documents the bug)", () => {
    const body = {
      id: "1",
      prevHash: null,
      request: { resource: "users", action: "query" },
      decision: { outcome: "deny", reason: "no" },
      payloadSummary: { transforms: [] },
      createdAt: "t",
      keyId: "k",
    };
    // The broken pattern from F2:
    const broken = JSON.stringify(body, Object.keys(body).sort());
    assert.equal(
      broken.includes("deny"),
      false,
      "broken replacer must drop nested decision.outcome",
    );
    // Fixed canonical includes it:
    assert.equal(canonicalJson(body).includes("deny"), true);
  });

  it("forging decision deny->allow invalidates contentHash (A6)", async () => {
    const policy = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [],
      }),
    );
    const keys = generateKeyPair();
    const log = new ReceiptLog(keys);
    const boundary = new Boundary(policy, new StubProvider(), log);

    const r = await boundary.handle({
      action: "query",
      resource: "public.users",
      params: { sql: "SELECT 1" },
    });
    assert.equal(r.decision.outcome, "deny");

    const forged = JSON.parse(JSON.stringify(r.receipt));
    forged.decision.outcome = "allow";
    forged.decision.reason = "forged";
    forged.request.resource = "public.orders";

    const recomputed = computeContentHash(forged);
    assert.notEqual(
      recomputed,
      forged.contentHash,
      "forged body must not match stored contentHash",
    );

    // Signature still verifies over the OLD hash, but the body no longer matches that hash.
    assert.equal(
      verifyHash(keys.publicKey, forged.contentHash, forged.signature),
      true,
      "sig still valid over original hash",
    );
    const v = verifyReceipt(forged, keys.publicKey);
    assert.equal(v.ok, false, "verifyReceipt must reject forged body");
  });

  it("untampered receipt verifies", async () => {
    const policy = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [{ id: "s", match: { action: "schema" }, effect: "allow" }],
      }),
    );
    const keys = generateKeyPair();
    const log = new ReceiptLog(keys);
    const boundary = new Boundary(policy, new StubProvider(), log);
    const r = await boundary.handle({ action: "schema", resource: "*" });
    assert.equal(verifyReceipt(r.receipt, keys.publicKey).ok, true);
  });
});
