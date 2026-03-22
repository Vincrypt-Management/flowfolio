// API Commands - Backtest
// Extracted from lib.rs

use crate::modules::backtest::{BacktestEngine, BacktestConfig, BacktestResult};

/// Run backtest simulation
#[tauri::command]
pub fn run_backtest_simulation(config: BacktestConfig) -> Result<BacktestResult, String> {
    Ok(BacktestEngine::run_backtest(config))
}
