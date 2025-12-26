mod modules;

use modules::{
    plan_compiler::{PlanCompiler, VibePlanScript},
    data_provider::AlphaVantageClient,
};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct TemplateInfo {
    name: String,
    description: String,
}

/// Health check command
#[tauri::command]
fn health_check() -> String {
    "FlowFolio API is running".to_string()
}

/// Get default VibePlan template
#[tauri::command]
fn get_default_plan() -> Result<VibePlanScript, String> {
    Ok(PlanCompiler::default_template())
}

/// List available templates
#[tauri::command]
fn list_templates() -> Vec<String> {
    PlanCompiler::list_templates()
}

/// Get a specific template by name
#[tauri::command]
fn get_template(name: String) -> Result<VibePlanScript, String> {
    PlanCompiler::get_template(&name)
        .ok_or_else(|| format!("Template '{}' not found", name))
}

/// Compile a prompt into a VibePlan
#[tauri::command]
fn compile_plan(prompt: String) -> Result<VibePlanScript, String> {
    PlanCompiler::from_prompt(&prompt)
        .map_err(|e| e.to_string())
}

/// Validate a VibePlan
#[tauri::command]
fn validate_plan(plan: VibePlanScript) -> Result<(), String> {
    PlanCompiler::validate(&plan)
        .map_err(|e| e.to_string())
}

/// Get API provider status
#[tauri::command]
fn get_provider_status() -> String {
    serde_json::json!({
        "provider": "Alpha Vantage",
        "status": "ready",
        "quota_remaining": 25
    }).to_string()
}

/// Test Alpha Vantage connection (using demo key)
#[tauri::command]
async fn test_data_connection() -> Result<String, String> {
    let client = AlphaVantageClient::new("demo".to_string());
    
    // Try to fetch IBM data with demo key
    match client.get_time_series_daily("IBM", "compact").await {
        Ok(data) => {
            if data.is_empty() {
                Ok("Connected, but no data returned. You may need a valid API key.".to_string())
            } else {
                Ok(format!("Connected successfully! Retrieved {} days of data for IBM.", data.len()))
            }
        }
        Err(e) => Err(format!("Connection failed: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_default_plan,
            list_templates,
            get_template,
            compile_plan,
            validate_plan,
            get_provider_status,
            test_data_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
