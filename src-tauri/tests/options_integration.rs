mod common;

use flowfolio_lib::api::commands::options::aggregate_options_summary;

#[allow(clippy::too_many_arguments)]
async fn insert_option(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    id: &str,
    symbol: &str,
    strategy: &str,
    strike: f64,
    expiration: &str,
    contracts: i64,
    premium: f64,
    status: &str,
    close_premium: Option<f64>,
) {
    sqlx::query(
        "INSERT INTO option_positions
         (id, portfolio_name, symbol, strategy, strike, expiration, contracts,
          premium_per_contract, open_date, status, close_premium)
         VALUES (?, 'test', ?, ?, ?, ?, ?, ?, '2026-01-01', ?, ?)",
    )
    .bind(id)
    .bind(symbol)
    .bind(strategy)
    .bind(strike)
    .bind(expiration)
    .bind(contracts)
    .bind(premium)
    .bind(status)
    .bind(close_premium)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn insert_then_list_returns_row() {
    let (_dir, pool) = common::setup_test_db().await;
    insert_option(
        &pool,
        "o1",
        "AAPL",
        "covered_call",
        200.0,
        "2027-01-15",
        1,
        1.5,
        "open",
        None,
    )
    .await;
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM option_positions WHERE id = ?")
        .bind("o1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count.0, 1);
}

#[tokio::test]
async fn list_filters_by_status() {
    let (_dir, pool) = common::setup_test_db().await;
    insert_option(
        &pool,
        "a",
        "AAPL",
        "covered_call",
        200.0,
        "2027-01-15",
        1,
        1.5,
        "open",
        None,
    )
    .await;
    insert_option(
        &pool,
        "b",
        "MSFT",
        "covered_call",
        300.0,
        "2027-02-15",
        1,
        2.0,
        "expired",
        None,
    )
    .await;
    let open_rows: Vec<(String,)> = sqlx::query_as(
        "SELECT id FROM option_positions WHERE portfolio_name = 'test' AND status = 'open'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(open_rows.len(), 1);
    assert_eq!(open_rows[0].0, "a");
}

#[tokio::test]
async fn delete_removes_row() {
    let (_dir, pool) = common::setup_test_db().await;
    insert_option(
        &pool,
        "d",
        "AAPL",
        "covered_call",
        200.0,
        "2027-01-15",
        1,
        1.5,
        "open",
        None,
    )
    .await;
    sqlx::query("DELETE FROM option_positions WHERE id = ?")
        .bind("d")
        .execute(&pool)
        .await
        .unwrap();
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM option_positions WHERE id = ?")
        .bind("d")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count.0, 0);
}

#[tokio::test]
async fn closed_early_status_persists_close_premium() {
    let (_dir, pool) = common::setup_test_db().await;
    insert_option(
        &pool,
        "ce",
        "AAPL",
        "covered_call",
        200.0,
        "2027-01-15",
        1,
        1.5,
        "open",
        None,
    )
    .await;
    sqlx::query(
        "UPDATE option_positions
         SET status = 'closed_early', close_premium = ?, close_date = '2026-03-01'
         WHERE id = ?",
    )
    .bind(0.5_f64)
    .bind("ce")
    .execute(&pool)
    .await
    .unwrap();
    let row: (String, Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT status, close_premium, close_date FROM option_positions WHERE id = ?",
    )
    .bind("ce")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.0, "closed_early");
    assert!((row.1.unwrap() - 0.5).abs() < 1e-9);
    assert_eq!(row.2.as_deref(), Some("2026-03-01"));
}

#[tokio::test]
async fn summary_aggregates_mixed_strategies() {
    // 2 CC open + 1 CSP open + 1 expired CC.
    let (_dir, pool) = common::setup_test_db().await;
    insert_option(
        &pool,
        "cc1",
        "AAPL",
        "covered_call",
        200.0,
        "2027-01-15",
        1,
        1.5,
        "open",
        None,
    )
    .await;
    insert_option(
        &pool,
        "cc2",
        "MSFT",
        "covered_call",
        300.0,
        "2027-01-15",
        2,
        2.0,
        "open",
        None,
    )
    .await;
    insert_option(
        &pool,
        "csp1",
        "GOOG",
        "cash_secured_put",
        150.0,
        "2027-01-15",
        1,
        1.0,
        "open",
        None,
    )
    .await;
    insert_option(
        &pool,
        "exp",
        "AAPL",
        "covered_call",
        250.0,
        "2026-04-15",
        1,
        3.0,
        "expired",
        None,
    )
    .await;

    let rows: Vec<(String, String, f64, i64, f64, Option<f64>)> = sqlx::query_as(
        "SELECT status, strategy, strike, contracts, premium_per_contract, close_premium
         FROM option_positions WHERE portfolio_name = 'test'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let mut cc = Vec::new();
    let mut csp = Vec::new();
    for (status, strat, strike, contracts, premium, cp) in rows {
        let tup = (status, strike, contracts, premium, cp);
        if strat == "covered_call" {
            cc.push(tup);
        } else {
            csp.push(tup);
        }
    }
    let cc_sum = aggregate_options_summary(&cc, "covered_call");
    let csp_sum = aggregate_options_summary(&csp, "cash_secured_put");

    // CC open exposure: 200*1*100 + 300*2*100 = 20_000 + 60_000 = 80_000
    assert_eq!(
        cc_sum["total_assignment_exposure"].as_f64().unwrap(),
        80_000.0
    );
    assert_eq!(cc_sum["total_cash_secured"].as_f64().unwrap(), 0.0);
    // CSP open exposure: 150*1*100 = 15_000
    assert_eq!(csp_sum["total_cash_secured"].as_f64().unwrap(), 15_000.0);
    assert_eq!(csp_sum["total_assignment_exposure"].as_f64().unwrap(), 0.0);
    // Realized: only the expired CC contributes 3.0 * 1 * 100 = 300.
    let total_realized = cc_sum["realized_premium_ytd"].as_f64().unwrap()
        + csp_sum["realized_premium_ytd"].as_f64().unwrap();
    assert_eq!(total_realized, 300.0);
    // Total open count: 2 CC + 1 CSP = 3
    let total_open =
        cc_sum["open_count"].as_i64().unwrap() + csp_sum["open_count"].as_i64().unwrap();
    assert_eq!(total_open, 3);
}

#[tokio::test]
async fn list_orders_by_open_date_desc() {
    let (_dir, pool) = common::setup_test_db().await;
    // Use distinct open_dates so ordering is deterministic.
    sqlx::query(
        "INSERT INTO option_positions
         (id, portfolio_name, symbol, strategy, strike, expiration, contracts,
          premium_per_contract, open_date, status)
         VALUES (?, 'test', 'AAPL', 'covered_call', 100, '2027-01-15', 1, 1.0, ?, 'open')",
    )
    .bind("older")
    .bind("2026-01-01")
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO option_positions
         (id, portfolio_name, symbol, strategy, strike, expiration, contracts,
          premium_per_contract, open_date, status)
         VALUES (?, 'test', 'AAPL', 'covered_call', 100, '2027-01-15', 1, 1.0, ?, 'open')",
    )
    .bind("newer")
    .bind("2026-03-01")
    .execute(&pool)
    .await
    .unwrap();
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT id FROM option_positions WHERE portfolio_name = 'test' ORDER BY open_date DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rows[0].0, "newer");
    assert_eq!(rows[1].0, "older");
}
