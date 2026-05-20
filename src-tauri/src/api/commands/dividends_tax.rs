// API Commands - Dividends & Tax Lot Tracking
// Extracted from lib.rs

use crate::get_pool;
use std::collections::HashMap;

// ==================== DIVIDEND TRACKING ====================

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn record_dividend(
    id: String,
    portfolio_name: String,
    symbol: String,
    amount_per_share: f64,
    total_amount: f64,
    shares_held: f64,
    ex_date: String,
    pay_date: Option<String>,
    reinvested: bool,
) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT INTO dividends (id, portfolio_name, symbol, amount_per_share, total_amount, shares_held, ex_date, pay_date, reinvested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&portfolio_name).bind(&symbol)
    .bind(amount_per_share).bind(total_amount).bind(shares_held)
    .bind(&ex_date).bind(&pay_date).bind(reinvested as i32)
    .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_dividends(portfolio_name: String) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query_as::<_, (String, String, String, f64, f64, f64, String, Option<String>, i32, String)>(
        "SELECT id, portfolio_name, symbol, amount_per_share, total_amount, shares_held, ex_date, pay_date, reinvested, created_at FROM dividends WHERE portfolio_name = ? ORDER BY ex_date DESC"
    )
    .bind(&portfolio_name)
    .fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.0, "portfolio_name": r.1, "symbol": r.2,
                "amount_per_share": r.3, "total_amount": r.4, "shares_held": r.5,
                "ex_date": r.6, "pay_date": r.7, "reinvested": r.8 != 0, "created_at": r.9
            })
        })
        .collect())
}

#[tauri::command]
pub async fn get_dividend_summary(portfolio_name: String) -> Result<serde_json::Value, String> {
    let pool = get_pool().await?;
    let year = chrono::Utc::now().format("%Y").to_string();

    let total_all: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total_amount), 0) FROM dividends WHERE portfolio_name = ?",
    )
    .bind(&portfolio_name)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_ytd: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total_amount), 0) FROM dividends WHERE portfolio_name = ? AND ex_date >= (? || '-01-01')"
    ).bind(&portfolio_name).bind(&year).fetch_one(&pool).await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total_all_time": total_all,
        "total_ytd": total_ytd,
    }))
}

// ==================== TAX LOT TRACKING ====================

#[tauri::command]
pub async fn create_tax_lot(
    id: String,
    portfolio_name: String,
    symbol: String,
    shares: f64,
    cost_basis_per_share: f64,
    purchase_date: String,
) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("INSERT INTO tax_lots (id, portfolio_name, symbol, shares, cost_basis_per_share, purchase_date) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&portfolio_name).bind(&symbol)
        .bind(shares).bind(cost_basis_per_share).bind(&purchase_date)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_tax_lots(
    portfolio_name: String,
    symbol: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;
    let rows = if let Some(sym) = &symbol {
        sqlx::query_as::<_, (String, String, String, f64, f64, String, i32, Option<String>, Option<f64>, String)>(
            "SELECT id, portfolio_name, symbol, shares, cost_basis_per_share, purchase_date, is_closed, close_date, close_price, created_at FROM tax_lots WHERE portfolio_name = ? AND symbol = ? ORDER BY purchase_date ASC"
        ).bind(&portfolio_name).bind(sym).fetch_all(&pool).await
    } else {
        sqlx::query_as::<_, (String, String, String, f64, f64, String, i32, Option<String>, Option<f64>, String)>(
            "SELECT id, portfolio_name, symbol, shares, cost_basis_per_share, purchase_date, is_closed, close_date, close_price, created_at FROM tax_lots WHERE portfolio_name = ? ORDER BY purchase_date ASC"
        ).bind(&portfolio_name).fetch_all(&pool).await
    }.map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            let days_held = chrono::NaiveDate::parse_from_str(&r.5, "%Y-%m-%d")
                .map(|d| (chrono::Utc::now().date_naive() - d).num_days())
                .unwrap_or(0);
            serde_json::json!({
                "id": r.0, "portfolio_name": r.1, "symbol": r.2,
                "shares": r.3, "cost_basis_per_share": r.4, "purchase_date": r.5,
                "is_closed": r.6 != 0, "close_date": r.7, "close_price": r.8,
                "created_at": r.9, "days_held": days_held,
                "is_long_term": days_held > 365
            })
        })
        .collect())
}

/// Resolves the effective marginal tax rate from settings + optional override.
/// Defaults to 0.24 if unset or out of range (0–60%).
pub(crate) fn resolve_marginal_rate(
    settings_value: Option<&str>,
    override_rate: Option<f64>,
) -> f64 {
    if let Some(o) = override_rate {
        return o;
    }
    settings_value
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|v| (0.0..=0.6).contains(v))
        .unwrap_or(0.24)
}

