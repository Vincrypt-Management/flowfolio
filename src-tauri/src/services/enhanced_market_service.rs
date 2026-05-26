// Enhanced Market Data Service - Industrial Grade
// Integrates multi-source provider with SQLite database caching
// Features: Circuit breaker, retry logic, health monitoring, structured errors

use crate::modules::circuit_breaker::{CircuitBreakerConfig, CircuitBreakerManager};
use crate::modules::data_provider::{HistoricalPrice, MultiSourceProvider};
use crate::modules::health::HEALTH_MONITOR;
use crate::modules::quant_analysis::{
    HistoricalPrice as QuantHistoricalPrice, QuantAnalyzer, QuantMetrics,
};
use crate::modules::retry::{RetryConfig, RetryExecutor};
use crate::services::db_cache::DatabaseCacheService;
use sqlx::{Pool, Sqlite};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

// (price, change, change_percent, fetched_at)
type QuoteCacheEntry = (f64, f64, f64, std::time::Instant);

/// Enhanced market data service with database caching and multi-source provider
/// Industrial-grade features: circuit breaker, retry logic, health monitoring
pub struct EnhancedMarketDataService {
    provider: Arc<MultiSourceProvider>,
    db_cache: RwLock<Option<Arc<DatabaseCacheService>>>,
    // Industrial-grade components
    circuit_breaker: Arc<CircuitBreakerManager>,
    #[allow(dead_code)]
    retry_executor: Arc<RetryExecutor>,
    // In-memory cache for quick access
    price_cache: Arc<RwLock<HashMap<String, (f64, std::time::Instant)>>>,
    quant_cache: Arc<RwLock<HashMap<String, (QuantMetrics, std::time::Instant)>>>,
    quote_cache: Arc<RwLock<HashMap<String, QuoteCacheEntry>>>,
    // Cache TTL settings (optimized for free tier APIs)
    price_cache_ttl: std::time::Duration,
    quant_cache_ttl: std::time::Duration,
}

impl EnhancedMarketDataService {
    /// Create new service with database pool
    #[allow(dead_code)]
    pub fn new(db_pool: Option<Pool<Sqlite>>) -> Self {
        let db_cache = db_pool.map(|pool| Arc::new(DatabaseCacheService::new(pool)));

        // Configure circuit breaker for data providers
        let cb_config = CircuitBreakerConfig {
            failure_threshold: 5,
            open_duration: std::time::Duration::from_secs(30),
            success_threshold: 2,
            failure_window: std::time::Duration::from_secs(60),
        };

        Self {
            provider: Arc::new(MultiSourceProvider::new()),
            db_cache: RwLock::new(db_cache),
            circuit_breaker: Arc::new(CircuitBreakerManager::with_config(cb_config)),
            retry_executor: Arc::new(RetryExecutor::new(RetryConfig::network())),
            price_cache: Arc::new(RwLock::new(HashMap::new())),
            quant_cache: Arc::new(RwLock::new(HashMap::new())),
            quote_cache: Arc::new(RwLock::new(HashMap::new())),
            price_cache_ttl: std::time::Duration::from_secs(120), // 2 minutes (optimized)
            quant_cache_ttl: std::time::Duration::from_secs(7200), // 2 hours (optimized)
        }
    }

    /// Create service without database (in-memory only)
    pub fn new_without_db() -> Self {
        let cb_config = CircuitBreakerConfig {
            failure_threshold: 5,
            open_duration: std::time::Duration::from_secs(30),
            success_threshold: 2,
            failure_window: std::time::Duration::from_secs(60),
        };

        Self {
            provider: Arc::new(MultiSourceProvider::new()),
            db_cache: RwLock::new(None),
            circuit_breaker: Arc::new(CircuitBreakerManager::with_config(cb_config)),
            retry_executor: Arc::new(RetryExecutor::new(RetryConfig::network())),
            price_cache: Arc::new(RwLock::new(HashMap::new())),
            quant_cache: Arc::new(RwLock::new(HashMap::new())),
            quote_cache: Arc::new(RwLock::new(HashMap::new())),
            price_cache_ttl: std::time::Duration::from_secs(120),
            quant_cache_ttl: std::time::Duration::from_secs(7200),
        }
    }

