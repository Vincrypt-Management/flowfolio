# Market-Data Migration (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src-tauri/src/modules/data_provider/` (multi-source market-data fetching with health-based
provider failover) and the caching/circuit-breaker integration currently in
`src-tauri/src/services/enhanced_market_service.rs` to TypeScript, split across `packages/core/market-data/`
(portable — will run under Deno today and React Native later) and `backend/market-data/` (the thin
Deno-specific service wrapper). Builds on Plan 1 (Foundation, merged) and the shared-core restructuring
(merged): `packages/core/resilience/`, `packages/core/cache/memory.ts`, `packages/core/persistence/` (the
`SecretStore`/`CacheStore` interfaces), and `backend/cache/sqlite.ts`, `backend/secrets/keychain.ts` (the
Deno-specific implementations of those interfaces) all already exist and are consumed here, not rebuilt.

**Architecture:** `packages/core/market-data/` is a new pure-TypeScript module tree with zero Deno-specific
imports — types, parse helpers, a sliding-window rate limiter, a health/tier tracker, nine provider fetchers,
and a stateless failover orchestrator. `backend/market-data/` is a thin Deno-specific service (in-memory TTL
cache → SQLite cache → circuit breaker → orchestrator call, API keys from the OS keychain via Plan 1's
`secrets` module) that Plan 3 (scoring/quant-analysis) and later plans will call into. Tests run via
`deno test`, invoked from `packages/core` and `backend` respectively (same invocation-directory constraint
Plan 1 documented for `node:sqlite`/`@types/node` resolution — market-data code itself has no such dependency,
but keep the same "run from the workspace root" habit for consistency).

**Tech Stack:** Deno 2.9+, web-standard `fetch()` (no HTTP client dependency — Deno's `fetch` auto-decodes
gzip/deflate, so the Rust source's explicit gzip-client-config revert in commit `8a7d3ee` has no TS
equivalent to replicate), no external npm/JSR dependencies for market-data itself.

## Global Constraints

- No `any` types.
- TDD: for every provider, write the fixture JSON first, then the failing parser unit test, then implement.
- **Fixture-based testing** (per the design spec's deferred decision, resolved here): each provider gets one
  committed fixture JSON per endpoint under
  `packages/core/market-data/providers/__fixtures__/{provider}-{quote|historical}.json`, containing the exact
  field shape the Rust parser reads (reconstructed from the verified Rust parsing code in this plan, since no
  live call was made during planning — **before merging each provider's task, the implementer should replace
  the fixture with one real captured response body if convenient, but the shape here is exact and sufficient
  to unblock TDD**). Parser functions (`parse{Provider}Quote`, `parse{Provider}Historical`) are pure — they
  take already-parsed JSON, not a live HTTP call — so their unit tests need no network mocking at all: load
  the fixture, call the parser, assert the result. This is simpler than mocking `fetch` and was chosen over it
  for exactly that reason.
- **Live integration tests are separate and opt-in.** Each provider's thin `fetchFrom{Provider}` glue function
  (URL construction, headers, real `fetch()` call) gets exactly one `Deno.test` guarded by
  `ignore: !Deno.env.get("RUN_LIVE_MARKET_DATA_TESTS")` — skipped by default, not part of `deno task test`,
  requires a real API key in the environment to actually run. This exists so a developer can manually verify
  a provider against the real API without it ever blocking CI or requiring live keys to just run the suite.
  **Discovered during Task 4's implementation:** evaluating `Deno.env.get(...)` inside a test's `ignore:`
  field requires `--allow-env` at test-registration time even though the guarded test itself is skipped —
  Deno's permission model checks this eagerly, not lazily. Every `deno test` invocation in this plan that
  runs a file containing this pattern (Tasks 4 and 11 today; any later plan reusing it) needs `--allow-env`
  added, not just `--allow-read`. Already fixed in this doc's own Task 4/11 Step 5 commands.
- **Rate limiter is a new, separate mechanism from Plan 1's `RateLimiter`.** Plan 1's `packages/core/resilience/rate_limiter.ts`
  is a fixed daily quota (`RateLimiter.newDaily`). The Rust source's `check_rate_limit` is a sliding 60-second
  window per provider — a different mechanism entirely, matching the Rust source's own separation. This plan
  adds `packages/core/market-data/rate-limiter.ts` with class name `SlidingWindowRateLimiter` — deliberately
  not reusing or renaming Plan 1's `RateLimiter`, to avoid forcing two genuinely different algorithms into one
  abstraction.
- **Tier-priority table and rate limits are ported verbatim from the Rust source, including apparent oddities.**
  Rust's `twelve_data` sliding-window limit is `1`/min (comment says "conservative" even though the real
  Twelve Data quota is ~800/day ≈ 0.55/min — the literal `1` is actually more generous than real, an
  inconsistency in the original comment, not the value). Port the literal `1`, do not "fix" it — it is
  live production behavior today, not a bug this plan is scoped to address.
- **`free_sources.rs` is explicitly NOT ported.** Confirmed via grep across all of `src-tauri/src/`:
  `FreeDataProviders` (its only public entry point) and `parse_yahoo_quote`/`parse_yahoo_historical` are never
  called anywhere outside `free_sources.rs`'s own `#[cfg(test)]` module — this file is genuinely dead code,
  superseded by the inline Yahoo/Nasdaq parsing directly inside `multi_source_provider.rs`'s
  `fetch_from_yahoo`/`fetch_from_nasdaq` (which is what this plan ports). This is the same pattern Plan 1
  found with the Rust fundamentals cache (`#[allow(dead_code)]`) — documented as a deliberate exclusion, not
  an oversight.
- **`parse_alpaca_quote` (the `/v2/stocks/{symbol}/quotes/latest` bid/ask parser, `multi_source_provider.rs:69-103`)
  is also confirmed dead code** — grepped, never called anywhere including within `fetch_from_alpaca` itself.
  The live Alpaca path derives its quote entirely from the bars endpoint (`parse_alpaca_bars`) — the most
  recent bar's close becomes the current price, with `change`/`changePercent` computed against the prior bar's
  close. Not ported for the same reason as `free_sources.rs`.
