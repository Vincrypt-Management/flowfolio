// Enhanced Market Data Service - Industrial Grade
// Integrates multi-source provider with SQLite database caching
// Features: Circuit breaker, retry logic, health monitoring, structured errors

use crate::modules::data_provider::{MultiSourceProvider, HistoricalPrice};
use crate::modules::quant_analysis::{QuantAnalyzer, QuantMetrics, HistoricalPrice as QuantHistoricalPrice};
use crate::modules::circuit_breaker::{CircuitBreakerManager, CircuitBreakerConfig};
use crate::modules::retry::{RetryExecutor, RetryConfig};
use crate::modules::health::HEALTH_MONITOR;
use crate::services::db_cache::DatabaseCacheService;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use sqlx::{Pool, Sqlite};
use serde::{Serialize, Deserialize};

/// Enhanced market data service with database caching and multi-source provider
/// Industrial-grade features: circuit breaker, retry logic, health monitoring
pub struct EnhancedMarketDataService {
    provider: Arc<MultiSourceProvider>,
    db_cache: Option<Arc<DatabaseCacheService>>,
    // Industrial-grade components
    circuit_breaker: Arc<CircuitBreakerManager>,
    retry_executor: Arc<RetryExecutor>,
    // In-memory cache for quick access
    price_cache: Arc<RwLock<HashMap<String, (f64, std::time::Instant)>>>,
    quant_cache: Arc<RwLock<HashMap<String, (QuantMetrics, std::time::Instant)>>>,
    // Cache TTL settings (optimized for free tier APIs)
    price_cache_ttl: std::time::Duration,
    quant_cache_ttl: std::time::Duration,
}

