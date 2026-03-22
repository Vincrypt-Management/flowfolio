// Live Progress Event System for FlowFolio
// Enables real-time updates during long-running operations

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

/// Progress event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ProgressEvent {
    /// Operation started
    Started {
        operation_id: String,
        operation_type: String,
        total_steps: Option<usize>,
        message: String,
    },
    
    /// Progress update during operation
    Progress {
        operation_id: String,
        current_step: usize,
        total_steps: Option<usize>,
        percentage: f64,
        message: String,
        detail: Option<ProgressDetail>,
    },
    
    /// Retry attempt
    Retry {
        operation_id: String,
        attempt: u32,
        max_attempts: u32,
        error: String,
        next_retry_ms: u64,
    },
    
    /// Partial result available
    PartialResult {
        operation_id: String,
        result_type: String,
        data: serde_json::Value,
    },
    
    /// Operation completed
    Completed {
        operation_id: String,
        success: bool,
        message: String,
        duration_ms: u64,
    },
    
    /// Error occurred
    Error {
        operation_id: String,
        error: String,
        recoverable: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressDetail {
    pub symbol: Option<String>,
    pub provider: Option<String>,
    pub metric: Option<String>,
    pub value: Option<f64>,
}

/// Progress reporter that can emit events
#[derive(Clone)]
pub struct ProgressReporter {
    operation_id: String,
    sender: Arc<broadcast::Sender<ProgressEvent>>,
    start_time: std::time::Instant,
}

impl ProgressReporter {
    pub fn new(operation_id: String, sender: Arc<broadcast::Sender<ProgressEvent>>) -> Self {
        Self {
            operation_id,
            sender,
            start_time: std::time::Instant::now(),
        }
    }
    
    pub fn start(&self, operation_type: &str, total_steps: Option<usize>, message: &str) {
        let _ = self.sender.send(ProgressEvent::Started {
            operation_id: self.operation_id.clone(),
            operation_type: operation_type.to_string(),
            total_steps,
            message: message.to_string(),
        });
    }
    
    pub fn progress(&self, current_step: usize, total_steps: Option<usize>, message: &str, detail: Option<ProgressDetail>) {
        let percentage = if let Some(total) = total_steps {
            if total > 0 {
                (current_step as f64 / total as f64) * 100.0
            } else {
                0.0
            }
        } else {
            0.0
        };
        
        let _ = self.sender.send(ProgressEvent::Progress {
            operation_id: self.operation_id.clone(),
            current_step,
            total_steps,
            percentage,
            message: message.to_string(),
            detail,
        });
    }
    
    pub fn retry(&self, attempt: u32, max_attempts: u32, error: &str, next_retry_ms: u64) {
        let _ = self.sender.send(ProgressEvent::Retry {
            operation_id: self.operation_id.clone(),
            attempt,
            max_attempts,
            error: error.to_string(),
            next_retry_ms,
        });
    }
    
    pub fn partial_result(&self, result_type: &str, data: serde_json::Value) {
        let _ = self.sender.send(ProgressEvent::PartialResult {
            operation_id: self.operation_id.clone(),
            result_type: result_type.to_string(),
            data,
        });
    }
    
    pub fn complete(&self, success: bool, message: &str) {
        let duration_ms = self.start_time.elapsed().as_millis() as u64;
        let _ = self.sender.send(ProgressEvent::Completed {
            operation_id: self.operation_id.clone(),
            success,
            message: message.to_string(),
            duration_ms,
        });
    }
    
    pub fn error(&self, error: &str, recoverable: bool) {
        let _ = self.sender.send(ProgressEvent::Error {
            operation_id: self.operation_id.clone(),
            error: error.to_string(),
            recoverable,
        });
    }
}

/// Global progress channel manager
pub struct ProgressManager {
    sender: Arc<broadcast::Sender<ProgressEvent>>,
}

impl ProgressManager {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(100);
        Self {
            sender: Arc::new(sender),
        }
    }
    
    pub fn create_reporter(&self, operation_id: &str) -> ProgressReporter {
        ProgressReporter::new(
            operation_id.to_string(),
            self.sender.clone(),
        )
    }
    
    pub fn subscribe(&self) -> broadcast::Receiver<ProgressEvent> {
        self.sender.subscribe()
    }
    
    pub fn sender(&self) -> Arc<broadcast::Sender<ProgressEvent>> {
        self.sender.clone()
    }
}

impl Default for ProgressManager {
    fn default() -> Self {
        Self::new()
    }
}

// Global instance
use once_cell::sync::Lazy;
pub static PROGRESS_MANAGER: Lazy<ProgressManager> = Lazy::new(ProgressManager::new);