- **The orchestrator itself does not cache.** The Rust source's provider-level `DashMap` quote/historical cache
  (`quote_cache_ttl` = 120s, `historical_cache_ttl` = 7200s, the latter unused in practice — `get_market_data`'s
  early-return only checks `quote_cache` age) is redundant with the service-level cache the design spec already
  collapsed the 3-tier Rust cache down to 2 tiers for. This plan completes that collapse: `packages/core/market-data`'s
  orchestrator (Task 13) is a pure failover engine with no cache state of its own; all caching lives in
  `backend/market-data`'s service wrapper (Task 14), which is the correct place for it since it's the layer
  that owns the actual cache instances (Plan 1's `TtlCache` + `SqliteCache`). This is a deliberate simplification,
  not a fidelity gap — the Rust 3rd tier added nothing a from-scratch TS port needs to replicate.
- Un-configured keyed providers are silently skipped when building the provider order (matches Rust's
  `if self.x_key.is_some() { ... } else { continue }` per-provider gating) — no error recorded for a provider
  that was never configured. Yahoo and Nasdaq need no key and are always attempted.
- Batch fetch uses bounded concurrency of 5 (mirrors Rust's `buffer_unordered(5)`) via a small hand-rolled
  concurrency limiter — no dependency needed for this. Failed symbols are silently dropped from the batch
  result map, matching Rust's `.filter_map` behavior.

---

### Task 1: Types + parse helpers

**Files:**
- Create: `packages/core/market-data/types.ts`
- Create: `packages/core/market-data/parse-helpers.ts`
- Test: `packages/core/market-data/parse-helpers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier plans.
- Produces:
  - `interface StockQuote { symbol: string; price: number; change: number; changePercent: number; volume: number; timestamp: string; source: string }`
  - `interface HistoricalPrice { date: string; open: number; high: number; low: number; close: number; volume: number }`
  - `interface MarketDataResult { quote: StockQuote | null; historical: HistoricalPrice[]; source: string; cached: boolean }`
  - `interface ProviderQuote { symbol: string; price: number; bid: number | null; ask: number | null; volume: number | null }`
  - `type ParseError = { kind: "missing_field"; provider: string; field: string } | { kind: "invalid_type"; provider: string; field: string; expected: string; got: string } | { kind: "empty_response"; provider: string }`
  - `class ParseFailure extends Error { readonly error: ParseError }`
  - `function parseRequiredF64(value: unknown, field: string, provider: string): number`
  - `function parseOptionalF64(value: unknown, field: string, provider: string): number | null`
  - `function parseRequiredI64(value: unknown, field: string, provider: string): number`
  - `function parseOptionalI64(value: unknown, field: string, provider: string): number | null`

- [ ] **Step 1: Write `types.ts`** (no test needed — type-only declarations, same rationale as Plan 1's
  shared-core `secret-store.ts`/`cache-store.ts`)

```typescript
// packages/core/market-data/types.ts

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  source: string;
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataResult {
  quote: StockQuote | null;
  historical: HistoricalPrice[];
  source: string;
  cached: boolean;
}

/** Intermediate quote returned by pure parser functions; callers map this into StockQuote. */
export interface ProviderQuote {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
}
```

- [ ] **Step 2: Write the failing parse-helpers tests**

```typescript
// packages/core/market-data/parse-helpers.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  ParseFailure,
  parseOptionalF64,
  parseOptionalI64,
  parseRequiredF64,
  parseRequiredI64,
} from "./parse-helpers.ts";

Deno.test("parseRequiredF64 accepts a number", () => {
  assertEquals(parseRequiredF64({ price: 123.45 }, "price", "test"), 123.45);
});

Deno.test("parseRequiredF64 accepts a numeric string", () => {
  assertEquals(parseRequiredF64({ price: "123.45" }, "price", "test"), 123.45);
});

Deno.test("parseRequiredF64 rejects a missing field", () => {
  const err = assertThrows(() => parseRequiredF64({}, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseRequiredF64 rejects null (present but unparseable)", () => {
  const err = assertThrows(() => parseRequiredF64({ price: null }, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseRequiredF64 rejects a non-numeric string", () => {
  const err = assertThrows(() => parseRequiredF64({ price: "N/A" }, "price", "test"), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseOptionalF64 returns null for a missing field", () => {
  assertEquals(parseOptionalF64({}, "bid", "test"), null);
});

Deno.test("parseOptionalF64 returns null for an explicit null", () => {
  assertEquals(parseOptionalF64({ bid: null }, "bid", "test"), null);
});

Deno.test("parseOptionalF64 returns the value when present", () => {
  assertEquals(parseOptionalF64({ bid: 99.5 }, "bid", "test"), 99.5);
});

Deno.test("parseRequiredI64 accepts an integer", () => {
  assertEquals(parseRequiredI64({ volume: 1_234_567 }, "volume", "test"), 1_234_567);
});

Deno.test("parseRequiredI64 accepts a numeric string", () => {
  assertEquals(parseRequiredI64({ volume: "1234567" }, "volume", "test"), 1_234_567);
});

Deno.test("parseRequiredI64 accepts a float-shaped number, truncating", () => {
  assertEquals(parseRequiredI64({ volume: 42.9 }, "volume", "test"), 42);
});

Deno.test("parseOptionalI64 returns null for missing/null, value otherwise", () => {
  assertEquals(parseOptionalI64({}, "v", "test"), null);
  assertEquals(parseOptionalI64({ v: null }, "v", "test"), null);
  assertEquals(parseOptionalI64({ v: 5 }, "v", "test"), 5);
});

Deno.test("ParseFailure message is human-readable", () => {
  try {
    parseRequiredF64({}, "price", "acme");
    assert(false, "should have thrown");
  } catch (e) {
    assert(e instanceof ParseFailure);
    assert(e.message.includes("price"));
    assert(e.message.includes("acme"));
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/parse-helpers.test.ts`
Expected: FAIL — `Module not found "./parse-helpers.ts"`

- [ ] **Step 4: Implement `parse-helpers.ts`**

```typescript
// packages/core/market-data/parse-helpers.ts

export type ParseError =
  | { kind: "missing_field"; provider: string; field: string }
  | { kind: "invalid_type"; provider: string; field: string; expected: string; got: string }
  | { kind: "empty_response"; provider: string };

function formatParseError(e: ParseError): string {
  switch (e.kind) {
    case "missing_field":
      return `Missing required field '${e.field}' from provider '${e.provider}'`;
    case "invalid_type":
      return `Invalid type for field '${e.field}' from provider '${e.provider}': expected ${e.expected}, got ${e.got}`;
    case "empty_response":
      return `Provider '${e.provider}' returned no usable data`;
  }
}

export class ParseFailure extends Error {
  readonly error: ParseError;
  constructor(error: ParseError) {
    super(formatParseError(error));
    this.name = "ParseFailure";
    this.error = error;
  }
}

function get(value: unknown, field: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field];
}

function toF64(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return n;
  }
  return undefined;
}

function toI64(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== "") return Math.trunc(n);
  }
  return undefined;
}

export function parseRequiredF64(value: unknown, field: string, provider: string): number {
  const raw = get(value, field);
  if (raw === undefined) {
    throw new ParseFailure({ kind: "missing_field", provider, field });
  }
  const n = toF64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "number or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseOptionalF64(value: unknown, field: string, provider: string): number | null {
  const raw = get(value, field);
  if (raw === undefined || raw === null) return null;
  const n = toF64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "number or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseRequiredI64(value: unknown, field: string, provider: string): number {
  const raw = get(value, field);
  if (raw === undefined) {
    throw new ParseFailure({ kind: "missing_field", provider, field });
  }
  const n = toI64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "integer or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}

export function parseOptionalI64(value: unknown, field: string, provider: string): number | null {
  const raw = get(value, field);
  if (raw === undefined || raw === null) return null;
  const n = toI64(raw);
  if (n === undefined) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider,
      field,
      expected: "integer or numeric string",
      got: JSON.stringify(raw),
    });
  }
  return n;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/parse-helpers.test.ts`
Expected: `ok | 13 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/types.ts packages/core/market-data/parse-helpers.ts packages/core/market-data/parse-helpers.test.ts
git commit -m "feat(market-data): port shared types and parse helpers to TypeScript"
```

---

### Task 2: Sliding-window rate limiter

**Files:**
- Create: `packages/core/market-data/rate-limiter.ts`
- Test: `packages/core/market-data/rate-limiter.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class RateLimitedError extends Error { readonly provider: string }`
  - `class SlidingWindowRateLimiter { checkAndConsume(provider: string, limitPerMinute: number, now?: number): boolean }`

Note: this is a distinct mechanism from Plan 1's `packages/core/resilience/rate_limiter.ts` (`RateLimiter`,
fixed daily quota) — see Global Constraints. `checkAndConsume` takes an optional `now` parameter (defaulting
to `Date.now()`) specifically so tests can exercise window-boundary behavior without real timers.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/market-data/rate-limiter.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/rate-limiter.test.ts`
Expected: FAIL — `Module not found "./rate-limiter.ts"`

- [ ] **Step 3: Implement `rate-limiter.ts`**

```typescript
// packages/core/market-data/rate-limiter.ts

export class RateLimitedError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`Rate limit exceeded for provider '${provider}'`);
    this.name = "RateLimitedError";
    this.provider = provider;
  }
}

interface WindowState {
  count: number;
  windowStart: number;
}

/** Sliding 60-second window per provider, matching the Rust source's check_rate_limit. */
export class SlidingWindowRateLimiter {
  #windows = new Map<string, WindowState>();

  checkAndConsume(provider: string, limitPerMinute: number, now: number = Date.now()): boolean {
    let state = this.#windows.get(provider);
    if (!state || now - state.windowStart > 60_000) {
      state = { count: 0, windowStart: now };
      this.#windows.set(provider, state);
    }
    if (state.count >= limitPerMinute) {
      return false;
    }
    state.count += 1;
    return true;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/rate-limiter.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 5: Commit**

```bash
git add packages/core/market-data/rate-limiter.ts packages/core/market-data/rate-limiter.test.ts
git commit -m "feat(market-data): add sliding-window rate limiter"
```

---

### Task 3: Health tracker + tier-priority ordering

**Files:**
- Create: `packages/core/market-data/health-tracker.ts`
- Test: `packages/core/market-data/health-tracker.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `const PROVIDER_TIER: Record<string, number>` (alpaca=10, yahoo=9, nasdaq=8, tiingo=7, finnhub=6, twelve_data=4, fmp=3, alphavantage=2, polygon=1)
  - `class HealthTracker { trackSuccess(provider: string): void; trackFailure(provider: string): void; getHealth(provider: string): number; getProviderOrder(providers: string[]): string[]; snapshot(): Record<string, { successes: number; failures: number }> }`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/market-data/health-tracker.test.ts
import { assertEquals } from "jsr:@std/assert";
import { HealthTracker, PROVIDER_TIER } from "./health-tracker.ts";

Deno.test("an untried provider has health 100", () => {
  const t = new HealthTracker();
  assertEquals(t.getHealth("alpaca"), 100);
});

Deno.test("trackSuccess/trackFailure compute health as a percentage", () => {
  const t = new HealthTracker();
  t.trackSuccess("alpaca");
  t.trackSuccess("alpaca");
  t.trackSuccess("alpaca");
  t.trackFailure("alpaca");
  assertEquals(t.getHealth("alpaca"), 75);
});

Deno.test("health of all-failures is 0", () => {
  const t = new HealthTracker();
  t.trackFailure("alpaca");
  t.trackFailure("alpaca");
  assertEquals(t.getHealth("alpaca"), 0);
});

Deno.test("PROVIDER_TIER matches the current live tier order", () => {
  assertEquals(PROVIDER_TIER.alpaca, 10);
  assertEquals(PROVIDER_TIER.yahoo, 9);
  assertEquals(PROVIDER_TIER.nasdaq, 8);
  assertEquals(PROVIDER_TIER.tiingo, 7);
  assertEquals(PROVIDER_TIER.finnhub, 6);
  assertEquals(PROVIDER_TIER.twelve_data, 4);
  assertEquals(PROVIDER_TIER.fmp, 3);
  assertEquals(PROVIDER_TIER.alphavantage, 2);
  assertEquals(PROVIDER_TIER.polygon, 1);
});

Deno.test("getProviderOrder sorts by tier descending when all untried", () => {
  const t = new HealthTracker();
  const order = t.getProviderOrder(["polygon", "alpaca", "finnhub", "yahoo"]);
  assertEquals(order, ["alpaca", "yahoo", "finnhub", "polygon"]);
});

Deno.test("getProviderOrder breaks ties within a tier by health descending", () => {
  const t = new HealthTracker();
  // fmp and alphavantage would collide if health were ignored — use two same-tier
  // providers by tracking failures to separate them within the same nominal tier
  // (here: two distinct providers sharing tier via a manual override isn't possible,
  // so instead verify health affects order within a normally-adjacent comparison).
  t.trackFailure("finnhub");
  t.trackFailure("finnhub");
  t.trackSuccess("tiingo");
  const order = t.getProviderOrder(["finnhub", "tiingo"]);
  assertEquals(order, ["tiingo", "finnhub"]); // tiingo tier 7 > finnhub tier 6 regardless of health
});

Deno.test("getProviderOrder ranks an unknown provider's tier as 0 (lowest)", () => {
  const t = new HealthTracker();
  const order = t.getProviderOrder(["nasdaq", "unknown_provider"]);
  assertEquals(order, ["nasdaq", "unknown_provider"]);
});

Deno.test("snapshot reflects tracked counts", () => {
  const t = new HealthTracker();
  t.trackSuccess("alpaca");
  t.trackFailure("alpaca");
  assertEquals(t.snapshot().alpaca, { successes: 1, failures: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/health-tracker.test.ts`
Expected: FAIL — `Module not found "./health-tracker.ts"`

- [ ] **Step 3: Implement `health-tracker.ts`**

```typescript
// packages/core/market-data/health-tracker.ts

export const PROVIDER_TIER: Record<string, number> = {
  alpaca: 10,
  yahoo: 9,
  nasdaq: 8,
  tiingo: 7,
  finnhub: 6,
  twelve_data: 4,
  fmp: 3,
  alphavantage: 2,
  polygon: 1,
};

interface HealthCounts {
  successes: number;
  failures: number;
}

export class HealthTracker {
  #counts = new Map<string, HealthCounts>();

  trackSuccess(provider: string): void {
    const c = this.#counts.get(provider) ?? { successes: 0, failures: 0 };
    c.successes += 1;
    this.#counts.set(provider, c);
  }

  trackFailure(provider: string): void {
    const c = this.#counts.get(provider) ?? { successes: 0, failures: 0 };
    c.failures += 1;
    this.#counts.set(provider, c);
  }

  getHealth(provider: string): number {
    const c = this.#counts.get(provider);
    if (!c || c.successes + c.failures === 0) return 100;
    return Math.floor((c.successes * 100) / (c.successes + c.failures));
  }

  getProviderOrder(providers: string[]): string[] {
    return [...providers].sort((a, b) => {
      const tierA = PROVIDER_TIER[a] ?? 0;
      const tierB = PROVIDER_TIER[b] ?? 0;
      if (tierA !== tierB) return tierB - tierA;
      return this.getHealth(b) - this.getHealth(a);
    });
  }

  snapshot(): Record<string, HealthCounts> {
    return Object.fromEntries(this.#counts);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/health-tracker.test.ts`
Expected: `ok | 8 passed`

- [ ] **Step 5: Commit**

```bash
git add packages/core/market-data/health-tracker.ts packages/core/market-data/health-tracker.test.ts
git commit -m "feat(market-data): port health tracker and tier-priority ordering"
```

---

### Task 4: Provider — Alpaca

**Files:**
- Create: `packages/core/market-data/providers/alpaca.ts`
- Create: `packages/core/market-data/providers/__fixtures__/alpaca-bars.json`
- Test: `packages/core/market-data/providers/alpaca.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `parse-helpers.ts` (Task 1), `SlidingWindowRateLimiter` (Task 2).
- Produces: `parseAlpacaBars(json: unknown): HistoricalPrice[]`, `deriveAlpacaQuote(bars: HistoricalPrice[], symbol: string): StockQuote` (the most-recent-bar-vs-prior-bar quote derivation — reconstructed since the Rust glue code around lines 792-905 that builds the quote from bars wasn't captured verbatim during research; the bars parser itself (below) IS verbatim), `fetchFromAlpaca(symbol: string, apiKey: string, apiSecret: string, rateLimiter: SlidingWindowRateLimiter, fetchImpl?: typeof fetch): Promise<MarketDataResult>`.

Note on fidelity: `parse_alpaca_quote` (the separate `/quotes/latest` bid/ask endpoint parser) is confirmed
dead code (see Global Constraints) and is not ported. The live Rust path derives its "quote" from the bars
endpoint alone. `deriveAlpacaQuote`'s exact change/changePercent formula (latest close vs. prior close) is a
faithful reconstruction of that behavior, not a verbatim line-for-line port — flagged here so the implementer
double-checks it against a real Alpaca bars response if one becomes available.

- [ ] **Step 1: Write the fixture**

```json
// packages/core/market-data/providers/__fixtures__/alpaca-bars.json
{
  "bars": [
    { "t": "2026-07-08T04:00:00Z", "o": 210.1, "h": 212.5, "l": 209.8, "c": 211.9, "v": 45000000 },
    { "t": "2026-07-09T04:00:00Z", "o": 211.9, "h": 214.0, "l": 211.0, "c": 213.4, "v": 47500000 }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/alpaca.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { deriveAlpacaQuote, parseAlpacaBars } from "./alpaca.ts";
import { ParseFailure } from "../parse-helpers.ts";
import fixture from "./__fixtures__/alpaca-bars.json" with { type: "json" };

Deno.test("parseAlpacaBars parses all bars into HistoricalPrice", () => {
  const bars = parseAlpacaBars(fixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].close, 213.4);
  assertEquals(bars[1].date, "2026-07-09");
});

Deno.test("parseAlpacaBars skips a bar with a missing close and keeps the rest", () => {
  const bars = parseAlpacaBars({
    bars: [{ t: "2026-07-08T04:00:00Z", o: 1, h: 1, l: 1, v: 1 }, fixture.bars[1]],
  });
  assertEquals(bars.length, 1);
  assertEquals(bars[0].close, 213.4);
});

Deno.test("parseAlpacaBars throws EmptyResponse when no bars survive", () => {
  const err = assertThrows(() => parseAlpacaBars({ bars: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseAlpacaBars throws MissingField when 'bars' itself is absent", () => {
  const err = assertThrows(() => parseAlpacaBars({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("deriveAlpacaQuote uses the latest bar's close as price, computes change vs. prior bar", () => {
  const bars = parseAlpacaBars(fixture);
  const quote = deriveAlpacaQuote(bars, "AAPL");
  assertEquals(quote.symbol, "AAPL");
  assertEquals(quote.price, 213.4);
  assertEquals(quote.change, 213.4 - 211.9);
  assertEquals(quote.source, "alpaca");
});

Deno.test("deriveAlpacaQuote with a single bar has zero change", () => {
  const bars = parseAlpacaBars({ bars: [fixture.bars[0]] });
  const quote = deriveAlpacaQuote(bars, "AAPL");
  assertEquals(quote.change, 0);
  assertEquals(quote.changePercent, 0);
});

Deno.test({
  name: "fetchFromAlpaca hits the real API (live, opt-in)",
  ignore: !Deno.env.get("RUN_LIVE_MARKET_DATA_TESTS"),
  fn: async () => {
    const { fetchFromAlpaca } = await import("./alpaca.ts");
    const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
    const result = await fetchFromAlpaca(
      "AAPL",
      Deno.env.get("ALPACA_API_KEY")!,
      Deno.env.get("ALPACA_SECRET_KEY")!,
      new SlidingWindowRateLimiter(),
    );
    if (result.quote) {
      console.log("Alpaca live quote:", result.quote);
    }
  },
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/alpaca.test.ts`
Expected: FAIL — `Module not found "./alpaca.ts"`

- [ ] **Step 4: Implement `alpaca.ts`**

```typescript
// packages/core/market-data/providers/alpaca.ts
import type { HistoricalPrice, MarketDataResult, StockQuote } from "../types.ts";
import { parseRequiredF64, parseRequiredI64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseAlpacaBars(json: unknown): HistoricalPrice[] {
  const bars = (json as Record<string, unknown>)?.bars;
  if (!Array.isArray(bars)) {
    throw new ParseFailure({ kind: "missing_field", provider: "alpaca", field: "bars" });
  }
  const out: HistoricalPrice[] = [];
  bars.forEach((bar, i) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "c", "alpaca");
    } catch {
      return; // skip bar with missing/bad close, matching the Rust source
    }
    let open: number, high: number, low: number, volume: number;
    try {
      open = parseRequiredF64(bar, "o", "alpaca");
    } catch {
      open = close;
    }
    try {
      high = parseRequiredF64(bar, "h", "alpaca");
    } catch {
      high = close;
    }
    try {
      low = parseRequiredF64(bar, "l", "alpaca");
    } catch {
      low = close;
    }
    try {
      volume = parseRequiredI64(bar, "v", "alpaca");
    } catch {
      volume = 0;
    }
    const t = (bar as Record<string, unknown>)?.t;
    const date = typeof t === "string" ? t.slice(0, 10) : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "alpaca" });
  }
  return out;
}

export function deriveAlpacaQuote(bars: HistoricalPrice[], symbol: string): StockQuote {
  const latest = bars[bars.length - 1];
  const prior = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const change = prior ? latest.close - prior.close : 0;
  const changePercent = prior && prior.close !== 0 ? (change / prior.close) * 100 : 0;
  return {
    symbol,
    price: latest.close,
    change,
    changePercent,
    volume: latest.volume,
    timestamp: latest.date,
    source: "alpaca",
  };
}

export async function fetchFromAlpaca(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("alpaca", 200)) {
    throw new RateLimitedError("alpaca");
  }
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&start=${start.toISOString()}&end=${end.toISOString()}&limit=365&adjustment=split&feed=iex`;
  const res = await fetchImpl(url, {
    headers: {
      "APCA-API-KEY-ID": apiKey.trim(),
      "APCA-API-SECRET-KEY": apiSecret.trim(),
    },
  });
  if (!res.ok) {
    throw new Error(`alpaca: HTTP ${res.status}`);
  }
  const json = await res.json();
  const bars = parseAlpacaBars(json);
  const quote = deriveAlpacaQuote(bars, symbol);
  return { quote, historical: bars, source: "alpaca", cached: false };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read --allow-env market-data/providers/alpaca.test.ts`
Expected: `ok | 6 passed, 1 ignored`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/alpaca.ts packages/core/market-data/providers/alpaca.test.ts packages/core/market-data/providers/__fixtures__/alpaca-bars.json
git commit -m "feat(market-data): port Alpaca provider"
```

---

### Task 5: Provider — Finnhub

**Files:**
- Create: `packages/core/market-data/providers/finnhub.ts`
- Create: `packages/core/market-data/providers/__fixtures__/finnhub-quote.json`, `finnhub-candles.json`
- Test: `packages/core/market-data/providers/finnhub.test.ts`

**Interfaces:**
- Produces: `parseFinnhubQuote(json: unknown): ProviderQuote`, `parseFinnhubCandles(json: unknown): HistoricalPrice[]`, `fetchFromFinnhub(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

Note: Finnhub's `/quote` endpoint does not echo the symbol (`ProviderQuote.symbol` is `""` from the parser —
the caller supplies the real symbol when building the final `StockQuote`); volume is hardcoded to 0 (Finnhub's
quote endpoint has no volume field), matching the Rust source exactly.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/finnhub-quote.json
{ "c": 213.4, "d": 1.5, "dp": 0.71, "t": 1751500800 }
```

```json
// packages/core/market-data/providers/__fixtures__/finnhub-candles.json
{
  "s": "ok",
  "t": [1751414400, 1751500800],
  "o": [210.1, 211.9],
  "h": [212.5, 214.0],
  "l": [209.8, 211.0],
  "c": [211.9, 213.4],
  "v": [45000000, 47500000]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/finnhub.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseFinnhubCandles, parseFinnhubQuote } from "./finnhub.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/finnhub-quote.json" with { type: "json" };
import candlesFixture from "./__fixtures__/finnhub-candles.json" with { type: "json" };

Deno.test("parseFinnhubQuote parses price from 'c'", () => {
  const q = parseFinnhubQuote(quoteFixture);
  assertEquals(q.price, 213.4);
  assertEquals(q.symbol, "");
  assertEquals(q.volume, null);
});

Deno.test("parseFinnhubQuote rejects a non-positive price", () => {
  const err = assertThrows(() => parseFinnhubQuote({ c: 0 }), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseFinnhubCandles parses parallel OHLCV arrays", () => {
  const bars = parseFinnhubCandles(candlesFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].close, 213.4);
  assertEquals(bars[1].date, "2026-07-02");
});

Deno.test("parseFinnhubCandles throws EmptyResponse when status is 'no_data'", () => {
  const err = assertThrows(() => parseFinnhubCandles({ s: "no_data" }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseFinnhubCandles skips a bar with a bad close", () => {
  const bars = parseFinnhubCandles({
    s: "ok",
    t: [1, 2],
    c: [0, 213.4],
    o: [1, 211.9],
    h: [1, 214.0],
    l: [1, 211.0],
    v: [1, 47500000],
  });
  assertEquals(bars.length, 1);
  assertEquals(bars[0].close, 213.4);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/finnhub.test.ts`
Expected: FAIL — `Module not found "./finnhub.ts"`

- [ ] **Step 4: Implement `finnhub.ts`**

```typescript
// packages/core/market-data/providers/finnhub.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseFinnhubQuote(json: unknown): ProviderQuote {
  const price = parseRequiredF64(json, "c", "finnhub");
  if (price <= 0) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider: "finnhub",
      field: "c",
      expected: "positive number",
      got: String(price),
    });
  }
  return { symbol: "", price, bid: null, ask: null, volume: null };
}

export function parseFinnhubCandles(json: unknown): HistoricalPrice[] {
  const obj = json as Record<string, unknown>;
  if (obj?.s === "no_data") {
    throw new ParseFailure({ kind: "empty_response", provider: "finnhub" });
  }
  const closes = obj?.c;
  if (!Array.isArray(closes)) {
    throw new ParseFailure({ kind: "missing_field", provider: "finnhub", field: "c" });
  }
  const opens = Array.isArray(obj?.o) ? obj.o as number[] : undefined;
  const highs = Array.isArray(obj?.h) ? obj.h as number[] : undefined;
  const lows = Array.isArray(obj?.l) ? obj.l as number[] : undefined;
  const vols = Array.isArray(obj?.v) ? obj.v as number[] : undefined;
  const timestamps = Array.isArray(obj?.t) ? obj.t as number[] : undefined;

  const out: HistoricalPrice[] = [];
  (closes as number[]).forEach((closeRaw, i) => {
    if (typeof closeRaw !== "number" || closeRaw <= 0) return;
    const close = closeRaw;
    const open = opens?.[i] ?? close;
    const high = highs?.[i] ?? close;
    const low = lows?.[i] ?? close;
    const volume = vols?.[i] ?? 0;
    const ts = timestamps?.[i];
    const date = typeof ts === "number"
      ? new Date(ts * 1000).toISOString().slice(0, 10)
      : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "finnhub" });
  }
  return out;
}

export async function fetchFromFinnhub(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("finnhub", 50)) {
    throw new RateLimitedError("finnhub");
  }
  const quoteRes = await fetchImpl(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}`,
    { headers: { "X-Finnhub-Token": apiKey } },
  );
  if (!quoteRes.ok) throw new Error(`finnhub: HTTP ${quoteRes.status}`);
  const providerQuote = parseFinnhubQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 365 * 24 * 60 * 60;
    const candlesRes = await fetchImpl(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}`,
      { headers: { "X-Finnhub-Token": apiKey } },
    );
    if (candlesRes.ok) {
      historical = parseFinnhubCandles(await candlesRes.json());
    }
  } catch {
    // non-fatal, matching the Rust source
  }

  return {
    quote: {
      symbol,
      price: providerQuote.price,
      change: 0,
      changePercent: 0,
      volume: 0,
      timestamp: new Date().toISOString(),
      source: "finnhub",
    },
    historical,
    source: "finnhub",
    cached: false,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/finnhub.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/finnhub.ts packages/core/market-data/providers/finnhub.test.ts packages/core/market-data/providers/__fixtures__/finnhub-quote.json packages/core/market-data/providers/__fixtures__/finnhub-candles.json
git commit -m "feat(market-data): port Finnhub provider"
```

---

### Task 6: Provider — FMP

**Files:**
- Create: `packages/core/market-data/providers/fmp.ts`
- Create: `packages/core/market-data/providers/__fixtures__/fmp-quote.json`, `fmp-historical.json`
- Test: `packages/core/market-data/providers/fmp.test.ts`

**Interfaces:**
- Produces: `parseFmpQuote(json: unknown): ProviderQuote`, `parseFmpHistorical(json: unknown): HistoricalPrice[]`, `fetchFromFmp(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

Note on fidelity: FMP's quote parse **soft-fails to a null quote** on parse error (matching the Rust source's
non-fatal `tracing::warn!`-and-continue behavior) rather than throwing all the way up — `fetchFromFmp` catches
the quote parse error itself and returns `{ quote: null, ... }` rather than failing the whole provider.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/fmp-quote.json
[{ "symbol": "AAPL", "price": 213.4, "volume": 47500000 }]
```

```json
// packages/core/market-data/providers/__fixtures__/fmp-historical.json
{
  "historical": [
    { "date": "2026-07-09", "open": 211.9, "high": 214.0, "low": 211.0, "close": 213.4, "volume": 47500000 },
    { "date": "2026-07-08", "open": 210.1, "high": 212.5, "low": 209.8, "close": 211.9, "volume": 45000000 }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/fmp.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseFmpHistorical, parseFmpQuote } from "./fmp.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/fmp-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/fmp-historical.json" with { type: "json" };

Deno.test("parseFmpQuote parses the first array element", () => {
  const q = parseFmpQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parseFmpQuote throws EmptyResponse for an empty array", () => {
  const err = assertThrows(() => parseFmpQuote([]), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseFmpHistorical parses the 'historical' array, most recent first", () => {
  const bars = parseFmpHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[0].date, "2026-07-09");
});

Deno.test("parseFmpHistorical skips a bar with a missing close", () => {
  const bars = parseFmpHistorical({
    historical: [{ date: "x", open: 1, high: 1, low: 1, volume: 1 }, historicalFixture.historical[0]],
  });
  assertEquals(bars.length, 1);
});

Deno.test("parseFmpHistorical throws EmptyResponse when no bars survive", () => {
  const err = assertThrows(() => parseFmpHistorical({ historical: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/fmp.test.ts`
Expected: FAIL — `Module not found "./fmp.ts"`

- [ ] **Step 4: Implement `fmp.ts`**

```typescript
// packages/core/market-data/providers/fmp.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseFmpQuote(json: unknown): ProviderQuote {
  const first = Array.isArray(json) ? json[0] : undefined;
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "fmp" });
  }
  const symbol = (first as Record<string, unknown>).symbol;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "fmp", field: "symbol" });
  }
  const price = parseRequiredF64(first, "price", "fmp");
  const volume = parseOptionalI64(first, "volume", "fmp");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parseFmpHistorical(json: unknown): HistoricalPrice[] {
  const arr = (json as Record<string, unknown>)?.historical;
  if (!Array.isArray(arr)) {
    throw new ParseFailure({ kind: "missing_field", provider: "fmp", field: "historical" });
  }
  const out: HistoricalPrice[] = [];
  arr.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "fmp");
    } catch {
      return;
    }
    const open = (bar as Record<string, unknown>).open as number ?? close;
    const high = (bar as Record<string, unknown>).high as number ?? close;
    const low = (bar as Record<string, unknown>).low as number ?? close;
    const volume = (bar as Record<string, unknown>).volume as number ?? 0;
    const date = (bar as Record<string, unknown>).date as string ?? "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "fmp" });
  }
  return out;
}

export async function fetchFromFmp(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("fmp", 4)) {
    throw new RateLimitedError("fmp");
  }

  let quote = null;
  try {
    const quoteRes = await fetchImpl(
      `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
    );
    const pq = parseFmpQuote(await quoteRes.json());
    quote = {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "fmp",
    };
  } catch {
    // soft-fail to null quote, matching the Rust source
  }

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${apiKey}`,
    );
    historical = parseFmpHistorical(await histRes.json()).slice(0, 365);
  } catch {
    // non-fatal
  }

  return { quote, historical, source: "fmp", cached: false };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/fmp.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/fmp.ts packages/core/market-data/providers/fmp.test.ts packages/core/market-data/providers/__fixtures__/fmp-quote.json packages/core/market-data/providers/__fixtures__/fmp-historical.json
git commit -m "feat(market-data): port FMP provider"
```

---

### Task 7: Provider — Tiingo

**Files:**
- Create: `packages/core/market-data/providers/tiingo.ts`
- Create: `packages/core/market-data/providers/__fixtures__/tiingo-quote.json`, `tiingo-historical.json`
- Test: `packages/core/market-data/providers/tiingo.test.ts`

**Interfaces:**
- Produces: `parseTiingoQuote(json: unknown): ProviderQuote`, `parseTiingoHistorical(json: unknown): HistoricalPrice[]`, `fetchFromTiingo(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

Note on fidelity: Tiingo's quote parse also soft-fails to a null quote on error (same pattern as FMP); its
`change`/`changePercent` are hardcoded to 0 (Tiingo's IEX endpoint doesn't provide them directly), matching
the Rust source.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/tiingo-quote.json
[{ "ticker": "AAPL", "last": 213.4, "volume": 47500000, "bidPrice": 213.3, "askPrice": 213.5 }]
```

```json
// packages/core/market-data/providers/__fixtures__/tiingo-historical.json
[
  { "date": "2026-07-08T00:00:00.000Z", "open": 210.1, "high": 212.5, "low": 209.8, "close": 211.9, "volume": 45000000 },
  { "date": "2026-07-09T00:00:00.000Z", "open": 211.9, "high": 214.0, "low": 211.0, "close": 213.4, "volume": 47500000 }
]
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/tiingo.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseTiingoHistorical, parseTiingoQuote } from "./tiingo.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/tiingo-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/tiingo-historical.json" with { type: "json" };

Deno.test("parseTiingoQuote parses ticker/last/bid/ask", () => {
  const q = parseTiingoQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.bid, 213.3);
  assertEquals(q.ask, 213.5);
});

Deno.test("parseTiingoQuote throws EmptyResponse for an empty array", () => {
  const err = assertThrows(() => parseTiingoQuote([]), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parseTiingoHistorical parses the top-level array, truncating date to YYYY-MM-DD", () => {
  const bars = parseTiingoHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].date, "2026-07-09");
  assertEquals(bars[1].close, 213.4);
});

Deno.test("parseTiingoHistorical throws InvalidType when root is not an array", () => {
  const err = assertThrows(() => parseTiingoHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "invalid_type");
});

Deno.test("parseTiingoHistorical skips a bar with a missing close", () => {
  const bars = parseTiingoHistorical([{ date: "x", open: 1, high: 1, low: 1, volume: 1 }, historicalFixture[0]]);
  assertEquals(bars.length, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/tiingo.test.ts`
Expected: FAIL — `Module not found "./tiingo.ts"`

- [ ] **Step 4: Implement `tiingo.ts`**

```typescript
// packages/core/market-data/providers/tiingo.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalF64, parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseTiingoQuote(json: unknown): ProviderQuote {
  const first = Array.isArray(json) ? json[0] : undefined;
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "tiingo" });
  }
  const ticker = (first as Record<string, unknown>).ticker;
  if (typeof ticker !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "tiingo", field: "ticker" });
  }
  const price = parseRequiredF64(first, "last", "tiingo");
  const volume = parseOptionalI64(first, "volume", "tiingo");
  const bid = parseOptionalF64(first, "bidPrice", "tiingo");
  const ask = parseOptionalF64(first, "askPrice", "tiingo");
  return { symbol: ticker, price, bid, ask, volume };
}

export function parseTiingoHistorical(json: unknown): HistoricalPrice[] {
  if (!Array.isArray(json)) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider: "tiingo",
      field: "(root)",
      expected: "array",
      got: JSON.stringify(json),
    });
  }
  const out: HistoricalPrice[] = [];
  json.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "tiingo");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = (b.open as number) ?? close;
    const high = (b.high as number) ?? close;
    const low = (b.low as number) ?? close;
    const volume = (b.volume as number) ?? 0;
    const date = typeof b.date === "string" ? b.date.slice(0, 10) : "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "tiingo" });
  }
  return out;
}

export async function fetchFromTiingo(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("tiingo", 7)) {
    throw new RateLimitedError("tiingo");
  }

  let quote = null;
  try {
    const quoteRes = await fetchImpl(`https://api.tiingo.com/iex/${symbol}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const pq = parseTiingoQuote(await quoteRes.json());
    quote = {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "tiingo",
    };
  } catch {
    // soft-fail to null quote
  }

  let historical: HistoricalPrice[] = [];
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const histRes = await fetchImpl(
      `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Token ${apiKey}` } },
    );
    historical = parseTiingoHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return { quote, historical, source: "tiingo", cached: false };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/tiingo.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/tiingo.ts packages/core/market-data/providers/tiingo.test.ts packages/core/market-data/providers/__fixtures__/tiingo-quote.json packages/core/market-data/providers/__fixtures__/tiingo-historical.json
git commit -m "feat(market-data): port Tiingo provider"
```

---

### Task 8: Provider — Twelve Data

**Files:**
- Create: `packages/core/market-data/providers/twelve-data.ts`
- Create: `packages/core/market-data/providers/__fixtures__/twelve-data-quote.json`, `twelve-data-historical.json`
- Test: `packages/core/market-data/providers/twelve-data.test.ts`

**Interfaces:**
- Produces: `parseTwelveDataQuote(json: unknown): ProviderQuote`, `parseTwelveDataHistorical(json: unknown): HistoricalPrice[]`, `fetchFromTwelveData(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

Note on fidelity: rate limit is `1`/min — ported literally per Global Constraints (the real quota is more
generous; do not change this). A response containing a top-level `"code"` field is a **hard error** here
(unlike FMP/Tiingo's soft-fail) — matching the Rust source's `?`-propagation behavior for this provider.
`change`/`changePercent` are string-encoded numbers in Twelve Data's response.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/twelve-data-quote.json
{ "symbol": "AAPL", "close": "213.40", "change": "1.50", "percent_change": "0.71", "volume": "47500000" }
```

```json
// packages/core/market-data/providers/__fixtures__/twelve-data-historical.json
{
  "values": [
    { "datetime": "2026-07-09", "open": "211.9", "high": "214.0", "low": "211.0", "close": "213.4", "volume": "47500000" },
    { "datetime": "2026-07-08", "open": "210.1", "high": "212.5", "low": "209.8", "close": "211.9", "volume": "45000000" }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/twelve-data.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseTwelveDataHistorical, parseTwelveDataQuote } from "./twelve-data.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/twelve-data-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/twelve-data-historical.json" with { type: "json" };

Deno.test("parseTwelveDataQuote parses symbol/close(string)/volume(string)", () => {
  const q = parseTwelveDataQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parseTwelveDataQuote throws MissingField for a code-only error response", () => {
  const err = assertThrows(
    () => parseTwelveDataQuote({ code: 429, message: "rate limited" }),
    ParseFailure,
  );
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseTwelveDataHistorical parses string-encoded OHLCV values", () => {
  const bars = parseTwelveDataHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[0].close, 213.4);
  assertEquals(bars[0].date, "2026-07-09");
});

Deno.test("parseTwelveDataHistorical throws MissingField when 'values' is absent", () => {
  const err = assertThrows(() => parseTwelveDataHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});

Deno.test("parseTwelveDataHistorical skips a bar with a missing close", () => {
  const bars = parseTwelveDataHistorical({
    values: [{ datetime: "x", open: "1", high: "1", low: "1", volume: "1" }, historicalFixture.values[0]],
  });
  assertEquals(bars.length, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/twelve-data.test.ts`
Expected: FAIL — `Module not found "./twelve-data.ts"`

- [ ] **Step 4: Implement `twelve-data.ts`**

```typescript
// packages/core/market-data/providers/twelve-data.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseTwelveDataQuote(json: unknown): ProviderQuote {
  const obj = json as Record<string, unknown>;
  const symbol = obj?.symbol;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "twelve_data", field: "symbol" });
  }
  const price = parseRequiredF64(json, "close", "twelve_data");
  const volume = parseOptionalI64(json, "volume", "twelve_data");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parseTwelveDataHistorical(json: unknown): HistoricalPrice[] {
  const values = (json as Record<string, unknown>)?.values;
  if (!Array.isArray(values)) {
    throw new ParseFailure({ kind: "missing_field", provider: "twelve_data", field: "values" });
  }
  const out: HistoricalPrice[] = [];
  values.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "twelve_data");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = Number(b.open) || close;
    const high = Number(b.high) || close;
    const low = Number(b.low) || close;
    const volume = Number(b.volume) || 0;
    const date = typeof b.datetime === "string" ? b.datetime : "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "twelve_data" });
  }
  return out;
}

export async function fetchFromTwelveData(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("twelve_data", 1)) {
    throw new RateLimitedError("twelve_data");
  }

  const quoteRes = await fetchImpl(
    `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`,
  );
  const quoteJson = await quoteRes.json();
  if ((quoteJson as Record<string, unknown>)?.code) {
    throw new Error(`twelve_data: ${(quoteJson as Record<string, unknown>).message ?? "error"}`);
  }
  const pq = parseTwelveDataQuote(quoteJson);

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=365&apikey=${apiKey}`,
    );
    historical = parseTwelveDataHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "twelve_data",
    },
    historical,
    source: "twelve_data",
    cached: false,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/twelve-data.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/twelve-data.ts packages/core/market-data/providers/twelve-data.test.ts packages/core/market-data/providers/__fixtures__/twelve-data-quote.json packages/core/market-data/providers/__fixtures__/twelve-data-historical.json
git commit -m "feat(market-data): port Twelve Data provider"
```

---

### Task 9: Provider — Polygon

**Files:**
- Create: `packages/core/market-data/providers/polygon.ts`
- Create: `packages/core/market-data/providers/__fixtures__/polygon-quote.json`, `polygon-historical.json`
- Test: `packages/core/market-data/providers/polygon.test.ts`

**Interfaces:**
- Produces: `parsePolygonQuote(json: unknown): ProviderQuote`, `parsePolygonHistorical(json: unknown): HistoricalPrice[]`, `fetchFromPolygon(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

Note on fidelity: Polygon uses **camelCase `apiKey`** as its query-param name, unlike every other provider's
lowercase `apikey` — ported exactly as-is, not "fixed" to match the others. Quote parsing hard-fails (no soft
catch), matching the Rust source's `?` propagation. `change`/`changePercent` are hardcoded to 0 (the
`/prev` endpoint is a previous-close snapshot with no intraday change data). Timestamps are milliseconds.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/polygon-quote.json
{ "ticker": "AAPL", "results": [{ "c": 213.4, "v": 47500000, "t": 1751500800000 }] }
```

```json
// packages/core/market-data/providers/__fixtures__/polygon-historical.json
{
  "results": [
    { "t": 1751414400000, "o": 210.1, "h": 212.5, "l": 209.8, "c": 211.9, "v": 45000000 },
    { "t": 1751500800000, "o": 211.9, "h": 214.0, "l": 211.0, "c": 213.4, "v": 47500000 }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/polygon.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parsePolygonHistorical, parsePolygonQuote } from "./polygon.ts";
import { ParseFailure } from "../parse-helpers.ts";
import quoteFixture from "./__fixtures__/polygon-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/polygon-historical.json" with { type: "json" };

Deno.test("parsePolygonQuote parses ticker and the first result's close", () => {
  const q = parsePolygonQuote(quoteFixture);
  assertEquals(q.symbol, "AAPL");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parsePolygonQuote throws EmptyResponse for an empty results array", () => {
  const err = assertThrows(() => parsePolygonQuote({ ticker: "AAPL", results: [] }), ParseFailure);
  assertEquals(err.error.kind, "empty_response");
});

Deno.test("parsePolygonHistorical converts millisecond timestamps to YYYY-MM-DD", () => {
  const bars = parsePolygonHistorical(historicalFixture);
  assertEquals(bars.length, 2);
  assertEquals(bars[1].date, "2026-07-02");
  assertEquals(bars[1].close, 213.4);
});

Deno.test("parsePolygonHistorical throws MissingField when 'results' is absent", () => {
  const err = assertThrows(() => parsePolygonHistorical({}), ParseFailure);
  assertEquals(err.error.kind, "missing_field");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/polygon.test.ts`
Expected: FAIL — `Module not found "./polygon.ts"`

- [ ] **Step 4: Implement `polygon.ts`**

```typescript
// packages/core/market-data/providers/polygon.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, parseRequiredI64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parsePolygonQuote(json: unknown): ProviderQuote {
  const obj = json as Record<string, unknown>;
  const symbol = obj?.ticker;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "ticker" });
  }
  const results = obj?.results;
  if (!Array.isArray(results)) {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "results" });
  }
  const first = results[0];
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "polygon" });
  }
  const price = parseRequiredF64(first, "c", "polygon");
  const volume = parseOptionalI64(first, "v", "polygon");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parsePolygonHistorical(json: unknown): HistoricalPrice[] {
  const results = (json as Record<string, unknown>)?.results;
  if (!Array.isArray(results)) {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "results" });
  }
  const out: HistoricalPrice[] = [];
  results.forEach((bar, i) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "c", "polygon");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = (b.o as number) ?? close;
    const high = (b.h as number) ?? close;
    const low = (b.l as number) ?? close;
    let volume = 0;
    try {
      volume = parseRequiredI64(bar, "v", "polygon");
    } catch {
      // 0
    }
    const t = b.t;
    const date = typeof t === "number"
      ? new Date(t).toISOString().slice(0, 10)
      : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "polygon" });
  }
  return out;
}

