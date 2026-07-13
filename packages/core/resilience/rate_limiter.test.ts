import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { RateLimitExceededError, RateLimiter } from "./rate_limiter.ts";

Deno.test("allows up to the daily quota then rejects", () => {
  const limiter = RateLimiter.newDaily(5);
  for (let i = 0; i < 5; i++) {
    limiter.check();
  }
  assertThrows(() => limiter.check(), RateLimitExceededError);
});

Deno.test("remainingCapacity decreases as requests are consumed", () => {
  const limiter = RateLimiter.newDaily(10);
  assertEquals(limiter.remainingCapacity(), 10);
  limiter.check();
  limiter.check();
  assertEquals(limiter.remainingCapacity(), 8);
});

Deno.test("remainingCapacity never goes below zero", () => {
  const limiter = RateLimiter.newDaily(1);
  limiter.check();
  assertThrows(() => limiter.check());
  assert(limiter.remainingCapacity() >= 0);
});
