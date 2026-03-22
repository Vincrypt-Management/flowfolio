// Industrial-Grade Circuit Breaker Pattern
// Prevents cascading failures when external services are down

#![allow(dead_code)]

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::RwLock;
use dashmap::DashMap;

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CircuitState {
    /// Circuit is closed (normal operation)
    Closed,
    /// Circuit is open (failing fast)
    Open,
    /// Circuit is half-open (testing recovery)
    HalfOpen,
}

/// Configuration for circuit breaker behavior
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit
    pub failure_threshold: u32,
    /// Duration to keep circuit open before testing
    pub open_duration: Duration,
    /// Number of successes needed to close circuit from half-open
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

/// Individual circuit breaker for a service/provider
pub struct CircuitBreaker {
    name: String,
    config: CircuitBreakerConfig,
    state: RwLock<CircuitState>,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    last_failure_time: RwLock<Option<Instant>>,
    opened_at: RwLock<Option<Instant>>,
    total_requests: AtomicU64,
    total_failures: AtomicU64,
}

impl CircuitBreaker {
    pub fn new(name: &str, config: CircuitBreakerConfig) -> Self {
        Self {
            name: name.to_string(),
            config,
            state: RwLock::new(CircuitState::Closed),
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            last_failure_time: RwLock::new(None),
            opened_at: RwLock::new(None),
            total_requests: AtomicU64::new(0),
            total_failures: AtomicU64::new(0),
        }
    }