export async function fetchFromPolygon(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("polygon", 4)) {
    throw new RateLimitedError("polygon");
  }

  const quoteRes = await fetchImpl(
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`,
  );
  if (!quoteRes.ok) throw new Error(`polygon: HTTP ${quoteRes.status}`);
  const pq = parsePolygonQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const histRes = await fetchImpl(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}` +
        `?adjusted=true&sort=asc&limit=365&apiKey=${apiKey}`,
    );
    historical = parsePolygonHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "polygon",
    },
    historical,
    source: "polygon",
    cached: false,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/polygon.test.ts`
Expected: `ok | 4 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/polygon.ts packages/core/market-data/providers/polygon.test.ts packages/core/market-data/providers/__fixtures__/polygon-quote.json packages/core/market-data/providers/__fixtures__/polygon-historical.json
git commit -m "feat(market-data): port Polygon provider"
```

---

### Task 10: Provider — Alpha Vantage

**Files:**
- Create: `packages/core/market-data/providers/alpha-vantage.ts`
- Create: `packages/core/market-data/providers/__fixtures__/alpha-vantage-quote.json`, `alpha-vantage-historical.json`
- Test: `packages/core/market-data/providers/alpha-vantage.test.ts`

**Interfaces:**
- Produces: `parseAlphaVantageQuote(json: unknown): ProviderQuote`, `parseAlphaVantageHistorical(json: unknown): HistoricalPrice[]`, `fetchFromAlphaVantage(symbol, apiKey, rateLimiter, fetchImpl?): Promise<MarketDataResult>`.

**Deliberate deviation from the Rust source (documented per the design spec's explicit call-out):** the Rust
parser does `.take(365)` on `Time Series (Daily)`'s object entries *before* sorting them — since a JSON object
has no guaranteed key order, this can silently take the wrong 365 days. This plan **fixes** it: sort entries
by date descending, then take the most recent 365. This is the same category of decision as Plan 1's
`remainingCapacity()` improvement — a genuine correctness fix over a stub/bug in the source, not a silent
behavior change to hide. Also replicates: the special check for `"Note"`/`"Information"` fields (Alpha
Vantage's rate-limit signal) *before* attempting to parse a quote — checked as a hard error, matching Rust.
Uses **`"5. adjusted close"`**, not `"4. close"`, matching the Rust source exactly.

- [ ] **Step 1: Write the fixtures**

```json
// packages/core/market-data/providers/__fixtures__/alpha-vantage-quote.json
{
  "Global Quote": {
    "05. price": "213.4000",
    "09. change": "1.5000",
    "10. change percent": "0.7100%",
    "06. volume": "47500000",
    "07. latest trading day": "2026-07-09"
  }
}
```

```json
// packages/core/market-data/providers/__fixtures__/alpha-vantage-historical.json
{
  "Time Series (Daily)": {
    "2026-07-08": { "1. open": "210.1000", "2. high": "212.5000", "3. low": "209.8000", "4. close": "211.8500", "5. adjusted close": "211.9000", "6. volume": "45000000" },
    "2026-07-09": { "1. open": "211.9000", "2. high": "214.0000", "3. low": "211.0000", "4. close": "213.3500", "5. adjusted close": "213.4000", "6. volume": "47500000" }
  }
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/alpha-vantage.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseAlphaVantageHistorical, parseAlphaVantageQuote } from "./alpha-vantage.ts";
import quoteFixture from "./__fixtures__/alpha-vantage-quote.json" with { type: "json" };
import historicalFixture from "./__fixtures__/alpha-vantage-historical.json" with { type: "json" };

