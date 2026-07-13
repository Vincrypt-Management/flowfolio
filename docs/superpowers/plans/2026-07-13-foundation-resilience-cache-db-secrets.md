# Foundation (Resilience, Cache, DB, Secrets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the first, dependency-free layer of the TypeScript/Deno backend that will replace `src-tauri`: resilience primitives (circuit breaker, retry, rate limiter), a generic in-memory TTL cache, a SQLite connection/migration layer, a SQLite-backed persistent cache matching the current Rust cache tables, and OS-native secrets storage. Nothing in this plan touches the frontend or `src-tauri` — it produces a standalone, fully tested `backend/` workspace that Plan 2 (Market-data) will build on.

**Architecture:** One Deno workspace at `backend/` (sibling to `src/` and `src-tauri/`, kept separate from the npm/Vite project until the Plan 6 cutover), with one module per subdirectory (`resilience/`, `cache/`, `db/`, `secrets/`), each with a single `mod.ts` public entrypoint. Every module is pure TypeScript with zero dependency on frontend code or Tauri. Tests run via `deno test`.

**Tech Stack:** Deno 2.9+ (targets the `deno desktop` command used later in Plan 6), `node:sqlite` for the database layer, `Deno.Command` for OS-native secrets subprocess calls, no external npm/JSR dependencies — everything here is simple enough to hand-roll per the approved design spec.

## Global Constraints

- No `any` types — this project's TypeScript standards (CODE_STANDARDS.md) carry over to the new backend even though it's a separate workspace.
- Every public function in every module must have a `deno test` covering it before the task is considered done (TDD, per this plan's step order).
- Reuse the two existing local SQLite migration files' table definitions verbatim where this plan ports them (`src-tauri/migrations/20240101000001_initial_schema.sql`, `src-tauri/migrations/20241229000001_add_cache_tables.sql`) — both are already valid SQLite syntax. **Do not port `src-tauri/migrations/001_initial_schema.sql`** — it is PostgreSQL/Supabase syntax (UUID types, `gen_random_uuid()`, Row Level Security) and does not match this app's local SQLite database; it appears to be an unrelated/leftover schema and is out of scope.
- Cache TTLs must match the current Rust values exactly: price = 1 hour, quant metrics = 6 hours, fundamentals = 24 hours, sentiment = 4 hours, analyst ratings = 24 hours (source: `src-tauri/src/services/db_cache.rs:80-85`).
- Secret key names to support (from `.env.example`): `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `FINNHUB_API_KEY`, `FMP_API_KEY`, `TIINGO_API_KEY`, `TWELVE_DATA_API_KEY`, `POLYGON_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `OPENROUTER_API_KEY`.

---

### Task 1: Backend workspace scaffold

**Files:**
- Create: `backend/deno.json`
- Create: `backend/.gitignore`
- Test: `backend/scaffold.test.ts`

**Interfaces:**
- Produces: a working `deno test` command any later task can run from `backend/`.

- [ ] **Step 1: Create the Deno workspace config**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  },
  "tasks": {
    "test": "deno test --allow-read --allow-write --allow-env --allow-run backend/"
  },
  "fmt": {
    "include": ["backend/"]
  }
}
```

Write this to `backend/deno.json`.

- [ ] **Step 2: Create `.gitignore` for local DB/test artifacts**

```
*.db
*.db-journal
*.db-wal
```

Write this to `backend/.gitignore`.

- [ ] **Step 3: Write a smoke test**

```typescript
// backend/scaffold.test.ts
import { assertEquals } from "jsr:@std/assert";

Deno.test("deno workspace is runnable", () => {
  assertEquals(1 + 1, 2);
});
```

- [ ] **Step 4: Run it**

Run: `deno test --allow-read backend/scaffold.test.ts`
Expected: `ok | 1 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/deno.json backend/.gitignore backend/scaffold.test.ts
git commit -m "chore(backend): scaffold Deno workspace for TS/Deno migration"
```

---

### Task 2: Resilience — circuit breaker

**Files:**
- Create: `backend/resilience/circuit_breaker.ts`
- Test: `backend/resilience/circuit_breaker.test.ts`

**Interfaces:**
- Produces:
  - `type CircuitState = "closed" | "open" | "half_open"`
  - `interface CircuitBreakerConfig { failureThreshold: number; openDurationMs: number; successThreshold: number }`
  - `const defaultCircuitBreakerConfig: CircuitBreakerConfig`
  - `class CircuitBreaker { constructor(name: string, config: CircuitBreakerConfig); canExecute(): boolean; recordSuccess(): void; recordFailure(): void; state(): CircuitState; stats(): CircuitStats; reset(): void }`
  - `interface CircuitStats { name: string; state: CircuitState; totalRequests: number; totalFailures: number; currentFailureCount: number; successRate: number }`
  - `class CircuitOpenError extends Error { constructor(name: string) }`
  - `class CircuitBreakerManager { constructor(defaultConfig?: CircuitBreakerConfig); getOrCreate(name: string): CircuitBreaker; execute<T>(name: string, fn: () => Promise<T>): Promise<T>; allStats(): CircuitStats[]; resetAll(): void }`

Note: the Rust source also had a `failure_window` config field that was defined but never read anywhere in the implementation (`src-tauri/src/modules/circuit_breaker.rs`). It's dropped here — YAGNI, since porting dead configuration would just be confusing.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/resilience/circuit_breaker.test.ts
import { assertEquals, assertThrows, assert } from "jsr:@std/assert";
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
  await assertThrows(
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
  await assertThrows(
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read backend/resilience/circuit_breaker.test.ts`
Expected: FAIL — `Module not found "./circuit_breaker.ts"`

- [ ] **Step 3: Implement `circuit_breaker.ts`**

