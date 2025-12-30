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
                eprintln!("Request failed for {}: {}", url, e);
                return Err(format!("Request failed: {}", e));
            }
        };

        // Check HTTP status
        if !response.status().is_success() {
            let status = response.status();
            eprintln!("HTTP error for {}: {}", url, status);
            return Err(format!("HTTP error: {}", status));
        }

        // Get text first for better error handling
        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Failed to read response for {}: {}", url, e);
                return Err(format!("Read error: {}", e));
            }
        };

        // Parse JSON with detailed error
        let data: Value = match serde_json::from_str(&text) {
            Ok(json) => json,
            Err(e) => {
                eprintln!("JSON parse failed for {}: {}", url, e);
                eprintln!("Response (first 500 chars): {}", &text[..text.len().min(500)]);
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
}
