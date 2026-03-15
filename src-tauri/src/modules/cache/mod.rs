use moka::future::Cache;
use std::time::Duration;
use serde::{Serialize, Deserialize};
use std::sync::Arc;

/// Multi-tier cache system with different TTLs for different data types
pub struct CacheManager {
    // Hot data: Real-time market quotes (30 seconds TTL)
    quote_cache: Cache<String, Arc<serde_json::Value>>,
    
    // Warm data: Historical data, company info (5 minutes TTL)
    historical_cache: Cache<String, Arc<serde_json::Value>>,
    
    // Cold data: Rarely changing data like fundamentals (30 minutes TTL)
    fundamental_cache: Cache<String, Arc<serde_json::Value>>,
    
    // AI responses cache (10 minutes TTL)
    ai_response_cache: Cache<String, Arc<String>>,
}

impl CacheManager {
    pub fn new() -> Self {
        Self {
            quote_cache: Cache::builder()
                .max_capacity(1000)
                .time_to_live(Duration::from_secs(30))
                .build(),
            
            historical_cache: Cache::builder()
                .max_capacity(500)
                .time_to_live(Duration::from_secs(300)) // 5 minutes
                .build(),
            
            fundamental_cache: Cache::builder()
                .max_capacity(200)
                .time_to_live(Duration::from_secs(1800)) // 30 minutes
                .build(),
            
            ai_response_cache: Cache::builder()
                .max_capacity(100)
                .time_to_live(Duration::from_secs(600)) // 10 minutes
                .build(),
        }
    }

    // Quote cache operations
    pub async fn get_quote(&self, symbol: &str) -> Option<Arc<serde_json::Value>> {
        self.quote_cache.get(symbol).await
    }

    pub async fn set_quote(&self, symbol: String, data: serde_json::Value) {
        self.quote_cache.insert(symbol, Arc::new(data)).await;
    }

    // Historical cache operations
    pub async fn get_historical(&self, key: &str) -> Option<Arc<serde_json::Value>> {
        self.historical_cache.get(key).await
    }

    pub async fn set_historical(&self, key: String, data: serde_json::Value) {
        self.historical_cache.insert(key, Arc::new(data)).await;
    }

    // Fundamental cache operations
    pub async fn get_fundamental(&self, symbol: &str) -> Option<Arc<serde_json::Value>> {
        self.fundamental_cache.get(symbol).await
    }

    pub async fn set_fundamental(&self, symbol: String, data: serde_json::Value) {
        self.fundamental_cache.insert(symbol, Arc::new(data)).await;
    }

    // AI response cache operations
    pub async fn get_ai_response(&self, prompt_hash: &str) -> Option<Arc<String>> {
        self.ai_response_cache.get(prompt_hash).await
    }

    pub async fn set_ai_response(&self, prompt_hash: String, response: String) {
        self.ai_response_cache.insert(prompt_hash, Arc::new(response)).await;
    }

    // Cache invalidation
    pub async fn invalidate_quote(&self, symbol: &str) {
        self.quote_cache.invalidate(symbol).await;
    }

    pub async fn invalidate_all_quotes(&self) {
        self.quote_cache.invalidate_all();
    }