    /// Check if request should be allowed
    pub fn can_execute(&self) -> bool {
        let state = *self.state.read();
        
        match state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if we should transition to half-open
                if let Some(opened_at) = *self.opened_at.read() {
                    if opened_at.elapsed() >= self.config.open_duration {
                        *self.state.write() = CircuitState::HalfOpen;
                        self.success_count.store(0, Ordering::SeqCst);
                        tracing::debug!(circuit = %self.name, "Circuit transitioning to HALF-OPEN");
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful request
    pub fn record_success(&self) {
        self.total_requests.fetch_add(1, Ordering::SeqCst);
        
        let mut state = self.state.write();
        
        match *state {
            CircuitState::Closed => {
                // Reset failure count on success
                self.failure_count.store(0, Ordering::SeqCst);
            }
            CircuitState::HalfOpen => {
                let successes = self.success_count.fetch_add(1, Ordering::SeqCst) + 1;
                if successes >= self.config.success_threshold {
                    *state = CircuitState::Closed;
                    self.failure_count.store(0, Ordering::SeqCst);
                    tracing::debug!(circuit = %self.name, "Circuit CLOSED after recovery");
                }
            }
            CircuitState::Open => {
                // Shouldn't happen, but handle gracefully
            }
        }
    }

    /// Record a failed request
    pub fn record_failure(&self) {
        self.total_requests.fetch_add(1, Ordering::SeqCst);
        self.total_failures.fetch_add(1, Ordering::SeqCst);
        
        let mut state = self.state.write();
        *self.last_failure_time.write() = Some(Instant::now());
        
        match *state {
            CircuitState::Closed => {
                let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
                if failures >= self.config.failure_threshold {
                    *state = CircuitState::Open;
                    *self.opened_at.write() = Some(Instant::now());
                    tracing::warn!(circuit = %self.name, failures = failures, "Circuit OPENED after failures");
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open state reopens the circuit
                *state = CircuitState::Open;
                *self.opened_at.write() = Some(Instant::now());
                self.success_count.store(0, Ordering::SeqCst);
                tracing::warn!(circuit = %self.name, "Circuit reopened from half-open");
            }
            CircuitState::Open => {
                // Already open, just update timestamp
                *self.opened_at.write() = Some(Instant::now());
            }
        }
    }

    /// Get current state
    pub fn state(&self) -> CircuitState {
        *self.state.read()
    }

    /// Get circuit statistics
    pub fn stats(&self) -> CircuitStats {
        CircuitStats {
            name: self.name.clone(),
            state: *self.state.read(),
            total_requests: self.total_requests.load(Ordering::SeqCst),
            total_failures: self.total_failures.load(Ordering::SeqCst),
            current_failure_count: self.failure_count.load(Ordering::SeqCst),
        }
    }

    /// Manually reset the circuit breaker
    pub fn reset(&self) {
        *self.state.write() = CircuitState::Closed;
        self.failure_count.store(0, Ordering::SeqCst);
        self.success_count.store(0, Ordering::SeqCst);
        *self.opened_at.write() = None;
        tracing::info!(circuit = %self.name, "Circuit manually reset");
    }
}

/// Statistics for a circuit breaker
#[derive(Debug, Clone)]
pub struct CircuitStats {
    pub name: String,
    pub state: CircuitState,
    pub total_requests: u64,
    pub total_failures: u64,
    pub current_failure_count: u32,
}

impl CircuitStats {
    pub fn success_rate(&self) -> f64 {
        if self.total_requests == 0 {
            return 1.0;
        }
        1.0 - (self.total_failures as f64 / self.total_requests as f64)
    }
}

/// Manager for multiple circuit breakers
pub struct CircuitBreakerManager {
    breakers: DashMap<String, Arc<CircuitBreaker>>,
    default_config: CircuitBreakerConfig,
}

impl CircuitBreakerManager {
    pub fn new() -> Self {
        Self {
            breakers: DashMap::new(),
            default_config: CircuitBreakerConfig::default(),
        }
    }

    pub fn with_config(config: CircuitBreakerConfig) -> Self {
        Self {
            breakers: DashMap::new(),
            default_config: config,
        }
    }

    /// Get or create a circuit breaker for a service
    pub fn get_or_create(&self, name: &str) -> Arc<CircuitBreaker> {
        self.breakers
            .entry(name.to_string())
            .or_insert_with(|| Arc::new(CircuitBreaker::new(name, self.default_config.clone())))
            .value()
            .clone()
    }

    /// Execute a function with circuit breaker protection
    pub async fn execute<F, T, E>(&self, name: &str, f: F) -> Result<T, CircuitBreakerError<E>>
    where
        F: std::future::Future<Output = Result<T, E>>,
    {
        let breaker = self.get_or_create(name);
        
        if !breaker.can_execute() {
            return Err(CircuitBreakerError::Open {
                name: name.to_string(),
            });
        }

        match f.await {
            Ok(result) => {
                breaker.record_success();
                Ok(result)
            }
            Err(err) => {
                breaker.record_failure();
                Err(CircuitBreakerError::ServiceError(err))
            }
        }
    }

    /// Get all circuit breaker statistics
    pub fn all_stats(&self) -> Vec<CircuitStats> {
        self.breakers
            .iter()
            .map(|entry| entry.value().stats())
            .collect()
    }

    /// Reset all circuit breakers
    pub fn reset_all(&self) {
        for entry in self.breakers.iter() {
            entry.value().reset();
        }
    }
}

impl Default for CircuitBreakerManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Error type for circuit breaker operations
#[derive(Debug)]
pub enum CircuitBreakerError<E> {
    /// Circuit is open, request rejected
    Open { name: String },
    /// Service returned an error
    ServiceError(E),
}

impl<E: std::fmt::Display> std::fmt::Display for CircuitBreakerError<E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitBreakerError::Open { name } => {
                write!(f, "Circuit breaker '{}' is open", name)
            }
            CircuitBreakerError::ServiceError(e) => {
                write!(f, "Service error: {}", e)
            }
        }
    }
}

impl<E: std::error::Error + 'static> std::error::Error for CircuitBreakerError<E> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CircuitBreakerError::Open { .. } => None,
            CircuitBreakerError::ServiceError(e) => Some(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_opens() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Record failures
        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Closed);

        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_rejects_when_open() {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_secs(60),
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        breaker.record_failure();
        assert!(!breaker.can_execute());
    }

    #[test]
    fn test_circuit_breaker_starts_closed() {
        let breaker = CircuitBreaker::new("test", CircuitBreakerConfig::default());
        assert_eq!(breaker.state(), CircuitState::Closed);
        assert!(breaker.can_execute());
    }

    #[test]
    fn test_circuit_breaker_default_config() {
        let config = CircuitBreakerConfig::default();
        assert_eq!(config.failure_threshold, 5);
        assert_eq!(config.success_threshold, 3);
        assert_eq!(config.open_duration, Duration::from_secs(30));
        assert_eq!(config.failure_window, Duration::from_secs(60));
    }