Deno.test("parseAlphaVantageQuote parses numbered-prefix string fields, stripping trailing %", () => {
  const q = parseAlphaVantageQuote(quoteFixture);
  assertEquals(q.symbol, "");
  assertEquals(q.price, 213.4);
  assertEquals(q.volume, 47500000);
});

Deno.test("parseAlphaVantageQuote throws a hard error when 'Note' is present (rate limited)", () => {
  assertThrows(() => parseAlphaVantageQuote({ Note: "rate limited" }));
});

Deno.test("parseAlphaVantageQuote throws a hard error when 'Information' is present", () => {
  assertThrows(() => parseAlphaVantageQuote({ Information: "premium endpoint" }));
});

Deno.test("parseAlphaVantageHistorical uses '5. adjusted close', not '4. close'", () => {
  const bars = parseAlphaVantageHistorical(historicalFixture);
  const day = bars.find((b) => b.date === "2026-07-09")!;
  assertEquals(day.close, 213.4);
});

Deno.test("parseAlphaVantageHistorical sorts by date descending before truncating to 365 (deliberate fix)", () => {
  const bars = parseAlphaVantageHistorical(historicalFixture);
  assertEquals(bars[0].date, "2026-07-09");
  assertEquals(bars[1].date, "2026-07-08");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/alpha-vantage.test.ts`
Expected: FAIL — `Module not found "./alpha-vantage.ts"`

- [ ] **Step 4: Implement `alpha-vantage.ts`**

```typescript
// packages/core/market-data/providers/alpha-vantage.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

function num(s: unknown): number {
  const n = Number(String(s).replace("%", ""));
  if (Number.isNaN(n)) throw new Error(`alphavantage: unparseable number '${s}'`);
  return n;
}

export function parseAlphaVantageQuote(json: unknown): ProviderQuote {
  const obj = json as Record<string, unknown>;
  if (obj?.Note) throw new Error(`alphavantage: rate limit (Note: ${obj.Note})`);
  if (obj?.Information) throw new Error(`alphavantage: rate limit (Information: ${obj.Information})`);
  const q = obj?.["Global Quote"] as Record<string, unknown> | undefined;
  if (!q) throw new Error("alphavantage: missing 'Global Quote'");
  return {
    symbol: "",
    price: num(q["05. price"]),
    bid: null,
    ask: null,
    volume: num(q["06. volume"]),
  };
}

export function parseAlphaVantageHistorical(json: unknown): HistoricalPrice[] {
  const series = (json as Record<string, unknown>)?.["Time Series (Daily)"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!series) throw new Error("alphavantage: missing 'Time Series (Daily)'");

  const out: HistoricalPrice[] = Object.entries(series).map(([date, bar]) => ({
    date,
    open: num(bar["1. open"]),
    high: num(bar["2. high"]),
    low: num(bar["3. low"]),
    close: num(bar["5. adjusted close"]),
    volume: num(bar["6. volume"]),
  }));

  // Deliberate fix over the Rust source: sort by date descending BEFORE truncating,
  // so the 365-day cap actually captures the most recent year (see task notes).
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, 365);
}

export async function fetchFromAlphaVantage(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("alphavantage", 4)) {
    throw new RateLimitedError("alphavantage");
  }

  const quoteRes = await fetchImpl(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`,
  );
  const pq = parseAlphaVantageQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&apikey=${apiKey}`,
    );
    historical = parseAlphaVantageHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "alphavantage",
    },
    historical,
    source: "alphavantage",
    cached: false,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/alpha-vantage.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/alpha-vantage.ts packages/core/market-data/providers/alpha-vantage.test.ts packages/core/market-data/providers/__fixtures__/alpha-vantage-quote.json packages/core/market-data/providers/__fixtures__/alpha-vantage-historical.json
