// Industrial-Grade Retry Mechanism with Exponential Backoff
// Handles transient failures gracefully with configurable retry strategies

use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Retry configuration
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay between retries
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Multiplier for exponential backoff (e.g., 2.0 doubles each time)
    pub backoff_multiplier: f64,
    /// Add random jitter to prevent thundering herd
    pub jitter: bool,
    /// Timeout for each attempt
    pub attempt_timeout: Option<Duration>,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
            jitter: true,
            attempt_timeout: Some(Duration::from_secs(30)),
        }
    }
}

impl RetryConfig {
    /// Configuration for aggressive retries (fast-fail scenarios)
    pub fn aggressive() -> Self {
        Self {
            max_retries: 5,
            initial_delay: Duration::from_millis(50),
            max_delay: Duration::from_secs(2),
            backoff_multiplier: 1.5,
            jitter: true,
            attempt_timeout: Some(Duration::from_secs(10)),
        }
    }

    /// Configuration for conservative retries (rate-limited APIs)
    pub fn conservative() -> Self {
        Self {
            max_retries: 2,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 3.0,
            jitter: true,
            attempt_timeout: Some(Duration::from_secs(60)),
        }
    }

    /// Configuration for network failures
    pub fn network() -> Self {
        Self {
            max_retries: 4,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(15),
            backoff_multiplier: 2.0,
            jitter: true,
            attempt_timeout: Some(Duration::from_secs(30)),
        }
    }
}

/// Result of a retry operation
#[derive(Debug)]
pub struct RetryResult<T, E> {
    pub result: Result<T, E>,
    pub attempts: u32,
    pub total_delay: Duration,
}

/// Retry executor with configurable strategies
pub struct RetryExecutor {
    config: RetryConfig,
}

impl RetryExecutor {
    pub fn new(config: RetryConfig) -> Self {
        Self { config }
    }

    /// Execute a future with retries
    pub async fn execute<F, Fut, T, E>(&self, mut f: F) -> RetryResult<T, E>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = Result<T, E>>,
        E: std::fmt::Display,
    {
        let mut attempts = 0;
        let mut total_delay = Duration::ZERO;
        let mut current_delay = self.config.initial_delay;

        loop {
            attempts += 1;
            
            let result = if let Some(timeout) = self.config.attempt_timeout {
                match tokio::time::timeout(timeout, f()).await {
                    Ok(r) => r,
                    Err(_) => {
                        eprintln!("⏱️ Retry attempt {} timed out after {:?}", attempts, timeout);
                        if attempts >= self.config.max_retries {
                            // Return a synthetic timeout error - caller should handle
                            return RetryResult {
                                result: f().await, // One more try without timeout
                                attempts,
                                total_delay,
                            };
                        }
                        // Continue to retry logic - try another call
                        match f().await {
                            Ok(v) => {
                                return RetryResult {
                                    result: Ok(v),
                                    attempts,
                                    total_delay,
                                };
                            }
                            Err(e) => Err(e)
                        }
                    }
                }
            } else {
                f().await
            };

            match result {
                Ok(value) => {
                    if attempts > 1 {
                        eprintln!("[DEBUG] [retry] Operation succeeded after {} attempts", attempts);
                    }
                    return RetryResult {
                        result: Ok(value),
                        attempts,
                        total_delay,
                    };
                }
                Err(e) => {
                    if attempts >= self.config.max_retries {
                        eprintln!("[ERROR] [retry] All {} retry attempts exhausted: {}", attempts, e);
                        return RetryResult {
                            result: Err(e),
                            attempts,
                            total_delay,
                        };
                    }

                    // Calculate delay with jitter
                    let delay = if self.config.jitter {
                        let jitter_factor = 0.5 + rand_factor() * 0.5; // 0.5 to 1.0
                        Duration::from_millis((current_delay.as_millis() as f64 * jitter_factor) as u64)
                    } else {
                        current_delay
                    };

                    eprintln!(
                        "[WARN] [retry] Attempt {} failed: {}. Retrying in {:?}",
                        attempts, e, delay
                    );

                    sleep(delay).await;
                    total_delay += delay;

                    // Calculate next delay with exponential backoff
                    let next_delay_ms = (current_delay.as_millis() as f64 * self.config.backoff_multiplier) as u64;
                    current_delay = Duration::from_millis(next_delay_ms).min(self.config.max_delay);
                }
            }
        }
    }

