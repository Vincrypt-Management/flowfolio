use crate::get_pool;
use serde_json::Value;

fn validate_new_position(
    strike: f64,
    contracts: i64,
    premium_per_contract: f64,
    expiration: &str,
    open_date: &str,
) -> Result<(), String> {
    if strike <= 0.0 {
        return Err("strike must be > 0".into());
    }
    if contracts <= 0 {
        return Err("contracts must be > 0".into());
    }
    if premium_per_contract < 0.0 {
        return Err("premium cannot be negative".into());
    }
    let exp = chrono::NaiveDate::parse_from_str(expiration, "%Y-%m-%d")
        .map_err(|_| "expiration must be YYYY-MM-DD".to_string())?;
    let open = chrono::NaiveDate::parse_from_str(open_date, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Utc::now().date_naive());
    if exp < open {
        return Err("expiration must be on or after open date".into());
    }
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_option_position(
    id: String,
    portfolio_name: String,
    symbol: String,
    strategy: String,
    strike: f64,
    expiration: String,
    contracts: i64,
    premium_per_contract: f64,
    open_date: String,
    notes: Option<String>,
) -> Result<(), String> {
    if !matches!(strategy.as_str(), "covered_call" | "cash_secured_put") {
        return Err(format!("invalid strategy: {strategy}"));
    }
    validate_new_position(
        strike,
        contracts,
        premium_per_contract,
        &expiration,
        &open_date,
    )?;
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT INTO option_positions
         (id, portfolio_name, symbol, strategy, strike, expiration, contracts,
          premium_per_contract, open_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    )
    .bind(&id)
    .bind(&portfolio_name)
    .bind(&symbol)
    .bind(&strategy)
    .bind(strike)
    .bind(&expiration)
    .bind(contracts)
    .bind(premium_per_contract)
    .bind(&open_date)
    .bind(&notes)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Pure transition validator — used by tests and called from update_option_position.
pub(crate) fn is_valid_transition(from: &str, to: &str) -> bool {
    match from {
        "open" => matches!(to, "expired" | "assigned" | "closed_early"),
        "expired" | "assigned" | "closed_early" => false,
        _ => false,
    }
}

#[tauri::command]
pub async fn update_option_position(
    id: String,
    status: String,
    close_date: Option<String>,
    close_premium: Option<f64>,
) -> Result<(), String> {
    let pool = get_pool().await?;
    let row: Option<(String,)> = sqlx::query_as("SELECT status FROM option_positions WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let current = row.ok_or_else(|| "position not found".to_string())?.0;
    if !is_valid_transition(&current, &status) {
        return Err(format!("invalid transition: {current} -> {status}"));
    }
    sqlx::query(
        "UPDATE option_positions SET status = ?, close_date = ?, close_premium = ?
         WHERE id = ?",
    )
    .bind(&status)
    .bind(&close_date)
    .bind(close_premium)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_option_positions(
    portfolio_name: String,
    status_filter: Option<String>,
) -> Result<Vec<Value>, String> {
    let pool = get_pool().await?;
    #[allow(clippy::type_complexity)]
    let rows: Vec<(
        String,
        String,
        String,
        String,
        f64,
        String,
        i64,
        f64,
        String,
        String,
        Option<String>,
        Option<f64>,
        Option<String>,
        String,
    )> = if let Some(s) = &status_filter {
        sqlx::query_as(
            "SELECT id, portfolio_name, symbol, strategy, strike, expiration, contracts, premium_per_contract, open_date, status, close_date, close_premium, notes, created_at FROM option_positions WHERE portfolio_name = ? AND status = ? ORDER BY open_date DESC"
        ).bind(&portfolio_name).bind(s).fetch_all(&pool).await
    } else {
        sqlx::query_as(
            "SELECT id, portfolio_name, symbol, strategy, strike, expiration, contracts, premium_per_contract, open_date, status, close_date, close_premium, notes, created_at FROM option_positions WHERE portfolio_name = ? ORDER BY open_date DESC"
        ).bind(&portfolio_name).fetch_all(&pool).await
    }.map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.0, "portfolio_name": r.1, "symbol": r.2, "strategy": r.3,
                "strike": r.4, "expiration": r.5, "contracts": r.6,
                "premium_per_contract": r.7, "open_date": r.8, "status": r.9,
                "close_date": r.10, "close_premium": r.11, "notes": r.12,
                "created_at": r.13,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn delete_option_position(id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("DELETE FROM option_positions WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Pure aggregation — testable without DB.
/// `strategy` must be "covered_call" or "cash_secured_put"; any other value zeros both exposure fields.
/// Tuple shape: (status, strike, contracts, premium_per_contract, close_premium).
pub fn aggregate_options_summary(
    rows: &[(String, f64, i64, f64, Option<f64>)],
    strategy: &str,
) -> Value {
    let mut open_count = 0i64;
    let mut total_cash_secured = 0.0;
    let mut total_assignment_exposure = 0.0;
    let mut realized_premium = 0.0;
    for (status, strike, contracts, premium, close_premium) in rows {
        let notional = strike * (*contracts as f64) * 100.0;
        let gross_credit = premium * (*contracts as f64) * 100.0;
        match status.as_str() {
            "open" => {
                open_count += 1;
                match strategy {
                    "covered_call" => total_assignment_exposure += notional,
                    "cash_secured_put" => total_cash_secured += notional,
                    _ => {}
                }
            }
            "expired" | "assigned" => {
                realized_premium += gross_credit;
            }
            "closed_early" => {
                let close_debit = close_premium.unwrap_or(0.0) * (*contracts as f64) * 100.0;
                realized_premium += gross_credit - close_debit;
            }
            _ => {}
        }
    }
    serde_json::json!({
        "open_count": open_count,
        "total_cash_secured": total_cash_secured,
        "total_assignment_exposure": total_assignment_exposure,
        "realized_premium_ytd": realized_premium,
    })
}

#[tauri::command]
pub async fn get_options_summary(portfolio_name: String) -> Result<Value, String> {
    let pool = get_pool().await?;
    // Pull all rows once, split by strategy in the aggregator.
    let rows: Vec<(String, String, f64, i64, f64, Option<f64>)> = sqlx::query_as(
        "SELECT status, strategy, strike, contracts, premium_per_contract, close_premium FROM option_positions WHERE portfolio_name = ?"
    ).bind(&portfolio_name).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    // Split rows by strategy for cash-secured vs assignment exposure precision.
    let mut cc_rows = Vec::new();
    let mut csp_rows = Vec::new();
    for (status, strategy, strike, contracts, premium, close_premium) in rows {
        let tup = (status, strike, contracts, premium, close_premium);
        match strategy.as_str() {
            "covered_call" => cc_rows.push(tup),
            "cash_secured_put" => csp_rows.push(tup),
            _ => {}
        }
    }
    let cc_summary = aggregate_options_summary(&cc_rows, "covered_call");
    let csp_summary = aggregate_options_summary(&csp_rows, "cash_secured_put");

    Ok(serde_json::json!({
        "open_count":
            cc_summary["open_count"].as_i64().unwrap_or(0)
            + csp_summary["open_count"].as_i64().unwrap_or(0),
        "total_cash_secured": csp_summary["total_cash_secured"].as_f64().unwrap_or(0.0),
        "total_assignment_exposure": cc_summary["total_assignment_exposure"].as_f64().unwrap_or(0.0),
        "realized_premium_ytd":
            cc_summary["realized_premium_ytd"].as_f64().unwrap_or(0.0)
            + csp_summary["realized_premium_ytd"].as_f64().unwrap_or(0.0),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cannot_transition_open_to_open() {
        assert!(!is_valid_transition("open", "open"));
    }

    #[test]
    fn open_can_transition_to_terminal_states() {
        assert!(is_valid_transition("open", "expired"));
        assert!(is_valid_transition("open", "assigned"));
        assert!(is_valid_transition("open", "closed_early"));
    }

    #[test]
    fn terminal_states_are_final() {
        for terminal in &["expired", "assigned", "closed_early"] {
            for to in &["open", "expired", "assigned", "closed_early"] {
                assert!(!is_valid_transition(terminal, to));
            }
        }
    }

    #[test]
    fn unknown_status_rejects_all_transitions() {
        assert!(!is_valid_transition("weird", "open"));
        assert!(!is_valid_transition("weird", "expired"));
    }

    #[test]
    fn summary_open_count() {
        // strike, contracts, premium_per_contract, close_premium
        let rows = vec![
            ("open".to_string(), 100.0, 1, 2.0, None),
            ("open".to_string(), 50.0, 2, 1.0, None),
            ("expired".to_string(), 100.0, 1, 3.0, None),
        ];
        let s = aggregate_options_summary(&rows, "covered_call");
        assert_eq!(s["open_count"].as_i64().unwrap(), 2);
    }

    #[test]
    fn summary_realized_premium_for_expired() {
        let rows = vec![("expired".to_string(), 100.0, 1, 2.50, None)];
        let s = aggregate_options_summary(&rows, "covered_call");
        // 1 contract * $2.50 * 100 = $250
        assert_eq!(s["realized_premium_ytd"].as_f64().unwrap(), 250.0);
    }

    #[test]
    fn summary_realized_premium_for_closed_early_subtracts_close_debit() {
        let rows = vec![("closed_early".to_string(), 100.0, 1, 2.50, Some(0.80))];
        let s = aggregate_options_summary(&rows, "covered_call");
        // ($2.50 - $0.80) * 1 * 100 = $170
        assert_eq!(s["realized_premium_ytd"].as_f64().unwrap(), 170.0);
    }

    #[test]
    fn summary_cash_secured_only_counts_open_positions() {
        let rows = vec![
            ("open".to_string(), 100.0, 1, 2.0, None), // $10,000 notional
            ("assigned".to_string(), 100.0, 1, 2.0, None),
        ];
        let s = aggregate_options_summary(&rows, "cash_secured_put");
        assert_eq!(s["total_cash_secured"].as_f64().unwrap(), 10000.0);
    }

    #[test]
    fn aggregate_covered_call_only_sets_assignment_exposure() {
        let rows = vec![("open".to_string(), 100.0, 2, 1.5, None)];
        let v = aggregate_options_summary(&rows, "covered_call");
        assert_eq!(
            v["total_assignment_exposure"].as_f64().unwrap(),
            100.0 * 2.0 * 100.0
        );
        assert_eq!(v["total_cash_secured"].as_f64().unwrap(), 0.0);
        assert_eq!(v["open_count"].as_i64().unwrap(), 1);
    }

    #[test]
    fn aggregate_cash_secured_put_only_sets_cash_secured() {
        let rows = vec![("open".to_string(), 90.0, 1, 2.0, None)];
        let v = aggregate_options_summary(&rows, "cash_secured_put");
        assert_eq!(
            v["total_cash_secured"].as_f64().unwrap(),
            90.0 * 1.0 * 100.0
        );
        assert_eq!(v["total_assignment_exposure"].as_f64().unwrap(), 0.0);
    }

    #[test]
    fn aggregate_unknown_strategy_zeros_both_exposures() {
        let rows = vec![("open".to_string(), 50.0, 1, 1.0, None)];
        let v = aggregate_options_summary(&rows, "bogus");
        assert_eq!(v["total_cash_secured"].as_f64().unwrap(), 0.0);
        assert_eq!(v["total_assignment_exposure"].as_f64().unwrap(), 0.0);
    }

    #[test]
    fn validate_rejects_zero_strike() {
        let err = validate_new_position(0.0, 1, 1.0, "2027-01-15", "2026-05-20").unwrap_err();
        assert!(err.contains("strike must be > 0"));
    }

    #[test]
    fn validate_rejects_zero_contracts() {
        let err = validate_new_position(100.0, 0, 1.0, "2027-01-15", "2026-05-20").unwrap_err();
        assert!(err.contains("contracts must be > 0"));
    }

    #[test]
    fn validate_rejects_negative_premium() {
        let err = validate_new_position(100.0, 1, -0.01, "2027-01-15", "2026-05-20").unwrap_err();
        assert!(err.contains("premium cannot be negative"));
    }

    #[test]
    fn validate_rejects_past_expiration() {
        let err = validate_new_position(100.0, 1, 1.0, "2026-01-01", "2026-05-20").unwrap_err();
        assert!(err.contains("expiration must be on or after open date"));
    }

    #[test]
    fn validate_rejects_malformed_date() {
        let err = validate_new_position(100.0, 1, 1.0, "garbage", "2026-05-20").unwrap_err();
        assert!(err.contains("expiration must be YYYY-MM-DD"));
    }

    #[test]
    fn validate_accepts_well_formed_input() {
        assert!(validate_new_position(100.0, 1, 1.0, "2027-01-15", "2026-05-20").is_ok());
    }

    #[test]
    fn validate_allows_same_day_expiration_as_open_date() {
        assert!(validate_new_position(100.0, 1, 1.0, "2026-05-20", "2026-05-20").is_ok());
    }
}
