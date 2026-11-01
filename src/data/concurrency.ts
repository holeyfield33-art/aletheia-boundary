/**
 * Process-local request limiter for Aletheia Boundary.
 *
 * Controls:
 *   - max concurrent in-flight boundary_request calls
 *   - token-bucket rate limit (requests per second + burst)
 *
 * Fail closed: when the limit is hit the request is refused before policy
 * evaluation or data access. No data is released and no receipt is written
 * for limit rejections (the refusal itself is the signal).
 *
 * Configuration (env, clamped):
 *   BOUNDARY_MAX_CONCURRENT   default 4,  hard max 32
 *   BOUNDARY_RATE_LIMIT       default 10, hard max 100  (tokens/sec)
 *   BOUNDARY_RATE_BURST       default = rate, hard max 200
 *
 * Set any of the three to 0 (or a non-positive value) to disable that control.
 * Disabling both concurrency and rate leaves the limiter as a no-op.
 */

export const DEFAULT_MAX_CONCURRENT = 4;
export const HARD_MAX_CONCURRENT = 32;

export const DEFAULT_RATE_LIMIT = 10;
export const HARD_RATE_LIMIT = 100;

export const HARD_RATE_BURST = 200;

export interface ConcurrencyLimits {
  maxConcurrent: number;
  ratePerSecond: number;
  burst: number;
}

export function resolveConcurrencyLimits(
  env: NodeJS.ProcessEnv = process.env,
): ConcurrencyLimits {
  const maxConcurrent = clampInt(
    env.BOUNDARY_MAX_CONCURRENT,
    DEFAULT_MAX_CONCURRENT,
    0,
    HARD_MAX_CONCURRENT,
  );
  const ratePerSecond = clampInt(
    env.BOUNDARY_RATE_LIMIT,
    DEFAULT_RATE_LIMIT,
    0,
    HARD_RATE_LIMIT,
  );
  const burstDefault = ratePerSecond > 0 ? ratePerSecond : DEFAULT_RATE_LIMIT;
  const burst = clampInt(
    env.BOUNDARY_RATE_BURST,
    burstDefault,
    0,
    HARD_RATE_BURST,
  );
  return { maxConcurrent, ratePerSecond, burst };
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

export type LimitRejectReason = "concurrency" | "rate";

export class LimitExceededError extends Error {
  readonly reason: LimitRejectReason;
  constructor(reason: LimitRejectReason) {
    super(
      reason === "concurrency"
        ? "Too many concurrent requests; try again shortly"
        : "Request rate limit exceeded; try again shortly",
    );
    this.name = "LimitExceededError";
    this.reason = reason;
  }
}

/**
 * Lightweight process-local limiter.
 * Safe for concurrent async callers within a single Node process.
 */
export class RequestLimiter {
  private inFlight = 0;
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly limits: ConcurrencyLimits) {
    this.tokens = limits.burst > 0 ? limits.burst : 0;
    this.lastRefillMs = Date.now();
  }

  /** Current observed load (for tests / diagnostics). */
  snapshot(): { inFlight: number; tokens: number } {
    this.refill();
    return { inFlight: this.inFlight, tokens: this.tokens };
  }

  /**
   * Acquire a slot. Throws LimitExceededError on refusal.
   * Always pair with release() in a finally block.
   */
  acquire(): void {
    if (this.limits.maxConcurrent > 0 && this.inFlight >= this.limits.maxConcurrent) {
      throw new LimitExceededError("concurrency");
    }

    if (this.limits.ratePerSecond > 0) {
      this.refill();
      if (this.tokens < 1) {
        throw new LimitExceededError("rate");
      }
      this.tokens -= 1;
    }

    this.inFlight += 1;
  }

  release(): void {
    if (this.inFlight > 0) this.inFlight -= 1;
  }

  /**
   * Run `fn` under the limiter. Guarantees release even on throw.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private refill(): void {
    if (this.limits.ratePerSecond <= 0) return;
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    const add = elapsedSec * this.limits.ratePerSecond;
    this.tokens = Math.min(this.limits.burst, this.tokens + add);
    this.lastRefillMs = now;
  }
}
