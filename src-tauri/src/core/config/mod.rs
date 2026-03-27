// Core Configuration
// Application-wide configuration settings

use std::time::Duration;

/// Cache configuration
pub struct CacheConfig {
    /// TTL for price quotes
    pub quote_ttl: Duration,
    /// TTL for historical data
    pub historical_ttl: Duration,
    /// TTL for fundamental data
    pub fundamental_ttl: Duration,
    /// TTL for quant metrics
    pub quant_ttl: Duration,
    /// Maximum entries in quote cache
    pub quote_max_entries: u64,
    /// Maximum entries in historical cache
    pub historical_max_entries: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            quote_ttl: Duration::from_secs(120),          // 2 minutes
            historical_ttl: Duration::from_secs(7200),    // 2 hours
            fundamental_ttl: Duration::from_secs(172800), // 48 hours
            quant_ttl: Duration::from_secs(14400),        // 4 hours
            quote_max_entries: 1000,
            historical_max_entries: 500,
        }
    }
}

/// Rate limit configuration for data providers
pub struct RateLimitConfig {
    /// Finnhub requests per minute
    pub finnhub: u32,
    /// Tiingo requests per minute  
    pub tiingo: u32,
    /// Polygon requests per minute
    pub polygon: u32,
    /// Alpha Vantage requests per minute
    pub alphavantage: u32,
    /// FMP requests per minute
    pub fmp: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            finnhub: 50,     // 60/min limit, 17% buffer
            tiingo: 7,       // 500/hour ≈ 8/min, 12% buffer
            polygon: 4,      // 5/min limit, 20% buffer
            alphavantage: 4, // 5/min limit, 20% buffer
            fmp: 4,          // Conservative
        }
    }
}

/// Circuit breaker configuration
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit
    pub failure_threshold: u32,
    /// Duration to keep circuit open
    pub open_duration: Duration,
    /// Number of successes to close circuit
    pub success_threshold: u32,
    /// Time window for counting failures
    pub failure_window: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            open_duration: Duration::from_secs(30),
            success_threshold: 3,
            failure_window: Duration::from_secs(60),
        }
    }
}

/// Retry configuration
pub struct RetryConfig {
    /// Maximum retry attempts
    pub max_retries: u32,
    /// Initial delay between retries
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Backoff multiplier
    pub backoff_multiplier: f64,
    /// Whether to add jitter
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

/// Application configuration
#[derive(Default)]
pub struct AppConfig {
    pub cache: CacheConfig,
    pub rate_limits: RateLimitConfig,
    pub circuit_breaker: CircuitBreakerConfig,
    pub retry: RetryConfig,
}

impl AppConfig {
    /// Create configuration from environment variables
    pub fn from_env() -> Self {
        // Could be extended to read from env vars
        Self::default()
    }
}

// Global application configuration
use once_cell::sync::Lazy;
pub static CONFIG: Lazy<AppConfig> = Lazy::new(AppConfig::from_env);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_config_defaults() {
        let cfg = CacheConfig::default();
        assert_eq!(cfg.quote_ttl, Duration::from_secs(120));
        assert_eq!(cfg.historical_ttl, Duration::from_secs(7200));
        assert_eq!(cfg.fundamental_ttl, Duration::from_secs(172800));
        assert_eq!(cfg.quant_ttl, Duration::from_secs(14400));
        assert_eq!(cfg.quote_max_entries, 1000);
        assert_eq!(cfg.historical_max_entries, 500);
    }

    #[test]
    fn test_rate_limit_config_defaults() {
        let cfg = RateLimitConfig::default();
        assert_eq!(cfg.finnhub, 50);
        assert_eq!(cfg.tiingo, 7);
        assert_eq!(cfg.polygon, 4);
        assert_eq!(cfg.alphavantage, 4);
        assert_eq!(cfg.fmp, 4);
    }

    #[test]
    fn test_circuit_breaker_config_defaults() {
        let cfg = CircuitBreakerConfig::default();
        assert_eq!(cfg.failure_threshold, 5);
        assert_eq!(cfg.open_duration, Duration::from_secs(30));
        assert_eq!(cfg.success_threshold, 3);
        assert_eq!(cfg.failure_window, Duration::from_secs(60));
    }

    #[test]
    fn test_retry_config_defaults() {
        let cfg = RetryConfig::default();
        assert_eq!(cfg.max_retries, 3);
        assert_eq!(cfg.initial_delay, Duration::from_millis(100));
        assert_eq!(cfg.max_delay, Duration::from_secs(10));
        assert!((cfg.backoff_multiplier - 2.0).abs() < f64::EPSILON);
        assert!(cfg.jitter);
    }

    #[test]
    fn test_app_config_default() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.cache.quote_ttl, Duration::from_secs(120));
        assert_eq!(cfg.rate_limits.finnhub, 50);
        assert_eq!(cfg.circuit_breaker.failure_threshold, 5);
        assert_eq!(cfg.retry.max_retries, 3);
    }

    #[test]
    fn test_app_config_from_env() {
        let cfg = AppConfig::from_env();
        // from_env currently delegates to default
        assert_eq!(cfg.cache.quote_ttl, Duration::from_secs(120));
        assert_eq!(cfg.rate_limits.polygon, 4);
    }

    #[test]
    fn test_cache_ttl_ordering() {
        let cfg = CacheConfig::default();
        // quote < historical < quant < fundamental
        assert!(cfg.quote_ttl < cfg.historical_ttl);
        assert!(cfg.historical_ttl < cfg.quant_ttl);
        assert!(cfg.quant_ttl < cfg.fundamental_ttl);
    }
}
