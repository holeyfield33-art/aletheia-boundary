import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RequestLimiter,
  LimitExceededError,
  resolveConcurrencyLimits,
  DEFAULT_MAX_CONCURRENT,
  HARD_MAX_CONCURRENT,
  DEFAULT_RATE_LIMIT,
  HARD_RATE_LIMIT,
} from "./concurrency.js";

test("R1 resolveConcurrencyLimits applies defaults and clamps", () => {
  const d = resolveConcurrencyLimits({});
  assert.equal(d.maxConcurrent, DEFAULT_MAX_CONCURRENT);
  assert.equal(d.ratePerSecond, DEFAULT_RATE_LIMIT);
  assert.equal(d.burst, DEFAULT_RATE_LIMIT);

  const high = resolveConcurrencyLimits({
    BOUNDARY_MAX_CONCURRENT: "999",
    BOUNDARY_RATE_LIMIT: "999",
    BOUNDARY_RATE_BURST: "999",
  });
  assert.equal(high.maxConcurrent, HARD_MAX_CONCURRENT);
  assert.equal(high.ratePerSecond, HARD_RATE_LIMIT);
  assert.equal(high.burst, 200);

  const zero = resolveConcurrencyLimits({
    BOUNDARY_MAX_CONCURRENT: "0",
    BOUNDARY_RATE_LIMIT: "0",
    BOUNDARY_RATE_BURST: "0",
  });
  assert.equal(zero.maxConcurrent, 0);
  assert.equal(zero.ratePerSecond, 0);
  assert.equal(zero.burst, 0);

  const bad = resolveConcurrencyLimits({
    BOUNDARY_MAX_CONCURRENT: "nope",
    BOUNDARY_RATE_LIMIT: "",
  });
  assert.equal(bad.maxConcurrent, DEFAULT_MAX_CONCURRENT);
  assert.equal(bad.ratePerSecond, DEFAULT_RATE_LIMIT);
});

test("R2 concurrency limit refuses excess in-flight requests", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 2,
    ratePerSecond: 0,
    burst: 0,
  });

  limiter.acquire();
  limiter.acquire();
  assert.throws(() => limiter.acquire(), (e: unknown) => {
    assert.ok(e instanceof LimitExceededError);
    assert.equal(e.reason, "concurrency");
    return true;
  });

  limiter.release();
  limiter.acquire(); // now ok
  limiter.release();
  limiter.release();
});

test("R3 rate limit refuses when tokens exhausted", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 0,
    ratePerSecond: 10,
    burst: 2,
  });

  limiter.acquire();
  limiter.acquire();
  assert.throws(() => limiter.acquire(), (e: unknown) => {
    assert.ok(e instanceof LimitExceededError);
    assert.equal(e.reason, "rate");
    return true;
  });
  limiter.release();
  limiter.release();
});

test("R4 rate tokens refill over time", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 0,
    ratePerSecond: 100, // fast refill for the test
    burst: 1,
  });

  limiter.acquire();
  assert.throws(() => limiter.acquire());
  limiter.release();

  // Wait enough for one token to refill
  await new Promise((r) => setTimeout(r, 25));
  limiter.acquire(); // should succeed after refill
  limiter.release();
});

test("R5 run() always releases even on throw", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 1,
    ratePerSecond: 0,
    burst: 0,
  });

  await assert.rejects(
    () =>
      limiter.run(async () => {
        throw new Error("boom");
      }),
    /boom/,
  );

  // Slot must be free again
  await limiter.run(async () => "ok");
  const snap = limiter.snapshot();
  assert.equal(snap.inFlight, 0);
});

test("R6 concurrent run() respects maxConcurrent", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 2,
    ratePerSecond: 0,
    burst: 0,
  });

  let active = 0;
  let peak = 0;
  const work = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 30));
    active -= 1;
  };

  const results = await Promise.allSettled([
    limiter.run(work),
    limiter.run(work),
    limiter.run(work),
    limiter.run(work),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  assert.ok(fulfilled >= 2);
  assert.ok(rejected >= 1);
  assert.ok(peak <= 2);
});

test("R7 disabled limits are no-ops", async () => {
  const limiter = new RequestLimiter({
    maxConcurrent: 0,
    ratePerSecond: 0,
    burst: 0,
  });

  // Many concurrent acquires should all succeed
  for (let i = 0; i < 20; i++) limiter.acquire();
  assert.equal(limiter.snapshot().inFlight, 20);
  for (let i = 0; i < 20; i++) limiter.release();
  assert.equal(limiter.snapshot().inFlight, 0);
});
