# FlowFolio: Market-Data Migration (Plan 2)

## Motivation

Plan 1 (Foundation, merged) and the shared-core restructuring (merged) built resilience, caching, DB, and
secrets primitives, half of them already relocated to `packages/core` for future React Native sharing. Plan 2
ports the next layer: multi-source market-data fetching with health-based provider failover, currently
`src-tauri/src/modules/data_provider/` (~3,800 lines: `multi_source_provider.rs`, `free_sources.rs`,
`parse_helpers.rs`) and `src-tauri/src/services/enhanced_market_service.rs` (~977 lines).

Full parity requires all 9 providers this Rust code currently supports: Alpaca, Finnhub, FMP, Tiingo, Twelve
Data, Polygon, Alpha Vantage, Yahoo Finance, and Nasdaq (Nasdaq replaced Stooq/MarketWatch recently and isn't
yet reflected in CLAUDE.md's documented tier order — the actual current tier order, highest-priority first,
is: Alpaca, Yahoo, Nasdaq, Tiingo, Finnhub, Twelve Data, FMP, Alpha Vantage, Polygon).

## Key architectural finding: this module is almost entirely Deno-agnostic

Unlike Plan 1's DB/secrets layer, provider fetching is just HTTP calls (`fetch()`) and JSON parsing — no
`node:sqlite`, no `Deno.Command`, nothing Deno-specific. `fetch()` is a web-standard API available in Deno,
Node 18+, and React Native. This means nearly all of Plan 2 — types, parse helpers, rate limiting, health
tracking, all 9 provider fetchers, and the failover orchestrator — belongs in `packages/core/market-data/`,
not `backend/`. Only the final integration with Plan 1's Deno-specific `SqliteCache` needs a thin
`backend/`-side wrapper.

## Scope

**In scope**, all in `packages/core/market-data/`:
- Normalized types: `StockQuote`, `HistoricalPrice`, `MarketDataResult` (ported verbatim from
  `multi_source_provider.rs`'s Rust structs).
- Parse helpers (port of `parse_helpers.rs`'s safe JSON-field extraction with a typed `ParseError`).
- A sliding-window rate limiter (60s window, per-provider call count) — this is a **different, simpler**
  mechanism than Plan 1's `RateLimiter` (which is a fixed daily quota); port it as its own small module rather
  than forcing Plan 1's abstraction to fit, since the Rust source itself treats these as two independent
  mechanisms.
- A health tracker: per-provider success/failure counts → health score (`successes*100/(successes+failures)`,
  100 if never tried) plus the tier-priority table, producing the ordered provider list
  `(tier, health) descending` exactly as `get_provider_order()` does.
- All 9 provider fetch functions (`fetchFromAlpaca`, `fetchFromYahoo`, etc.), each calling its real HTTP
  endpoint and parsing into `MarketDataResult` — auth mechanism (header vs. query-param API key) and endpoint
  URLs ported exactly per provider, from the design-spec research.
- The orchestrator (`MultiSourceProvider` equivalent): iterate the ordered provider list, skip
  providers with no configured key, call each in turn, stop at first success, track health, aggregate errors
  if all fail. Batch fetch uses a bounded-concurrency `Promise.all` (limit 5, mirroring the Rust source's
  `buffer_unordered(5)`) — not real OS parallelism, so this maps directly with no special porting concern.

**In scope**, in `backend/market-data/` (Deno-specific):
- A thin service wrapping `packages/core/market-data`'s orchestrator with: in-memory TTL cache (Plan 1's
  `TtlCache`) → Plan 1's `SqliteCache` → orchestrator call → update both caches on success. This collapses
  the Rust source's 3-tier cache (service-level `HashMap` → DB → provider-level `DashMap`) down to 2 tiers —
  the provider-level in-Rust cache is redundant with the service-level one and adds nothing a TS port needs to
  replicate.
- Circuit breaker integration (Plan 1's `CircuitBreakerManager`, single key `"market_data"` wrapping the whole
  multi-provider cascade, matching the Rust source exactly).
- API keys read via Plan 1's `secrets` module (`getSecret("ALPACA_API_KEY")` etc.) rather than environment
  variables directly, now that Plan 1 built real OS-keychain storage.
- Batch operations (`getBatchPrices`, `getBatchQuotes`, `getBatchQuantMetrics` — quant metrics themselves are
  Plan 3's job, this just wires the batch-fetch plumbing that Plan 3 will call into).

**Explicitly deferred** (not part of this plan):
- `health.rs`'s global metrics singleton (`HEALTH_MONITOR`) — separate observability/diagnostics layer, not
  part of the failover decision itself. A simpler equivalent (or none at all) can be added later without
  blocking anything.
- `alpaca_service.rs` and `fundamental_service.rs` — separate code paths from the core quote/historical flow
  (fundamentals caching was already deferred in Plan 1 for the same reason: not on the critical path).
- The Tauri command bridge layer (`window.bind()` wiring) — that's Plan 6's job.

## Testing strategy

Provider fetch functions hit real third-party APIs — Plan 1 established the precedent of testing against real
systems (real SQLite, real macOS Keychain) rather than mocking, but real market-data APIs have cost/rate-limit
implications standard SQLite/Keychain calls don't. Recommend: unit-test parsing/normalization logic against
recorded/fixture JSON response bodies (committed as test fixtures, captured once from a real call each) rather
than live-calling every provider on every test run; reserve live calls for a small number of explicit
integration tests, clearly marked, not run by default in the fast test suite.

## Out of scope for this design

- Exact fixture-capture process (deferred to the implementation plan).
- Whether Yahoo's specific 429-handling fix (seen in recent Rust commit history) needs special replication —
  the implementation plan should read that commit's diff before porting Yahoo's fetcher, not just the current
  file state, since it may encode a hard-won fix.
