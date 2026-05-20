use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use tempfile::TempDir;

/// Create a fresh tempfile-backed SQLite pool with all production migrations applied.
/// The caller must hold the returned `TempDir` for the lifetime of the test —
/// dropping it deletes the underlying database file.
pub async fn setup_test_db() -> (TempDir, Pool<Sqlite>) {
    let dir = TempDir::new().expect("tempdir");
    let path = dir.path().join("test.db");
    let url = format!("sqlite://{}?mode=rwc", path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("sqlite pool");
    flowfolio_lib::infrastructure::database::migrations::run_migrations(&pool)
        .await
        .expect("migrations");
    (dir, pool)
}
