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

/// Create equal-weight allocation plan
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

/// Create demo portfolio for testing
#[tauri::command]
fn create_demo_portfolio() -> Result<Portfolio, String> {
    use modules::portfolio::Holding;
    
    let mut portfolio = Portfolio::new("Demo Portfolio".to_string());
    portfolio.cash = 5000.0;

    // Add some demo holdings
    let holdings = vec![
        Holding::new("AAPL".to_string(), 10.0, 150.0, 180.0, 25.0),
        Holding::new("MSFT".to_string(), 8.0, 300.0, 380.0, 25.0),
        Holding::new("GOOGL".to_string(), 5.0, 140.0, 150.0, 20.0),
        Holding::new("AMZN".to_string(), 3.0, 170.0, 180.0, 15.0),
        Holding::new("META".to_string(), 6.0, 350.0, 500.0, 15.0),
    ];

    for holding in holdings {
        portfolio.add_holding(holding);
    }

    Ok(portfolio)
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

/// Create a demo backtest configuration
#[tauri::command]
fn create_demo_backtest_config() -> Result<BacktestConfig, String> {
    Ok(BacktestConfig {
        start_date: "2020-01-01".to_string(),
        end_date: "2024-01-01".to_string(),
        initial_cash: 10000.0,
        monthly_contribution: 1000.0,
        rebalance_frequency: "quarterly".to_string(),
        rebalance_threshold: 5.0,
        symbols: vec![
            "AAPL".to_string(),
            "MSFT".to_string(),
            "GOOGL".to_string(),
            "AMZN".to_string(),
            "META".to_string(),
        ],
        allocation_method: "equal_weight".to_string(),
    })
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

/// Create demo journal entries
#[tauri::command]
fn create_demo_journal() -> Result<Vec<JournalEntry>, String> {
    let mut entries = Vec::new();

    // Initial strategy creation
    entries.push(Journal::create_entry(
        "strategy_creation",
        "Created Investment Strategy",
        "Started with Quality Factor template. Focus on high ROE (>15%) and low debt companies.",
        Some("v1.0".to_string()),
        vec!["strategy".to_string(), "initial".to_string()],
    ));

    // Trade decision
    entries.push(Journal::log_trade_decision(
        "AAPL",
        "BUY",
        "Strong fundamentals: ROE 45%, consistent revenue growth, low debt-to-equity.",
    ));

    entries.push(Journal::log_trade_decision(
        "MSFT",
        "BUY",
        "Excellent quality metrics: Operating margin 42%, ROIC 35%, diversified revenue.",
    ));

    // Rebalance
    entries.push(Journal::log_rebalance(
        "Quarterly drift check - AAPL exceeded 30% allocation",
        "SELL AAPL: $2,500 (15 shares)\nBUY GOOGL: $1,800 (12 shares)",
    ));

    // Review
    entries.push(Journal::log_review(
        "Quarterly",
        "Portfolio up 8.5% vs S&P 500 +6.2%. Quality factor outperforming.\nMax drawdown: -12% (within tolerance).",
        vec![
            "Consider adding value factor".to_string(),
            "Review tech concentration".to_string(),
        ],
    ));

    // Strategy adjustment
    entries.push(Journal::log_strategy_change(
        "Added value factor (P/E < 25) to complement quality screening.",
        "v1.0",
        "v1.1",
    ));

    // Reflection
    entries.push(Journal::log_reflection(
        "Learning: Patience Pays Off",
        "MSFT dropped 15% after earnings but fundamentals remained strong. \
        Resisted urge to sell. Stock recovered +22% over next 3 months. \
        Reminder: Focus on long-term thesis, not short-term noise.",
        vec!["lesson".to_string(), "psychology".to_string()],
    ));

    Ok(entries)
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
            test_data_connection,
            score_demo_symbol,
            get_scoring_config,
            score_symbols_batch,
            create_equal_weight_allocation,
            create_score_weighted_allocation,
            generate_monthly_buy_list,
            check_portfolio_rebalance,
            create_demo_portfolio,
            generate_yearly_review,
            run_backtest_simulation,
            create_demo_backtest_config,
            create_journal_entry,
            log_strategy_change,
            log_trade_decision,
            log_rebalance_event,
            log_review_event,
            compare_plan_versions,
            filter_journal_entries,
            calculate_journal_stats,
            export_journal_markdown,
            create_demo_journal,
            get_quant_metrics_batch,
            get_current_prices_batch,
            get_quant_metrics_single,
            get_current_price_single,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
