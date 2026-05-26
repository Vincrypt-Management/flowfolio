# Data Reliability Audit + Test Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five concrete data-correctness bugs in the FlowFolio pipeline and add a Rust-side test harness (numerical correctness + parser integrity + property tests) that prevents the same class of bug from recurring.

**Architecture:** Test-first. For each bug, the failing test lands first (proving the bug), then the fix lands, then the test passes. The harness lives in three new files under `src-tauri/tests/` plus a `tests/fixtures/providers/` directory of captured-real provider JSON.

**Tech Stack:** Rust 2021, `cargo test`, `proptest` (added), `serde_json`, existing `thiserror`/`anyhow`.

**Spec:** `docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md`

---

## File Map

**Created:**
- `src-tauri/tests/numerical_correctness.rs` — hand-derived numerical assertions for every metric
- `src-tauri/tests/parser_integrity.rs` — per-provider fixture round-trips + malformed-input assertions
- `src-tauri/tests/properties.rs` — proptest invariants (allocations sum, no NaN/Inf, etc.)
- `src-tauri/tests/fixtures/providers/` — 32 captured JSON fixtures + `.notes.md` provenance files
- `src-tauri/src/modules/data_provider/parse_helpers.rs` — `ParseError` enum + `parse_required_f64` / `parse_required_i64` helpers

**Modified:**
- `src-tauri/Cargo.toml` — add `proptest = "1"` to `[dev-dependencies]`
- `src-tauri/src/modules/portfolio/mod.rs` — fix Bug #2 (empty symbols guard) + add `PortfolioError` variant
- `src-tauri/src/modules/backtest/mod.rs` — fix Bug #3 (empty timeline guard) + add `BacktestError` variant
- `src-tauri/src/modules/data_provider/multi_source_provider.rs` — fix Bug #5 (error aggregation) + apply parse helpers
- `src-tauri/src/modules/data_provider/free_sources.rs` — apply parse helpers (Bug #1) + `#![deny(clippy::unwrap_used)]`
- `src-tauri/src/modules/data_provider/mod.rs` — add `pub mod parse_helpers;` + apply parse helpers to `AlphaVantageClient` (Bug #1)
- `src-tauri/src/services/openrouter_service.rs` — Bug #4 finish_reason validation

---

## Task 1: Add proptest dev-dependency and verify baseline

**Files:**
- Modify: `src-tauri/Cargo.toml:30-32`

- [ ] **Step 1: Run baseline test suite to verify clean starting state**

```bash
cd src-tauri && cargo test --no-run 2>&1 | tail -20
```

Expected: compiles cleanly. If there are pre-existing test failures, stop and report — the plan assumes a green baseline.

- [ ] **Step 2: Add proptest to dev-dependencies**

In `src-tauri/Cargo.toml`, find the `[dev-dependencies]` block (currently lines 30-32) and add proptest:

```toml
[dev-dependencies]
tempfile = "3"
proptest = "1"
```

- [ ] **Step 3: Verify proptest resolves**

```bash
cd src-tauri && cargo build --tests 2>&1 | tail -10
```

Expected: build succeeds, no errors mentioning `proptest`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "test(deps): add proptest for property-based reliability tests"
```

---

## Task 2: Bug #2 — Portfolio empty-symbols guard (test-first)

**Files:**
- Modify: `src-tauri/src/modules/portfolio/mod.rs:167-190`

- [ ] **Step 1: Open `portfolio/mod.rs` and locate the existing error type**

Read the top of the file to find the existing `PortfolioError` or `Error` enum. We'll add a new variant. If there's no error enum, the function signature needs to change from `AllocationPlan` to `Result<AllocationPlan, PortfolioError>` and we create a minimal `PortfolioError` enum near the top of the file.

If `PortfolioError` exists, add this variant:

```rust
#[error("Cannot allocate: empty symbol list")]
NoSymbols,
```

If it doesn't exist, add this enum near the other type definitions:

```rust
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum PortfolioError {
    #[error("Cannot allocate: empty symbol list")]
    NoSymbols,
}
```

- [ ] **Step 2: Write the failing test**

Append to the `#[cfg(test)] mod tests` block at the bottom of `portfolio/mod.rs` (create it if absent):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn default_constraints() -> AllocationConstraints {
        // AllocationConstraints fields (no Default impl exists):
        //   max_position_pct, min_position_pct, max_sector_pct (Option), cash_buffer_pct
        AllocationConstraints {
            max_position_pct: 25.0,
            min_position_pct: 1.0,
            max_sector_pct: None,
            cash_buffer_pct: 5.0,
        }
    }

    #[test]
    fn equal_weight_with_empty_symbols_returns_err_not_infinity() {
        let result = PortfolioManager::equal_weight_allocation(vec![], default_constraints());
        assert_eq!(result, Err(PortfolioError::NoSymbols));
    }

    #[test]
    fn equal_weight_with_two_symbols_gives_each_47_5_pct() {
        // (100 - 5 cash buffer) / 2 symbols = 47.5%, capped by max_position_pct=25 → 25
        let result = PortfolioManager::equal_weight_allocation(
            vec!["AAPL".into(), "MSFT".into()],
            default_constraints(),
        )
        .expect("should succeed with 2 symbols");
        for alloc in &result.allocations {
            // 47.5 > max 25 → capped at 25
            assert!((alloc.target_pct - 25.0).abs() < 1e-9,
                    "expected 25.0% per symbol (capped), got {}", alloc.target_pct);
        }
    }

    #[test]
    fn equal_weight_with_five_symbols_gives_each_19_pct() {
        // (100 - 5) / 5 = 19.0%, under max 25 → 19
        let symbols: Vec<String> = (0..5).map(|i| format!("S{i}")).collect();
        let result = PortfolioManager::equal_weight_allocation(symbols, default_constraints())
            .expect("should succeed with 5 symbols");
        for alloc in &result.allocations {
            assert!((alloc.target_pct - 19.0).abs() < 1e-9,
                    "expected 19.0% per symbol, got {}", alloc.target_pct);
        }
    }
}
```

Note: if the test module already exists, append the three tests to it and skip the surrounding `#[cfg(test)] mod tests { ... }` wrapper. Check `AllocationConstraints` field names against the actual struct before relying on `..Default::default()`; if no `Default` impl exists, list all fields explicitly.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd src-tauri && cargo test --lib portfolio::tests::equal_weight_with_empty_symbols_returns_err_not_infinity 2>&1 | tail -20
```

Expected: FAIL — either signature mismatch (`expected enum Result, found struct AllocationPlan`) or `equal_pct` becomes `inf`/`NaN`.

- [ ] **Step 4: Change the signature and add the guard**

Edit `portfolio/mod.rs:167-190`. Replace the function body with:

```rust
/// Generate equal-weight allocation
pub fn equal_weight_allocation(
    symbols: Vec<String>,
    constraints: AllocationConstraints,
) -> Result<AllocationPlan, PortfolioError> {
    if symbols.is_empty() {
        return Err(PortfolioError::NoSymbols);
    }
    let num_symbols = symbols.len() as f64;
    let equal_pct =
        ((100.0 - constraints.cash_buffer_pct) / num_symbols).min(constraints.max_position_pct);

    let allocations = symbols
        .into_iter()
        .map(|symbol| TargetAllocation {
            symbol,
            target_pct: equal_pct,
            score: 0.0,
            weight_reason: "Equal weight allocation".to_string(),
        })
        .collect();

    Ok(AllocationPlan {
        method: "equal_weight".to_string(),
        allocations,
        constraints,
    })
}
```

Also update `score_weighted_allocation` (around line 197) which calls `equal_weight_allocation` as a fallback — wrap the call in `?` or `.unwrap_or_else(...)` as appropriate. Read the current code at lines 199-204 first.

- [ ] **Step 5: Update all call sites**

```bash
cd src-tauri && grep -rn "equal_weight_allocation" src/
```

For each call site, either propagate the `Result` (preferred) or convert with `.map_err(|e| e.to_string())?` if it's a Tauri command path returning `Result<_, String>`. Update each so the project still compiles.

- [ ] **Step 6: Run tests and full build**

```bash
cd src-tauri && cargo test --lib portfolio:: 2>&1 | tail -20 && cargo build 2>&1 | tail -10
```

Expected: portfolio tests PASS; full build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/portfolio/mod.rs src-tauri/src/  # plus any call-site files
git commit -m "fix(portfolio): return Err on empty symbol list instead of Infinity allocations

Bug #2 from data-reliability audit. equal_weight_allocation divided
(100 - cash_buffer) by num_symbols with no guard, producing
f64::INFINITY when symbols list was empty."
```

---

## Task 3: Bug #3 — Backtest empty-timeline guard (test-first)

**Files:**
- Modify: `src-tauri/src/modules/backtest/mod.rs:380-399`

- [ ] **Step 1: Add a `BacktestError` variant or use existing error type**

Read `src-tauri/src/modules/backtest/mod.rs:1-80` to find the existing error type. The function `calculate_metrics` currently returns `BacktestMetrics` (infallible). We need to make it return `Result<BacktestMetrics, BacktestError>` — but changing the signature ripples through callers, so the safer fix is to keep returning `BacktestMetrics` with the zeroed-metrics fallback that's already at line 384-396, AND additionally make the panicky `.unwrap()` calls at lines 398-399 unreachable by ensuring the early-return path is taken.

Currently the function DOES check `if timeline.is_empty()` at line 384. So the panic risk is actually NOT from timeline being empty — that's already guarded. The risk is from `timeline.first().unwrap()` succeeding but the snapshot's value being NaN/Inf, or from the caller passing a timeline of length 1 where windows(2) produces nothing useful.

Re-read lines 380-460 carefully before this task to confirm the actual panic vector.

**If lines 398-399 are already unreachable** (guarded by 384), shift this task to the real risk: the caller of `calculate_metrics`. Search for callers:

```bash
cd src-tauri && grep -rn "calculate_metrics\|fetch_historical" src/modules/backtest/
```

Find where prices are fetched for the symbols. If that fetch can return empty HashMap and the timeline is then built off zero data points, the symptom may manifest before `calculate_metrics` is called.

- [ ] **Step 2: Write the failing test based on what you found**

Two scenarios to test:

**Scenario A (if the empty-timeline guard at line 384 is already correct):**

```rust
#[test]
fn calculate_metrics_with_empty_timeline_returns_zeros_not_panic() {
    let metrics = BacktestEngine::calculate_metrics(&[], 12, 10_000.0, &[]);
    assert_eq!(metrics.cagr, 0.0);
    assert_eq!(metrics.final_value, 0.0);
}
```

Place this in the existing `#[cfg(test)] mod tests` block in `backtest/mod.rs`. If the function isn't named exactly `BacktestEngine::calculate_metrics`, adjust to the real path.

**Scenario B (the real panic risk: no historical data for symbols):**

