mod modules;

use modules::{
    plan_compiler::{PlanCompiler, VibePlanScript},
    data_provider::AlphaVantageClient,
    scoring::{ScoringEngine, ScoringConfig, SymbolScore, factors::{FinancialMetrics, MomentumMetrics}},
};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

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

/// Score a symbol with demo data
#[tauri::command]
fn score_demo_symbol(symbol: String) -> Result<SymbolScore, String> {
    // Create demo financial metrics
    let financial = FinancialMetrics {
        roe: Some(0.18),
        roic: Some(0.14),
        pe_ratio: Some(16.5),
        pb_ratio: Some(2.2),
        ps_ratio: Some(1.8),
        operating_margin: Some(0.22),
        debt_to_equity: Some(0.6),
        revenue_growth_yoy: Some(0.12),
        earnings_growth_yoy: Some(0.15),
        dividend_yield: Some(0.025),
        ..Default::default()
    };
    
    // Create demo momentum metrics
    let momentum = MomentumMetrics {
        return_1m: Some(0.03),
        return_3m: Some(0.08),
        return_6m: Some(0.15),
        return_12m: Some(0.22),
        volatility_30d: Some(0.018),
        avg_volume_30d: Some(5_000_000.0),
    };
    
    // Create scoring engine with default config
    let engine = ScoringEngine::with_default_config();
    
    // Calculate score
    let score = engine.calculate_score(&symbol, &financial, &momentum);
    
    Ok(score)
}

/// Get scoring configuration for a plan
#[tauri::command]
fn get_scoring_config(plan: VibePlanScript) -> Result<ScoringConfig, String> {
    // Extract factor weights from plan
    let mut weights = HashMap::new();
    
    for factor in &plan.ranking.factors {
        weights.insert(factor.name.clone(), factor.weight);
    }
    
    Ok(ScoringConfig {
        factor_weights: weights,
    })
}

/// Score multiple symbols with custom config
#[tauri::command]
fn score_symbols_batch(
    symbols: Vec<String>,
    config: ScoringConfig,
) -> Result<Vec<SymbolScore>, String> {
    let engine = ScoringEngine::new(config);
    
    // For demo, generate dummy data for each symbol
    let scores: Vec<SymbolScore> = symbols
        .into_iter()
        .enumerate()
        .map(|(i, symbol)| {
            let financial = generate_demo_financials(i);
            let momentum = generate_demo_momentum(i);
            engine.calculate_score(&symbol, &financial, &momentum)
        })
        .collect();
    
    // Rank by total score
    let ranked = engine.rank_symbols(scores);
    
    Ok(ranked)
}

// Helper functions for demo data
fn generate_demo_financials(seed: usize) -> FinancialMetrics {
    let offset = seed as f64 * 0.02;
    FinancialMetrics {
        roe: Some(0.15 + offset),
        roic: Some(0.12 + offset),
        pe_ratio: Some(18.0 - offset * 10.0),
        pb_ratio: Some(2.0 + offset),
        revenue_growth_yoy: Some(0.10 + offset),
        operating_margin: Some(0.20 + offset * 0.5),
        debt_to_equity: Some(0.8 - offset * 2.0),
        ..Default::default()
    }
}

fn generate_demo_momentum(seed: usize) -> MomentumMetrics {
    let offset = seed as f64 * 0.01;
    MomentumMetrics {
        return_3m: Some(0.05 + offset),
        return_6m: Some(0.10 + offset),
        return_12m: Some(0.18 + offset),
        ..Default::default()
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
            score_demo_symbol,
            get_scoring_config,
            score_symbols_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
