# 0.4.6 "Richer Data" — Design Spec

**Date:** 2026-05-20
**Status:** Approved (pending file review)
**Predecessor:** v0.4.5 "Smarter Agent" — released 2026-05-20

---

## Goal

Three new self-contained financial features for FlowFolio, each gated behind its own tab. All three can be built and tested in parallel.

1. **Tax Harvesting** — flag unrealized losses, suggest peer replacements, warn on wash-sale window.
2. **Dividend Calendar** — upcoming ex-dates and projected annual income for held symbols.
3. **Options Tracking** — manual logging of covered calls and cash-secured puts with realized P&L.

## Non-Goals

- Options pricing engine, Greeks, IV (no Black-Scholes).
- Long calls / long puts / spreads / multi-leg strategies.
- Auto-block on wash sale (we only warn).
- AI-driven replacement suggestion (we use a static peer map).
- Tax CSV export / TurboTax integration.
- Real-time options chain data, roll/assignment automation.
- New data providers beyond Finnhub + FMP dividend endpoints.

These are explicitly deferred to 0.4.7+.

---

## Architecture Overview

```
src/
├── components/
│   ├── TaxTab.tsx              (new) ~250 lines
│   ├── DividendsTab.tsx        (new) ~300 lines
│   ├── OptionsTab.tsx          (new) ~280 lines
│   └── DividendCalendar.tsx    (new) ~150 lines — month grid + list toggle
├── services/
│   ├── replacementPeers.ts     (new) ~80 lines — sector/ETF peer map
│   └── dividendCalendar.ts     (new) ~100 lines — frontend client + caching
└── shared/types/
    └── richerData.ts           (new) — TaxLot, Dividend, OptionPosition, ReplacementSuggestion

src-tauri/src/
├── api/commands/
│   ├── dividends_tax.rs        (extend) — upcoming-dividends, wash-sale, marginal-rate-aware harvest
│   └── options.rs              (new) ~180 lines — CRUD for CC/CSP positions
├── modules/
│   └── dividend_calendar/      (new) — provider integration (Finnhub → FMP fallback)
└── infrastructure/database/migrations/
    └── 008_options_and_settings.sql  (new) — options table + marginal_tax_rate + wash_sale_events
```

All three features are independent. They share:
- The existing `dividends` and `tax_lots` SQLite tables (already migrated in earlier work).
- The existing market-data provider failover chain.
- The existing settings store.

---

## Feature 1: Tax Harvesting

### Data Model

**Existing — reuse:**
- `tax_lots(id, portfolio_name, symbol, shares, cost_basis_per_share, purchase_date, is_closed, close_date, close_price)`

**New:**
- `wash_sale_events(id, portfolio_name, symbol, sale_date, harvested_loss, created_at)` — recorded on every harvest, used to gate repurchases.
- Add column to `settings` table: `marginal_tax_rate REAL DEFAULT 0.24`.

### Backend (Rust)

1. **`get_tax_loss_harvest_opportunities(portfolio_name, current_prices, override_rate?)`** — refactor existing.
   - Read marginal rate from `settings` table. If `override_rate` is `Some`, use that instead.
   - Compute estimated savings as `unrealized_loss.abs() * effective_rate`.
   - Result includes `replacement_symbol` from peer lookup (see step 2).

2. **`get_replacement_suggestions(symbol)`** — new.
   - Static `HashMap<String, Vec<String>>` peer map mirrored in Rust (and the frontend) for SSOT serialization.
   - Map keys are common ETFs and individual stocks; values are 1–2 peers with similar exposure but distinct CUSIPs.
   - Example entries: `VTI → [ITOT, SCHB]`, `SCHD → [VYM, DGRO]`, `XLK → [VGT, FTEC]`, `SPY → [VOO, IVV]`.
   - On unknown symbol: return `Vec::new()`, frontend renders "no peer suggested — pick manually".

3. **`record_wash_sale_event(portfolio_name, symbol, harvested_loss)`** — new.
   - Inserts row with `sale_date = today`.
   - Called when user clicks "Mark Harvested" on the tax tab.

4. **`check_wash_sale_window(portfolio_name, symbol)`** — new.
   - Returns `{ in_window: bool, days_remaining: i64 }`.
   - `in_window` is `true` if a row exists in `wash_sale_events` for this symbol with `sale_date >= today - 30 days`.

### Frontend (`TaxTab.tsx`)

