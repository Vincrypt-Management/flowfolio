use reqwest::Client;
use serde_json::Value;
use std::time::{Duration, SystemTime};
use dashmap::DashMap;
use std::sync::Arc;

/// Optimized data client with connection pooling and caching
pub struct OptimizedDataClient {
    client: Client,
    // In-memory cache with timestamps
    cache: Arc<DashMap<String, (Value, SystemTime)>>,
    cache_ttl: Duration,
}

impl OptimizedDataClient {
    pub fn new(cache_ttl_secs: u64) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            cache: Arc::new(DashMap::new()),
            cache_ttl: Duration::from_secs(cache_ttl_secs),
        }
    }

    /// Fetch with automatic caching and robust error handling
    pub async fn fetch_cached(&self, url: String) -> Result<Value, String> {
        // Check cache first
        if let Some(entry) = self.cache.get(&url) {
            let (ref data, ref timestamp) = *entry;
            let elapsed = SystemTime::now()
                .duration_since(*timestamp)
                .unwrap_or(Duration::from_secs(0));
            
            if elapsed < self.cache_ttl {
                return Ok(data.clone());
            }
        }

        // Fetch from API with detailed error handling
        let response = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                tracing::warn!(url = %url, error = %e, "Request failed");
                return Err(format!("Request failed: {}", e));
            }
        };

        // Check HTTP status
        if !response.status().is_success() {
            let status = response.status();
            tracing::warn!(url = %url, status = %status, "HTTP error");
            return Err(format!("HTTP error: {}", status));
        }

        // Get text first for better error handling
        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(url = %url, error = %e, "Failed to read response");
                return Err(format!("Read error: {}", e));
            }
        };

        // Parse JSON with detailed error
        let data: Value = match serde_json::from_str(&text) {
            Ok(json) => json,
            Err(e) => {
                tracing::warn!(url = %url, error = %e, preview = %&text[..text.len().min(500)], "JSON parse failed");
                return Err(format!("JSON parse failed: {}", e));
            }
        };

        // Update cache
        self.cache.insert(url, (data.clone(), SystemTime::now()));

        Ok(data)
    }

    /// Batch fetch with concurrency control
    pub async fn batch_fetch(&self, urls: Vec<String>, max_concurrent: usize) -> Vec<Result<Value, String>> {
        use futures::stream::{self, StreamExt};

        stream::iter(urls)
            .map(|url| self.fetch_cached(url))
            .buffer_unordered(max_concurrent)
            .collect()
            .await
    }

    /// Clear cache
    pub fn clear_cache(&self) {
        self.cache.clear();
    }

    /// Get cache size
    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }

    /// Remove expired entries
    pub fn cleanup_cache(&self) {
        let now = SystemTime::now();
        self.cache.retain(|_, (_, timestamp)| {
            now.duration_since(*timestamp).unwrap_or(Duration::from_secs(u64::MAX)) < self.cache_ttl
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_behavior() {
        let client = OptimizedDataClient::new(60);

        // First fetch should hit API
        let url = "https://httpbin.org/json".to_string();
        let result1 = client.fetch_cached(url.clone()).await;
        assert!(result1.is_ok());

        // Second fetch should hit cache
        let result2 = client.fetch_cached(url.clone()).await;
        assert!(result2.is_ok());

        assert_eq!(client.cache_size(), 1);
    }

    #[test]
    fn test_clear_cache() {
        // Covers lines 99-101: clear_cache() function
        let client = OptimizedDataClient::new(60);
        // Manually insert into cache
        client.cache.insert("key".to_string(), (serde_json::json!({}), SystemTime::now()));
        assert_eq!(client.cache_size(), 1);
        client.clear_cache();
        assert_eq!(client.cache_size(), 0);
    }

    #[test]
    fn test_cleanup_cache_removes_expired() {
        // Covers lines 109-114: cleanup_cache removes expired entries
        let client = OptimizedDataClient::new(1); // 1 second TTL
        // Insert an old entry by using UNIX_EPOCH (way in the past)
        client.cache.insert(
            "old_key".to_string(),
            (serde_json::json!({"k": 1}), SystemTime::UNIX_EPOCH),
        );
        client.cache.insert(
            "new_key".to_string(),
            (serde_json::json!({"k": 2}), SystemTime::now()),
        );
        assert_eq!(client.cache_size(), 2);
        client.cleanup_cache();
        // Old entry should be removed, new one kept
        assert_eq!(client.cache_size(), 1);
        assert!(client.cache.contains_key("new_key"));
    }

    #[tokio::test]
    async fn test_batch_fetch_empty() {
        // Covers lines 88, 91-95: batch_fetch with empty URL list
        let client = OptimizedDataClient::new(60);
        let results = client.batch_fetch(vec![], 5).await;
        assert!(results.is_empty());
    }
}