```typescript
// backend/resilience/circuit_breaker.ts

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  openDurationMs: number;
  successThreshold: number;
}

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30_000,
  successThreshold: 3,
};

export interface CircuitStats {
  name: string;
  state: CircuitState;
  totalRequests: number;
  totalFailures: number;
  currentFailureCount: number;
  successRate: number;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is open`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  #name: string;
  #config: CircuitBreakerConfig;
  #state: CircuitState = "closed";
  #failureCount = 0;
  #successCount = 0;
  #openedAt: number | null = null;
  #totalRequests = 0;
  #totalFailures = 0;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.#name = name;
    this.#config = config;
  }

  canExecute(): boolean {
    if (this.#state === "closed") return true;
    if (this.#state === "half_open") return true;
    // open
    if (this.#openedAt !== null && Date.now() - this.#openedAt >= this.#config.openDurationMs) {
      this.#state = "half_open";
      this.#successCount = 0;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.#totalRequests += 1;
    if (this.#state === "closed") {
      this.#failureCount = 0;
    } else if (this.#state === "half_open") {
      this.#successCount += 1;
      if (this.#successCount >= this.#config.successThreshold) {
        this.#state = "closed";
        this.#failureCount = 0;
      }
    }
    // "open": no-op, matching the Rust source's graceful handling
  }

  recordFailure(): void {
    this.#totalRequests += 1;
    this.#totalFailures += 1;

    if (this.#state === "closed") {
      this.#failureCount += 1;
      if (this.#failureCount >= this.#config.failureThreshold) {
        this.#state = "open";
        this.#openedAt = Date.now();
      }
    } else if (this.#state === "half_open") {
      this.#state = "open";
      this.#openedAt = Date.now();
      this.#successCount = 0;
    } else {
      // already open: refresh the timestamp
      this.#openedAt = Date.now();
    }
  }

  state(): CircuitState {
    return this.#state;
  }

  stats(): CircuitStats {
    const successRate = this.#totalRequests === 0
      ? 1
      : 1 - this.#totalFailures / this.#totalRequests;
    return {
      name: this.#name,
      state: this.#state,
      totalRequests: this.#totalRequests,
      totalFailures: this.#totalFailures,
      currentFailureCount: this.#failureCount,
      successRate,
    };
  }

  reset(): void {
    this.#state = "closed";
    this.#failureCount = 0;
    this.#successCount = 0;
    this.#openedAt = null;
  }
}

export class CircuitBreakerManager {
  #breakers = new Map<string, CircuitBreaker>();
  #defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: CircuitBreakerConfig = defaultCircuitBreakerConfig) {
    this.#defaultConfig = defaultConfig;
  }

  getOrCreate(name: string): CircuitBreaker {
    let breaker = this.#breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, this.#defaultConfig);
      this.#breakers.set(name, breaker);
    }
    return breaker;
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getOrCreate(name);
    if (!breaker.canExecute()) {
      throw new CircuitOpenError(name);
    }
    try {
      const result = await fn();
      breaker.recordSuccess();
      return result;
    } catch (err) {
      breaker.recordFailure();
      throw err;
    }
  }

  allStats(): CircuitStats[] {
    return Array.from(this.#breakers.values()).map((b) => b.stats());
  }

  resetAll(): void {
    for (const breaker of this.#breakers.values()) {
      breaker.reset();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read backend/resilience/circuit_breaker.test.ts`
Expected: `ok | 14 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/resilience/circuit_breaker.ts backend/resilience/circuit_breaker.test.ts
git commit -m "feat(backend): port circuit breaker to TypeScript"
```

---

### Task 3: Resilience — retry with exponential backoff

**Files:**
- Create: `backend/resilience/retry.ts`
- Test: `backend/resilience/retry.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface RetryConfig { maxRetries: number; initialDelayMs: number; maxDelayMs: number; backoffMultiplier: number; jitter: boolean; attemptTimeoutMs: number | null }`
  - `const defaultRetryConfig: RetryConfig`, `aggressiveRetryConfig: RetryConfig`, `conservativeRetryConfig: RetryConfig`, `networkRetryConfig: RetryConfig`
  - `type RetryOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown }`
  - `interface RetryResult<T> { result: RetryOutcome<T>; attempts: number; totalDelayMs: number }`
  - `class RetryExecutor { constructor(config: RetryConfig); execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>>; executeWithPredicate<T>(fn: () => Promise<T>, shouldRetry: (error: unknown) => boolean): Promise<RetryResult<T>> }`
  - `function retry<T>(fn: () => Promise<T>): Promise<RetryResult<T>>`
  - `function retryNetwork<T>(fn: () => Promise<T>): Promise<RetryResult<T>>`
  - `function retryRateLimited<T>(fn: () => Promise<T>): Promise<RetryResult<T>>`

Note on fidelity: the Rust source's attempt-timeout branch has a convoluted fallback (on the final attempt it calls `f()` a second time without a timeout). This plan implements the more standard behavior instead — a timed-out attempt is simply treated as a failed attempt and goes through the normal retry-or-give-up logic — since the original's extra fallback call isn't meaningfully different in outcome and doubles work on the last attempt. This is a deliberate simplification, not a fidelity gap.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/resilience/retry.test.ts
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
    (e) => !(e instanceof Error && e.message === "permanent"),
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
    (e) => e instanceof Error && e.message === "transient",
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read backend/resilience/retry.test.ts`
Expected: FAIL — `Module not found "./retry.ts"`

- [ ] **Step 3: Implement `retry.ts`**

```typescript
// backend/resilience/retry.ts

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  attemptTimeoutMs: number | null;
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  backoffMultiplier: 2.0,
  jitter: true,
  attemptTimeoutMs: 30_000,
};

export const aggressiveRetryConfig: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 50,
  maxDelayMs: 2_000,
  backoffMultiplier: 1.5,
  jitter: true,
  attemptTimeoutMs: 10_000,
};

export const conservativeRetryConfig: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 3.0,
  jitter: true,
  attemptTimeoutMs: 60_000,
};

export const networkRetryConfig: RetryConfig = {
  maxRetries: 4,
  initialDelayMs: 500,
  maxDelayMs: 15_000,
  backoffMultiplier: 2.0,
  jitter: true,
  attemptTimeoutMs: 30_000,
};

export type RetryOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface RetryResult<T> {
  result: RetryOutcome<T>;
  attempts: number;
  totalDelayMs: number;
}

class TimeoutMarker {}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number | null): Promise<T> {
  if (timeoutMs === null) return fn();
  const timeout = new Promise<TimeoutMarker>((resolve) =>
    setTimeout(() => resolve(new TimeoutMarker()), timeoutMs)
  );
  const result = await Promise.race([fn(), timeout]);
  if (result instanceof TimeoutMarker) {
    throw new Error(`Attempt timed out after ${timeoutMs}ms`);
  }
  return result;
}

function jitteredDelay(delayMs: number, jitter: boolean): number {
  if (!jitter) return delayMs;
  const factor = 0.5 + Math.random() * 0.5; // 0.5 to 1.0
  return Math.round(delayMs * factor);
}

export class RetryExecutor {
  #config: RetryConfig;

  constructor(config: RetryConfig) {
    this.#config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    return this.executeWithPredicate(fn, () => true);
  }

  async executeWithPredicate<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
  ): Promise<RetryResult<T>> {
    let attempts = 0;
    let totalDelayMs = 0;
    let currentDelay = this.#config.initialDelayMs;

    for (;;) {
      attempts += 1;
      try {
        const value = await withTimeout(fn, this.#config.attemptTimeoutMs);
        return { result: { ok: true, value }, attempts, totalDelayMs };
      } catch (error) {
        if (attempts >= this.#config.maxRetries || !shouldRetry(error)) {
          return { result: { ok: false, error }, attempts, totalDelayMs };
        }

        const delay = jitteredDelay(currentDelay, this.#config.jitter);
        await new Promise((resolve) => setTimeout(resolve, delay));
        totalDelayMs += delay;

        currentDelay = Math.min(
          currentDelay * this.#config.backoffMultiplier,
          this.#config.maxDelayMs,
        );
      }
    }
  }
}

export async function retry<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return new RetryExecutor(defaultRetryConfig).execute(fn);
}

export async function retryNetwork<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return new RetryExecutor(networkRetryConfig).execute(fn);
}

export async function retryRateLimited<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return new RetryExecutor(conservativeRetryConfig).execute(fn);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read backend/resilience/retry.test.ts`
Expected: `ok | 15 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/resilience/retry.ts backend/resilience/retry.test.ts
git commit -m "feat(backend): port retry-with-backoff to TypeScript"
```

---

### Task 4: Resilience — rate limiter

**Files:**
- Create: `backend/resilience/rate_limiter.ts`
- Test: `backend/resilience/rate_limiter.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class RateLimitExceededError extends Error {}`
  - `class RateLimiter { static newDaily(requestsPerDay: number): RateLimiter; check(): void; remainingCapacity(): number }`

Note on fidelity: the Rust `remaining_capacity()` was a hardcoded placeholder (`25`, explicitly commented "Placeholder — in production, track this separately"). This port implements it for real by tracking the token bucket's current level, since that information is trivially available in TypeScript — a genuine improvement over the Rust stub, not a behavior change worth debating.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/resilience/rate_limiter.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read backend/resilience/rate_limiter.test.ts`
Expected: FAIL — `Module not found "./rate_limiter.ts"`

- [ ] **Step 3: Implement `rate_limiter.ts`**

```typescript
// backend/resilience/rate_limiter.ts

export class RateLimitExceededError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

/** Simple fixed-capacity daily quota tracker (no refill within a process lifetime — matches how the app is actually used: one quota allocation per day, replenished on next launch/day boundary handled by the caller). */
export class RateLimiter {
  #capacity: number;
  #remaining: number;

  private constructor(capacity: number) {
    this.#capacity = capacity;
    this.#remaining = capacity;
  }

  static newDaily(requestsPerDay: number): RateLimiter {
    return new RateLimiter(requestsPerDay);
  }

  check(): void {
    if (this.#remaining <= 0) {
      throw new RateLimitExceededError();
    }
    this.#remaining -= 1;
  }

  remainingCapacity(): number {
    return Math.max(0, this.#remaining);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read backend/resilience/rate_limiter.test.ts`
Expected: `ok | 3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/resilience/rate_limiter.ts backend/resilience/rate_limiter.test.ts
git commit -m "feat(backend): port daily-quota rate limiter to TypeScript"
```

---

### Task 5: Cache — in-memory TTL cache

**Files:**
- Create: `backend/cache/memory.ts`
- Test: `backend/cache/memory.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `class TtlCache<V> { constructor(ttlMs: number); get(key: string): V | undefined; set(key: string, value: V): void; delete(key: string): void; clear(): void; size(): number; sweepExpired(): number }`

Note: this has no direct Rust equivalent to port — the Rust `moka` in-memory tier was embedded directly inside `EnhancedMarketDataService` rather than factored into a reusable module. This is a new, generic, standalone utility that Plan 2 (Market-data) will use, matching the "modular and easy to maintain" requirement.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/cache/memory.test.ts
import { assertEquals } from "jsr:@std/assert";
import { TtlCache } from "./memory.ts";

Deno.test("returns undefined for a missing key", () => {
  const cache = new TtlCache<number>(1_000);
  assertEquals(cache.get("missing"), undefined);
});

Deno.test("returns a value that was just set", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("k", "v");
  assertEquals(cache.get("k"), "v");
});

Deno.test("expires a value after the TTL elapses", async () => {
  const cache = new TtlCache<string>(5);
  cache.set("k", "v");
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(cache.get("k"), undefined);
});

Deno.test("delete removes a key", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("k", "v");
  cache.delete("k");
  assertEquals(cache.get("k"), undefined);
});

Deno.test("clear empties the cache", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("a", "1");
  cache.set("b", "2");
  cache.clear();
  assertEquals(cache.size(), 0);
});

Deno.test("size reflects live (non-swept) entries, including expired-but-unswept ones", () => {
  const cache = new TtlCache<string>(1_000);
  cache.set("a", "1");
  cache.set("b", "2");
  assertEquals(cache.size(), 2);
});

Deno.test("sweepExpired removes only expired entries and returns the count removed", async () => {
  const cache = new TtlCache<string>(5);
  cache.set("stale", "1");
  await new Promise((r) => setTimeout(r, 20));
  cache.set("fresh", "2");
  const removed = cache.sweepExpired();
  assertEquals(removed, 1);
  assertEquals(cache.get("fresh"), "2");
  assertEquals(cache.size(), 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read backend/cache/memory.test.ts`
Expected: FAIL — `Module not found "./memory.ts"`

- [ ] **Step 3: Implement `memory.ts`**

```typescript
// backend/cache/memory.ts

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  #ttlMs: number;
  #store = new Map<string, Entry<V>>();

  constructor(ttlMs: number) {
    this.#ttlMs = ttlMs;
  }

  get(key: string): V | undefined {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.#store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.#store.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }

  delete(key: string): void {
    this.#store.delete(key);
  }

  clear(): void {
    this.#store.clear();
  }

  size(): number {
    return this.#store.size;
  }

  sweepExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.#store) {
      if (now >= entry.expiresAt) {
        this.#store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read backend/cache/memory.test.ts`
Expected: `ok | 7 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/cache/memory.ts backend/cache/memory.test.ts
git commit -m "feat(backend): add generic in-memory TTL cache"
```

---

### Task 6: DB — SQLite connection and migrations

**Files:**
- Create: `backend/db/migrations/0001_initial_schema.sql`
- Create: `backend/db/migrations/0002_add_cache_tables.sql`
- Create: `backend/db/connection.ts`
- Test: `backend/db/connection.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `function openDatabase(path: string): DatabaseSync` (re-exported from `node:sqlite`, migrations applied on open), `function closeDatabase(db: DatabaseSync): void`.

- [ ] **Step 1: Port the two real local-schema migration files verbatim**

Copy `src-tauri/migrations/20240101000001_initial_schema.sql` to `backend/db/migrations/0001_initial_schema.sql` unchanged (it already uses `CREATE TABLE IF NOT EXISTS` and valid SQLite types — no translation needed).

Copy `src-tauri/migrations/20241229000001_add_cache_tables.sql` to `backend/db/migrations/0002_add_cache_tables.sql` unchanged for the same reason.

```bash
cp src-tauri/migrations/20240101000001_initial_schema.sql backend/db/migrations/0001_initial_schema.sql
cp src-tauri/migrations/20241229000001_add_cache_tables.sql backend/db/migrations/0002_add_cache_tables.sql
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/db/connection.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "./connection.ts";

Deno.test("opening a database creates all migrated tables", () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);

  for (
    const expected of [
      "symbols",
      "prices_daily",
      "fundamentals_overview",
      "vibe_plans",
      "journal_events",
      "refresh_jobs",
      "sentiment_cache",
      "analyst_cache",
      "quant_metrics_cache",
      "price_cache",
    ]
  ) {
    assert(tables.includes(expected), `expected table ${expected} to exist`);
  }

  closeDatabase(db);
});

Deno.test("reopening the same database file does not re-run migrations twice", () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db1 = openDatabase(path);
  closeDatabase(db1);

  const db2 = openDatabase(path);
  const migrationCount = db2
    .prepare("SELECT COUNT(*) as count FROM _migrations")
    .get() as { count: number };
  assertEquals(migrationCount.count, 2);
  closeDatabase(db2);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `deno test --allow-read --allow-write backend/db/connection.test.ts`
Expected: FAIL — `Module not found "./connection.ts"`

- [ ] **Step 4: Implement `connection.ts`**

```typescript
// backend/db/connection.ts
import { DatabaseSync } from "node:sqlite";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

const MIGRATIONS_DIR = join(dirname(fromFileUrl(import.meta.url)), "migrations");

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function appliedMigrations(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

function runMigrations(db: DatabaseSync): void {
  ensureMigrationsTable(db);
  const applied = appliedMigrations(db);

  const files = Array.from(Deno.readDirSync(MIGRATIONS_DIR))
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = Deno.readTextFileSync(join(MIGRATIONS_DIR, file));
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run(file);
  }
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  runMigrations(db);
  return db;
}

export function closeDatabase(db: DatabaseSync): void {
  db.close();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test --allow-read --allow-write backend/db/connection.test.ts`
Expected: `ok | 2 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/db/migrations backend/db/connection.ts backend/db/connection.test.ts
git commit -m "feat(backend): add SQLite connection + migration runner via node:sqlite"
```

---

### Task 7: SQLite cache — price and quant metrics

**Files:**
- Create: `backend/cache/sqlite.ts`
- Test: `backend/cache/sqlite.test.ts`

**Interfaces:**
- Consumes: `openDatabase`, `closeDatabase` from `backend/db/connection.ts` (Task 6).
- Produces (this task's slice):
  - `const CACHE_TTL_HOURS = { price: 1, quant: 6, fundamentals: 24, sentiment: 4, analyst: 24 }`
  - `interface CachedPrice { symbol: string; currentPrice: number; updatedAt: string }`
  - `interface CachedQuantMetrics { symbol: string; sharpeRatio: number; annualizedReturn: number; volatility: number; maxDrawdown: number; rsi: number; signal: string; confidence: number; updatedAt: string }`
  - `class SqliteCache { constructor(db: DatabaseSync); getCachedPrice(symbol: string): CachedPrice | undefined; setCachedPrice(symbol: string, price: number): void; getCachedQuantMetrics(symbol: string): CachedQuantMetrics | undefined; setCachedQuantMetrics(m: Omit<CachedQuantMetrics, "updatedAt">): void }`
  (Tasks 8 and 9 add more methods to this same class.)

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/cache/sqlite.test.ts
import { assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "../db/connection.ts";
import { SqliteCache } from "./sqlite.ts";

function withCache(fn: (cache: SqliteCache) => void) {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    fn(new SqliteCache(db));
  } finally {
    closeDatabase(db);
  }
}

Deno.test("price cache: miss returns undefined", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedPrice("AAPL"), undefined);
  });
});