    /// Set the database pool using interior mutability (no &mut self needed).
    pub async fn set_db_pool(&self, pool: Pool<Sqlite>) {
        let mut db = self.db_cache.write().await;
        *db = Some(Arc::new(DatabaseCacheService::new(pool)));
    }

    /// Get a clone of the database pool (for direct queries like saved portfolios)
    pub async fn get_db_pool(&self) -> Option<Pool<Sqlite>> {
        let db = self.db_cache.read().await;
        db.as_ref().map(|cache| cache.get_pool().clone())
    }

    // ================== PRICE FETCHING ==================

    /// Get current price for a single symbol
    /// Uses: memory cache -> database cache -> multi-source provider (with circuit breaker)
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        let start = Instant::now();
        let symbol = symbol.to_uppercase();

        // 1. Check memory cache
        {
            let cache = self.price_cache.read().await;
            if let Some((price, timestamp)) = cache.get(&symbol) {
                if timestamp.elapsed() < self.price_cache_ttl {
                    HEALTH_MONITOR.record_cache_hit();
                    tracing::debug!(symbol = %symbol, price = price, "Memory cache hit");
                    return Ok(*price);
                }
            }
        }
        HEALTH_MONITOR.record_cache_miss();

        // 2. Check database cache
        let db_cache_opt = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt {
            if let Some(cached) = db_cache.get_cached_price(&symbol).await {
                // Update memory cache
                let mut cache = self.price_cache.write().await;
                cache.insert(
                    symbol.clone(),
                    (cached.current_price, std::time::Instant::now()),
                );
                tracing::debug!(symbol = %symbol, price = cached.current_price, "Database cache hit");
                return Ok(cached.current_price);
            }
        }

        // 3. Fetch from multi-source provider with circuit breaker
        tracing::debug!(symbol = %symbol, "Fetching from providers (with circuit breaker)");

        let provider = self.provider.clone();
        let symbol_clone = symbol.clone();

        // Use circuit breaker to protect against cascading failures
        let result = self
            .circuit_breaker
            .execute("market_data", async move {
                provider.get_market_data(&symbol_clone).await
            })
            .await;

        let data = match result {
            Ok(data) => {
                HEALTH_MONITOR.record_provider_request(
                    "market_data",
                    true,
                    start.elapsed().as_micros() as u64,
                );
                data
            }
            Err(e) => {
                HEALTH_MONITOR.record_provider_request(
                    "market_data",
                    false,
                    start.elapsed().as_micros() as u64,
                );
                return Err(format!("Provider error: {}", e));
            }
        };

        if let Some(quote) = data.quote {
            let price = quote.price;
            let now = std::time::Instant::now();

            // Update memory cache
            {
                let mut cache = self.price_cache.write().await;
                cache.insert(symbol.clone(), (price, now));
            }

            // Update quote cache (includes change data)
            {
                let mut qc = self.quote_cache.write().await;
                qc.insert(
                    symbol.clone(),
                    (price, quote.change, quote.change_percent, now),
                );
            }

            // Update database cache
            let db_cache_opt2 = self.db_cache.read().await.clone();
            if let Some(ref db_cache) = db_cache_opt2 {
                let _ = db_cache.set_cached_price(&symbol, price).await;
            }

            HEALTH_MONITOR.record_request_success(start.elapsed().as_micros() as u64);
            tracing::debug!(symbol = %symbol, source = %data.source, price = price, "Fetched price from provider");
            return Ok(price);
        }

