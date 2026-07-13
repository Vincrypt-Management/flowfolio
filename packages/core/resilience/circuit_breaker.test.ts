import { assertEquals, assertThrows, assertRejects, assert } from "jsr:@std/assert";
import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitOpenError,
  defaultCircuitBreakerConfig,
} from "./circuit_breaker.ts";

Deno.test("starts closed and allows execution", () => {
  const b = new CircuitBreaker("test", defaultCircuitBreakerConfig);
  assertEquals(b.state(), "closed");
  assert(b.canExecute());
});

Deno.test("opens after failureThreshold failures", () => {
  const b = new CircuitBreaker("test", { ...defaultCircuitBreakerConfig, failureThreshold: 3 });
  b.recordFailure();
  b.recordFailure();
  assertEquals(b.state(), "closed");
  b.recordFailure();
  assertEquals(b.state(), "open");
});

Deno.test("rejects execution while open and before openDuration elapses", () => {
  const b = new CircuitBreaker("test", {
    ...defaultCircuitBreakerConfig,
    failureThreshold: 1,
    openDurationMs: 60_000,
  });
  b.recordFailure();
  assertEquals(b.canExecute(), false);
});

Deno.test("success in closed state resets failure count", () => {
  const b = new CircuitBreaker("test", { ...defaultCircuitBreakerConfig, failureThreshold: 5 });
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  b.recordSuccess();
  assertEquals(b.state(), "closed");
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  b.recordFailure();
  assertEquals(b.state(), "closed");
  b.recordFailure();
  assertEquals(b.state(), "open");
});

Deno.test("transitions to half_open after openDuration, then closes after successThreshold successes", async () => {
  const b = new CircuitBreaker("test", {
    failureThreshold: 1,
    openDurationMs: 1,
    successThreshold: 2,
  });
  b.recordFailure();
  assertEquals(b.state(), "open");
  await new Promise((r) => setTimeout(r, 10));
  assert(b.canExecute());
  assertEquals(b.state(), "half_open");
  b.recordSuccess();
  assertEquals(b.state(), "half_open");
  b.recordSuccess();
  assertEquals(b.state(), "closed");
});

Deno.test("failure in half_open reopens the circuit", async () => {
  const b = new CircuitBreaker("test", {
    failureThreshold: 1,
    openDurationMs: 1,
    successThreshold: 3,
  });
  b.recordFailure();
  await new Promise((r) => setTimeout(r, 10));
  assert(b.canExecute());
  assertEquals(b.state(), "half_open");
  b.recordFailure();
  assertEquals(b.state(), "open");
});

Deno.test("reset returns breaker to closed with zeroed counters", () => {
  const b = new CircuitBreaker("test", { ...defaultCircuitBreakerConfig, failureThreshold: 2 });
  b.recordFailure();
  b.recordFailure();
  assertEquals(b.state(), "open");
  b.reset();
  assertEquals(b.state(), "closed");
  assertEquals(b.stats().currentFailureCount, 0);
});

Deno.test("stats reports success rate", () => {
  const b = new CircuitBreaker("mybreaker", { ...defaultCircuitBreakerConfig, failureThreshold: 5 });
  b.recordSuccess();
  b.recordSuccess();
  b.recordFailure();
  const stats = b.stats();
  assertEquals(stats.name, "mybreaker");
  assertEquals(stats.totalRequests, 3);
  assertEquals(stats.totalFailures, 1);
  assertEquals(stats.currentFailureCount, 1);
  assert(Math.abs(stats.successRate - 2 / 3) < 1e-9);
});

Deno.test("stats success rate is 1 with no requests", () => {
  const b = new CircuitBreaker("empty", defaultCircuitBreakerConfig);
  assertEquals(b.stats().successRate, 1);
});

Deno.test("manager returns the same breaker instance for the same name", () => {
  const m = new CircuitBreakerManager();
  const b1 = m.getOrCreate("svc_a");
  const b2 = m.getOrCreate("svc_a");
  assert(b1 === b2);
  const b3 = m.getOrCreate("svc_b");
  assert(b1 !== b3);
});

Deno.test("manager.execute records success and returns the value", async () => {
  const m = new CircuitBreakerManager();
  const result = await m.execute("svc", () => Promise.resolve(42));
  assertEquals(result, 42);
});

Deno.test("manager.execute rethrows the original error on failure", async () => {
  const m = new CircuitBreakerManager();
  await assertRejects(
    () => m.execute("svc", () => Promise.reject(new Error("boom"))),
    Error,
    "boom",
  );
});

Deno.test("manager.execute throws CircuitOpenError once the breaker is open", async () => {
  const m = new CircuitBreakerManager({
    failureThreshold: 1,
    openDurationMs: 60_000,
    successThreshold: 3,
  });
  await m.execute("svc", () => Promise.reject(new Error("fail"))).catch(() => {});
  await assertRejects(
    () => m.execute("svc", () => Promise.resolve(1)),
    CircuitOpenError,
  );
});

Deno.test("manager.allStats returns one entry per known breaker", () => {
  const m = new CircuitBreakerManager();
  m.getOrCreate("alpha");
  m.getOrCreate("beta");
  assertEquals(m.allStats().length, 2);
});

Deno.test("manager.resetAll resets every breaker", async () => {
  const m = new CircuitBreakerManager({
    failureThreshold: 1,
    openDurationMs: 60_000,
    successThreshold: 3,
  });
  await m.execute("svc", () => Promise.reject(new Error("fail"))).catch(() => {});
  assertEquals(m.getOrCreate("svc").state(), "open");
  m.resetAll();
  assertEquals(m.getOrCreate("svc").state(), "closed");
});
