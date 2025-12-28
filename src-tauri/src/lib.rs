mod modules;
mod services;

use modules::{
    plan_compiler::{PlanCompiler, VibePlanScript},
    data_provider::AlphaVantageClient,
    scoring::{ScoringEngine, ScoringConfig, SymbolScore, factors::{FinancialMetrics, MomentumMetrics}},
    portfolio::{
        PortfolioManager, Portfolio, AllocationPlan, AllocationConstraints,
        BuyList, RebalanceReport, TargetAllocation,
        review::{ReviewGenerator, YearlyReview},
    },
    backtest::{BacktestEngine, BacktestConfig, BacktestResult},
    journal::{Journal, JournalEntry, JournalFilter, JournalStats, PlanVersionDiff},
    quant_analysis::QuantMetrics,
};
use services::market_data_service::MarketDataService;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// Global market data service instance
lazy_static::lazy_static! {
    static ref MARKET_DATA_SERVICE: Arc<Mutex<MarketDataService>> = Arc::new(Mutex::new(MarketDataService::new()));
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
fn score_symbols_batch(
    symbols: Vec<String>,
    config: ScoringConfig,
) -> Result<Vec<SymbolScore>, String> {
    // Note: This requires real financial and momentum data
    // In production, integrate with a data provider
    Err("Real financial data integration required".to_string())
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
    let service = MARKET_DATA_SERVICE.lock().await;
    Ok(service.batch_get_quant_metrics(symbols).await)
}

/// Get current prices for multiple symbols
#[tauri::command]
async fn get_current_prices_batch(symbols: Vec<String>) -> Result<HashMap<String, f64>, String> {
    let service = MARKET_DATA_SERVICE.lock().await;
    Ok(service.batch_get_current_prices(symbols).await)
}

/// Get single symbol quantitative metrics
#[tauri::command]
async fn get_quant_metrics_single(symbol: String) -> Result<QuantMetrics, String> {
    let service = MARKET_DATA_SERVICE.lock().await;
    service.get_quant_metrics(&symbol).await
}

/// Get single symbol current price
#[tauri::command]
async fn get_current_price_single(symbol: String) -> Result<f64, String> {
    let service = MARKET_DATA_SERVICE.lock().await;
    service.get_current_price(&symbol).await
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
