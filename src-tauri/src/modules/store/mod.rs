pub mod models;
pub mod migrations;
pub mod repository;

use anyhow::Result;
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};
use std::path::PathBuf;

/// Database connection manager
pub struct Store {
    pool: SqlitePool,
}

impl Store {
    /// Initialize database connection with migrations
    pub async fn new(db_path: PathBuf) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options).await?;
        
        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Get database file location for documentation
    pub fn db_location(&self) -> String {
        "Local SQLite database in app data directory".to_string()
    }
}
