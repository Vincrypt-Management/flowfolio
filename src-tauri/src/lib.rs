// FlowFolio - Industrial Grade Investment Management
// 
// Architecture:
// - core/     : Configuration, errors, logging
// - infrastructure/: HTTP, cache, database, resilience
// - domain/   : Business logic (market, portfolio, analysis)
// - api/      : Tauri command handlers
// - modules/  : Legacy modules (being migrated)
// - services/ : Service layer

mod modules;
mod services;
mod core;
mod infrastructure;
mod domain;
mod api;

use modules::{
    plan_compiler::{PlanCompiler, VibePlanScript},
    scoring::{ScoringConfig, SymbolScore},
    portfolio::{
        PortfolioManager, Portfolio, AllocationPlan, AllocationConstraints,
        BuyList, RebalanceReport,
        review::{ReviewGenerator, YearlyReview},
    },
    backtest::{BacktestEngine, BacktestConfig, BacktestResult},
    journal::{Journal, JournalEntry, JournalFilter, JournalStats, PlanVersionDiff},
    quant_analysis::QuantMetrics,
};
use services::{EnhancedMarketDataService, enhanced_market_service::CacheStats};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// Global enhanced market data service instance
lazy_static::lazy_static! {
    static ref ENHANCED_MARKET_SERVICE: Arc<Mutex<EnhancedMarketDataService>> = 
        Arc::new(Mutex::new(EnhancedMarketDataService::new_without_db()));
}

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
async fn score_symbols_batch(
    symbols: Vec<String>,
    config: ScoringConfig,
) -> Result<Vec<SymbolScore>, String> {
    use modules::scoring::FactorScore;
    
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    let mut scores = Vec::new();
    
    for symbol in symbols {
        // Get quant metrics for this symbol
        let metrics_result = service.get_quant_metrics(&symbol).await;
        
        match metrics_result {
            Ok(metrics) => {
                let mut factors = Vec::new();
                let mut total_contribution = 0.0;
                let mut total_weight = 0.0;
                
                // Momentum factor (based on RSI and signal)
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
                
                // Quality factor (based on Sharpe ratio and volatility)
                if let Some(weight) = config.factor_weights.get("quality") {
                    let normalized = quality_score_from_sharpe(metrics.sharpe_ratio, metrics.volatility);
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
                
                // Value factor (inverse of volatility - lower vol = better value)
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
                
                // Growth factor (based on annualized return)
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
                    symbol, total_score,
                    metrics.rsi, metrics.sharpe_ratio, metrics.volatility, metrics.annualized_return,
                    metrics.signal, metrics.confidence
                );
                
                scores.push(SymbolScore {
                    symbol,
                    total_score,
                    factors,
                    explanation,
                });
            }
            Err(e) => {
                // Still add the symbol with zero score and error
                scores.push(SymbolScore {
                    symbol: symbol.clone(),
                    total_score: 0.0,
                    factors: vec![],
                    explanation: format!("Error fetching data for {}: {}", symbol, e),
                });
            }
        }
    }
    
    // Sort by total score descending
    scores.sort_by(|a, b| b.total_score.partial_cmp(&a.total_score).unwrap_or(std::cmp::Ordering::Equal));
    
    Ok(scores)
}

// Helper functions for score normalization
fn momentum_score_from_rsi(rsi: f64, signal: &str) -> f64 {
    // RSI 30-70 is neutral, below 30 is oversold (good buy), above 70 is overbought
    let rsi_score = match rsi {
        r if r < 30.0 => 80.0 + (30.0 - r), // Oversold = high score
        r if r > 70.0 => 50.0 - (r - 70.0), // Overbought = lower score
        r => 50.0 + (50.0 - r).abs() * 0.5, // Neutral range
    };
    
    // Adjust based on signal
    let signal_adj = match signal {
        "STRONG BUY" => 15.0,
        "BUY" => 10.0,
        "HOLD" => 0.0,
        "SELL" => -10.0,
        "STRONG SELL" => -15.0,
        _ => 0.0,
    };
    
    (rsi_score + signal_adj).max(0.0).min(100.0)
}

