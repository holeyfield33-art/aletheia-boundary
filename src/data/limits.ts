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
