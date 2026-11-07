/**
 * Fail-closed validation of agent-supplied boundary_request fields.
 *
 * Identifiers must be literal safe SQL identifiers (or schema "*").
 * Encoded, path-like, or dual-meaning strings are rejected before policy.
 */

import type { BoundaryRequest } from "../types.js";
import { isSafeIdentifier } from "../data/postgres.js";

const ALLOWED_ACTIONS = new Set(["query", "schema", "export", "sample"]);

/**
 * N5: a shape error the agent can act on. Messages are fixed text (never
 * agent input) and are checked before any database access, so they reveal
 * nothing about which tables exist.
 */
export class RequestValidationError extends Error {}
const ALLOWED_PARAM_KEYS = new Set(["columns", "limit"]);

const MAX_RESOURCE = 128;
const MAX_PURPOSE = 512;
const MAX_COLUMNS = 32;
const MAX_COLUMN_LEN = 64;
const BAD_RESOURCE = "resource must be a table identifier such as public.orders";

/**
 * True if s looks like percent-encoding, base64 blob, or hex dump — not a
 * normal table/column identifier or free-form purpose prose.
 *
 * Pure alphanumeric base64 (no +/=) is indistinguishable from a long id, so
 * we only flag long undotted mixed-case tokens. Short valid identifiers such
 * as "c3Nu" are allowed; use padding or +/ to force a clear base64 reject.
 */
export function looksEncoded(s: string): boolean {
  if (/%[0-9a-fA-F]{2}/.test(s)) return true;
  // padded base64
  if (/^[A-Za-z0-9+/]{8,}={1,2}$/.test(s)) return true;
  // base64 alphabet with + or /
  if (/[+/]/.test(s) && /^[A-Za-z0-9+/=]{12,}$/.test(s)) return true;
  // long pure alnum, undotted, mixed case → typical opaque base64 blob,
  // unless it is shaped like CamelCase words (CustomerOrders2024): every
  // capital followed by lowercase letters, or a run of digits (N5).
  if (
    s.length >= 16 &&
    !s.includes(".") &&
    /^[A-Za-z0-9]+$/.test(s) &&
    /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    !/^[a-z]*(?:[A-Z][a-z]+|[0-9]+)+$/.test(s)
  ) {
    return true;
  }
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
    throw new RequestValidationError("action must be one of query, schema, export, sample");
  }

  const resource = partial.resource;
  if (typeof resource !== "string" || resource.length === 0) {
    throw new RequestValidationError(BAD_RESOURCE);
  }
  if (resource.length > MAX_RESOURCE) {
    throw new RequestValidationError(`resource is longer than ${MAX_RESOURCE} characters`);
  }
  if (resource.includes("\0") || /[\x00-\x1f\x7f]/.test(resource)) {
    throw new RequestValidationError(BAD_RESOURCE);
  }
  if (resource.includes("..") || resource.includes("/") || resource.includes("\\")) {
    throw new RequestValidationError(BAD_RESOURCE);
  }
  if (looksEncoded(resource)) {
    throw new RequestValidationError("resource looks encoded (percent, base64 or hex); send the plain table name");
  }
  // schema may use "*"; all other actions need a safe identifier
  if (resource !== "*") {
    if (!isSafeIdentifier(resource)) {
      throw new RequestValidationError(BAD_RESOURCE);
    }
  } else if (partial.action !== "schema") {
    throw new RequestValidationError("wildcard resource * is only allowed for action schema");
  }

  if (partial.purpose != null) {
    if (typeof partial.purpose !== "string") throw new RequestValidationError("purpose must be plain text without control characters");
    if (partial.purpose.length > MAX_PURPOSE) throw new RequestValidationError(`purpose is longer than ${MAX_PURPOSE} characters`);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(partial.purpose))
      throw new RequestValidationError("purpose must be plain text without control characters");
    if (looksEncoded(partial.purpose)) {
      throw new RequestValidationError("purpose looks encoded (percent, base64 or hex); send plain text");
    }
  }

  // caller from the agent is ignored by MCP host path; still reject garbage shapes
  if (partial.caller != null) {
    if (typeof partial.caller !== "string" || partial.caller.length > 128) {
      throw new RequestValidationError("caller must be a string of at most 128 characters");
    }
  }

  const params = partial.params;
  if (params == null) return;
  if (typeof params !== "object" || Array.isArray(params)) {
    throw new RequestValidationError("params must be an object");
  }

  if ("sql" in params || "query" in params) {
    throw new RequestValidationError("free-form SQL is not allowed; use params.columns and params.limit");
  }

  for (const key of Object.keys(params)) {
    if (!ALLOWED_PARAM_KEYS.has(key)) {
      throw new RequestValidationError("unknown param; allowed params are columns and limit");
    }
  }


  if (params.columns !== undefined) {
    if (!Array.isArray(params.columns) || params.columns.length > MAX_COLUMNS) {
      throw new RequestValidationError(`params.columns must be a list of at most ${MAX_COLUMNS} column names`);
    }
    for (const c of params.columns) {
      if (typeof c !== "string" || c.length === 0 || c.length > MAX_COLUMN_LEN) {
        throw new RequestValidationError("column names must be plain identifiers such as user_id");
      }
      if (c.includes(".") || looksEncoded(c) || !isSafeIdentifier(c)) {
        throw new RequestValidationError("column names must be plain identifiers such as user_id");
      }
    }
  }

  if (params.limit !== undefined) {
    if (typeof params.limit !== "number" || !Number.isFinite(params.limit)) {
      throw new RequestValidationError("params.limit must be a finite number");
    }
  }
}
