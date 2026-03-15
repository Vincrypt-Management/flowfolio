// API Commands - Cache
// These are reference implementations for future migration
// Currently commands are defined in lib.rs

use crate::services::EnhancedMarketDataService;
use crate::services::enhanced_market_service::CacheStats;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Example of how to structure cache commands
pub struct CacheCommands;

impl CacheCommands {
    pub async fn get_cache_stats(
        service: &Arc<Mutex<EnhancedMarketDataService>>,
    ) -> Result<CacheStats, String> {
        let svc = service.lock().await;
        Ok(svc.get_cache_stats().await)
    }

    pub async fn clear_all_caches(
        service: &Arc<Mutex<EnhancedMarketDataService>>,
    ) -> Result<(), String> {
        let svc = service.lock().await;
        svc.clear_all_caches().await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_commands_struct_exists() {
        let _c = CacheCommands;
    }
}
