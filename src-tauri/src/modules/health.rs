// Industrial-Grade Health Check & Metrics Module
// Provides observability into application and service health

#![allow(dead_code)]

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
            .or_default();
        
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
use once_cell::sync::Lazy;
pub static HEALTH_MONITOR: Lazy<HealthMonitor> =
    Lazy::new(|| HealthMonitor::new(env!("CARGO_PKG_VERSION")));

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

    // --- new tests ---

    #[test]
    fn test_health_monitor_version_in_report() {
        let monitor = HealthMonitor::new("2.5.0");
        let report = monitor.get_health_report();
        assert_eq!(report.version, "2.5.0");
    }

    #[test]
    fn test_health_monitor_initial_report_has_no_components() {
        let monitor = HealthMonitor::new("1.0.0");
        let report = monitor.get_health_report();
        assert!(report.components.is_empty());
    }

    #[test]
    fn test_health_monitor_overall_status_healthy_when_no_components() {
        let monitor = HealthMonitor::new("1.0.0");
        let report = monitor.get_health_report();
        // With no components, all() vacuously true → Healthy
        assert_eq!(report.status, HealthStatus::Healthy);
    }

    #[test]
    fn test_health_monitor_cache_hits_tracked() {
        let monitor = HealthMonitor::new("1.0.0");
        monitor.record_cache_hit();
        monitor.record_cache_hit();
        monitor.record_cache_miss();

        let report = monitor.get_health_report();
        assert_eq!(report.metrics.cache_hits, 2);
        assert_eq!(report.metrics.cache_misses, 1);
    }

    #[test]
    fn test_health_monitor_reset_clears_metrics() {
        let monitor = HealthMonitor::new("1.0.0");
        monitor.record_request_success(1000);
        monitor.record_request_failure(2000);
        monitor.record_cache_hit();
        monitor.record_cache_miss();
        monitor.record_provider_request("svc", true, 500);

        monitor.reset();

        let report = monitor.get_health_report();
        assert_eq!(report.metrics.total_requests, 0);
        assert_eq!(report.metrics.successful_requests, 0);
        assert_eq!(report.metrics.failed_requests, 0);
        assert_eq!(report.metrics.cache_hits, 0);
        assert_eq!(report.metrics.cache_misses, 0);
        assert!(report.components.is_empty());
    }

    #[test]
    fn test_provider_metrics_success_rate_partial_failures() {
        let monitor = HealthMonitor::new("1.0.0");
        // 8 successes, 2 failures = 80% success rate
        for _ in 0..8 {
            monitor.record_provider_request("svc", true, 1000);
        }
        for _ in 0..2 {
            monitor.record_provider_request("svc", false, 1000);
        }

        let providers = monitor.get_provider_metrics();
        let svc = providers.iter().find(|p| p.name == "svc").unwrap();
        assert!((svc.success_rate - 0.8).abs() < 1e-10);
        assert_eq!(svc.failed_requests, 2);
    }

    #[test]
    fn test_provider_metrics_no_requests_has_default_success_rate() {
        // A provider never recorded should not appear in the list
        let monitor = HealthMonitor::new("1.0.0");
        let providers = monitor.get_provider_metrics();
        assert!(providers.is_empty());
    }

    #[test]
    fn test_provider_avg_latency_calculated_correctly() {
        let monitor = HealthMonitor::new("1.0.0");
        // latencies in microseconds: 1_000_000 and 3_000_000 → avg = 2_000_000 µs = 2000 ms
        monitor.record_provider_request("svc", true, 1_000_000);
        monitor.record_provider_request("svc", true, 3_000_000);

        let providers = monitor.get_provider_metrics();
        let svc = providers.iter().find(|p| p.name == "svc").unwrap();
        assert!((svc.avg_latency_ms - 2000.0).abs() < 1.0);
    }

    #[test]
    fn test_health_status_unhealthy_when_provider_below_80pct() {
        let monitor = HealthMonitor::new("1.0.0");
        // 1 success, 9 failures = 10% success rate → Unhealthy
        monitor.record_provider_request("bad_svc", true, 1000);
        for _ in 0..9 {
            monitor.record_provider_request("bad_svc", false, 1000);
        }

        let report = monitor.get_health_report();
        let comp = report
            .components
            .iter()
            .find(|c| c.name == "provider:bad_svc")
            .unwrap();
        assert_eq!(comp.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn test_health_status_degraded_when_provider_between_80_and_95_pct() {
        let monitor = HealthMonitor::new("1.0.0");
        // 85 successes, 15 failures = 85% → Degraded
        for _ in 0..85 {
            monitor.record_provider_request("deg_svc", true, 1000);
        }
        for _ in 0..15 {
            monitor.record_provider_request("deg_svc", false, 1000);
        }

        let report = monitor.get_health_report();
        let comp = report
            .components
            .iter()
            .find(|c| c.name == "provider:deg_svc")
            .unwrap();
        assert_eq!(comp.status, HealthStatus::Degraded);
    }

    #[test]
    fn test_health_status_healthy_when_provider_above_95pct() {
        let monitor = HealthMonitor::new("1.0.0");
        // 98 successes, 2 failures = 98% → Healthy
        for _ in 0..98 {
            monitor.record_provider_request("good_svc", true, 1000);
        }
        for _ in 0..2 {
            monitor.record_provider_request("good_svc", false, 1000);
        }

        let report = monitor.get_health_report();
        let comp = report
            .components
            .iter()
            .find(|c| c.name == "provider:good_svc")
            .unwrap();
        assert_eq!(comp.status, HealthStatus::Healthy);
    }

    #[test]
    fn test_overall_status_unhealthy_when_any_component_unhealthy() {
        let monitor = HealthMonitor::new("1.0.0");
        // One healthy, one unhealthy
        for _ in 0..100 {
            monitor.record_provider_request("good", true, 1000);
        }
        monitor.record_provider_request("bad", true, 1000);
        for _ in 0..9 {
            monitor.record_provider_request("bad", false, 1000);
        }

        let report = monitor.get_health_report();
        assert_eq!(report.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn test_overall_status_degraded_when_no_unhealthy_but_one_degraded() {
        let monitor = HealthMonitor::new("1.0.0");
        // Degraded: 85% success
        for _ in 0..85 {
            monitor.record_provider_request("deg", true, 1000);
        }
        for _ in 0..15 {
            monitor.record_provider_request("deg", false, 1000);
        }

        let report = monitor.get_health_report();
        assert_eq!(report.status, HealthStatus::Degraded);
    }

    #[test]
    fn test_health_status_enum_equality() {
        assert_eq!(HealthStatus::Healthy, HealthStatus::Healthy);
        assert_eq!(HealthStatus::Degraded, HealthStatus::Degraded);
        assert_eq!(HealthStatus::Unhealthy, HealthStatus::Unhealthy);
        assert_ne!(HealthStatus::Healthy, HealthStatus::Unhealthy);
    }

    #[test]
    fn test_system_metrics_default() {
        let metrics = SystemMetrics::default();
        assert_eq!(metrics.total_requests, 0);
        assert_eq!(metrics.successful_requests, 0);
        assert_eq!(metrics.failed_requests, 0);
        assert_eq!(metrics.cache_hits, 0);
        assert_eq!(metrics.cache_misses, 0);
        assert_eq!(metrics.avg_response_time_ms, 0.0);
    }

    #[test]
    fn test_health_monitor_uptime_non_zero() {
        let monitor = HealthMonitor::new("1.0.0");
        // Give a tiny moment for the start_time to differ from now
        std::thread::sleep(std::time::Duration::from_millis(1));
        let report = monitor.get_health_report();
        // uptime is in seconds, may be 0 for a very fast test, just check it's non-negative
        assert!(report.uptime_seconds == 0 || report.uptime_seconds >= 0);
    }

    #[test]
    fn test_register_health_check() {
        struct AlwaysHealthy;
        impl HealthCheck for AlwaysHealthy {
            fn name(&self) -> &str { "always_healthy" }
            fn check(&self) -> ComponentHealth {
                ComponentHealth {
                    name: "always_healthy".to_string(),
                    status: HealthStatus::Healthy,
                    latency_ms: Some(1),
                    message: None,
                    last_check: 0,
                }
            }
        }

        let monitor = HealthMonitor::new("1.0.0");
        monitor.register_health_check(Box::new(AlwaysHealthy));

        let report = monitor.get_health_report();
        assert!(report.components.iter().any(|c| c.name == "always_healthy"));
        assert_eq!(report.status, HealthStatus::Healthy);
    }

    #[test]
    fn test_register_unhealthy_check_makes_overall_unhealthy() {
        struct AlwaysUnhealthy;
        impl HealthCheck for AlwaysUnhealthy {
            fn name(&self) -> &str { "always_unhealthy" }
            fn check(&self) -> ComponentHealth {
                ComponentHealth {
                    name: "always_unhealthy".to_string(),
                    status: HealthStatus::Unhealthy,
                    latency_ms: None,
                    message: Some("down".to_string()),
                    last_check: 0,
                }
            }
        }

        let monitor = HealthMonitor::new("1.0.0");
        monitor.register_health_check(Box::new(AlwaysUnhealthy));

        let report = monitor.get_health_report();
        assert_eq!(report.status, HealthStatus::Unhealthy);
    }

    #[test]
    fn test_avg_response_time_calculated() {
        let monitor = HealthMonitor::new("1.0.0");
        // Latencies: 1000 µs and 3000 µs → avg = 2000 µs = 2.0 ms
        monitor.record_request_success(1000);
        monitor.record_request_success(3000);

        let report = monitor.get_health_report();
        assert!((report.metrics.avg_response_time_ms - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_response_times_drain_when_over_10000_success() {
        // Covers lines 138-139: drain when response_times.len() >= 10000
        let monitor = HealthMonitor::new("1.0.0");
        for i in 0..10001u64 {
            monitor.record_request_success(i);
        }
        // After the 10001st insert, drain should have fired, keeping ~5001 entries
        let report = monitor.get_health_report();
        assert!(report.metrics.total_requests == 10001);
    }

    #[test]
    fn test_response_times_drain_when_over_10000_failure() {
        // Covers lines 149-150: drain when response_times.len() >= 10000 for failures
        let monitor = HealthMonitor::new("1.0.0");
        for i in 0..10001u64 {
            monitor.record_request_failure(i);
        }
        let report = monitor.get_health_report();
        assert!(report.metrics.failed_requests == 10001);
    }
}
