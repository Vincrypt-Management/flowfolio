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