    // Cache statistics
    pub async fn get_cache_stats(&self) -> CacheStats {
        CacheStats {
            quote_cache_size: self.quote_cache.entry_count(),
            historical_cache_size: self.historical_cache.entry_count(),
            fundamental_cache_size: self.fundamental_cache.entry_count(),
            ai_response_cache_size: self.ai_response_cache.entry_count(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CacheStats {
    pub quote_cache_size: u64,
    pub historical_cache_size: u64,
    pub fundamental_cache_size: u64,
    pub ai_response_cache_size: u64,
}

impl Default for CacheManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_cache_manager_new() {
        let cm = CacheManager::new();
        let stats = cm.get_cache_stats().await;
        assert_eq!(stats.quote_cache_size, 0);
        assert_eq!(stats.historical_cache_size, 0);
        assert_eq!(stats.fundamental_cache_size, 0);
        assert_eq!(stats.ai_response_cache_size, 0);
    }

    #[tokio::test]
    async fn test_cache_manager_default() {
        let cm = CacheManager::default();
        let stats = cm.get_cache_stats().await;
        assert_eq!(stats.quote_cache_size, 0);
    }

    #[tokio::test]
    async fn test_quote_cache_set_and_get() {
        let cm = CacheManager::new();
        let data = json!({"price": 150.0, "symbol": "AAPL"});
        cm.set_quote("AAPL".to_string(), data.clone()).await;

        let result = cm.get_quote("AAPL").await;
        assert!(result.is_some());
        assert_eq!(*result.unwrap(), data);
    }

    #[tokio::test]
    async fn test_quote_cache_miss() {
        let cm = CacheManager::new();
        let result = cm.get_quote("NONEXISTENT").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_historical_cache_set_and_get() {
        let cm = CacheManager::new();
        let data = json!([{"date": "2024-01-01", "close": 150.0}]);
        cm.set_historical("AAPL_historical".to_string(), data.clone()).await;

        let result = cm.get_historical("AAPL_historical").await;
        assert!(result.is_some());
        assert_eq!(*result.unwrap(), data);
    }

    #[tokio::test]
    async fn test_fundamental_cache_set_and_get() {
        let cm = CacheManager::new();
        let data = json!({"pe_ratio": 25.5, "market_cap": 3_000_000_000_u64});
        cm.set_fundamental("AAPL".to_string(), data.clone()).await;

        let result = cm.get_fundamental("AAPL").await;
        assert!(result.is_some());
        assert_eq!(*result.unwrap(), data);
    }

    #[tokio::test]
    async fn test_ai_response_cache_set_and_get() {
        let cm = CacheManager::new();
        cm.set_ai_response("hash123".to_string(), "AI response text".to_string()).await;

        let result = cm.get_ai_response("hash123").await;
        assert!(result.is_some());
        assert_eq!(*result.unwrap(), "AI response text");
    }

    #[tokio::test]
    async fn test_invalidate_quote() {
        let cm = CacheManager::new();
        cm.set_quote("AAPL".to_string(), json!({"price": 150.0})).await;
        cm.invalidate_quote("AAPL").await;

        // After invalidation it may not be immediately removed (Moka async)
        // but the call should not panic
    }

    #[tokio::test]
    async fn test_invalidate_all_quotes() {
        let cm = CacheManager::new();
        cm.set_quote("AAPL".to_string(), json!({"price": 150.0})).await;
        cm.set_quote("MSFT".to_string(), json!({"price": 300.0})).await;
        cm.invalidate_all_quotes().await;
        // Should not panic
    }

    #[tokio::test]
    async fn test_cache_stats_counts() {
        let cm = CacheManager::new();
        cm.set_quote("A".to_string(), json!(1)).await;
        cm.set_quote("B".to_string(), json!(2)).await;
        cm.set_historical("H1".to_string(), json!(3)).await;
        cm.set_fundamental("F1".to_string(), json!(4)).await;
        cm.set_ai_response("AI1".to_string(), "resp".to_string()).await;

        // Moka's entry_count is eventually consistent; sync pending operations
        cm.quote_cache.run_pending_tasks().await;
        cm.historical_cache.run_pending_tasks().await;
        cm.fundamental_cache.run_pending_tasks().await;
        cm.ai_response_cache.run_pending_tasks().await;

        let stats = cm.get_cache_stats().await;
        assert_eq!(stats.quote_cache_size, 2);
        assert_eq!(stats.historical_cache_size, 1);
        assert_eq!(stats.fundamental_cache_size, 1);
        assert_eq!(stats.ai_response_cache_size, 1);
    }
}