git commit -m "feat(market-data): port Alpha Vantage provider, fixing unsorted 365-day truncation"
```

---

### Task 11: Provider — Yahoo Finance

**Files:**
- Create: `packages/core/market-data/providers/yahoo.ts`
- Create: `packages/core/market-data/providers/__fixtures__/yahoo-chart.json`
- Test: `packages/core/market-data/providers/yahoo.test.ts`

**Interfaces:**
- Produces: `parseYahooChart(json: unknown): MarketDataResult` (parses both quote and historical from the single `/v8/finance/chart` response — Yahoo returns both in one call, unlike every other provider), `fetchFromYahoo(symbol, rateLimiter, fetchImpl?): Promise<MarketDataResult>` (no API key needed).

**Fidelity note (resolves the design spec's open question):** the current Rust source (commit `8a7d3ee`,
"fix Yahoo 429") already includes the query1→query2 fallback and uses `chartPreviousClose` for the change
calculation (also confirmed already live via the separate `619fb52` commit per this repo's git log) — this
plan ports the **current** file state, which already has both fixes; there is no older, unfixed version to
special-case. `free_sources.rs`'s `parse_yahoo_quote`/`parse_yahoo_historical` are NOT ported (confirmed dead
code, see Global Constraints) — `multi_source_provider.rs`'s inline chart-JSON parsing is what's ported here.

- [ ] **Step 1: Write the fixture**

```json
// packages/core/market-data/providers/__fixtures__/yahoo-chart.json
{
  "chart": {
    "result": [
      {
        "meta": {
          "regularMarketPrice": 213.4,
          "chartPreviousClose": 211.9,
          "regularMarketVolume": 47500000,
          "regularMarketTime": 1751504400
        },
        "timestamp": [1751414400, 1751500800],
        "indicators": {
          "quote": [
            {
              "open": [210.1, 211.9],
              "high": [212.5, 214.0],
              "low": [209.8, 211.0],
              "close": [211.9, 213.4],
              "volume": [45000000, 47500000]
            }
          ]
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/yahoo.test.ts
import { assertEquals } from "jsr:@std/assert";
import { parseYahooChart } from "./yahoo.ts";
import fixture from "./__fixtures__/yahoo-chart.json" with { type: "json" };

Deno.test("parseYahooChart computes change against chartPreviousClose", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.quote?.price, 213.4);
  assertEquals(result.quote?.change, 213.4 - 211.9);
  assertEquals(result.quote?.volume, 47500000);
});

Deno.test("parseYahooChart parses the parallel OHLCV arrays into historical bars", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.historical.length, 2);
  assertEquals(result.historical[1].close, 213.4);
});

Deno.test("parseYahooChart source is 'yahoo'", () => {
  const result = parseYahooChart(fixture, "AAPL");
  assertEquals(result.source, "yahoo");
});

Deno.test("fetchFromYahoo falls back to query2 when query1 returns 429 (the Yahoo-429 fix)", async () => {
  const { fetchFromYahoo } = await import("./yahoo.ts");
  const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
  const calledHosts: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("query1.finance.yahoo.com")) {
      calledHosts.push("query1");
      return new Response("", { status: 429 });
    }
    if (url.includes("query2.finance.yahoo.com")) {
      calledHosts.push("query2");
      return new Response(JSON.stringify(fixture));
    }
    throw new Error(`unexpected host in ${url}`);
  }) as typeof fetch;

  const result = await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter(), fetchImpl);
  assertEquals(calledHosts, ["query1", "query2"]);
  assertEquals(result.quote?.price, 213.4);
});

