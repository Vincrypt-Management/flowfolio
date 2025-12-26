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
    pub fn run_backtest(config: BacktestConfig) -> BacktestResult {
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
            let price = Self::get_price_at_date(symbol, current_date);
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
        timeline.push(Self::create_snapshot(current_date, cash, &positions));

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
            let portfolio_value = Self::calculate_portfolio_value(cash, &positions, current_date);
            
            for (symbol, target_pct) in &allocation {
                let position_shares = positions.get(symbol).copied().unwrap_or(0.0);
                let price = Self::get_price_at_date(symbol, current_date);
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
                );
                trades.extend(rebalance_trades);
            }

            // Take snapshot
            timeline.push(Self::create_snapshot(current_date, cash, &positions));
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

    fn get_price_at_date(symbol: &str, _date: NaiveDate) -> f64 {
        // Simplified: Use fixed prices for demo
        // In production, would query actual historical data
        match symbol {
            "AAPL" => 150.0 + ((_date.month() % 12) as f64 * 2.5),
            "MSFT" => 300.0 + ((_date.month() % 12) as f64 * 5.0),
            "GOOGL" => 100.0 + ((_date.month() % 12) as f64 * 3.0),
            "AMZN" => 120.0 + ((_date.month() % 12) as f64 * 4.0),
            "META" => 350.0 + ((_date.month() % 12) as f64 * 8.0),
            _ => 100.0,
        }
    }

    fn calculate_portfolio_value(cash: f64, positions: &HashMap<String, f64>, date: NaiveDate) -> f64 {
        let mut value = cash;
        for (symbol, shares) in positions {
            let price = Self::get_price_at_date(symbol, date);
            value += shares * price;
        }
        value
    }

    fn create_snapshot(date: NaiveDate, cash: f64, positions: &HashMap<String, f64>) -> PortfolioSnapshot {
        let mut position_snapshots = Vec::new();
        let mut total_value = cash;

        for (symbol, shares) in positions {
            let price = Self::get_price_at_date(symbol, date);
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
            "quarterly" => month % 3 == 0,
            "yearly" => month % 12 == 0,
            _ => false,
        }
    }

    fn rebalance_portfolio(
        positions: &mut HashMap<String, f64>,
        cash: &mut f64,
        target_allocation: &HashMap<String, f64>,
        date: NaiveDate,
        threshold: f64,
    ) -> Vec<TradeRecord> {
        let mut trades = Vec::new();
        
        // Calculate current portfolio value
        let portfolio_value = Self::calculate_portfolio_value(*cash, positions, date);
        
        // Check each position for drift
        for (symbol, target_pct) in target_allocation {
            let current_shares = positions.get(symbol).copied().unwrap_or(0.0);
            let price = Self::get_price_at_date(symbol, date);
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

    #[test]
    fn test_backtest_basic() {
        let config = BacktestConfig {
            start_date: "2020-01-01".to_string(),
            end_date: "2021-01-01".to_string(),
            initial_cash: 10000.0,
            monthly_contribution: 500.0,
            rebalance_frequency: "quarterly".to_string(),
            rebalance_threshold: 5.0,
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
            allocation_method: "equal_weight".to_string(),
        };

        let result = BacktestEngine::run_backtest(config);
        
        assert!(result.metrics.final_value > 0.0);
        assert!(!result.timeline.is_empty());
        assert!(result.duration_months > 0);
    }
}
