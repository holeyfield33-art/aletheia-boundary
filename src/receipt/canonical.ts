/**
 * Deterministic JSON encoding for receipt hashing.
 *
 * CRITICAL: never use JSON.stringify(obj, Object.keys(obj).sort()) as a
 * "canonicalizer". The second argument is a key whitelist applied at EVERY
 * depth, so nested fields (request, decision, …) are dropped from the hash.
 * That is F2 — a forged decision still verified.
 *
 * This module walks the value and sorts keys at each object level.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortValue(obj[key]);
  }
  return out;
}
