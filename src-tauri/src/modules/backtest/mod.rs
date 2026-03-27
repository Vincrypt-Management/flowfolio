use serde::{Deserialize, Serialize};
use chrono::{NaiveDate, Datelike};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub start_date: String,
    pub end_date: String,
    pub duration_months: usize,
    pub metrics: BacktestMetrics,
    pub timeline: Vec<PortfolioSnapshot>,
    pub trades: Vec<TradeRecord>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestMetrics {
    pub cagr: f64,
    pub total_return: f64,
    pub max_drawdown: f64,
    pub volatility: f64,
    pub sharpe_ratio: f64,
    pub turnover: f64,
    pub num_trades: usize,
    pub final_value: f64,
    pub total_invested: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioSnapshot {
    pub date: String,
    pub value: f64,
    pub cash: f64,
    pub invested: f64,
    pub positions: Vec<PositionSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionSnapshot {
    pub symbol: String,
    pub shares: f64,
    pub price: f64,
    pub value: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    pub date: String,
    pub symbol: String,
    pub action: String, // "BUY" or "SELL"
    pub shares: f64,
    pub price: f64,
    pub amount: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestConfig {
    pub start_date: String,
    pub end_date: String,
    pub initial_cash: f64,
    pub monthly_contribution: f64,
    pub rebalance_frequency: String, // "monthly", "quarterly", "yearly"
    pub rebalance_threshold: f64,
    pub symbols: Vec<String>,
    pub allocation_method: String, // "equal_weight", "score_weighted"
}

/// Backtest engine for strategy simulation
pub struct BacktestEngine;

impl BacktestEngine {
    /// Run a complete backtest simulation
    pub fn run_backtest(
        config: BacktestConfig,
        prices: HashMap<String, Vec<(NaiveDate, f64)>>,
    ) -> BacktestResult {
        let mut timeline = Vec::new();
        let mut trades = Vec::new();
        let mut cash = config.initial_cash;
        let mut positions: HashMap<String, f64> = HashMap::new();
        let mut total_invested = config.initial_cash;

        // Parse dates
        let start = NaiveDate::parse_from_str(&config.start_date, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().naive_local().date());
        let end = NaiveDate::parse_from_str(&config.end_date, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().naive_local().date());

        let duration_months = Self::months_between(start, end);
        let mut current_date = start;

        // Initial buy - allocate initial cash
        let initial_allocation = Self::calculate_allocation(&config.symbols, &config.allocation_method);
        for (symbol, target_pct) in &initial_allocation {
            let amount = config.initial_cash * target_pct;
            let price = Self::get_price_at_date(symbol, current_date, &prices);
            let shares = (amount / price).floor();
            
            if shares > 0.0 {
                positions.insert(symbol.clone(), shares);
                cash -= shares * price;
                
                trades.push(TradeRecord {
                    date: current_date.to_string(),
                    symbol: symbol.clone(),
                    action: "BUY".to_string(),
                    shares,
                    price,
                    amount: shares * price,
                    reason: "Initial allocation".to_string(),
                });
            }
        }

        // Take initial snapshot
        timeline.push(Self::create_snapshot(current_date, cash, &positions, &prices));

        // Monthly loop
        for month in 0..duration_months {
            current_date = Self::add_months(start, month + 1);
            if current_date > end {
                break;
            }

            // Add monthly contribution
            cash += config.monthly_contribution;
            total_invested += config.monthly_contribution;

            // Allocate contribution
            let allocation = Self::calculate_allocation(&config.symbols, &config.allocation_method);
            let portfolio_value = Self::calculate_portfolio_value(cash, &positions, current_date, &prices);

            for (symbol, target_pct) in &allocation {
                let position_shares = positions.get(symbol).copied().unwrap_or(0.0);
                let price = Self::get_price_at_date(symbol, current_date, &prices);
                let current_value = position_shares * price;
                let target_value = portfolio_value * target_pct;
                let gap = target_value - current_value;

                if gap > 50.0 { // Minimum $50 buy
                    let shares_to_buy = (gap / price).floor();
                    if shares_to_buy > 0.0 && cash >= shares_to_buy * price {
                        *positions.entry(symbol.clone()).or_insert(0.0) += shares_to_buy;
                        cash -= shares_to_buy * price;
                        
                        trades.push(TradeRecord {
                            date: current_date.to_string(),
                            symbol: symbol.clone(),
                            action: "BUY".to_string(),
                            shares: shares_to_buy,
                            price,
                            amount: shares_to_buy * price,
                            reason: "Monthly contribution".to_string(),
                        });
                    }
                }
            }

            // Check rebalance (quarterly or as configured)
            if Self::should_rebalance(month, &config.rebalance_frequency) {
                let rebalance_trades = Self::rebalance_portfolio(
                    &mut positions,
                    &mut cash,
                    &allocation,
                    current_date,
                    config.rebalance_threshold,
                    &prices,
                );
                trades.extend(rebalance_trades);
            }

            // Take snapshot
            timeline.push(Self::create_snapshot(current_date, cash, &positions, &prices));
        }

        // Calculate metrics
        let metrics = Self::calculate_metrics(&timeline, duration_months, total_invested, &trades);
        let summary = Self::generate_summary(&metrics, &config);

        BacktestResult {
            start_date: config.start_date,
            end_date: config.end_date,
            duration_months,
            metrics,
            timeline,
            trades,
            summary,
        }
    }

    fn calculate_allocation(symbols: &[String], method: &str) -> HashMap<String, f64> {
        if symbols.is_empty() {
            return HashMap::new();
        }
        let mut allocation = HashMap::new();

        match method {
            "equal_weight" => {
                let weight = 1.0 / symbols.len() as f64;
                for symbol in symbols {
                    allocation.insert(symbol.clone(), weight);
                }
            }
            _ => {
                // Default to equal weight
                let weight = 1.0 / symbols.len() as f64;
                for symbol in symbols {
                    allocation.insert(symbol.clone(), weight);
                }
            }
        }
        
        allocation
    }

    fn get_price_at_date(
        symbol: &str,
        date: NaiveDate,
        prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
    ) -> f64 {
        prices.get(symbol)
            .and_then(|data| {
                data.iter()
                    .rev()
                    .find(|(d, _)| *d <= date)
                    .map(|(_, p)| *p)
            })
            .unwrap_or(100.0) // Fallback to $100 if no data
    }

    fn calculate_portfolio_value(
        cash: f64,
        positions: &HashMap<String, f64>,
        date: NaiveDate,
        prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
    ) -> f64 {
        let mut value = cash;
        for (symbol, shares) in positions {
            let price = Self::get_price_at_date(symbol, date, prices);
            value += shares * price;
        }
        value
    }

    fn create_snapshot(
        date: NaiveDate,
        cash: f64,
        positions: &HashMap<String, f64>,
        prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
    ) -> PortfolioSnapshot {
        let mut position_snapshots = Vec::new();
        let mut total_value = cash;

        for (symbol, shares) in positions {
            let price = Self::get_price_at_date(symbol, date, prices);
            let value = shares * price;
            total_value += value;
            
            position_snapshots.push(PositionSnapshot {
                symbol: symbol.clone(),
                shares: *shares,
                price,
                value,
                weight: 0.0, // Will calculate after
            });
        }

        // Calculate weights
        for snapshot in &mut position_snapshots {
            snapshot.weight = if total_value > 0.0 {
                (snapshot.value / total_value) * 100.0
            } else {
                0.0
            };
        }

        PortfolioSnapshot {
            date: date.to_string(),
            value: total_value,
            cash,
            invested: total_value - cash,
            positions: position_snapshots,
        }
    }

    fn should_rebalance(month: usize, frequency: &str) -> bool {
        match frequency {
            "monthly" => true,
            "quarterly" => month.is_multiple_of(3),
            "yearly" => month.is_multiple_of(12),
            _ => false,
        }
    }

    fn rebalance_portfolio(
        positions: &mut HashMap<String, f64>,
        cash: &mut f64,
        target_allocation: &HashMap<String, f64>,
        date: NaiveDate,
        threshold: f64,
        prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
    ) -> Vec<TradeRecord> {
        let mut trades = Vec::new();
        
        // Calculate current portfolio value
        let portfolio_value = Self::calculate_portfolio_value(*cash, positions, date, prices);

        // Check each position for drift
        for (symbol, target_pct) in target_allocation {
            let current_shares = positions.get(symbol).copied().unwrap_or(0.0);
            let price = Self::get_price_at_date(symbol, date, prices);
            let current_value = current_shares * price;
            let current_pct = if portfolio_value > 0.0 {
                (current_value / portfolio_value) * 100.0
            } else {
                0.0
            };
            
            let drift = (current_pct - (target_pct * 100.0)).abs();
            
            if drift > threshold {
                let target_value = portfolio_value * target_pct;
                let difference = target_value - current_value;
                
                if difference.abs() > 50.0 {
                    if difference > 0.0 && *cash >= difference {
                        // Buy
                        let shares = (difference / price).floor();
                        *positions.entry(symbol.clone()).or_insert(0.0) += shares;
                        *cash -= shares * price;
                        
                        trades.push(TradeRecord {
                            date: date.to_string(),
                            symbol: symbol.clone(),
                            action: "BUY".to_string(),
                            shares,
                            price,
                            amount: shares * price,
                            reason: format!("Rebalance (drift: {:.1}%)", drift),
                        });
                    } else if difference < 0.0 {
                        // Sell
                        let shares = (difference.abs() / price).floor();
                        if let Some(current) = positions.get_mut(symbol) {
                            let shares_to_sell = shares.min(*current);
                            *current -= shares_to_sell;
                            *cash += shares_to_sell * price;
                            
                            trades.push(TradeRecord {
                                date: date.to_string(),
                                symbol: symbol.clone(),
                                action: "SELL".to_string(),
                                shares: shares_to_sell,
                                price,
                                amount: shares_to_sell * price,
                                reason: format!("Rebalance (drift: {:.1}%)", drift),
                            });
                        }
                    }
                }
            }
        }
        
        trades
    }

    fn calculate_metrics(
        timeline: &[PortfolioSnapshot],
        duration_months: usize,
        total_invested: f64,
        trades: &[TradeRecord],
    ) -> BacktestMetrics {
        if timeline.is_empty() {
            return BacktestMetrics {
                cagr: 0.0,
                total_return: 0.0,
                max_drawdown: 0.0,
                volatility: 0.0,
                sharpe_ratio: 0.0,
                turnover: 0.0,
                num_trades: 0,
                final_value: 0.0,
                total_invested: 0.0,
            };
        }

        let initial_value = timeline.first().unwrap().value;
        let final_value = timeline.last().unwrap().value;
        let years = duration_months as f64 / 12.0;

        // CAGR
        let cagr = if years > 0.0 && initial_value > 0.0 {
            ((final_value / initial_value).powf(1.0 / years) - 1.0) * 100.0
        } else {
            0.0
        };

        // Total return
        let total_return = ((final_value - total_invested) / total_invested) * 100.0;

        // Max drawdown
        let mut max_drawdown = 0.0;
        let mut peak = timeline[0].value;
        for snapshot in timeline {
            if snapshot.value > peak {
                peak = snapshot.value;
            }
            let drawdown = ((peak - snapshot.value) / peak) * 100.0;
            if drawdown > max_drawdown {
                max_drawdown = drawdown;
            }
        }

        // Volatility (standard deviation of monthly returns)
        let returns: Vec<f64> = timeline.windows(2)
            .map(|w| {
                if w[0].value > 0.0 {
                    ((w[1].value - w[0].value) / w[0].value) * 100.0
                } else {
                    0.0
                }
            })
            .collect();

        let mean_return = if !returns.is_empty() {
            returns.iter().sum::<f64>() / returns.len() as f64
        } else {
            0.0
        };

        let variance = if !returns.is_empty() {
            returns.iter()
                .map(|r| (r - mean_return).powi(2))
                .sum::<f64>() / returns.len() as f64
        } else {
            0.0
        };
        let volatility = variance.sqrt();

        // Sharpe ratio (assuming 2% risk-free rate)
        let risk_free_rate = 2.0 / 12.0; // Monthly
        let sharpe_ratio = if volatility > 0.0 {
            (mean_return - risk_free_rate) / volatility
        } else {
            0.0
        };

        // Turnover
        let total_trade_volume: f64 = trades.iter()
            .map(|t| t.amount)
            .sum();
        let avg_portfolio_value = timeline.iter()
            .map(|s| s.value)
            .sum::<f64>() / timeline.len() as f64;
        let turnover = if avg_portfolio_value > 0.0 && years > 0.0 {
            (total_trade_volume / avg_portfolio_value / years) * 100.0
        } else {
            0.0
        };

        BacktestMetrics {
            cagr,
            total_return,
            max_drawdown,
            volatility,
            sharpe_ratio,
            turnover,
            num_trades: trades.len(),
            final_value,
            total_invested,
        }
    }

    fn generate_summary(metrics: &BacktestMetrics, config: &BacktestConfig) -> String {
        format!(
            "Backtest Summary:\n\
            Duration: {} months\n\
            Strategy: {} allocation, {} rebalance\n\
            Total Invested: ${:.2}\n\
            Final Value: ${:.2}\n\
            Total Return: {:.2}%\n\
            CAGR: {:.2}%\n\
            Max Drawdown: {:.2}%\n\
            Volatility: {:.2}%\n\
            Sharpe Ratio: {:.2}\n\
            Turnover: {:.1}%\n\
            Trades Executed: {}",
            (NaiveDate::parse_from_str(&config.end_date, "%Y-%m-%d").ok()
                .and_then(|e| NaiveDate::parse_from_str(&config.start_date, "%Y-%m-%d").ok()
                    .map(|s| Self::months_between(s, e)))
                .unwrap_or(0)),
            config.allocation_method,
            config.rebalance_frequency,
            metrics.total_invested,
            metrics.final_value,
            metrics.total_return,
            metrics.cagr,
            metrics.max_drawdown,
            metrics.volatility,
            metrics.sharpe_ratio,
            metrics.turnover,
            metrics.num_trades
        )
    }

    fn months_between(start: NaiveDate, end: NaiveDate) -> usize {
        let years = end.year() - start.year();
        let months = end.month() as i32 - start.month() as i32;
        ((years * 12) + months).max(0) as usize
    }

    fn add_months(date: NaiveDate, months: usize) -> NaiveDate {
        let total_months = date.year() * 12 + date.month() as i32 + months as i32;
        let year = total_months / 12;
        let month = (total_months % 12) as u32;
        NaiveDate::from_ymd_opt(year, month.max(1), 1).unwrap_or(date)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> BacktestConfig {
        BacktestConfig {
            start_date: "2020-01-01".to_string(),
            end_date: "2021-01-01".to_string(),
            initial_cash: 10000.0,
            monthly_contribution: 500.0,
            rebalance_frequency: "quarterly".to_string(),
            rebalance_threshold: 5.0,
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
            allocation_method: "equal_weight".to_string(),
        }
    }

    #[test]
    fn test_backtest_basic() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());

        assert!(result.metrics.final_value > 0.0);
        assert!(!result.timeline.is_empty());
        assert!(result.duration_months > 0);
    }

    #[test]
    fn test_backtest_duration_months_correct() {
        // Jan 2020 → Jan 2021 = 12 months
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert_eq!(result.duration_months, 12);
    }

    #[test]
    fn test_backtest_start_and_end_dates_preserved() {
        let config = default_config();
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert_eq!(result.start_date, "2020-01-01");
        assert_eq!(result.end_date, "2021-01-01");
    }

    #[test]
    fn test_backtest_total_invested_includes_contributions() {
        let config = BacktestConfig {
            initial_cash: 10_000.0,
            monthly_contribution: 1_000.0,
            start_date: "2020-01-01".to_string(),
            end_date: "2021-01-01".to_string(), // 12 months
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        // total_invested = 10_000 + 12 * 1_000 = 22_000
        assert_eq!(result.metrics.total_invested, 22_000.0);
    }

    #[test]
    fn test_backtest_timeline_not_empty() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(!result.timeline.is_empty());
    }

    #[test]
    fn test_backtest_trades_not_empty() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        // There should be at least the initial allocation trades
        assert!(!result.trades.is_empty());
    }

    #[test]
    fn test_backtest_num_trades_matches_trades_vec() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert_eq!(result.metrics.num_trades, result.trades.len());
    }

    #[test]
    fn test_backtest_max_drawdown_non_negative() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(result.metrics.max_drawdown >= 0.0);
    }

    #[test]
    fn test_backtest_volatility_non_negative() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(result.metrics.volatility >= 0.0);
    }

    #[test]
    fn test_backtest_cagr_finite() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(result.metrics.cagr.is_finite());
    }

    #[test]
    fn test_backtest_summary_contains_cagr() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(result.summary.contains("CAGR"));
    }

    #[test]
    fn test_backtest_summary_contains_total_return() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        assert!(result.summary.contains("Total Return"));
    }

    #[test]
    fn test_backtest_monthly_rebalance_mode() {
        let config = BacktestConfig {
            rebalance_frequency: "monthly".to_string(),
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.metrics.final_value > 0.0);
    }

    #[test]
    fn test_backtest_yearly_rebalance_mode() {
        let config = BacktestConfig {
            rebalance_frequency: "yearly".to_string(),
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.metrics.final_value > 0.0);
    }

    #[test]
    fn test_backtest_no_contribution() {
        let config = BacktestConfig {
            monthly_contribution: 0.0,
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert_eq!(result.metrics.total_invested, 10_000.0);
    }

    #[test]
    fn test_backtest_single_symbol() {
        let config = BacktestConfig {
            symbols: vec!["AAPL".to_string()],
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.metrics.final_value > 0.0);
    }

    #[test]
    fn test_backtest_many_symbols() {
        let config = BacktestConfig {
            symbols: vec![
                "AAPL".to_string(),
                "MSFT".to_string(),
                "GOOGL".to_string(),
                "AMZN".to_string(),
                "META".to_string(),
            ],
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.metrics.final_value > 0.0);
        assert!(!result.trades.is_empty());
    }

    // --- months_between via run_backtest ---

    #[test]
    fn test_months_between_same_month_is_zero() {
        let config = BacktestConfig {
            start_date: "2020-06-01".to_string(),
            end_date: "2020-06-30".to_string(),
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert_eq!(result.duration_months, 0);
    }

    #[test]
    fn test_months_between_three_months() {
        let config = BacktestConfig {
            start_date: "2020-01-01".to_string(),
            end_date: "2020-04-01".to_string(),
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert_eq!(result.duration_months, 3);
    }

    #[test]
    fn test_backtest_trade_actions_are_buy_or_sell() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        for trade in &result.trades {
            assert!(
                trade.action == "BUY" || trade.action == "SELL",
                "Unexpected trade action: {}",
                trade.action
            );
        }
    }

    #[test]
    fn test_backtest_trade_amounts_positive() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        for trade in &result.trades {
            assert!(trade.amount >= 0.0, "Trade amount negative: {}", trade.amount);
        }
    }

    #[test]
    fn test_backtest_snapshot_values_positive() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        for snap in &result.timeline {
            assert!(snap.value >= 0.0);
        }
    }

    // --- position weight calculation ---

    #[test]
    fn test_snapshot_position_weights_sum_near_100() {
        let result = BacktestEngine::run_backtest(default_config(), HashMap::new());
        if let Some(snap) = result.timeline.last() {
            if !snap.positions.is_empty() {
                // Cash is excluded from position weights, so weights are of invested portion only
                let weight_sum: f64 = snap.positions.iter().map(|p| p.weight).sum();
                // weights should sum close to (invested / total_value) * 100
                let invested_ratio = (snap.invested / snap.value) * 100.0;
                assert!((weight_sum - invested_ratio).abs() < 1.0);
            }
        }
    }

    // --- should_rebalance edge cases ---

    #[test]
    fn test_should_rebalance_unknown_frequency() {
        // Unknown frequency → false
        assert!(!BacktestEngine::should_rebalance(0, "unknown_frequency"));
        assert!(!BacktestEngine::should_rebalance(3, "never"));
    }

    #[test]
    fn test_should_rebalance_yearly_true() {
        assert!(BacktestEngine::should_rebalance(12, "yearly"));
        assert!(BacktestEngine::should_rebalance(0, "yearly"));
    }

    // --- empty symbols guard ---

    #[test]
    fn test_empty_symbols_no_panic() {
        // calculate_allocation with empty symbols must return an empty HashMap,
        // not divide by zero or panic (guards the 1.0 / symbols.len() division).
        let allocation = BacktestEngine::calculate_allocation(&[], "equal_weight");
        assert!(allocation.is_empty(), "Expected empty HashMap for empty symbols");
    }

    #[test]
    fn test_empty_symbols_run_backtest_no_panic() {
        // A full backtest with no symbols should not panic and should
        // produce a valid (zero-trade) result.
        let config = BacktestConfig {
            symbols: vec![],
            ..default_config()
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.trades.is_empty(), "Expected no trades when symbols list is empty");
        assert!(!result.timeline.is_empty(), "Timeline should still have an initial snapshot");
    }

    // --- calculate_allocation default case ---

    #[test]
    fn test_calculate_allocation_default_method() {
        // Any unknown allocation method should default to equal weight
        let symbols = vec!["AAPL".to_string(), "MSFT".to_string()];
        let allocation = BacktestEngine::calculate_allocation(&symbols, "custom_method");
        assert_eq!(allocation.len(), 2);
        assert!((allocation["AAPL"] - 0.5).abs() < 1e-6);
        assert!((allocation["MSFT"] - 0.5).abs() < 1e-6);
    }

    // --- get_price_at_date for unknown symbol ---

    #[test]
    fn test_get_price_unknown_symbol() {
        use chrono::NaiveDate;
        let date = NaiveDate::from_ymd_opt(2024, 6, 1).unwrap();
        let price = BacktestEngine::get_price_at_date("UNKNOWN_SYM", date, &HashMap::new());
        assert!((price - 100.0).abs() < 1e-6);
    }

    // --- calculate_metrics with empty timeline ---

    #[test]
    fn test_calculate_metrics_empty_timeline() {
        let metrics = BacktestEngine::calculate_metrics(&[], 12, 10000.0, &[]);
        assert!((metrics.cagr - 0.0).abs() < 1e-6);
        assert!((metrics.final_value - 0.0).abs() < 1e-6);
        assert_eq!(metrics.num_trades, 0);
    }

    // --- long backtest to trigger rebalance SELL branch ---

    #[test]
    fn test_backtest_yearly_long_triggers_rebalance() {
        // Run over 3 years with low threshold to trigger drift rebalancing
        let config = BacktestConfig {
            start_date: "2020-01-01".to_string(),
            end_date: "2023-01-01".to_string(),
            initial_cash: 10000.0,
            monthly_contribution: 0.0,
            rebalance_frequency: "yearly".to_string(),
            rebalance_threshold: 1.0, // Very low threshold to trigger rebalancing
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
            allocation_method: "equal_weight".to_string(),
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        assert!(result.metrics.final_value > 0.0);
        assert!(result.duration_months > 0);
    }

    // --- date goes past end date triggers break ---

    #[test]
    fn test_backtest_short_range_triggers_break() {
        // Start and end in same year-month range should result in a very short backtest
        let config = BacktestConfig {
            start_date: "2020-01-01".to_string(),
            end_date: "2020-02-15".to_string(), // Only ~1.5 months
            initial_cash: 5000.0,
            monthly_contribution: 500.0,
            rebalance_frequency: "monthly".to_string(),
            rebalance_threshold: 5.0,
            symbols: vec!["AAPL".to_string()],
            allocation_method: "equal_weight".to_string(),
        };
        let result = BacktestEngine::run_backtest(config, HashMap::new());
        // Should still produce a result
        assert!(result.metrics.final_value >= 0.0);
    }

    #[test]
    fn test_rebalance_portfolio_sell_branch() {
        // Covers lines 325-329, 331-338: SELL path when position is overweight
        let mut positions = HashMap::new();
        positions.insert("AAPL".to_string(), 10.0); // 10 shares × 152.5 = 1525
        let mut cash = 0.0_f64;
        let mut target = HashMap::new();
        target.insert("AAPL".to_string(), 0.1_f64); // 10% target → underweight vs 100%
        let date = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();

        let trades = BacktestEngine::rebalance_portfolio(&mut positions, &mut cash, &target, date, 1.0, &HashMap::new());

        assert!(trades.iter().any(|t| t.action == "SELL"), "Expected a SELL trade from overweight position");
    }

    #[test]
    fn test_create_snapshot_zero_total_value() {
        // Covers line 256: weight = 0.0 when total_value = 0
        let mut positions = HashMap::new();
        positions.insert("AAPL".to_string(), 0.0); // 0 shares → 0 value
        let date = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();

        let snapshot = BacktestEngine::create_snapshot(date, 0.0, &positions, &HashMap::new());
        assert_eq!(snapshot.positions.len(), 1);
        assert!((snapshot.positions[0].weight - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_rebalance_zero_portfolio_value() {
        // Covers line 298: current_pct = 0.0 when portfolio_value = 0
        let mut positions: HashMap<String, f64> = HashMap::new();
        let mut cash = 0.0_f64;
        let mut target = HashMap::new();
        target.insert("AAPL".to_string(), 0.5_f64);
        let date = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();

        // portfolio_value = 0 (no cash, no positions) → line 298
        let _trades = BacktestEngine::rebalance_portfolio(&mut positions, &mut cash, &target, date, 1.0, &HashMap::new());
        // Just verify no panic
    }

    #[test]
    fn test_calculate_metrics_zero_first_value() {
        // Covers line 402: 0.0 when w[0].value = 0 in volatility calculation
        let timeline = vec![
            PortfolioSnapshot {
                date: "2020-01-01".to_string(),
                value: 0.0,
                cash: 0.0,
                invested: 0.0,
                positions: vec![],
            },
            PortfolioSnapshot {
                date: "2020-02-01".to_string(),
                value: 1000.0,
                cash: 100.0,
                invested: 900.0,
                positions: vec![],
            },
        ];
        let metrics = BacktestEngine::calculate_metrics(&timeline, 1, 0.0, &[]);
        assert!(metrics.volatility >= 0.0);
    }
}
