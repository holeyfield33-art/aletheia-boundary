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
    assert.throws(() =>
      assertSafeAgentRequest({
        action: "query",
        resource: "public.orders",
        params: { columns: ["c3Nu"] },
      }),
    );
  });
});