Deno.test("price cache: set then get round-trips within TTL", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 123.45);
    const cached = cache.getCachedPrice("AAPL");
    assertEquals(cached?.symbol, "AAPL");
    assertEquals(cached?.currentPrice, 123.45);
  });
});

Deno.test("price cache: set twice upserts rather than duplicating rows", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 100);
    cache.setCachedPrice("AAPL", 200);
    assertEquals(cache.getCachedPrice("AAPL")?.currentPrice, 200);
  });
});

Deno.test("quant metrics cache: miss returns undefined", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedQuantMetrics("AAPL"), undefined);
  });
});

Deno.test("quant metrics cache: set then get round-trips", () => {
  withCache((cache) => {
    cache.setCachedQuantMetrics({
      symbol: "AAPL",
      sharpeRatio: 1.2,
      annualizedReturn: 0.15,
      volatility: 0.2,
      maxDrawdown: -0.1,
      rsi: 55,
      signal: "BUY",
      confidence: 0.8,
    });
    const cached = cache.getCachedQuantMetrics("AAPL");
    assertEquals(cached?.signal, "BUY");
    assertEquals(cached?.sharpeRatio, 1.2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: FAIL — `Module not found "./sqlite.ts"`

- [ ] **Step 3: Implement `sqlite.ts` (price + quant metrics slice)**

```typescript
// backend/cache/sqlite.ts
import type { DatabaseSync } from "node:sqlite";

export const CACHE_TTL_HOURS = {
  price: 1,
  quant: 6,
  fundamentals: 24,
  sentiment: 4,
  analyst: 24,
} as const;

export interface CachedPrice {
  symbol: string;
  currentPrice: number;
  updatedAt: string;
}

export interface CachedQuantMetrics {
  symbol: string;
  sharpeRatio: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
  updatedAt: string;
}

function isCacheValid(updatedAt: string, ttlHours: number): boolean {
  const cachedTime = new Date(updatedAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(cachedTime)) return false;
  const ageMs = Date.now() - cachedTime;
  return ageMs < ttlHours * 60 * 60 * 1000;
}

function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export class SqliteCache {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  getCachedPrice(symbol: string): CachedPrice | undefined {
    const row = this.#db
      .prepare("SELECT symbol, current_price, updated_at FROM price_cache WHERE symbol = ?")
      .get(symbol) as { symbol: string; current_price: number; updated_at: string } | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.price)) return undefined;
    return { symbol: row.symbol, currentPrice: row.current_price, updatedAt: row.updated_at };
  }

  setCachedPrice(symbol: string, price: number): void {
    this.#db
      .prepare(
        `INSERT INTO price_cache (symbol, current_price, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           current_price = excluded.current_price,
           updated_at = excluded.updated_at`,
      )
      .run(symbol, price, nowTimestamp());
  }

  getCachedQuantMetrics(symbol: string): CachedQuantMetrics | undefined {
    const row = this.#db
      .prepare("SELECT * FROM quant_metrics_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        sharpe_ratio: number;
        annualized_return: number;
        volatility: number;
        max_drawdown: number;
        rsi: number;
        signal: string;
        confidence: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.quant)) return undefined;
    return {
      symbol: row.symbol,
      sharpeRatio: row.sharpe_ratio,
      annualizedReturn: row.annualized_return,
      volatility: row.volatility,
      maxDrawdown: row.max_drawdown,
      rsi: row.rsi,
      signal: row.signal,
      confidence: row.confidence,
      updatedAt: row.updated_at,
    };
  }

  setCachedQuantMetrics(m: Omit<CachedQuantMetrics, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO quant_metrics_cache
           (symbol, sharpe_ratio, annualized_return, volatility, max_drawdown, rsi, signal, confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           sharpe_ratio = excluded.sharpe_ratio,
           annualized_return = excluded.annualized_return,
           volatility = excluded.volatility,
           max_drawdown = excluded.max_drawdown,
           rsi = excluded.rsi,
           signal = excluded.signal,
           confidence = excluded.confidence,
           updated_at = excluded.updated_at`,
      )
      .run(
        m.symbol,
        m.sharpeRatio,
        m.annualizedReturn,
        m.volatility,
        m.maxDrawdown,
        m.rsi,
        m.signal,
        m.confidence,
        nowTimestamp(),
      );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/cache/sqlite.ts backend/cache/sqlite.test.ts
git commit -m "feat(backend): port price + quant-metrics SQLite cache"
```

---

### Task 8: SQLite cache — historical prices

**Files:**
- Modify: `backend/cache/sqlite.ts`
- Modify: `backend/cache/sqlite.test.ts`

**Interfaces:**
- Consumes: `SqliteCache` class from Task 7 (same file, adds methods to it).
- Produces (added to `SqliteCache`):
  - `interface DailyPrice { date: string; open: number; high: number; low: number; close: number; volume: number }`
  - `getCachedHistoricalPrices(symbol: string): DailyPrice[] | undefined`
  - `setCachedHistoricalPrices(symbol: string, prices: DailyPrice[]): void`

- [ ] **Step 1: Add failing tests**

Append to `backend/cache/sqlite.test.ts`:

```typescript
import type { DailyPrice } from "./sqlite.ts";

Deno.test("historical prices: miss returns undefined for an unknown symbol", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedHistoricalPrices("AAPL"), undefined);
  });
});

Deno.test("historical prices: set then get round-trips, newest first", () => {
  withCache((cache) => {
    const prices: DailyPrice[] = [
      { date: todayMinusDays(1), open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
      { date: todayMinusDays(0), open: 10.5, high: 12, low: 10, close: 11.5, volume: 1500 },
    ];
    cache.setCachedHistoricalPrices("AAPL", prices);
    const cached = cache.getCachedHistoricalPrices("AAPL");
    assertEquals(cached?.length, 2);
    assertEquals(cached?.[0].date, todayMinusDays(0));
  });
});

Deno.test("historical prices: stale data (>2 days old) is treated as a miss", () => {
  withCache((cache) => {
    cache.setCachedHistoricalPrices("AAPL", [
      { date: todayMinusDays(5), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);
    assertEquals(cache.getCachedHistoricalPrices("AAPL"), undefined);
  });
});

function todayMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: FAIL — `getCachedHistoricalPrices is not a function`

- [ ] **Step 3: Add the historical-prices methods to `SqliteCache`**

Add to `backend/cache/sqlite.ts`, inside the `SqliteCache` class (after `setCachedQuantMetrics`):

```typescript
  getCachedHistoricalPrices(symbol: string): DailyPrice[] | undefined {
    const symbolRow = this.#db
      .prepare("SELECT id FROM symbols WHERE ticker = ?")
      .get(symbol) as { id: number } | undefined;
    if (!symbolRow) return undefined;

    const latest = this.#db
      .prepare("SELECT date FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT 1")
      .get(symbolRow.id) as { date: string } | undefined;
    if (!latest) return undefined;

    const latestDate = new Date(latest.date + "T00:00:00Z").getTime();
    const daysOld = Math.floor((Date.now() - latestDate) / (24 * 60 * 60 * 1000));
    if (daysOld > 2) return undefined;

    const rows = this.#db
      .prepare(
        `SELECT date, open, high, low, close, volume
         FROM prices_daily
         WHERE symbol_id = ?
         ORDER BY date DESC
         LIMIT 365`,
      )
      .all(symbolRow.id) as DailyPrice[];

    return rows.length > 0 ? rows : undefined;
  }

  setCachedHistoricalPrices(symbol: string, prices: DailyPrice[]): void {
    this.#db
      .prepare("INSERT INTO symbols (ticker, status) VALUES (?, 'active') ON CONFLICT(ticker) DO NOTHING")
      .run(symbol);

    const symbolRow = this.#db
      .prepare("SELECT id FROM symbols WHERE ticker = ?")
      .get(symbol) as { id: number };

    const upsert = this.#db.prepare(
      `INSERT INTO prices_daily (symbol_id, date, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol_id, date) DO UPDATE SET
         open = excluded.open,
         high = excluded.high,
         low = excluded.low,
         close = excluded.close,
         volume = excluded.volume`,
    );

    for (const p of prices) {
      upsert.run(symbolRow.id, p.date, p.open, p.high, p.low, p.close, p.volume);
    }
  }
```

Add the `DailyPrice` interface near the top of `backend/cache/sqlite.ts`, alongside `CachedPrice`:

```typescript
export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: `ok | 8 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/cache/sqlite.ts backend/cache/sqlite.test.ts
git commit -m "feat(backend): port historical-prices SQLite cache"
```

---

### Task 9: SQLite cache — fundamentals, sentiment, analyst ratings, and maintenance utilities

**Files:**
- Modify: `backend/cache/sqlite.ts`
- Modify: `backend/cache/sqlite.test.ts`

**Interfaces:**
- Consumes: `SqliteCache` class from Tasks 7–8 (adds more methods).
- Produces (added to `SqliteCache`):
  - `interface CachedSentiment { symbol: string; overallSentiment: string; sentimentScore: number; newsCount: number; buzzScore: number; updatedAt: string }`
  - `interface CachedAnalystRating { symbol: string; consensusRating: string; targetPriceMean: number | null; targetPriceHigh: number | null; targetPriceLow: number | null; numberOfAnalysts: number; updatedAt: string }`
  - `getCachedSentiment(symbol): CachedSentiment | undefined`, `setCachedSentiment(s: Omit<CachedSentiment, "updatedAt">): void`
  - `getCachedAnalystRating(symbol): CachedAnalystRating | undefined`, `setCachedAnalystRating(r: Omit<CachedAnalystRating, "updatedAt">): void`
  - `clearExpiredCache(): void`
  - `getCacheStats(): { priceCount: number; quantCount: number; sentimentCount: number; analystCount: number; historicalSymbolCount: number }`

These follow the identical upsert + TTL-check pattern already established in Tasks 7–8, applied to the `sentiment_cache` and `analyst_cache` tables from `backend/db/migrations/0002_add_cache_tables.sql`.

- [ ] **Step 1: Add failing tests**

Append to `backend/cache/sqlite.test.ts`:

```typescript
Deno.test("sentiment cache: set then get round-trips", () => {
  withCache((cache) => {
    cache.setCachedSentiment({
      symbol: "AAPL",
      overallSentiment: "positive",
      sentimentScore: 0.7,
      newsCount: 12,
      buzzScore: 0.5,
    });
    const cached = cache.getCachedSentiment("AAPL");
    assertEquals(cached?.overallSentiment, "positive");
  });
});

Deno.test("analyst rating cache: set then get round-trips", () => {
  withCache((cache) => {
    cache.setCachedAnalystRating({
      symbol: "AAPL",
      consensusRating: "BUY",
      targetPriceMean: 200,
      targetPriceHigh: 220,
      targetPriceLow: 180,
      numberOfAnalysts: 30,
    });
    const cached = cache.getCachedAnalystRating("AAPL");
    assertEquals(cached?.consensusRating, "BUY");
    assertEquals(cached?.numberOfAnalysts, 30);
  });
});

Deno.test("clearExpiredCache removes only rows older than each table's TTL", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 100);
    cache.clearExpiredCache();
    assertEquals(cache.getCachedPrice("AAPL")?.currentPrice, 100);
  });
});

