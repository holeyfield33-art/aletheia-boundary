/**
 * F9 / F10 / glob matching tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Boundary } from "../boundary.js";
import { PolicyEngine, loadPolicyFromObject } from "./engine.js";
import { ReceiptLog } from "../receipt/log.js";
import { generateKeyPair } from "../receipt/crypto.js";
import type { DataProvider } from "../data/provider.js";
import type { BoundaryRequest, Constraint, MinimizedPayload } from "../types.js";
import {
  DEFAULT_MAX_ROWS,
  HARD_MAX_ROWS,
  resolveMaxRows,
} from "../data/limits.js";

describe("output limits (F9)", () => {
  it("defaults to DEFAULT_MAX_ROWS", () => {
    assert.equal(resolveMaxRows(undefined), DEFAULT_MAX_ROWS);
    assert.equal(DEFAULT_MAX_ROWS, 500);
  });

  it("clamps above HARD_MAX_ROWS", () => {
    assert.equal(resolveMaxRows(50_000), HARD_MAX_ROWS);
    assert.equal(HARD_MAX_ROWS, 2_000);
  });

  it("rejects non-positive", () => {
    assert.equal(resolveMaxRows(0), DEFAULT_MAX_ROWS);
    assert.equal(resolveMaxRows(-1), DEFAULT_MAX_ROWS);
  });
});

describe("schema filtering (F10)", () => {
  it("omits tables the policy would deny", async () => {
    const policy = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "deny",
        rules: [
          {
            id: "allow-schema",
            match: { action: "schema" },
            effect: "allow",
            priority: 10,
          },
          {
            id: "deny-users",
            match: { resource: ["*users*"] },
            effect: "deny",
            priority: 100,
          },
          {
            id: "allow-orders",
            match: {
              action: ["sample", "query", "schema"],
              resource: ["public.orders", "*orders*"],
            },
            effect: "allow",
            priority: 20,
          },
        ],
      }),
    );

    const provider: DataProvider = {
      async execute(req: BoundaryRequest, _c?: Constraint[]): Promise<MinimizedPayload> {
        if (req.action !== "schema") throw new Error("unexpected");
        return {
          data: [
            {
              schema: "public",
              name: "users",
              columns: [
                { name: "ssn", type: "text", nullable: true },
                { name: "email", type: "text", nullable: true },
              ],
            },
            {
              schema: "public",
              name: "orders",
              columns: [{ name: "id", type: "integer", nullable: false }],
            },
          ],
          transforms: ["schema"],
          stats: { rows: 2 },
        };
      },
    };

    const boundary = new Boundary(policy, provider, new ReceiptLog(generateKeyPair()));
    const r = await boundary.handle({ action: "schema", resource: "*" });
    assert.equal(r.ok, true);
    const tables = r.payload!.data as { name: string }[];
    assert.equal(
      tables.some((t) => t.name === "users"),
      false,
      "users must not appear in schema",
    );
    assert.equal(
      tables.some((t) => t.name === "orders"),
      true,
      "orders must appear",
    );
    assert.ok(
      r.payload!.transforms.some((t) => t.startsWith("schema-filtered")),
      "filter transform recorded",
    );
  });

  it("*users* matches public.users", () => {
    const policy = new PolicyEngine(
      loadPolicyFromObject({
        version: "0.1",
        defaultEffect: "allow",
        rules: [
          {
            id: "deny-users",
            match: { resource: ["*users*"] },
            effect: "deny",
            priority: 100,
          },
        ],
      }),
    );
    const d = policy.evaluate({
      id: "t",
      action: "query",
      resource: "public.users",
      receivedAt: new Date().toISOString(),
    });
    assert.equal(d.outcome, "deny");
    assert.equal(d.ruleId, "deny-users");
  });
});
