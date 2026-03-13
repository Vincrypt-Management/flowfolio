// Industrial-Grade Health Check & Metrics Module
// Provides observability into application and service health

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use dashmap::DashMap;
use parking_lot::RwLock;

/// Overall application health status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Health check result for a single component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub name: String,
    pub status: HealthStatus,
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
    pub last_check: u64, // Unix timestamp
}

/// Overall system health report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    pub status: HealthStatus,
    pub timestamp: u64,
    pub version: String,
    pub uptime_seconds: u64,
    pub components: Vec<ComponentHealth>,
    pub metrics: SystemMetrics,
}

/// System-wide metrics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub avg_response_time_ms: f64,
    pub p95_response_time_ms: f64,
    pub p99_response_time_ms: f64,
}

/// Request metrics for tracking performance
#[derive(Debug)]
struct RequestMetrics {
    total: AtomicU64,
    successful: AtomicU64,
    failed: AtomicU64,
    response_times: RwLock<Vec<u64>>, // in microseconds
}

impl Default for RequestMetrics {
    fn default() -> Self {
        Self {
            total: AtomicU64::new(0),
            successful: AtomicU64::new(0),
            failed: AtomicU64::new(0),
            response_times: RwLock::new(Vec::with_capacity(1000)),
        }
    }
}

/// Provider-specific metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderMetrics {
    pub name: String,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub avg_latency_ms: f64,
    pub success_rate: f64,
    pub last_success: Option<u64>,
    pub last_failure: Option<u64>,
}

/// Health monitor service
pub struct HealthMonitor {
    start_time: Instant,
    version: String,
    request_metrics: Arc<RequestMetrics>,
    provider_metrics: Arc<DashMap<String, ProviderMetricsInner>>,
    cache_metrics: Arc<CacheMetrics>,
    health_checks: Arc<DashMap<String, Box<dyn HealthCheck + Send + Sync>>>,
}

#[derive(Debug, Default)]
struct ProviderMetricsInner {
    total: AtomicU64,
    successful: AtomicU64,
    failed: AtomicU64,
    total_latency_us: AtomicU64,
    last_success: RwLock<Option<Instant>>,
    last_failure: RwLock<Option<Instant>>,
}

#[derive(Debug, Default)]
struct CacheMetrics {
    hits: AtomicU64,
    misses: AtomicU64,
}

/// Trait for custom health checks
pub trait HealthCheck: Send + Sync {
    fn name(&self) -> &str;
    fn check(&self) -> ComponentHealth;
}

impl HealthMonitor {
    pub fn new(version: &str) -> Self {
        Self {
            start_time: Instant::now(),
            version: version.to_string(),
            request_metrics: Arc::new(RequestMetrics::default()),
            provider_metrics: Arc::new(DashMap::new()),
            cache_metrics: Arc::new(CacheMetrics::default()),
            health_checks: Arc::new(DashMap::new()),
        }
    }

    /// Record a successful request
    pub fn record_request_success(&self, duration_us: u64) {
        self.request_metrics.total.fetch_add(1, Ordering::SeqCst);
        self.request_metrics.successful.fetch_add(1, Ordering::SeqCst);
        
        let mut times = self.request_metrics.response_times.write();
        if times.len() >= 10000 {
            // Keep last 5000 entries for percentile calculation
            times.drain(0..5000);
        }
        times.push(duration_us);
    }

    /// Record a failed request
    pub fn record_request_failure(&self, duration_us: u64) {
        self.request_metrics.total.fetch_add(1, Ordering::SeqCst);
        self.request_metrics.failed.fetch_add(1, Ordering::SeqCst);
        
        let mut times = self.request_metrics.response_times.write();
        if times.len() >= 10000 {
            times.drain(0..5000);
        }
        times.push(duration_us);
    }

    /// Record provider-specific metrics
    pub fn record_provider_request(&self, provider: &str, success: bool, latency_us: u64) {
        let metrics = self.provider_metrics
            .entry(provider.to_string())
            .or_insert_with(ProviderMetricsInner::default);
        
        metrics.total.fetch_add(1, Ordering::SeqCst);
        metrics.total_latency_us.fetch_add(latency_us, Ordering::SeqCst);
        
        if success {
            metrics.successful.fetch_add(1, Ordering::SeqCst);
            *metrics.last_success.write() = Some(Instant::now());
        } else {
            metrics.failed.fetch_add(1, Ordering::SeqCst);
            *metrics.last_failure.write() = Some(Instant::now());
        }
    }

    /// Record cache hit
    pub fn record_cache_hit(&self) {
        self.cache_metrics.hits.fetch_add(1, Ordering::SeqCst);
    }

    /// Record cache miss
    pub fn record_cache_miss(&self) {
        self.cache_metrics.misses.fetch_add(1, Ordering::SeqCst);
    }

    /// Register a custom health check
    pub fn register_health_check(&self, check: Box<dyn HealthCheck + Send + Sync>) {
        self.health_checks.insert(check.name().to_string(), check);
    }