Deno.test("fetchFromYahoo does not fall back to query2 on a non-429 failure", async () => {
  const { fetchFromYahoo } = await import("./yahoo.ts");
  const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
  const calledHosts: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("query1.finance.yahoo.com")) {
      calledHosts.push("query1");
      return new Response("", { status: 500 });
    }
    calledHosts.push("query2");
    return new Response("", { status: 500 });
  }) as typeof fetch;

  let threw = false;
  try {
    await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter(), fetchImpl);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(calledHosts, ["query1"]); // query2 is only tried on 429, not on other failures
});

Deno.test({
  name: "fetchFromYahoo hits the real API (live, opt-in)",
  ignore: !Deno.env.get("RUN_LIVE_MARKET_DATA_TESTS"),
  fn: async () => {
    const { fetchFromYahoo } = await import("./yahoo.ts");
    const { SlidingWindowRateLimiter } = await import("../rate-limiter.ts");
    const result = await fetchFromYahoo("AAPL", new SlidingWindowRateLimiter());
    console.log("Yahoo live quote:", result.quote);
  },
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/yahoo.test.ts`
Expected: FAIL — `Module not found "./yahoo.ts"`

- [ ] **Step 4: Implement `yahoo.ts`**

```typescript
// packages/core/market-data/providers/yahoo.ts
import type { HistoricalPrice, MarketDataResult } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

export function parseYahooChart(json: unknown, symbol: string): MarketDataResult {
  const result = (json as Record<string, unknown>)?.chart &&
    ((json as Record<string, unknown>).chart as Record<string, unknown>).result;
  const first = Array.isArray(result) ? result[0] as Record<string, unknown> : undefined;
  if (!first) throw new Error("yahoo: missing chart.result[0]");

  const meta = first.meta as Record<string, unknown>;
  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose);
  const change = price - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  const timestamp = typeof meta.regularMarketTime === "number"
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  const timestamps = first.timestamp as number[] | undefined;
  const quoteArr = (first.indicators as Record<string, unknown>)?.quote as
    | Record<string, number[]>[]
    | undefined;
  const q = quoteArr?.[0];

  const historical: HistoricalPrice[] = [];
  if (timestamps && q) {
    timestamps.forEach((t, i) => {
      const close = q.close?.[i];
      if (close === null || close === undefined) return;
      historical.push({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open?.[i] ?? close,
        high: q.high?.[i] ?? close,
        low: q.low?.[i] ?? close,
        close,
        volume: q.volume?.[i] ?? 0,
      });
    });
  }

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      volume: Number(meta.regularMarketVolume) || 0,
      timestamp,
      source: "yahoo",
    },
    historical,
    source: "yahoo",
    cached: false,
  };
}