fn quality_score_from_sharpe(sharpe: f64, volatility: f64) -> f64 {
    // Sharpe > 1 is good, > 2 is excellent
    let sharpe_score = match sharpe {
        s if s > 2.0 => 90.0,
        s if s > 1.5 => 80.0,
        s if s > 1.0 => 70.0,
        s if s > 0.5 => 60.0,
        s if s > 0.0 => 50.0,
        s => (50.0 + s * 10.0).max(0.0),
    };
    
    // Lower volatility is better
    let vol_adj = match volatility {
        v if v < 15.0 => 10.0,
        v if v < 25.0 => 5.0,
        v if v < 40.0 => 0.0,
        _ => -10.0,
    };
    
    (sharpe_score + vol_adj).max(0.0).min(100.0)
}

fn value_score_from_vol(volatility: f64, max_drawdown: f64) -> f64 {
    // Lower volatility and drawdown = better value
    let vol_score: f64 = match volatility {
        v if v < 15.0 => 85.0,
        v if v < 25.0 => 70.0,
        v if v < 35.0 => 55.0,
        v if v < 50.0 => 40.0,
        _ => 25.0,
    };
    
    // Penalize high drawdowns
    let dd_adj: f64 = match max_drawdown {
        d if d < 10.0 => 10.0,
        d if d < 20.0 => 0.0,
        d if d < 30.0 => -10.0,
        _ => -20.0,
    };
    
    (vol_score + dd_adj).max(0.0_f64).min(100.0_f64)
}

fn growth_score_from_return(annualized_return: f64) -> f64 {
    // Higher return = better growth
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

// Create equal-weight allocation plan
#[tauri::command]
fn create_equal_weight_allocation(
    symbols: Vec<String>,
    max_position_pct: f64,
    cash_buffer_pct: f64,
) -> Result<AllocationPlan, String> {
    let constraints = AllocationConstraints {
        max_position_pct,
        min_position_pct: 1.0,
        max_sector_pct: None,
        cash_buffer_pct,
    };

    Ok(PortfolioManager::equal_weight_allocation(symbols, constraints))
}

/// Create score-weighted allocation plan
#[tauri::command]
fn create_score_weighted_allocation(
    scores: Vec<SymbolScore>,
    max_position_pct: f64,
    cash_buffer_pct: f64,
) -> Result<AllocationPlan, String> {
    let symbols_with_scores: Vec<(String, f64)> = scores
        .into_iter()
        .map(|s| (s.symbol, s.total_score))
        .collect();

    let constraints = AllocationConstraints {
        max_position_pct,
        min_position_pct: 1.0,
        max_sector_pct: None,
        cash_buffer_pct,
    };

    Ok(PortfolioManager::score_weighted_allocation(
        symbols_with_scores,
        constraints,
    ))
}

/// Generate monthly buy list
#[tauri::command]
fn generate_monthly_buy_list(
    contribution: f64,
    portfolio: Portfolio,
    allocation_plan: AllocationPlan,
    prices: HashMap<String, f64>,
) -> Result<BuyList, String> {
    Ok(PortfolioManager::generate_buy_list(
        contribution,
        &portfolio,
        &allocation_plan,
        &prices,
    ))
}

/// Check rebalancing needs
#[tauri::command]
fn check_portfolio_rebalance(
    portfolio: Portfolio,
    threshold_pct: f64,
) -> Result<RebalanceReport, String> {
    Ok(PortfolioManager::check_rebalance(&portfolio, threshold_pct))
}

/// Generate yearly review checklist
#[tauri::command]
fn generate_yearly_review(
    portfolio_name: String,
    year: i32,
) -> Result<YearlyReview, String> {
    Ok(ReviewGenerator::generate_yearly_review(&portfolio_name, year))
}

/// Run backtest simulation
#[tauri::command]
fn run_backtest_simulation(config: BacktestConfig) -> Result<BacktestResult, String> {
    Ok(BacktestEngine::run_backtest(config))
}

/// Create a journal entry
#[tauri::command]
fn create_journal_entry(
    event_type: String,
    title: String,
    content: String,
    plan_version: Option<String>,
    tags: Vec<String>,
) -> Result<JournalEntry, String> {
    Ok(Journal::create_entry(
        &event_type,
        &title,
        &content,
        plan_version,
        tags,
    ))
}

/// Log a strategy change
#[tauri::command]
fn log_strategy_change(
    change_description: String,
    old_plan: String,
    new_plan: String,
) -> Result<JournalEntry, String> {
    Ok(Journal::log_strategy_change(&change_description, &old_plan, &new_plan))
}

/// Log a trade decision
#[tauri::command]
fn log_trade_decision(
    symbol: String,
    action: String,
    rationale: String,
) -> Result<JournalEntry, String> {
    Ok(Journal::log_trade_decision(&symbol, &action, &rationale))
}

/// Log a rebalance event
#[tauri::command]
fn log_rebalance_event(
    trigger_reason: String,
    actions_summary: String,
) -> Result<JournalEntry, String> {
    Ok(Journal::log_rebalance(&trigger_reason, &actions_summary))
}

/// Log a review
#[tauri::command]
fn log_review_event(
    review_type: String,
    findings: String,
    action_items: Vec<String>,
) -> Result<JournalEntry, String> {
    Ok(Journal::log_review(&review_type, &findings, action_items))
}

/// Compare plan versions
#[tauri::command]
fn compare_plan_versions(
    old_plan: String,
    new_plan: String,
    from_version: String,
    to_version: String,
) -> Result<PlanVersionDiff, String> {
    Ok(Journal::compare_plans(&old_plan, &new_plan, &from_version, &to_version))
}

/// Filter journal entries
#[tauri::command]
fn filter_journal_entries(
    entries: Vec<JournalEntry>,
    filter: JournalFilter,
) -> Result<Vec<JournalEntry>, String> {
    Ok(Journal::filter_entries(&entries, &filter))
}

/// Calculate journal statistics
#[tauri::command]
fn calculate_journal_stats(
    entries: Vec<JournalEntry>,
) -> Result<JournalStats, String> {
    Ok(Journal::calculate_stats(&entries))
}

/// Export journal to markdown
#[tauri::command]
fn export_journal_markdown(
    entries: Vec<JournalEntry>,
) -> Result<String, String> {
    Ok(Journal::export_to_markdown(&entries))
}

/// Get quantitative metrics for multiple symbols
#[tauri::command]
async fn get_quant_metrics_batch(symbols: Vec<String>) -> Result<Vec<QuantMetrics>, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    Ok(service.get_batch_quant_metrics(symbols).await)
}