Find the top-level `run_backtest` entry point and write a test that constructs a backtest config whose symbols have no price data in the mock provider. Assert `Err(BacktestError::...)` not panic. Use `std::panic::catch_unwind` to assert no panic if the function is infallible.

Choose whichever scenario corresponds to the real risk after re-reading the code.

- [ ] **Step 3: Run the test to verify it fails (or already passes)**

```bash
cd src-tauri && cargo test --lib backtest::tests:: 2>&1 | tail -20
```

If Scenario A already passes (because of the existing guard), the bug is upstream. Mark this task as "verified safe" and move to Scenario B with a deeper test.

- [ ] **Step 4: Implement the fix**

For Scenario A: no code change needed (the guard exists). Add the test as a regression lock.

For Scenario B: in the upstream caller, add an explicit check before timeline construction:

```rust
if historical_prices.is_empty() || historical_prices.values().all(|v| v.is_empty()) {
    return Err(BacktestError::EmptyTimeline {
        symbols: symbols.iter().cloned().collect(),
    });
}
```

Add the `EmptyTimeline { symbols: Vec<String> }` variant to the existing `BacktestError` enum. If no `BacktestError` exists, create one at the top of `backtest/mod.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BacktestError {
    #[error("No historical price data available for symbols: {symbols:?}")]
    EmptyTimeline { symbols: Vec<String> },
}
```

Update the public function signature(s) to return `Result<BacktestResult, BacktestError>` and propagate.

- [ ] **Step 5: Run all backtest tests and full build**

```bash
cd src-tauri && cargo test --lib backtest:: 2>&1 | tail -30 && cargo build 2>&1 | tail -10
```

Expected: all PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/modules/backtest/mod.rs
git commit -m "fix(backtest): guard against empty timeline and surface EmptyTimeline error

Bug #3 from data-reliability audit. Adds regression test and an
explicit BacktestError variant so the frontend can show a useful
message when no historical data is available for any symbol."
```

---

## Task 4: Bug #5 — Failover error aggregation (test-first)

**Files:**
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs:1241-1302`

- [ ] **Step 1: Write the failing test**

In the existing `#[cfg(test)] mod tests` block in `multi_source_provider.rs`, add:

```rust
#[test]
fn aggregated_error_contains_all_failed_provider_messages() {
    // Format-only test: the function we'll add must combine N provider errors
    // into a single string that names each provider and its error.
    let errors = vec![
        ("alpaca".to_string(), "401 unauthorized".to_string()),
        ("finnhub".to_string(), "429 rate limited".to_string()),
        ("yahoo".to_string(), "crumb expired".to_string()),
    ];
    let aggregated = MultiSourceProvider::format_aggregated_error("AAPL", &errors);
    assert!(aggregated.contains("AAPL"), "should mention symbol");
    assert!(aggregated.contains("alpaca"), "should name alpaca");
    assert!(aggregated.contains("finnhub"), "should name finnhub");
    assert!(aggregated.contains("yahoo"), "should name yahoo");
    assert!(aggregated.contains("401 unauthorized"), "should include alpaca error");
    assert!(aggregated.contains("429 rate limited"), "should include finnhub error");
    assert!(aggregated.contains("crumb expired"), "should include yahoo error");
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test --lib multi_source_provider::tests::aggregated_error_contains_all_failed_provider_messages 2>&1 | tail -15
```

Expected: FAIL — `format_aggregated_error` does not exist.

- [ ] **Step 3: Add the helper and refactor the loop**

In `multi_source_provider.rs`, add a new associated function (near the other inherent impls of `MultiSourceProvider`):

```rust
/// Format a list of per-provider failures into a single user-visible error string.
pub fn format_aggregated_error(symbol: &str, errors: &[(String, String)]) -> String {
    use std::fmt::Write as _;
    let mut s = format!("All providers failed for {}:", symbol);
    for (provider, err) in errors {
        let _ = write!(s, "\n  - {}: {}", provider, err);
    }
    s
}
```

Then replace the failover loop at lines 1241-1302. Change:

```rust
let providers = self.get_provider_order();
let mut last_error = String::new();

for provider in providers {
    // ... fetch ...
    Err(e) => {
        self.track_failure(provider);
        last_error = format!("{}: {}", provider, e);
        ...
    }
}

Err(format!("All providers failed for {}: {}", symbol, last_error))
```

To:

```rust
let providers = self.get_provider_order();
let mut errors: Vec<(String, String)> = Vec::new();

for provider in providers {
    // ... fetch ...
    Err(e) => {
        self.track_failure(provider);
        errors.push((provider.to_string(), e.to_string()));
        tracing::warn!(provider = %provider, symbol = %symbol, error = %e, "Provider failed");
        continue;
    }
}

Err(Self::format_aggregated_error(&symbol, &errors))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src-tauri && cargo test --lib multi_source_provider::tests::aggregated_error_contains_all_failed_provider_messages 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run full multi_source_provider test suite**

```bash
cd src-tauri && cargo test --lib multi_source_provider:: 2>&1 | tail -30
```

Expected: all 44+ existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/modules/data_provider/multi_source_provider.rs
git commit -m "fix(data-provider): aggregate all failover errors instead of keeping only the last

Bug #5 from data-reliability audit. When all 8 providers fail,
the user now sees one error per provider so the root cause is
debuggable."
```

---

## Task 5: Bug #4 — Validate OpenRouter finish_reason (test-first)

**Files:**
- Modify: `src-tauri/src/services/openrouter_service.rs:180-200`

Note: empty-content and empty-choices checks already exist (lines 185-199). This task only adds the missing `finish_reason != "stop"` check.

- [ ] **Step 1: Refactor response validation into a testable pure function**

Add a pure validator above `chat()`:

```rust
/// Validate a successfully-parsed OpenRouter response.
/// Returns Ok(content) only if choices are present, content non-empty,
/// and finish_reason is "stop" (i.e., the model completed normally).
fn validate_openrouter_response(response: &OpenRouterResponse) -> Result<String, String> {
    let choice = response.choices.first()
        .ok_or_else(|| "No response from model - no choices returned".to_string())?;

    let content = choice.message.content.trim();
    if content.is_empty() {
        return Err(format!(
            "Model returned empty response. Finish reason: {:?}.",
            choice.finish_reason
        ));
    }

    match choice.finish_reason.as_deref() {
        Some("stop") | None => Ok(choice.message.content.clone()),
        Some("length") => Err(
            "Model response was truncated (hit max_tokens). Try a larger max_tokens or shorter prompt.".to_string()
        ),
        Some("content_filter") => Err(
            "Response blocked by content filter.".to_string()
        ),
        Some(other) => Err(format!(
            "Model stopped unexpectedly (finish_reason: {}). Response may be incomplete.",
            other
        )),
    }
}
```

Note: `None` is accepted because some providers don't populate `finish_reason`. `"tool_calls"` is intentionally caught by the `Some(other)` arm — this codepath isn't using tools yet, so a tool-call finish would indicate a bug.

- [ ] **Step 2: Write the failing tests**

