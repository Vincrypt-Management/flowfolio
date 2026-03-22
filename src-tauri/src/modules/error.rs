// Industrial-Grade Error Handling Module
// Provides structured error types with context for debugging and monitoring

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

/// Application-wide error types with proper categorization
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum AppError {
    #[error("Data provider error: {message}")]
    DataProvider {
        message: String,
        provider: String,
        recoverable: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        retry_after_ms: Option<u64>,
    },

    #[error("Rate limit exceeded: {message}")]
    RateLimitExceeded {
        message: String,
        provider: String,
        retry_after_ms: u64,
    },

    #[error("Cache error: {message}")]
    Cache {
        message: String,
        cache_type: CacheType,
    },

    #[error("Database error: {message}")]
    Database {
        message: String,
        operation: String,
    },

    #[error("Network error: {message}")]
    Network {
        message: String,
        url: String,
        status_code: Option<u16>,
    },

    #[error("Parse error: {message}")]
    Parse {
        message: String,
        source_type: String,
    },

    #[error("Validation error: {message}")]
    Validation {
        message: String,
        field: String,
    },

    #[error("Configuration error: {message}")]
    Configuration {
        message: String,
        key: String,
    },

    #[error("Not found: {message}")]
    NotFound {
        message: String,
        resource_type: String,
        resource_id: String,
    },

    #[error("Internal error: {message}")]
    Internal {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        context: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheType {
    Memory,
    Database,
    Distributed,
}

impl fmt::Display for CacheType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CacheType::Memory => write!(f, "memory"),
            CacheType::Database => write!(f, "database"),
            CacheType::Distributed => write!(f, "distributed"),
        }
    }
}

impl AppError {
    /// Check if the error is recoverable
    pub fn is_recoverable(&self) -> bool {
        match self {
            AppError::DataProvider { recoverable, .. } => *recoverable,
            AppError::RateLimitExceeded { .. } => true,
            AppError::Network { status_code, .. } => {
                matches!(status_code, Some(429) | Some(500) | Some(502) | Some(503) | Some(504))
            }
            AppError::Cache { .. } => true,
            _ => false,
        }
    }

