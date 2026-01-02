// API Commands - Health
// These are reference implementations for future migration
// Currently commands are defined in lib.rs

use crate::modules::health::HEALTH_MONITOR;

/// Example of how to structure health commands
pub struct HealthCommands;

impl HealthCommands {
    pub fn get_health_report() -> Result<serde_json::Value, String> {
        let report = HEALTH_MONITOR.get_health_report();
        serde_json::to_value(report).map_err(|e| e.to_string())
    }

    pub fn get_provider_metrics() -> Result<serde_json::Value, String> {
        let metrics = HEALTH_MONITOR.get_provider_metrics();
        serde_json::to_value(metrics).map_err(|e| e.to_string())
    }

    pub fn health_check() -> String {
        "FlowFolio API is running".to_string()
    }
}