/// Helper to generate unique operation IDs
pub fn generate_operation_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("op_{}", timestamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_progress_reporter() {
        let manager = ProgressManager::new();
        let mut receiver = manager.subscribe();

        let reporter = manager.create_reporter("test_op");
        reporter.start("test", Some(3), "Starting test");

        // Check we received the event
        let event = receiver.try_recv();
        assert!(event.is_ok());

        match event.unwrap() {
            ProgressEvent::Started { operation_id, .. } => {
                assert_eq!(operation_id, "test_op");
            }
            _ => panic!("Expected Started event"),
        }
    }

    // --- new tests ---

    #[test]
    fn test_generate_operation_id_starts_with_op() {
        let id = generate_operation_id();
        assert!(id.starts_with("op_"));
    }

    #[test]
    fn test_generate_operation_id_unique() {
        let id1 = generate_operation_id();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let id2 = generate_operation_id();
        // Should differ since they're based on millisecond timestamps
        assert_ne!(id1, id2);
    }

    #[tokio::test]
    async fn test_progress_event_started_fields() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op123");
        reporter.start("scoring", Some(10), "Begin");

        match rx.try_recv().unwrap() {
            ProgressEvent::Started {
                operation_id,
                operation_type,
                total_steps,
                message,
            } => {
                assert_eq!(operation_id, "op123");
                assert_eq!(operation_type, "scoring");
                assert_eq!(total_steps, Some(10));
                assert_eq!(message, "Begin");
            }
            _ => panic!("Expected Started"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_progress_percentage_calculated() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.progress(5, Some(10), "halfway", None);

        match rx.try_recv().unwrap() {
            ProgressEvent::Progress { percentage, current_step, total_steps, .. } => {
                assert!((percentage - 50.0).abs() < 0.01);
                assert_eq!(current_step, 5);
                assert_eq!(total_steps, Some(10));
            }
            _ => panic!("Expected Progress"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_progress_zero_total_gives_zero_pct() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.progress(3, Some(0), "undefined", None);

        match rx.try_recv().unwrap() {
            ProgressEvent::Progress { percentage, .. } => {
                assert_eq!(percentage, 0.0);
            }
            _ => panic!("Expected Progress"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_progress_no_total_gives_zero_pct() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.progress(3, None, "unknown total", None);

        match rx.try_recv().unwrap() {
            ProgressEvent::Progress { percentage, total_steps, .. } => {
                assert_eq!(percentage, 0.0);
                assert_eq!(total_steps, None);
            }
            _ => panic!("Expected Progress"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_completed_fields() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.complete(true, "All done");

        match rx.try_recv().unwrap() {
            ProgressEvent::Completed { operation_id, success, message, .. } => {
                assert_eq!(operation_id, "op");
                assert!(success);
                assert_eq!(message, "All done");
            }
            _ => panic!("Expected Completed"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_error_fields() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.error("something broke", true);

        match rx.try_recv().unwrap() {
            ProgressEvent::Error { operation_id, error, recoverable } => {
                assert_eq!(operation_id, "op");
                assert_eq!(error, "something broke");
                assert!(recoverable);
            }
            _ => panic!("Expected Error"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_retry_fields() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.retry(2, 5, "timeout", 1000);

        match rx.try_recv().unwrap() {
            ProgressEvent::Retry { operation_id, attempt, max_attempts, error, next_retry_ms } => {
                assert_eq!(operation_id, "op");
                assert_eq!(attempt, 2);
                assert_eq!(max_attempts, 5);
                assert_eq!(error, "timeout");
                assert_eq!(next_retry_ms, 1000);
            }
            _ => panic!("Expected Retry"),
        }
    }

    #[tokio::test]
    async fn test_progress_event_partial_result_fields() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.partial_result("prices", serde_json::json!({"AAPL": 150.0}));

        match rx.try_recv().unwrap() {
            ProgressEvent::PartialResult { operation_id, result_type, data } => {
                assert_eq!(operation_id, "op");
                assert_eq!(result_type, "prices");
                assert!(data.is_object());
            }
            _ => panic!("Expected PartialResult"),
        }
    }

    #[test]
    fn test_progress_manager_create_multiple_reporters() {
        let manager = ProgressManager::new();
        let _r1 = manager.create_reporter("op1");
        let _r2 = manager.create_reporter("op2");
        // Just verify creation doesn't panic
    }

    #[tokio::test]
    async fn test_multiple_subscribers_receive_events() {
        let manager = ProgressManager::new();
        let mut rx1 = manager.subscribe();
        let mut rx2 = manager.subscribe();

        let reporter = manager.create_reporter("op");
        reporter.start("test", None, "hi");

        // Both should receive
        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
    }

    #[test]
    fn test_progress_detail_all_none_by_default() {
        let detail = ProgressDetail {
            symbol: None,
            provider: None,
            metric: None,
            value: None,
        };
        assert!(detail.symbol.is_none());
        assert!(detail.provider.is_none());
        assert!(detail.metric.is_none());
        assert!(detail.value.is_none());
    }

    #[tokio::test]
    async fn test_progress_with_detail() {
        let manager = ProgressManager::new();
        let mut rx = manager.subscribe();

        let reporter = manager.create_reporter("op");
        let detail = ProgressDetail {
            symbol: Some("AAPL".to_string()),
            provider: Some("yahoo".to_string()),
            metric: Some("price".to_string()),
            value: Some(150.0),
        };
        reporter.progress(1, Some(5), "fetching", Some(detail));

        match rx.try_recv().unwrap() {
            ProgressEvent::Progress { detail, .. } => {
                let d = detail.unwrap();
                assert_eq!(d.symbol, Some("AAPL".to_string()));
                assert_eq!(d.provider, Some("yahoo".to_string()));
            }
            _ => panic!("Expected Progress"),
        }
    }

    #[test]
    fn test_progress_manager_default() {
        // Covers Default impl (lines 184-185)
        let manager = ProgressManager::default();
        let _ = manager.subscribe();
    }

    #[test]
    fn test_progress_manager_sender_returns_arc() {
        // Covers sender() method (lines 178-179)
        let manager = ProgressManager::new();
        let sender = manager.sender();
        // Verify it's an Arc by cloning it
        let _sender2 = sender.clone();
    }
}
