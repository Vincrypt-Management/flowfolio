// API Commands - Market Data
// These are reference implementations for future migration
// Currently commands are defined in lib.rs

use crate::services::EnhancedMarketDataService;
use crate::modules::quant_analysis::QuantMetrics;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// Note: Commands are currently in lib.rs
// This module provides the structure for future clean separation

/// Example of how to structure market commands
/// (actual implementations are in lib.rs)
pub struct MarketCommands;

impl MarketCommands {
    pub async fn get_quant_metrics_batch(
        symbols: Vec<String>,
        service: &Arc<Mutex<EnhancedMarketDataService>>,
    ) -> Result<Vec<QuantMetrics>, String> {
        let svc = service.lock().await;
        Ok(svc.get_batch_quant_metrics(symbols).await)
    }

    pub async fn get_current_prices_batch(
        symbols: Vec<String>,
        service: &Arc<Mutex<EnhancedMarketDataService>>,
    ) -> Result<HashMap<String, f64>, String> {
        let svc = service.lock().await;
        Ok(svc.get_batch_prices(symbols).await)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_commands_struct_exists() {
        let _c = MarketCommands;
    }
}