**Layout:**
- **Header:** marginal-rate slider (default = settings value), "Save as default" button (calls `update_setting('marginal_tax_rate', value)`).
- **Opportunities table:** symbol, shares, cost basis, current price, unrealized loss, days held, est. savings (using current rate), suggested replacement (peer symbol from `replacementPeers.ts`), "Mark Harvested" button.
- **Recent harvests footer:** symbols harvested in the last 30 days with days-remaining countdown.
- **Wash-sale banner:** when a held/watchlisted symbol is in the wash-sale window, the symbol row in the *Holdings* or *Buy* views gets a red badge "Wash sale window — N days remaining". (Cross-tab wiring is one extra hook in the Holdings/Buy renderers.)

**Empty state:** "No unrealized losses found. Tax-loss harvesting only flags positions where current price < cost basis."

### Tests

- Frontend `TaxTab.test.tsx`: slider updates estimated savings reactively; mark-harvested fires both `record_wash_sale_event` and updates UI; wash-sale banner appears for symbols in window.
- Frontend `replacementPeers.test.ts`: deterministic lookup; returns empty array for unknown symbols.
- Rust `dividends_tax::tests` extension: marginal rate override math; wash-sale window check at boundary (day 30 still in window, day 31 not).

---

## Feature 2: Dividend Calendar

### Data Model

**Existing — reuse:**
- `dividends(id, portfolio_name, symbol, amount_per_share, total_amount, shares_held, ex_date, pay_date, reinvested)` — user-entered historical entries.

**New:**
- `dividend_calendar_cache(symbol, ex_date, pay_date, amount_per_share, fetched_at)` — provider-fetched upcoming dividends. 24-hour TTL by `fetched_at`. Primary key `(symbol, ex_date)`.

### Backend (Rust)

1. **`modules/dividend_calendar/`** — new module mirroring `modules/data_provider/` pattern.
   - `pub trait DividendCalendarProvider { async fn upcoming(&self, symbol: &str, lookahead_days: u32) -> Result<Vec<UpcomingDividend>>; }`
   - Implementations: `FinnhubDividendProvider`, `FmpDividendProvider`.
   - Chain wrapper that tries Finnhub first, falls through to FMP on error, includes circuit-breaker reuse from `infrastructure/resilience/`.

2. **`get_upcoming_dividends(symbols, lookahead_days = 90)`** — Tauri command.
   - Check `dividend_calendar_cache` per symbol (24h TTL).
   - On miss: provider chain, persist results, return merged.
   - Joins with holdings to compute `projected_payout = upcoming.amount_per_share * shares_held` per row.

3. **`get_projected_annual_income(portfolio_name)`** — Tauri command.
   - For each holding, sum trailing 12-month dividend `total_amount` from the `dividends` table.
   - Estimate `projected_annual = trailing_12mo * (current_shares / avg_shares_in_period)`.
   - Returns per-symbol breakdown + portfolio total.

### Frontend

**`DividendsTab.tsx`:**
- View toggle at top: **Calendar** | **List** | **Income Projection**.
- Summary card always visible: "Projected $X / year — based on N held dividend payers".

**`DividendCalendar.tsx`:**
- CSS grid month view with prev/next-month buttons.
- Each day cell shows count badge (e.g., "3 events") + amount tooltip on hover.
- Click a day → opens that day's list view sliced to that date.

**List view (inside DividendsTab):**
- Sortable table — symbol, ex-date, pay-date, amount/share, projected payout, shares held.

**Income Projection view:**
- Bar/donut chart of projected annual by symbol (reuse existing chart components).
- "Top contributors" table sorted by projected annual descending.

**Empty state:** "No upcoming dividends in the next 90 days for held symbols."

### Tests

- Frontend `DividendCalendar.test.tsx`: month grid renders correct day-of-week alignment; click handler fires with the right ISO date.
- Frontend `dividendCalendar.test.ts` (service): cache hit returns immediately without invoke; cache miss invokes `get_upcoming_dividends`; fallback path when Finnhub fails.
- Rust `modules::dividend_calendar::tests`: provider failover (Finnhub error → FMP success); cache TTL boundary; lookback merge math.

---

## Feature 3: Options Tracking

### Data Model

**Migration `008_options_and_settings.sql`:**

```sql
CREATE TABLE option_positions (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK(strategy IN ('covered_call', 'cash_secured_put')),
  strike REAL NOT NULL,
  expiration TEXT NOT NULL,           -- ISO date
  contracts INTEGER NOT NULL,         -- 1 contract = 100 shares (per US convention)
  premium_per_contract REAL NOT NULL, -- credit received, positive
  open_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open', 'expired', 'assigned', 'closed_early')),
  close_date TEXT,
  close_premium REAL,                 -- for closed_early: debit paid to close
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_option_positions_portfolio ON option_positions(portfolio_name);
CREATE INDEX idx_option_positions_symbol ON option_positions(portfolio_name, symbol);
CREATE INDEX idx_option_positions_status ON option_positions(portfolio_name, status);

ALTER TABLE settings ADD COLUMN marginal_tax_rate REAL DEFAULT 0.24;

CREATE TABLE wash_sale_events (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  harvested_loss REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wash_sale_events_symbol_date
  ON wash_sale_events(portfolio_name, symbol, sale_date);
```

