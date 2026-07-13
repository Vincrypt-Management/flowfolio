import { assertEquals } from "jsr:@std/assert";
import { SlidingWindowRateLimiter } from "./rate-limiter.ts";

Deno.test("first call for a provider returns true", () => {
  const limiter = new SlidingWindowRateLimiter();
  assertEquals(limiter.checkAndConsume("alpaca", 5), true);
});

Deno.test("subsequent calls within the limit return true", () => {
  const limiter = new SlidingWindowRateLimiter();
  const now = 1_000_000;
  assertEquals(limiter.checkAndConsume("alpaca", 3, now), true);
  assertEquals(limiter.checkAndConsume("alpaca", 3, now + 10), true);
  assertEquals(limiter.checkAndConsume("alpaca", 3, now + 20), true);
});

Deno.test("call at the limit within the same window returns false", () => {
  const limiter = new SlidingWindowRateLimiter();
  const now = 1_000_000;
  limiter.checkAndConsume("alpaca", 2, now);
  limiter.checkAndConsume("alpaca", 2, now + 10);
  assertEquals(limiter.checkAndConsume("alpaca", 2, now + 20), false);
});

Deno.test("window resets after 60 seconds elapse", () => {
  const limiter = new SlidingWindowRateLimiter();
  const now = 1_000_000;
  limiter.checkAndConsume("alpaca", 1, now);
  assertEquals(limiter.checkAndConsume("alpaca", 1, now + 30_000), false);
  assertEquals(limiter.checkAndConsume("alpaca", 1, now + 60_001), true);
});

Deno.test("providers are tracked independently", () => {
  const limiter = new SlidingWindowRateLimiter();
  const now = 1_000_000;
  limiter.checkAndConsume("alpaca", 1, now);
  assertEquals(limiter.checkAndConsume("alpaca", 1, now + 10), false);
  assertEquals(limiter.checkAndConsume("finnhub", 1, now + 10), true);
});