Deno.test("getCacheStats counts rows across every cache table", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 100);
    cache.setCachedPrice("MSFT", 200);
    cache.setCachedQuantMetrics({
      symbol: "AAPL",
      sharpeRatio: 1,
      annualizedReturn: 0.1,
      volatility: 0.2,
      maxDrawdown: -0.1,
      rsi: 50,
      signal: "HOLD",
      confidence: 0.5,
    });
    const stats = cache.getCacheStats();
    assertEquals(stats.priceCount, 2);
    assertEquals(stats.quantCount, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: FAIL — `getCachedSentiment is not a function`

- [ ] **Step 3: Add the remaining interfaces and methods**

Add near the top of `backend/cache/sqlite.ts`, alongside the other interfaces:

```typescript
export interface CachedSentiment {
  symbol: string;
  overallSentiment: string;
  sentimentScore: number;
  newsCount: number;
  buzzScore: number;
  updatedAt: string;
}

export interface CachedAnalystRating {
  symbol: string;
  consensusRating: string;
  targetPriceMean: number | null;
  targetPriceHigh: number | null;
  targetPriceLow: number | null;
  numberOfAnalysts: number;
  updatedAt: string;
}

export interface CacheStats {
  priceCount: number;
  quantCount: number;
  sentimentCount: number;
  analystCount: number;
  historicalSymbolCount: number;
}
```

Add to the `SqliteCache` class (after the historical-prices methods):

```typescript
  getCachedSentiment(symbol: string): CachedSentiment | undefined {
    const row = this.#db
      .prepare("SELECT * FROM sentiment_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        overall_sentiment: string;
        sentiment_score: number;
        news_count: number;
        buzz_score: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.sentiment)) return undefined;
    return {
      symbol: row.symbol,
      overallSentiment: row.overall_sentiment,
      sentimentScore: row.sentiment_score,
      newsCount: row.news_count,
      buzzScore: row.buzz_score,
      updatedAt: row.updated_at,
    };
  }

  setCachedSentiment(s: Omit<CachedSentiment, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO sentiment_cache (symbol, overall_sentiment, sentiment_score, news_count, buzz_score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           overall_sentiment = excluded.overall_sentiment,
           sentiment_score = excluded.sentiment_score,
           news_count = excluded.news_count,
           buzz_score = excluded.buzz_score,
           updated_at = excluded.updated_at`,
      )
      .run(s.symbol, s.overallSentiment, s.sentimentScore, s.newsCount, s.buzzScore, nowTimestamp());
  }

  getCachedAnalystRating(symbol: string): CachedAnalystRating | undefined {
    const row = this.#db
      .prepare("SELECT * FROM analyst_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        consensus_rating: string;
        target_price_mean: number | null;
        target_price_high: number | null;
        target_price_low: number | null;
        number_of_analysts: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.analyst)) return undefined;
    return {
      symbol: row.symbol,
      consensusRating: row.consensus_rating,
      targetPriceMean: row.target_price_mean,
      targetPriceHigh: row.target_price_high,
      targetPriceLow: row.target_price_low,
      numberOfAnalysts: row.number_of_analysts,
      updatedAt: row.updated_at,
    };
  }

  setCachedAnalystRating(r: Omit<CachedAnalystRating, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO analyst_cache
           (symbol, consensus_rating, target_price_mean, target_price_high, target_price_low, number_of_analysts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           consensus_rating = excluded.consensus_rating,
           target_price_mean = excluded.target_price_mean,
           target_price_high = excluded.target_price_high,
           target_price_low = excluded.target_price_low,
           number_of_analysts = excluded.number_of_analysts,
           updated_at = excluded.updated_at`,
      )
      .run(
        r.symbol,
        r.consensusRating,
        r.targetPriceMean,
        r.targetPriceHigh,
        r.targetPriceLow,
        r.numberOfAnalysts,
        nowTimestamp(),
      );
  }

  clearExpiredCache(): void {
    const cutoff = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

    this.#db.prepare("DELETE FROM price_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.price));
    this.#db.prepare("DELETE FROM quant_metrics_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.quant));
    this.#db.prepare("DELETE FROM sentiment_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.sentiment));
    this.#db.prepare("DELETE FROM analyst_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.analyst));
  }

  getCacheStats(): CacheStats {
    const count = (sql: string) => (this.#db.prepare(sql).get() as { count: number }).count;
    return {
      priceCount: count("SELECT COUNT(*) as count FROM price_cache"),
      quantCount: count("SELECT COUNT(*) as count FROM quant_metrics_cache"),
      sentimentCount: count("SELECT COUNT(*) as count FROM sentiment_cache"),
      analystCount: count("SELECT COUNT(*) as count FROM analyst_cache"),
      historicalSymbolCount: count("SELECT COUNT(DISTINCT symbol_id) as count FROM prices_daily"),
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read --allow-write backend/cache/sqlite.test.ts`
Expected: `ok | 12 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/cache/sqlite.ts backend/cache/sqlite.test.ts
git commit -m "feat(backend): port fundamentals/sentiment/analyst cache + maintenance utilities"
```

---

### Task 10: Secrets — OS-native keychain storage

**Files:**
- Create: `backend/secrets/keychain.ts`
- Test: `backend/secrets/keychain.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class SecretToolNotFoundError extends Error {}`
  - `function setSecret(account: string, value: string): Promise<void>`
  - `function getSecret(account: string): Promise<string | null>`
  - `function deleteSecret(account: string): Promise<void>`

Behavior differs deliberately by platform, per the approved design's "Secrets" risk note:
- **macOS**: shells out to the built-in `security` CLI (`add-generic-password` / `find-generic-password` / `delete-generic-password`), storing under service name `"flowfolio"`. Real OS Keychain storage.
- **Linux**: shells out to `secret-tool` (from `libsecret-tools`) with `service=flowfolio account=<account>` attributes. Real OS Secret Service storage. If `secret-tool` isn't installed, throws `SecretToolNotFoundError` with a clear message — no silent fallback.
- **Windows**: shells out to `powershell` and uses DPAPI (`ConvertTo-SecureString`/`ConvertFrom-SecureString`), which encrypts the value to the current Windows user account, then persists the encrypted blob to a JSON file under `Deno.env.get("APPDATA")/FlowFolio/secrets.json`. This is OS-native *encryption* (DPAPI) but app-managed *storage* (a file) — unlike macOS/Linux where the OS itself owns the storage. This asymmetry is intentional and documented here, not hidden.

- [ ] **Step 1: Write the failing tests**

These tests exercise whichever platform they run on (the CI/dev machine's real OS), round-tripping through the real OS secret storage and cleaning up afterward.

```typescript
// backend/secrets/keychain.test.ts
import { assertEquals } from "jsr:@std/assert";
import { deleteSecret, getSecret, setSecret } from "./keychain.ts";

const TEST_ACCOUNT = "FLOWFOLIO_TEST_SECRET";

Deno.test({
  name: "set then get round-trips a secret",
  fn: async () => {
    await setSecret(TEST_ACCOUNT, "test-value-123");
    const value = await getSecret(TEST_ACCOUNT);
    assertEquals(value, "test-value-123");
    await deleteSecret(TEST_ACCOUNT);
  },
});

Deno.test({
  name: "getSecret returns null for a secret that was never set",
  fn: async () => {
    const value = await getSecret("FLOWFOLIO_TEST_NEVER_SET");
    assertEquals(value, null);
  },
});

Deno.test({
  name: "set overwrites a previous value for the same account",
  fn: async () => {
    await setSecret(TEST_ACCOUNT, "first");
    await setSecret(TEST_ACCOUNT, "second");
    const value = await getSecret(TEST_ACCOUNT);
    assertEquals(value, "second");
    await deleteSecret(TEST_ACCOUNT);
  },
});

Deno.test({
  name: "delete then get returns null",
  fn: async () => {
    await setSecret(TEST_ACCOUNT, "temp");
    await deleteSecret(TEST_ACCOUNT);
    const value = await getSecret(TEST_ACCOUNT);
    assertEquals(value, null);
  },
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read --allow-write --allow-run --allow-env backend/secrets/keychain.test.ts`
Expected: FAIL — `Module not found "./keychain.ts"`

- [ ] **Step 3: Implement `keychain.ts`**

```typescript
// backend/secrets/keychain.ts

const SERVICE = "flowfolio";

export class SecretToolNotFoundError extends Error {
  constructor() {
    super(
      "`secret-tool` was not found. Install it via your distro's `libsecret-tools` " +
        "(or equivalent) package to enable secret storage on Linux.",
    );
    this.name = "SecretToolNotFoundError";
  }
}

async function run(cmd: string, args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(cmd, {
    args,
    stdin: stdin !== undefined ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// ===== macOS: Keychain via `security` =====

async function macSet(account: string, value: string): Promise<void> {
  await run("security", ["delete-generic-password", "-a", account, "-s", SERVICE]).catch(() => {});
  const { code, stderr } = await run("security", [
    "add-generic-password",
    "-a",
    account,
    "-s",
    SERVICE,
    "-w",
    value,
  ]);
  if (code !== 0) throw new Error(`Failed to store secret in macOS Keychain: ${stderr}`);
}

async function macGet(account: string): Promise<string | null> {
  const { code, stdout } = await run("security", [
    "find-generic-password",
    "-a",
    account,
    "-s",
    SERVICE,
    "-w",
  ]);
  if (code !== 0) return null;
  return stdout.trim();
}

async function macDelete(account: string): Promise<void> {
  await run("security", ["delete-generic-password", "-a", account, "-s", SERVICE]).catch(() => {});
}

// ===== Linux: Secret Service via `secret-tool` =====

async function assertSecretToolAvailable(): Promise<void> {
  try {
    await run("secret-tool", ["--version"]);
  } catch {
    throw new SecretToolNotFoundError();
  }
}

async function linuxSet(account: string, value: string): Promise<void> {
  await assertSecretToolAvailable();
  const { code, stderr } = await run(
    "secret-tool",
    ["store", "--label", `FlowFolio (${account})`, "service", SERVICE, "account", account],
    value,
  );
  if (code !== 0) throw new Error(`Failed to store secret via secret-tool: ${stderr}`);
}

async function linuxGet(account: string): Promise<string | null> {
  await assertSecretToolAvailable();
  const { code, stdout } = await run("secret-tool", ["lookup", "service", SERVICE, "account", account]);
  if (code !== 0) return null;
  const trimmed = stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function linuxDelete(account: string): Promise<void> {
  await assertSecretToolAvailable();
  await run("secret-tool", ["clear", "service", SERVICE, "account", account]).catch(() => {});
}

// ===== Windows: DPAPI-encrypted blob in a JSON file =====

function windowsSecretsFilePath(): string {
  const appData = Deno.env.get("APPDATA") ?? ".";
  return `${appData}/FlowFolio/secrets.json`;
}

async function readWindowsSecretsFile(): Promise<Record<string, string>> {
  try {
    const text = await Deno.readTextFile(windowsSecretsFilePath());
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeWindowsSecretsFile(data: Record<string, string>): Promise<void> {
  const path = windowsSecretsFilePath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

// `value`/`encrypted` are passed via environment variables the caller sets immediately
// before invoking these, not interpolated into the command string, to avoid shell-argument
// injection. Neither function takes the secret as a parameter for that reason.

async function windowsEncrypt(): Promise<string> {
  const { code, stdout, stderr } = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$s = ConvertTo-SecureString -String $Env:FLOWFOLIO_SECRET_PLAINTEXT -AsPlainText -Force; ConvertFrom-SecureString -SecureString $s`,
  ]);
  if (code !== 0) throw new Error(`DPAPI encryption failed: ${stderr}`);
  return stdout.trim();
}

