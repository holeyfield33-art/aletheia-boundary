/**
 * Fail-closed policy validation tests (F4, F5).
 * Run: npx tsx --test src/policy/failclosed.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPolicyFromObject } from "./engine.js";

describe("policy load fail-closed", () => {
  it("rejects misspelled effect (F4)", () => {
    assert.throws(
      () =>
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
        }),
      /Invalid policy document/,
    );
  });

  it("rejects unimplemented constraint type aggregate (F5)", () => {
    assert.throws(
      () =>
        loadPolicyFromObject({
          version: "0.1",
          defaultEffect: "deny",
          rules: [
            {
              id: "agg",
              match: { action: "query" },
              effect: "allow_with_constraints",
              constraints: [{ type: "aggregate", value: "count" }],
            },
          ],
        }),
      /Invalid policy document/,
    );
  });

  it("rejects unimplemented constraint type rows", () => {
    assert.throws(
      () =>
        loadPolicyFromObject({
          version: "0.1",
          defaultEffect: "deny",
          rules: [
            {
              id: "rows",
              match: { action: "query" },
              effect: "allow_with_constraints",
              constraints: [{ type: "rows", value: 10 }],
            },
          ],
        }),
      /Invalid policy document/,
    );
  });

  it("rejects allow_with_constraints without constraints", () => {
    assert.throws(
      () =>
        loadPolicyFromObject({
          version: "0.1",
          defaultEffect: "deny",
          rules: [
            {
              id: "empty",
              match: { action: "query" },
              effect: "allow_with_constraints",
            },
          ],
        }),
      /Invalid policy document/,
    );
  });

  it("accepts a valid policy", () => {
    const doc = loadPolicyFromObject({
      version: "0.1",
      defaultEffect: "deny",
      rules: [
        {
          id: "ok",
          match: { action: "schema" },
          effect: "allow",
        },
        {
          id: "ok2",
          match: { action: "sample" },
          effect: "allow_with_constraints",
          constraints: [{ type: "limit", value: 5 }],
        },
      ],
    });
    assert.equal(doc.rules.length, 2);
  });
});
