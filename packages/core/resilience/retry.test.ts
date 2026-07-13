import { assert, assertEquals } from "jsr:@std/assert";
import {
  aggressiveRetryConfig,
  conservativeRetryConfig,
  defaultRetryConfig,
  networkRetryConfig,
  retry,
  retryNetwork,
  retryRateLimited,
  RetryExecutor,
} from "./retry.ts";

Deno.test("default config matches documented values", () => {
  assertEquals(defaultRetryConfig.maxRetries, 3);
  assertEquals(defaultRetryConfig.initialDelayMs, 100);
  assertEquals(defaultRetryConfig.maxDelayMs, 10_000);
  assertEquals(defaultRetryConfig.backoffMultiplier, 2.0);
  assertEquals(defaultRetryConfig.jitter, true);
  assertEquals(defaultRetryConfig.attemptTimeoutMs, 30_000);
});

Deno.test("aggressive config allows more, faster retries than conservative", () => {
  assert(aggressiveRetryConfig.maxRetries > conservativeRetryConfig.maxRetries);
  assert(aggressiveRetryConfig.initialDelayMs < conservativeRetryConfig.initialDelayMs);
  assert(aggressiveRetryConfig.backoffMultiplier < conservativeRetryConfig.backoffMultiplier);
});

Deno.test("network config has a 30s attempt timeout", () => {
  assertEquals(networkRetryConfig.attemptTimeoutMs, 30_000);
});

Deno.test("succeeds on first attempt with zero delay", async () => {
  const executor = new RetryExecutor({
    maxRetries: 3,
    initialDelayMs: 1,
    maxDelayMs: 10,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  const result = await executor.execute(() => Promise.resolve(42));
  assert(result.result.ok);
  assertEquals(result.result.ok && result.result.value, 42);
  assertEquals(result.attempts, 1);
  assertEquals(result.totalDelayMs, 0);
});

Deno.test("succeeds after transient failures", async () => {
  const executor = new RetryExecutor({
    maxRetries: 5,
    initialDelayMs: 1,
    maxDelayMs: 10,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  let count = 0;
  const result = await executor.execute(() => {
    count += 1;
    return count < 3 ? Promise.reject(new Error("not ready")) : Promise.resolve("done");
  });
  assert(result.result.ok);
  assertEquals(result.attempts, 3);
});

Deno.test("fails after max attempts exhausted", async () => {
  const executor = new RetryExecutor({
    maxRetries: 3,
    initialDelayMs: 1,
    maxDelayMs: 5,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  const result = await executor.execute(() => Promise.reject(new Error("always fails")));
  assertEquals(result.result.ok, false);
  assertEquals(result.attempts, 3);
});

Deno.test("maxRetries of 1 means a single attempt, no retry", async () => {
  const executor = new RetryExecutor({
    maxRetries: 1,
    initialDelayMs: 1,
    maxDelayMs: 5,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  let count = 0;
  const result = await executor.execute(() => {
    count += 1;
    return Promise.reject(new Error("fail"));
  });
  assertEquals(result.attempts, 1);
  assertEquals(count, 1);
});

Deno.test("total delay accumulates across retries", async () => {
  const executor = new RetryExecutor({
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 100,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  const result = await executor.execute(() => Promise.reject(new Error("fail")));
  // delay after attempt 1 = 10ms, after attempt 2 = 20ms; total >= 29ms allowing for timer slack
  assert(result.totalDelayMs >= 29);
});

Deno.test("executeWithPredicate stops immediately on a non-retryable error", async () => {
  const executor = new RetryExecutor({
    maxRetries: 5,
    initialDelayMs: 1,
    maxDelayMs: 10,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  let count = 0;
  const result = await executor.executeWithPredicate(
    () => {
      count += 1;
      return Promise.reject(new Error("permanent"));
    },
    (e: unknown) => !(e instanceof Error && e.message === "permanent"),
  );
  assertEquals(result.result.ok, false);
  assertEquals(result.attempts, 1);
  assertEquals(count, 1);
});

Deno.test("executeWithPredicate retries a retryable error then succeeds", async () => {
  const executor = new RetryExecutor({
    maxRetries: 5,
    initialDelayMs: 1,
    maxDelayMs: 10,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: null,
  });
  let count = 0;
  const result = await executor.executeWithPredicate(
    () => {
      count += 1;
      return count < 3 ? Promise.reject(new Error("transient")) : Promise.resolve("done");
    },
    (e: unknown) => e instanceof Error && e.message === "transient",
  );
  assert(result.result.ok);
  assertEquals(result.attempts, 3);
});

Deno.test("a timed-out attempt is treated as a failure and retried", async () => {
  const executor = new RetryExecutor({
    maxRetries: 2,
    initialDelayMs: 1,
    maxDelayMs: 5,
    backoffMultiplier: 2,
    jitter: false,
    attemptTimeoutMs: 5,
  });
  let count = 0;
  const result = await executor.execute(() => {
    count += 1;
    if (count === 1) {
      return new Promise((resolve) => setTimeout(() => resolve("late"), 50));
    }
    return Promise.resolve("fast");
  });
  assert(result.result.ok);
  assertEquals(result.attempts, 2);
});

Deno.test("convenience retry() unwraps a successful RetryResult", async () => {
  const result = await retry(() => Promise.resolve(99));
  assert(result.result.ok);
});

Deno.test("convenience retryNetwork() runs with the network preset", async () => {
  const result = await retryNetwork(() => Promise.resolve("ok"));
  assert(result.result.ok);
});

Deno.test("convenience retryRateLimited() runs with the conservative preset", async () => {
  const result = await retryRateLimited(() => Promise.resolve(42));
  assert(result.result.ok);
});
