// API Commands - Backtest
// Extracted from lib.rs

use std::collections::HashMap;
use chrono::NaiveDate;
use crate::modules::backtest::{BacktestEngine, BacktestConfig, BacktestResult};
use crate::ENHANCED_MARKET_SERVICE;

/// Run backtest simulation with real historical price data fetched from market providers.
#[tauri::command]
pub async fn run_backtest_simulation(config: BacktestConfig) -> Result<BacktestResult, String> {
    // Fetch historical prices for all symbols in the config.
    // Failures are non-fatal: missing symbols fall back to the $100 default inside the engine.
    let mut prices: HashMap<String, Vec<(NaiveDate, f64)>> = HashMap::new();

    for symbol in &config.symbols {
        match ENHANCED_MARKET_SERVICE.get_historical_prices(symbol).await {
            Ok(historical) => {
                let series: Vec<(NaiveDate, f64)> = historical
                    .into_iter()
                    .filter_map(|h| {
                        NaiveDate::parse_from_str(&h.date, "%Y-%m-%d")
                            .ok()
                            .map(|d| (d, h.close))
                    })
                    .collect();
                if !series.is_empty() {
                    prices.insert(symbol.clone(), series);
                }
            }
            Err(e) => {
                tracing::warn!(symbol = %symbol, error = %e, "Failed to fetch historical prices for backtest; using fallback");
            }
        }
    }

    Ok(BacktestEngine::run_backtest(config, prices))
}
