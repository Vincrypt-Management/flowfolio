pub mod models;
pub mod migrations;
pub mod repository;

use anyhow::Result;
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};
use std::path::PathBuf;
use repository::Repository;

/// Database connection manager
pub struct Store {
    pool: SqlitePool,
    repository: Repository,
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

        let repository = Repository::new(pool.clone());

        Ok(Self { pool, repository })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn repo(&self) -> &Repository {
        &self.repository
    }

    /// Get database file location for documentation
    pub fn db_location(&self) -> String {
        "Local SQLite database in app data directory".to_string()
    }
}

