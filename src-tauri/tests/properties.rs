//! Property tests for FlowFolio data-pipeline invariants.
//!
//! Each property runs ≥256 generated cases (proptest default). These don't
//! pin specific numerical outputs (that's numerical_correctness.rs); they
//! assert invariants that must hold for ALL valid inputs.

use flowfolio_lib::modules::portfolio::{AllocationConstraints, PortfolioManager};
use flowfolio_lib::modules::quant_analysis::{HistoricalPrice, QuantAnalyzer};
use proptest::prelude::*;

fn series_from_closes(closes: &[f64]) -> Vec<HistoricalPrice> {
    closes
        .iter()
        .enumerate()
        .map(|(i, &c)| HistoricalPrice {
            date: format!("2024-{:02}-{:02}", ((i / 28) % 12) + 1, (i % 28) + 1),
            close: c,
        })
        .collect()
}

fn perm_constraints(max_pos: f64, cash: f64) -> AllocationConstraints {
    AllocationConstraints {
        max_position_pct: max_pos,
        min_position_pct: 0.0,
        max_sector_pct: None,
        cash_buffer_pct: cash,
    }
}

proptest! {
    /// Sum of equal-weight allocations equals either (100 - cash_buffer)
    /// when uncapped, or num_symbols * max_position when capped.
    #[test]
    fn prop_equal_weight_sum_consistent(
        n in 1usize..=50,
        cash in 0.0f64..50.0,
        max_pos in 1.0f64..100.0,
    ) {
        let symbols: Vec<String> = (0..n).map(|i| format!("S{i}")).collect();
        let plan = PortfolioManager::equal_weight_allocation(symbols, perm_constraints(max_pos, cash)).unwrap();
        let sum: f64 = plan.allocations.iter().map(|a| a.target_pct).sum();
        let uncapped = (100.0 - cash) / n as f64;
        let expected = if uncapped > max_pos {
            n as f64 * max_pos
        } else {
            100.0 - cash
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
        let plan = PortfolioManager::equal_weight_allocation(symbols, perm_constraints(max_pos, cash)).unwrap();
        for a in &plan.allocations {
            prop_assert!(a.target_pct >= 0.0, "negative alloc: {}", a.target_pct);
        }
    }

    /// quick_stats outputs are always finite + std non-negative.
    #[test]
    fn prop_quick_stats_never_nan(
        closes in prop::collection::vec(0.01f64..10_000.0, 2..=200),
    ) {
        let (a, b, c) = QuantAnalyzer::quick_stats(&closes);
        prop_assert!(a.is_finite(), "first stat non-finite: {a}");
        prop_assert!(b.is_finite(), "second stat non-finite: {b}");
        prop_assert!(c.is_finite(), "third stat non-finite: {c}");
        prop_assert!(c >= 0.0, "volatility-like value must be non-negative, got {c}");
    }

    /// calculate_metrics never produces NaN/Inf for valid positive price series.
    /// Series length >= 14 (MIN_DATA_POINTS guard) so we exercise the real code path.
    #[test]
    fn prop_calculate_metrics_never_nan(
        closes in prop::collection::vec(0.01f64..10_000.0, 14..=200),
    ) {
        let prices = series_from_closes(&closes);
        let m = QuantAnalyzer::calculate_metrics("X", &prices);
        for (name, v) in [
            ("volatility", m.volatility),
            ("max_drawdown", m.max_drawdown),
            ("annualized_return", m.annualized_return),
        ] {
            prop_assert!(v.is_finite(), "{name} non-finite: {v}");
        }
        prop_assert!(!m.sharpe_ratio.is_nan(), "sharpe was NaN");
        prop_assert!(m.sharpe_ratio.is_finite(), "sharpe non-finite: {}", m.sharpe_ratio);
        if let Some(s) = m.sortino_ratio {
            prop_assert!(s.is_finite(), "sortino non-finite: {s}");
        }
    }

    /// max_drawdown is in [0, 100] (percent scale).
    #[test]
    fn prop_max_drawdown_in_range(
        closes in prop::collection::vec(0.01f64..10_000.0, 14..=200),
    ) {
        let prices = series_from_closes(&closes);
        let m = QuantAnalyzer::calculate_metrics("X", &prices);
        prop_assert!(m.max_drawdown >= 0.0, "drawdown negative: {}", m.max_drawdown);
        prop_assert!(m.max_drawdown <= 100.0 + 1e-6, "drawdown over 100%: {}", m.max_drawdown);
    }
}
