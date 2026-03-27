// API Commands - Portfolio Management
// Extracted from lib.rs

use crate::modules::{
    portfolio::{
        optimizer::OptimizationThresholds,
        review::{ReviewGenerator, YearlyReview},
        AllocationConstraints, AllocationPlan, BuyList, Portfolio, PortfolioManager,
        PortfolioOptimizationReport, PortfolioOptimizer, RebalanceReport,
    },
    progress::{generate_operation_id, ProgressDetail, ProgressEvent},
    quant_analysis::QuantMetrics,
    scoring::SymbolScore,
};
use crate::{get_pool, Universe, ENHANCED_MARKET_SERVICE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// Create equal-weight allocation plan
#[tauri::command]
pub fn create_equal_weight_allocation(
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

    Ok(PortfolioManager::equal_weight_allocation(
        symbols,
        constraints,
    ))
}

/// Create score-weighted allocation plan
#[tauri::command]
pub fn create_score_weighted_allocation(
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
pub fn generate_monthly_buy_list(
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
pub fn check_portfolio_rebalance(
    portfolio: Portfolio,
    threshold_pct: f64,
) -> Result<RebalanceReport, String> {
    Ok(PortfolioManager::check_rebalance(&portfolio, threshold_pct))
}

/// Generate yearly review checklist
#[tauri::command]
pub fn generate_yearly_review(portfolio_name: String, year: i32) -> Result<YearlyReview, String> {
    Ok(ReviewGenerator::generate_yearly_review(
        &portfolio_name,
        year,
    ))
}

/// Generate portfolio optimization report with drop/replace recommendations
#[tauri::command]
pub async fn generate_optimization_report(
    portfolio_name: String,
    holdings: Vec<(String, f64, f64, f64)>,
    candidate_symbols: Vec<String>,
    thresholds: Option<OptimizationThresholds>,
) -> Result<PortfolioOptimizationReport, String> {
    let holding_symbols: Vec<String> = holdings.iter().map(|(s, _, _, _)| s.clone()).collect();
    let mut holding_metrics: HashMap<String, QuantMetrics> = HashMap::new();

    for symbol in &holding_symbols {
        if let Ok(metrics) = ENHANCED_MARKET_SERVICE.get_quant_metrics(symbol).await {
            holding_metrics.insert(symbol.clone(), metrics);
        }
    }

    let mut candidate_metrics: HashMap<String, QuantMetrics> = HashMap::new();

    for symbol in &candidate_symbols {
        if !holding_symbols.contains(symbol) {
            if let Ok(metrics) = ENHANCED_MARKET_SERVICE.get_quant_metrics(symbol).await {
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
#[tauri::command]
pub async fn generate_optimization_report_live(
    app: AppHandle,
    portfolio_name: String,
    holdings: Vec<(String, f64, f64, f64)>,
    candidate_symbols: Vec<String>,
    thresholds: Option<OptimizationThresholds>,
) -> Result<PortfolioOptimizationReport, String> {
    let operation_id = generate_operation_id();

    let holding_symbols: Vec<String> = holdings.iter().map(|(s, _, _, _)| s.clone()).collect();
    let total_symbols = holding_symbols.len() + candidate_symbols.len();

    let _ = app.emit(
        "optimization_progress",
        ProgressEvent::Started {
            operation_id: operation_id.clone(),
            operation_type: "portfolio_optimization".to_string(),
            total_steps: Some(total_symbols),
            message: format!("Starting portfolio optimization for {}", portfolio_name),
        },
    );

    let mut holding_metrics: HashMap<String, QuantMetrics> = HashMap::new();
    let mut current_step = 0;

    for (idx, symbol) in holding_symbols.iter().enumerate() {
        current_step = idx + 1;

        let _ = app.emit(
            "optimization_progress",
            ProgressEvent::Progress {
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
            },
        );

        let mut attempts = 0;
        let max_attempts = 3;

        loop {
            attempts += 1;
            match ENHANCED_MARKET_SERVICE.get_quant_metrics(symbol).await {
                Ok(metrics) => {
                    let _ = app.emit(
                        "optimization_progress",
                        ProgressEvent::PartialResult {
                            operation_id: operation_id.clone(),
                            result_type: "holding_metrics".to_string(),
                            data: serde_json::json!({
                                "symbol": symbol,
                                "sharpe_ratio": metrics.sharpe_ratio,
                                "annualized_return": metrics.annualized_return,
                                "volatility": metrics.volatility,
                                "signal": metrics.signal,
                            }),
                        },
                    );

                    holding_metrics.insert(symbol.clone(), metrics);
                    break;
                }
                Err(e) => {
                    if attempts < max_attempts {
                        let _ = app.emit(
                            "optimization_progress",
                            ProgressEvent::Retry {
                                operation_id: operation_id.clone(),
                                attempt: attempts,
                                max_attempts,
                                error: e.clone(),
                                next_retry_ms: (attempts as u64) * 500,
                            },
                        );

                        tokio::time::sleep(tokio::time::Duration::from_millis(
                            (attempts as u64) * 500,
                        ))
                        .await;
                    } else {
                        let _ = app.emit(
                            "optimization_progress",
                            ProgressEvent::Error {
                                operation_id: operation_id.clone(),
                                error: format!("Failed to get metrics for {}: {}", symbol, e),
                                recoverable: true,
                            },
                        );
                        break;
                    }
                }
            }
        }
    }

    let mut candidate_metrics: HashMap<String, QuantMetrics> = HashMap::new();

    for symbol in &candidate_symbols {
        if holding_symbols.contains(symbol) {
            continue;
        }

        current_step += 1;

        let _ = app.emit(
            "optimization_progress",
            ProgressEvent::Progress {
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
            },
        );

        let mut attempts = 0;
        let max_attempts = 3;

        loop {
            attempts += 1;
            match ENHANCED_MARKET_SERVICE.get_quant_metrics(symbol).await {
                Ok(metrics) => {
                    let _ = app.emit(
                        "optimization_progress",
                        ProgressEvent::PartialResult {
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
                        },
                    );

                    candidate_metrics.insert(symbol.clone(), metrics);
                    break;
                }
                Err(e) => {
                    if attempts < max_attempts {
                        let _ = app.emit(
                            "optimization_progress",
                            ProgressEvent::Retry {
                                operation_id: operation_id.clone(),
                                attempt: attempts,
                                max_attempts,
                                error: e.clone(),
                                next_retry_ms: (attempts as u64) * 500,
                            },
                        );

                        tokio::time::sleep(tokio::time::Duration::from_millis(
                            (attempts as u64) * 500,
                        ))
                        .await;
                    } else {
                        let _ = app.emit(
                            "optimization_progress",
                            ProgressEvent::Error {
                                operation_id: operation_id.clone(),
                                error: format!("Failed to analyze candidate {}: {}", symbol, e),
                                recoverable: true,
                            },
                        );
                        break;
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "optimization_progress",
        ProgressEvent::Progress {
            operation_id: operation_id.clone(),
            current_step: total_symbols,
            total_steps: Some(total_symbols),
            percentage: 100.0,
            message: "Generating optimization recommendations...".to_string(),
            detail: None,
        },
    );

    let thresholds = thresholds.unwrap_or_default();
    let report = PortfolioOptimizer::generate_optimization_report(
        &portfolio_name,
        holdings,
        &holding_metrics,
        &candidate_metrics,
        thresholds,
    );

    let _ = app.emit(
        "optimization_progress",
        ProgressEvent::Completed {
            operation_id: operation_id.clone(),
            success: true,
            message: format!(
                "Optimization complete: {} drops recommended, {} replacements found",
                report.drop_recommendations.len(),
                report.replacement_options.len()
            ),
            duration_ms: 0,
        },
    );

    Ok(report)
}

/// Helper function to calculate a quick score for candidates
pub(crate) fn calculate_quick_score(metrics: &QuantMetrics) -> f64 {
    let mut score = 0.0;
    score += (metrics.sharpe_ratio * 15.0).clamp(0.0, 30.0);
    score += (metrics.annualized_return * 0.5).clamp(0.0, 25.0);
    score += ((50.0 - metrics.volatility) * 0.3).clamp(0.0, 15.0);
    score += ((40.0 - metrics.max_drawdown) * 0.375).clamp(0.0, 15.0);
    score += match metrics.signal.as_str() {
        "STRONG BUY" => 15.0,
        "BUY" => 10.0,
        "HOLD" => 5.0,
        _ => 0.0,
    };
    score
}

// ==================== SAVED PORTFOLIOS ====================

/// Saved portfolio info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SavedPortfolioInfo {
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
}

/// Save a generated portfolio to the database
#[tauri::command]
pub async fn save_generated_portfolio(
    id: String,
    name: String,
    data: serde_json::Value,
) -> Result<String, String> {
    if let Some(pool) = ENHANCED_MARKET_SERVICE.get_db_pool().await {
        let now = chrono::Utc::now().to_rfc3339();
        let data_str = serde_json::to_string(&data)
            .map_err(|e| format!("Failed to serialize portfolio: {}", e))?;

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO saved_portfolios (id, name, data, created_at, updated_at)
            VALUES (?, ?, ?, COALESCE((SELECT created_at FROM saved_portfolios WHERE id = ?), ?), ?)
        "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&data_str)
        .bind(&id)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to save portfolio: {}", e))?;

        tracing::info!(portfolio_name = %name, id = %id, "Saved portfolio");
        Ok(id)
    } else {
        Err("Database not initialized".to_string())
    }
}

/// Load a saved portfolio by ID
#[tauri::command]
pub async fn load_generated_portfolio(id: String) -> Result<serde_json::Value, String> {
    if let Some(pool) = ENHANCED_MARKET_SERVICE.get_db_pool().await {
        let row: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT data FROM saved_portfolios WHERE id = ?
        "#,
        )
        .bind(&id)
        .fetch_optional(&pool)
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
pub async fn list_saved_portfolios() -> Result<Vec<SavedPortfolioInfo>, String> {
    if let Some(pool) = ENHANCED_MARKET_SERVICE.get_db_pool().await {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            r#"
            SELECT id, name, created_at, updated_at FROM saved_portfolios ORDER BY updated_at DESC
        "#,
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list portfolios: {}", e))?;

        Ok(rows
            .into_iter()
            .map(|(id, name, created_at, updated_at)| SavedPortfolioInfo {
                id,
                name,
                created_at,
                updated_at,
            })
            .collect())
    } else {
        Err("Database not initialized".to_string())
    }
}

/// Delete a saved portfolio
#[tauri::command]
pub async fn delete_saved_portfolio(id: String) -> Result<(), String> {
    if let Some(pool) = ENHANCED_MARKET_SERVICE.get_db_pool().await {
        sqlx::query("DELETE FROM saved_portfolios WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| format!("Failed to delete portfolio: {}", e))?;

        tracing::info!(id = %id, "Deleted portfolio");
        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

// ==================== PORTFOLIO SNAPSHOTS ====================

#[tauri::command]
pub async fn save_portfolio_snapshot(
    portfolio_name: String,
    total_value: f64,
    cash: f64,
    holdings_json: String,
) -> Result<(), String> {
    let pool = get_pool().await?;
    let id = uuid::Uuid::new_v4().to_string();
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    sqlx::query(
        "INSERT OR REPLACE INTO portfolio_snapshots (id, portfolio_name, total_value, cash, holdings_json, snapshot_date) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&portfolio_name).bind(total_value).bind(cash)
    .bind(&holdings_json).bind(&date)
    .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_portfolio_snapshots(
    portfolio_name: String,
    days: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;
    let days = days.unwrap_or(365);
    let rows = sqlx::query_as::<_, (String, f64, f64, String, String)>(
        "SELECT portfolio_name, total_value, cash, holdings_json, snapshot_date FROM portfolio_snapshots WHERE portfolio_name = ? AND snapshot_date >= date('now', '-' || ? || ' days') ORDER BY snapshot_date ASC"
    )
    .bind(&portfolio_name).bind(days)
    .fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "portfolio_name": r.0, "total_value": r.1, "cash": r.2,
                "holdings_json": r.3, "snapshot_date": r.4
            })
        })
        .collect())
}

// ==================== UNIVERSE & WATCHLIST ====================

/// Create a new universe/watchlist
#[tauri::command]
pub async fn create_universe(
    name: String,
    description: String,
    symbols: Vec<String>,
) -> Result<Universe, String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let symbols_json = serde_json::to_string(&symbols).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO universes (id, name, description, symbols, tags, exclude_list, created_at, updated_at)
         VALUES (?, ?, ?, ?, '{}', '[]', ?, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&description)
    .bind(&symbols_json)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create universe: {}", e))?;

    Ok(Universe {
        id,
        name,
        description,
        symbols,
        tags: HashMap::new(),
        exclude_list: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Get all universes
#[tauri::command]
pub async fn list_universes() -> Result<Vec<Universe>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query(
        "SELECT id, name, description, symbols, tags, exclude_list, created_at, updated_at
         FROM universes ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list universes: {}", e))?;

    let universes = rows
        .iter()
        .map(|row| {
            use sqlx::Row;
            let symbols_json: String = row.get("symbols");
            let tags_json: String = row.get("tags");
            let exclude_json: String = row.get("exclude_list");
            let symbols: Vec<String> = serde_json::from_str(&symbols_json).unwrap_or_default();
            let tags: HashMap<String, Vec<String>> =
                serde_json::from_str(&tags_json).unwrap_or_default();
            let exclude_list: Vec<String> = serde_json::from_str(&exclude_json).unwrap_or_default();
            Universe {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                symbols,
                tags,
                exclude_list,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            }
        })
        .collect();
    Ok(universes)
}

/// Get a specific universe
#[tauri::command]
pub async fn get_universe(id: String) -> Result<Option<Universe>, String> {
    let pool = get_pool().await?;
    let row = sqlx::query(
        "SELECT id, name, description, symbols, tags, exclude_list, created_at, updated_at
         FROM universes WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get universe: {}", e))?;

    Ok(row.map(|row| {
        use sqlx::Row;
        let symbols: Vec<String> =
            serde_json::from_str(row.get::<&str, _>("symbols")).unwrap_or_default();
        let tags: HashMap<String, Vec<String>> =
            serde_json::from_str(row.get::<&str, _>("tags")).unwrap_or_default();
        let exclude_list: Vec<String> =
            serde_json::from_str(row.get::<&str, _>("exclude_list")).unwrap_or_default();
        Universe {
            id: row.get("id"),
            name: row.get("name"),
            description: row.get("description"),
            symbols,
            tags,
            exclude_list,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }))
}

/// Update universe symbols
#[tauri::command]
pub async fn update_universe_symbols(id: String, symbols: Vec<String>) -> Result<Universe, String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().to_rfc3339();
    let symbols_json = serde_json::to_string(&symbols).map_err(|e| e.to_string())?;

    let result = sqlx::query("UPDATE universes SET symbols = ?, updated_at = ? WHERE id = ?")
        .bind(&symbols_json)
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update universe symbols: {}", e))?;

    if result.rows_affected() == 0 {
        return Err(format!("Universe '{}' not found", id));
    }

    get_universe(id)
        .await?
        .ok_or_else(|| "Universe disappeared after update".to_string())
}

/// Add symbols to universe exclude list
#[tauri::command]
pub async fn add_to_exclude_list(id: String, symbols: Vec<String>) -> Result<Universe, String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().to_rfc3339();

    let row = sqlx::query("SELECT exclude_list FROM universes WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to fetch universe: {}", e))?
        .ok_or_else(|| format!("Universe '{}' not found", id))?;

    use sqlx::Row;
    let exclude_json: String = row.get("exclude_list");
    let mut exclude_list: Vec<String> = serde_json::from_str(&exclude_json).unwrap_or_default();

    for symbol in symbols {
        if !exclude_list.contains(&symbol) {
            exclude_list.push(symbol);
        }
    }

    let new_exclude_json = serde_json::to_string(&exclude_list).map_err(|e| e.to_string())?;

    sqlx::query("UPDATE universes SET exclude_list = ?, updated_at = ? WHERE id = ?")
        .bind(&new_exclude_json)
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to update exclude list: {}", e))?;

    get_universe(id)
        .await?
        .ok_or_else(|| "Universe disappeared after update".to_string())
}

/// Delete a universe
#[tauri::command]
pub async fn delete_universe(id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("DELETE FROM universes WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete universe: {}", e))?;
    Ok(())
}

// ==================== TRANSACTION HISTORY ====================

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn record_transaction(
    id: String,
    portfolio_name: String,
    symbol: String,
    action: String,
    shares: f64,
    price: f64,
    total: f64,
    fees: f64,
    notes: Option<String>,
    executed_at: String,
) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT INTO transactions (id, portfolio_name, symbol, action, shares, price, total, fees, notes, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&portfolio_name).bind(&symbol).bind(&action)
    .bind(shares).bind(price).bind(total).bind(fees)
    .bind(&notes).bind(&executed_at)
    .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_transactions(portfolio_name: String) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query_as::<_, (String, String, String, String, f64, f64, f64, f64, Option<String>, String, String)>(
        "SELECT id, portfolio_name, symbol, action, shares, price, total, fees, notes, executed_at, created_at FROM transactions WHERE portfolio_name = ? ORDER BY executed_at DESC"
    )
    .bind(&portfolio_name)
    .fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.0, "portfolio_name": r.1, "symbol": r.2, "action": r.3,
                "shares": r.4, "price": r.5, "total": r.6, "fees": r.7,
                "notes": r.8, "executed_at": r.9, "created_at": r.10
            })
        })
        .collect())
}

#[tauri::command]
pub async fn delete_transaction(id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("DELETE FROM transactions WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== REBALANCE TRANSACTIONS ====================

#[tauri::command]
pub async fn record_rebalance(
    portfolio_name: String,
    report_json: String,
) -> Result<String, String> {
    let pool = get_pool().await?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO rebalance_transactions (id, plan_name, method, symbols, allocations, executed_at, notes)
         VALUES (?, ?, 'rebalance', '[]', ?, ?, ?)"
    )
    .bind(&id)
    .bind(&portfolio_name)
    .bind(&report_json)
    .bind(&now)
    .bind("")
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to record rebalance: {}", e))?;
    Ok(id)
}

#[tauri::command]
pub async fn list_rebalance_history(
    portfolio_name: String,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query(
        "SELECT id, executed_at, allocations FROM rebalance_transactions WHERE plan_name = ? ORDER BY executed_at DESC LIMIT 20"
    )
    .bind(&portfolio_name)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list rebalance history: {}", e))?;

    use sqlx::Row;
    Ok(rows.iter().map(|r| serde_json::json!({
        "id": r.get::<String, _>("id"),
        "recorded_at": r.get::<String, _>("executed_at"),
        "report": serde_json::from_str::<serde_json::Value>(r.get::<&str, _>("allocations")).unwrap_or_default(),
    })).collect())
}