    /// Generate health report
    pub fn get_health_report(&self) -> HealthReport {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let uptime = self.start_time.elapsed().as_secs();

        // Run all health checks
        let mut components: Vec<ComponentHealth> = self.health_checks
            .iter()
            .map(|entry| entry.value().check())
            .collect();

        // Add provider health
        for entry in self.provider_metrics.iter() {
            let name = entry.key().clone();
            let metrics = entry.value();
            let total = metrics.total.load(Ordering::SeqCst);
            let successful = metrics.successful.load(Ordering::SeqCst);
            
            let success_rate = if total > 0 {
                successful as f64 / total as f64
            } else {
                1.0
            };

            let status = if success_rate >= 0.95 {
                HealthStatus::Healthy
            } else if success_rate >= 0.80 {
                HealthStatus::Degraded
            } else {
                HealthStatus::Unhealthy
            };

            components.push(ComponentHealth {
                name: format!("provider:{}", name),
                status,
                latency_ms: if total > 0 {
                    Some(metrics.total_latency_us.load(Ordering::SeqCst) / total / 1000)
                } else {
                    None
                },
                message: Some(format!("{:.1}% success rate", success_rate * 100.0)),
                last_check: timestamp,
            });
        }

        // Calculate overall status
        let overall_status = if components.iter().all(|c| c.status == HealthStatus::Healthy) {
            HealthStatus::Healthy
        } else if components.iter().any(|c| c.status == HealthStatus::Unhealthy) {
            HealthStatus::Unhealthy
        } else {
            HealthStatus::Degraded
        };

        // Calculate metrics
        let metrics = self.calculate_metrics();

        HealthReport {
            status: overall_status,
            timestamp,
            version: self.version.clone(),
            uptime_seconds: uptime,
            components,
            metrics,
        }
    }

    /// Get provider-specific metrics
    pub fn get_provider_metrics(&self) -> Vec<ProviderMetrics> {
        let now = Instant::now();
        
        self.provider_metrics.iter().map(|entry| {
            let name = entry.key().clone();
            let m = entry.value();
            let total = m.total.load(Ordering::SeqCst);
            let successful = m.successful.load(Ordering::SeqCst);
            let failed = m.failed.load(Ordering::SeqCst);
            
            ProviderMetrics {
                name,
                total_requests: total,
                successful_requests: successful,
                failed_requests: failed,
                avg_latency_ms: if total > 0 {
                    m.total_latency_us.load(Ordering::SeqCst) as f64 / total as f64 / 1000.0
                } else {
                    0.0
                },
                success_rate: if total > 0 {
                    successful as f64 / total as f64
                } else {
                    1.0
                },
                last_success: m.last_success.read().map(|t| {
                    now.duration_since(t).as_secs()
                }),
                last_failure: m.last_failure.read().map(|t| {
                    now.duration_since(t).as_secs()
                }),
            }
        }).collect()
    }

    fn calculate_metrics(&self) -> SystemMetrics {
        let times = self.request_metrics.response_times.read();
        
        let (avg, p95, p99) = if !times.is_empty() {
            let mut sorted: Vec<u64> = times.clone();
            sorted.sort_unstable();
            
            let avg = sorted.iter().sum::<u64>() as f64 / sorted.len() as f64 / 1000.0;
            let p95_idx = (sorted.len() as f64 * 0.95) as usize;
            let p99_idx = (sorted.len() as f64 * 0.99) as usize;
            
            let p95 = sorted.get(p95_idx.min(sorted.len() - 1)).copied().unwrap_or(0) as f64 / 1000.0;
            let p99 = sorted.get(p99_idx.min(sorted.len() - 1)).copied().unwrap_or(0) as f64 / 1000.0;
            
            (avg, p95, p99)
        } else {
            (0.0, 0.0, 0.0)
        };

        SystemMetrics {
            total_requests: self.request_metrics.total.load(Ordering::SeqCst),
            successful_requests: self.request_metrics.successful.load(Ordering::SeqCst),
            failed_requests: self.request_metrics.failed.load(Ordering::SeqCst),
            cache_hits: self.cache_metrics.hits.load(Ordering::SeqCst),
            cache_misses: self.cache_metrics.misses.load(Ordering::SeqCst),
            avg_response_time_ms: avg,
            p95_response_time_ms: p95,
            p99_response_time_ms: p99,
        }
    }

    /// Reset all metrics (for testing)
    pub fn reset(&self) {
        self.request_metrics.total.store(0, Ordering::SeqCst);
        self.request_metrics.successful.store(0, Ordering::SeqCst);
        self.request_metrics.failed.store(0, Ordering::SeqCst);
        self.request_metrics.response_times.write().clear();
        self.provider_metrics.clear();
        self.cache_metrics.hits.store(0, Ordering::SeqCst);
        self.cache_metrics.misses.store(0, Ordering::SeqCst);
    }
}

// Global health monitor instance
lazy_static::lazy_static! {
    pub static ref HEALTH_MONITOR: HealthMonitor = HealthMonitor::new(env!("CARGO_PKG_VERSION"));
}

/// Macro for timing operations
#[macro_export]
macro_rules! timed {
    ($monitor:expr, $expr:expr) => {{
        let start = std::time::Instant::now();
        let result = $expr;
        let duration = start.elapsed().as_micros() as u64;
        
        if result.is_ok() {
            $monitor.record_request_success(duration);
        } else {
            $monitor.record_request_failure(duration);
        }
        
        result
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_monitor_metrics() {
        let monitor = HealthMonitor::new("1.0.0");
        
        // Record some requests
        monitor.record_request_success(1000);
        monitor.record_request_success(2000);
        monitor.record_request_failure(5000);
        
        let report = monitor.get_health_report();
        assert_eq!(report.metrics.total_requests, 3);
        assert_eq!(report.metrics.successful_requests, 2);
        assert_eq!(report.metrics.failed_requests, 1);
    }

    #[test]
    fn test_provider_metrics() {
        let monitor = HealthMonitor::new("1.0.0");
        
        monitor.record_provider_request("yahoo", true, 100_000);
        monitor.record_provider_request("yahoo", true, 200_000);
        monitor.record_provider_request("alpaca", false, 5000_000);
        
        let providers = monitor.get_provider_metrics();
        assert_eq!(providers.len(), 2);
        
        let yahoo = providers.iter().find(|p| p.name == "yahoo").unwrap();
        assert_eq!(yahoo.successful_requests, 2);
        assert_eq!(yahoo.success_rate, 1.0);
    }
}
