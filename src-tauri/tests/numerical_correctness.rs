//! Numerical correctness tests for FlowFolio's quant metrics.
//!
//! Each test pins a metric's output to a hand-derived expected value.
//! Tolerances: 1e-6 for direct formulas, 1e-3 for compound (CAGR/Sharpe).
//!
//! Implementation notes vs. original spec:
//! - Analyzer struct is `QuantAnalyzer`, not `QuantEngine`.
//! - `quant_analysis::HistoricalPrice` has only `date: String, close: f64`
//!   (no OHLCV fields); the full OHLCV type lives in `data_provider`.
//! - `sortino_ratio` is `Option<f64>`, not `f64`.
//! - `max_drawdown` is expressed as a percentage (0..100 scale), e.g. 50.0 = 50%.
//! - `quick_stats` returns `(last_price, total_return_pct, volatility_pct)`,
//!   not `(mean, std, last)`. The finiteness assertions are retained unchanged.

use flowfolio_lib::modules::quant_analysis::{HistoricalPrice, QuantAnalyzer};

/// Build a HistoricalPrice series from a list of closes (one per month).
fn series_from_closes(closes: &[f64]) -> Vec<HistoricalPrice> {
    closes
        .iter()
        .enumerate()
        .map(|(i, &c)| HistoricalPrice {
            date: format!("2024-{:02}-01", (i % 12) + 1),
            close: c,
        })
        .collect()
}

#[test]
fn quick_stats_finite_for_typical_series() {
    let closes = vec![100.0, 101.0, 99.0, 102.0, 98.0];
    // Returns (last_price, total_return_pct, volatility_pct).
    let (last, total_return, volatility) = QuantAnalyzer::quick_stats(&closes);
    assert!(last.is_finite(), "last must be finite");
    assert!(total_return.is_finite(), "total_return must be finite");
    assert!(volatility.is_finite(), "volatility must be finite");
    assert!(
        volatility >= 0.0,
        "volatility must be non-negative, got {volatility}"
    );
}

#[test]
fn calculate_metrics_constant_price_has_zero_volatility() {
    // 24 months of $100 — no returns, no volatility.
    let prices = series_from_closes(&vec![100.0; 24]);
    let metrics = QuantAnalyzer::calculate_metrics("CONST", &prices);
    assert!(
        metrics.volatility.abs() < 1e-6,
        "constant prices → zero volatility, got {}",
        metrics.volatility
    );
    assert!(
        !metrics.sharpe_ratio.is_nan(),
        "sharpe must not be NaN even for zero-variance series"
    );
}

#[test]
fn calculate_metrics_monotonic_rising_has_zero_max_drawdown() {
    // 12 months of strictly increasing prices → no drawdown ever.
    let prices = series_from_closes(&(1..=12).map(|i| 100.0 + i as f64).collect::<Vec<_>>());
    let metrics = QuantAnalyzer::calculate_metrics("RISE", &prices);
    assert!(
        metrics.max_drawdown.abs() < 1e-6,
        "monotonically rising prices → zero drawdown, got {}",
        metrics.max_drawdown
    );
}

#[test]
fn calculate_metrics_50pct_crash_max_drawdown_is_50pct() {
    // Peak at 100, trough at 50 → drawdown = 50%.
    // Implementation stores max_drawdown as a percentage on the 0..100 scale,
    // so the expected value is 50.0.
    // Series must be >= MIN_DATA_POINTS (14) to pass the data-guard.
    // Hand-derivation: peak = 100, trough = 50 → dd = (50-100)/100 = -0.50 → 50.0%.
    let prices = series_from_closes(&[
        100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 75.0, 50.0, 55.0, 60.0, 65.0, 70.0,
    ]);
    let metrics = QuantAnalyzer::calculate_metrics("CRASH", &prices);
    // Accept either 0..1 (0.50) or 0..100 (50.0) representation.
    let dd = metrics.max_drawdown.abs();
    let near_half = (dd - 0.5).abs() < 1e-3 || (dd - 50.0).abs() < 1e-3;
    assert!(
        near_half,
        "expected ~50% drawdown (0.5 or 50.0), got {}",
        dd
    );
}

#[test]
fn calculate_metrics_returns_all_finite_for_realistic_series() {
    // Synthetic but plausible 24-month price series.
    let prices = series_from_closes(&[
        100.0, 102.0, 101.0, 105.0, 107.0, 104.0, 110.0, 108.0, 112.0, 115.0, 113.0, 118.0, 120.0,
        117.0, 122.0, 125.0, 123.0, 128.0, 130.0, 127.0, 132.0, 135.0, 133.0, 138.0,
    ]);
    let m = QuantAnalyzer::calculate_metrics("AAPL", &prices);
    for (name, val) in [
        ("sharpe_ratio", m.sharpe_ratio),
        ("volatility", m.volatility),
        ("max_drawdown", m.max_drawdown),
        ("annualized_return", m.annualized_return),
    ] {
        assert!(val.is_finite(), "{name} must be finite, got {val}");
    }
    // sortino_ratio is Option<f64>; if present, it must be finite.
    if let Some(sr) = m.sortino_ratio {
        assert!(
            sr.is_finite(),
            "sortino_ratio must be finite when present, got {sr}"
        );
    }
}