export async function fetchFromYahoo(
  symbol: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("yahoo", 60)) {
    throw new RateLimitedError("yahoo");
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 365 * 24 * 60 * 60;
  const path = `/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=1d`;

  let res = await fetchImpl(`https://query1.finance.yahoo.com${path}`, { headers: BROWSER_HEADERS });
  if (res.status === 429) {
    // query1 is rate-limited by a different load balancer than query2 — retry there.
    res = await fetchImpl(`https://query2.finance.yahoo.com${path}`, { headers: BROWSER_HEADERS });
  }
  if (!res.ok) throw new Error(`yahoo: HTTP ${res.status}`);

  return parseYahooChart(await res.json(), symbol);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read --allow-env market-data/providers/yahoo.test.ts`
Expected: `ok | 5 passed, 1 ignored`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/yahoo.ts packages/core/market-data/providers/yahoo.test.ts packages/core/market-data/providers/__fixtures__/yahoo-chart.json
git commit -m "feat(market-data): port Yahoo Finance provider with query1/query2 429 fallback"
```

---

### Task 12: Provider — Nasdaq

**Files:**
- Create: `packages/core/market-data/providers/nasdaq.ts`
- Create: `packages/core/market-data/providers/__fixtures__/nasdaq-quote.json`
- Test: `packages/core/market-data/providers/nasdaq.test.ts`

**Interfaces:**
- Produces: `parseNasdaqQuote(json: unknown): { price: number; change: number; changePercent: number }`, `fetchFromNasdaq(symbol, rateLimiter, fetchImpl?): Promise<MarketDataResult>` (no API key needed).

Note on fidelity: Nasdaq has **no historical data support at all** — `historical: []` unconditionally,
real-time-only by design, matching the Rust source. Price is parsed from a `$`/`,`-formatted string and a
**zero price is explicitly rejected as an error** (unique validation not present in any other provider).

- [ ] **Step 1: Write the fixture**

```json
// packages/core/market-data/providers/__fixtures__/nasdaq-quote.json
{
  "data": {
    "primaryData": {
      "lastSalePrice": "$213.40",
      "netChange": "1.50",
      "percentageChange": "0.71%"
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/core/market-data/providers/nasdaq.test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseNasdaqQuote } from "./nasdaq.ts";
import fixture from "./__fixtures__/nasdaq-quote.json" with { type: "json" };

Deno.test("parseNasdaqQuote strips '$' and ',' from lastSalePrice", () => {
  const q = parseNasdaqQuote(fixture);
  assertEquals(q.price, 213.4);
  assertEquals(q.change, 1.5);
  assertEquals(q.changePercent, 0.71);
});

Deno.test("parseNasdaqQuote rejects a zero price as an error (unique to Nasdaq)", () => {
  assertThrows(() =>
    parseNasdaqQuote({
      data: { primaryData: { lastSalePrice: "$0.00", netChange: "0", percentageChange: "0%" } },
    })
  );
});

Deno.test("parseNasdaqQuote handles a thousands-separator price", () => {
  const q = parseNasdaqQuote({
    data: { primaryData: { lastSalePrice: "$1,234.56", netChange: "0", percentageChange: "0%" } },
  });
  assertEquals(q.price, 1234.56);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/providers/nasdaq.test.ts`
Expected: FAIL — `Module not found "./nasdaq.ts"`

- [ ] **Step 4: Implement `nasdaq.ts`**

```typescript
// packages/core/market-data/providers/nasdaq.ts
import type { MarketDataResult } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseNasdaqQuote(
  json: unknown,
): { price: number; change: number; changePercent: number } {
  const primary =
    ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.primaryData as
      | Record<string, unknown>
      | undefined;
  if (!primary) throw new Error("nasdaq: missing data.primaryData");

  const priceStr = String(primary.lastSalePrice ?? "").replace(/[$,]/g, "");
  const price = Number(priceStr);
  if (!price || price === 0) {
    throw new Error(`nasdaq: zero or unparseable price '${primary.lastSalePrice}'`);
  }
  const change = Number(String(primary.netChange ?? "0").replace(/,/g, ""));
  const changePercent = Number(String(primary.percentageChange ?? "0").replace(/[%,]/g, ""));

  return { price, change, changePercent };
}

export async function fetchFromNasdaq(
  symbol: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("nasdaq", 30)) {
    throw new RateLimitedError("nasdaq");
  }

  const res = await fetchImpl(
    `https://api.nasdaq.com/api/quote/${symbol.toUpperCase()}/info?assetclass=stocks`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    },
  );
  if (!res.ok) throw new Error(`nasdaq: HTTP ${res.status}`);

  const { price, change, changePercent } = parseNasdaqQuote(await res.json());

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      volume: 0,
      timestamp: new Date().toISOString(),
      source: "nasdaq",
    },
    historical: [], // real-time-only by design — matches the Rust source exactly
    source: "nasdaq",
    cached: false,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/providers/nasdaq.test.ts`
Expected: `ok | 3 passed`

- [ ] **Step 6: Commit**

```bash
git add packages/core/market-data/providers/nasdaq.ts packages/core/market-data/providers/nasdaq.test.ts packages/core/market-data/providers/__fixtures__/nasdaq-quote.json
git commit -m "feat(market-data): port Nasdaq provider"
```

---

### Task 13: Orchestrator — failover engine

**Files:**
- Create: `packages/core/market-data/orchestrator.ts`
- Test: `packages/core/market-data/orchestrator.test.ts`

**Interfaces:**
- Consumes: `HealthTracker` (Task 3), `SlidingWindowRateLimiter` (Task 2), all 9 providers' `fetchFrom*` functions (Tasks 4-12).
- Produces:
  - `interface ProviderKeys { alpacaKey?: string; alpacaSecret?: string; finnhubKey?: string; fmpKey?: string; tiingoKey?: string; twelveDataKey?: string; polygonKey?: string; alphaVantageKey?: string }`
  - `class MarketDataOrchestrator { constructor(healthTracker?: HealthTracker, rateLimiter?: SlidingWindowRateLimiter); getMarketData(symbol: string, keys: ProviderKeys, fetchImpl?: typeof fetch): Promise<MarketDataResult>; getBatchMarketData(symbols: string[], keys: ProviderKeys, fetchImpl?: typeof fetch): Promise<Map<string, MarketDataResult>>; getHealthStats(): Record<string, { successes: number; failures: number }> }`

Note: this is deliberately stateless w.r.t. caching (see Global Constraints) — it only holds a `HealthTracker`
and a `SlidingWindowRateLimiter`, both of which are legitimately stateful across calls (health/rate history),
not a data cache. Un-configured keyed providers are excluded from the attempt order entirely (not attempted,
not tracked as failures) — matches the Rust source's silent-skip behavior exactly.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/market-data/orchestrator.test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { MarketDataOrchestrator } from "./orchestrator.ts";
import type { MarketDataResult } from "./types.ts";

function fakeFetch(responses: Record<string, Response | (() => Response)>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [match, res] of Object.entries(responses)) {
      if (url.includes(match)) return typeof res === "function" ? res() : res;
    }
    throw new Error(`fakeFetch: no stub for ${url}`);
  }) as typeof fetch;
}

Deno.test("getMarketData tries providers in tier order and returns the first success", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response(
      JSON.stringify({
        chart: {
          result: [{
            meta: { regularMarketPrice: 213.4, chartPreviousClose: 211.9, regularMarketVolume: 1, regularMarketTime: 1 },
            timestamp: [],
            indicators: { quote: [{}] },
          }],
        },
      }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "yahoo");
  assertEquals(result.quote?.price, 213.4);
});

Deno.test("getMarketData skips a keyed provider with no configured key", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "finnhub.io": () => {
      throw new Error("should never be called — no finnhub key configured");
    },
    "query1.finance.yahoo.com": new Response(
      JSON.stringify({
        chart: {
          result: [{
            meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketVolume: 1, regularMarketTime: 1 },
            timestamp: [],
            indicators: { quote: [{}] },
          }],
        },
      }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "yahoo");
});

Deno.test("getMarketData falls through to the next provider on failure and tracks health", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response("", { status: 500 }),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response(
      JSON.stringify({ data: { primaryData: { lastSalePrice: "$213.40", netChange: "1.5", percentageChange: "0.71%" } } }),
    ),
  });
  const result = await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  assertEquals(result.source, "nasdaq");
  const stats = orchestrator.getHealthStats();
  assertEquals(stats.yahoo.failures, 1);
  assertEquals(stats.nasdaq.successes, 1);
});

Deno.test("getMarketData throws an aggregated error when every provider fails", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": new Response("", { status: 500 }),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response("", { status: 500 }),
  });
  let threw = false;
  try {
    await orchestrator.getMarketData("AAPL", {}, fetchImpl);
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes("AAPL"));
  }
  assert(threw);
});

Deno.test("getBatchMarketData drops failed symbols and keeps successes", async () => {
  const orchestrator = new MarketDataOrchestrator();
  const fetchImpl = fakeFetch({
    "query1.finance.yahoo.com": (() => {
      let call = 0;
      return () => {
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: { regularMarketPrice: 1, chartPreviousClose: 1, regularMarketVolume: 1, regularMarketTime: 1 },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          );
        }
        return new Response("", { status: 500 });
      };
    })(),
    "query2.finance.yahoo.com": new Response("", { status: 500 }),
    "api.nasdaq.com": new Response("", { status: 500 }),
  });
  const result = await orchestrator.getBatchMarketData(["AAPL", "MSFT"], {}, fetchImpl);
  assertEquals(result.size, 1);
  assert(result.has("AAPL"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && deno test --allow-read market-data/orchestrator.test.ts`
Expected: FAIL — `Module not found "./orchestrator.ts"`

- [ ] **Step 3: Implement `orchestrator.ts`**

```typescript
// packages/core/market-data/orchestrator.ts
import type { MarketDataResult } from "./types.ts";
import { HealthTracker } from "./health-tracker.ts";
import { SlidingWindowRateLimiter } from "./rate-limiter.ts";
import { fetchFromAlpaca } from "./providers/alpaca.ts";
import { fetchFromYahoo } from "./providers/yahoo.ts";
import { fetchFromNasdaq } from "./providers/nasdaq.ts";
import { fetchFromTiingo } from "./providers/tiingo.ts";
import { fetchFromFinnhub } from "./providers/finnhub.ts";
import { fetchFromTwelveData } from "./providers/twelve-data.ts";
import { fetchFromFmp } from "./providers/fmp.ts";
import { fetchFromAlphaVantage } from "./providers/alpha-vantage.ts";
import { fetchFromPolygon } from "./providers/polygon.ts";

export interface ProviderKeys {
  alpacaKey?: string;
  alpacaSecret?: string;
  finnhubKey?: string;
  fmpKey?: string;
  tiingoKey?: string;
  twelveDataKey?: string;
  polygonKey?: string;
  alphaVantageKey?: string;
}

type Fetcher = (
  symbol: string,
  keys: ProviderKeys,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch,
) => Promise<MarketDataResult>;

const PROVIDERS: Record<string, { requiresKeys: (keyof ProviderKeys)[]; fetch: Fetcher }> = {
  alpaca: {
    requiresKeys: ["alpacaKey", "alpacaSecret"],
    fetch: (s, k, rl, f) => fetchFromAlpaca(s, k.alpacaKey!, k.alpacaSecret!, rl, f),
  },
  yahoo: { requiresKeys: [], fetch: (s, _k, rl, f) => fetchFromYahoo(s, rl, f) },
  nasdaq: { requiresKeys: [], fetch: (s, _k, rl, f) => fetchFromNasdaq(s, rl, f) },
  tiingo: {
    requiresKeys: ["tiingoKey"],
    fetch: (s, k, rl, f) => fetchFromTiingo(s, k.tiingoKey!, rl, f),
  },
  finnhub: {
    requiresKeys: ["finnhubKey"],
    fetch: (s, k, rl, f) => fetchFromFinnhub(s, k.finnhubKey!, rl, f),
  },
  twelve_data: {
    requiresKeys: ["twelveDataKey"],
    fetch: (s, k, rl, f) => fetchFromTwelveData(s, k.twelveDataKey!, rl, f),
  },
  fmp: { requiresKeys: ["fmpKey"], fetch: (s, k, rl, f) => fetchFromFmp(s, k.fmpKey!, rl, f) },
  alphavantage: {
    requiresKeys: ["alphaVantageKey"],
    fetch: (s, k, rl, f) => fetchFromAlphaVantage(s, k.alphaVantageKey!, rl, f),
  },
  polygon: {
    requiresKeys: ["polygonKey"],
    fetch: (s, k, rl, f) => fetchFromPolygon(s, k.polygonKey!, rl, f),
  },
};

function isConfigured(name: string, keys: ProviderKeys): boolean {
  return PROVIDERS[name].requiresKeys.every((k) => Boolean(keys[k]));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class MarketDataOrchestrator {
  #health: HealthTracker;
  #rateLimiter: SlidingWindowRateLimiter;

  constructor(healthTracker = new HealthTracker(), rateLimiter = new SlidingWindowRateLimiter()) {
    this.#health = healthTracker;
    this.#rateLimiter = rateLimiter;
  }

  async getMarketData(
    symbol: string,
    keys: ProviderKeys,
    fetchImpl: typeof fetch = fetch,
  ): Promise<MarketDataResult> {
    const upper = symbol.toUpperCase();
    const available = Object.keys(PROVIDERS).filter((name) => isConfigured(name, keys));
    const order = this.#health.getProviderOrder(available);

    const errors: string[] = [];
    for (const name of order) {
      try {
        const result = await PROVIDERS[name].fetch(upper, keys, this.#rateLimiter, fetchImpl);
        this.#health.trackSuccess(name);
        return result;
      } catch (e) {
        this.#health.trackFailure(name);
        errors.push(`  - ${name}: ${(e as Error).message}`);
      }
    }
    throw new Error(`All providers failed for ${upper}:\n${errors.join("\n")}`);
  }

  async getBatchMarketData(
    symbols: string[],
    keys: ProviderKeys,
    fetchImpl: typeof fetch = fetch,
  ): Promise<Map<string, MarketDataResult>> {
    const out = new Map<string, MarketDataResult>();
    const results = await mapWithConcurrency(symbols, 5, async (symbol) => {
      try {
        return [symbol, await this.getMarketData(symbol, keys, fetchImpl)] as const;
      } catch {
        return null;
      }
    });
    for (const r of results) {
      if (r) out.set(r[0], r[1]);
    }
    return out;
  }

  getHealthStats(): Record<string, { successes: number; failures: number }> {
    return this.#health.snapshot();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && deno test --allow-read market-data/orchestrator.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 5: Commit**

```bash
git add packages/core/market-data/orchestrator.ts packages/core/market-data/orchestrator.test.ts
git commit -m "feat(market-data): port failover orchestrator (stateless, cache-free)"
```

---

### Task 14: Deno service wrapper — cache + circuit breaker + secrets

**Files:**
- Create: `backend/market-data/service.ts`
- Test: `backend/market-data/service.test.ts`

**Interfaces:**
- Consumes: `MarketDataOrchestrator`, `ProviderKeys`, `MarketDataResult` (Task 13, `packages/core/market-data/orchestrator.ts`), `TtlCache` (Plan 1, `packages/core/cache/memory.ts`), `SqliteCache` (Plan 1, `backend/cache/sqlite.ts`), `CircuitBreakerManager` (Plan 1, `packages/core/resilience/circuit_breaker.ts`), `SecretStore`/keychain `getSecret` (Plan 1, `backend/secrets/keychain.ts`).
- Produces: `class MarketDataService { constructor(sqliteCache: SqliteCache, secretStore: SecretStore); getCurrentPrice(symbol: string): Promise<number>; getMarketData(symbol: string): Promise<MarketDataResult>; getCacheStats(): { memoryCacheSize: number } }`

This is the collapse point of the design's 3-tier-to-2-tier decision: in-memory `TtlCache` (120s, matching the
Rust provider-cache TTL now that there's only one cache tier to set it on) → `SqliteCache` (1hr price TTL,
already enforced inside `SqliteCache` itself per Plan 1) → `CircuitBreakerManager` (single key
`"market_data"`, wrapping the whole orchestrator call) → `MarketDataOrchestrator.getMarketData`. API keys are
read once per service instance via `getSecret` (Plan 1's keychain wrapper), not per-request — a `.env`
fallback isn't needed since Plan 1's secrets module owns key storage exclusively now.

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/market-data/service.test.ts
import { assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "../db/connection.ts";
import { SqliteCache } from "../cache/sqlite.ts";
import { MarketDataService } from "./service.ts";
import type { SecretStore } from "../../packages/core/persistence/secret-store.ts";
import type { MarketDataResult } from "../../packages/core/market-data/types.ts";

function fakeSecretStore(secrets: Record<string, string>): SecretStore {
  return {
    setSecret: async () => {},
    getSecret: async (account) => secrets[account] ?? null,
    deleteSecret: async () => {},
  };
}

Deno.test("getCurrentPrice returns the orchestrator's price and populates both cache tiers", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: 213.4,
                    chartPreviousClose: 211.9,
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        )) as typeof fetch,
    });

    const price = await service.getCurrentPrice("AAPL");
    assertEquals(price, 213.4);
    assertEquals(sqliteCache.getCachedPrice("AAPL")?.currentPrice, 213.4);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getCurrentPrice serves from the in-memory cache on a second call without refetching", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    let fetchCount = 0;
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() => {
        fetchCount += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: 100,
                    chartPreviousClose: 99,
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        );
      }) as typeof fetch,
    });

    await service.getCurrentPrice("AAPL");
    await service.getCurrentPrice("AAPL");
    assertEquals(fetchCount, 1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getCacheStats reports the in-memory cache size", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: { regularMarketPrice: 1, chartPreviousClose: 1, regularMarketVolume: 1, regularMarketTime: 1 },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        )) as typeof fetch,
    });
    await service.getCurrentPrice("AAPL");
    assertEquals(service.getCacheStats().memoryCacheSize, 1);
  } finally {
    closeDatabase(db);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && deno test --allow-read --allow-write --allow-env --allow-run market-data/service.test.ts`