    #[test]
    fn test_circuit_breaker_success_resets_failure_count() {
        let config = CircuitBreakerConfig {
            failure_threshold: 5,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Record 3 failures
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();

        // A success in Closed state resets the failure count
        breaker.record_success();
        assert_eq!(breaker.state(), CircuitState::Closed);

        // Now need full 5 failures again to open
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Closed);

        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_half_open_failure_reopens() {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_millis(1), // Very short so it transitions quickly
            success_threshold: 3,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Open the circuit
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);

        // Wait for open duration then allow attempt
        std::thread::sleep(Duration::from_millis(10));
        assert!(breaker.can_execute()); // Should transition to HalfOpen
        assert_eq!(breaker.state(), CircuitState::HalfOpen);

        // Failure in HalfOpen reopens
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_half_open_success_closes_after_threshold() {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_millis(1),
            success_threshold: 2,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Open the circuit
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);

        // Wait for open duration
        std::thread::sleep(Duration::from_millis(10));
        breaker.can_execute(); // Transitions to HalfOpen
        assert_eq!(breaker.state(), CircuitState::HalfOpen);

        // First success keeps it in HalfOpen
        breaker.record_success();
        assert_eq!(breaker.state(), CircuitState::HalfOpen);

        // Second success closes it (success_threshold = 2)
        breaker.record_success();
        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_stats() {
        let config = CircuitBreakerConfig {
            failure_threshold: 5,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("mybreaker", config);

        breaker.record_success();
        breaker.record_success();
        breaker.record_failure();

        let stats = breaker.stats();
        assert_eq!(stats.name, "mybreaker");
        assert_eq!(stats.total_requests, 3);
        assert_eq!(stats.total_failures, 1);
        assert_eq!(stats.current_failure_count, 1);
        assert_eq!(stats.state, CircuitState::Closed);
    }

    #[test]
    fn test_circuit_stats_success_rate_no_requests() {
        let stats = CircuitStats {
            name: "empty".to_string(),
            state: CircuitState::Closed,
            total_requests: 0,
            total_failures: 0,
            current_failure_count: 0,
        };
        assert_eq!(stats.success_rate(), 1.0);
    }

    #[test]
    fn test_circuit_stats_success_rate_with_requests() {
        let stats = CircuitStats {
            name: "test".to_string(),
            state: CircuitState::Closed,
            total_requests: 10,
            total_failures: 3,
            current_failure_count: 0,
        };
        // 7/10 success = 0.7
        assert!((stats.success_rate() - 0.7).abs() < 1e-10);
    }

    #[test]
    fn test_circuit_stats_success_rate_all_fail() {
        let stats = CircuitStats {
            name: "test".to_string(),
            state: CircuitState::Open,
            total_requests: 5,
            total_failures: 5,
            current_failure_count: 5,
        };
        assert_eq!(stats.success_rate(), 0.0);
    }

    #[test]
    fn test_circuit_breaker_reset() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);

        breaker.reset();
        assert_eq!(breaker.state(), CircuitState::Closed);
        assert!(breaker.can_execute());

        let stats = breaker.stats();
        assert_eq!(stats.current_failure_count, 0);
    }

    #[test]
    fn test_circuit_breaker_manager_get_or_create() {
        let manager = CircuitBreakerManager::new();

        let b1 = manager.get_or_create("svc_a");
        let b2 = manager.get_or_create("svc_a");
        // Same service returns the same Arc instance
        assert!(Arc::ptr_eq(&b1, &b2));

        let b3 = manager.get_or_create("svc_b");
        assert!(!Arc::ptr_eq(&b1, &b3));
    }

    #[test]
    fn test_circuit_breaker_manager_all_stats() {
        let manager = CircuitBreakerManager::new();
        manager.get_or_create("alpha");
        manager.get_or_create("beta");

        let stats = manager.all_stats();
        assert_eq!(stats.len(), 2);
    }

    #[test]
    fn test_circuit_breaker_manager_reset_all() {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            ..Default::default()
        };
        let manager = CircuitBreakerManager::with_config(config);

        let b = manager.get_or_create("svc");
        b.record_failure();
        assert_eq!(b.state(), CircuitState::Open);

