# Data Reliability Audit + Test Harness — Design

**Date:** 2026-05-26
**Owner:** Evintkoo
**Status:** Approved (pending spec review)

## Problem

User reports that FlowFolio is "not generating reliable data." Symptoms span the full pipeline: wrong/implausible numbers, missing data shown as nulls, inconsistent values across refreshes, and stale data that never updates. The pipeline (8 market-data providers → multi-tier cache → scoring/backtest/portfolio → AI analysis → UI) has 255 Playwright tests, all of which are UI smoke tests. **Zero tests assert numerical correctness anywhere in the system**, which is why correctness regressions go undetected.

A targeted audit identified five concrete correctness bugs and one structural testing gap. This spec covers fixing all five and closing the testing gap with a Rust-side numerical/parser test harness.

## Goals

1. Stop silent data corruption — failed parses must never become `0.0`.
2. Replace panicking code paths with descriptive errors that surface to the user.
3. Establish a permanent numerical-correctness regression net so future changes can't silently break the math.

## Non-goals

- Live-network tests against real provider APIs (rejected: too flaky for CI).
- Frontend Playwright assertions on rendered numbers (rejected: out of scope for this pass).
- Refactoring the provider abstraction beyond what bug #1 requires.
- AI prompt quality (only response-shape validation).
- Cache invalidation logic — separate concern, not implicated in the audit.

## Bugs to fix

Each bug is gated by a failing test written first, then fixed, then verified passing.

### Bug #2: Empty-symbols Infinity in equal-weight allocation
- **Location:** `src-tauri/src/modules/portfolio/mod.rs:173`
- **Defect:** `(100.0 - constraints.cash_buffer_pct) / num_symbols` divides by zero when `symbols.len() == 0`, producing `f64::INFINITY` allocations.
- **Fix:** Guard with `if num_symbols == 0 { return Err(PortfolioError::NoSymbols) }` (or equivalent existing error variant). Return early before any division.
- **Test:** call `equal_weight_allocation` with empty symbols → assert `Err`. Then call with N≥1 → assert each allocation is `(100 - cash_buffer) / N` within 1e-9.

### Bug #3: Backtest panic on empty timeline
- **Location:** `src-tauri/src/modules/backtest/mod.rs:398-399`
- **Defect:** `.unwrap()` on `timeline.first()` and `.last()` panics if no historical price data was fetched for the symbols (e.g., all providers degraded).
- **Fix:** Replace unwraps with explicit checks; return a descriptive `BacktestError::EmptyTimeline { symbols: Vec<String> }` so the frontend can show a useful message.
- **Test:** construct a backtest config whose symbols have no price data → assert `Err(BacktestError::EmptyTimeline)` rather than panic. Use `std::panic::catch_unwind` if needed to assert non-panic.

### Bug #5: Failover loses error context
- **Location:** `src-tauri/src/modules/data_provider/multi_source_provider.rs:1243`
- **Defect:** `last_error` only retains the final provider's error; if all 8 providers fail, the user sees one error message instead of the aggregate, making diagnosis impossible.
- **Fix:** Collect a `Vec<(ProviderName, ProviderError)>` across the loop; on full failure, return a single `MultiSourceError::AllProvidersFailed { errors }` whose `Display` impl summarizes each.
- **Test:** mock all providers to return distinct errors → assert returned error contains all N error messages, one per provider, with the provider name attributed.

### Bug #4: AI response not validated
- **Location:** `src-tauri/src/services/openrouter_service.rs` (response deserialization path)
- **Defect:** Empty `choices` array, empty `message.content`, or `finish_reason != "stop"` are all silently accepted. Users see truncated or empty analyses.
- **Fix:** After deserializing the OpenRouter response, validate:
  - `choices.len() >= 1` (else `Err(OpenRouterError::NoChoices)`)
  - `choices[0].message.content.trim().is_empty() == false` (else `Err(OpenRouterError::EmptyContent)`)
  - `choices[0].finish_reason == Some("stop")` — if not (`length`, `content_filter`, etc.), return `Err(OpenRouterError::IncompleteResponse { reason })` so frontend can show "response truncated, try again" rather than displaying half a sentence.
- **Test:** feed three fixture responses (empty choices, empty content, `finish_reason: "length"`) → assert each returns the corresponding error variant. Feed a valid response → assert `Ok(content)`.