        Err(format!("No price data available for {}", symbol))
    }

    /// Batch get current prices for multiple symbols
    pub async fn get_batch_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        let mut results = HashMap::new();
        let mut symbols_to_fetch = Vec::new();

        // 1. Check memory cache for all symbols
        {
            let cache = self.price_cache.read().await;
            for symbol in &symbols {
                let symbol_upper = symbol.to_uppercase();
                if let Some((price, timestamp)) = cache.get(&symbol_upper) {
                    if timestamp.elapsed() < self.price_cache_ttl {
                        results.insert(symbol_upper.clone(), *price);
                        continue;
                    }
                }
                symbols_to_fetch.push(symbol_upper);
            }
        }

        tracing::debug!(
            cached = results.len(),
            total = symbols.len(),
            "Prices from memory cache"
        );

        // 2. Check database cache for remaining symbols
        let db_cache_opt = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt {
            let mut still_needed = Vec::new();
            for symbol in &symbols_to_fetch {
                if let Some(cached) = db_cache.get_cached_price(symbol).await {
                    results.insert(symbol.clone(), cached.current_price);
                    // Update memory cache
                    let mut cache = self.price_cache.write().await;
                    cache.insert(
                        symbol.clone(),
                        (cached.current_price, std::time::Instant::now()),
                    );
                } else {
                    still_needed.push(symbol.clone());
                }
            }
            symbols_to_fetch = still_needed;
        }

        tracing::debug!(
            count = symbols_to_fetch.len(),
            "Prices still need fetching from providers"
        );

        // 3. Fetch remaining from providers
        if !symbols_to_fetch.is_empty() {
            let batch_data = self.provider.get_batch_market_data(symbols_to_fetch).await;

            for (symbol, data) in batch_data {
                if let Some(quote) = data.quote {
                    let price = quote.price;
                    let now = std::time::Instant::now();
                    results.insert(symbol.clone(), price);

                    // Update memory cache
                    {
                        let mut cache = self.price_cache.write().await;
                        cache.insert(symbol.clone(), (price, now));
                    }

                    // Update quote cache (includes change data)
                    {
                        let mut qc = self.quote_cache.write().await;
                        qc.insert(
                            symbol.clone(),
                            (price, quote.change, quote.change_percent, now),
                        );
                    }

                    // Update database cache
                    let db_cache_opt2 = self.db_cache.read().await.clone();
                    if let Some(ref db_cache) = db_cache_opt2 {
                        let _ = db_cache.set_cached_price(&symbol, price).await;
                    }
                }
            }
        }

        tracing::debug!(
            fetched = results.len(),
            total = symbols.len(),
            "Batch prices complete"
        );
        results
    }

    /// Batch get current quotes (price + change + change_percent).
    /// Returns cached change data when available; falls back to price-only when not.
    pub async fn get_batch_quotes(&self, symbols: Vec<String>) -> HashMap<String, (f64, f64, f64)> {
        // Ensure prices are fetched and quote_cache is populated.
        let _ = self.get_batch_prices(symbols.clone()).await;

        let qc = self.quote_cache.read().await;
        symbols
            .iter()
            .map(|s| {
                let upper = s.to_uppercase();
                let (price, change, change_pct) = qc
                    .get(&upper)
                    .map(|(p, c, cp, _)| (*p, *c, *cp))
                    .unwrap_or((0.0, 0.0, 0.0));
                (upper, (price, change, change_pct))
            })
            .collect()
    }

    // ================== HISTORICAL DATA ==================

    /// Get historical prices for a symbol
    pub async fn get_historical_prices(
        &self,
        symbol: &str,
    ) -> Result<Vec<HistoricalPrice>, String> {
        let symbol = symbol.to_uppercase();

        // 1. Check database cache for historical data
        let db_cache_opt = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt {
            if let Some(cached) = db_cache.get_cached_historical_prices(&symbol).await {
                let historical: Vec<HistoricalPrice> = cached
                    .into_iter()
                    .map(|(date, open, high, low, close, volume)| HistoricalPrice {
                        date,
                        open,
                        high,
                        low,
                        close,
                        volume,
                    })
                    .collect();

                if !historical.is_empty() {
                    tracing::debug!(symbol = %symbol, days = historical.len(), "Historical cache hit");
                    return Ok(historical);
                }
            }
        }

        // 2. Fetch from provider
        tracing::debug!(symbol = %symbol, "Fetching historical data from providers");
        let data = self.provider.get_market_data(&symbol).await?;

        if data.historical.is_empty() {
            return Err(format!("No historical data available for {}", symbol));
        }

        // 3. Save to database cache
        let db_cache_opt2 = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt2 {
            let cache_data: Vec<(String, f64, f64, f64, f64, i64)> = data
                .historical
                .iter()
                .map(|h| (h.date.clone(), h.open, h.high, h.low, h.close, h.volume))
                .collect();
            let _ = db_cache
                .set_cached_historical_prices(&symbol, &cache_data)
                .await;
        }

        tracing::debug!(days = data.historical.len(), symbol = %symbol, source = %data.source, "Fetched historical data");
        Ok(data.historical)
    }

    // ================== QUANTITATIVE METRICS ==================

    /// Get quantitative metrics for a single symbol
    pub async fn get_quant_metrics(&self, symbol: &str) -> Result<QuantMetrics, String> {
        let symbol = symbol.to_uppercase();

        // 1. Check memory cache
        {
            let cache = self.quant_cache.read().await;
            if let Some((metrics, timestamp)) = cache.get(&symbol) {
                if timestamp.elapsed() < self.quant_cache_ttl {
                    tracing::debug!(symbol = %symbol, "Quant cache hit");
                    return Ok(metrics.clone());
                }
            }
        }

        // 2. Check database cache
        let db_cache_opt = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt {
            if let Some(cached) = db_cache.get_cached_quant_metrics(&symbol).await {
                let metrics = QuantMetrics {
                    symbol: cached.symbol,
                    sharpe_ratio: cached.sharpe_ratio,
                    annualized_return: cached.annualized_return,
                    volatility: cached.volatility,
                    max_drawdown: cached.max_drawdown,
                    rsi: cached.rsi,
                    signal: cached.signal,
                    confidence: cached.confidence,
                    sortino_ratio: None,
                    calmar_ratio: None,
                    beta: None,
                    alpha: None,
                    var_95: None,
                    omega_ratio: None,
                    tail_ratio: None,
                    skewness: None,
                    kurtosis: None,
                    ulcer_index: None,
                    gain_to_loss_ratio: None,
                    win_rate: None,
                    daily_returns: None,
                };

                // Update memory cache
                let mut cache = self.quant_cache.write().await;
                cache.insert(symbol.clone(), (metrics.clone(), std::time::Instant::now()));

                return Ok(metrics);
            }
        }

        // 3. Calculate from historical data
        let historical = self.get_historical_prices(&symbol).await?;

        // Convert to quant analysis format
        let quant_prices: Vec<QuantHistoricalPrice> = historical
            .iter()
            .map(|h| QuantHistoricalPrice {
                date: h.date.clone(),
                close: h.close,
            })
            .collect();

        let metrics = QuantAnalyzer::calculate_metrics(&symbol, &quant_prices);

        // Update memory cache
        {
            let mut cache = self.quant_cache.write().await;
            cache.insert(symbol.clone(), (metrics.clone(), std::time::Instant::now()));
        }

        // Update database cache
        let db_cache_opt2 = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt2 {
            let _ = db_cache
                .set_cached_quant_metrics(
                    &symbol,
                    metrics.sharpe_ratio,
                    metrics.annualized_return,
                    metrics.volatility,
                    metrics.max_drawdown,
                    metrics.rsi,
                    &metrics.signal,
                    metrics.confidence,
                )
                .await;
        }

        Ok(metrics)
    }

    /// Batch get quantitative metrics for multiple symbols
    pub async fn get_batch_quant_metrics(&self, symbols: Vec<String>) -> Vec<QuantMetrics> {
        use futures::stream::{self, StreamExt};

        tracing::debug!(count = symbols.len(), "Getting quant metrics for symbols");

        // Process symbols in parallel for faster response
        let results: Vec<QuantMetrics> = stream::iter(symbols.clone())
            .map(|symbol| async move {
                // Try up to 2 times for each symbol
                for attempt in 1..=2 {
                    match self.get_quant_metrics(&symbol).await {
                        Ok(metrics) => {
                            tracing::debug!(symbol = %symbol, "Got quant metrics");
                            return metrics;
                        },
                        Err(e) => {
                            if attempt == 1 {
                                tracing::warn!(attempt = attempt, symbol = %symbol, error = %e, "Retry: failed to get quant metrics");
                                // Small delay before retry
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            } else {
                                tracing::error!(symbol = %symbol, attempts = attempt, error = %e, "Failed to get quant metrics after all attempts");
                            }
                        }
                    }
                }

                // Return default metrics on failure
                QuantMetrics {
                    symbol: symbol.clone(),
                    sharpe_ratio: 0.0,
                    annualized_return: 0.0,
                    volatility: 0.0,
                    max_drawdown: 0.0,
                    rsi: 50.0,
                    signal: "INSUFFICIENT DATA".to_string(),
                    confidence: 0.0,
                    sortino_ratio: None,
                    calmar_ratio: None,
                    beta: None,
                    alpha: None,
                    var_95: None,
                    omega_ratio: None,
                    tail_ratio: None,
                    skewness: None,
                    kurtosis: None,
                    ulcer_index: None,
                    gain_to_loss_ratio: None,
                    win_rate: None,
                    daily_returns: None,
                }
            })
            .buffer_unordered(5) // Process 5 symbols concurrently
            .collect()
            .await;

        let successful = results
            .iter()
            .filter(|m| m.signal != "INSUFFICIENT DATA")
            .count();
        tracing::debug!(
            successful = successful,
            total = symbols.len(),
            "Batch quant metrics complete"
        );

        results
    }

    // ================== FULL MARKET DATA ==================

    /// Get complete market data (quote + historical + metrics)
    #[allow(dead_code)]
    pub async fn get_full_market_data(&self, symbol: &str) -> Result<FullMarketData, String> {
        let symbol = symbol.to_uppercase();

        // Fetch all data in parallel
        let (price_result, historical_result, metrics_result) = tokio::join!(
            self.get_current_price(&symbol),
            self.get_historical_prices(&symbol),
            self.get_quant_metrics(&symbol)
        );

        Ok(FullMarketData {
            symbol: symbol.clone(),
            current_price: price_result.ok(),
            historical: historical_result.ok().unwrap_or_default(),
            quant_metrics: metrics_result.ok(),
        })
    }

    // ================== CACHE MANAGEMENT ==================

    /// Clear all caches
    pub async fn clear_all_caches(&self) {
        // Clear memory caches
        {
            let mut price_cache = self.price_cache.write().await;
            price_cache.clear();
        }
        {
            let mut quant_cache = self.quant_cache.write().await;
            quant_cache.clear();
        }

        // Clear provider cache
        self.provider.clear_cache();

        // Clear database cache (expired entries)
        let db_cache_opt = self.db_cache.read().await.clone();
        if let Some(ref db_cache) = db_cache_opt {
            let _ = db_cache.clear_expired_cache().await;
        }

        tracing::info!("All caches cleared");
    }

    /// Get cache statistics
    pub async fn get_cache_stats(&self) -> CacheStats {
        let memory_prices = {
            let cache = self.price_cache.read().await;
            cache.len()
        };
        let memory_quant = {
            let cache = self.quant_cache.read().await;
            cache.len()
        };

        let db_cache_opt = self.db_cache.read().await.clone();
        let db_stats = if let Some(ref db_cache) = db_cache_opt {
            Some(db_cache.get_cache_stats().await)
        } else {
            None
        };

        let provider_health = self.provider.get_health_stats();

        CacheStats {
            memory_prices,
            memory_quant,
            db_stats,
            provider_health,
        }
    }

    /// Prefetch data for symbols (background loading)
    pub async fn prefetch_symbols(&self, symbols: Vec<String>) {
        tracing::info!(count = symbols.len(), "Prefetching symbols");

        // Fetch all data in background
        let _ = self.get_batch_prices(symbols.clone()).await;

        tracing::debug!(count = symbols.len(), "Prefetch complete");
    }
}