/// Get current prices for multiple symbols
#[tauri::command]
async fn get_current_prices_batch(symbols: Vec<String>) -> Result<HashMap<String, f64>, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    Ok(service.get_batch_prices(symbols).await)
}

/// Get single symbol quantitative metrics
#[tauri::command]
async fn get_quant_metrics_single(symbol: String) -> Result<QuantMetrics, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    service.get_quant_metrics(&symbol).await
}

/// Get single symbol current price
#[tauri::command]
async fn get_current_price_single(symbol: String) -> Result<f64, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    service.get_current_price(&symbol).await
}

/// Get cache statistics
#[tauri::command]
async fn get_cache_stats() -> Result<CacheStats, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    Ok(service.get_cache_stats().await)
}

/// Clear all caches
#[tauri::command]
async fn clear_all_caches() -> Result<(), String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    service.clear_all_caches().await;
    Ok(())
}

/// Prefetch symbols for faster access
#[tauri::command]
async fn prefetch_symbols(symbols: Vec<String>) -> Result<(), String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    service.prefetch_symbols(symbols).await;
    Ok(())
}

/// Test data connection by fetching a sample symbol
#[tauri::command]
async fn test_data_connection() -> Result<serde_json::Value, String> {
    use serde_json::json;
    
    eprintln!("🔬 Testing data connection...");
    
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    // Test with a common symbol
    let test_symbol = "AAPL";
    
    // Try to get price
    let price_result = service.get_current_price(test_symbol).await;
    let price = price_result.unwrap_or(0.0);
    
    // Try to get metrics
    let metrics_result = service.get_quant_metrics(test_symbol).await;
    let metrics_ok = metrics_result.is_ok();
    let signal = metrics_result.map(|m| m.signal).unwrap_or_else(|_| "FAILED".to_string());
    
    // Get cache stats
    let cache_stats = service.get_cache_stats().await;
    
    // Check API keys
    let alpaca_configured = std::env::var("VITE_ALPACA_API_KEY").is_ok();
    let finnhub_configured = std::env::var("VITE_FINNHUB_API_KEY").is_ok();
    let fmp_configured = std::env::var("VITE_FMP_API_KEY").is_ok();
    let polygon_configured = std::env::var("VITE_POLYGON_API_KEY").is_ok();
    let alphavantage_configured = std::env::var("VITE_ALPHAVANTAGE_API_KEY").is_ok();
    
    let result = json!({
        "status": if price > 0.0 { "connected" } else { "failed" },
        "test_symbol": test_symbol,
        "price": price,
        "metrics_ok": metrics_ok,
        "signal": signal,
        "cache_stats": {
            "memory_prices": cache_stats.memory_prices,
            "memory_quant": cache_stats.memory_quant,
        },
        "providers": {
            "alpaca": alpaca_configured,
            "finnhub": finnhub_configured,
            "fmp": fmp_configured,
            "polygon": polygon_configured,
            "alphavantage": alphavantage_configured,
            "yahoo": true, // Always available
        }
    });
    
    eprintln!("🔬 Test result: {:?}", result);
    
    Ok(result)
}

