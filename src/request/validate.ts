/**
 * Fail-closed validation of agent-supplied boundary_request fields.
 *
 * Identifiers must be literal safe SQL identifiers (or schema "*").
 * Encoded, path-like, or dual-meaning strings are rejected before policy.
 */

import type { BoundaryRequest } from "../types.js";
import { isSafeIdentifier } from "../data/postgres.js";

const ALLOWED_ACTIONS = new Set(["query", "schema", "export", "sample"]);
const ALLOWED_PARAM_KEYS = new Set(["columns", "limit"]);

const MAX_RESOURCE = 128;
const MAX_PURPOSE = 512;
const MAX_COLUMNS = 32;
const MAX_COLUMN_LEN = 64;

/** True if s looks like percent-encoding, base64 blob, or hex dump — not a table name. */
export function looksEncoded(s: string): boolean {
  if (/%[0-9a-fA-F]{2}/.test(s)) return true;
  // long base64-ish tokens (padding or alphabet-only length >= 16)
  if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(s) && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(s))
    return true;
  if (/^[0-9a-fA-F]{24,}$/.test(s)) return true;
  return false;
}

export function assertSafeAgentRequest(
  partial: Pick<
    BoundaryRequest,
    "action" | "resource" | "params" | "purpose" | "caller"
  >,
): void {
  if (!ALLOWED_ACTIONS.has(partial.action)) {
    throw new Error("invalid action");
  }

  const resource = partial.resource;
  if (typeof resource !== "string" || resource.length === 0) {
    throw new Error("invalid resource");
  }
  if (resource.length > MAX_RESOURCE) {
    throw new Error("resource too long");
  }
  if (resource.includes("\0") || /[\x00-\x1f\x7f]/.test(resource)) {
    throw new Error("invalid resource");
  }
  if (resource.includes("..") || resource.includes("/") || resource.includes("\\")) {
    throw new Error("invalid resource");
  }
  if (looksEncoded(resource)) {
    throw new Error("encoded resource identifiers are not allowed");
  }
  // schema may use "*"; all other actions need a safe identifier
  if (resource !== "*") {
    if (!isSafeIdentifier(resource)) {
      throw new Error("invalid resource");
    }
  } else if (partial.action !== "schema") {
    throw new Error("wildcard resource only allowed for schema");
  }

  if (partial.purpose != null) {
    if (typeof partial.purpose !== "string") throw new Error("invalid purpose");
    if (partial.purpose.length > MAX_PURPOSE) throw new Error("purpose too long");
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(partial.purpose))
      throw new Error("invalid purpose");
  }

  // caller from the agent is ignored by MCP host path; still reject garbage shapes
  if (partial.caller != null) {
    if (typeof partial.caller !== "string" || partial.caller.length > 128) {
      throw new Error("invalid caller");
    }
  }

  const params = partial.params;
  if (params == null) return;
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new Error("invalid params");
  }

  for (const key of Object.keys(params)) {
    if (!ALLOWED_PARAM_KEYS.has(key)) {
      throw new Error(`unknown param: ${key}`);
    }
  }

  if ("sql" in params || "query" in params) {
    throw new Error("free-form SQL is not allowed");
  }

  if (params.columns !== undefined) {
    if (!Array.isArray(params.columns) || params.columns.length > MAX_COLUMNS) {
      throw new Error("invalid columns");
    }
    for (const c of params.columns) {
      if (typeof c !== "string" || c.length === 0 || c.length > MAX_COLUMN_LEN) {
        throw new Error("invalid column identifier");
      }
      if (c.includes(".") || looksEncoded(c) || !isSafeIdentifier(c)) {
        throw new Error("invalid column identifier");
      }
    }
  }

  if (params.limit !== undefined) {
    if (typeof params.limit !== "number" || !Number.isFinite(params.limit)) {
      throw new Error("invalid limit");
    }
  }
}