        manager.reset_all();
        assert_eq!(b.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_error_display_open() {
        let err: CircuitBreakerError<String> = CircuitBreakerError::Open {
            name: "svc".to_string(),
        };
        let msg = format!("{}", err);
        assert!(msg.contains("svc"));
        assert!(msg.contains("open"));
    }

    #[test]
    fn test_circuit_breaker_error_display_service_error() {
        let err: CircuitBreakerError<String> = CircuitBreakerError::ServiceError("timeout".to_string());
        let msg = format!("{}", err);
        assert!(msg.contains("timeout"));
    }

    #[test]
    fn test_circuit_breaker_can_execute_while_open_before_timeout() {
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_secs(3600), // 1 hour - won't expire
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
        assert!(!breaker.can_execute());
        // State should remain Open since timeout hasn't passed
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_state_equality() {
        assert_eq!(CircuitState::Closed, CircuitState::Closed);
        assert_eq!(CircuitState::Open, CircuitState::Open);
        assert_eq!(CircuitState::HalfOpen, CircuitState::HalfOpen);
        assert_ne!(CircuitState::Closed, CircuitState::Open);
        assert_ne!(CircuitState::Open, CircuitState::HalfOpen);
    }

    #[test]
    fn test_circuit_breaker_manager_default() {
        // Covers Default impl (lines 268-269)
        let manager = CircuitBreakerManager::default();
        let b = manager.get_or_create("svc");
        assert_eq!(b.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn test_circuit_breaker_manager_execute_success() {
        // Covers manager execute() success path (lines 239-242)
        let manager = CircuitBreakerManager::new();
        let result = manager.execute("svc", async { Ok::<i32, &str>(42) }).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_circuit_breaker_manager_execute_service_error() {
        // Covers manager execute() error path (lines 244-246)
        let manager = CircuitBreakerManager::new();
        let result = manager.execute("svc", async { Err::<i32, &str>("fail") }).await;
        assert!(result.is_err());
        match result {
            Err(CircuitBreakerError::ServiceError(e)) => assert_eq!(e, "fail"),
            _ => panic!("Expected ServiceError"),
        }
    }

    #[tokio::test]
    async fn test_circuit_breaker_manager_execute_open_rejects() {
        // Covers manager execute() when circuit is open (lines 233-237)
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_secs(3600),
            ..Default::default()
        };
        let manager = CircuitBreakerManager::with_config(config);
        // Open the circuit
        let _ = manager.execute("svc", async { Err::<i32, &str>("fail") }).await;
        // Now it should be rejected
        let result = manager.execute("svc", async { Ok::<i32, &str>(1) }).await;
        assert!(result.is_err());
        match result {
            Err(CircuitBreakerError::Open { name }) => assert_eq!(name, "svc"),
            _ => panic!("Expected Open error"),
        }
    }

    #[test]
    fn test_circuit_breaker_record_success_in_open_state() {
        // Covers record_success() in Open state (lines 114-116 - graceful handling)
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_secs(3600),
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);
        breaker.record_failure(); // opens circuit
        assert_eq!(breaker.state(), CircuitState::Open);
        // Calling record_success while Open - shouldn't panic
        breaker.record_success();
        // State remains Open (no transition)
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_record_failure_while_open() {
        // Covers record_failure() in Open state (lines 144-147)
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_secs(3600),
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);
        breaker.record_failure(); // opens circuit
        assert_eq!(breaker.state(), CircuitState::Open);
        // Record another failure while Open - should update timestamp but stay Open
        breaker.record_failure();
        assert_eq!(breaker.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_can_execute_half_open() {
        // Covers can_execute() HalfOpen branch (line 91)
        let config = CircuitBreakerConfig {
            failure_threshold: 1,
            open_duration: Duration::from_millis(1),
            success_threshold: 10,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);
        breaker.record_failure();
        std::thread::sleep(Duration::from_millis(10));
        // First can_execute transitions Open -> HalfOpen
        assert!(breaker.can_execute());
        assert_eq!(breaker.state(), CircuitState::HalfOpen);
        // Second can_execute with HalfOpen state (line 91)
        assert!(breaker.can_execute());
    }

    #[test]
    fn test_circuit_breaker_error_source_open() {
        // Covers std::error::Error source() for Open variant (line 298 - returns None)
        use std::error::Error;
        let err: CircuitBreakerError<std::io::Error> = CircuitBreakerError::Open { name: "x".to_string() };
        assert!(err.source().is_none());
    }

    #[test]
    fn test_circuit_breaker_error_source_service_error() {
        // Covers std::error::Error source() for ServiceError variant (line 299 - returns Some)
        use std::error::Error;
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "test error");
        let err: CircuitBreakerError<std::io::Error> = CircuitBreakerError::ServiceError(io_err);
        assert!(err.source().is_some());
    }
}
