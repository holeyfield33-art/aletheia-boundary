/**
 * Output bounds (F9 / I6).
 *
 * Defaults are intentionally tight for MCP tool results. Operators may raise
 * BOUNDARY_MAX_ROWS up to HARD_MAX_ROWS; higher values are clamped.
 */

/** Default row cap when neither policy nor env sets a lower limit. */
export const DEFAULT_MAX_ROWS = 500;

/** Absolute ceiling — cannot be exceeded even via env. */
export const HARD_MAX_ROWS = 2_000;

/** Resolve effective max rows from env with clamp. */
export function resolveMaxRows(envValue?: string | number): number {
  const raw =
    typeof envValue === "number"
      ? envValue
      : envValue != null && envValue !== ""
        ? Number(envValue)
        : DEFAULT_MAX_ROWS;
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_ROWS;
  return Math.min(Math.floor(raw), HARD_MAX_ROWS);
}

/**
 * N6: byte cap on released rows, so one tool result cannot flood an agent's
 * context even within the row cap (wide text or bytea columns).
 */
export const DEFAULT_MAX_BYTES = 65_536;

/** Absolute ceiling for BOUNDARY_MAX_BYTES. */
export const HARD_MAX_BYTES = 1_048_576;

/** Resolve effective max bytes from env with clamp (same rules as rows). */
export function resolveMaxBytes(envValue?: string | number): number {
  const raw =
    typeof envValue === "number"
      ? envValue
      : envValue != null && envValue !== ""
        ? Number(envValue)
        : DEFAULT_MAX_BYTES;
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_BYTES;
  return Math.min(Math.floor(raw), HARD_MAX_BYTES);
}

/**
 * Keep whole rows, in order, while their JSON array stays within maxBytes
 * (UTF-8). Never cuts inside a value. A single row larger than the cap
 * yields no rows; the caller reports truncated so the agent can narrow
 * columns.
 */
export function capRowsByBytes<T>(
  rows: T[],
  maxBytes: number,
): { rows: T[]; truncated: boolean; bytes: number } {
  let bytes = 2; // "[]"
  let kept = 0;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + (kept > 0 ? 1 : 0);
    if (bytes + size > maxBytes) break;
    bytes += size;
    kept++;
  }
  return { rows: rows.slice(0, kept), truncated: kept < rows.length, bytes };
}
