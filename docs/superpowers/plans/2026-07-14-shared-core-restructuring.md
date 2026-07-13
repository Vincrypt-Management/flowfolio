# Shared-Core Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Deno-agnostic modules from Plan 1's `backend/` (the three resilience primitives and the in-memory TTL cache) into a new `packages/core` npm workspace member, and define `SecretStore`/`CacheStore` interfaces there that `backend/`'s existing Deno-specific implementations conform to — so market-data/scoring/backtest logic built in later plans lives in `packages/core` from the start, shareable with a future React Native mobile app.

**Architecture:** `packages/core/` is a plain-TypeScript npm workspace member (no Deno-specific APIs anywhere in it), tested via `deno test` for now (since it has zero runtime-specific dependencies, this works today; a future RN app would run the same source under Metro/Jest without modification). `backend/` keeps its Deno-only pieces (`db/`, `cache/sqlite.ts`, `secrets/keychain.ts`) but they now implement interfaces declared in `packages/core/persistence/`.

**Tech Stack:** Same as Plan 1 (Deno 2.9+, TypeScript). This plan adds an npm `"workspaces"` field to the repo root `package.json` — the first time this repo has used npm workspaces — but `packages/core` itself has no npm dependencies of its own.

## Global Constraints

- No `any` types (carried over from Plan 1).
- Pure relocation for Task 1's four modules: same code, same behavior, same tests — verify via re-running the existing tests from their new location, not by writing new tests.
- Do not modify `src-tauri/`, `.github/workflows/*`, `src/`, or any existing root `package.json` script/dependency other than adding a `"workspaces"` field.
- Do not build the React Native app, its adapters, or any RN-specific code in this plan — `packages/core`'s interfaces are consumed only by `backend/` in this plan.
- All `deno test`/`deno lint`/`deno task` commands for `packages/core/` must be run with cwd=`packages/core/` (same class of workspace-config-resolution reasoning as `backend/` from Plan 1 — verify this empirically at Task 1 rather than assuming, since `packages/core` has no `node:sqlite` dependency and may not need this at all; record what you find).

---

### Task 1: `packages/core` workspace scaffold + relocate resilience and in-memory cache

**Files:**
- Create: `packages/core/deno.json`
- Create: `packages/core/package.json`
- Create: `packages/core/resilience/circuit_breaker.ts` (moved from `backend/resilience/circuit_breaker.ts`)
- Create: `packages/core/resilience/circuit_breaker.test.ts` (moved from `backend/resilience/circuit_breaker.test.ts`)
- Create: `packages/core/resilience/retry.ts` (moved from `backend/resilience/retry.ts`)
- Create: `packages/core/resilience/retry.test.ts` (moved from `backend/resilience/retry.test.ts`)
- Create: `packages/core/resilience/rate_limiter.ts` (moved from `backend/resilience/rate_limiter.ts`)
- Create: `packages/core/resilience/rate_limiter.test.ts` (moved from `backend/resilience/rate_limiter.test.ts`)
- Create: `packages/core/cache/memory.ts` (moved from `backend/cache/memory.ts`)
- Create: `packages/core/cache/memory.test.ts` (moved from `backend/cache/memory.test.ts`)
- Delete: `backend/resilience/circuit_breaker.ts`, `backend/resilience/circuit_breaker.test.ts`, `backend/resilience/retry.ts`, `backend/resilience/retry.test.ts`, `backend/resilience/rate_limiter.ts`, `backend/resilience/rate_limiter.test.ts`, `backend/cache/memory.ts`, `backend/cache/memory.test.ts`
- Modify: `package.json` (repo root — add `"workspaces"` field)