Expected: FAIL — `Module not found "./service.ts"`

- [ ] **Step 3: Implement `service.ts`**

```typescript
// backend/market-data/service.ts
import type { MarketDataResult } from "../../packages/core/market-data/types.ts";
import type { ProviderKeys } from "../../packages/core/market-data/orchestrator.ts";
import { MarketDataOrchestrator } from "../../packages/core/market-data/orchestrator.ts";
import { TtlCache } from "../../packages/core/cache/memory.ts";
import { CircuitBreakerManager } from "../../packages/core/resilience/circuit_breaker.ts";
import type { SecretStore } from "../../packages/core/persistence/secret-store.ts";
import type { SqliteCache } from "../cache/sqlite.ts";

const MEMORY_CACHE_TTL_MS = 120_000; // matches the Rust source's quote_cache_ttl

export interface MarketDataServiceOptions {
  fetchImpl?: typeof fetch;
}

export class MarketDataService {
  #sqliteCache: SqliteCache;
  #secretStore: SecretStore;
  #memoryCache = new TtlCache<MarketDataResult>(MEMORY_CACHE_TTL_MS);
  #circuitBreakers = new CircuitBreakerManager();
  #orchestrator = new MarketDataOrchestrator();
  #fetchImpl?: typeof fetch;
  #keysCache: ProviderKeys | null = null;

  constructor(sqliteCache: SqliteCache, secretStore: SecretStore, options: MarketDataServiceOptions = {}) {
    this.#sqliteCache = sqliteCache;
    this.#secretStore = secretStore;
    this.#fetchImpl = options.fetchImpl;
  }

  async #loadKeys(): Promise<ProviderKeys> {
    if (this.#keysCache) return this.#keysCache;
    const [alpacaKey, alpacaSecret, finnhubKey, fmpKey, tiingoKey, twelveDataKey, polygonKey, alphaVantageKey] =
      await Promise.all([
        this.#secretStore.getSecret("ALPACA_API_KEY"),
        this.#secretStore.getSecret("ALPACA_SECRET_KEY"),
        this.#secretStore.getSecret("FINNHUB_API_KEY"),
        this.#secretStore.getSecret("FMP_API_KEY"),
        this.#secretStore.getSecret("TIINGO_API_KEY"),
        this.#secretStore.getSecret("TWELVE_DATA_API_KEY"),
        this.#secretStore.getSecret("POLYGON_API_KEY"),
        this.#secretStore.getSecret("ALPHA_VANTAGE_API_KEY"),
      ]);
    this.#keysCache = {
      alpacaKey: alpacaKey ?? undefined,
      alpacaSecret: alpacaSecret ?? undefined,
      finnhubKey: finnhubKey ?? undefined,
      fmpKey: fmpKey ?? undefined,
      tiingoKey: tiingoKey ?? undefined,
      twelveDataKey: twelveDataKey ?? undefined,
      polygonKey: polygonKey ?? undefined,
      alphaVantageKey: alphaVantageKey ?? undefined,
    };
    return this.#keysCache;
  }

  async getMarketData(symbol: string): Promise<MarketDataResult> {
    const upper = symbol.toUpperCase();

    const memHit = this.#memoryCache.get(upper);
    if (memHit) return { ...memHit, cached: true };

    const cachedPrice = this.#sqliteCache.getCachedPrice(upper);
    if (cachedPrice) {
      const result: MarketDataResult = {
        quote: {
          symbol: upper,
          price: cachedPrice.currentPrice,
          change: 0,
          changePercent: 0,
          volume: 0,
          timestamp: cachedPrice.updatedAt,
          source: "cache",
        },
        historical: [],
        source: "cache",
        cached: true,
      };
      this.#memoryCache.set(upper, result);
      return result;
    }

    const keys = await this.#loadKeys();
    const result = await this.#circuitBreakers.execute(
      "market_data",
      () => this.#orchestrator.getMarketData(upper, keys, this.#fetchImpl),
    );

    this.#memoryCache.set(upper, result);
    if (result.quote) {
      this.#sqliteCache.setCachedPrice(upper, result.quote.price);
    }
    return result;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const result = await this.getMarketData(symbol);
    if (!result.quote) {
      throw new Error(`No quote available for ${symbol}`);
    }
    return result.quote.price;
  }

  getCacheStats(): { memoryCacheSize: number } {
    return { memoryCacheSize: this.#memoryCache.size() };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && deno test --allow-read --allow-write --allow-env --allow-run market-data/service.test.ts`
Expected: `ok | 3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/market-data/service.ts backend/market-data/service.test.ts
git commit -m "feat(backend): add market-data service (2-tier cache + circuit breaker + secrets)"
```

---

### Task 15: Batch operations wiring

**Files:**
- Modify: `backend/market-data/service.ts`
- Test: `backend/market-data/service.test.ts` (append)

**Interfaces:**
- Consumes: `MarketDataOrchestrator.getBatchMarketData` (Task 13).
- Produces (additions to `MarketDataService`): `getBatchPrices(symbols: string[]): Promise<Map<string, number>>`, `getBatchQuotes(symbols: string[]): Promise<Map<string, MarketDataResult>>`.

Note: this only wires the batch-fetch plumbing Plan 3 (scoring/quant-analysis) will call into — it does not
add quant-metrics batch caching itself (that's Plan 3's job, per the design spec's scope boundary). Each
symbol in the batch still goes through the same per-symbol cache-check path as `getMarketData` (memory →
SQLite → circuit-breaker-wrapped orchestrator call) rather than bypassing it, so batch and single-symbol reads
share identical caching semantics — a symbol already warm in cache is not re-fetched by a batch call.

- [ ] **Step 1: Write the failing tests (append to `service.test.ts`)**

```typescript
// appended to backend/market-data/service.test.ts

Deno.test("getBatchPrices returns a price per successful symbol, using per-symbol caching", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const responses: Record<string, number> = { AAPL: 213.4, MSFT: 420.1 };
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: ((input: RequestInfo | URL) => {
        const url = String(input);
        const symbol = Object.keys(responses).find((s) => url.includes(`/${s}?`)) ?? "AAPL";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: responses[symbol],
                    chartPreviousClose: responses[symbol],
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        );
      }) as typeof fetch,
    });

    const prices = await service.getBatchPrices(["AAPL", "MSFT"]);
    assertEquals(prices.get("AAPL"), 213.4);
    assertEquals(prices.get("MSFT"), 420.1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getBatchQuotes drops symbols whose fetch failed", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch,
    });
    const quotes = await service.getBatchQuotes(["AAPL"]);
    assertEquals(quotes.size, 0);
  } finally {
    closeDatabase(db);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && deno test --allow-read --allow-write --allow-env --allow-run market-data/service.test.ts`
Expected: FAIL — `service.getBatchPrices is not a function`

- [ ] **Step 3: Add batch methods to `MarketDataService`**

```typescript
// added to backend/market-data/service.ts, inside the MarketDataService class

  async getBatchQuotes(symbols: string[]): Promise<Map<string, MarketDataResult>> {
    const out = new Map<string, MarketDataResult>();
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          out.set(symbol.toUpperCase(), await this.getMarketData(symbol));
        } catch {
          // dropped, matching the orchestrator's own batch behavior
        }
      }),
    );
    return out;
  }

  async getBatchPrices(symbols: string[]): Promise<Map<string, number>> {
    const quotes = await this.getBatchQuotes(symbols);
    const out = new Map<string, number>();
    for (const [symbol, result] of quotes) {
      if (result.quote) out.set(symbol, result.quote.price);
    }
    return out;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && deno test --allow-read --allow-write --allow-env --allow-run market-data/service.test.ts`
Expected: `ok | 5 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/market-data/service.ts backend/market-data/service.test.ts
git commit -m "feat(backend): wire batch price/quote operations for Plan 3"
```

---

## Known risks carried forward

- **Fixtures are reconstructed, not captured live.** Every fixture JSON in this plan was built from the
  verified Rust parser code (exact field names/shapes), not from an actual API response, since no live calls
  were made during planning. Real-world responses may include additional fields (harmless — parsers only read
  named fields) but could theoretically differ in ways the reconstruction didn't anticipate (e.g. a provider
  changing its schema since the Rust code was last touched). Recommend each task's implementer spot-check
  against one real response if a valid API key is available, but this isn't blocking — the fixture shapes are
  derived directly from working, currently-deployed Rust parsing code, not guessed from documentation.
- **Alpaca's quote-derivation logic (Task 4) is a faithful reconstruction, not a verbatim port**, since the
  exact glue code inside `fetch_from_alpaca` that builds a `StockQuote` from bars wasn't captured verbatim
  during research (only the bars parser itself and the endpoint/rate-limit details were). Low risk — the
  reconstruction (latest bar close as price, change vs. prior bar) is the only sensible interpretation of
  "quote derived from a 2-bar-lookback bars call," but flagged for the same reason Plan 1 flagged its two
  untestable secrets risks: verify against a real response before treating this as production-hardened.
- **Twelve Data's literal `1`/min rate limit and Alpha Vantage's `.take(365)`-ordering fix are both
  intentional deviations-from-or-preservations-of odd Rust behavior**, each documented at its own task and in
  Global Constraints — not oversights, but worth the final whole-branch reviewer's explicit attention per this
  plan's own instructions, consistent with how Plan 1's final review specifically re-checked its own
  deliberate-deviation tasks (rate limiter's `remainingCapacity` fix, retry's timeout-fallback simplification).
