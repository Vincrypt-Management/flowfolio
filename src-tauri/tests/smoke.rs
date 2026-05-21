mod common;

#[tokio::test]
async fn db_scaffold_runs_migrations() {
    let (_dir, pool) = common::setup_test_db().await;
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM _migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(
        count.0 >= 3,
        "expected ≥3 migrations applied, got {}",
        count.0
    );
}
