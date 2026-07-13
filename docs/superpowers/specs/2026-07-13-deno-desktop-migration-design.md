# FlowFolio: Rust/Tauri → TypeScript/Deno Desktop Migration

## Motivation

Single-language codebase. The Rust backend (`src-tauri/`) and TypeScript frontend (`src/`) currently split
FlowFolio's logic across two languages and toolchains. The goal of this migration is to collapse everything
into TypeScript running on Deno, using Deno's new `deno desktop` command (Deno 2.9, released 2026-06-25) as
the native app shell — eliminating Rust and Tauri entirely.

## Context: what `deno desktop` actually is

`deno desktop` (introduced in Deno 2.9, ~3 weeks old at time of writing) compiles a Deno/TypeScript web
project into a self-contained native binary per OS, using the OS's native WebView by default (same
underlying approach as Tauri). It auto-detects supported frameworks, including Vite SSR. Frontend and
backend run in the **same process** — `window.bind()` exposes Deno functions directly to frontend JS
in-process (no IPC serialization round-trip), which is what replaces Tauri's `invoke()` command bridge.

This is explicitly experimental: Deno's own docs still recommend Tauri as the 2026 production default
(smaller binaries, capability-based security, audited, mobile targets). Known current gaps: no clipboard
access, no native file picker, a reported macOS window-close-button bug. There is also no ready-made
equivalent to Tauri Stronghold for secrets storage. This design proceeds with `deno desktop` anyway per
explicit decision — see Risks.

## Architecture

- **Frontend**: React 19 stays largely as-is. Vite SSR mode (one of `deno desktop`'s auto-detected
  frameworks) replaces the current Tauri+Vite setup.
- **Backend**: `src-tauri/src/{domain,infrastructure,api,modules,services}` becomes a single `src/backend/`
  tree of plain TypeScript modules, imported directly by the server entrypoint and exposed to the frontend
  via `window.bind()` instead of Tauri commands.
- **Packaging**: `deno desktop` builds frontend build output + backend code + Deno runtime + WebView into
  one native binary per OS, replacing `tauri build`.

Collapsing the 2-process model (React webview ↔ Rust sidecar) into 1 process also simplifies the resilience
layer — no more IPC failures to handle, only in-process errors.

## Module map

Each Rust module becomes an isolated TS module under `src/backend/`: one clear public `index.ts` entrypoint
per module, internals not imported elsewhere, independently testable.

```
src/backend/
  resilience/       circuitBreaker.ts, retry.ts, rateLimiter.ts        (was infrastructure/resilience)
  cache/            memory.ts (TTL map), sqlite.ts                    (was infrastructure/cache)
  db/               connection + migrations via node:sqlite           (was infrastructure/database)
  secrets/          OS-keychain wrapper                               (new — replaces Stronghold)
  market-data/      providers/{alpaca,finnhub,fmp,tiingo,twelvedata,polygon,alphavantage,yahoo}.ts
                    + health-based failover                          (was modules/data_provider + services/EnhancedMarketDataService)
  scoring/          factor-based scoring engine                      (was modules/scoring)
  quant-analysis/   metrics calc, Web Workers for heavy math          (was modules/quant_analysis + domain/analysis)
  backtest/         historical simulation, Web Workers per run        (was modules/backtest)
  portfolio/        holdings, buy-list, optimization                 (was modules/portfolio + domain/portfolio)
  journal/          journal entries + stats                          (was modules/journal)
  vibe-studio/      plan compiling + scoring integration              (was compile_plan/save_vibe_plan/run_scoring commands)
  bridge/           window.bind() registrations                      (was api/commands)
```

Dependency order (bottom-up — matters for build sequencing even under a big-bang cutover):
`resilience/cache/db/secrets` → `market-data` → `scoring`/`quant-analysis` → `backtest`/`portfolio`/
`vibe-studio` → `journal` (mostly standalone) → `bridge` wires everything to the frontend last.

## Cross-cutting concerns

- **DB**: reuse the existing SQLite schema as-is (`price_cache`, `quant_metrics_cache`,
  `historical_prices_cache`, etc.) — only the driver changes, to `node:sqlite` (built into Deno since 2.2).
  No data migration needed, same `.db` file format.
- **Caching**: the in-memory tier (currently `moka`) becomes a hand-rolled TTL-map wrapper (plain `Map` +
  expiry sweep). `dashmap`'s lock-free concurrent map has no needed TS equivalent — Deno's single-threaded
  event loop means no data races to guard against outside Web Workers, and workers don't share memory.
- **Resilience**: circuit breaker / retry-with-backoff / rate limiter are hand-rolled as three small,
  independent TS utilities (state machine, backoff loop, token bucket) — each simple enough not to warrant
  a dependency.
- **Secrets**: store API keys via OS-native keychain access (macOS Keychain / Windows Credential Manager /
  libsecret on Linux), called from Deno FFI (`Deno.dlopen`). **Open risk**: no confirmed ready-made Deno FFI
  binding to these exists yet (Node's `keytar` solves this via a prebuilt native addon per OS; no obvious
  Deno equivalent is confirmed). This likely requires writing/vendoring a small native shim per platform.
  **Must be spiked early** before committing to the rest of the plan.
- **Compute**: `backtest/` runs a Web Worker pool (sized to `navigator.hardwareConcurrency`), one worker per
  simulation/date-range chunk, results merged via `postMessage`. `quant-analysis/` only offloads to workers
  for genuinely large computations (big correlation matrices, long rolling windows) — small calculations run
  inline to skip worker-spawn overhead.

## Rollout strategy

Big-bang full rewrite: build the entire TypeScript backend + `deno desktop` shell in one pass, then cut over
all at once. The current Rust/Tauri app is tagged/branched as a rollback point before work starts, but not
run in parallel during development.

## Risks & accepted gaps

1. **Instability itself** — missing clipboard/file-picker, reported macOS close-button bug. To confirm during
   planning: does FlowFolio use clipboard or native file dialogs anywhere (CSV export from Journal/Portfolio,
   etc.)? If so, those features may be degraded until Deno closes the gaps upstream.
2. **Weaker security posture** — Tauri's capability-based permission model and `security_check.sh` (CSP/
   permission validation) have no `deno desktop` equivalent yet. A replacement security review process is
   needed, likely thinner than what exists today.
3. **Losing Rust's compile-time guarantees on financial math** — TS's single numeric type and lack of
   overflow/precision checks mean scoring/backtest/quant-analysis correctness now rests entirely on test
   coverage. The CODE_STANDARDS.md target (90% coverage on financial calculations) is a hard requirement
   here, not aspirational. Golden-output tests pin known outputs generated from the current Rust
   implementation before it's decommissioned, so a regression shows up as a failing test, not a wrong number
   in someone's portfolio.
4. **No incremental fallback** — big-bang means no partial-cutover safety net. The tagged/branched Rust/Tauri
   app is the only rollback path.

## Testing

`deno test` replaces `cargo test`. Golden-output tests: run identical inputs through both the old Rust code
and new TS code during development, diff results for parity, before the Rust code is removed.

## Out of scope for this design

- Exact secrets-FFI implementation (pending the spike in "Secrets" above)
- CI/release pipeline rewrite details
- Whether any Rust code is kept as WASM for specific hot paths (deferred — plain TS + Web Workers chosen
  as the starting point; revisit only if profiling shows a real bottleneck)