    /// Get retry delay in milliseconds if applicable
    pub fn retry_after_ms(&self) -> Option<u64> {
        match self {
            AppError::DataProvider { retry_after_ms, .. } => *retry_after_ms,
            AppError::RateLimitExceeded { retry_after_ms, .. } => Some(*retry_after_ms),
            AppError::Network { status_code, .. } => {
                if matches!(status_code, Some(429) | Some(503)) {
                    Some(5000) // Default 5 second retry
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Create a data provider error
    pub fn provider(provider: &str, message: impl Into<String>) -> Self {
        AppError::DataProvider {
            message: message.into(),
            provider: provider.to_string(),
            recoverable: true,
            retry_after_ms: Some(1000),
        }
    }

    /// Create a rate limit error
    pub fn rate_limit(provider: &str, retry_after_ms: u64) -> Self {
        AppError::RateLimitExceeded {
            message: format!("Rate limit exceeded for {}", provider),
            provider: provider.to_string(),
            retry_after_ms,
        }
    }

    /// Create a network error
    pub fn network(url: &str, message: impl Into<String>, status_code: Option<u16>) -> Self {
        AppError::Network {
            message: message.into(),
            url: url.to_string(),
            status_code,
        }
    }

    /// Create a not found error
    pub fn not_found(resource_type: &str, resource_id: &str) -> Self {
        AppError::NotFound {
            message: format!("{} '{}' not found", resource_type, resource_id),
            resource_type: resource_type.to_string(),
            resource_id: resource_id.to_string(),
        }
    }
}

/// Result type alias for convenience
pub type AppResult<T> = Result<T, AppError>;

/// Convert standard errors to AppError
impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        let url = err.url().map(|u| u.to_string()).unwrap_or_default();
        let status_code = err.status().map(|s| s.as_u16());
        
        AppError::Network {
            message: err.to_string(),
            url,
            status_code,
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Parse {
            message: err.to_string(),
            source_type: "JSON".to_string(),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal {
            message: err.to_string(),
            context: Some("IO operation".to_string()),
        }
    }
}

/// Macro for creating context-rich errors
#[macro_export]
macro_rules! app_error {
    (provider: $provider:expr, $msg:expr) => {
        $crate::modules::error::AppError::provider($provider, $msg)
    };
    (network: $url:expr, $msg:expr) => {
        $crate::modules::error::AppError::network($url, $msg, None)
    };
    (not_found: $type:expr, $id:expr) => {
        $crate::modules::error::AppError::not_found($type, $id)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_recovery() {
        let rate_limit = AppError::rate_limit("alpaca", 5000);
        assert!(rate_limit.is_recoverable());
        assert_eq!(rate_limit.retry_after_ms(), Some(5000));
    }

    #[test]
    fn test_error_serialization() {
        let err = AppError::provider("yahoo", "Connection timeout");
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("yahoo"));
    }

    // ===== is_recoverable tests =====

    #[test]
    fn test_data_provider_recoverable_true() {
        let err = AppError::DataProvider {
            message: "timeout".to_string(),
            provider: "test".to_string(),
            recoverable: true,
            retry_after_ms: None,
        };
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_data_provider_recoverable_false() {
        let err = AppError::DataProvider {
            message: "invalid key".to_string(),
            provider: "test".to_string(),
            recoverable: false,
            retry_after_ms: None,
        };
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_rate_limit_always_recoverable() {
        let err = AppError::rate_limit("alpaca", 3000);
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_429_recoverable() {
        let err = AppError::network("http://example.com", "rate limited", Some(429));
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_500_recoverable() {
        let err = AppError::network("http://example.com", "server error", Some(500));
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_502_recoverable() {
        let err = AppError::network("http://example.com", "bad gateway", Some(502));
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_503_recoverable() {
        let err = AppError::network("http://example.com", "unavailable", Some(503));
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_504_recoverable() {
        let err = AppError::network("http://example.com", "gateway timeout", Some(504));
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_network_404_not_recoverable() {
        let err = AppError::network("http://example.com", "not found", Some(404));
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_network_none_status_not_recoverable() {
        let err = AppError::network("http://example.com", "connection refused", None);
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_cache_always_recoverable() {
        let err = AppError::Cache {
            message: "cache miss".to_string(),
            cache_type: CacheType::Memory,
        };
        assert!(err.is_recoverable());
    }

    #[test]
    fn test_database_not_recoverable() {
        let err = AppError::Database {
            message: "table not found".to_string(),
            operation: "SELECT".to_string(),
        };
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_parse_not_recoverable() {
        let err = AppError::Parse {
            message: "invalid json".to_string(),
            source_type: "JSON".to_string(),
        };
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_validation_not_recoverable() {
        let err = AppError::Validation {
            message: "invalid symbol".to_string(),
            field: "symbol".to_string(),
        };
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_config_not_recoverable() {
        let err = AppError::Configuration {
            message: "missing key".to_string(),
            key: "API_KEY".to_string(),
        };
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_not_found_not_recoverable() {
        let err = AppError::not_found("Symbol", "AAPL");
        assert!(!err.is_recoverable());
    }

    #[test]
    fn test_internal_not_recoverable() {
        let err = AppError::Internal {
            message: "panic".to_string(),
            context: None,
        };
        assert!(!err.is_recoverable());
    }

    // ===== retry_after_ms tests =====

    #[test]
    fn test_retry_data_provider_with_ms() {
        let err = AppError::DataProvider {
            message: "timeout".to_string(),
            provider: "test".to_string(),
            recoverable: true,
            retry_after_ms: Some(2000),
        };
        assert_eq!(err.retry_after_ms(), Some(2000));
    }

    #[test]
    fn test_retry_data_provider_without_ms() {
        let err = AppError::DataProvider {
            message: "timeout".to_string(),
            provider: "test".to_string(),
            recoverable: true,
            retry_after_ms: None,
        };
        assert_eq!(err.retry_after_ms(), None);
    }

    #[test]
    fn test_retry_rate_limit() {
        let err = AppError::rate_limit("provider", 10000);
        assert_eq!(err.retry_after_ms(), Some(10000));
    }

    #[test]
    fn test_retry_network_429() {
        let err = AppError::network("http://example.com", "rate limited", Some(429));
        assert_eq!(err.retry_after_ms(), Some(5000));
    }

    #[test]
    fn test_retry_network_503() {
        let err = AppError::network("http://example.com", "unavailable", Some(503));
        assert_eq!(err.retry_after_ms(), Some(5000));
    }

    #[test]
    fn test_retry_network_500_no_retry() {
        let err = AppError::network("http://example.com", "server error", Some(500));
        assert_eq!(err.retry_after_ms(), None);
    }

    #[test]
    fn test_retry_database_none() {
        let err = AppError::Database {
            message: "err".to_string(),
            operation: "INSERT".to_string(),
        };
        assert_eq!(err.retry_after_ms(), None);
    }

    // ===== Factory method tests =====

    #[test]
    fn test_factory_provider() {
        let err = AppError::provider("finnhub", "connection failed");
        match err {
            AppError::DataProvider { message, provider, recoverable, retry_after_ms } => {
                assert_eq!(message, "connection failed");
                assert_eq!(provider, "finnhub");
                assert!(recoverable);
                assert_eq!(retry_after_ms, Some(1000));
            }
            _ => panic!("Expected DataProvider variant"),
        }
    }

    #[test]
    fn test_factory_rate_limit() {
        let err = AppError::rate_limit("alpaca", 5000);
        match err {
            AppError::RateLimitExceeded { message, provider, retry_after_ms } => {
                assert!(message.contains("alpaca"));
                assert_eq!(provider, "alpaca");
                assert_eq!(retry_after_ms, 5000);
            }
            _ => panic!("Expected RateLimitExceeded variant"),
        }
    }

    #[test]
    fn test_factory_network() {
        let err = AppError::network("http://api.example.com", "timeout", Some(504));
        match err {
            AppError::Network { message, url, status_code } => {
                assert_eq!(message, "timeout");
                assert_eq!(url, "http://api.example.com");
                assert_eq!(status_code, Some(504));
            }
            _ => panic!("Expected Network variant"),
        }
    }

    #[test]
    fn test_factory_not_found() {
        let err = AppError::not_found("Portfolio", "my-portfolio");
        match err {
            AppError::NotFound { message, resource_type, resource_id } => {
                assert!(message.contains("Portfolio"));
                assert!(message.contains("my-portfolio"));
                assert_eq!(resource_type, "Portfolio");
                assert_eq!(resource_id, "my-portfolio");
            }
            _ => panic!("Expected NotFound variant"),
        }
    }

    // ===== Display formatting tests =====

    #[test]
    fn test_display_data_provider() {
        let err = AppError::provider("yahoo", "Connection timeout");
        let display = format!("{}", err);
        assert!(display.contains("Data provider error"));
        assert!(display.contains("Connection timeout"));
    }

    #[test]
    fn test_display_rate_limit() {
        let err = AppError::rate_limit("alpaca", 5000);
        let display = format!("{}", err);
        assert!(display.contains("Rate limit exceeded"));
    }

    #[test]
    fn test_display_network() {
        let err = AppError::network("http://example.com", "timeout", Some(503));
        let display = format!("{}", err);
        assert!(display.contains("Network error"));
        assert!(display.contains("timeout"));
    }

    #[test]
    fn test_display_not_found() {
        let err = AppError::not_found("Symbol", "XYZ");
        let display = format!("{}", err);
        assert!(display.contains("Not found"));
    }

    #[test]
    fn test_display_cache() {
        let err = AppError::Cache {
            message: "expired".to_string(),
            cache_type: CacheType::Database,
        };
        let display = format!("{}", err);
        assert!(display.contains("Cache error"));
        assert!(display.contains("expired"));
    }

    #[test]
    fn test_display_validation() {
        let err = AppError::Validation {
            message: "invalid".to_string(),
            field: "symbol".to_string(),
        };
        let display = format!("{}", err);
        assert!(display.contains("Validation error"));
    }

    #[test]
    fn test_display_configuration() {
        let err = AppError::Configuration {
            message: "missing".to_string(),
            key: "API_KEY".to_string(),
        };
        let display = format!("{}", err);
        assert!(display.contains("Configuration error"));
    }

    #[test]
    fn test_display_internal() {
        let err = AppError::Internal {
            message: "unexpected".to_string(),
            context: Some("during init".to_string()),
        };
        let display = format!("{}", err);
        assert!(display.contains("Internal error"));
        assert!(display.contains("unexpected"));
    }

    #[test]
    fn test_display_parse() {
        let err = AppError::Parse {
            message: "malformed".to_string(),
            source_type: "JSON".to_string(),
        };
        let display = format!("{}", err);
        assert!(display.contains("Parse error"));
    }

    #[test]
    fn test_display_database() {
        let err = AppError::Database {
            message: "connection lost".to_string(),
            operation: "INSERT".to_string(),
        };
        let display = format!("{}", err);
        assert!(display.contains("Database error"));
    }

    // ===== CacheType Display tests =====

    #[test]
    fn test_cache_type_display() {
        assert_eq!(format!("{}", CacheType::Memory), "memory");
        assert_eq!(format!("{}", CacheType::Database), "database");
        assert_eq!(format!("{}", CacheType::Distributed), "distributed");
    }

    // ===== From conversions =====

    #[test]
    fn test_from_serde_json_error() {
        let json_err = serde_json::from_str::<String>("not valid json").unwrap_err();
        let app_err: AppError = json_err.into();
        match app_err {
            AppError::Parse { source_type, .. } => {
                assert_eq!(source_type, "JSON");
            }
            _ => panic!("Expected Parse variant"),
        }
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        match app_err {
            AppError::Internal { context, .. } => {
                assert_eq!(context, Some("IO operation".to_string()));
            }
            _ => panic!("Expected Internal variant"),
        }
    }
}