**Interfaces:**
- Consumes: nothing (these four modules have zero external dependencies beyond `jsr:@std/assert` in their tests — confirmed in Plan 1's review).
- Produces: `CircuitBreaker`, `CircuitBreakerManager`, `CircuitOpenError`, `defaultCircuitBreakerConfig` (from `resilience/circuit_breaker.ts`); `RetryExecutor`, `retry`, `retryNetwork`, `retryRateLimited`, and the four config presets (from `resilience/retry.ts`); `RateLimiter`, `RateLimitExceededError` (from `resilience/rate_limiter.ts`); `TtlCache` (from `cache/memory.ts`) — all now importable from `packages/core/...` instead of `backend/...`. No signatures change.

- [ ] **Step 1: Create the `packages/core` Deno workspace config**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  },
  "tasks": {
    "test": "deno test --allow-read ."
  },
  "fmt": {
    "include": ["."]
  }
}
```

Write this to `packages/core/deno.json`.

- [ ] **Step 2: Create `packages/core`'s npm package manifest**

```json
{
  "name": "@flowfolio/core",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Write this to `packages/core/package.json`. This has no dependencies today (the four modules being moved in use no npm or JSR runtime packages, only `jsr:@std/assert` in tests, which Deno resolves directly) — it exists so a future npm/Metro consumer (the React Native app, not built in this plan) can resolve `@flowfolio/core` via workspace linking.

- [ ] **Step 3: Move the four modules and their tests**

```bash
mkdir -p packages/core/resilience packages/core/cache
git mv backend/resilience/circuit_breaker.ts packages/core/resilience/circuit_breaker.ts
git mv backend/resilience/circuit_breaker.test.ts packages/core/resilience/circuit_breaker.test.ts
git mv backend/resilience/retry.ts packages/core/resilience/retry.ts
git mv backend/resilience/retry.test.ts packages/core/resilience/retry.test.ts
git mv backend/resilience/rate_limiter.ts packages/core/resilience/rate_limiter.ts
git mv backend/resilience/rate_limiter.test.ts packages/core/resilience/rate_limiter.test.ts
git mv backend/cache/memory.ts packages/core/cache/memory.ts
git mv backend/cache/memory.test.ts packages/core/cache/memory.test.ts
```

Do not edit the moved files' contents — this step is a pure relocation. `backend/resilience/` will now be empty (remove the empty directory if `git mv` leaves it); `backend/cache/` still has `sqlite.ts`/`sqlite.test.ts`, so it stays.

- [ ] **Step 4: Run the relocated tests to confirm they still pass from the new location**

Run: `cd packages/core && deno test --allow-read .`
Expected: `ok | 39 passed | 0 failed` (15 circuit breaker + 14 retry + 3 rate limiter + 7 memory cache, per Plan 1's final counts)

If this fails with an import-resolution or `node:*`-type-related error (rather than a genuine logic failure), record exactly what you see and what cwd/command you used — this is the empirical check the Global Constraints section asks for regarding whether `packages/core` needs the same `backend/`-style invocation-directory workaround Plan 1 needed for `node:sqlite`. These four modules import nothing from `node:*`, so the expectation is that no such workaround is needed here — confirm or refute that with the actual command output, don't assume.

- [ ] **Step 5: Add the `workspaces` field to the repo root `package.json`**

Add `"workspaces": ["packages/*"]` to the top-level of the root `package.json` (it currently has no `workspaces` field — verify this is still true before editing, in case something changed). Place it near `"private"`/`"type"` at the top of the file, not nested inside `"dependencies"` or any other block.

- [ ] **Step 6: Verify the root npm project still installs and runs cleanly**

Run: `npm install` (from the repo root)
Expected: installs without error; a `node_modules/@flowfolio/core` symlink (or workspace-linked equivalent) now exists, pointing at `packages/core`.

Run: `npm run lint` (from the repo root)
Expected: same pass/fail state as before this task (this task doesn't touch `src/`, so lint results for existing frontend code should be unaffected — if `npm run lint` was already failing before this task for unrelated reasons, that's fine and out of scope; if it newly fails because of this task's changes, that's a regression to fix).

- [ ] **Step 7: Commit**

```bash
git add packages/core backend/resilience backend/cache package.json
git commit -m "refactor: relocate resilience + in-memory cache to packages/core

Pure relocation of Plan 1's Deno-agnostic modules (circuit breaker,
retry, rate limiter, in-memory TTL cache) into a shared npm workspace
package, so future business logic can be written once and shared
with a future React Native mobile app. No behavior change."
```

---

### Task 2: Define `SecretStore`/`CacheStore` interfaces and conform `backend/`'s implementations

**Files:**
- Create: `packages/core/persistence/secret-store.ts`
- Create: `packages/core/persistence/cache-store.ts`
- Modify: `backend/secrets/keychain.ts`
- Modify: `backend/cache/sqlite.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 (this task's new files don't depend on the relocated resilience/cache modules).
- Produces: `interface SecretStore` and `interface CacheStore` (with all the `Cached*`/`DailyPrice`/`CacheStats` types they reference), both importable from `packages/core/persistence/...`. `backend/secrets/keychain.ts` and `backend/cache/sqlite.ts` gain compile-time conformance to these interfaces with no behavior change — later plans (and eventually a future RN adapter) code against the interfaces, not the concrete Deno implementations.

- [ ] **Step 1: Create the `SecretStore` interface**

```typescript
// packages/core/persistence/secret-store.ts

export interface SecretStore {
  setSecret(account: string, value: string): Promise<void>;
  getSecret(account: string): Promise<string | null>;
  deleteSecret(account: string): Promise<void>;
}
```

- [ ] **Step 2: Create the `CacheStore` interface**

First, read `backend/cache/sqlite.ts` in full to copy its exact current type definitions (`CachedPrice`, `CachedQuantMetrics`, `DailyPrice`, `CachedSentiment`, `CachedAnalystRating`, `CacheStats`) verbatim — don't retype them from memory, since a field-name mismatch here would silently defeat the point of the interface.

```typescript
// packages/core/persistence/cache-store.ts

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

export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

export interface CacheStore {
  getCachedPrice(symbol: string): CachedPrice | undefined;
  setCachedPrice(symbol: string, price: number): void;
  getCachedQuantMetrics(symbol: string): CachedQuantMetrics | undefined;
  setCachedQuantMetrics(m: Omit<CachedQuantMetrics, "updatedAt">): void;
  getCachedHistoricalPrices(symbol: string): DailyPrice[] | undefined;
  setCachedHistoricalPrices(symbol: string, prices: DailyPrice[]): void;
  getCachedSentiment(symbol: string): CachedSentiment | undefined;
  setCachedSentiment(s: Omit<CachedSentiment, "updatedAt">): void;
  getCachedAnalystRating(symbol: string): CachedAnalystRating | undefined;
  setCachedAnalystRating(r: Omit<CachedAnalystRating, "updatedAt">): void;
  clearExpiredCache(): void;
  getCacheStats(): CacheStats;
}
```

If anything here doesn't match what you read in `backend/cache/sqlite.ts`, trust the file you read, not this block — fix the mismatch and note it in your report.

- [ ] **Step 3: Run `deno check` on the two new files (from within `packages/core`) to confirm they're syntactically valid on their own**

Run: `cd packages/core && deno check persistence/secret-store.ts persistence/cache-store.ts`
Expected: no errors (these are pure type declarations with no logic).

- [ ] **Step 4: Make `backend/cache/sqlite.ts`'s `SqliteCache` class implement `CacheStore`**

Add an import at the top of `backend/cache/sqlite.ts`:

```typescript
import type { CacheStore } from "../../packages/core/persistence/cache-store.ts";
```

Change the class declaration from `export class SqliteCache {` to `export class SqliteCache implements CacheStore {`. Remove `sqlite.ts`'s own local `CachedPrice`/`CachedQuantMetrics`/`DailyPrice`/`CachedSentiment`/`CachedAnalystRating`/`CacheStats` interface definitions and instead import them from `packages/core/persistence/cache-store.ts` (the same import line above, extended to include the types this file's method signatures reference) — there should be exactly one definition of each of these types in the codebase after this change, in `packages/core`, not two.

- [ ] **Step 5: Make `backend/secrets/keychain.ts` conform to `SecretStore`**

`backend/secrets/keychain.ts` currently exports free functions (`setSecret`, `getSecret`, `deleteSecret`), not a class — `SecretStore` is an interface for an object/class shape. Add, at the bottom of `backend/secrets/keychain.ts`:

```typescript
import type { SecretStore } from "../../packages/core/persistence/secret-store.ts";

export const keychainSecretStore: SecretStore = { setSecret, getSecret, deleteSecret };
```

This is an additive compile-time check (if `setSecret`/`getSecret`/`deleteSecret`'s signatures ever drift from `SecretStore`, this line fails to compile) — it does not replace or change the existing free-function exports, which nothing outside this plan consumes yet.

- [ ] **Step 6: Run the full `backend/` test suite to confirm no regressions**

Run (from within `backend/`): `deno task test`
Expected: `ok | 24 passed | 0 failed` (Plan 1 shipped 63; Task 1 of this plan already relocated 39 of those into `packages/core`, leaving 63 − 39 = 24 in `backend/`. This task only adds type-level conformance on top of that — no behavior change.)

- [ ] **Step 7: Commit**

```bash
git add packages/core/persistence backend/cache/sqlite.ts backend/secrets/keychain.ts
git commit -m "refactor: define SecretStore/CacheStore interfaces, conform backend/'s Deno implementations

Adds compile-time-checked interfaces in packages/core/persistence/
that backend/cache/sqlite.ts and backend/secrets/keychain.ts now
implement. No behavior change — this is groundwork for a future
React Native adapter implementing the same interfaces."
```

---

## Done criteria for this plan

- `cd packages/core && deno test --allow-read .` passes with zero failures (39 tests).
- `cd backend && deno task test` passes with zero failures (63 tests, unchanged from Plan 1).
- `npm install` and `npm run lint` at the repo root behave the same as before this plan (no new failures introduced).
- `backend/resilience/` no longer exists (fully relocated); `backend/cache/` contains only `sqlite.ts`/`sqlite.test.ts`.
- `src-tauri/`, `.github/workflows/*`, and `src/` are untouched.
- Plan 2 (Market-data) can import resilience/cache primitives from `packages/core/...` instead of `backend/...` from the start.