### Bug #1: Silent zero corruption in provider parsers
- **Location:** `src-tauri/src/modules/data_provider/free_sources.rs` (lines 121, 125, 138, 142, 146, 334, 338, 342, 346, 454, 460, 466, 471) and equivalent `.unwrap_or(0.0)` / `.unwrap_or(0)` patterns in `multi_source_provider.rs` (lines 342, 343, 353, 454-465, 577-582).
- **Defect:** When a provider response is missing a numeric field (or returns null/invalid), the parser substitutes `0.0`. This zero then flows into backtest CAGR, portfolio allocation %, and scoring as if it were a real price. Result: implausible numbers and "missing data shown as 0" symptoms.
- **Fix policy:**
  - For **required fields** (e.g., a quote's `last_price`, a historical bar's `close`): missing/unparseable → propagate `Err(ParseError::MissingField { provider, field })`; for historical bars, the bad row is **skipped** with a `log::warn!` (don't kill the whole series for one bad row), and if the resulting series is empty, return `Err`.
  - For **optional fields** (e.g., `bid`, `ask`, `volume` on some providers): use `Option<f64>` rather than `0.0`. Downstream code already handles `None`; downstream code currently treats `0.0` as a real value, which is the bug.
- **Refactor scope:** introduce a `ParseError` enum in `data_provider/mod.rs` and a small `parse_required_f64(value: &serde_json::Value, field: &str) -> Result<f64, ParseError>` helper. Apply across all 8 provider parsers. Do not redesign the provider trait.
- **Lint enforcement:** add `#![deny(clippy::unwrap_used, clippy::expect_used)]` to `free_sources.rs` and `multi_source_provider.rs` (production paths only; test modules opt back in via `#[allow]`).
- **Test:** see "Parser integrity tests" below.

**Order of work:** #2 → #3 → #5 → #4 → #1. Each fix is a separate commit gated by its failing test. #1 is last because it's the largest refactor and benefits from the test-harness pattern being proven on smaller bugs first.

## Test harness architecture

Three new Rust test files under `src-tauri/tests/`, plus a fixtures directory:

```
src-tauri/tests/
├── numerical_correctness.rs    (new)
├── parser_integrity.rs         (new)
├── properties.rs               (new)
└── fixtures/
    └── providers/              (new)
        ├── alpaca_quote_ok.json
        ├── alpaca_quote_malformed.json
        ├── alpaca_historical_ok.json
        ├── alpaca_historical_malformed.json
        ├── yahoo_quote_ok.json
        ├── yahoo_quote_malformed.json
        ├── yahoo_historical_ok.json
        ├── yahoo_historical_malformed.json
        ├── finnhub_*.json
        ├── tiingo_*.json
        ├── twelve_data_*.json
        ├── fmp_*.json
        ├── polygon_*.json
        └── alpha_vantage_*.json
```

### Layer 1: Numerical correctness — `numerical_correctness.rs`

One test per metric. Each test:
1. Defines a small input series inline (e.g., 12 monthly returns).
2. States the expected output as a literal with a comment showing the hand-derivation.
3. Calls the production function.
4. Asserts within tolerance (`1e-6` for direct formulas, `1e-3` for compound metrics like CAGR/Sharpe).

Metrics covered:
- **From `quant_analysis.rs`:** sharpe_ratio, sortino_ratio, calmar_ratio, omega_ratio, volatility, max_drawdown, var_95, cvar_95, skewness, kurtosis, alpha, beta, tail_ratio.
- **From `backtest/mod.rs`:** cagr, total_return, max_drawdown, volatility, sharpe_ratio (backtest variant), turnover.
- **From `portfolio/mod.rs`:** equal_weight_allocation, current_pct calculation.

Sample test shape (illustrative):

```rust
#[test]
fn sharpe_ratio_matches_textbook() {
    // returns: 1%, 2%, -1%, 3%, 0% (monthly)
    // mean = 1.0%, std = 1.581%, rf = 0%, annualization factor = sqrt(12)
    // sharpe = (0.01 / 0.01581) * sqrt(12) = 2.1908902...
    let returns = vec![0.01, 0.02, -0.01, 0.03, 0.0];
    let result = quant_analysis::sharpe_ratio(&returns, 0.0, 12);
    assert!((result - 2.1908902).abs() < 1e-3,
            "expected ~2.1909, got {result}");
}
```

### Layer 2: Parser integrity — `parser_integrity.rs`

Two tests per provider:

1. **Happy path** — load `{provider}_{quote|historical}_ok.json` fixture (captured from a real API call, sanitized), parse it, assert:
   - All required fields parsed to expected values (committed alongside as literals).
   - No silent `0.0` substitutions: for fields that are present in the JSON, the parsed value must equal the JSON value.

2. **Malformed** — load `{provider}_{quote|historical}_malformed.json` (a real-shape response with a required field removed or set to null), parse it, assert:
   - Returns `Err(ParseError::MissingField { field: "<expected>", .. })`.
   - Does NOT return `Ok(value)` with `value == 0.0` (this is the bug we're fixing).

Total: 8 providers × 2 endpoints × 2 fixtures = 32 fixtures, 32 tests. (For providers without a true "quote" endpoint — Polygon uses "previous close", Alpha Vantage uses GLOBAL_QUOTE — use the provider's current-price-equivalent endpoint.)

Fixtures are sanitized snippets (no API keys, no PII) committed to the repo.

### Layer 3: Property tests — `properties.rs`

Using `proptest`. Each property runs on 1000+ generated inputs.

- **`prop_allocations_sum_to_100`** — given any valid symbol list (1..=50), `equal_weight_allocation` returns allocations whose sum equals `(100 - cash_buffer)` within 1e-9.
- **`prop_no_nan_inf_in_quant_metrics`** — given any return series with values in [-0.5, 0.5] and length 2..=1000, every metric in `quant_analysis` returns either a finite f64 or a `None`/`Err`, never `NaN` or `Inf`.
- **`prop_no_nan_inf_in_backtest`** — given any synthetic price series with positive prices and any allocation that sums to 100, every backtest metric returns a finite f64 or `Err`.
- **`prop_allocations_non_negative`** — equal_weight_allocation never returns negative percentages.
- **`prop_max_drawdown_in_range`** — max_drawdown is always in `[0.0, 1.0]` for any price series.

## Tolerances and fixture conventions

- **Direct formulas** (std, mean, single-divide): `1e-6`.
- **Compound formulas** (CAGR, Sharpe, Sortino, anything with `.powi()` or exponentiation): `1e-3`.
- **Hand-derivation comments:** every expected value in `numerical_correctness.rs` is accompanied by an inline comment showing the formula and intermediate numbers, so a future reader can verify the expected value is correct without re-deriving from scratch.
- **Fixture provenance:** each `*_ok.json` fixture has a sibling `.notes.md` recording the date captured, the ticker, and the original API endpoint. No API keys in fixtures.

## Success criteria

1. Each of the five bugs has a failing test committed before the fix and a passing test committed with the fix.
2. `cargo test --test numerical_correctness` covers every public metric function in `quant_analysis.rs` and `backtest/mod.rs`. The metrics listed in "Layer 1" cover the audit's known surfaces; the implementation plan will enumerate the full set and add any not listed.
3. `cargo test --test parser_integrity` has the full 32 fixtures (8 providers × 2 endpoints × 2 variants) and tests pass.
4. `cargo test --test properties` runs ≥1000 cases per property and passes.
5. `free_sources.rs` and `multi_source_provider.rs` have no `.unwrap()` or `.expect()` in production paths (enforced by `#![deny(clippy::unwrap_used, clippy::expect_used)]`; test modules may opt back in).
6. Running `cargo test` end-to-end on a clean checkout produces zero failures and zero panics.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fixture drift: providers change response shape, fixtures become stale | Fixture `.notes.md` records capture date; quarterly review noted as separate task (not this spec) |
| Property tests too slow for CI | Cap proptest cases at 1000 (default); use `#[cfg(not(debug_assertions))]` if needed |
| Bug #1 refactor touches all 8 providers and risks regressions in working providers | Bug #1 is last; parser-integrity test fixtures for each provider lock down current correct behavior before the refactor begins |
| Hand-computed expected values themselves contain math errors | Each expected value has an inline derivation comment; cross-check against at least one external source (e.g., NumPy in a scratch script) when capturing |
| `#![deny(clippy::unwrap_used)]` breaks unrelated parts of the file | Apply lint module-by-module via inner attribute, not crate-wide |

## What this spec does NOT cover

- Restoring or improving cache invalidation behavior (not implicated in audit).
- Adding numerical assertions to Playwright tests (frontend not in scope).
- Provider trait redesign or adding new providers.
- AI prompt-engineering improvements.
- Live-network smoke tests (explicitly opted out).
- Performance optimization of the test suite.

Future work tickets can be filed separately if any of these become priorities.
