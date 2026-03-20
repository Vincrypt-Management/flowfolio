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
pub mod core;
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
        PortfolioOptimizer, PortfolioOptimizationReport,
    },
    backtest::{BacktestEngine, BacktestConfig, BacktestResult},
    journal::{Journal, JournalEntry, JournalFilter, JournalStats, PlanVersionDiff},
    quant_analysis::{QuantMetrics, QuantAnalyzer, DashboardData},
    progress::{ProgressEvent, generate_operation_id, ProgressDetail},
};
use modules::portfolio::optimizer::OptimizationThresholds;
use services::{
    EnhancedMarketDataService,
    enhanced_market_service::CacheStats,
    OpenRouterService,
    AlpacaService,
    FundamentalDataService,
    FundamentalMetrics,
    openrouter_service::OpenRouterMessage,
};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

// Global service instances
lazy_static::lazy_static! {
    static ref ENHANCED_MARKET_SERVICE: Arc<Mutex<EnhancedMarketDataService>> =
        Arc::new(Mutex::new(EnhancedMarketDataService::new_without_db()));

    static ref OPENROUTER_SERVICE: Arc<OpenRouterService> =
        Arc::new(OpenRouterService::new());

    static ref ALPACA_SERVICE: Arc<AlpacaService> =
        Arc::new(AlpacaService::new());

    static ref FUNDAMENTAL_SERVICE: Arc<FundamentalDataService> =
        Arc::new(FundamentalDataService::new());

    // Flag to track if database is initialized
    static ref DB_INITIALIZED: Arc<std::sync::atomic::AtomicBool> =
        Arc::new(std::sync::atomic::AtomicBool::new(false));

    static ref DB_POOL: Arc<Mutex<Option<sqlx::Pool<sqlx::Sqlite>>>> =
        Arc::new(Mutex::new(None));

}