// ================== RESPONSE TYPES ==================

#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FullMarketData {
    pub symbol: String,
    pub current_price: Option<f64>,
    pub historical: Vec<HistoricalPrice>,
    pub quant_metrics: Option<QuantMetrics>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CacheStats {
    pub memory_prices: usize,
    pub memory_quant: usize,
    pub db_stats: Option<(i64, i64, i64, i64, i64)>,
    pub provider_health: HashMap<String, (u32, u32)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Test 1: new_without_db constructs successfully ----

    #[tokio::test]
    async fn test_new_without_db_has_no_db_cache() {
        let svc = EnhancedMarketDataService::new_without_db();
        assert!(
            svc.db_cache.read().await.is_none(),
            "db_cache should be None for new_without_db()"
        );
    }

    #[tokio::test]
    async fn test_new_without_db_ttls_are_set() {
        let svc = EnhancedMarketDataService::new_without_db();
        assert_eq!(
            svc.price_cache_ttl,
            std::time::Duration::from_secs(120),
            "price_cache_ttl should be 120 seconds"
        );
        assert_eq!(
            svc.quant_cache_ttl,
            std::time::Duration::from_secs(7200),
            "quant_cache_ttl should be 7200 seconds"
        );
    }

    #[tokio::test]
    async fn test_new_without_db_caches_start_empty() {
        let svc = EnhancedMarketDataService::new_without_db();
        let price_len = svc.price_cache.read().await.len();
        let quant_len = svc.quant_cache.read().await.len();
        assert_eq!(price_len, 0, "price_cache should be empty on construction");
        assert_eq!(quant_len, 0, "quant_cache should be empty on construction");
    }

    // ---- Test 2: get_cache_stats returns zeros when caches are empty ----

    #[tokio::test]
    async fn test_get_cache_stats_empty() {
        let svc = EnhancedMarketDataService::new_without_db();
        let stats = svc.get_cache_stats().await;
        assert_eq!(
            stats.memory_prices, 0,
            "memory_prices should be 0 when cache is empty"
        );
        assert_eq!(
            stats.memory_quant, 0,
            "memory_quant should be 0 when cache is empty"
        );
        assert!(
            stats.db_stats.is_none(),
            "db_stats should be None without a database"
        );
    }

    // ---- Test 3: get_cache_stats reflects manually populated price_cache ----

    #[tokio::test]
    async fn test_get_cache_stats_reflects_populated_price_cache() {
        let svc = EnhancedMarketDataService::new_without_db();

        {
            let mut cache = svc.price_cache.write().await;
            cache.insert("AAPL".to_string(), (150.0, std::time::Instant::now()));
            cache.insert("MSFT".to_string(), (300.0, std::time::Instant::now()));
            cache.insert("TSLA".to_string(), (250.0, std::time::Instant::now()));
        }

        let stats = svc.get_cache_stats().await;
        assert_eq!(
            stats.memory_prices, 3,
            "memory_prices should equal number of inserted entries"
        );
        assert_eq!(stats.memory_quant, 0, "memory_quant should still be 0");
    }

    #[tokio::test]
    async fn test_get_cache_stats_reflects_populated_quant_cache() {
        let svc = EnhancedMarketDataService::new_without_db();

        let dummy_metrics = crate::modules::quant_analysis::QuantMetrics {
            symbol: "AAPL".to_string(),
            sharpe_ratio: 1.5,
            annualized_return: 0.25,
            volatility: 0.18,
            max_drawdown: -0.12,
            rsi: 55.0,
            signal: "BUY".to_string(),
            confidence: 0.8,
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            omega_ratio: None,
            tail_ratio: None,
            skewness: None,
            kurtosis: None,
            ulcer_index: None,
            gain_to_loss_ratio: None,
            win_rate: None,
            daily_returns: None,
        };

        {
            let mut cache = svc.quant_cache.write().await;
            cache.insert(
                "AAPL".to_string(),
                (dummy_metrics, std::time::Instant::now()),
            );
        }

        let stats = svc.get_cache_stats().await;
        assert_eq!(stats.memory_prices, 0, "memory_prices should be 0");
        assert_eq!(
            stats.memory_quant, 1,
            "memory_quant should equal number of inserted entries"
        );
    }

    // ---- Test 4: clear_all_caches empties the memory caches ----

    #[tokio::test]
    async fn test_clear_all_caches_empties_price_cache() {
        let svc = EnhancedMarketDataService::new_without_db();

        // Populate the price cache
        {
            let mut cache = svc.price_cache.write().await;
            cache.insert("AAPL".to_string(), (150.0, std::time::Instant::now()));
            cache.insert("GOOG".to_string(), (180.0, std::time::Instant::now()));
        }

        // Verify it's populated
        let stats_before = svc.get_cache_stats().await;
        assert_eq!(
            stats_before.memory_prices, 2,
            "pre-condition: price cache should have 2 entries"
        );

        // Clear caches
        svc.clear_all_caches().await;

        // Verify it's now empty
        let stats_after = svc.get_cache_stats().await;
        assert_eq!(
            stats_after.memory_prices, 0,
            "price cache should be empty after clear_all_caches"
        );
    }

    #[tokio::test]
    async fn test_clear_all_caches_empties_quant_cache() {
        let svc = EnhancedMarketDataService::new_without_db();

        let dummy_metrics = crate::modules::quant_analysis::QuantMetrics {
            symbol: "TSLA".to_string(),
            sharpe_ratio: 0.9,
            annualized_return: 0.40,
            volatility: 0.55,
            max_drawdown: -0.30,
            rsi: 62.0,
            signal: "HOLD".to_string(),
            confidence: 0.6,
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            omega_ratio: None,
            tail_ratio: None,
            skewness: None,
            kurtosis: None,
            ulcer_index: None,
            gain_to_loss_ratio: None,
            win_rate: None,
            daily_returns: None,
        };

        {
            let mut cache = svc.quant_cache.write().await;
            cache.insert(
                "TSLA".to_string(),
                (dummy_metrics, std::time::Instant::now()),
            );
        }

        let stats_before = svc.get_cache_stats().await;
        assert_eq!(
            stats_before.memory_quant, 1,
            "pre-condition: quant cache should have 1 entry"
        );

        svc.clear_all_caches().await;

        let stats_after = svc.get_cache_stats().await;
        assert_eq!(
            stats_after.memory_quant, 0,
            "quant cache should be empty after clear_all_caches"
        );
    }

    // ---- Test 5: get_batch_prices with empty input returns empty HashMap ----

    #[tokio::test]
    async fn test_get_batch_prices_empty_input_returns_empty_map() {
        let svc = EnhancedMarketDataService::new_without_db();
        let result = svc.get_batch_prices(vec![]).await;
        assert!(
            result.is_empty(),
            "get_batch_prices with empty input should return an empty HashMap"
        );
    }

    // ---- Test 6: Memory cache TTL - expired vs fresh entries ----

    #[tokio::test]
    async fn test_cache_ttl_fresh_entry_is_a_hit() {
        let svc = EnhancedMarketDataService::new_without_db();

        // Insert a fresh entry (timestamp = now)
        {
            let mut cache = svc.price_cache.write().await;
            cache.insert("AAPL".to_string(), (150.0, std::time::Instant::now()));
        }

        // Read the cache and verify the fresh entry is within TTL
        let cache = svc.price_cache.read().await;
        let entry = cache.get("AAPL").expect("AAPL should be in price cache");
        let elapsed = entry.1.elapsed();
        assert!(
            elapsed < svc.price_cache_ttl,
            "fresh entry elapsed ({:?}) should be less than TTL ({:?})",
            elapsed,
            svc.price_cache_ttl
        );
        assert_eq!(entry.0, 150.0, "price should be 150.0");
    }

    #[tokio::test]
    async fn test_cache_ttl_expired_entry_is_a_miss() {
        let svc = EnhancedMarketDataService::new_without_db();

        // Insert an expired entry by using a timestamp far in the past (beyond TTL)
        let expired_timestamp =
            std::time::Instant::now() - svc.price_cache_ttl - std::time::Duration::from_secs(1);

        {
            let mut cache = svc.price_cache.write().await;
            cache.insert("STALE".to_string(), (99.0, expired_timestamp));
        }

        // Read the cache and verify the entry is past its TTL (would be a cache miss)
        let cache = svc.price_cache.read().await;
        let entry = cache.get("STALE").expect("STALE should be in price cache");
        let elapsed = entry.1.elapsed();
        assert!(
            elapsed >= svc.price_cache_ttl,
            "expired entry elapsed ({:?}) should be >= TTL ({:?}), marking it as a miss",
            elapsed,
            svc.price_cache_ttl
        );
    }

    #[tokio::test]
    async fn test_cache_ttl_mixed_fresh_and_expired() {
        let svc = EnhancedMarketDataService::new_without_db();

        let expired_timestamp =
            std::time::Instant::now() - svc.price_cache_ttl - std::time::Duration::from_secs(1);

        {
            let mut cache = svc.price_cache.write().await;
            cache.insert("FRESH".to_string(), (200.0, std::time::Instant::now()));
            cache.insert("STALE".to_string(), (50.0, expired_timestamp));
        }

        let cache = svc.price_cache.read().await;

        let fresh_entry = cache.get("FRESH").expect("FRESH should be in cache");
        assert!(
            fresh_entry.1.elapsed() < svc.price_cache_ttl,
            "FRESH entry should be within TTL"
        );

        let stale_entry = cache.get("STALE").expect("STALE should be in cache");
        assert!(
            stale_entry.1.elapsed() >= svc.price_cache_ttl,
            "STALE entry should be past TTL"
        );

        // Simulate what get_current_price does: only return the entry if within TTL
        let fresh_is_hit = fresh_entry.1.elapsed() < svc.price_cache_ttl;
        let stale_is_hit = stale_entry.1.elapsed() < svc.price_cache_ttl;
        assert!(fresh_is_hit, "FRESH should be a cache hit");
        assert!(!stale_is_hit, "STALE should be a cache miss");
    }
}
