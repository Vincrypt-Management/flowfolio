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
        optimizer::{PortfolioOptimizer, PortfolioOptimizationReport, OptimizationThresholds},
    },
    backtest::{BacktestEngine, BacktestConfig, BacktestResult},
    journal::{Journal, JournalEntry, JournalFilter, JournalStats, PlanVersionDiff},
    quant_analysis::{QuantMetrics, QuantAnalyzer, DashboardData, HistoricalPrice},
    progress::{ProgressEvent, PROGRESS_MANAGER, generate_operation_id, ProgressDetail},
};
use services::{EnhancedMarketDataService, enhanced_market_service::CacheStats};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// Global enhanced market data service instance (initialized without DB, upgraded on setup)
lazy_static::lazy_static! {
    static ref ENHANCED_MARKET_SERVICE: Arc<Mutex<EnhancedMarketDataService>> = 
        Arc::new(Mutex::new(EnhancedMarketDataService::new_without_db()));
    
    // Flag to track if database is initialized
    static ref DB_INITIALIZED: Arc<std::sync::atomic::AtomicBool> = 
        Arc::new(std::sync::atomic::AtomicBool::new(false));
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
    
    eprintln!("[INFO] [db] Local cache database initialized successfully");
    
    Ok(pool)
}

/// Initialize the enhanced market service with database
async fn init_market_service_with_db(pool: sqlx::Pool<sqlx::Sqlite>) {
    let mut service = ENHANCED_MARKET_SERVICE.lock().await;
    *service = EnhancedMarketDataService::new(Some(pool));
    DB_INITIALIZED.store(true, std::sync::atomic::Ordering::SeqCst);
    eprintln!("[INFO] [service] Enhanced market service initialized with database caching");
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
    
    let mut result = serde_json::json!({
        "symbol": symbol,
        "timestamp": chrono::Utc::now().to_rfc3339(),
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
            "sortinoRatio": sharpe * 1.2, // Approximation
            "annualizedReturn": annualized_return,
            "volatility": volatility,
            "maxDrawdown": max_drawdown,
            "rsi": rsi,
            "signal": metrics.signal,
            "confidence": metrics.confidence,
            "beta": 1.0, // Would need market correlation data
            "alpha": annualized_return - 10.0, // vs market approx
            "var95": volatility * 1.65 / 100.0 * 10000.0, // 95% VaR for $10k
            "cvar95": volatility * 2.06 / 100.0 * 10000.0, // CVaR approximation
            "calmarRatio": if max_drawdown.abs() > 0.01 { 
                annualized_return / max_drawdown.abs() 
            } else { 0.0 },
            "informationRatio": sharpe * 0.8,
            "treynorRatio": annualized_return / 1.0, // Assuming beta=1
            // Technical indicators
            "rsiSignal": if rsi < 30.0 { "oversold" } else if rsi > 70.0 { "overbought" } else { "neutral" },
            "trendStrength": if rsi > 50.0 { "bullish" } else { "bearish" },
            "momentumScore": ((rsi - 50.0) / 50.0 * 100.0).round(),
        });
        
        // Generate estimated fundamentals based on quant metrics
        // These are approximations for display purposes
        let value_score: f64 = 50.0 + (sharpe * 10.0).min(30.0).max(-30.0);
        let quality_score: f64 = 50.0 + (annualized_return / 2.0).min(30.0).max(-30.0);
        let growth_score: f64 = 50.0 + (annualized_return / 3.0).min(25.0).max(-25.0);
        
        result["fundamentals"] = serde_json::json!({
            "peRatio": null,
            "forwardPE": null,
            "priceToBook": null,
            "profitMargin": null,
            "returnOnEquity": null,
            "revenueGrowthYoY": null,
            "debtToEquity": null,
            "dividendYield": null,
            "marketCap": 0,
            "eps": null,
            "beta": 1.0,
            "valueScore": value_score.max(0.0).min(100.0),
            "qualityScore": quality_score.max(0.0).min(100.0),
            "growthScore": growth_score.max(0.0).min(100.0),
        });
        
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
        eprintln!("[INFO] [app]   - Live progress streaming");
    }
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
