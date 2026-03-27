// API Commands - Vibe Studio
// Extracted from lib.rs

use crate::core::validation::validate_symbols;
use crate::modules::{
    plan_compiler::{PlanCompiler, VibePlanScript},
    scoring::{FactorScore, ScoringConfig, SymbolScore},
};
use crate::{ENHANCED_MARKET_SERVICE, OPENROUTER_SERVICE, SAVED_PLANS};
use std::collections::HashMap;

/// Get default VibePlan template
#[tauri::command]
pub fn get_default_plan() -> Result<VibePlanScript, String> {
    Ok(PlanCompiler::default_template())
}

/// List available templates
#[tauri::command]
pub fn list_templates() -> Vec<String> {
    PlanCompiler::list_templates()
}

/// Get a specific template by name
#[tauri::command]
pub fn get_template(name: String) -> Result<VibePlanScript, String> {
    PlanCompiler::get_template(&name).ok_or_else(|| format!("Template '{}' not found", name))
}

/// Compile a prompt into a VibePlan using AI
#[tauri::command]
pub async fn compile_plan(prompt: String) -> Result<VibePlanScript, String> {
    if !OPENROUTER_SERVICE.is_configured() {
        tracing::warn!("OpenRouter not configured, using fallback template");
        return PlanCompiler::from_prompt(&prompt).map_err(|e| e.to_string());
    }

    tracing::info!("Compiling plan from prompt using AI...");

    let plan_json = OPENROUTER_SERVICE.compile_plan_from_prompt(&prompt).await?;

    let plan: VibePlanScript = serde_json::from_value(plan_json)
        .map_err(|e| format!("Failed to convert AI response to plan: {}", e))?;

    PlanCompiler::validate(&plan).map_err(|e| format!("Invalid plan from AI: {}", e))?;

    tracing::info!(plan_name = %plan.name, "Successfully compiled plan");
    Ok(plan)
}

/// Validate a VibePlan
#[tauri::command]
pub fn validate_plan(plan: VibePlanScript) -> Result<(), String> {
    PlanCompiler::validate(&plan).map_err(|e| e.to_string())
}

