# Changelog

All notable changes to FlowFolio are documented here.

## [0.4.7] - 2026-05-20

**Patch + correctness + spec completion** for the 0.4.6 "Richer Data" release.
Internally tracked as v0.4.6.1 (branch `patch/0.4.6.1`); shipped as semver 0.4.7
because 4-part versions are not accepted by Cargo or Tauri.

### Fixed
- Options Add form and `create_option_position` backend reject strike ≤ 0, contracts ≤ 0, premium < 0, and past-dated expirations.
- Tax Lot harvest UI shows the user's actual marginal rate (was hardcoded 25%).
- Options History view no longer double-filters: backend `status_filter` is the single source of truth.
- `aggregate_options_summary` refactored to take an explicit `strategy` parameter (clarity; output values unchanged).
- Documentation comment in `dividends_tax.rs` now references the real integration test file path.

### Added
- Close Early action + modal in Options tab (uses existing `update_option_position`).
- Delete confirmation flow for option positions.
- Wash-sale badge on Portfolio Holdings and Buy List rows (`useWashSaleStatus` hook).
- Projected payout column in Dividends list (`amount_per_share × shares_held`).
- Shares-adjusted projected annual income (`trailing_per_share × current_shares` from open tax lots).
- Command palette entries for Tax / Dividends / Options.
- `useMarginalRate` hook with 5-min TTL cache, shared between TaxTab and TaxLotView.
- `src-tauri/tests/` integration test suite (16 cases across tax / options / dividends + scaffold).

### Performance
- `get_upcoming_dividends` fetches with bounded concurrency (5 inflight via `futures::buffer_unordered`).
- Dividend negative cache: empty provider responses cached for 6h via `__empty__` sentinel rows (was: re-hit providers every call for non-payers like TSLA / NVDA).

### Security
- Finnhub auth moved from `?token=` query string to `X-Finnhub-Token` header.
- FMP error strings scrubbed of `?apikey=` before surfacing to frontend.

### Tests / CI
- New backend integration suite: `tests/tax_integration.rs`, `tests/options_integration.rs`, `tests/dividends_integration.rs`, plus `tests/common/mod.rs` scaffold using `tempfile` + `run_migrations`.
- New frontend tests: `useWashSaleStatus`, `useMarginalRate`, `TaxLotView`, plus extensions to `OptionsTab`, `DividendsTab`, `TaxTab`, `services/dividendCalendar`.
- Coverage gate extended to require ≥ 80% lines on the two new hooks.

## [0.2.2] - 2026-03-13

### Added
- **Dashboard** — Portfolio overview with summary cards, sector allocation donut chart, top movers, and quick actions
- **Watchlist Tab** — Universe/watchlist management with symbol tracking, live prices, and quick actions
- **Alerts Panel** — Price alert system with configurable thresholds, localStorage persistence, and periodic monitoring
- **Risk Dashboard** — Portfolio risk analysis with composite score gauge, volatility/drawdown metrics, concentration risk bars, correlation heatmap, VaR display, and drawdown chart; auto-generates demo analysis from default symbols when no holdings are set
- **Comparison Mode** — Side-by-side ticker comparison with normalized price charts and quantitative metrics table
- **Rebalance Scheduler** — Schedule management with timeline visualization, overdue detection, and plan integration
- **News Feed** — Market news and sentiment analysis with symbol search, sentiment scoring bar, and article list
- **Credits Dashboard** — Credit balance ring, tier info, usage meters, and transaction history

### Fixed
- `get_historical_prices` Tauri command was returning quant metrics instead of historical price data
- Dashboard no longer calls nonexistent `list_journal_entries` backend command
- Dashboard derives price data from `marketPrices` prop instead of expecting `PriceData` objects from backend
- ComparisonMode and RiskDashboard now use correct `get_quant_metrics_single` command (was `calculate_quant_metrics`)
- Removed duplicate page headers in App.tsx for comparison, risk, and scheduler tabs
- NewsFeed CSS width changed from fixed 320px to responsive layout for full-page tab mode

### Changed
- All new components are lazy-loaded via `React.lazy()` and `Suspense`
- Sidebar navigation expanded with icons for all new tabs
- Advanced-only tabs (Comparison, Risk, Scheduler) gated behind user mode toggle
- Version bumped to 0.2.2 across package.json, tauri.conf.json, and Cargo.toml

## [0.2.1] - 2026-03-12

### Added
- Supabase authentication system with email/password login, Google OAuth, and password recovery
- User profiles with username, display name, and avatar
- Credit system with 4 subscription tiers (Free, Starter, Pro, Enterprise)
- 100 welcome credits on signup
- 11 database tables with row-level security
- Supabase domain added to CSP connect-src

### Fixed
- Excluded test files from tsc build
- Removed unused imports

## [0.2.0] - 2026-03-11

### Added
- Instagram automation pipeline with expert-grade content engine
- Full app UI showcase video generation
- Vitest testing setup with jsdom and React Testing Library
- Comprehensive test suite: 259 tests across 13 files
- Global Simple/Advanced mode toggle for business vs power users

### Fixed
- 15 division-by-zero, off-by-one, and race condition bugs
