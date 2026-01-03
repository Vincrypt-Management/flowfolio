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
lazy_static::lazy_static! {
    pub static ref PROGRESS_MANAGER: ProgressManager = ProgressManager::new();
}

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
}
