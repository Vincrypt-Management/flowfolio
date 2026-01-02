// Industrial-Grade Circuit Breaker Pattern
// Prevents cascading failures when external services are down

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
                        eprintln!("🔌 Circuit {} transitioning to HALF-OPEN", self.name);
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
                    eprintln!("[DEBUG] [circuit_breaker] Circuit {} CLOSED after recovery", self.name);
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
                    eprintln!("⚡ Circuit {} OPENED after {} failures", self.name, failures);
                }
            }
            CircuitState::HalfOpen => {
                // Any failure in half-open state reopens the circuit
                *state = CircuitState::Open;
                *self.opened_at.write() = Some(Instant::now());
                self.success_count.store(0, Ordering::SeqCst);
                eprintln!("⚡ Circuit {} reopened from half-open", self.name);
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
        eprintln!("🔄 Circuit {} manually reset", self.name);
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
}