/// Get scoring configuration for a plan
#[tauri::command]
pub fn get_scoring_config(plan: VibePlanScript) -> Result<ScoringConfig, String> {
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
pub async fn score_symbols_batch(
    symbols: Vec<String>,
    config: ScoringConfig,
) -> Result<Vec<SymbolScore>, String> {
    validate_symbols(&symbols)?;

    let mut scores = Vec::new();

    for symbol in symbols {
        let metrics_result = ENHANCED_MARKET_SERVICE.get_quant_metrics(&symbol).await;

        match metrics_result {
            Ok(metrics) => {
                let mut factors = Vec::new();
                let mut total_contribution = 0.0;
                let mut total_weight = 0.0;

                if let Some(weight) = config.factor_weights.get("momentum") {
                    let normalized = momentum_score_from_rsi(metrics.rsi, &metrics.signal);
                    let contribution = normalized * weight;
                    factors.push(FactorScore {
                        name: "momentum".to_string(),
                        raw_value: Some(metrics.rsi),
                        normalized_value: normalized,
                        weight: *weight,
                        contribution,
                    });
                    total_contribution += contribution;
                    total_weight += weight;
                }

                if let Some(weight) = config.factor_weights.get("quality") {
                    let normalized =
                        quality_score_from_sharpe(metrics.sharpe_ratio, metrics.volatility);
                    let contribution = normalized * weight;
                    factors.push(FactorScore {
                        name: "quality".to_string(),
                        raw_value: Some(metrics.sharpe_ratio),
                        normalized_value: normalized,
                        weight: *weight,
                        contribution,
                    });
                    total_contribution += contribution;
                    total_weight += weight;
                }

                if let Some(weight) = config.factor_weights.get("value") {
                    let normalized = value_score_from_vol(metrics.volatility, metrics.max_drawdown);
                    let contribution = normalized * weight;
                    factors.push(FactorScore {
                        name: "value".to_string(),
                        raw_value: Some(metrics.volatility),
                        normalized_value: normalized,
                        weight: *weight,
                        contribution,
                    });
                    total_contribution += contribution;
                    total_weight += weight;
                }

                if let Some(weight) = config.factor_weights.get("growth") {
                    let normalized = growth_score_from_return(metrics.annualized_return);
                    let contribution = normalized * weight;
                    factors.push(FactorScore {
                        name: "growth".to_string(),
                        raw_value: Some(metrics.annualized_return),
                        normalized_value: normalized,
                        weight: *weight,
                        contribution,
                    });
                    total_contribution += contribution;
                    total_weight += weight;
                }

                let total_score = if total_weight > 0.0 {
                    total_contribution / total_weight
                } else {
                    50.0
                };

                let explanation = format!(
                    "{}: Score {:.1}/100\n\
                    RSI: {:.1} | Sharpe: {:.2} | Vol: {:.1}% | Return: {:.1}%\n\
                    Signal: {} (Confidence: {:.0}%)",
                    symbol,
                    total_score,
                    metrics.rsi,
                    metrics.sharpe_ratio,
                    metrics.volatility,
                    metrics.annualized_return,
                    metrics.signal,
                    metrics.confidence
                );

                scores.push(SymbolScore {
                    symbol,
                    total_score,
                    factors,
                    explanation,
                });
            }
            Err(e) => {
                scores.push(SymbolScore {
                    symbol: symbol.clone(),
                    total_score: 0.0,
                    factors: vec![],
                    explanation: format!("Error fetching data for {}: {}", symbol, e),
                });
            }
        }
    }

    scores.sort_by(|a, b| {
        b.total_score
            .partial_cmp(&a.total_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(scores)
}

// ==================== PLAN MANAGEMENT ====================

/// Save a plan
#[tauri::command]
pub async fn save_plan(plan: VibePlanScript) -> Result<String, String> {
    let mut plans = SAVED_PLANS.lock().await;
    let id = plan.name.clone();
    plans.insert(id.clone(), plan);
    Ok(id)
}

/// Load a saved plan
#[tauri::command]
pub async fn load_plan(name: String) -> Result<VibePlanScript, String> {
    let plans = SAVED_PLANS.lock().await;
    plans
        .get(&name)
        .cloned()
        .ok_or_else(|| format!("Plan '{}' not found", name))
}

/// List all saved plans
#[tauri::command]
pub async fn list_saved_plans() -> Result<Vec<String>, String> {
    let plans = SAVED_PLANS.lock().await;
    Ok(plans.keys().cloned().collect())
}

/// Delete a saved plan
#[tauri::command]
pub async fn delete_plan(name: String) -> Result<(), String> {
    let mut plans = SAVED_PLANS.lock().await;
    plans
        .remove(&name)
        .map(|_| ())
        .ok_or_else(|| format!("Plan '{}' not found", name))
}

// ==================== SCORE NORMALIZATION HELPERS ====================

pub(crate) fn momentum_score_from_rsi(rsi: f64, signal: &str) -> f64 {
    let rsi_score = match rsi {
        r if r < 30.0 => 80.0 + (30.0 - r),
        r if r > 70.0 => 50.0 - (r - 70.0),
        r => 50.0 + (50.0 - r).abs() * 0.5,
    };

    let signal_adj = match signal {
        "STRONG BUY" => 15.0,
        "BUY" => 10.0,
        "HOLD" => 0.0,
        "SELL" => -10.0,
        "STRONG SELL" => -15.0,
        _ => 0.0,
    };

    (rsi_score + signal_adj).clamp(0.0, 100.0)
}

pub(crate) fn quality_score_from_sharpe(sharpe: f64, volatility: f64) -> f64 {
    let sharpe_score = match sharpe {
        s if s > 2.0 => 90.0,
        s if s > 1.5 => 80.0,
        s if s > 1.0 => 70.0,
        s if s > 0.5 => 60.0,
        s if s > 0.0 => 50.0,
        s => (50.0 + s * 10.0).max(0.0),
    };

    let vol_adj = match volatility {
        v if v < 15.0 => 10.0,
        v if v < 25.0 => 5.0,
        v if v < 40.0 => 0.0,
        _ => -10.0,
    };

    (sharpe_score + vol_adj).clamp(0.0, 100.0)
}

pub(crate) fn value_score_from_vol(volatility: f64, max_drawdown: f64) -> f64 {
    let vol_score: f64 = match volatility {
        v if v < 15.0 => 85.0,
        v if v < 25.0 => 70.0,
        v if v < 35.0 => 55.0,
        v if v < 50.0 => 40.0,
        _ => 25.0,
    };

    let dd_adj: f64 = match max_drawdown {
        d if d < 10.0 => 10.0,
        d if d < 20.0 => 0.0,
        d if d < 30.0 => -10.0,
        _ => -20.0,
    };

    (vol_score + dd_adj).clamp(0.0_f64, 100.0_f64)
}

pub(crate) fn growth_score_from_return(annualized_return: f64) -> f64 {
    match annualized_return {
        r if r > 30.0 => 95.0,
        r if r > 20.0 => 85.0,
        r if r > 10.0 => 70.0,
        r if r > 5.0 => 60.0,
        r if r > 0.0 => 50.0,
        r if r > -10.0 => 35.0,
        _ => 20.0,
    }
}