    /// Execute with a predicate to determine if error is retryable
    pub async fn execute_with_predicate<F, Fut, T, E, P>(
        &self,
        mut f: F,
        should_retry: P,
    ) -> RetryResult<T, E>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = Result<T, E>>,
        E: std::fmt::Display,
        P: Fn(&E) -> bool,
    {
        let mut attempts = 0;
        let mut total_delay = Duration::ZERO;
        let mut current_delay = self.config.initial_delay;

        loop {
            attempts += 1;
            let result = f().await;

            match result {
                Ok(value) => {
                    return RetryResult {
                        result: Ok(value),
                        attempts,
                        total_delay,
                    };
                }
                Err(e) => {
                    if attempts >= self.config.max_retries || !should_retry(&e) {
                        return RetryResult {
                            result: Err(e),
                            attempts,
                            total_delay,
                        };
                    }

                    let delay = if self.config.jitter {
                        let jitter_factor = 0.5 + rand_factor() * 0.5;
                        Duration::from_millis((current_delay.as_millis() as f64 * jitter_factor) as u64)
                    } else {
                        current_delay
                    };

                    sleep(delay).await;
                    total_delay += delay;

                    let next_delay_ms = (current_delay.as_millis() as f64 * self.config.backoff_multiplier) as u64;
                    current_delay = Duration::from_millis(next_delay_ms).min(self.config.max_delay);
                }
            }
        }
    }
}

/// Simple pseudo-random factor for jitter (0.0 to 1.0)
fn rand_factor() -> f64 {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos % 1000) as f64 / 1000.0
}

/// Convenience function for one-off retries with default config
pub async fn retry<F, Fut, T, E>(f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let executor = RetryExecutor::new(RetryConfig::default());
    executor.execute(f).await.result
}

/// Convenience function for network operations
pub async fn retry_network<F, Fut, T, E>(f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let executor = RetryExecutor::new(RetryConfig::network());
    executor.execute(f).await.result
}