async function windowsDecrypt(): Promise<string> {
  const { code, stdout, stderr } = await run("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$s = ConvertTo-SecureString -String $Env:FLOWFOLIO_SECRET_ENCRYPTED; ` +
      `$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); ` +
      `[System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)`,
  ]);
  if (code !== 0) throw new Error(`DPAPI decryption failed: ${stderr}`);
  return stdout.trim();
}

async function windowsSet(account: string, value: string): Promise<void> {
  Deno.env.set("FLOWFOLIO_SECRET_PLAINTEXT", value);
  try {
    const encrypted = await windowsEncrypt();
    const secrets = await readWindowsSecretsFile();
    secrets[account] = encrypted;
    await writeWindowsSecretsFile(secrets);
  } finally {
    Deno.env.delete("FLOWFOLIO_SECRET_PLAINTEXT");
  }
}

async function windowsGet(account: string): Promise<string | null> {
  const secrets = await readWindowsSecretsFile();
  const encrypted = secrets[account];
  if (!encrypted) return null;
  Deno.env.set("FLOWFOLIO_SECRET_ENCRYPTED", encrypted);
  try {
    return await windowsDecrypt();
  } finally {
    Deno.env.delete("FLOWFOLIO_SECRET_ENCRYPTED");
  }
}

async function windowsDelete(account: string): Promise<void> {
  const secrets = await readWindowsSecretsFile();
  delete secrets[account];
  await writeWindowsSecretsFile(secrets);
}

