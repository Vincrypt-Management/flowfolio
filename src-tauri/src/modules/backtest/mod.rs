use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub cagr: f64,
    pub max_drawdown: f64,
    pub volatility: f64,
    pub turnover: f64,
}

/// Backtest engine for strategy simulation
pub struct BacktestEngine;

impl BacktestEngine {
    /// Run backtest simulation
    pub fn run_backtest() -> BacktestResult {
        // TODO: Implement backtest logic
        BacktestResult {
            cagr: 0.0,
            max_drawdown: 0.0,
            volatility: 0.0,
            turnover: 0.0,
        }
    }
}
