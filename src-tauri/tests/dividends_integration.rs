mod common;

use chrono::{Duration, Utc};
use flowfolio_lib::modules::dividend_calendar::{cache_ttl_hours, UpcomingDividend, EMPTY_SENTINEL_EX_DATE};

fn fixture(symbol: &str) -> UpcomingDividend {
    UpcomingDividend {
        symbol: symbol.into(),
        ex_date: "2026-06-15".into(),
        pay_date: Some("2026-06-30".into()),
        amount_per_share: 0.25,
        shares_held: None,
        projected_payout: None,
    }
}

#[tokio::test]
async fn ttl_helper_returns_6h_for_empty_and_24h_for_non_empty() {
    let empty: Vec<UpcomingDividend> = vec![];
    assert_eq!(cache_ttl_hours(&empty), 6);
    assert_eq!(cache_ttl_hours(&[fixture("AAPL")]), 24);
}

#[tokio::test]
async fn cache_hit_when_within_ttl() {
    let (_dir, pool) = common::setup_test_db().await;
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    sqlx::query(
        "INSERT INTO dividend_calendar_cache (symbol, ex_date, pay_date, amount_per_share, fetched_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind("AAPL")
    .bind("2026-06-15")
    .bind(Option::<String>::Some("2026-06-30".into()))
    .bind(0.25_f64)
    .bind(&now)
    .execute(&pool)
    .await
    .unwrap();

    let cutoff = (Utc::now() - Duration::hours(24))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT symbol FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date != ? AND fetched_at >= ?",
    )
    .bind("AAPL")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&cutoff)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn cache_miss_when_past_24h_ttl() {
    let (_dir, pool) = common::setup_test_db().await;
    let old = (Utc::now() - Duration::hours(25))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    sqlx::query(
        "INSERT INTO dividend_calendar_cache (symbol, ex_date, pay_date, amount_per_share, fetched_at)
         VALUES (?, ?, NULL, ?, ?)",
    )
    .bind("AAPL")
    .bind("2026-06-15")
    .bind(0.25_f64)
    .bind(&old)
    .execute(&pool)
    .await
    .unwrap();

    let cutoff = (Utc::now() - Duration::hours(24))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT symbol FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date != ? AND fetched_at >= ?",
    )
    .bind("AAPL")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&cutoff)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(rows.is_empty(), "expected miss when row is older than 24h");
}

#[tokio::test]
async fn negative_cache_sentinel_hits_within_6h() {
    let (_dir, pool) = common::setup_test_db().await;
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    sqlx::query(
        "INSERT INTO dividend_calendar_cache (symbol, ex_date, pay_date, amount_per_share, fetched_at)
         VALUES (?, ?, NULL, 0, ?)",
    )
    .bind("TSLA")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&now)
    .execute(&pool)
    .await
    .unwrap();

    let cutoff = (Utc::now() - Duration::hours(6))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let sentinel: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date = ? AND fetched_at >= ?",
    )
    .bind("TSLA")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&cutoff)
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(sentinel.is_some(), "negative-cache sentinel should be a hit within 6h");
}

#[tokio::test]
async fn negative_cache_sentinel_expires_past_6h() {
    let (_dir, pool) = common::setup_test_db().await;
    let stale = (Utc::now() - Duration::hours(7))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    sqlx::query(
        "INSERT INTO dividend_calendar_cache (symbol, ex_date, pay_date, amount_per_share, fetched_at)
         VALUES (?, ?, NULL, 0, ?)",
    )
    .bind("TSLA")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&stale)
    .execute(&pool)
    .await
    .unwrap();

    let cutoff = (Utc::now() - Duration::hours(6))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let sentinel: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date = ? AND fetched_at >= ?",
    )
    .bind("TSLA")
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&cutoff)
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(sentinel.is_none(), "stale sentinel should not hit");
}