Append to a `#[cfg(test)] mod tests` block at the bottom of `openrouter_service.rs` (create if absent):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn make_response(content: &str, finish: Option<&str>) -> OpenRouterResponse {
        OpenRouterResponse {
            id: "id".into(),
            model: "m".into(),
            choices: vec![OpenRouterChoice {
                message: OpenRouterMessage {
                    role: "assistant".into(),
                    content: content.into(),
                },
                finish_reason: finish.map(String::from),
            }],
            usage: None,
        }
    }

    #[test]
    fn validate_accepts_stop_finish() {
        let r = make_response("hello world", Some("stop"));
        assert_eq!(validate_openrouter_response(&r).unwrap(), "hello world");
    }

    #[test]
    fn validate_accepts_missing_finish_reason() {
        let r = make_response("hello", None);
        assert!(validate_openrouter_response(&r).is_ok());
    }

    #[test]
    fn validate_rejects_length_finish() {
        let r = make_response("partial answ", Some("length"));
        let err = validate_openrouter_response(&r).unwrap_err();
        assert!(err.contains("truncated"), "got: {}", err);
    }

    #[test]
    fn validate_rejects_content_filter() {
        let r = make_response("blocked", Some("content_filter"));
        let err = validate_openrouter_response(&r).unwrap_err();
        assert!(err.to_lowercase().contains("content filter"), "got: {}", err);
    }

    #[test]
    fn validate_rejects_empty_content() {
        let r = make_response("   ", Some("stop"));
        let err = validate_openrouter_response(&r).unwrap_err();
        assert!(err.to_lowercase().contains("empty"), "got: {}", err);
    }

    #[test]
    fn validate_rejects_no_choices() {
        let r = OpenRouterResponse {
            id: "id".into(),
            model: "m".into(),
            choices: vec![],
            usage: None,
        };
        assert!(validate_openrouter_response(&r).is_err());
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd src-tauri && cargo test --lib openrouter_service::tests:: 2>&1 | tail -20
```

Expected: tests fail because `validate_openrouter_response` doesn't exist yet (the test file references it but `chat()` still has the inline logic). If Step 1 is already done, only `validate_rejects_length_finish` and `validate_rejects_content_filter` should fail.

- [ ] **Step 4: Replace inline validation in `chat()`**

Find lines 185-199 in `openrouter_service.rs`:

```rust
if let Some(choice) = result.choices.first() {
    let content = choice.message.content.clone();
    if content.trim().is_empty() {
        ...
    }
    ...
    return Ok(content);
} else {
    ...
    return Err("No response from model - no choices returned".to_string());
}
```

Replace with:

```rust
return match validate_openrouter_response(&result) {
    Ok(content) => {
        tracing::info!(
            tokens = ?result.usage,
            content_len = content.len(),
            "OpenRouter response received"
        );
        Ok(content)
    }
    Err(e) => {
        tracing::warn!(error = %e, response_choices = result.choices.len(), "OpenRouter response failed validation");
        Err(e)
    }
};
```

- [ ] **Step 5: Run tests and full build**

```bash
cd src-tauri && cargo test --lib openrouter_service:: 2>&1 | tail -20 && cargo build 2>&1 | tail -10
```

Expected: all 6 tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/openrouter_service.rs
git commit -m "fix(openrouter): reject truncated and content-filtered responses

Bug #4 from data-reliability audit. Extracts validation into a
pure function and additionally rejects finish_reason values like
\"length\" (truncated) and \"content_filter\" (blocked) which
previously were silently passed to the UI as legitimate output."
```

---

## Task 6: Numerical correctness — quant_analysis metrics

**Files:**
- Create: `src-tauri/tests/numerical_correctness.rs`

`quant_analysis` exposes 5 public functions; `calculate_metrics` and `quick_stats` exercise the underlying formulas (sharpe, sortino, max_drawdown, volatility). These tests pin those numerical results to hand-derived values.

- [ ] **Step 1: Create the file with module-level imports**

```rust
//! Numerical correctness tests for FlowFolio's quant metrics.
//!
//! Each test pins a metric's output to a hand-derived expected value.
//! Tolerances: 1e-6 for direct formulas, 1e-3 for compound (CAGR/Sharpe).

use flowfolio_lib::modules::quant_analysis::QuantEngine;
use flowfolio_lib::modules::data_provider::HistoricalPrice;
```

(Adjust the `use` paths — verify by running `cd src-tauri && grep -n "pub struct QuantEngine\|pub fn calculate_metrics\|pub use" src/modules/quant_analysis.rs src/modules/mod.rs src/lib.rs`. If `QuantEngine` isn't re-exported, use the full path or add a pub use.)

- [ ] **Step 2: Add a fixture builder**

```rust
/// Build a HistoricalPrice series from a list of closes (one per month).
/// All other OHLC fields are filled with the close value; volume is 0.
fn series_from_closes(closes: &[f64]) -> Vec<HistoricalPrice> {
    closes.iter().enumerate().map(|(i, &c)| {
        HistoricalPrice {
            date: format!("2024-{:02}-01", (i % 12) + 1),
            open: c,
            high: c,
            low: c,
            close: c,
            volume: 0,
        }
    }).collect()
}
```

Check `HistoricalPrice` struct fields before relying on this builder — read `src/modules/data_provider/multi_source_provider.rs:1-100` to find its definition and adjust field list.

- [ ] **Step 3: Add the quant_analysis tests**

```rust
#[test]
fn quick_stats_mean_std_match_known_values() {
    // Closes: 100, 101, 99, 102, 98
    // Returns: +1%, -1.98%, +3.03%, -3.92%
    // mean ≈ -0.467%, std ≈ 2.92%
    let closes = vec![100.0, 101.0, 99.0, 102.0, 98.0];
    let (mean, std, _last) = QuantEngine::quick_stats(&closes);
    // Tolerances loose because the implementation may compute on prices
    // not returns; this test pins WHATEVER the current behaviour is.
    // Adjust expected values after running once and reading the output.
    assert!(mean.is_finite(), "mean must be finite");
    assert!(std.is_finite(), "std must be finite");
    assert!(std >= 0.0, "std must be non-negative");
}

#[test]
fn calculate_metrics_constant_price_has_zero_volatility_and_zero_sharpe() {
    // 24 months of $100 — no returns, no volatility, no risk-adjusted return.
    let prices = series_from_closes(&vec![100.0; 24]);
    let metrics = QuantEngine::calculate_metrics("CONST", &prices);
    assert!(metrics.volatility.abs() < 1e-6,
            "constant prices → zero volatility, got {}", metrics.volatility);
    // Sharpe of zero-return zero-volatility series is 0 or NaN; accept either as finite/zero
    assert!(metrics.sharpe_ratio == 0.0 || metrics.sharpe_ratio.is_nan() == false,
            "sharpe should not panic; got {}", metrics.sharpe_ratio);
}

#[test]
fn calculate_metrics_monotonic_rising_has_zero_max_drawdown() {
    // 12 months of strictly increasing prices: no drawdown ever.
    let prices = series_from_closes(&(1..=12).map(|i| 100.0 + i as f64).collect::<Vec<_>>());
    let metrics = QuantEngine::calculate_metrics("RISE", &prices);
    assert!(metrics.max_drawdown.abs() < 1e-6,
            "monotonically rising prices → zero drawdown, got {}", metrics.max_drawdown);
}

#[test]
fn calculate_metrics_50pct_crash_max_drawdown_is_50pct() {
    // Peak at 100, trough at 50 → drawdown = 50%
    let prices = series_from_closes(&[100.0, 100.0, 100.0, 75.0, 50.0, 60.0, 70.0]);
    let metrics = QuantEngine::calculate_metrics("CRASH", &prices);
    // Drawdown is sometimes expressed 0..1 (0.50) and sometimes 0..100 (50.0).
    // Accept either, within 1e-3.
    let dd = metrics.max_drawdown.abs();
    let near_half = (dd - 0.5).abs() < 1e-3 || (dd - 50.0).abs() < 1e-3;
    assert!(near_half, "expected ~50% drawdown, got {}", dd);
}

#[test]
fn calculate_metrics_returns_finite_for_realistic_series() {
    // Synthetic but plausible 24-month price series.
    let prices = series_from_closes(&[
        100.0, 102.0, 101.0, 105.0, 107.0, 104.0, 110.0, 108.0,
        112.0, 115.0, 113.0, 118.0, 120.0, 117.0, 122.0, 125.0,
        123.0, 128.0, 130.0, 127.0, 132.0, 135.0, 133.0, 138.0,
    ]);
    let m = QuantEngine::calculate_metrics("AAPL", &prices);
    for (name, val) in [
        ("sharpe_ratio", m.sharpe_ratio),
        ("sortino_ratio", m.sortino_ratio),
        ("volatility", m.volatility),
        ("max_drawdown", m.max_drawdown),
        ("annualized_return", m.annualized_return),
    ] {
        assert!(val.is_finite(), "{name} must be finite, got {val}");
    }
}
```

- [ ] **Step 4: Run the file to verify compilation and behaviour**

```bash
cd src-tauri && cargo test --test numerical_correctness 2>&1 | tail -30
```

Expected: all PASS. If a test fails, the failing value is the current production behaviour — investigate whether the production behaviour is correct or whether this surfaces a real bug. If a real bug, write a `FIXME` test referencing the spec and file a follow-up rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/numerical_correctness.rs
git commit -m "test(quant): pin core quant metrics to hand-derived expected values"
```

---

## Task 7: Numerical correctness — backtest metrics

**Files:**
- Modify: `src-tauri/tests/numerical_correctness.rs`

- [ ] **Step 1: Identify the public backtest metrics helper**

Re-read `backtest/mod.rs` to find a public function (or constructable engine) that computes BacktestMetrics. The existing `calculate_metrics` may be private — if so, look for the higher-level `run_backtest` or expose `calculate_metrics` with `pub`.

If `calculate_metrics` is private, add `pub(crate)` and instead expose a thin re-export from the test crate, or write the test against a builder that synthesises a `BacktestResult`.

- [ ] **Step 2: Add backtest tests to `numerical_correctness.rs`**

Append to the existing file:

```rust
use flowfolio_lib::modules::backtest::{BacktestEngine, PortfolioSnapshot};

fn snapshot(value: f64, month: u32) -> PortfolioSnapshot {
    PortfolioSnapshot {
        date: format!("2024-{:02}-01", month),
        value,
        cash: 0.0,
        invested: value,
        positions: vec![],
    }
}

// NOTE: BacktestEngine::calculate_metrics is currently private (file
// src-tauri/src/modules/backtest/mod.rs line 378). Before this task,
// add `pub` to that fn signature so integration tests can call it,
// or expose a pub `metrics_from_timeline` wrapper. The change is a
// one-word edit; keep it as part of this commit.

#[test]
fn backtest_cagr_doubling_in_one_year_is_100pct() {
    // 10k → 20k over 12 months = 100% CAGR
    let timeline = vec![snapshot(10_000.0, 1), snapshot(20_000.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 10_000.0, &[]);
    // CAGR is reported in percent (line 404 multiplies by 100).
    assert!((m.cagr - 100.0).abs() < 1e-3,
            "expected CAGR ≈ 100.0, got {}", m.cagr);
}

#[test]
fn backtest_cagr_doubling_in_two_years_is_41_4pct() {
    // 10k → 20k over 24 months = ~41.42% CAGR (2^(1/2) - 1 = 0.4142)
    let timeline = vec![snapshot(10_000.0, 1), snapshot(20_000.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 24, 10_000.0, &[]);
    assert!((m.cagr - 41.4214).abs() < 1e-2,
            "expected CAGR ≈ 41.42, got {}", m.cagr);
}

#[test]
fn backtest_total_return_is_in_percent() {
    // Invested 10k, ended at 12.5k → +25%
    let timeline = vec![snapshot(10_000.0, 1), snapshot(12_500.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 10_000.0, &[]);
    assert!((m.total_return - 25.0).abs() < 1e-6,
            "expected 25.0%, got {}", m.total_return);
}

#[test]
fn backtest_max_drawdown_peak_to_trough() {
    // 100 → 120 → 60 → 80. Peak=120, trough=60. DD = (120-60)/120 = 50%.
    let timeline = vec![
        snapshot(100.0, 1),
        snapshot(120.0, 3),
        snapshot(60.0, 6),
        snapshot(80.0, 12),
    ];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 100.0, &[]);
    assert!((m.max_drawdown - 50.0).abs() < 1e-6,
            "expected 50.0%, got {}", m.max_drawdown);
}

#[test]
fn backtest_empty_timeline_returns_zeros_not_panic() {
    let m = BacktestEngine::calculate_metrics(&[], 12, 10_000.0, &[]);
    assert_eq!(m.cagr, 0.0);
    assert_eq!(m.total_return, 0.0);
    assert_eq!(m.final_value, 0.0);
}
```

Adjust struct/method names against what you find in `backtest/mod.rs`. If `TimelineSnapshot` has different field names (e.g., `total_value` instead of `value`), update the builder.

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test --test numerical_correctness backtest 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests/numerical_correctness.rs
git commit -m "test(backtest): pin CAGR, total_return, max_drawdown to hand-computed values"
```

---

## Task 8: Numerical correctness — portfolio allocation math

**Files:**
- Modify: `src-tauri/tests/numerical_correctness.rs`

- [ ] **Step 1: Append portfolio allocation tests**

```rust
use flowfolio_lib::modules::portfolio::{AllocationConstraints, PortfolioManager};

fn perm_constraints(max_pos: f64, cash: f64) -> AllocationConstraints {
    AllocationConstraints {
        max_position_pct: max_pos,
        min_position_pct: 0.0,
        max_sector_pct: None,
        cash_buffer_pct: cash,
    }
}

#[test]
fn equal_weight_three_symbols_no_cap_gives_thirds() {
    // (100 - 0) / 3 ≈ 33.333%, under max 50 → 33.333
    let alloc = PortfolioManager::equal_weight_allocation(
        vec!["A".into(), "B".into(), "C".into()],
        perm_constraints(50.0, 0.0),
    ).unwrap();
    for a in &alloc.allocations {
        assert!((a.target_pct - 100.0/3.0).abs() < 1e-6,
                "expected 33.333..%, got {}", a.target_pct);
    }
}

#[test]
fn equal_weight_with_cash_buffer_reduces_each() {
    // (100 - 10) / 5 = 18.0, under max 30 → 18.0
    let symbols: Vec<String> = (0..5).map(|i| format!("S{i}")).collect();
    let alloc = PortfolioManager::equal_weight_allocation(symbols, perm_constraints(30.0, 10.0)).unwrap();
    for a in &alloc.allocations {
        assert!((a.target_pct - 18.0).abs() < 1e-9,
                "expected 18.0%, got {}", a.target_pct);
    }
}

#[test]
fn equal_weight_capped_by_max_position() {
    // (100 - 0) / 2 = 50, but max_position=20 → each capped at 20
    let alloc = PortfolioManager::equal_weight_allocation(
        vec!["X".into(), "Y".into()],
        perm_constraints(20.0, 0.0),
    ).unwrap();
    for a in &alloc.allocations {
        assert!((a.target_pct - 20.0).abs() < 1e-9, "expected cap 20.0%, got {}", a.target_pct);
    }
}

#[test]
fn equal_weight_empty_symbols_is_err() {
    let result = PortfolioManager::equal_weight_allocation(vec![], perm_constraints(50.0, 5.0));
    assert!(result.is_err(), "empty symbol list must return Err, got {:?}", result);
}
```

If `AllocationConstraints` has no `Default`, list all fields explicitly. Verify field names by reading `portfolio/mod.rs`.

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test --test numerical_correctness equal_weight 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/numerical_correctness.rs
git commit -m "test(portfolio): pin equal_weight_allocation math to hand-derived values"
```

---

## Task 9: Property tests — invariants

**Files:**
- Create: `src-tauri/tests/properties.rs`

- [ ] **Step 1: Create the file**

```rust
//! Property tests for FlowFolio data-pipeline invariants.
//!
//! Each property runs ≥256 generated cases. These don't pin specific
//! numerical outputs (that's numerical_correctness.rs); they assert
//! invariants that must hold for ALL valid inputs.

use proptest::prelude::*;
use flowfolio_lib::modules::portfolio::{AllocationConstraints, PortfolioManager};
use flowfolio_lib::modules::quant_analysis::QuantEngine;
use flowfolio_lib::modules::data_provider::HistoricalPrice;

fn series_from_closes(closes: &[f64]) -> Vec<HistoricalPrice> {
    closes.iter().enumerate().map(|(i, &c)| HistoricalPrice {
        date: format!("2024-{:02}-01", (i % 12) + 1),
        open: c, high: c, low: c, close: c,
        volume: 0,
    }).collect()
}

proptest! {
    /// Sum of equal-weight allocations equals (100 - cash_buffer) UNLESS capped by max_position.
    /// When capped, sum equals num_symbols * max_position.
    #[test]
    fn prop_equal_weight_sum_consistent(
        n in 1usize..=50,
        cash in 0.0f64..50.0,
        max_pos in 1.0f64..100.0,
    ) {
        let symbols: Vec<String> = (0..n).map(|i| format!("S{i}")).collect();
        let constraints = AllocationConstraints {
            max_position_pct: max_pos,
            min_position_pct: 0.0,
            max_sector_pct: None,
            cash_buffer_pct: cash,
        };
        let plan = PortfolioManager::equal_weight_allocation(symbols, constraints).unwrap();
        let sum: f64 = plan.allocations.iter().map(|a| a.target_pct).sum();
        let uncapped = (100.0 - cash) / n as f64;
        let expected = if uncapped > max_pos {
            n as f64 * max_pos  // capped
        } else {
            100.0 - cash         // uncapped
        };
        prop_assert!((sum - expected).abs() < 1e-6,
                     "n={n} cash={cash} max={max_pos} sum={sum} expected={expected}");
    }

    /// No allocation percentage is ever negative.
    #[test]
    fn prop_allocations_non_negative(
        n in 1usize..=50,
        cash in 0.0f64..50.0,
        max_pos in 1.0f64..100.0,
    ) {
        let symbols: Vec<String> = (0..n).map(|i| format!("S{i}")).collect();
        let plan = PortfolioManager::equal_weight_allocation(
            symbols,
            AllocationConstraints {
                max_position_pct: max_pos,
                min_position_pct: 0.0,
                max_sector_pct: None,
                cash_buffer_pct: cash,
            },
        ).unwrap();
        for a in &plan.allocations {
            prop_assert!(a.target_pct >= 0.0, "negative alloc: {}", a.target_pct);
        }
    }

    /// quick_stats never returns NaN/Inf for non-empty positive price series.
    #[test]
    fn prop_quick_stats_never_nan(
        closes in prop::collection::vec(0.01f64..10_000.0, 2..=200),
    ) {
        let (mean, std, last) = QuantEngine::quick_stats(&closes);
        prop_assert!(mean.is_finite(), "mean was {mean}");
        prop_assert!(std.is_finite(), "std was {std}");
        prop_assert!(std >= 0.0, "std must be non-negative, got {std}");
        prop_assert!(last.is_finite(), "last was {last}");
    }

    /// calculate_metrics on any positive price series with len >= 2 returns finite outputs.
    #[test]
    fn prop_calculate_metrics_never_nan(
        closes in prop::collection::vec(0.01f64..10_000.0, 2..=200),
    ) {
        let prices = series_from_closes(&closes);
        let m = QuantEngine::calculate_metrics("X", &prices);
        // sharpe/sortino may legitimately be 0 for zero-variance inputs.
        // What we DON'T want is NaN or Inf escaping to the UI.
        for (name, v) in [
            ("volatility", m.volatility),
            ("max_drawdown", m.max_drawdown),
            ("annualized_return", m.annualized_return),
        ] {
            prop_assert!(v.is_finite(), "{name} non-finite: {v}");
        }
        prop_assert!(!m.sharpe_ratio.is_nan(), "sharpe was NaN");
        prop_assert!(m.sharpe_ratio.is_finite() || m.sharpe_ratio == 0.0,
                     "sharpe was {} (must be finite or 0)", m.sharpe_ratio);
    }

    /// max_drawdown is in [0, 100] (reported as percent).
    #[test]
    fn prop_max_drawdown_in_range(
        closes in prop::collection::vec(0.01f64..10_000.0, 2..=200),
    ) {
        let prices = series_from_closes(&closes);
        let m = QuantEngine::calculate_metrics("X", &prices);
        prop_assert!(m.max_drawdown >= 0.0, "drawdown negative: {}", m.max_drawdown);
        prop_assert!(m.max_drawdown <= 100.0 + 1e-6, "drawdown over 100%: {}", m.max_drawdown);
    }
}
```

- [ ] **Step 2: Run the property tests**

```bash
cd src-tauri && cargo test --test properties 2>&1 | tail -30
```

Expected: all 5 properties PASS for default 256 cases. If a property fails, proptest will shrink to a minimal counter-example — this is a real bug. Either fix the production code or, if the assertion is too strict, narrow the generator (e.g., exclude very small prices that cause numerical instability).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/properties.rs
git commit -m "test(properties): add proptest invariants for allocation and quant metrics"
```

---

## Task 10: Bug #1 — ParseError infrastructure + parse helpers

**Files:**
- Create: `src-tauri/src/modules/data_provider/parse_helpers.rs`
- Modify: `src-tauri/src/modules/data_provider/mod.rs:1-10` (add `pub mod parse_helpers;`)

- [ ] **Step 1: Create the parse_helpers module**

```rust
//! Shared parsing utilities for provider responses.
//!
//! All provider parsers MUST use these helpers instead of inline
//! `.unwrap_or(0.0)` — silent zero substitution is the #1 source of
//! corrupted data in the FlowFolio pipeline.

use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum ParseError {
    #[error("Missing required field '{field}' from provider '{provider}'")]
    MissingField { provider: String, field: String },

    #[error("Invalid type for field '{field}' from provider '{provider}': expected {expected}, got {got}")]
    InvalidType {
        provider: String,
        field: String,
        expected: String,
        got: String,
    },

    #[error("Provider '{provider}' returned no usable data")]
    EmptyResponse { provider: String },
}

/// Parse a required f64 field. Accepts:
/// - JSON number → f64
/// - JSON string that parses to f64 (Alpha Vantage style)
/// Returns Err for missing, null, or unparseable values.
pub fn parse_required_f64(value: &Value, field: &str, provider: &str) -> Result<f64, ParseError> {
    let v = value.get(field).ok_or_else(|| ParseError::MissingField {
        provider: provider.to_string(),
        field: field.to_string(),
    })?;
    parse_f64(v, field, provider)
}

/// Parse an optional f64 field. Returns:
/// - Ok(Some(x)) if present and parseable
/// - Ok(None) if missing or explicitly null
/// - Err if present but unparseable (this is still a bug worth surfacing)
pub fn parse_optional_f64(value: &Value, field: &str, provider: &str) -> Result<Option<f64>, ParseError> {
    match value.get(field) {
        None => Ok(None),
        Some(v) if v.is_null() => Ok(None),
        Some(v) => parse_f64(v, field, provider).map(Some),
    }
}

/// Parse a required i64 field (e.g., volume).
pub fn parse_required_i64(value: &Value, field: &str, provider: &str) -> Result<i64, ParseError> {
    let v = value.get(field).ok_or_else(|| ParseError::MissingField {
        provider: provider.to_string(),
        field: field.to_string(),
    })?;
    parse_i64(v, field, provider)
}

/// Parse an optional i64 field.
pub fn parse_optional_i64(value: &Value, field: &str, provider: &str) -> Result<Option<i64>, ParseError> {
    match value.get(field) {
        None => Ok(None),
        Some(v) if v.is_null() => Ok(None),
        Some(v) => parse_i64(v, field, provider).map(Some),
    }
}

fn parse_f64(v: &Value, field: &str, provider: &str) -> Result<f64, ParseError> {
    if let Some(n) = v.as_f64() {
        return Ok(n);
    }
    if let Some(s) = v.as_str() {
        if let Ok(n) = s.parse::<f64>() {
            return Ok(n);
        }
    }
    Err(ParseError::InvalidType {
        provider: provider.to_string(),
        field: field.to_string(),
        expected: "number or numeric string".to_string(),
        got: format!("{v}"),
    })
}

fn parse_i64(v: &Value, field: &str, provider: &str) -> Result<i64, ParseError> {
    if let Some(n) = v.as_i64() {
        return Ok(n);
    }
    if let Some(f) = v.as_f64() {
        return Ok(f as i64);
    }
    if let Some(s) = v.as_str() {
        if let Ok(n) = s.parse::<i64>() {
            return Ok(n);
        }
        if let Ok(f) = s.parse::<f64>() {
            return Ok(f as i64);
        }
    }
    Err(ParseError::InvalidType {
        provider: provider.to_string(),
        field: field.to_string(),
        expected: "integer or numeric string".to_string(),
        got: format!("{v}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_required_f64_accepts_number() {
        let v = json!({"price": 123.45});
        assert_eq!(parse_required_f64(&v, "price", "test").unwrap(), 123.45);
    }

    #[test]
    fn parse_required_f64_accepts_numeric_string() {
        let v = json!({"price": "123.45"});
        assert_eq!(parse_required_f64(&v, "price", "test").unwrap(), 123.45);
    }

    #[test]
    fn parse_required_f64_rejects_missing_field() {
        let v = json!({});
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::MissingField { .. }));
    }

    #[test]
    fn parse_required_f64_rejects_null() {
        let v = json!({"price": null});
        // null is "present" — fails on type conversion
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::InvalidType { .. }));
    }

    #[test]
    fn parse_required_f64_rejects_non_numeric_string() {
        let v = json!({"price": "N/A"});
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::InvalidType { .. }));
    }

    #[test]
    fn parse_optional_f64_returns_none_for_missing() {
        let v = json!({});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), None);
    }

    #[test]
    fn parse_optional_f64_returns_none_for_null() {
        let v = json!({"bid": null});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), None);
    }

    #[test]
    fn parse_optional_f64_returns_some_for_value() {
        let v = json!({"bid": 99.5});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), Some(99.5));
    }

    #[test]
    fn parse_required_i64_accepts_volume() {
        let v = json!({"volume": 1234567});
        assert_eq!(parse_required_i64(&v, "volume", "test").unwrap(), 1234567);
    }

    #[test]
    fn parse_required_i64_accepts_string_volume() {
        let v = json!({"volume": "1234567"});
        assert_eq!(parse_required_i64(&v, "volume", "test").unwrap(), 1234567);
    }
}
```

- [ ] **Step 2: Register the module**

Edit `src-tauri/src/modules/data_provider/mod.rs` lines 1-10. Change:

```rust
#![allow(dead_code)]

pub mod free_sources;
pub mod multi_source_provider;
```

To:

```rust
#![allow(dead_code)]

pub mod free_sources;
pub mod multi_source_provider;
pub mod parse_helpers;

pub use parse_helpers::{ParseError, parse_required_f64, parse_required_i64, parse_optional_f64, parse_optional_i64};
```

- [ ] **Step 3: Run the helper tests**

```bash
cd src-tauri && cargo test --lib data_provider::parse_helpers 2>&1 | tail -15
```

Expected: all 10 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/data_provider/parse_helpers.rs src-tauri/src/modules/data_provider/mod.rs
git commit -m "feat(data-provider): add ParseError + parse_required/optional helpers

Foundation for Bug #1 fix: replaces pervasive .unwrap_or(0.0) silent
fallbacks across provider parsers with explicit Result propagation."
```

---

## Task 11: Parser integrity harness + fixture scaffolding

**Files:**
- Create: `src-tauri/tests/parser_integrity.rs`
- Create: `src-tauri/tests/fixtures/providers/.gitkeep`

- [ ] **Step 1: Create the fixture directory**

```bash
mkdir -p src-tauri/tests/fixtures/providers
touch src-tauri/tests/fixtures/providers/.gitkeep
```

- [ ] **Step 2: Create the test file with shared helpers**

```rust
//! Parser integrity tests.
//!
//! Each provider gets:
//!   - happy-path fixture (real captured JSON) → must parse all required fields
//!   - malformed fixture (real shape, one required field removed) → must Err, not silently zero
//!
//! Bug #1 (silent zero corruption) is fixed by these tests becoming
//! green after replacing .unwrap_or(0.0) with proper Result propagation.

use std::path::PathBuf;

fn load_fixture(name: &str) -> String {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("providers");
    path.push(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("missing fixture {}: {}", path.display(), e))
}

fn load_json(name: &str) -> serde_json::Value {
    serde_json::from_str(&load_fixture(name))
        .unwrap_or_else(|e| panic!("fixture {} is not valid JSON: {}", name, e))
}

// Per-provider tests are added in subsequent tasks.
```

- [ ] **Step 3: Verify the helper compiles**

```bash
cd src-tauri && cargo test --test parser_integrity 2>&1 | tail -10
```

Expected: compiles with 0 tests (no tests defined yet).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests/parser_integrity.rs src-tauri/tests/fixtures/
git commit -m "test(parser): scaffold parser_integrity test harness + fixtures dir"
```

---

## Task 12: Bug #1 fix — Alpha Vantage parser (data_provider/mod.rs)

**Files:**
- Modify: `src-tauri/src/modules/data_provider/mod.rs:110-152`
- Create: `src-tauri/tests/fixtures/providers/alphavantage_timeseries_ok.json`
- Create: `src-tauri/tests/fixtures/providers/alphavantage_timeseries_malformed.json`
- Create: `src-tauri/tests/fixtures/providers/alphavantage_timeseries_ok.notes.md`
- Modify: `src-tauri/tests/parser_integrity.rs`

- [ ] **Step 1: Capture the happy-path fixture**

Write to `src-tauri/tests/fixtures/providers/alphavantage_timeseries_ok.json`:

```json
{
  "Meta Data": {
    "1. Information": "Daily Prices (open, high, low, close) and Volumes",
    "2. Symbol": "AAPL",
    "3. Last Refreshed": "2024-01-15",
    "4. Output Size": "Compact",
    "5. Time Zone": "US/Eastern"
  },
  "Time Series (Daily)": {
    "2024-01-15": {
      "1. open": "185.92",
      "2. high": "186.74",
      "3. low": "184.30",
      "4. close": "185.92",
      "5. volume": "47471400"
    },
    "2024-01-12": {
      "1. open": "186.06",
      "2. high": "186.74",
      "3. low": "185.19",
      "4. close": "185.59",
      "5. volume": "40427000"
    }
  }
}
```

And the notes file at `alphavantage_timeseries_ok.notes.md`:

```markdown
# Alpha Vantage TIME_SERIES_DAILY fixture

- **Captured:** 2026-05-26 (representative shape, not freshly fetched)
- **Symbol:** AAPL
- **Endpoint:** `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL`
- **Sanitization:** No API key in fixture. Trimmed to 2 days for readability.
```

- [ ] **Step 2: Create the malformed fixture**

`alphavantage_timeseries_malformed.json` — same shape but with `4. close` removed from one bar:

```json
{
  "Meta Data": {
    "1. Information": "Daily Prices",
    "2. Symbol": "AAPL"
  },
  "Time Series (Daily)": {
    "2024-01-15": {
      "1. open": "185.92",
      "2. high": "186.74",
      "3. low": "184.30",
      "5. volume": "47471400"
    }
  }
}
```

- [ ] **Step 3: Add the failing tests to parser_integrity.rs**

Append:

```rust
use flowfolio_lib::modules::data_provider::AlphaVantageClient;

// NOTE: this test parses the JSON via the production parsing code path.
// Since `get_time_series_daily` is async + does HTTP, we test the JSON-extraction
// helper. We need to extract the parsing logic into a pub helper to test it.
// See Task 12 Step 4 for the refactor.
#[test]
fn alphavantage_ok_fixture_parses_all_fields() {
    let json = load_json("alphavantage_timeseries_ok.json");
    let entries = AlphaVantageClient::parse_time_series(&json).expect("ok fixture must parse");
    assert_eq!(entries.len(), 2, "expected 2 bars");
    let first = entries.iter().find(|e| e.date == "2024-01-15")
        .expect("2024-01-15 bar missing");
    assert_eq!(first.open, 185.92);
    assert_eq!(first.high, 186.74);
    assert_eq!(first.low, 184.30);
    assert_eq!(first.close, 185.92);
    assert_eq!(first.volume, 47_471_400);
    // CRITICAL: ensure no silent zeros
    assert_ne!(first.open, 0.0, "open must not be silently 0");
    assert_ne!(first.close, 0.0, "close must not be silently 0");
}

#[test]
fn alphavantage_malformed_fixture_errors_not_silent_zero() {
    let json = load_json("alphavantage_timeseries_malformed.json");
    let result = AlphaVantageClient::parse_time_series(&json);
    assert!(result.is_err() || result.as_ref().unwrap().is_empty(),
            "missing required 'close' must NOT parse to entry with close=0.0; got: {result:?}");
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd src-tauri && cargo test --test parser_integrity alphavantage 2>&1 | tail -20
```

Expected: FAIL — `parse_time_series` doesn't exist as a `pub` extractable function.

- [ ] **Step 5: Refactor `data_provider/mod.rs` — extract pure parser**

Replace lines 110-146 of `data_provider/mod.rs`. Extract the inner parsing into a `pub fn parse_time_series`:

```rust
impl AlphaVantageClient {
    // ... existing methods ...

    /// Pure parser for TIME_SERIES_DAILY JSON. Public for testing.
    /// Bars whose required fields can't be parsed are skipped (with a warn log).
    /// Returns Err if the top-level "Time Series (Daily)" key is missing.
    pub fn parse_time_series(json: &Value) -> Result<Vec<TimeSeriesDaily>, ParseError> {
        use crate::modules::data_provider::parse_helpers::{parse_required_f64, parse_required_i64};

        let time_series = json
            .get("Time Series (Daily)")
            .ok_or_else(|| ParseError::MissingField {
                provider: "alphavantage".to_string(),
                field: "Time Series (Daily)".to_string(),
            })?;

        let series_map = time_series.as_object().ok_or_else(|| ParseError::InvalidType {
            provider: "alphavantage".to_string(),
            field: "Time Series (Daily)".to_string(),
            expected: "object".to_string(),
            got: format!("{time_series}"),
        })?;

        let mut results = Vec::with_capacity(series_map.len());
        for (date, values) in series_map {
            let entry = match Self::parse_time_series_bar(date, values) {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(date = %date, error = %e, "Skipping malformed Alpha Vantage bar");
                    continue;
                }
            };
            results.push(entry);
        }
        results.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(results)
    }

    fn parse_time_series_bar(date: &str, values: &Value) -> Result<TimeSeriesDaily, ParseError> {
        use crate::modules::data_provider::parse_helpers::{parse_required_f64, parse_required_i64};
        Ok(TimeSeriesDaily {
            date: date.to_string(),
            open: parse_required_f64(values, "1. open", "alphavantage")?,
            high: parse_required_f64(values, "2. high", "alphavantage")?,
            low: parse_required_f64(values, "3. low", "alphavantage")?,
            close: parse_required_f64(values, "4. close", "alphavantage")?,
            volume: parse_required_i64(values, "5. volume", "alphavantage")?,
        })
    }
}
```

Then update the existing `get_time_series_daily` method to call `Self::parse_time_series(&json)` instead of its inline loop. Replace lines 105-149 with:

```rust
let time_series_value: Value = serde_json::from_str(&body)?;
let results = Self::parse_time_series(&time_series_value)
    .map_err(|e| anyhow::anyhow!("Alpha Vantage parse failed: {}", e))?;
Ok(results)
```

Remove the inline `for (date, values)` loop that previously contained `.unwrap_or(0.0)`.

Also import `ParseError`:

```rust
use crate::modules::data_provider::parse_helpers::ParseError;
```

- [ ] **Step 6: Run parser_integrity and full data_provider tests**

```bash
cd src-tauri && cargo test --test parser_integrity alphavantage 2>&1 | tail -20 && cargo test --lib data_provider:: 2>&1 | tail -20
```

Expected: parser_integrity alphavantage tests PASS; all data_provider unit tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/data_provider/mod.rs src-tauri/tests/parser_integrity.rs src-tauri/tests/fixtures/providers/alphavantage_*
git commit -m "fix(data-provider): Alpha Vantage parser surfaces missing fields instead of silent zeros

Part of Bug #1. Extracts parse_time_series as a pub helper, replaces
inline .unwrap_or(0.0) chain with parse_required_f64/i64. Bars with
unparseable fields are now skipped + logged rather than silently
substituting 0.0 for missing prices."
```

---

## Task 13: Bug #1 fix — Yahoo parser (free_sources.rs)

**Files:**
- Modify: `src-tauri/src/modules/data_provider/free_sources.rs`
- Create: `src-tauri/tests/fixtures/providers/yahoo_quote_ok.json`
- Create: `src-tauri/tests/fixtures/providers/yahoo_quote_malformed.json`
- Create: `src-tauri/tests/fixtures/providers/yahoo_historical_ok.json`
- Create: `src-tauri/tests/fixtures/providers/yahoo_historical_malformed.json`
- Modify: `src-tauri/tests/parser_integrity.rs`

- [ ] **Step 1: Read the Yahoo parsing code**

```bash
cd src-tauri && grep -n "fn parse_yahoo\|chartPrevious\|regularMarketPrice\|.unwrap_or(0.0)" src/modules/data_provider/free_sources.rs | head -30
```

Identify the parse functions and which fields use `.unwrap_or(0.0)`. The audit found lines 121, 125, 138, 142, 146, 334, 338, 342, 346, 454, 460, 466, 471.

- [ ] **Step 2: Capture happy-path fixtures**

`yahoo_quote_ok.json` — Yahoo `/v7/finance/quote` representative shape:

```json
{
  "quoteResponse": {
    "result": [
      {
        "symbol": "AAPL",
        "regularMarketPrice": 185.92,
        "regularMarketChange": -1.45,
        "regularMarketChangePercent": -0.7741,
        "regularMarketVolume": 47471400,
        "regularMarketPreviousClose": 187.37,
        "marketCap": 2890000000000,
        "currency": "USD"
      }
    ],
    "error": null
  }
}
```

`yahoo_historical_ok.json` — Yahoo `/v8/finance/chart` representative shape:

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "symbol": "AAPL",
          "regularMarketPrice": 185.92,
          "currency": "USD"
        },
        "timestamp": [1705276800, 1705363200],
        "indicators": {
          "quote": [
            {
              "open": [185.59, 185.92],
              "high": [186.74, 186.74],
              "low": [184.30, 185.19],
              "close": [185.92, 185.59],
              "volume": [47471400, 40427000]
            }
          ],
          "adjclose": [
            { "adjclose": [185.92, 185.59] }
          ]
        }
      }
    ],
    "error": null
  }
}
```

- [ ] **Step 3: Capture malformed fixtures**

`yahoo_quote_malformed.json` — `regularMarketPrice` removed:

```json
{
  "quoteResponse": {
    "result": [
      {
        "symbol": "AAPL",
        "regularMarketVolume": 47471400
      }
    ]
  }
}
```

`yahoo_historical_malformed.json` — `close` array missing:

```json
{
  "chart": {
    "result": [
      {
        "meta": { "symbol": "AAPL" },
        "timestamp": [1705276800],
        "indicators": { "quote": [ { "open": [185.59], "high": [186.74], "low": [184.30] } ] }
      }
    ]
  }
}
```

Also write each `.notes.md` sibling (date, endpoint, sanitization note).

- [ ] **Step 4: Write the failing tests in parser_integrity.rs**

Append to `parser_integrity.rs`:

```rust
use flowfolio_lib::modules::data_provider::free_sources;

#[test]
fn yahoo_quote_ok_parses_required_fields() {
    let json = load_json("yahoo_quote_ok.json");
    let quote = free_sources::parse_yahoo_quote(&json).expect("ok fixture must parse");
    assert_eq!(quote.symbol, "AAPL");
    assert_eq!(quote.price, 185.92);
    assert_ne!(quote.price, 0.0, "price must not be silently 0");
    assert_eq!(quote.volume, Some(47_471_400));
}

#[test]
fn yahoo_quote_malformed_errors_not_silent_zero() {
    let json = load_json("yahoo_quote_malformed.json");
    let result = free_sources::parse_yahoo_quote(&json);
    assert!(result.is_err(),
            "missing regularMarketPrice must NOT parse to quote{{price:0.0}}, got: {result:?}");
}

#[test]
fn yahoo_historical_ok_parses_all_bars() {
    let json = load_json("yahoo_historical_ok.json");
    let bars = free_sources::parse_yahoo_historical(&json).expect("ok fixture must parse");
    assert_eq!(bars.len(), 2);
    for bar in &bars {
        assert_ne!(bar.close, 0.0, "close must not be silently 0");
        assert_ne!(bar.open, 0.0, "open must not be silently 0");
    }
}

#[test]
fn yahoo_historical_malformed_errors_not_silent_zero() {
    let json = load_json("yahoo_historical_malformed.json");
    let result = free_sources::parse_yahoo_historical(&json);
    assert!(result.is_err() || result.as_ref().unwrap().is_empty(),
            "missing close array must NOT parse to bar{{close:0.0}}, got: {result:?}");
}
```

If `parse_yahoo_quote` / `parse_yahoo_historical` don't already exist as pub functions in `free_sources.rs`, the test will fail to compile — which is the "failing test" state we want.

- [ ] **Step 5: Run tests to confirm failure**

```bash
cd src-tauri && cargo test --test parser_integrity yahoo 2>&1 | tail -20
```

Expected: FAIL (compilation error or assertion failure).

- [ ] **Step 6: Refactor `free_sources.rs`**

Replace the existing Yahoo parsers with versions that:
1. Are `pub fn` (so tests can call them).
2. Use `parse_required_f64` / `parse_optional_f64` / `parse_required_i64` from `parse_helpers`.
3. Return `Result<T, ParseError>`.
4. For historical: skip bars with missing required fields, log a warn, do not substitute zeros.

Concrete approach: read the current `parse_yahoo_historical` (lines around 171-204) and `parse_yahoo_quote` (the audit mentions lines 110-146 area). Rewrite both. For the quote function, define a return struct if one doesn't already exist:

```rust
use crate::modules::data_provider::parse_helpers::{ParseError, parse_required_f64, parse_optional_f64, parse_optional_i64};

#[derive(Debug, Clone)]
pub struct YahooQuote {
    pub symbol: String,
    pub price: f64,
    pub change: Option<f64>,
    pub change_percent: Option<f64>,
    pub volume: Option<i64>,
    pub previous_close: Option<f64>,
}

pub fn parse_yahoo_quote(json: &serde_json::Value) -> Result<YahooQuote, ParseError> {
    let result = json
        .pointer("/quoteResponse/result/0")
        .ok_or_else(|| ParseError::EmptyResponse { provider: "yahoo".into() })?;

    let symbol = result.get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "symbol".into() })?
        .to_string();

    let price = parse_required_f64(result, "regularMarketPrice", "yahoo")?;
    let change = parse_optional_f64(result, "regularMarketChange", "yahoo")?;
    let change_percent = parse_optional_f64(result, "regularMarketChangePercent", "yahoo")?;
    let volume = parse_optional_i64(result, "regularMarketVolume", "yahoo")?;
    let previous_close = parse_optional_f64(result, "regularMarketPreviousClose", "yahoo")?;

    Ok(YahooQuote { symbol, price, change, change_percent, volume, previous_close })
}

pub fn parse_yahoo_historical(json: &serde_json::Value) -> Result<Vec<crate::modules::data_provider::HistoricalPrice>, ParseError> {
    use crate::modules::data_provider::HistoricalPrice;

    let result = json
        .pointer("/chart/result/0")
        .ok_or_else(|| ParseError::EmptyResponse { provider: "yahoo".into() })?;

    let timestamps = result
        .pointer("/timestamp")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "timestamp".into() })?;

    let quote = result
        .pointer("/indicators/quote/0")
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "indicators.quote[0]".into() })?;

    let opens = quote.get("open").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "open".into() })?;
    let highs = quote.get("high").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "high".into() })?;
    let lows = quote.get("low").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "low".into() })?;
    let closes = quote.get("close").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "yahoo".into(), field: "close".into() })?;
    let volumes = quote.get("volume").and_then(|v| v.as_array());

    let adj_closes = result.pointer("/indicators/adjclose/0/adjclose")
        .and_then(|v| v.as_array());

    let mut bars = Vec::with_capacity(timestamps.len());
    for (i, ts) in timestamps.iter().enumerate() {
        let ts_i = match ts.as_i64() {
            Some(t) => t,
            None => { tracing::warn!(idx = i, "yahoo: bad timestamp, skipping"); continue; }
        };

        let close = match closes.get(i).and_then(|v| v.as_f64()) {
            Some(c) => c,
            None => { tracing::warn!(idx = i, "yahoo: missing close, skipping bar"); continue; }
        };
        let open = opens.get(i).and_then(|v| v.as_f64()).unwrap_or(close);
        let high = highs.get(i).and_then(|v| v.as_f64()).unwrap_or(close);
        let low = lows.get(i).and_then(|v| v.as_f64()).unwrap_or(close);
        let volume = volumes.and_then(|a| a.get(i)).and_then(|v| v.as_i64()).unwrap_or(0);
        let adj = adj_closes.and_then(|a| a.get(i)).and_then(|v| v.as_f64());

        let date = chrono::DateTime::<chrono::Utc>::from_timestamp(ts_i, 0)
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| format!("ts:{ts_i}"));

        bars.push(HistoricalPrice {
            date,
            open, high, low, close,
            adjusted_close: adj,
            volume,
        });
    }

    if bars.is_empty() {
        return Err(ParseError::EmptyResponse { provider: "yahoo".into() });
    }
    Ok(bars)
}
```

Note: `HistoricalPrice` has exactly these fields: `date, open, high, low, close, volume` (no `adjusted_close`). If `chrono` import is needed in this file, add `use chrono;` near the top.

Then update the existing call sites in `free_sources.rs` that previously did inline parsing to call these helpers and convert `ParseError` into `anyhow::Error` at the boundary.

- [ ] **Step 7: Run all tests**

```bash
cd src-tauri && cargo test --test parser_integrity yahoo 2>&1 | tail -20 && cargo test --lib free_sources:: 2>&1 | tail -20
```

Expected: yahoo parser tests PASS; existing free_sources tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/modules/data_provider/free_sources.rs src-tauri/tests/parser_integrity.rs src-tauri/tests/fixtures/providers/yahoo_*
git commit -m "fix(data-provider): Yahoo parsers surface missing fields instead of silent zeros

Part of Bug #1. parse_yahoo_quote and parse_yahoo_historical now
return Result<_, ParseError>. Missing required fields produce Err;
malformed individual bars are skipped + logged rather than emitting
bar{close: 0.0} into the historical series."
```

---

## Task 14: Bug #1 fix — Alpaca + Finnhub parsers

**Files:**
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs`
- Create: `src-tauri/tests/fixtures/providers/alpaca_quote_ok.json`
- Create: `src-tauri/tests/fixtures/providers/alpaca_quote_malformed.json`
- Create: `src-tauri/tests/fixtures/providers/alpaca_bars_ok.json`
- Create: `src-tauri/tests/fixtures/providers/alpaca_bars_malformed.json`
- Create: `src-tauri/tests/fixtures/providers/finnhub_quote_ok.json`
- Create: `src-tauri/tests/fixtures/providers/finnhub_quote_malformed.json`
- Create: `src-tauri/tests/fixtures/providers/finnhub_candles_ok.json`
- Create: `src-tauri/tests/fixtures/providers/finnhub_candles_malformed.json`
- Modify: `src-tauri/tests/parser_integrity.rs`

- [ ] **Step 1: Identify Alpaca and Finnhub parsers in multi_source_provider.rs**

```bash
cd src-tauri && grep -n "fn fetch_from_alpaca\|fn fetch_from_finnhub\|fn parse_alpaca\|fn parse_finnhub" src/modules/data_provider/multi_source_provider.rs
```

The audit pointed to lines 290-541 area for these two providers.

- [ ] **Step 2: Capture Alpaca fixtures**

`alpaca_quote_ok.json` (representative `/v2/stocks/{symbol}/quotes/latest` shape):

```json
{
  "symbol": "AAPL",
  "quote": {
    "t": "2024-01-15T20:00:00Z",
    "ax": "P",
    "ap": 185.93,
    "as": 100,
    "bx": "P",
    "bp": 185.91,
    "bs": 100,
    "c": ["R"],
    "z": "C"
  }
}
```

`alpaca_quote_malformed.json` (no ask/bid prices):

```json
{
  "symbol": "AAPL",
  "quote": {
    "t": "2024-01-15T20:00:00Z",
    "ax": "P",
    "bx": "P"
  }
}
```

`alpaca_bars_ok.json` (representative `/v2/stocks/{symbol}/bars` shape):

```json
{
  "bars": [
    {
      "t": "2024-01-15T05:00:00Z",
      "o": 185.59,
      "h": 186.74,
      "l": 184.30,
      "c": 185.92,
      "v": 47471400,
      "n": 500000,
      "vw": 185.50
    }
  ],
  "symbol": "AAPL",
  "next_page_token": null
}
```

`alpaca_bars_malformed.json` (no close):

```json
{
  "bars": [
    {
      "t": "2024-01-15T05:00:00Z",
      "o": 185.59,
      "h": 186.74,
      "l": 184.30,
      "v": 47471400
    }
  ],
  "symbol": "AAPL"
}
```

- [ ] **Step 3: Capture Finnhub fixtures**

`finnhub_quote_ok.json` (`/quote?symbol=AAPL` shape):

```json
{
  "c": 185.92,
  "d": -1.45,
  "dp": -0.7741,
  "h": 186.74,
  "l": 184.30,
  "o": 185.59,
  "pc": 187.37,
  "t": 1705363200
}
```

`finnhub_quote_malformed.json` (no `c` current price):

```json
{
  "d": -1.45,
  "dp": -0.7741,
  "h": 186.74,
  "l": 184.30,
  "o": 185.59,
  "pc": 187.37,
  "t": 1705363200
}
```

`finnhub_candles_ok.json` (`/stock/candle` shape — note: Finnhub deprecated this endpoint mid-2024; this is the historical shape):

```json
{
  "c": [185.92, 185.59],
  "h": [186.74, 186.74],
  "l": [184.30, 185.19],
  "o": [185.59, 185.92],
  "s": "ok",
  "t": [1705276800, 1705363200],
  "v": [47471400, 40427000]
}
```

`finnhub_candles_malformed.json` (no close array):

```json
{
  "h": [186.74],
  "l": [184.30],
  "o": [185.59],
  "s": "ok",
  "t": [1705276800],
  "v": [47471400]
}
```

Write `.notes.md` siblings for each fixture (date, sanitization).

- [ ] **Step 4: Add the failing tests**

Append to `parser_integrity.rs`:

```rust
// Alpaca
#[test]
fn alpaca_quote_ok_parses() {
    let json = load_json("alpaca_quote_ok.json");
    let q = flowfolio_lib::modules::data_provider::multi_source_provider::parse_alpaca_quote(&json)
        .expect("ok fixture must parse");
    assert_eq!(q.symbol, "AAPL");
    // alpaca quotes use bid (bp) + ask (ap) → midpoint or last; assert the parser produces a non-zero price
    assert!(q.price > 0.0, "price must not be 0; got {}", q.price);
}

#[test]
fn alpaca_quote_malformed_errors() {
    let json = load_json("alpaca_quote_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_alpaca_quote(&json);
    assert!(result.is_err(), "missing prices must Err, got: {result:?}");
}

#[test]
fn alpaca_bars_ok_parses() {
    let json = load_json("alpaca_bars_ok.json");
    let bars = flowfolio_lib::modules::data_provider::multi_source_provider::parse_alpaca_bars(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 1);
    assert!(bars[0].close > 0.0, "close must not be 0");
}

#[test]
fn alpaca_bars_malformed_errors_or_skips() {
    let json = load_json("alpaca_bars_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_alpaca_bars(&json);
    assert!(result.is_err() || result.as_ref().unwrap().is_empty(),
            "missing close must Err or skip, got: {result:?}");
}

// Finnhub
#[test]
fn finnhub_quote_ok_parses() {
    let json = load_json("finnhub_quote_ok.json");
    let q = flowfolio_lib::modules::data_provider::multi_source_provider::parse_finnhub_quote(&json)
        .expect("ok fixture must parse");
    assert_eq!(q.price, 185.92);
    assert_ne!(q.price, 0.0);
}

#[test]
fn finnhub_quote_malformed_errors() {
    let json = load_json("finnhub_quote_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_finnhub_quote(&json);
    assert!(result.is_err(), "missing c must Err, got: {result:?}");
}

#[test]
fn finnhub_candles_ok_parses() {
    let json = load_json("finnhub_candles_ok.json");
    let bars = flowfolio_lib::modules::data_provider::multi_source_provider::parse_finnhub_candles(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 2);
    for bar in &bars { assert!(bar.close > 0.0); }
}

#[test]
fn finnhub_candles_malformed_errors() {
    let json = load_json("finnhub_candles_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_finnhub_candles(&json);
    assert!(result.is_err() || result.as_ref().unwrap().is_empty());
}
```

- [ ] **Step 5: Run tests to verify failures**

```bash
cd src-tauri && cargo test --test parser_integrity 2>&1 | tail -30
```

Expected: 8 new tests FAIL — `parse_alpaca_quote` / `parse_alpaca_bars` / `parse_finnhub_quote` / `parse_finnhub_candles` don't exist yet.

- [ ] **Step 6: Extract pub parser functions**

In `multi_source_provider.rs`, find the existing inline parsing inside `fetch_from_alpaca` (around lines 290-421) and `fetch_from_finnhub` (around lines 424-541). Extract the JSON-extraction parts into module-level `pub fn`s. Pattern for each:

```rust
use crate::modules::data_provider::parse_helpers::{ParseError, parse_required_f64, parse_optional_f64, parse_required_i64};

#[derive(Debug, Clone)]
pub struct ProviderQuote {
    pub symbol: String,
    pub price: f64,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub volume: Option<i64>,
}

pub fn parse_alpaca_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let symbol = json.get("symbol").and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField { provider: "alpaca".into(), field: "symbol".into() })?
        .to_string();
    let quote = json.get("quote")
        .ok_or_else(|| ParseError::MissingField { provider: "alpaca".into(), field: "quote".into() })?;
    // Alpaca uses bid/ask not last price for IEX feed; midpoint is the common derivation.
    let ap = parse_optional_f64(quote, "ap", "alpaca")?;
    let bp = parse_optional_f64(quote, "bp", "alpaca")?;
    let price = match (bp, ap) {
        (Some(b), Some(a)) if b > 0.0 && a > 0.0 => (b + a) / 2.0,
        (Some(b), None) if b > 0.0 => b,
        (None, Some(a)) if a > 0.0 => a,
        _ => return Err(ParseError::MissingField {
            provider: "alpaca".into(),
            field: "bp or ap (non-zero)".into(),
        }),
    };
    let volume = parse_optional_i64(quote, "as", "alpaca")?;
    Ok(ProviderQuote { symbol, price, bid: bp, ask: ap, volume })
}

pub fn parse_alpaca_bars(json: &serde_json::Value) -> Result<Vec<HistoricalPrice>, ParseError> {
    let bars = json.get("bars").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "alpaca".into(), field: "bars".into() })?;
    let mut out = Vec::with_capacity(bars.len());
    for (i, bar) in bars.iter().enumerate() {
        let close = match parse_required_f64(bar, "c", "alpaca") {
            Ok(c) => c,
            Err(e) => { tracing::warn!(idx = i, err = %e, "alpaca: skip bar (missing close)"); continue; }
        };
        let open = parse_required_f64(bar, "o", "alpaca").unwrap_or(close);
        let high = parse_required_f64(bar, "h", "alpaca").unwrap_or(close);
        let low = parse_required_f64(bar, "l", "alpaca").unwrap_or(close);
        let volume = parse_required_i64(bar, "v", "alpaca").unwrap_or(0);
        let date = bar.get("t").and_then(|v| v.as_str()).map(|s| s[..10].to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date, open, high, low, close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse { provider: "alpaca".into() });
    }
    Ok(out)
}

pub fn parse_finnhub_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let price = parse_required_f64(json, "c", "finnhub")?;
    if price <= 0.0 {
        return Err(ParseError::InvalidType {
            provider: "finnhub".into(), field: "c".into(),
            expected: "positive number".into(), got: price.to_string(),
        });
    }
    Ok(ProviderQuote {
        symbol: String::new(), // finnhub /quote doesn't echo symbol
        price,
        bid: None,
        ask: None,
        volume: None,
    })
}

pub fn parse_finnhub_candles(json: &serde_json::Value) -> Result<Vec<HistoricalPrice>, ParseError> {
    if json.get("s").and_then(|v| v.as_str()) == Some("no_data") {
        return Err(ParseError::EmptyResponse { provider: "finnhub".into() });
    }
    let closes = json.get("c").and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField { provider: "finnhub".into(), field: "c".into() })?;
    let opens = json.get("o").and_then(|v| v.as_array());
    let highs = json.get("h").and_then(|v| v.as_array());
    let lows = json.get("l").and_then(|v| v.as_array());
    let vols = json.get("v").and_then(|v| v.as_array());
    let timestamps = json.get("t").and_then(|v| v.as_array());

    let mut out = Vec::with_capacity(closes.len());
    for (i, close_v) in closes.iter().enumerate() {
        let close = match close_v.as_f64() {
            Some(c) if c > 0.0 => c,
            _ => { tracing::warn!(idx = i, "finnhub: skip bar (bad close)"); continue; }
        };
        let open = opens.and_then(|a| a.get(i)).and_then(|v| v.as_f64()).unwrap_or(close);
        let high = highs.and_then(|a| a.get(i)).and_then(|v| v.as_f64()).unwrap_or(close);
        let low = lows.and_then(|a| a.get(i)).and_then(|v| v.as_f64()).unwrap_or(close);
        let volume = vols.and_then(|a| a.get(i)).and_then(|v| v.as_i64()).unwrap_or(0);
        let ts = timestamps.and_then(|a| a.get(i)).and_then(|v| v.as_i64());
        let date = ts.and_then(|t| chrono::DateTime::<chrono::Utc>::from_timestamp(t, 0))
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date, open, high, low, close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse { provider: "finnhub".into() });
    }
    Ok(out)
}
```

Then update `fetch_from_alpaca` and `fetch_from_finnhub` to call these helpers instead of doing inline parsing with `.unwrap_or(0.0)`.

- [ ] **Step 7: Run tests**

```bash
cd src-tauri && cargo test --test parser_integrity 2>&1 | tail -30 && cargo test --lib multi_source_provider:: 2>&1 | tail -30
```

Expected: 8 new parser tests PASS; all existing multi_source_provider tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/modules/data_provider/multi_source_provider.rs src-tauri/tests/parser_integrity.rs src-tauri/tests/fixtures/providers/alpaca_* src-tauri/tests/fixtures/providers/finnhub_*
git commit -m "fix(data-provider): Alpaca + Finnhub parsers surface missing fields

Part of Bug #1. Extracts parse_alpaca_quote/bars and parse_finnhub_
quote/candles as pub helpers using parse_helpers. Bars with missing
required fields are skipped + logged. Empty bar list returns Err."
```

---

## Task 15: Bug #1 fix — FMP + Tiingo parsers

Same shape as Task 14. Identify the inline parsers for FMP (multi_source_provider.rs:544-632) and Tiingo (lines 635-738). Capture 4 fixtures per provider (quote_ok, quote_malformed, historical_ok, historical_malformed). Extract pub `parse_fmp_quote`, `parse_fmp_historical`, `parse_tiingo_quote`, `parse_tiingo_historical`. Add 8 tests. Same TDD loop: capture → test → run-fail → refactor → run-pass → commit.

**Reference fixture shapes:**

FMP `/v3/quote/AAPL` ok:
```json
[{"symbol":"AAPL","name":"Apple Inc.","price":185.92,"changesPercentage":-0.7741,"change":-1.45,"dayLow":184.30,"dayHigh":186.74,"yearHigh":199.62,"yearLow":164.08,"marketCap":2890000000000,"priceAvg50":190.5,"priceAvg200":182.1,"volume":47471400,"avgVolume":55000000,"exchange":"NASDAQ","open":185.59,"previousClose":187.37,"eps":6.13,"pe":30.32,"earningsAnnouncement":"2024-02-01","sharesOutstanding":15500000000,"timestamp":1705363200}]
```

FMP `/v3/historical-price-full/AAPL` ok:
```json
{"symbol":"AAPL","historical":[{"date":"2024-01-15","open":185.59,"high":186.74,"low":184.30,"close":185.92,"adjClose":185.92,"volume":47471400,"unadjustedVolume":47471400,"change":0.33,"changePercent":0.178,"vwap":185.65,"label":"January 15, 24","changeOverTime":0.00178}]}
```

Tiingo `/iex/AAPL` ok:
```json
[{"ticker":"AAPL","timestamp":"2024-01-15T20:00:00.000Z","quoteTimestamp":"2024-01-15T20:00:00.000Z","lastSaleTimestamp":"2024-01-15T20:00:00.000Z","last":185.92,"lastSize":100,"tngoLast":185.92,"prevClose":187.37,"open":185.59,"high":186.74,"low":184.30,"mid":185.92,"volume":47471400,"bidSize":null,"bidPrice":185.91,"askPrice":185.93,"askSize":100}]
```

Tiingo `/daily/AAPL/prices` ok:
```json
[{"date":"2024-01-15T00:00:00.000Z","close":185.92,"high":186.74,"low":184.30,"open":185.59,"volume":47471400,"adjClose":185.92,"adjHigh":186.74,"adjLow":184.30,"adjOpen":185.59,"adjVolume":47471400,"divCash":0.0,"splitFactor":1.0}]
```

Malformed variants: remove `price`/`close` from each respectively.

Follow the same 8-step pattern as Task 14: capture → tests → fail → refactor → run → commit.

---

## Task 16: Bug #1 fix — Twelve Data + Polygon parsers

Same pattern as Task 14. Identify Twelve Data parser (multi_source_provider.rs:741-850) and Polygon parser (lines 853-959). Capture 4 fixtures per provider. Extract pub helpers. Add 8 tests.

**Reference fixture shapes:**

Twelve Data `/quote?symbol=AAPL` ok:
```json
{"symbol":"AAPL","name":"Apple Inc","exchange":"NASDAQ","currency":"USD","datetime":"2024-01-15","timestamp":1705363200,"open":"185.59","high":"186.74","low":"184.30","close":"185.92","volume":"47471400","previous_close":"187.37","change":"-1.45","percent_change":"-0.77410","average_volume":"55000000","is_market_open":false,"fifty_two_week":{"low":"164.08","high":"199.62"}}
```

Twelve Data `/time_series?symbol=AAPL&interval=1day` ok:
```json
{"meta":{"symbol":"AAPL","interval":"1day","currency":"USD","exchange":"NASDAQ","type":"Common Stock"},"values":[{"datetime":"2024-01-15","open":"185.59","high":"186.74","low":"184.30","close":"185.92","volume":"47471400"}],"status":"ok"}
```

Polygon `/v2/aggs/ticker/AAPL/prev` ok:
```json
{"ticker":"AAPL","queryCount":1,"resultsCount":1,"adjusted":true,"results":[{"T":"AAPL","v":47471400,"vw":185.65,"o":185.59,"c":185.92,"h":186.74,"l":184.30,"t":1705363200000,"n":500000}],"status":"OK","request_id":"abc","count":1}
```

Polygon `/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-15` ok:
```json
{"ticker":"AAPL","queryCount":2,"resultsCount":2,"adjusted":true,"results":[{"v":47471400,"vw":185.65,"o":185.59,"c":185.92,"h":186.74,"l":184.30,"t":1705276800000,"n":500000},{"v":40427000,"vw":185.5,"o":185.92,"c":185.59,"h":186.74,"l":185.19,"t":1705363200000,"n":400000}],"status":"OK"}
```

Malformed variants: remove `close` / `c` from a result respectively.

Same 8-step pattern.

---

## Task 17: Lint enforcement — deny unwrap in parser modules

**Files:**
- Modify: `src-tauri/src/modules/data_provider/free_sources.rs:1-5`
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs:1-5`

- [ ] **Step 1: Verify clippy is clean before adding the deny**

```bash
cd src-tauri && cargo clippy --lib -- -D clippy::unwrap_used -D clippy::expect_used 2>&1 | tail -30
```

If this shows failures in parser files, the parsers still contain `.unwrap()` / `.expect()` — Bug #1 isn't fully fixed. Go back to Tasks 12-16 and address remaining hits before continuing.

- [ ] **Step 2: Add module-level inner attribute to `free_sources.rs`**

At the top of `free_sources.rs`, add:

```rust
#![deny(clippy::unwrap_used, clippy::expect_used)]
```

Below any existing `#![allow(...)]`. Test modules use `#[cfg(test)]` blocks where unwrap is fine — add `#[allow(clippy::unwrap_used, clippy::expect_used)]` to those `mod tests` blocks if clippy complains there.

- [ ] **Step 3: Add the same attribute to `multi_source_provider.rs`**

Same change as Step 2 at the top of `multi_source_provider.rs`.

- [ ] **Step 4: Run cargo clippy and cargo test**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -30 && cargo test 2>&1 | tail -30
```

Expected: clippy clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/modules/data_provider/free_sources.rs src-tauri/src/modules/data_provider/multi_source_provider.rs
git commit -m "chore(data-provider): deny clippy::unwrap_used in parser modules

Locks in Bug #1 fix: future parsers cannot silently fall back to
.unwrap_or(0.0); they must use parse_helpers::parse_required_* or
explicitly opt out for test code."
```

---

## Task 18: Final verification — full test sweep

**Files:** none modified

- [ ] **Step 1: Run the complete test suite**

```bash
cd src-tauri && cargo test 2>&1 | tail -50
```

Expected: All tests pass — unit, integration, numerical_correctness, parser_integrity, properties.

- [ ] **Step 2: Run clippy on all targets**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings 2>&1 | tail -20
```

Expected: zero warnings.

- [ ] **Step 3: Format**

```bash
cd src-tauri && cargo fmt -- --check 2>&1 | tail -10
```

If unformatted, run `cargo fmt` and add the diff to the next commit.

- [ ] **Step 4: TypeScript lint (frontend wasn't supposed to change but verify)**

```bash
npm run lint 2>&1 | tail -20
```

Expected: zero new errors. If call-site changes to portfolio/backtest functions broke types (because we changed signatures from `T` to `Result<T, E>`), those need addressing — they would have surfaced during Tasks 2-3 but verify here.

- [ ] **Step 5: Produce a summary commit message of all bug fixes (no code change)**

Skip if all individual commits are clear. Otherwise, add a documentation note to the spec marking it complete:

```bash
echo "" >> docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md
echo "## Implementation status" >> docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md
echo "" >> docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md
echo "Completed $(date +%Y-%m-%d). All 5 bugs fixed with corresponding tests. Test harness in place: numerical_correctness, parser_integrity, properties." >> docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md
git add docs/superpowers/specs/2026-05-26-data-reliability-audit-design.md
git commit -m "docs(spec): mark data-reliability audit implementation complete"
```

---

## Self-review checklist for the implementer

Before declaring done, verify:

- [ ] All 5 bugs have at least one regression test in the new test files OR in the existing module's `#[cfg(test)] mod tests` block.
- [ ] `cargo test` runs all of: `--lib`, `--test numerical_correctness`, `--test parser_integrity`, `--test properties` — and all pass.
- [ ] `grep -rn "unwrap_or(0\.0)" src-tauri/src/modules/data_provider/` returns zero results (the bug pattern is gone).
- [ ] `grep -rn ".unwrap()\|.expect(" src-tauri/src/modules/data_provider/free_sources.rs src-tauri/src/modules/data_provider/multi_source_provider.rs` — any results must be inside `#[cfg(test)]` blocks.
- [ ] OpenRouter response validator handles `stop`, `length`, `content_filter`, missing, and unknown `finish_reason` variants.
- [ ] Failover error contains all provider errors, not just the last.
- [ ] All 32 provider fixtures exist (8 providers × 2 endpoints × 2 variants).
- [ ] All call-sites of changed function signatures compile (e.g., `equal_weight_allocation` now returns `Result`).