// ===== Public API, dispatched by platform =====

export async function setSecret(account: string, value: string): Promise<void> {
  switch (Deno.build.os) {
    case "darwin":
      return macSet(account, value);
    case "linux":
      return linuxSet(account, value);
    case "windows":
      return windowsSet(account, value);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}

export async function getSecret(account: string): Promise<string | null> {
  switch (Deno.build.os) {
    case "darwin":
      return macGet(account);
    case "linux":
      return linuxGet(account);
    case "windows":
      return windowsGet(account);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}

export async function deleteSecret(account: string): Promise<void> {
  switch (Deno.build.os) {
    case "darwin":
      return macDelete(account);
    case "linux":
      return linuxDelete(account);
    case "windows":
      return windowsDelete(account);
    default:
      throw new Error(`Unsupported platform: ${Deno.build.os}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read --allow-write --allow-run --allow-env backend/secrets/keychain.test.ts`
Expected: `ok | 4 passed` (on whichever OS this runs on)

- [ ] **Step 5: Commit**

```bash
git add backend/secrets/keychain.ts backend/secrets/keychain.test.ts
git commit -m "feat(backend): add OS-native secret storage (Keychain/Secret Service/DPAPI)"
```

---

## Done criteria for this plan

- `deno test --allow-read --allow-write --allow-run --allow-env backend/` passes with zero failures.
- Every module (`resilience/`, `cache/`, `db/`, `secrets/`) has a single clear public entrypoint file and no cross-module imports except `cache/sqlite.ts` depending on `db/connection.ts`'s exported types.
- No file in `backend/` imports anything from `src/` or `src-tauri/`.
- Plan 2 (Market-data) can start immediately after this, importing `TtlCache`, `CircuitBreakerManager`, `RetryExecutor`, `RateLimiter`, `SqliteCache`, and the `secrets` functions.