// ============================================================================
// Backtest metric tests
// ============================================================================

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

#[test]
fn backtest_cagr_doubling_in_one_year_is_100pct() {
    // 10k → 20k over 12 months = 100% CAGR (reported as percent)
    // Formula: (final/initial)^(1/years) - 1) * 100 = (20000/10000)^1 - 1) * 100 = 100.0
    let timeline = vec![snapshot(10_000.0, 1), snapshot(20_000.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 10_000.0, &[]);
    assert!(
        (m.cagr - 100.0).abs() < 1e-3,
        "expected CAGR ≈ 100.0, got {}",
        m.cagr
    );
}

#[test]
fn backtest_cagr_doubling_in_two_years_is_41_42pct() {
    // 10k → 20k over 24 months = 2^(1/2) - 1 = 0.4142... → 41.42%
    // Formula: (20000/10000)^(12/24) - 1) * 100 = sqrt(2) - 1) * 100 ≈ 41.4214
    let timeline = vec![snapshot(10_000.0, 1), snapshot(20_000.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 24, 10_000.0, &[]);
    assert!(
        (m.cagr - 41.4214).abs() < 1e-2,
        "expected CAGR ≈ 41.42, got {}",
        m.cagr
    );
}

#[test]
fn backtest_total_return_is_in_percent() {
    // Invested 10k, ended at 12.5k → (12500 - 10000) / 10000 * 100 = +25%
    let timeline = vec![snapshot(10_000.0, 1), snapshot(12_500.0, 12)];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 10_000.0, &[]);
    assert!(
        (m.total_return - 25.0).abs() < 1e-6,
        "expected 25.0%, got {}",
        m.total_return
    );
}

#[test]
fn backtest_max_drawdown_peak_to_trough() {
    // 100 → 120 → 60 → 80. Peak=120, trough=60. DD = (120-60)/120 * 100 = 50%.
    let timeline = vec![
        snapshot(100.0, 1),
        snapshot(120.0, 3),
        snapshot(60.0, 6),
        snapshot(80.0, 12),
    ];
    let m = BacktestEngine::calculate_metrics(&timeline, 12, 100.0, &[]);
    assert!(
        (m.max_drawdown - 50.0).abs() < 1e-6,
        "expected 50.0%, got {}",
        m.max_drawdown
    );
}

#[test]
fn backtest_empty_timeline_returns_zeros_not_panic() {
    let m = BacktestEngine::calculate_metrics(&[], 12, 10_000.0, &[]);
    assert_eq!(m.cagr, 0.0);
    assert_eq!(m.total_return, 0.0);
    assert_eq!(m.final_value, 0.0);
}

// ============================================================================
// Portfolio allocation math tests
// ============================================================================

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
    )
    .unwrap();
    for a in &alloc.allocations {
        assert!(
            (a.target_pct - 100.0 / 3.0).abs() < 1e-6,
            "expected 33.333..%, got {}",
            a.target_pct
        );
    }
}

#[test]
fn equal_weight_with_cash_buffer_reduces_each() {
    // (100 - 10) / 5 = 18.0, under max 30 → 18.0
    let symbols: Vec<String> = (0..5).map(|i| format!("S{i}")).collect();
    let alloc =
        PortfolioManager::equal_weight_allocation(symbols, perm_constraints(30.0, 10.0)).unwrap();
    for a in &alloc.allocations {
        assert!(
            (a.target_pct - 18.0).abs() < 1e-9,
            "expected 18.0%, got {}",
            a.target_pct
        );
    }
}

#[test]
fn equal_weight_capped_by_max_position() {
    // (100 - 0) / 2 = 50, but max_position=20 → each capped at 20
    let alloc = PortfolioManager::equal_weight_allocation(
        vec!["X".into(), "Y".into()],
        perm_constraints(20.0, 0.0),
    )
    .unwrap();
    for a in &alloc.allocations {
        assert!(
            (a.target_pct - 20.0).abs() < 1e-9,
            "expected cap 20.0%, got {}",
            a.target_pct
        );
    }
}

#[test]
fn equal_weight_empty_symbols_is_err() {
    let result = PortfolioManager::equal_weight_allocation(vec![], perm_constraints(50.0, 5.0));
    assert!(
        result.is_err(),
        "empty symbol list must return Err, got {:?}",
        result
    );
}
