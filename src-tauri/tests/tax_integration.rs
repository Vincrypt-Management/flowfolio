mod common;

use chrono::{Duration, Utc};

#[tokio::test]
async fn wash_sale_event_row_round_trips() {
    let (_dir, pool) = common::setup_test_db().await;
    let today = Utc::now().date_naive().to_string();
    sqlx::query(
        "INSERT INTO wash_sale_events (id, portfolio_name, symbol, sale_date, harvested_loss)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind("evt1")
    .bind("test")
    .bind("AAPL")
    .bind(&today)
    .bind(-100.0_f64)
    .execute(&pool)
    .await
    .unwrap();

    let row: (String, String, String, f64) = sqlx::query_as(
        "SELECT id, portfolio_name, symbol, harvested_loss FROM wash_sale_events WHERE id = ?",
    )
    .bind("evt1")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.0, "evt1");
    assert_eq!(row.1, "test");
    assert_eq!(row.2, "AAPL");
    assert!((row.3 + 100.0).abs() < 1e-9);
}

#[tokio::test]
async fn wash_sale_window_true_when_event_within_30d() {
    let (_dir, pool) = common::setup_test_db().await;
    let recent = (Utc::now() - Duration::days(10)).date_naive().to_string();
    sqlx::query(
        "INSERT INTO wash_sale_events (id, portfolio_name, symbol, sale_date, harvested_loss)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind("evt2")
    .bind("test")
    .bind("MSFT")
    .bind(&recent)
    .bind(-50.0_f64)
    .execute(&pool)
    .await
    .unwrap();

    let found: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM wash_sale_events
         WHERE portfolio_name = ? AND symbol = ? AND sale_date > date('now', '-30 days')",
    )
    .bind("test")
    .bind("MSFT")
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(found.is_some(), "expected MSFT row within 30d");
}

#[tokio::test]
async fn wash_sale_window_false_when_event_older_than_30d() {
    let (_dir, pool) = common::setup_test_db().await;
    let old = (Utc::now() - Duration::days(40)).date_naive().to_string();
    sqlx::query(
        "INSERT INTO wash_sale_events (id, portfolio_name, symbol, sale_date, harvested_loss)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind("evt3")
    .bind("test")
    .bind("GOOG")
    .bind(&old)
    .bind(-200.0_f64)
    .execute(&pool)
    .await
    .unwrap();

    let found: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM wash_sale_events
         WHERE portfolio_name = ? AND symbol = ? AND sale_date > date('now', '-30 days')",
    )
    .bind("test")
    .bind("GOOG")
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(found.is_none(), "expected no rows for >30d-old event");
}

#[tokio::test]
async fn wash_sale_window_false_for_unknown_symbol() {
    let (_dir, pool) = common::setup_test_db().await;
    let found: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM wash_sale_events
         WHERE portfolio_name = ? AND symbol = ? AND sale_date > date('now', '-30 days')",
    )
    .bind("test")
    .bind("UNKNOWN")
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(found.is_none());
}
