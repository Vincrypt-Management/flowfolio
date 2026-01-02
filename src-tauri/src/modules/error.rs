// Industrial-Grade Error Handling Module
// Provides structured error types with context for debugging and monitoring

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
}