#[tauri::command]
pub async fn get_tax_loss_harvest_opportunities(
    portfolio_name: String,
    current_prices: HashMap<String, f64>,
    override_rate: Option<f64>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool().await?;

    // Resolve marginal rate from user_settings (default 0.24).
    let rate_row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM user_settings WHERE key = 'marginal_tax_rate'")
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;
    let rate = resolve_marginal_rate(rate_row.as_ref().map(|r| r.0.as_str()), override_rate);

    let rows = sqlx::query_as::<_, (String, String, f64, f64, String)>(
        "SELECT id, symbol, shares, cost_basis_per_share, purchase_date FROM tax_lots WHERE portfolio_name = ? AND is_closed = 0"
    ).bind(&portfolio_name).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut opportunities = Vec::new();
    for r in &rows {
        if let Some(&current_price) = current_prices.get(&r.1) {
            let unrealized_gain = (current_price - r.3) * r.2;
            if unrealized_gain < 0.0 {
                let days_held = chrono::NaiveDate::parse_from_str(&r.4, "%Y-%m-%d")
                    .map(|d| (chrono::Utc::now().date_naive() - d).num_days())
                    .unwrap_or(0);
                opportunities.push(serde_json::json!({
                    "lot_id": r.0,
                    "symbol": r.1,
                    "shares": r.2,
                    "cost_basis": r.3,
                    "current_price": current_price,
                    "unrealized_loss": unrealized_gain,
                    "days_held": days_held,
                    "is_long_term": days_held > 365,
                    "tax_benefit_estimate": unrealized_gain.abs() * rate,
                    "applied_rate": rate,
                }));
            }
        }
    }
    opportunities.sort_by(|a, b| {
        let a_val = a["unrealized_loss"].as_f64().unwrap_or(0.0);
        let b_val = b["unrealized_loss"].as_f64().unwrap_or(0.0);
        a_val
            .partial_cmp(&b_val)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(opportunities)
}

// ==================== WASH-SALE TRACKING ====================

/// Returns true if `sale_date` is within the 30-day wash-sale window
/// relative to `today`. Pure function — testable without the DB.
#[cfg(test)]
pub(crate) fn is_in_wash_sale_window(sale_date: &str, today: chrono::NaiveDate) -> bool {
    match chrono::NaiveDate::parse_from_str(sale_date, "%Y-%m-%d") {
        Ok(d) => {
            let delta = (today - d).num_days();
            (0..=30).contains(&delta)
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn record_wash_sale_event(
    id: String,
    portfolio_name: String,
    symbol: String,
    sale_date: String,
    harvested_loss: f64,
) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT INTO wash_sale_events (id, portfolio_name, symbol, sale_date, harvested_loss) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&portfolio_name).bind(&symbol).bind(&sale_date).bind(harvested_loss)
    .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn check_wash_sale_window(
    portfolio_name: String,
    symbol: String,
) -> Result<serde_json::Value, String> {
    let pool = get_pool().await?;
    let today = chrono::Utc::now().date_naive();
    let cutoff = (today - chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();

    let row: Option<(String, f64)> = sqlx::query_as(
        "SELECT sale_date, harvested_loss FROM wash_sale_events
         WHERE portfolio_name = ? AND symbol = ? AND sale_date >= ?
         ORDER BY sale_date DESC LIMIT 1",
    )
    .bind(&portfolio_name)
    .bind(&symbol)
    .bind(&cutoff)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(match row {
        Some((sale_date, harvested_loss)) => {
            let sd = chrono::NaiveDate::parse_from_str(&sale_date, "%Y-%m-%d")
                .map_err(|e| e.to_string())?;
            let days_since = (today - sd).num_days();
            let days_remaining = (30 - days_since).max(0);
            serde_json::json!({
                "in_window": true,
                "sale_date": sale_date,
                "harvested_loss": harvested_loss,
                "days_since": days_since,
                "days_remaining": days_remaining,
            })
        }
        None => serde_json::json!({
            "in_window": false,
            "days_remaining": 0,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::is_in_wash_sale_window;
    use super::resolve_marginal_rate;

    // The bare wash-sale window arithmetic, isolated from sqlx for unit testing.
    // record_wash_sale_event and check_wash_sale_window depend on the live DB pool —
    // those are exercised by integration tests in src-tauri/tests/tax_integration.rs
    // (run via `cargo test --test tax_integration`).

    #[test]
    fn day_30_is_inside_the_wash_sale_window() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 20).unwrap();
        // 30 days before today = 2026-04-20
        assert!(is_in_wash_sale_window("2026-04-20", today));
    }

    #[test]
    fn day_31_is_outside_the_wash_sale_window() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 20).unwrap();
        // 31 days before today = 2026-04-19
        assert!(!is_in_wash_sale_window("2026-04-19", today));
    }

    #[test]
    fn day_0_is_inside_the_wash_sale_window() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 20).unwrap();
        assert!(is_in_wash_sale_window("2026-05-20", today));
    }

    #[test]
    fn future_sale_date_is_outside_the_window() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 20).unwrap();
        assert!(!is_in_wash_sale_window("2026-06-01", today));
    }

    #[test]
    fn invalid_date_string_is_outside_the_window() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 5, 20).unwrap();
        assert!(!is_in_wash_sale_window("not-a-date", today));
    }

    #[test]
    fn rate_resolution_uses_override_when_provided() {
        assert_eq!(resolve_marginal_rate(Some("0.32"), Some(0.50)), 0.50);
    }

    #[test]
    fn rate_resolution_falls_back_to_settings() {
        assert_eq!(resolve_marginal_rate(Some("0.32"), None), 0.32);
    }

    #[test]
    fn rate_resolution_uses_default_24pct_on_missing() {
        assert_eq!(resolve_marginal_rate(None, None), 0.24);
    }

    #[test]
    fn rate_resolution_uses_default_on_invalid_string() {
        assert_eq!(resolve_marginal_rate(Some("not-a-number"), None), 0.24);
    }

    #[test]
    fn rate_resolution_uses_default_on_out_of_range_setting() {
        // Rate above 60% is rejected (sanity bound).
        assert_eq!(resolve_marginal_rate(Some("0.95"), None), 0.24);
        // Negative also rejected.
        assert_eq!(resolve_marginal_rate(Some("-0.10"), None), 0.24);
    }
}
