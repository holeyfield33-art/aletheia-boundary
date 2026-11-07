import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSafeAgentRequest, looksEncoded } from "./validate.js";

describe("request validation (encoding / shape)", () => {
  it("accepts normal structured query", () => {
    assert.doesNotThrow(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        params: { columns: ["id", "amount"], limit: 10 },
      }),
    );
  });

  it("allows schema *", () => {
    assert.doesNotThrow(() =>
      assertSafeAgentRequest({ action: "schema", resource: "*" }),
    );
  });

  it("rejects * on query", () => {
    assert.throws(() =>
      assertSafeAgentRequest({ action: "query", resource: "*" }),
    );
  });

  it("rejects percent-encoded resource", () => {
    assert.ok(looksEncoded("public%2eusers"));
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public%2eusers",
      }),
    );
  });

  it("rejects base64-like resource", () => {
    assert.ok(looksEncoded("cHVibGljLnVzZXJz"));
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "cHVibGljLnVzZXJz",
      }),
    );
  });

  it("rejects path traversal resource", () => {
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "../users",
      }),
    );
  });

  it("rejects unknown params keys including sql", () => {
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        params: { sql: "SELECT 1" },
      }),
    );
  });

  it("rejects encoded column name", () => {
    assert.equal(looksEncoded("c3Nu"), false);
    assert.ok(looksEncoded("c3NuX3Nzbg=="));
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        params: { columns: ["c3NuX3Nzbg=="] },
      }),
    );
  });

  it("accepts ordinary short column identifiers", () => {
    assert.doesNotThrow(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        params: { columns: ["id", "ssn", "user_id", "Amount"] },
      }),
    );
  });

  it("rejects encoded purpose", () => {
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        purpose: "c3NuX3Nzbg==",
      }),
    );
  });

  it("N5: accepts ordinary CamelCase names and purposes", () => {
    for (const resource of ["CustomerOrders2024", "MonthlyRevenueByRegion", "public.CustomerOrders2024"]) {
      assert.equal(looksEncoded(resource), false, resource);
      assert.doesNotThrow(() => assertSafeAgentRequest({ action: "query", resource }), resource);
    }
    assert.doesNotThrow(() =>
      assertSafeAgentRequest({ action: "query", resource: "public.orders", purpose: "QuarterlyBusinessReview" }),
    );
  });

  it("N5: still rejects base64 that is not CamelCase-shaped", () => {
    for (const blob of ["cHVibGljLnVzZXJz", "dXNlcnMuc3NuX2xpc3Q", "QUJDREVGR0hJSktMTU5PUA"]) {
      assert.ok(looksEncoded(blob), blob);
    }
  });
});