### Backend (`api/commands/options.rs`)

Five Tauri commands, all manual entry (no provider integration):

1. **`create_option_position(...)`** — insert.
2. **`update_option_position(id, status, close_date?, close_premium?)`** — state transition.
   - Validation: cannot move from `assigned`/`expired`/`closed_early` back to `open`.
3. **`list_option_positions(portfolio_name, status_filter?)`** — read.
4. **`delete_option_position(id)`** — hard delete, no soft-delete since manual entry mistakes happen.
5. **`get_options_summary(portfolio_name)`** — aggregates.
   - Open positions count.
   - Total cash secured (sum of `strike * contracts * 100` for open CSPs).
   - Total assignment exposure (sum of `strike * contracts * 100` for open CCs).
   - Realized premium income YTD (sum of `premium_per_contract * contracts * 100` for status `expired` or `assigned` or `closed_early`, minus close premiums for `closed_early`).

### Frontend (`OptionsTab.tsx`)

**Layout:**
- **Summary card** at top: total premium income YTD, open positions count, total cash secured, total assignment exposure.
- **Two sub-tabs:** Open Positions | History.

**Open Positions table:**
- Symbol, strategy badge (CC/CSP), strike, expiration, days to expiration, premium received, current price, in-the-money? (computed at view time), assignment risk pill (Low / Medium / High based on |current - strike| / strike).
- Actions: Mark Expired | Mark Assigned | Close Early (opens close-premium modal).

**History table:**
- Same fields + final status + realized P&L (premium received − close debit if any).

**Add Position modal:**
- Strategy radio (CC / CSP).
- Symbol autocomplete from holdings (for CC) or anything (for CSP).
- Strike, expiration date picker (must be future), contracts (default 1), premium-per-contract.
- Open date defaults to today.

**Empty state:** "No options tracked. Add a covered call or cash-secured put to start tracking premium income."

### Tests

- Frontend `OptionsTab.test.tsx`: strategy filter, status transition flow, summary math, modal validation (no past expiration, positive contracts).
- Rust `api::commands::options::tests`:
  - Cannot transition `assigned` → `open`.
  - Summary aggregation math (verified against hand-rolled fixture).
  - Premium income computation handles all four close states correctly.

---

## Cross-Cutting Concerns

### Settings page additions

One new field added to existing Settings tab:
- **Marginal tax rate** (numeric input, % validation 0–60, bracket helpers shown as inline tips: "Common brackets: 12% / 22% / 24% / 32% / 35% / 37%"). Default 24%. Persisted via `update_setting('marginal_tax_rate', value)`.

### Navigation

Three new tabs added to the existing tab interface in `App.tsx`:
- Desktop: appear in sidebar next to existing tabs (Portfolio, Backtest, etc.).
- Mobile: appear in the "More" drawer per existing mobile pattern.

### Coverage gate

Extend `vitest.config.ts` to enforce ≥80% on the pure-logic services:
- `src/services/replacementPeers.ts`
- `src/services/dividendCalendar.ts`

---

## Done Criteria

- **Tax tab:** shows unrealized losses; flags wash-sale window with red banner; per-row estimated savings using marginal rate from settings or slider override; suggests peer ETF from static map.
- **Dividend tab:** 3-view toggle works (calendar/list/income); upcoming ex-dates pulled from Finnhub with FMP fallback; projected annual income card renders.
- **Options tab:** CRUD for CC/CSP; summary aggregates match hand-calc on fixtures; history view with realized P&L.
- All three tabs show helpful empty state when no relevant data.
- `cargo test --lib` passes (existing tests + new ones).
- `npm test` passes (existing 797 + new ~30).
- `cargo clippy -- -D warnings` clean (with pinned Rust 1.91.1).
- `cargo fmt --check` clean.
- Coverage gate clears on new pure-logic files.

---

## File Map Summary

| Layer | New | Extended |
|---|---|---|
| Frontend TS | 6 files (~960 lines) | 1 file (Settings tab) |
| Frontend tests | ~4 files (~400 lines) | — |
| Rust src | 3 files (~400 lines) + 1 migration | 1 file (dividends_tax.rs ~+150) |
| Rust tests | ~3 modules (~200 lines) | — |

Estimated total: ~2,100 lines of new code, ~30 new tests.