impl EnhancedMarketDataService {
    /// Create new service with database pool
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
            db_cache,
            circuit_breaker: Arc::new(CircuitBreakerManager::with_config(cb_config)),
            retry_executor: Arc::new(RetryExecutor::new(RetryConfig::network())),
            price_cache: Arc::new(RwLock::new(HashMap::new())),
            quant_cache: Arc::new(RwLock::new(HashMap::new())),
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
            db_cache: None,
            circuit_breaker: Arc::new(CircuitBreakerManager::with_config(cb_config)),
            retry_executor: Arc::new(RetryExecutor::new(RetryConfig::network())),
            price_cache: Arc::new(RwLock::new(HashMap::new())),
            quant_cache: Arc::new(RwLock::new(HashMap::new())),
            price_cache_ttl: std::time::Duration::from_secs(120),
            quant_cache_ttl: std::time::Duration::from_secs(7200),
        }
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
                    eprintln!("[DEBUG] [enhanced_market] Memory cache hit for {}: ${:.2}", symbol, price);
                    return Ok(*price);
                }
            }
        }
        HEALTH_MONITOR.record_cache_miss();

        // 2. Check database cache
        if let Some(ref db_cache) = self.db_cache {
            if let Some(cached) = db_cache.get_cached_price(&symbol).await {
                // Update memory cache
                let mut cache = self.price_cache.write().await;
                cache.insert(symbol.clone(), (cached.current_price, std::time::Instant::now()));
                eprintln!("[DEBUG] [enhanced_market] Database cache hit for {}: ${:.2}", symbol, cached.current_price);
                return Ok(cached.current_price);
            }
        }

        // 3. Fetch from multi-source provider with circuit breaker
        eprintln!("[DEBUG] [enhanced_market] Fetching {} from providers (with circuit breaker)...", symbol);
        
        let provider = self.provider.clone();
        let symbol_clone = symbol.clone();
        
        // Use circuit breaker to protect against cascading failures
        let result = self.circuit_breaker
            .execute("market_data", async move {
                provider.get_market_data(&symbol_clone).await
            })
            .await;
        
        let data = match result {
            Ok(data) => {
                HEALTH_MONITOR.record_provider_request("market_data", true, start.elapsed().as_micros() as u64);
                data
            }
            Err(e) => {
                HEALTH_MONITOR.record_provider_request("market_data", false, start.elapsed().as_micros() as u64);
                return Err(format!("Provider error: {}", e));
            }
        };
        
        if let Some(quote) = data.quote {
            let price = quote.price;
            
            // Update memory cache
            {
                let mut cache = self.price_cache.write().await;
                cache.insert(symbol.clone(), (price, std::time::Instant::now()));
            }

            // Update database cache
            if let Some(ref db_cache) = self.db_cache {
                let _ = db_cache.set_cached_price(&symbol, price).await;
            }

            HEALTH_MONITOR.record_request_success(start.elapsed().as_micros() as u64);
            eprintln!("[DEBUG] [enhanced_market] Fetched {} from {}: ${:.2}", symbol, data.source, price);
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

        eprintln!("[DEBUG] [enhanced_market] Prices: {}/{} from memory cache", results.len(), symbols.len());

        // 2. Check database cache for remaining symbols
        if let Some(ref db_cache) = self.db_cache {
            let mut still_needed = Vec::new();
            for symbol in &symbols_to_fetch {
                if let Some(cached) = db_cache.get_cached_price(symbol).await {
                    results.insert(symbol.clone(), cached.current_price);
                    // Update memory cache
                    let mut cache = self.price_cache.write().await;
                    cache.insert(symbol.clone(), (cached.current_price, std::time::Instant::now()));
                } else {
                    still_needed.push(symbol.clone());
                }
            }
            symbols_to_fetch = still_needed;
        }

        eprintln!("[DEBUG] [enhanced_market] Prices: {} still need fetching from providers", symbols_to_fetch.len());

        // 3. Fetch remaining from providers
        if !symbols_to_fetch.is_empty() {
            let batch_data = self.provider.get_batch_market_data(symbols_to_fetch).await;
            
            for (symbol, data) in batch_data {
                if let Some(quote) = data.quote {
                    let price = quote.price;
                    results.insert(symbol.clone(), price);
                    
                    // Update memory cache
                    {
                        let mut cache = self.price_cache.write().await;
                        cache.insert(symbol.clone(), (price, std::time::Instant::now()));
                    }

                    // Update database cache
                    if let Some(ref db_cache) = self.db_cache {
                        let _ = db_cache.set_cached_price(&symbol, price).await;
                    }
                }
            }
        }

        eprintln!("[DEBUG] [enhanced_market] Batch prices complete: {}/{} symbols", results.len(), symbols.len());
        results
    }

    // ================== HISTORICAL DATA ==================

    /// Get historical prices for a symbol
    pub async fn get_historical_prices(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let symbol = symbol.to_uppercase();

        // 1. Check database cache for historical data
        if let Some(ref db_cache) = self.db_cache {
            if let Some(cached) = db_cache.get_cached_historical_prices(&symbol).await {
                let historical: Vec<HistoricalPrice> = cached.into_iter()
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
                    eprintln!("[DEBUG] [enhanced_market] Historical cache hit for {}: {} days", symbol, historical.len());
                    return Ok(historical);
                }
            }
        }

        // 2. Fetch from provider
        eprintln!("[DEBUG] [enhanced_market] Fetching historical data for {} from providers...", symbol);
        let data = self.provider.get_market_data(&symbol).await?;
        
        if data.historical.is_empty() {
            return Err(format!("No historical data available for {}", symbol));
        }

        // 3. Save to database cache
        if let Some(ref db_cache) = self.db_cache {
            let cache_data: Vec<(String, f64, f64, f64, f64, i64)> = data.historical.iter()
                .map(|h| (h.date.clone(), h.open, h.high, h.low, h.close, h.volume))
                .collect();
            let _ = db_cache.set_cached_historical_prices(&symbol, &cache_data).await;
        }

        eprintln!("[DEBUG] [enhanced_market] Fetched {} days of historical data for {} from {}", 
                  data.historical.len(), symbol, data.source);
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
                    eprintln!("[DEBUG] [enhanced_market] Quant cache hit for {}", symbol);
                    return Ok(metrics.clone());
                }
            }
        }

        // 2. Check database cache
        if let Some(ref db_cache) = self.db_cache {
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
        let quant_prices: Vec<QuantHistoricalPrice> = historical.iter()
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
        if let Some(ref db_cache) = self.db_cache {
            let _ = db_cache.set_cached_quant_metrics(
                &symbol,
                metrics.sharpe_ratio,
                metrics.annualized_return,
                metrics.volatility,
                metrics.max_drawdown,
                metrics.rsi,
                &metrics.signal,
                metrics.confidence,
            ).await;
        }

        Ok(metrics)
    }

    /// Batch get quantitative metrics for multiple symbols
    pub async fn get_batch_quant_metrics(&self, symbols: Vec<String>) -> Vec<QuantMetrics> {
        use futures::stream::{self, StreamExt};
        
        eprintln!("[DEBUG] [enhanced_market] Getting quant metrics for {} symbols...", symbols.len());
        
        // Process symbols in parallel for faster response
        let results: Vec<QuantMetrics> = stream::iter(symbols.clone())
            .map(|symbol| async move {
                // Try up to 2 times for each symbol
                for attempt in 1..=2 {
                    match self.get_quant_metrics(&symbol).await {
                        Ok(metrics) => {
                            eprintln!("[DEBUG] [enhanced_market] Got metrics for {}", symbol);
                            return metrics;
                        },
                        Err(e) => {
                            if attempt == 1 {
                                eprintln!("[WARN] [enhanced_market] Retry {}: Failed to get metrics for {}: {}", attempt, symbol, e);
                                // Small delay before retry
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            } else {
                                eprintln!("[ERROR] [enhanced_market] Failed to get quant metrics for {} after {} attempts: {}", symbol, attempt, e);
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
                }
            })
            .buffer_unordered(5) // Process 5 symbols concurrently
            .collect()
            .await;
        
        let successful = results.iter().filter(|m| m.signal != "INSUFFICIENT DATA").count();
        eprintln!("[DEBUG] [enhanced_market] Batch quant metrics complete: {}/{} successful", successful, symbols.len());
        
        results
    }

    // ================== FULL MARKET DATA ==================

    /// Get complete market data (quote + historical + metrics)
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
        if let Some(ref db_cache) = self.db_cache {
            let _ = db_cache.clear_expired_cache().await;
        }

        eprintln!("🗑️ All caches cleared");
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

        let db_stats = if let Some(ref db_cache) = self.db_cache {
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
        eprintln!("[INFO] [enhanced_market] Prefetching {} symbols...", symbols.len());
        
        // Fetch all data in background
        let _ = self.get_batch_prices(symbols.clone()).await;
        
        eprintln!("[DEBUG] [enhanced_market] Prefetch complete for {} symbols", symbols.len());
    }
}

// ================== RESPONSE TYPES ==================

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