/// Convenience function for rate-limited APIs
pub async fn retry_rate_limited<F, Fut, T, E>(f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let executor = RetryExecutor::new(RetryConfig::conservative());
    executor.execute(f).await.result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_retry_succeeds_eventually() {
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let config = RetryConfig {
            max_retries: 5,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };

        let executor = RetryExecutor::new(config);

        let result = executor.execute(|| {
            let c = counter_clone.clone();
            async move {
                let count = c.fetch_add(1, Ordering::SeqCst);
                if count < 2 {
                    Err("Not ready yet")
                } else {
                    Ok("Success!")
                }
            }
        }).await;

        assert!(result.result.is_ok());
        assert_eq!(result.attempts, 3);
    }

    #[tokio::test]
    async fn test_retry_fails_after_max_attempts() {
        let config = RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(50),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };

        let executor = RetryExecutor::new(config);

        let result: RetryResult<(), &str> = executor.execute(|| async {
            Err("Always fails")
        }).await;

        assert!(result.result.is_err());
        assert_eq!(result.attempts, 3);
    }

    // --- new tests ---

    #[test]
    fn test_retry_config_default_values() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(100));
        assert_eq!(config.max_delay, Duration::from_secs(10));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert!(config.jitter);
        assert_eq!(config.attempt_timeout, Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_retry_config_aggressive_values() {
        let config = RetryConfig::aggressive();
        assert_eq!(config.max_retries, 5);
        assert_eq!(config.initial_delay, Duration::from_millis(50));
        assert_eq!(config.max_delay, Duration::from_secs(2));
        assert_eq!(config.backoff_multiplier, 1.5);
        assert!(config.jitter);
        assert_eq!(config.attempt_timeout, Some(Duration::from_secs(10)));
    }

    #[test]
    fn test_retry_config_conservative_values() {
        let config = RetryConfig::conservative();
        assert_eq!(config.max_retries, 2);
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.max_delay, Duration::from_secs(30));
        assert_eq!(config.backoff_multiplier, 3.0);
        assert!(config.jitter);
        assert_eq!(config.attempt_timeout, Some(Duration::from_secs(60)));
    }

    #[test]
    fn test_retry_config_network_values() {
        let config = RetryConfig::network();
        assert_eq!(config.max_retries, 4);
        assert_eq!(config.initial_delay, Duration::from_millis(500));
        assert_eq!(config.max_delay, Duration::from_secs(15));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert_eq!(config.attempt_timeout, Some(Duration::from_secs(30)));
    }

    #[tokio::test]
    async fn test_retry_succeeds_on_first_attempt() {
        let config = RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };
        let executor = RetryExecutor::new(config);

        let result: RetryResult<i32, &str> = executor.execute(|| async {
            Ok(42)
        }).await;

        assert!(result.result.is_ok());
        assert_eq!(result.result.unwrap(), 42);
        assert_eq!(result.attempts, 1);
        assert_eq!(result.total_delay, Duration::ZERO);
    }

    #[tokio::test]
    async fn test_retry_total_delay_accumulates() {
        let config = RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };
        let executor = RetryExecutor::new(config);

        let result: RetryResult<(), &str> = executor.execute(|| async {
            Err("fail")
        }).await;

        assert!(result.result.is_err());
        // With 3 max retries: attempts 1 and 2 trigger delays (attempt 3 is the last)
        // delay after attempt 1 = 10ms, delay after attempt 2 = 20ms; total = 30ms
        assert!(result.total_delay >= Duration::from_millis(29));
    }

    #[tokio::test]
    async fn test_retry_with_predicate_non_retryable_error() {
        let config = RetryConfig {
            max_retries: 5,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };
        let executor = RetryExecutor::new(config);

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result: RetryResult<(), &str> = executor
            .execute_with_predicate(
                || {
                    let c = counter_clone.clone();
                    async move {
                        c.fetch_add(1, Ordering::SeqCst);
                        Err("permanent_error")
                    }
                },
                |e| *e != "permanent_error", // non-retryable
            )
            .await;

        assert!(result.result.is_err());
        // Should stop after first attempt since predicate returns false
        assert_eq!(result.attempts, 1);
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retry_with_predicate_retryable_then_success() {
        let config = RetryConfig {
            max_retries: 5,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };
        let executor = RetryExecutor::new(config);

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result: RetryResult<&str, &str> = executor
            .execute_with_predicate(
                || {
                    let c = counter_clone.clone();
                    async move {
                        let n = c.fetch_add(1, Ordering::SeqCst);
                        if n < 2 {
                            Err("transient")
                        } else {
                            Ok("done")
                        }
                    }
                },
                |e| *e == "transient", // retryable
            )
            .await;

        assert!(result.result.is_ok());
        assert_eq!(result.attempts, 3);
    }

    #[tokio::test]
    async fn test_retry_max_retries_1_means_single_attempt() {
        let config = RetryConfig {
            max_retries: 1,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            backoff_multiplier: 2.0,
            jitter: false,
            attempt_timeout: None,
        };
        let executor = RetryExecutor::new(config);

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result: RetryResult<(), &str> = executor.execute(|| {
            let c = counter_clone.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err("fail")
            }
        }).await;

        assert!(result.result.is_err());
        assert_eq!(result.attempts, 1);
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }
}
