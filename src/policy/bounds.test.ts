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
  DEFAULT_MAX_BYTES,
  HARD_MAX_BYTES,
  resolveMaxBytes,
  capRowsByBytes,
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

describe("output byte cap (N6)", () => {
  it("defaults, clamps and rejects non-positive like the row cap", () => {
    assert.equal(resolveMaxBytes(undefined), DEFAULT_MAX_BYTES);
    assert.equal(DEFAULT_MAX_BYTES, 65_536);
    assert.equal(resolveMaxBytes(50_000_000), HARD_MAX_BYTES);
    assert.equal(resolveMaxBytes("0"), DEFAULT_MAX_BYTES);
    assert.equal(resolveMaxBytes("4096"), 4096);
  });

  it("keeps whole rows in order until the next would exceed the cap", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, note: "x".repeat(40) }));
    const out = capRowsByBytes(rows, 200);
    assert.ok(out.rows.length > 0 && out.rows.length < 10);
    assert.deepEqual(out.rows, rows.slice(0, out.rows.length));
    assert.equal(out.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(out.rows)) <= 200);
    assert.equal(out.bytes, Buffer.byteLength(JSON.stringify(out.rows)));
  });

  it("returns everything untouched when under the cap", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const out = capRowsByBytes(rows, 1000);
    assert.deepEqual(out.rows, rows);
    assert.equal(out.truncated, false);
  });

  it("returns no rows, marked truncated, when one row alone exceeds the cap", () => {
    const out = capRowsByBytes([{ blob: "y".repeat(500) }], 100);
    assert.deepEqual(out.rows, []);
    assert.equal(out.truncated, true);
  });

  it("counts a fixed overhead against the cap", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const all = capRowsByBytes(rows, 1000);
    const tight = capRowsByBytes(rows, 1000, 960);
    assert.equal(all.rows.length, 10);
    assert.ok(tight.rows.length < 10 && tight.truncated);
    assert.ok(tight.bytes + 960 <= 1000);
  });

  it("measures UTF-8 bytes, not characters", () => {
    const out = capRowsByBytes([{ t: "é".repeat(60) }], 100);
    assert.deepEqual(out.rows, []);
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
