# FlowFolio 0.4.3–0.4.6 Release Design

**Date:** 2026-03-28
**Status:** Approved
**Author:** Brainstormed with Claude Code

---

## Overview

Continuation of the 0.4.x patch series after "Native Feel" (0.4.2). Four focused releases in sequence — each ships when its done criteria pass. No cross-patch blocking dependencies.

```
0.4.3  Fast Everywhere     performance profiling, bundle size, SQLite audit
0.4.4  Battle-Tested       Vitest, CI gates, coverage thresholds
0.4.5  Smarter Agent       AI quality, model, coverage, speed
0.4.6  Richer Data         tax harvesting, dividend calendar, options tracking
```

No 0.5.0 or 1.0 planned. The project stays on 0.4.x indefinitely.

---

## 0.4.3 — "Fast Everywhere"

Focus: find and fix the top performance bottlenecks on mobile. No new features.

### Profiling targets

- App startup time on mid-range Android (cold start → interactive)
- Top 3 render bottlenecks — likely heavy chart re-renders in `Dashboard.tsx`, large list rendering in `PortfolioTab`, unvirtualized `WatchlistTab`
- `EXPLAIN QUERY PLAN` audit on the 5 most-frequent SQLite queries
- Bundle size — follow up on Vite code splitting, lazy-load heavy tabs (Backtest, QuantDashboard)

### Fixes (scoped to what profiling finds)

- `React.memo` + `useMemo` on chart data transforms
- Virtualize long lists (`@tanstack/virtual` or native CSS `content-visibility`)
- Add missing SQLite indexes where query plan shows full scans
- Lazy-load at least 3 heavy tabs via `React.lazy` + `Suspense`

### Done criteria

- Cold start on Android Emulator (mid-range profile) ≤3s
- Bundle initial chunk ≤500KB gzip
- `EXPLAIN QUERY PLAN` shows no full table scans on the 5 audited queries
- `npm run build` still passes

---

## 0.4.4 — "Battle-Tested"

Focus: establish a real test foundation. `npm test` currently has nothing to run.

### Frontend (Vitest)

- Add `vitest` + `@vitest/coverage-v8` to devDependencies
- Add `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"` scripts
- Test all exported functions in `shared/utils/calculations.ts` — edge cases: zero values, negative returns, empty arrays, NaN. Target ≥90% coverage
- Integration tests for 3 main flows: create portfolio → run backtest → view results

### Backend (Rust)

- Unit tests for quant functions: Sharpe ratio, max drawdown, annualized return, volatility — fixed known inputs/outputs
- Backtest engine core: simple hardcoded price series (buy at 100, sell at 150 = 50% return)
- Plan compiler: valid + invalid vibe plan inputs (highest panic risk from bad user input)
- All 9 API command handlers tested with mocked market data

### CI hardening

- `cargo clippy -- -D warnings` added to CI
- `security_check.sh` wired into CI preflight
- Frontend coverage gate ≥80% on `shared/utils/`
- All Rust tests must pass before merge

### Done criteria

- `npm test` exits 0 with ≥1 suite
- `cargo test` exits 0 with ≥10 unit tests
- `shared/utils/calculations.ts` ≥90% line coverage
- CI blocks on clippy warnings and security check failures

---

## 0.4.5 — "Smarter Agent"

Focus: all four AI pain points addressed together — quality, model, coverage, speed.

### Model upgrade

- Audit current Qwen model version — swap to latest that fits device RAM budget
- Add model config in `SettingsPage` — user can pick on-device vs cloud (OpenRouter) per session
- Cloud path: route through existing `ai.rs` command, already wired for OpenRouter

### Speed

- Profile llama.cpp inference time — identify bottleneck (model size, prompt length, thread count)
- Add streaming response support to `portfolioAgent.ts` — show tokens as they arrive
- Configurable thread count for llama.cpp in Settings (default: half of device cores)

### Coverage — extend agent beyond portfolio

- `analyzeBacktest(results)` — explain backtest result, flag unusual drawdown/Sharpe
- `explainVibePlan(plan)` — describe what a vibe plan will favor, warn about concentration risk
- `summarizeRisk(riskData)` — plain-language risk dashboard summary
- Each surface gets an "Ask AI" button that calls the relevant function

### Quality

- Improve system prompt — add financial context, output format constraints, avoid generic responses
- Add follow-up question support — conversation history retained per session in memory (not persisted to disk)

### Done criteria

- Streaming response visible in UI (tokens appear progressively)
- Agent responds on 3 surfaces: portfolio, backtest results, vibe plan
- Model swap UI in Settings functional
- Response quality subjectively better (manual review — no automated gate)

---

## 0.4.6 — "Richer Data"

Focus: three new financial features. Each is self-contained and can be built in parallel.

### Tax Harvesting

- New tab: "Tax" (More drawer on mobile, sidebar on desktop)
- Identify unrealized losses across holdings — flag pairs where harvesting + replacement avoids wash sale (30-day rule)
- Show: current loss, estimated tax savings (user inputs marginal rate in Settings), suggested replacement with similar exposure
- Data: uses existing holdings + historical prices in SQLite — no new API calls needed
- Wash sale tracking: store harvest dates in SQLite, warn if repurchase within 30 days

### Dividend Calendar

- New tab: "Dividends" (More drawer / sidebar)
- Show upcoming ex-dates and payment dates for held symbols
- Monthly calendar view + list view toggle
- Projected annual income based on current holdings + trailing 12-month dividend history
- Data source: add dividend endpoint to existing provider chain (Finnhub + FMP both support it)

### Options Tracking

- Scoped to tracking only — no options pricing engine, no Greeks calculator
- Log covered calls and cash-secured puts against existing holdings
- Track: strike, expiration, premium received, status (open/expired/assigned)
- P&L roll-up: show premium income vs assignment risk per position
- Manual entry only — no new API dependency for this release

### Done criteria

- Tax tab: shows unrealized losses, flags wash sale window, calculates estimated savings
- Dividend tab: calendar renders for held symbols with ex-date + payment date
- Options log: CRUD for covered calls/puts, P&L summary renders
- All three tabs show helpful empty state when no relevant data exists
- `cargo test` and `npm test` still pass

---

## What Does NOT Ship in 0.4.3–0.4.6

- App Store / Play Store submission
- New data providers beyond dividend endpoints in 0.4.6
- Options pricing / Greeks
- Tax filing integration (TurboTax, CSV export deferred to future)
- Animated tab transitions (deferred from 0.4.2, still deferred)
- Physical device testing (still simulator only through 0.4.4; target physical in 0.4.5)
