# FlowFolio: Shared-Core Restructuring for Desktop + Mobile

## Motivation

The overall goal is full feature parity with the current Rust/Tauri app, with zero Rust, entirely on the
TypeScript/JavaScript ecosystem, shipping to every platform the current app covers: desktop (macOS, Windows,
Linux) via Deno + `deno desktop`, and mobile (Android, iOS) via React Native. `src-tauri` and its CI/CD release
jobs stay in place until a real, shipping replacement exists for every platform they currently cover — this
restructuring does not touch `src-tauri` or `.github/workflows/release.yml`.

Plan 1 (Foundation, already merged to `main`) built `backend/resilience/`, `backend/cache/`, `backend/db/`,
and `backend/secrets/` for the Deno desktop app. Of those, `resilience/` and `cache/memory.ts` have zero
Deno-specific imports — they are plain TypeScript and would run unmodified under React Native's JS engine
(Hermes). `db/` (`node:sqlite`) and `secrets/keychain.ts` (`Deno.Command` subprocesses) are Deno-only and
cannot run under React Native at all.

This restructuring extracts the portable modules into a shared package now, before Plans 2-6 add more
business logic (market-data, scoring, backtest, portfolio, journal) on top of them — so that logic is written
once, in the shared package, from the start, rather than needing a second extraction pass later.

## Scope

In scope: relocate `backend/resilience/*` and `backend/cache/memory.ts` into a new shared workspace package;
define adapter interfaces for DB persistence and secrets storage that `backend/`'s existing Deno
implementations (`db/`, `cache/sqlite.ts`, `secrets/keychain.ts`) will conform to; update the Deno backend to
consume the shared package.

Out of scope (separate future work, explicitly not part of this plan):
- Building the React Native app itself (project scaffolding, screens, navigation, store distribution) — this
  needs its own brainstorming cycle.
- Writing the RN-side adapters (`op-sqlite`, `react-native-keychain`) that implement the interfaces this
  restructuring defines — those are built when the RN app is, against a real RN project, not speculatively
  now.
- Any change to `src-tauri`, `.github/workflows/release.yml`, or other CI/CD/release infrastructure.
- Plans 2-6 of the desktop migration (market-data, scoring, backtest/portfolio/vibe-studio, journal,
  bridge/packaging/cutover) — unaffected by this restructuring except that they will import from the shared
  package going forward instead of `backend/resilience/`/`backend/cache/memory.ts` directly.

## Architecture

**Package location:** `packages/core/` at the repo root, added as an npm workspace member (root
`package.json` gains a `"workspaces"` field including `packages/*`, if it doesn't already reference one — the
existing root `package.json` currently has no workspaces field, since `backend/` was deliberately kept
outside the npm project; `packages/core` is different from `backend/` in that it's meant to be a real npm
package consumed by multiple runtimes, not a Deno-only workspace).

**What moves in, unchanged:**
- `backend/resilience/circuit_breaker.ts` (+ test) → `packages/core/resilience/circuit_breaker.ts`
- `backend/resilience/retry.ts` (+ test) → `packages/core/resilience/retry.ts`
- `backend/resilience/rate_limiter.ts` (+ test) → `packages/core/resilience/rate_limiter.ts`
- `backend/cache/memory.ts` (+ test) → `packages/core/cache/memory.ts`

These four modules have zero Deno-specific imports (confirmed: only `Date.now()`, `Map`, `setTimeout`,
`Promise` — all standard JS). The move is a pure relocation: same code, same tests, same behavior.

**What stays in `backend/`, now implementing shared interfaces:**
- `backend/db/connection.ts`, `backend/cache/sqlite.ts` — Deno's `node:sqlite`-backed implementation of a new
  `packages/core/persistence/cache-store.ts` interface (see below).
- `backend/secrets/keychain.ts` — Deno's `Deno.Command`-backed implementation of a new
  `packages/core/persistence/secret-store.ts` interface.

**New interfaces in `packages/core/persistence/`:**

```typescript
// packages/core/persistence/secret-store.ts
export interface SecretStore {
  setSecret(account: string, value: string): Promise<void>;
  getSecret(account: string): Promise<string | null>;
  deleteSecret(account: string): Promise<void>;
}
```

```typescript
// packages/core/persistence/cache-store.ts
// Mirrors the exact public method signatures already shipped in backend/cache/sqlite.ts's
// SqliteCache class (CachedPrice, CachedQuantMetrics, DailyPrice, CachedSentiment,
// CachedAnalystRating, CacheStats types move here too, unchanged).
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

`backend/secrets/keychain.ts`'s existing `setSecret`/`getSecret`/`deleteSecret` free functions already match
`SecretStore`'s shape exactly — this task wraps them in a class (or object literal) that implements the
interface, rather than rewriting their internals. `backend/cache/sqlite.ts`'s `SqliteCache` class already
implements every method `CacheStore` declares — this task has it `implements CacheStore` explicitly (a
compile-time check that nothing was missed), with zero logic changes.

**Recorded assumption: `CacheStore` is fully synchronous.** Every method returns a plain value, not a
`Promise`, mirroring Deno's synchronous `node:sqlite`. This is a deliberate bet, not an oversight: it assumes
a future React Native SQLite adapter can also execute synchronously (e.g. `op-sqlite`'s `executeSync`, which
is the library this design anticipated using). Sync-vs-async is expensive to change once Plans 2-6 build
business logic against this interface — validate that the RN SQLite choice actually supports synchronous
execution as part of the future mobile-app brainstorming cycle, before those plans accumulate many callers of
`CacheStore`. If it turns out RN needs an async-only library, `CacheStore` (and everything built against it)
will need a breaking async refactor — better to confirm this early than discover it after Plans 2-6 ship.

**Consumption:**
- Deno (`backend/`) imports `packages/core` via relative file paths (Deno resolves relative TS imports
  directly, no package installation needed) — e.g. `import { CircuitBreaker } from
  "../../packages/core/resilience/circuit_breaker.ts"`.
- A future React Native app would import `packages/core` via normal npm workspace resolution through Metro
  (not built in this plan).

## Testing

The four relocated modules keep their existing `deno test` suites, run from their new location — pure
relocation, so this is a mechanical path-and-import update, not a rewrite. The two new interface files
(`secret-store.ts`, `cache-store.ts`) are type-only declarations with no runtime logic, so they don't need
their own tests; correctness is enforced by `backend/secrets/keychain.ts` and `backend/cache/sqlite.ts`
compiling against `implements SecretStore` / `implements CacheStore`.

## Out of scope / explicitly deferred

- RN-side adapters, the RN app itself, and RN's own test runner — all deferred to the future mobile
  brainstorming cycle referenced in Motivation.
- Whether `packages/core` needs a build/transpile step for RN consumption (Metro typically handles TS
  directly, but this is unverified without a real RN project to test against) — deferred to that same cycle.
- Any change to the existing root npm/Vite/Tauri app's behavior — this restructuring only adds a new
  workspace member and does not modify `src/`, `src-tauri/`, or the existing `package.json` scripts/deps
  beyond adding a `"workspaces"` field.