/// Get detailed health report with metrics
#[tauri::command]
async fn get_health_report() -> Result<serde_json::Value, String> {
    use crate::modules::health::HEALTH_MONITOR;
    
    let report = HEALTH_MONITOR.get_health_report();
    serde_json::to_value(report).map_err(|e| e.to_string())
}

/// Get provider-specific metrics
#[tauri::command]
async fn get_provider_metrics() -> Result<serde_json::Value, String> {
    use crate::modules::health::HEALTH_MONITOR;
    
    let metrics = HEALTH_MONITOR.get_provider_metrics();
    serde_json::to_value(metrics).map_err(|e| e.to_string())
}

// ==================== UNIVERSE & WATCHLIST ====================

/// Universe definition for symbol filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Universe {
    pub id: String,
    pub name: String,
    pub description: String,
    pub symbols: Vec<String>,
    pub tags: HashMap<String, Vec<String>>,
    pub exclude_list: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

// In-memory universe storage (would be database in production)
lazy_static::lazy_static! {
    static ref UNIVERSES: Arc<Mutex<HashMap<String, Universe>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Create a new universe/watchlist
#[tauri::command]
async fn create_universe(name: String, description: String, symbols: Vec<String>) -> Result<Universe, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    let universe = Universe {
        id: id.clone(),
        name,
        description,
        symbols,
        tags: HashMap::new(),
        exclude_list: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };
    
    let mut universes = UNIVERSES.lock().await;
    universes.insert(id, universe.clone());
    
    Ok(universe)
}

/// Get all universes
#[tauri::command]
async fn list_universes() -> Result<Vec<Universe>, String> {
    let universes = UNIVERSES.lock().await;
    Ok(universes.values().cloned().collect())
}

/// Get a specific universe
#[tauri::command]
async fn get_universe(id: String) -> Result<Universe, String> {
    let universes = UNIVERSES.lock().await;
    universes.get(&id)
        .cloned()
        .ok_or_else(|| format!("Universe '{}' not found", id))
}

/// Update universe symbols
#[tauri::command]
async fn update_universe_symbols(id: String, symbols: Vec<String>) -> Result<Universe, String> {
    let mut universes = UNIVERSES.lock().await;
    
    if let Some(universe) = universes.get_mut(&id) {
        universe.symbols = symbols;
        universe.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(universe.clone())
    } else {
        Err(format!("Universe '{}' not found", id))
    }
}

/// Add symbols to universe exclude list
#[tauri::command]
async fn add_to_exclude_list(id: String, symbols: Vec<String>) -> Result<Universe, String> {
    let mut universes = UNIVERSES.lock().await;
    
    if let Some(universe) = universes.get_mut(&id) {
        for symbol in symbols {
            if !universe.exclude_list.contains(&symbol) {
                universe.exclude_list.push(symbol);
            }
        }
        universe.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(universe.clone())
    } else {
        Err(format!("Universe '{}' not found", id))
    }
}

/// Delete a universe
#[tauri::command]
async fn delete_universe(id: String) -> Result<(), String> {
    let mut universes = UNIVERSES.lock().await;
    universes.remove(&id)
        .map(|_| ())
        .ok_or_else(|| format!("Universe '{}' not found", id))
}

// ==================== EXPORT / IMPORT ====================

/// Export data bundle (plan + holdings + journal)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportBundle {
    pub version: String,
    pub exported_at: String,
    pub plan: Option<VibePlanScript>,
    pub universes: Vec<Universe>,
    pub journal_entries: Vec<JournalEntry>,
    pub settings: HashMap<String, String>,
}

/// Export all data to JSON bundle
#[tauri::command]
async fn export_data_bundle(
    plan: Option<VibePlanScript>,
    journal_entries: Vec<JournalEntry>,
) -> Result<String, String> {
    let universes = UNIVERSES.lock().await;
    
    let bundle = ExportBundle {
        version: "1.0.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        plan,
        universes: universes.values().cloned().collect(),
        journal_entries,
        settings: HashMap::new(),
    };
    
    serde_json::to_string_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize bundle: {}", e))
}