/// Initialize local SQLite database for caching
async fn init_local_database(app_data_dir: PathBuf) -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;
    
    // Ensure the data directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;
    
    let db_path = app_data_dir.join("flowfolio_cache.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    
    eprintln!("[INFO] [db] Initializing local cache database at: {}", db_path.display());
    
    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| format!("Invalid database URL: {}", e))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;
    
    // Create cache tables
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS price_cache (
            symbol TEXT PRIMARY KEY,
            current_price REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create price_cache: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS quant_metrics_cache (
            symbol TEXT PRIMARY KEY,
            sharpe_ratio REAL NOT NULL,
            annualized_return REAL NOT NULL,
            volatility REAL NOT NULL,
            max_drawdown REAL NOT NULL,
            rsi REAL NOT NULL,
            signal TEXT NOT NULL,
            confidence REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create quant_metrics_cache: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS historical_prices_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open_price REAL NOT NULL,
            high_price REAL NOT NULL,
            low_price REAL NOT NULL,
            close_price REAL NOT NULL,
            volume INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(symbol, date)
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create historical_prices_cache: {}", e))?;
    
    // Create index for faster lookups
    sqlx::query(r#"
        CREATE INDEX IF NOT EXISTS idx_historical_symbol_date 
        ON historical_prices_cache(symbol, date)
    "#).execute(&pool).await.map_err(|e| format!("Failed to create index: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS fundamentals_cache (
            symbol TEXT PRIMARY KEY,
            market_cap REAL,
            pe_ratio REAL,
            pb_ratio REAL,
            dividend_yield REAL,
            eps REAL,
            roe REAL,
            raw_json TEXT,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create fundamentals_cache: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS sentiment_cache (
            symbol TEXT PRIMARY KEY,
            overall_sentiment TEXT NOT NULL,
            sentiment_score REAL NOT NULL,
            news_count INTEGER NOT NULL,
            buzz_score REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create sentiment_cache: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS analyst_ratings_cache (
            symbol TEXT PRIMARY KEY,
            consensus_rating TEXT NOT NULL,
            target_price_mean REAL,
            target_price_high REAL,
            target_price_low REAL,
            number_of_analysts INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create analyst_ratings_cache: {}", e))?;
    
    // Create saved portfolios table
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS saved_portfolios (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create saved_portfolios: {}", e))?;
    
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS price_alerts (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            condition TEXT NOT NULL,
            threshold REAL NOT NULL,
            reference_price REAL,
            active INTEGER NOT NULL DEFAULT 1,
            triggered INTEGER NOT NULL DEFAULT 0,
            triggered_at TEXT,
            created_at TEXT NOT NULL,
            note TEXT
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create price_alerts: {}", e))?;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS rebalance_schedules (
            id TEXT PRIMARY KEY,
            plan_name TEXT NOT NULL,
            cadence TEXT NOT NULL,
            next_run TEXT NOT NULL,
            last_run TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create rebalance_schedules: {}", e))?;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create user_settings: {}", e))?;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS universes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            symbols TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '{}',
            exclude_list TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create universes: {}", e))?;

    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS rebalance_transactions (
            id TEXT PRIMARY KEY,
            portfolio_id TEXT,
            plan_name TEXT,
            method TEXT NOT NULL,
            symbols TEXT NOT NULL,
            allocations TEXT NOT NULL,
            executed_at TEXT NOT NULL,
            notes TEXT
        )
    "#).execute(&pool).await.map_err(|e| format!("Failed to create rebalance_transactions: {}", e))?;

    eprintln!("[INFO] [db] Local cache database initialized successfully");

    Ok(pool)
}

/// Initialize the enhanced market service with database
async fn init_market_service_with_db(pool: sqlx::Pool<sqlx::Sqlite>) {
    {
        let mut db = DB_POOL.lock().await;
        *db = Some(pool.clone());
    }
    let mut service = ENHANCED_MARKET_SERVICE.lock().await;
    *service = EnhancedMarketDataService::new(Some(pool));
    DB_INITIALIZED.store(true, std::sync::atomic::Ordering::SeqCst);
    eprintln!("[INFO] [service] Enhanced market service initialized with database caching");
}

async fn get_pool() -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    let pool = DB_POOL.lock().await;
    pool.clone().ok_or_else(|| "Database not initialized".to_string())
}

#[allow(dead_code)]
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

/// Compile a prompt into a VibePlan using AI
#[tauri::command]
async fn compile_plan(prompt: String) -> Result<VibePlanScript, String> {
    // Check if OpenRouter is configured
    if !OPENROUTER_SERVICE.is_configured() {
        eprintln!("[WARN] [compile_plan] OpenRouter not configured, using fallback template");
        return PlanCompiler::from_prompt(&prompt).map_err(|e| e.to_string());
    }
    
    eprintln!("[INFO] [compile_plan] Compiling plan from prompt using AI...");
    
    // Use AI to compile the plan
    let plan_json = OPENROUTER_SERVICE.compile_plan_from_prompt(&prompt).await?;
    
    // Convert JSON to VibePlanScript
    let plan: VibePlanScript = serde_json::from_value(plan_json)
        .map_err(|e| format!("Failed to convert AI response to plan: {}", e))?;
    
    // Validate the plan
    PlanCompiler::validate(&plan).map_err(|e| format!("Invalid plan from AI: {}", e))?;
    
    eprintln!("[INFO] [compile_plan] Successfully compiled plan: {}", plan.name);
    Ok(plan)
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

/// Generate portfolio optimization report with drop/replace recommendations
#[tauri::command]
async fn generate_optimization_report(
    portfolio_name: String,
    holdings: Vec<(String, f64, f64, f64)>, // (symbol, shares, cost_basis, current_price)
    candidate_symbols: Vec<String>,
    thresholds: Option<OptimizationThresholds>,
) -> Result<PortfolioOptimizationReport, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    // Get metrics for current holdings
    let holding_symbols: Vec<String> = holdings.iter().map(|(s, _, _, _)| s.clone()).collect();
    let mut holding_metrics: HashMap<String, QuantMetrics> = HashMap::new();
    
    for symbol in &holding_symbols {
        if let Ok(metrics) = service.get_quant_metrics(symbol).await {
            holding_metrics.insert(symbol.clone(), metrics);
        }
    }
    
    // Get metrics for candidate replacements
    let mut candidate_metrics: HashMap<String, QuantMetrics> = HashMap::new();
    
    for symbol in &candidate_symbols {
        if !holding_symbols.contains(symbol) {
            if let Ok(metrics) = service.get_quant_metrics(symbol).await {
                candidate_metrics.insert(symbol.clone(), metrics);
            }
        }
    }
    
    let thresholds = thresholds.unwrap_or_default();
    
    Ok(PortfolioOptimizer::generate_optimization_report(
        &portfolio_name,
        holdings,
        &holding_metrics,
        &candidate_metrics,
        thresholds,
    ))
}

/// Generate portfolio optimization report with LIVE progress updates
/// This version emits events during the analysis for real-time UI updates
#[tauri::command]
async fn generate_optimization_report_live(
    app: AppHandle,
    portfolio_name: String,
    holdings: Vec<(String, f64, f64, f64)>, // (symbol, shares, cost_basis, current_price)
    candidate_symbols: Vec<String>,
    thresholds: Option<OptimizationThresholds>,
) -> Result<PortfolioOptimizationReport, String> {
    let operation_id = generate_operation_id();
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    let holding_symbols: Vec<String> = holdings.iter().map(|(s, _, _, _)| s.clone()).collect();
    let total_symbols = holding_symbols.len() + candidate_symbols.len();
    
    // Emit start event
    let _ = app.emit("optimization_progress", ProgressEvent::Started {
        operation_id: operation_id.clone(),
        operation_type: "portfolio_optimization".to_string(),
        total_steps: Some(total_symbols),
        message: format!("Starting portfolio optimization for {}", portfolio_name),
    });
    
    let mut holding_metrics: HashMap<String, QuantMetrics> = HashMap::new();
    let mut current_step = 0;
    
    // Analyze current holdings with progress updates
    for (idx, symbol) in holding_symbols.iter().enumerate() {
        current_step = idx + 1;
        
        let _ = app.emit("optimization_progress", ProgressEvent::Progress {
            operation_id: operation_id.clone(),
            current_step,
            total_steps: Some(total_symbols),
            percentage: (current_step as f64 / total_symbols as f64) * 100.0,
            message: format!("Analyzing holding: {}", symbol),
            detail: Some(ProgressDetail {
                symbol: Some(symbol.clone()),
                provider: None,
                metric: Some("quant_metrics".to_string()),
                value: None,
            }),
        });
        
        // Try to get metrics with retry tracking
        let mut attempts = 0;
        let max_attempts = 3;
        
        loop {
            attempts += 1;
            match service.get_quant_metrics(symbol).await {
                Ok(metrics) => {
                    // Emit partial result for immediate UI update
                    let _ = app.emit("optimization_progress", ProgressEvent::PartialResult {
                        operation_id: operation_id.clone(),
                        result_type: "holding_metrics".to_string(),
                        data: serde_json::json!({
                            "symbol": symbol,
                            "sharpe_ratio": metrics.sharpe_ratio,
                            "annualized_return": metrics.annualized_return,
                            "volatility": metrics.volatility,
                            "signal": metrics.signal,
                        }),
                    });
                    
                    holding_metrics.insert(symbol.clone(), metrics);
                    break;
                }
                Err(e) => {
                    if attempts < max_attempts {
                        // Emit retry event
                        let _ = app.emit("optimization_progress", ProgressEvent::Retry {
                            operation_id: operation_id.clone(),
                            attempt: attempts,
                            max_attempts,
                            error: e.clone(),
                            next_retry_ms: (attempts as u64) * 500,
                        });
                        
                        tokio::time::sleep(tokio::time::Duration::from_millis((attempts as u64) * 500)).await;
                    } else {
                        // Emit error for this symbol but continue
                        let _ = app.emit("optimization_progress", ProgressEvent::Error {
                            operation_id: operation_id.clone(),
                            error: format!("Failed to get metrics for {}: {}", symbol, e),
                            recoverable: true,
                        });
                        break;
                    }
                }
            }
        }
    }
    
    // Analyze candidate symbols for replacements
    let mut candidate_metrics: HashMap<String, QuantMetrics> = HashMap::new();
    
    for symbol in &candidate_symbols {
        if holding_symbols.contains(symbol) {
            continue;
        }
        
        current_step += 1;
        
        let _ = app.emit("optimization_progress", ProgressEvent::Progress {
            operation_id: operation_id.clone(),
            current_step,
            total_steps: Some(total_symbols),
            percentage: (current_step as f64 / total_symbols as f64) * 100.0,
            message: format!("Evaluating replacement candidate: {}", symbol),
            detail: Some(ProgressDetail {
                symbol: Some(symbol.clone()),
                provider: None,
                metric: Some("candidate_analysis".to_string()),
                value: None,
            }),
        });
        
        let mut attempts = 0;
        let max_attempts = 3;
        
        loop {
            attempts += 1;
            match service.get_quant_metrics(symbol).await {
                Ok(metrics) => {
                    // Emit partial result
                    let _ = app.emit("optimization_progress", ProgressEvent::PartialResult {
                        operation_id: operation_id.clone(),
                        result_type: "candidate_metrics".to_string(),
                        data: serde_json::json!({
                            "symbol": symbol,
                            "sharpe_ratio": metrics.sharpe_ratio,
                            "annualized_return": metrics.annualized_return,
                            "volatility": metrics.volatility,
                            "signal": metrics.signal,
                            "score": calculate_quick_score(&metrics),
                        }),
                    });
                    
                    candidate_metrics.insert(symbol.clone(), metrics);
                    break;
                }
                Err(e) => {
                    if attempts < max_attempts {
                        let _ = app.emit("optimization_progress", ProgressEvent::Retry {
                            operation_id: operation_id.clone(),
                            attempt: attempts,
                            max_attempts,
                            error: e.clone(),
                            next_retry_ms: (attempts as u64) * 500,
                        });
                        
                        tokio::time::sleep(tokio::time::Duration::from_millis((attempts as u64) * 500)).await;
                    } else {
                        let _ = app.emit("optimization_progress", ProgressEvent::Error {
                            operation_id: operation_id.clone(),
                            error: format!("Failed to analyze candidate {}: {}", symbol, e),
                            recoverable: true,
                        });
                        break;
                    }
                }
            }
        }
    }
    
    // Generate final report
    let _ = app.emit("optimization_progress", ProgressEvent::Progress {
        operation_id: operation_id.clone(),
        current_step: total_symbols,
        total_steps: Some(total_symbols),
        percentage: 100.0,
        message: "Generating optimization recommendations...".to_string(),
        detail: None,
    });
    
    let thresholds = thresholds.unwrap_or_default();
    let report = PortfolioOptimizer::generate_optimization_report(
        &portfolio_name,
        holdings,
        &holding_metrics,
        &candidate_metrics,
        thresholds,
    );
    
    // Emit completion
    let _ = app.emit("optimization_progress", ProgressEvent::Completed {
        operation_id: operation_id.clone(),
        success: true,
        message: format!(
            "Optimization complete: {} drops recommended, {} replacements found",
            report.drop_recommendations.len(),
            report.replacement_options.len()
        ),
        duration_ms: 0, // Would need to track this
    });
    
    Ok(report)
}

// Helper function to calculate a quick score for candidates
fn calculate_quick_score(metrics: &QuantMetrics) -> f64 {
    let mut score = 0.0;
    score += (metrics.sharpe_ratio * 15.0).min(30.0).max(0.0);
    score += (metrics.annualized_return * 0.5).min(25.0).max(0.0);
    score += ((50.0 - metrics.volatility) * 0.3).min(15.0).max(0.0);
    score += ((40.0 - metrics.max_drawdown) * 0.375).min(15.0).max(0.0);
    score += match metrics.signal.as_str() {
        "STRONG BUY" => 15.0,
        "BUY" => 10.0,
        "HOLD" => 5.0,
        _ => 0.0,
    };
    score
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

/// Generate comprehensive dashboard data - ALL calculations done on backend
/// This eliminates heavy frontend calculations for better performance
#[tauri::command]
async fn get_dashboard_data(symbols: Vec<String>) -> Result<DashboardData, String> {
    use modules::quant_analysis::HistoricalPrice as QuantHistoricalPrice;
    
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    // Fetch historical data for all symbols
    let mut assets_data: Vec<(String, Vec<QuantHistoricalPrice>)> = Vec::new();
    
    for symbol in &symbols {
        match service.get_historical_prices(symbol).await {
            Ok(prices) => {
                // Convert from provider's HistoricalPrice to quant_analysis HistoricalPrice
                let historical: Vec<QuantHistoricalPrice> = prices
                    .into_iter()
                    .map(|p| QuantHistoricalPrice { date: p.date, close: p.close })
                    .collect();
                assets_data.push((symbol.clone(), historical));
            }
            Err(_) => {
                // Skip symbols without data
                continue;
            }
        }
    }
    
    if assets_data.is_empty() {
        return Err("No historical data available for any symbol".to_string());
    }
    
    Ok(QuantAnalyzer::generate_dashboard_data(assets_data))
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

// ==================== SAVED PORTFOLIOS (Generated from Vibe Studio) ====================

/// Saved portfolio info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedPortfolioInfo {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

/// Save a generated portfolio to the database
#[tauri::command]
async fn save_generated_portfolio(id: String, name: String, data: serde_json::Value) -> Result<String, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    if let Some(pool) = service.get_db_pool() {
        let now = chrono::Utc::now().to_rfc3339();
        let data_str = serde_json::to_string(&data)
            .map_err(|e| format!("Failed to serialize portfolio: {}", e))?;
        
        sqlx::query(r#"
            INSERT OR REPLACE INTO saved_portfolios (id, name, data, created_at, updated_at)
            VALUES (?, ?, ?, COALESCE((SELECT created_at FROM saved_portfolios WHERE id = ?), ?), ?)
        "#)
        .bind(&id)
        .bind(&name)
        .bind(&data_str)
        .bind(&id)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to save portfolio: {}", e))?;
        
        eprintln!("[INFO] [portfolio] Saved portfolio '{}' with id '{}'", name, id);
        Ok(id)
    } else {
        Err("Database not initialized".to_string())
    }
}

/// Load a saved portfolio by ID
#[tauri::command]
async fn load_generated_portfolio(id: String) -> Result<serde_json::Value, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    if let Some(pool) = service.get_db_pool() {
        let row: Option<(String,)> = sqlx::query_as(r#"
            SELECT data FROM saved_portfolios WHERE id = ?
        "#)
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to load portfolio: {}", e))?;
        
        if let Some((data_str,)) = row {
            serde_json::from_str(&data_str)
                .map_err(|e| format!("Failed to parse portfolio data: {}", e))
        } else {
            Err(format!("Portfolio '{}' not found", id))
        }
    } else {
        Err("Database not initialized".to_string())
    }
}

/// List all saved portfolios
#[tauri::command]
async fn list_saved_portfolios() -> Result<Vec<SavedPortfolioInfo>, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    if let Some(pool) = service.get_db_pool() {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(r#"
            SELECT id, name, created_at, updated_at FROM saved_portfolios ORDER BY updated_at DESC
        "#)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list portfolios: {}", e))?;
        
        Ok(rows.into_iter().map(|(id, name, created_at, updated_at)| {
            SavedPortfolioInfo { id, name, created_at, updated_at }
        }).collect())
    } else {
        Err("Database not initialized".to_string())
    }
}

/// Delete a saved portfolio
#[tauri::command]
async fn delete_saved_portfolio(id: String) -> Result<(), String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    if let Some(pool) = service.get_db_pool() {
        sqlx::query("DELETE FROM saved_portfolios WHERE id = ?")
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete portfolio: {}", e))?;
        
        eprintln!("[INFO] [portfolio] Deleted portfolio '{}'", id);
        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

/// Get detailed quantitative analysis for a single ticker
#[tauri::command]
async fn get_detailed_ticker_analysis(symbol: String) -> Result<serde_json::Value, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    
    // Get available data for the ticker
    let quant_result = service.get_quant_metrics(&symbol).await;
    let price_result = service.get_current_price(&symbol).await;
    
    // Fetch real fundamentals from the fundamental service
    let fundamentals_result = FUNDAMENTAL_SERVICE.get_fundamentals(&symbol).await;
    
    // Detect if this is an ETF based on common ETF suffixes and known ETFs
    let is_etf = is_etf_symbol(&symbol);
    let is_bond_etf = is_bond_etf_symbol(&symbol);
    
    let asset_type = if is_etf { "etf" } else { "stock" };
    
    let mut result = serde_json::json!({
        "symbol": symbol,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "assetType": asset_type,
    });
    
    // Add current price
    if let Ok(price) = price_result {
        result["currentPrice"] = serde_json::json!(price);
    }
    
    // Add comprehensive quant metrics
    if let Ok(metrics) = quant_result {
        let volatility = metrics.volatility;
        let annualized_return = metrics.annualized_return;
        let max_drawdown = metrics.max_drawdown;
        let sharpe = metrics.sharpe_ratio;
        let rsi = metrics.rsi;
        
        result["quantMetrics"] = serde_json::json!({
            "sharpeRatio": sharpe,
            "sortinoRatio": metrics.sortino_ratio.unwrap_or(sharpe * 1.2),
            "annualizedReturn": annualized_return,
            "volatility": volatility,
            "maxDrawdown": max_drawdown,
            "rsi": rsi,
            "signal": metrics.signal,
            "confidence": metrics.confidence,
            "beta": metrics.beta.unwrap_or(1.0),
            "alpha": metrics.alpha.unwrap_or(annualized_return - 10.0),
            "var95": metrics.var_95.unwrap_or(volatility * 1.65 / 100.0 * 10000.0),
            "cvar95": volatility * 2.06 / 100.0 * 10000.0, // CVaR approximation
            "calmarRatio": metrics.calmar_ratio.unwrap_or_else(|| {
                if max_drawdown.abs() > 0.01 { annualized_return / max_drawdown.abs() } else { 0.0 }
            }),
            "informationRatio": sharpe * 0.8,
            "treynorRatio": annualized_return / metrics.beta.unwrap_or(1.0).max(0.01),
            // Technical indicators
            "rsiSignal": if rsi < 30.0 { "oversold" } else if rsi > 70.0 { "overbought" } else { "neutral" },
            "trendStrength": if rsi > 50.0 { "bullish" } else { "bearish" },
            "momentumScore": ((rsi - 50.0) / 50.0 * 100.0).round(),
        });
        
        // Calculate factor scores based on real fundamentals when available
        let (_value_score, _quality_score, _growth_score, fundamentals_json) =
            if let Ok(ref fund) = fundamentals_result {
                // Calculate Value Score (based on P/E, P/B, P/S, EV/EBITDA)
                let mut v_score: f64 = 50.0;
                if let Some(pe) = fund.pe_ratio {
                    v_score += if pe < 15.0 { 20.0 } else if pe < 25.0 { 10.0 } else if pe > 40.0 { -15.0 } else { 0.0 };
                }
                if let Some(pb) = fund.price_to_book {
                    v_score += if pb < 1.5 { 10.0 } else if pb < 3.0 { 5.0 } else if pb > 5.0 { -10.0 } else { 0.0 };
                }
                if let Some(ps) = fund.price_to_sales {
                    v_score += if ps < 2.0 { 10.0 } else if ps < 5.0 { 5.0 } else if ps > 10.0 { -10.0 } else { 0.0 };
                }
                
                // Calculate Quality Score (based on ROE, ROA, profit margin, debt/equity)
                let mut q_score: f64 = 50.0;
                if let Some(roe) = fund.return_on_equity {
                    q_score += if roe > 0.20 { 20.0 } else if roe > 0.15 { 15.0 } else if roe > 0.10 { 10.0 } else if roe < 0.0 { -15.0 } else { 0.0 };
                }
                if let Some(margin) = fund.profit_margin {
                    q_score += if margin > 0.20 { 15.0 } else if margin > 0.10 { 10.0 } else if margin < 0.0 { -15.0 } else { 0.0 };
                }
                if let Some(de) = fund.debt_to_equity {
                    q_score += if de < 0.5 { 10.0 } else if de < 1.0 { 5.0 } else if de > 2.0 { -15.0 } else { 0.0 };
                }
                
                // Calculate Growth Score (based on revenue growth, earnings growth)
                let mut g_score: f64 = 50.0;
                if let Some(rev_growth) = fund.revenue_growth_yoy {
                    g_score += if rev_growth > 0.20 { 25.0 } else if rev_growth > 0.10 { 15.0 } else if rev_growth > 0.05 { 10.0 } else if rev_growth < 0.0 { -15.0 } else { 0.0 };
                }
                if let Some(earn_growth) = fund.earnings_growth_yoy {
                    g_score += if earn_growth > 0.20 { 20.0 } else if earn_growth > 0.10 { 10.0 } else if earn_growth < 0.0 { -10.0 } else { 0.0 };
                }
                
                // Calculate advanced metrics
                // Altman Z-Score estimate (simplified for data available)
                let altman_z = calculate_altman_z_estimate(&fund);
                
                // Piotroski F-Score estimate
                let piotroski_f = calculate_piotroski_estimate(&fund);
                
                // Calculate intrinsic value metrics
                let price = price_result.clone().unwrap_or(100.0);
                let graham_number = calculate_graham_number(&fund);
                let margin_of_safety = if let Some(gn) = graham_number {
                    if gn > 0.0 { Some(((gn - price) / gn) * 100.0) } else { None }
                } else { None };
                
                // Dividend safety assessment
                let dividend_safety = assess_dividend_safety(&fund);
                
                let fundamentals = serde_json::json!({
                    // Basic valuation
                    "peRatio": fund.pe_ratio,
                    "forwardPE": fund.forward_pe,
                    "pegRatio": fund.peg_ratio,
                    "priceToBook": fund.price_to_book,
                    "priceToSales": fund.price_to_sales,
                    "evToEbitda": fund.ev_to_ebitda,
                    
                    // Profitability
                    "profitMargin": fund.profit_margin,
                    "operatingMargin": fund.operating_margin,
                    "returnOnAssets": fund.return_on_assets,
                    "returnOnEquity": fund.return_on_equity,
                    
                    // Growth
                    "revenueGrowthYoY": fund.revenue_growth_yoy,
                    "earningsGrowthYoY": fund.earnings_growth_yoy,
                    
                    // Financial Health
                    "debtToEquity": fund.debt_to_equity,
                    "currentRatio": fund.current_ratio,
                    "quickRatio": fund.quick_ratio,
                    "freeCashFlow": fund.free_cash_flow,
                    
                    // Dividend
                    "dividendYield": fund.dividend_yield,
                    "payoutRatio": fund.payout_ratio,
                    "dividendSafety": dividend_safety,
                    
                    // Company info
                    "marketCap": fund.market_cap,
                    "eps": fund.eps,
                    "beta": fund.beta.or(metrics.beta).unwrap_or(1.0),
                    "companyName": fund.company_name,
                    "sector": fund.sector,
                    "industry": fund.industry,
                    "fiftyTwoWeekHigh": fund.fifty_two_week_high,
                    "fiftyTwoWeekLow": fund.fifty_two_week_low,
                    
                    // Advanced metrics
                    "altmanZScore": altman_z,
                    "piotroskiFScore": piotroski_f,
                    "grahamNumber": graham_number,
                    "marginOfSafety": margin_of_safety,
                    
                    // Factor scores
                    "valueScore": v_score.max(0.0).min(100.0),
                    "qualityScore": q_score.max(0.0).min(100.0),
                    "growthScore": g_score.max(0.0).min(100.0),
                    
                    // Data quality
                    "dataSource": fund.source,
                    "lastUpdated": fund.last_updated,
                });
                
                (v_score.max(0.0).min(100.0), q_score.max(0.0).min(100.0), g_score.max(0.0).min(100.0), fundamentals)
            } else {
                // Fallback to quant-based estimates when fundamentals unavailable
                let v_score = 50.0 + (sharpe * 10.0).min(30.0).max(-30.0);
                let q_score = 50.0 + (annualized_return / 2.0).min(30.0).max(-30.0);
                let g_score = 50.0 + (annualized_return / 3.0).min(25.0).max(-25.0);
                
                let fundamentals = serde_json::json!({
                    "peRatio": null,
                    "forwardPE": null,
                    "pegRatio": null,
                    "priceToBook": null,
                    "priceToSales": null,
                    "evToEbitda": null,
                    "profitMargin": null,
                    "operatingMargin": null,
                    "returnOnAssets": null,
                    "returnOnEquity": null,
                    "revenueGrowthYoY": null,
                    "earningsGrowthYoY": null,
                    "debtToEquity": null,
                    "currentRatio": null,
                    "quickRatio": null,
                    "freeCashFlow": null,
                    "dividendYield": null,
                    "payoutRatio": null,
                    "dividendSafety": null,
                    "marketCap": 0,
                    "eps": null,
                    "beta": metrics.beta.unwrap_or(1.0),
                    "companyName": null,
                    "sector": null,
                    "industry": null,
                    "fiftyTwoWeekHigh": null,
                    "fiftyTwoWeekLow": null,
                    "altmanZScore": null,
                    "piotroskiFScore": null,
                    "grahamNumber": null,
                    "marginOfSafety": null,
                    "valueScore": v_score.max(0.0).min(100.0),
                    "qualityScore": q_score.max(0.0).min(100.0),
                    "growthScore": g_score.max(0.0).min(100.0),
                    "dataSource": "estimated",
                    "lastUpdated": chrono::Utc::now().to_rfc3339(),
                });
                
                (v_score.max(0.0).min(100.0), q_score.max(0.0).min(100.0), g_score.max(0.0).min(100.0), fundamentals)
            };
        
        result["fundamentals"] = fundamentals_json;
        
        // Add ETF-specific fundamentals for ETFs
        if is_etf {
            let (category, strategy, index_tracked) = get_etf_info(&symbol, is_bond_etf);
            
            // Estimate distribution yield based on asset type
            let dist_yield = if is_bond_etf {
                Some(4.0 + (rsi - 50.0) / 25.0) // Bond ETFs: ~3-5% yield
            } else {
                Some(1.5 + (rsi - 50.0) / 50.0) // Equity ETFs: ~1-2% yield
            };
            
            result["etfFundamentals"] = serde_json::json!({
                "aum": null,
                "expenseRatio": get_estimated_expense_ratio(&symbol),
                "inceptionDate": null,
                "indexTracked": index_tracked,
                "numberOfHoldings": null,
                "topHoldings": null,
                "category": category,
                "strategy": strategy,
                "distributionYield": dist_yield,
                "avgDailyVolume": null,
                "bidAskSpread": null,
                "premiumDiscount": null,
            });
        }
        
        // Generate estimated sentiment based on RSI and signal
        let sentiment_score: f64 = (rsi - 50.0) / 50.0;
        let overall_sentiment = if sentiment_score > 0.3 { "bullish" } 
                               else if sentiment_score < -0.3 { "bearish" } 
                               else { "neutral" };
        
        result["sentiment"] = serde_json::json!({
            "overallSentiment": overall_sentiment,
            "sentimentScore": sentiment_score,
            "newsCount": 0,
            "buzzScore": 0.0,
            "sentimentTrend": if rsi > 50.0 { "improving" } else { "declining" },
        });
        
        // Generate estimated analyst data
        let consensus = if sharpe > 1.0 && annualized_return > 10.0 { "Buy" }
                       else if sharpe < 0.0 || annualized_return < -5.0 { "Sell" }
                       else { "Hold" };
        
        result["analystData"] = serde_json::json!({
            "consensusRating": consensus,
            "targetPriceMean": null,
            "targetPriceHigh": null,
            "targetPriceLow": null,
            "numberOfAnalysts": 0,
            "upside": null,
        });
    }
    
    Ok(result)
}

/// Check if a symbol is an ETF
fn is_etf_symbol(symbol: &str) -> bool {
    let symbol_upper = symbol.to_uppercase();
    
    // Common ETF patterns and known ETFs
    let etf_patterns = [
        // Bond ETFs
        "BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "VCIT", "VCSH",
        "BNDX", "VGIT", "VGLT", "SCHO", "SCHZ", "IGSB", "IGLB", "EMB", "BWX",
        "TIP", "STIP", "SCHP", "VTIP", "MUB", "SUB", "CMF", "PZA", "HYMB",
        // Equity ETFs
        "SPY", "IVV", "VOO", "VTI", "QQQ", "DIA", "IWM", "VGT", "XLK", "XLF",
        "XLE", "XLV", "XLP", "XLY", "XLI", "XLB", "XLU", "XLRE", "VNQ", "IYR",
        "VEA", "VWO", "EFA", "EEM", "IEFA", "IEMG", "SCHF", "SCHB", "SCHA",
        "VIG", "VYM", "SCHD", "DVY", "HDV", "SDY", "VTV", "VUG", "IJH", "IJR",
        "IWF", "IWD", "IWN", "IWO", "IWP", "IWS", "MDY", "RSP", "MTUM", "QUAL",
        "USMV", "EFAV", "EEMV", "NOBL", "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ",
        // Commodity ETFs
        "GLD", "IAU", "SLV", "USO", "DBC", "PDBC", "GSG", "GLDM",
    ];
    
    etf_patterns.iter().any(|p| symbol_upper == *p) ||
    symbol_upper.ends_with("ETF") ||
    symbol_upper.contains("BOND") ||
    symbol_upper.contains("TREASURY")
}

/// Check if a symbol is a bond ETF
fn is_bond_etf_symbol(symbol: &str) -> bool {
    let symbol_upper = symbol.to_uppercase();
    
    let bond_etfs = [
        "BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "VCIT", "VCSH",
        "BNDX", "VGIT", "VGLT", "SCHO", "SCHZ", "IGSB", "IGLB", "EMB", "BWX",
        "TIP", "STIP", "SCHP", "VTIP", "MUB", "SUB", "CMF", "PZA", "HYMB",
        "GOVT", "SPTL", "SPTS", "SPAB", "SPLB", "SPIB", "BIV", "BSV", "BLV",
    ];
    
    bond_etfs.iter().any(|p| symbol_upper == *p) ||
    symbol_upper.contains("BOND") ||
    symbol_upper.contains("TREASURY")
}

/// Get ETF category, strategy, and index tracked
fn get_etf_info(symbol: &str, is_bond: bool) -> (String, String, Option<String>) {
    let symbol_upper = symbol.to_uppercase();
    
    if is_bond {
        let category = if symbol_upper.contains("TIP") || symbol_upper == "SCHP" || symbol_upper == "VTIP" {
            "Inflation-Protected Bonds"
        } else if symbol_upper == "TLT" || symbol_upper == "VGLT" || symbol_upper == "SPTL" {
            "Long-Term Treasury"
        } else if symbol_upper == "IEF" || symbol_upper == "VGIT" {
            "Intermediate-Term Treasury"
        } else if symbol_upper == "SHY" || symbol_upper == "SCHO" || symbol_upper == "SPTS" {
            "Short-Term Treasury"
        } else if symbol_upper == "LQD" || symbol_upper == "VCIT" || symbol_upper == "IGLB" {
            "Investment Grade Corporate"
        } else if symbol_upper == "HYG" || symbol_upper == "JNK" || symbol_upper == "HYMB" {
            "High Yield"
        } else if symbol_upper == "BNDX" || symbol_upper == "BWX" || symbol_upper == "EMB" {
            "International Bond"
        } else if symbol_upper == "MUB" || symbol_upper == "SUB" || symbol_upper == "CMF" {
            "Municipal Bond"
        } else {
            "Total Bond Market"
        };
        
        return (category.to_string(), "Passive Index".to_string(), Some("Bond Aggregate Index".to_string()));
    }
    
    // Equity ETF categories
    let (category, index) = if symbol_upper == "SPY" || symbol_upper == "IVV" || symbol_upper == "VOO" {
        ("U.S. Large Cap", Some("S&P 500"))
    } else if symbol_upper == "QQQ" {
        ("U.S. Large Cap Growth", Some("NASDAQ-100"))
    } else if symbol_upper == "VTI" || symbol_upper == "SCHB" || symbol_upper == "ITOT" {
        ("U.S. Total Market", Some("CRSP US Total Market Index"))
    } else if symbol_upper == "IWM" || symbol_upper == "IJR" || symbol_upper == "SCHA" {
        ("U.S. Small Cap", Some("Russell 2000"))
    } else if symbol_upper == "VEA" || symbol_upper == "EFA" || symbol_upper == "SCHF" || symbol_upper == "IEFA" {
        ("International Developed", Some("MSCI EAFE"))
    } else if symbol_upper == "VWO" || symbol_upper == "EEM" || symbol_upper == "IEMG" {
        ("Emerging Markets", Some("MSCI Emerging Markets"))
    } else if symbol_upper.starts_with("XL") {
        ("U.S. Sector", None)
    } else if symbol_upper.starts_with("ARK") {
        ("Thematic Growth", None)
    } else if symbol_upper == "GLD" || symbol_upper == "IAU" || symbol_upper == "SLV" {
        ("Precious Metals", None)
    } else {
        ("Diversified", None)
    };
    
    (category.to_string(), "Passive Index".to_string(), index.map(|s| s.to_string()))
}

/// Get estimated expense ratio for an ETF
fn get_estimated_expense_ratio(symbol: &str) -> Option<f64> {
    let symbol_upper = symbol.to_uppercase();
    
    // Low-cost providers (Vanguard, Schwab, Fidelity)
    if symbol_upper.starts_with("V") || symbol_upper.starts_with("SCH") || symbol_upper.starts_with("FI") {
        Some(0.03)
    }
    // iShares core ETFs
    else if symbol_upper == "IVV" || symbol_upper == "IEFA" || symbol_upper == "IEMG" || symbol_upper == "AGG" {
        Some(0.03)
    }
    // Standard ETFs
    else if symbol_upper == "SPY" || symbol_upper == "QQQ" || symbol_upper == "DIA" {
        Some(0.09)
    }
    // Sector ETFs
    else if symbol_upper.starts_with("XL") {
        Some(0.09)
    }
    // ARK ETFs
    else if symbol_upper.starts_with("ARK") {
        Some(0.75)
    }
    // Bond ETFs
    else if symbol_upper == "BND" || symbol_upper == "AGG" || symbol_upper == "BNDX" {
        Some(0.03)
    }
    else {
        Some(0.20) // Default moderate expense ratio
    }
}

// ==================== FUNDAMENTAL ANALYSIS HELPERS ====================

/// Calculate Altman Z-Score estimate (simplified version)
/// Z-Score > 3.0: Safe zone
/// Z-Score 1.8-3.0: Grey zone  
/// Z-Score < 1.8: Distress zone
fn calculate_altman_z_estimate(fund: &FundamentalMetrics) -> Option<f64> {
    // Simplified Z-Score calculation using available metrics
    // Original formula: Z = 1.2×A + 1.4×B + 3.3×C + 0.6×D + 1.0×E
    // A = Working Capital/Total Assets (approximated from current ratio)
    // B = Retained Earnings/Total Assets (approximated from ROA)
    // C = EBIT/Total Assets (approximated from operating margin)
    // D = Market Value of Equity/Total Liabilities (approximated from D/E ratio)
    // E = Sales/Total Assets (approximated)
    
    let mut score: f64 = 0.0;
    let mut components = 0;
    
    // A: Working Capital/Total Assets (estimate from current ratio)
    if let Some(current_ratio) = fund.current_ratio {
        // If current ratio > 1, we have positive working capital
        let a = (current_ratio - 1.0).max(0.0).min(0.5) / 2.0; // Normalize to 0-0.25
        score += 1.2 * a;
        components += 1;
    }
    
    // B: Profitability indicator from ROA
    if let Some(roa) = fund.return_on_assets {
        let b = roa.max(-0.3).min(0.3); // Cap at ±30%
        score += 1.4 * b;
        components += 1;
    }
    
    // C: Operating efficiency from operating margin
    if let Some(op_margin) = fund.operating_margin {
        let c = op_margin.max(-0.2).min(0.3);
        score += 3.3 * c;
        components += 1;
    }
    
    // D: Leverage indicator (inverse of D/E)
    if let Some(de) = fund.debt_to_equity {
        if de > 0.0 {
            let d = (1.0 / de).min(3.0); // Cap at 3x
            score += 0.6 * d;
            components += 1;
        }
    }
    
    // E: Asset turnover estimate
    if let Some(profit_margin) = fund.profit_margin {
        if let Some(roa) = fund.return_on_assets {
            // Asset turnover ≈ ROA / Profit Margin
            if profit_margin.abs() > 0.01 {
                let e = (roa / profit_margin).max(0.0).min(3.0);
                score += 1.0 * e;
                components += 1;
            }
        }
    }
    
    if components >= 3 {
        // Normalize based on components used (target score ~2.7 for average company)
        let normalized_score = score * (5.0 / components as f64);
        Some(normalized_score.max(0.0).min(5.0))
    } else {
        None
    }
}

/// Calculate Piotroski F-Score estimate (0-9, higher is better)
/// Based on 9 binary signals for financial strength
fn calculate_piotroski_estimate(fund: &FundamentalMetrics) -> Option<i32> {
    let mut score = 0;
    let mut criteria_checked = 0;
    
    // Profitability signals (4 criteria)
    
    // 1. Positive Net Income (use profit margin as proxy)
    if let Some(margin) = fund.profit_margin {
        criteria_checked += 1;
        if margin > 0.0 { score += 1; }
    }
    
    // 2. Positive ROA
    if let Some(roa) = fund.return_on_assets {
        criteria_checked += 1;
        if roa > 0.0 { score += 1; }
    }
    
    // 3. Positive Operating Cash Flow (use FCF as proxy)
    if let Some(fcf) = fund.free_cash_flow {
        criteria_checked += 1;
        if fcf > 0.0 { score += 1; }
    }
    
    // 4. Cash Flow > Net Income (quality of earnings)
    // Assume positive if FCF exists and margin is positive (simplified)
    if fund.free_cash_flow.is_some() && fund.profit_margin.map_or(false, |m| m > 0.0) {
        criteria_checked += 1;
        if fund.free_cash_flow.unwrap_or(0.0) > 0.0 { score += 1; }
    }
    
    // Leverage, Liquidity, Source of Funds (3 criteria)
    
    // 5. Lower Debt/Equity (improvement) - assume pass if D/E < 1
    if let Some(de) = fund.debt_to_equity {
        criteria_checked += 1;
        if de < 1.0 { score += 1; }
    }
    
    // 6. Higher Current Ratio (improvement) - assume pass if > 1.5
    if let Some(cr) = fund.current_ratio {
        criteria_checked += 1;
        if cr > 1.5 { score += 1; }
    }
    
    // 7. No new shares issued (assume pass if profitable)
    if fund.profit_margin.map_or(false, |m| m > 0.05) {
        criteria_checked += 1;
        score += 1;
    }
    
    // Operating Efficiency (2 criteria)
    
    // 8. Higher Gross Margin (use operating margin as proxy)
    if let Some(op_margin) = fund.operating_margin {
        criteria_checked += 1;
        if op_margin > 0.10 { score += 1; }
    }
    
    // 9. Higher Asset Turnover (revenue growth indicates efficiency)
    if let Some(rev_growth) = fund.revenue_growth_yoy {
        criteria_checked += 1;
        if rev_growth > 0.0 { score += 1; }
    }
    
    if criteria_checked >= 5 {
        // Scale to 0-9 based on criteria checked
        let scaled_score = (score as f64 * 9.0 / criteria_checked as f64).round() as i32;
        Some(scaled_score.min(9).max(0))
    } else {
        None
    }
}

/// Calculate Graham Number (intrinsic value estimate)
/// Graham Number = sqrt(22.5 × EPS × Book Value per Share)
fn calculate_graham_number(fund: &FundamentalMetrics) -> Option<f64> {
    let eps = fund.eps?;
    let price_to_book = fund.price_to_book?;
    
    if eps <= 0.0 || price_to_book <= 0.0 {
        return None;
    }
    
    // Estimate book value per share from P/B ratio
    // If we had price, BV = Price / PB
    // For now, we estimate using a reference price
    // Graham Number = sqrt(22.5 × EPS × (EPS × PE / PB))
    
    if let Some(pe) = fund.pe_ratio {
        if pe > 0.0 {
            // Implied price = EPS × PE
            let implied_price = eps * pe;
            // Book value per share = Price / PB
            let book_value = implied_price / price_to_book;
            
            if book_value > 0.0 && eps > 0.0 {
                let graham = (22.5 * eps * book_value).sqrt();
                return Some(graham);
            }
        }
    }
    
    None
}

/// Assess dividend safety based on payout ratio and financial health
fn assess_dividend_safety(fund: &FundamentalMetrics) -> Option<String> {
    // Only relevant if there's a dividend
    let yield_val = fund.dividend_yield.unwrap_or(0.0);
    if yield_val <= 0.0 {
        return None;
    }
    
    // Check payout ratio
    let payout = fund.payout_ratio.unwrap_or(0.5);
    
    // Check cash flow coverage
    let has_good_cashflow = fund.free_cash_flow.map_or(false, |f| f > 0.0);
    
    // Check profitability
    let is_profitable = fund.profit_margin.map_or(false, |m| m > 0.05);
    
    // Check leverage
    let low_debt = fund.debt_to_equity.map_or(true, |d| d < 1.5);
    
    let safety = if payout < 0.4 && has_good_cashflow && is_profitable && low_debt {
        "very_safe"
    } else if payout < 0.6 && (has_good_cashflow || is_profitable) && low_debt {
        "safe"
    } else if payout < 0.8 && is_profitable {
        "moderate"
    } else if payout < 1.0 {
        "at_risk"
    } else {
        "cutting"
    };
    
    Some(safety.to_string())
}

// ==================== HISTORICAL DATA ====================

/// Get historical price data for a symbol
#[tauri::command]
async fn get_historical_prices(symbol: String, days: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let service = ENHANCED_MARKET_SERVICE.lock().await;
    let _days = days.unwrap_or(365);

    match service.get_historical_prices(&symbol).await {
        Ok(prices) => {
            let result: Vec<serde_json::Value> = prices.into_iter()
                .map(|p| serde_json::json!({
                    "date": p.date,
                    "close": p.close,
                    "open": p.open,
                    "high": p.high,
                    "low": p.low,
                    "volume": p.volume,
                }))
                .collect();
            Ok(result)
        }
        Err(e) => Err(format!("Failed to get historical data: {}", e))
    }
}

// ==================== AI / OPENROUTER COMMANDS ====================

/// Chat with AI assistant (proxied through backend)
#[tauri::command]
async fn ai_chat(
    messages: Vec<OpenRouterMessage>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    OPENROUTER_SERVICE.chat(messages, model, temperature, max_tokens).await
}

/// Generate portfolio insight using AI
#[tauri::command]
async fn ai_generate_portfolio_insight(portfolio_data: serde_json::Value) -> Result<String, String> {
    OPENROUTER_SERVICE.generate_portfolio_insight(portfolio_data).await
}

/// Chat with AI assistant (simple conversation)
#[tauri::command]
async fn ai_chat_assistant(
    message: String,
    history: Vec<OpenRouterMessage>,
) -> Result<String, String> {
    OPENROUTER_SERVICE.chat_with_assistant(message, history).await
}

/// Check if AI service is configured
#[tauri::command]
fn ai_is_configured() -> bool {
    OPENROUTER_SERVICE.is_configured()
}

// ==================== ALPACA TRADING COMMANDS ====================

/// Get Alpaca account info (proxied through backend)
#[tauri::command]
async fn alpaca_get_account() -> Result<serde_json::Value, String> {
    let account = ALPACA_SERVICE.get_account().await?;
    serde_json::to_value(account).map_err(|e| e.to_string())
}

/// Get Alpaca positions (proxied through backend)
#[tauri::command]
async fn alpaca_get_positions() -> Result<serde_json::Value, String> {
    let positions = ALPACA_SERVICE.get_positions().await?;
    serde_json::to_value(positions).map_err(|e| e.to_string())
}

/// Get Alpaca orders (proxied through backend)
#[tauri::command]
async fn alpaca_get_orders(status: Option<String>) -> Result<serde_json::Value, String> {
    let orders = ALPACA_SERVICE.get_orders(status.as_deref()).await?;
    serde_json::to_value(orders).map_err(|e| e.to_string())
}

/// Get Alpaca trading mode info
#[tauri::command]
fn alpaca_get_trading_mode() -> serde_json::Value {
    ALPACA_SERVICE.get_trading_mode()
}

/// Check if Alpaca is configured
#[tauri::command]
fn alpaca_is_configured() -> bool {
    ALPACA_SERVICE.is_configured()
}

// ==================== FUNDAMENTAL DATA COMMANDS ====================

/// Get fundamental metrics for a symbol (proxied through backend)
#[tauri::command]
async fn get_fundamentals(symbol: String) -> Result<serde_json::Value, String> {
    let data = FUNDAMENTAL_SERVICE.get_fundamentals(&symbol).await?;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

/// Get fundamental metrics for multiple symbols
#[tauri::command]
async fn get_fundamentals_batch(symbols: Vec<String>) -> Result<serde_json::Value, String> {
    let data = FUNDAMENTAL_SERVICE.get_batch_fundamentals(symbols).await;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

/// Clear fundamental data cache
#[tauri::command]
async fn clear_fundamentals_cache() -> Result<(), String> {
    FUNDAMENTAL_SERVICE.clear_cache().await;
    Ok(())
}


const API_KEYS_STORE: &str = "api-keys.json";
const API_KEY_NAMES: &[&str] = &[
    "alpaca_key", "alpaca_secret", "finnhub_key", "fmp_key",
    "tiingo_key", "twelve_data_key", "polygon_key", "alpha_vantage_key", "openrouter_key",
];

#[tauri::command]
async fn get_api_key_statuses(app: tauri::AppHandle) -> Result<std::collections::HashMap<String, bool>, String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    let statuses = API_KEY_NAMES
        .iter()
        .map(|&key| {
            let is_set = store
                .get(key)
                .map(|v| matches!(v, serde_json::Value::String(s) if !s.is_empty()))
                .unwrap_or(false);
            (key.to_string(), is_set)
        })
        .collect();
    Ok(statuses)
}

#[tauri::command]
async fn save_api_keys(
    app: tauri::AppHandle,
    keys: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    for (key, value) in &keys {
        if !value.is_empty() {
            store.set(key.clone(), serde_json::Value::String(value.clone()));
        }
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn send_price_alert_notification(
    app: tauri::AppHandle,
    symbol: String,
    message: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(format!("FlowFolio Alert: {symbol}"))
        .body(message)
        .show()
        .map_err(|e| e.to_string())
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
        eprintln!("[INFO] [app]   - Live progress streaming");
    }
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
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
            generate_optimization_report,
            generate_optimization_report_live,
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
            get_dashboard_data,
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
            // Portfolio Management (Vibe Studio)
            save_generated_portfolio,
            load_generated_portfolio,
            list_saved_portfolios,
            delete_saved_portfolio,
            get_detailed_ticker_analysis,
            // Historical Data
            get_historical_prices,
            // Database status
            get_database_status,
            // AI / OpenRouter (backend-proxied)
            ai_chat,
            ai_generate_portfolio_insight,
            ai_chat_assistant,
            ai_is_configured,
            // Alpaca Trading (backend-proxied)
            alpaca_get_account,
            alpaca_get_positions,
            alpaca_get_orders,
            alpaca_get_trading_mode,
            alpaca_is_configured,
            // Fundamental Data (backend-proxied)
            get_fundamentals,
            get_fundamentals_batch,
            clear_fundamentals_cache,

            get_api_key_statuses,
            save_api_keys,
            // Price alert desktop notifications
            send_price_alert_notification,
        ])
        .setup(|app| {
            // Initialize local database for caching
            let app_handle = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                // Get the app data directory (relative local directory)
                let data_dir = app_handle.path().app_data_dir()
                    .unwrap_or_else(|_| {
                        // Fallback to current directory if app data dir not available
                        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                    })
                    .join("data");
                
                eprintln!("[INFO] [app] Using data directory: {}", data_dir.display());
                
                match init_local_database(data_dir).await {
                    Ok(pool) => {
                        init_market_service_with_db(pool).await;
                        eprintln!("[INFO] [app] ✅ Local database caching enabled");
                    }
                    Err(e) => {
                        eprintln!("[WARN] [app] ⚠️ Failed to initialize database cache: {}", e);
                        eprintln!("[WARN] [app] Continuing with in-memory cache only");
                    }
                }


            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Get database initialization status
#[tauri::command]
fn get_database_status() -> serde_json::Value {
    let initialized = DB_INITIALIZED.load(std::sync::atomic::Ordering::SeqCst);
    serde_json::json!({
        "initialized": initialized,
        "cache_type": if initialized { "sqlite" } else { "memory" }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== Helper builders =====

    fn make_quant_metrics(sharpe: f64, annual_return: f64, volatility: f64, max_dd: f64, rsi: f64, signal: &str) -> QuantMetrics {
        QuantMetrics {
            symbol: "TEST".to_string(),
            sharpe_ratio: sharpe,
            annualized_return: annual_return,
            volatility,
            max_drawdown: max_dd,
            rsi,
            signal: signal.to_string(),
            confidence: 75.0,
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            omega_ratio: None,
            tail_ratio: None,
            skewness: None,
            kurtosis: None,
            ulcer_index: None,
            gain_to_loss_ratio: None,
            win_rate: None,
            daily_returns: None,
        }
    }

    fn make_fund(
        profit_margin: Option<f64>,
        roa: Option<f64>,
        fcf: Option<f64>,
        de: Option<f64>,
        current_ratio: Option<f64>,
        op_margin: Option<f64>,
        rev_growth: Option<f64>,
        eps: Option<f64>,
        pb: Option<f64>,
        pe: Option<f64>,
        div_yield: Option<f64>,
        payout: Option<f64>,
    ) -> FundamentalMetrics {
        FundamentalMetrics {
            symbol: "TEST".to_string(),
            company_name: "Test Co".to_string(),
            sector: "Technology".to_string(),
            industry: "Software".to_string(),
            market_cap: 1_000_000_000.0,
            pe_ratio: pe,
            forward_pe: None,
            peg_ratio: None,
            price_to_book: pb,
            price_to_sales: None,
            ev_to_ebitda: None,
            profit_margin,
            operating_margin: op_margin,
            return_on_assets: roa,
            return_on_equity: None,
            revenue_growth_yoy: rev_growth,
            earnings_growth_yoy: None,
            debt_to_equity: de,
            current_ratio,
            quick_ratio: None,
            free_cash_flow: fcf,
            dividend_yield: div_yield,
            payout_ratio: payout,
            eps,
            beta: None,
            fifty_two_week_high: None,
            fifty_two_week_low: None,
            source: "test".to_string(),
            last_updated: "2024-01-01".to_string(),
        }
    }

    // ===== momentum_score_from_rsi tests =====

    #[test]
    fn test_momentum_rsi_oversold() {
        let score = momentum_score_from_rsi(20.0, "BUY");
        // rsi < 30: 80 + (30 - 20) = 90, signal BUY +10 = 100, capped at 100
        assert!((score - 100.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_rsi_overbought() {
        let score = momentum_score_from_rsi(80.0, "SELL");
        // rsi > 70: 50 - (80 - 70) = 40, signal SELL -10 = 30
        assert!((score - 30.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_rsi_neutral_hold() {
        let score = momentum_score_from_rsi(50.0, "HOLD");
        // rsi in neutral: 50 + |50-50| * 0.5 = 50, signal HOLD +0
        assert!((score - 50.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_strong_buy_signal() {
        let score = momentum_score_from_rsi(50.0, "STRONG BUY");
        // neutral rsi = 50, STRONG BUY +15 = 65
        assert!((score - 65.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_strong_sell_clamps_to_zero() {
        // RSI=75 (overbought): 50 - 5 = 45, STRONG SELL -15 = 30
        let score = momentum_score_from_rsi(75.0, "STRONG SELL");
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    #[test]
    fn test_momentum_unknown_signal() {
        let score = momentum_score_from_rsi(50.0, "UNKNOWN");
        // No adjustment for unknown signal
        assert!((score - 50.0).abs() < 1.0);
    }

    // ===== quality_score_from_sharpe tests =====

    #[test]
    fn test_quality_high_sharpe_low_vol() {
        let score = quality_score_from_sharpe(2.5, 10.0);
        // sharpe > 2: 90, vol < 15: +10 = 100
        assert!((score - 100.0).abs() < 1.0);
    }

    #[test]
    fn test_quality_negative_sharpe_high_vol() {
        let score = quality_score_from_sharpe(-1.0, 50.0);
        // sharpe < 0: (50 + (-1)*10).max(0) = 40, vol > 40: -10 = 30
        assert!((score - 30.0).abs() < 1.0);
    }

    #[test]
    fn test_quality_clamped_to_0_100() {
        let score = quality_score_from_sharpe(-10.0, 100.0);
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    #[test]
    fn test_quality_moderate_sharpe() {
        let score = quality_score_from_sharpe(1.2, 20.0);
        // sharpe > 1: 70, vol 15-25: +5 = 75
        assert!((score - 75.0).abs() < 1.0);
    }

    // ===== value_score_from_vol tests =====

    #[test]
    fn test_value_low_vol_low_dd() {
        let score = value_score_from_vol(10.0, 5.0);
        // vol < 15: 85, dd < 10: +10 = 95
        assert!((score - 95.0).abs() < 1.0);
    }

    #[test]
    fn test_value_high_vol_high_dd() {
        let score = value_score_from_vol(60.0, 40.0);
        // vol > 50: 25, dd > 30: -20 = 5
        assert!((score - 5.0).abs() < 1.0);
    }

    #[test]
    fn test_value_clamped() {
        let score = value_score_from_vol(100.0, 100.0);
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    // ===== growth_score_from_return tests =====

    #[test]
    fn test_growth_high_return() {
        assert!((growth_score_from_return(35.0) - 95.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_moderate_return() {
        assert!((growth_score_from_return(15.0) - 70.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_negative_return() {
        assert!((growth_score_from_return(-15.0) - 20.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_zero_return() {
        let score = growth_score_from_return(0.0);
        // 0 is not > 0, not > -10, so 20
        // Actually 0 fails `r > 0.0`, falls to `r > -10.0` → 35
        assert!((score - 35.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_small_positive() {
        let score = growth_score_from_return(3.0);
        // > 0.0 → 50
        assert!((score - 50.0).abs() < 1.0);
    }

    // ===== calculate_quick_score tests =====

    #[test]
    fn test_quick_score_strong_buy_good_metrics() {
        let m = make_quant_metrics(2.0, 25.0, 20.0, 15.0, 60.0, "STRONG BUY");
        let score = calculate_quick_score(&m);
        assert!(score > 50.0, "Expected score > 50, got {}", score);
    }

    #[test]
    fn test_quick_score_bad_metrics() {
        let m = make_quant_metrics(-1.0, 0.0, 80.0, 60.0, 50.0, "SELL");
        let score = calculate_quick_score(&m);
        assert!(score >= 0.0);
    }

    #[test]
    fn test_quick_score_hold_signal() {
        let m = make_quant_metrics(1.0, 10.0, 25.0, 20.0, 50.0, "HOLD");
        let score = calculate_quick_score(&m);
        // sharpe*15=15 capped at 30 → 15, return*0.5=5, (50-25)*0.3=7.5, (40-20)*0.375=7.5, HOLD=5 → 40
        assert!(score > 0.0);
    }

    // ===== is_etf_symbol tests =====

    #[test]
    fn test_is_etf_spy() {
        assert!(is_etf_symbol("SPY"));
    }

    #[test]
    fn test_is_etf_qqq() {
        assert!(is_etf_symbol("QQQ"));
    }

    #[test]
    fn test_is_etf_not_stock() {
        assert!(!is_etf_symbol("AAPL"));
    }

    #[test]
    fn test_is_etf_suffix() {
        assert!(is_etf_symbol("MYETF"));
    }

    #[test]
    fn test_is_etf_treasury_keyword() {
        assert!(is_etf_symbol("US_TREASURY_FUND"));
    }

    #[test]
    fn test_is_etf_case_insensitive() {
        assert!(is_etf_symbol("spy"));
    }

    // ===== is_bond_etf_symbol tests =====

    #[test]
    fn test_is_bond_etf_bnd() {
        assert!(is_bond_etf_symbol("BND"));
    }

    #[test]
    fn test_is_bond_etf_tlt() {
        assert!(is_bond_etf_symbol("TLT"));
    }

    #[test]
    fn test_is_bond_etf_not_equity() {
        assert!(!is_bond_etf_symbol("SPY"));
    }

    #[test]
    fn test_is_bond_etf_bond_keyword() {
        assert!(is_bond_etf_symbol("MYBONDFUND"));
    }

    // ===== get_etf_info tests =====

    #[test]
    fn test_get_etf_info_spy() {
        let (cat, strategy, index) = get_etf_info("SPY", false);
        assert_eq!(cat, "U.S. Large Cap");
        assert_eq!(strategy, "Passive Index");
        assert_eq!(index.as_deref(), Some("S&P 500"));
    }

    #[test]
    fn test_get_etf_info_tlt_bond() {
        let (cat, strategy, _) = get_etf_info("TLT", true);
        assert_eq!(cat, "Long-Term Treasury");
        assert_eq!(strategy, "Passive Index");
    }

    #[test]
    fn test_get_etf_info_qqq() {
        let (cat, _, index) = get_etf_info("QQQ", false);
        assert_eq!(cat, "U.S. Large Cap Growth");
        assert_eq!(index.as_deref(), Some("NASDAQ-100"));
    }

    #[test]
    fn test_get_etf_info_sector_xl() {
        let (cat, _, _) = get_etf_info("XLK", false);
        assert_eq!(cat, "U.S. Sector");
    }

    #[test]
    fn test_get_etf_info_ark() {
        let (cat, _, _) = get_etf_info("ARKK", false);
        assert_eq!(cat, "Thematic Growth");
    }

    // ===== get_estimated_expense_ratio tests =====

    #[test]
    fn test_expense_ratio_vanguard() {
        let er = get_estimated_expense_ratio("VOO");
        assert_eq!(er, Some(0.03));
    }

    #[test]
    fn test_expense_ratio_spy() {
        let er = get_estimated_expense_ratio("SPY");
        assert_eq!(er, Some(0.09));
    }

    #[test]
    fn test_expense_ratio_ark() {
        let er = get_estimated_expense_ratio("ARKK");
        assert_eq!(er, Some(0.75));
    }

    #[test]
    fn test_expense_ratio_sector() {
        let er = get_estimated_expense_ratio("XLK");
        assert_eq!(er, Some(0.09));
    }

    #[test]
    fn test_expense_ratio_default() {
        let er = get_estimated_expense_ratio("SOMEUNKNOWN");
        assert_eq!(er, Some(0.20));
    }

    // ===== calculate_altman_z_estimate tests =====

    #[test]
    fn test_altman_z_insufficient_components() {
        // Only 1 field provided → None
        let fund = make_fund(None, Some(0.1), None, None, None, None, None, None, None, None, None, None);
        assert!(calculate_altman_z_estimate(&fund).is_none());
    }

    #[test]
    fn test_altman_z_enough_components() {
        let fund = make_fund(Some(0.15), Some(0.10), None, Some(0.5), Some(2.0), Some(0.20), None, None, None, None, None, None);
        let z = calculate_altman_z_estimate(&fund);
        assert!(z.is_some());
        let val = z.unwrap();
        assert!(val >= 0.0 && val <= 5.0);
    }

    #[test]
    fn test_altman_z_safe_zone() {
        // Strong financials
        let fund = make_fund(Some(0.20), Some(0.15), None, Some(0.3), Some(2.5), Some(0.25), None, None, None, None, None, None);
        let z = calculate_altman_z_estimate(&fund);
        assert!(z.is_some());
    }

    // ===== calculate_piotroski_estimate tests =====

    #[test]
    fn test_piotroski_insufficient_criteria() {
        // Only 2 criteria — None
        let fund = make_fund(Some(0.1), None, None, None, None, None, None, None, None, None, None, None);
        assert!(calculate_piotroski_estimate(&fund).is_none());
    }

    #[test]
    fn test_piotroski_strong_company() {
        let fund = make_fund(Some(0.15), Some(0.10), Some(1_000_000.0), Some(0.5), Some(2.0), Some(0.15), Some(0.10), None, None, None, None, None);
        let score = calculate_piotroski_estimate(&fund);
        assert!(score.is_some());
        let val = score.unwrap();
        assert!(val >= 0 && val <= 9);
    }

    #[test]
    fn test_piotroski_weak_company() {
        let fund = make_fund(Some(-0.10), Some(-0.05), Some(-500_000.0), Some(3.0), Some(0.8), Some(-0.05), Some(-0.10), None, None, None, None, None);
        let score = calculate_piotroski_estimate(&fund);
        assert!(score.is_some());
        let val = score.unwrap();
        assert!(val >= 0 && val <= 9);
    }

    // ===== calculate_graham_number tests =====

    #[test]
    fn test_graham_number_no_eps() {
        let fund = make_fund(None, None, None, None, None, None, None, None, Some(2.0), Some(20.0), None, None);
        assert!(calculate_graham_number(&fund).is_none());
    }

    #[test]
    fn test_graham_number_negative_eps() {
        let fund = make_fund(None, None, None, None, None, None, None, Some(-1.0), Some(2.0), Some(20.0), None, None);
        assert!(calculate_graham_number(&fund).is_none());
    }

    #[test]
    fn test_graham_number_valid() {
        // EPS=5, P/B=2, P/E=20 → price=100, book=50, graham = sqrt(22.5*5*50) = sqrt(5625) = 75
        let fund = make_fund(None, None, None, None, None, None, None, Some(5.0), Some(2.0), Some(20.0), None, None);
        let g = calculate_graham_number(&fund);
        assert!(g.is_some());
        assert!((g.unwrap() - 75.0).abs() < 1.0);
    }

    #[test]
    fn test_graham_number_no_pe() {
        let fund = make_fund(None, None, None, None, None, None, None, Some(5.0), Some(2.0), None, None, None);
        assert!(calculate_graham_number(&fund).is_none());
    }

    // ===== assess_dividend_safety tests =====

    #[test]
    fn test_dividend_safety_no_yield() {
        let fund = make_fund(None, None, None, None, None, None, None, None, None, None, Some(0.0), None);
        assert!(assess_dividend_safety(&fund).is_none());
    }

    #[test]
    fn test_dividend_safety_very_safe() {
        let fund = make_fund(Some(0.15), None, Some(1_000_000.0), Some(0.5), None, None, None, None, None, None, Some(0.03), Some(0.30));
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("very_safe"));
    }

    #[test]
    fn test_dividend_safety_at_risk() {
        let fund = make_fund(Some(-0.05), None, Some(-1.0), Some(2.0), None, None, None, None, None, None, Some(0.05), Some(0.90));
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("at_risk"));
    }

    #[test]
    fn test_dividend_safety_cutting() {
        let fund = make_fund(Some(-0.10), None, Some(-1.0), Some(3.0), None, None, None, None, None, None, Some(0.08), Some(1.20));
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("cutting"));
    }
}