/// Import data from JSON bundle
#[tauri::command]
async fn import_data_bundle(bundle_json: String) -> Result<serde_json::Value, String> {
    let bundle: ExportBundle = serde_json::from_str(&bundle_json)
        .map_err(|e| format!("Failed to parse bundle: {}", e))?;
    
    // Import universes
    let mut universes = UNIVERSES.lock().await;
    for universe in bundle.universes {
        universes.insert(universe.id.clone(), universe);
    }
    
    Ok(serde_json::json!({
        "success": true,
        "imported": {
            "universes": universes.len(),
            "journal_entries": bundle.journal_entries.len(),
            "has_plan": bundle.plan.is_some(),
        }
    }))
}

// ==================== PLAN MANAGEMENT ====================

// In-memory plan storage
lazy_static::lazy_static! {
    static ref SAVED_PLANS: Arc<Mutex<HashMap<String, VibePlanScript>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Save a plan
#[tauri::command]
async fn save_plan(plan: VibePlanScript) -> Result<String, String> {
    let mut plans = SAVED_PLANS.lock().await;
    let id = plan.name.clone();
    plans.insert(id.clone(), plan);
    Ok(id)
}

/// Load a saved plan
#[tauri::command]
async fn load_plan(name: String) -> Result<VibePlanScript, String> {
    let plans = SAVED_PLANS.lock().await;
    plans.get(&name)
        .cloned()
        .ok_or_else(|| format!("Plan '{}' not found", name))
}

/// List all saved plans
#[tauri::command]
async fn list_saved_plans() -> Result<Vec<String>, String> {
    let plans = SAVED_PLANS.lock().await;
    Ok(plans.keys().cloned().collect())
}

/// Delete a saved plan
#[tauri::command]
async fn delete_plan(name: String) -> Result<(), String> {
    let mut plans = SAVED_PLANS.lock().await;
    plans.remove(&name)
        .map(|_| ())
        .ok_or_else(|| format!("Plan '{}' not found", name))
}

// ==================== HISTORICAL DATA ====================

/// Get historical price data for a symbol
#[tauri::command]
async fn get_historical_prices(symbol: String, days: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    let _days = days.unwrap_or(365);
    
    // Try to get from provider
    match service.get_quant_metrics(&symbol).await {
        Ok(metrics) => {
            // Return what data we have (simplified for now)
            Ok(vec![serde_json::json!({
                "symbol": symbol,
                "metrics": {
                    "rsi": metrics.rsi,
                    "sharpe_ratio": metrics.sharpe_ratio,
                    "annualized_return": metrics.annualized_return,
                    "volatility": metrics.volatility,
                    "max_drawdown": metrics.max_drawdown,
                    "signal": metrics.signal,
                }
            })])
        }
        Err(e) => Err(format!("Failed to get historical data: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging for observability
    #[cfg(debug_assertions)]
    {
        eprintln!("[INFO] [app] FlowFolio starting in DEBUG mode");
        eprintln!("[INFO] [app] Industrial-grade features enabled:");
        eprintln!("[INFO] [app]   - Circuit breaker pattern");
        eprintln!("[INFO] [app]   - Retry with exponential backoff");
        eprintln!("[INFO] [app]   - Health monitoring and metrics");
        eprintln!("[INFO] [app]   - Multi-tier caching");
    }
    
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
            get_scoring_config,
            score_symbols_batch,
            create_equal_weight_allocation,
            create_score_weighted_allocation,
            generate_monthly_buy_list,
            check_portfolio_rebalance,
            generate_yearly_review,
            run_backtest_simulation,
            create_journal_entry,
            log_strategy_change,
            log_trade_decision,
            log_rebalance_event,
            log_review_event,
            compare_plan_versions,
            filter_journal_entries,
            calculate_journal_stats,
            export_journal_markdown,
            get_quant_metrics_batch,
            get_current_prices_batch,
            get_quant_metrics_single,
            get_current_price_single,
            get_cache_stats,
            clear_all_caches,
            prefetch_symbols,
            test_data_connection,
            get_health_report,
            get_provider_metrics,
            // Universe & Watchlist
            create_universe,
            list_universes,
            get_universe,
            update_universe_symbols,
            add_to_exclude_list,
            delete_universe,
            // Export / Import
            export_data_bundle,
            import_data_bundle,
            // Plan Management
            save_plan,
            load_plan,
            list_saved_plans,
            delete_plan,
            // Historical Data
            get_historical_prices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
