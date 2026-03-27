#![allow(dead_code)]

use super::models::*;
use anyhow::Result;
use sqlx::{Row, SqlitePool};

/// Repository for database operations
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    // Symbol operations
    pub async fn create_symbol(
        &self,
        symbol: &str,
        exchange: Option<&str>,
        name: Option<&str>,
    ) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO symbols (ticker, exchange, name, currency, status) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(symbol)
        .bind(exchange)
        .bind(name)
        .bind("USD")
        .bind("active")
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_symbol_by_ticker(&self, ticker: &str) -> Result<Option<Symbol>> {
        let symbol = sqlx::query_as::<_, Symbol>("SELECT * FROM symbols WHERE ticker = ?")
            .bind(ticker)
            .fetch_optional(&self.pool)
            .await?;

        Ok(symbol)
    }

    pub async fn list_symbols(&self, limit: i64) -> Result<Vec<Symbol>> {
        let symbols = sqlx::query_as::<_, Symbol>(
            "SELECT * FROM symbols WHERE status = 'active' ORDER BY ticker LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(symbols)
    }

    // Price operations
    #[allow(clippy::too_many_arguments)]
    pub async fn insert_price(
        &self,
        symbol_id: i64,
        date: &str,
        open: f64,
        high: f64,
        low: f64,
        close: f64,
        volume: i64,
    ) -> Result<i64> {
        let result = sqlx::query(
            "INSERT OR REPLACE INTO prices_daily (symbol_id, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(symbol_id)
        .bind(date)
        .bind(open)
        .bind(high)
        .bind(low)
        .bind(close)
        .bind(volume)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_prices_for_symbol(
        &self,
        symbol_id: i64,
        limit: i64,
    ) -> Result<Vec<PriceDaily>> {
        let prices = sqlx::query_as::<_, PriceDaily>(
            "SELECT * FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT ?",
        )
        .bind(symbol_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(prices)
    }

    pub async fn get_latest_price_date(&self, symbol_id: i64) -> Result<Option<String>> {
        let row = sqlx::query(
            "SELECT date FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT 1",
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.get::<String, _>("date")))
    }

    // VibePlan operations
    pub async fn create_plan(&self, name: &str, script_json: &str) -> Result<i64> {
        let result =
            sqlx::query("INSERT INTO vibe_plans (name, version, script_json) VALUES (?, ?, ?)")
                .bind(name)
                .bind(1)
                .bind(script_json)
                .execute(&self.pool)
                .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn update_plan(
        &self,
        plan_id: i64,
        script_json: &str,
        compiled_json: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE vibe_plans SET script_json = ?, compiled_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(script_json)
        .bind(compiled_json)
        .bind(plan_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_plan(&self, plan_id: i64) -> Result<Option<VibePlan>> {
        let plan = sqlx::query_as::<_, VibePlan>("SELECT * FROM vibe_plans WHERE id = ?")
            .bind(plan_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(plan)
    }

    pub async fn list_plans(&self) -> Result<Vec<VibePlan>> {
        let plans =
            sqlx::query_as::<_, VibePlan>("SELECT * FROM vibe_plans ORDER BY updated_at DESC")
                .fetch_all(&self.pool)
                .await?;

        Ok(plans)
    }

    // Journal operations
    pub async fn create_journal_entry(
        &self,
        plan_id: i64,
        event_type: &str,
        payload_json: &str,
        plan_version_hash: &str,
    ) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO journal_events (plan_id, event_type, payload_json, plan_version_hash) VALUES (?, ?, ?, ?)"
        )
        .bind(plan_id)
        .bind(event_type)
        .bind(payload_json)
        .bind(plan_version_hash)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_journal_entries(&self, plan_id: i64, limit: i64) -> Result<Vec<JournalEvent>> {
        let entries = sqlx::query_as::<_, JournalEvent>(
            "SELECT * FROM journal_events WHERE plan_id = ? ORDER BY timestamp DESC LIMIT ?",
        )
        .bind(plan_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(entries)
    }

    // Fundamental operations
    pub async fn upsert_fundamental(&self, symbol_id: i64, raw_json: &str) -> Result<i64> {
        // Delete existing
        sqlx::query("DELETE FROM fundamentals_overview WHERE symbol_id = ?")
            .bind(symbol_id)
            .execute(&self.pool)
            .await?;

        // Insert new
        let result =
            sqlx::query("INSERT INTO fundamentals_overview (symbol_id, raw_json) VALUES (?, ?)")
                .bind(symbol_id)
                .bind(raw_json)
                .execute(&self.pool)
                .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_fundamental(&self, symbol_id: i64) -> Result<Option<FundamentalOverview>> {
        let fundamental = sqlx::query_as::<_, FundamentalOverview>(
            "SELECT * FROM fundamentals_overview WHERE symbol_id = ?",
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(fundamental)
    }

    // Refresh job operations
    pub async fn create_refresh_job(
        &self,
        provider: &str,
        endpoint: &str,
        symbol: Option<&str>,
    ) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO refresh_jobs (provider, endpoint, symbol, status) VALUES (?, ?, ?, ?)",
        )
        .bind(provider)
        .bind(endpoint)
        .bind(symbol)
        .bind("pending")
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_pending_jobs(&self, limit: i64) -> Result<Vec<RefreshJob>> {
        let jobs = sqlx::query_as::<_, RefreshJob>(
            "SELECT * FROM refresh_jobs WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(jobs)
    }

    pub async fn update_job_status(
        &self,
        job_id: i64,
        status: &str,
        error: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE refresh_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, last_error = ? WHERE id = ?"
        )
        .bind(status)
        .bind(error)
        .bind(job_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory SQLite pool");

        // Create required tables
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL UNIQUE,
                exchange TEXT,
                name TEXT,
                currency TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS prices_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol_id INTEGER NOT NULL,
                date DATE NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                adj_close REAL,
                volume INTEGER NOT NULL,
                UNIQUE(symbol_id, date)
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS fundamentals_overview (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol_id INTEGER NOT NULL,
                market_cap REAL,
                pe_ratio REAL,
                pb_ratio REAL,
                dividend_yield REAL,
                eps REAL,
                roe REAL,
                roic REAL,
                raw_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS vibe_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                script_json TEXT NOT NULL,
                compiled_json TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS journal_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                plan_version_hash TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS refresh_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                symbol TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                scheduled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                last_error TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn test_create_and_get_symbol() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let id = repo
            .create_symbol("AAPL", Some("NASDAQ"), Some("Apple Inc"))
            .await
            .unwrap();
        assert!(id > 0);

        let sym = repo.get_symbol_by_ticker("AAPL").await.unwrap();
        assert!(sym.is_some());
        let sym = sym.unwrap();
        assert_eq!(sym.ticker, "AAPL");
        assert_eq!(sym.exchange, Some("NASDAQ".to_string()));
    }

    #[tokio::test]
    async fn test_get_symbol_not_found() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);
        let result = repo.get_symbol_by_ticker("NONEXISTENT").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_list_symbols() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        repo.create_symbol("AAPL", None, None).await.unwrap();
        repo.create_symbol("MSFT", None, None).await.unwrap();

        let symbols = repo.list_symbols(10).await.unwrap();
        assert_eq!(symbols.len(), 2);
    }

    #[tokio::test]
    async fn test_insert_and_get_price() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let sym_id = repo.create_symbol("AAPL", None, None).await.unwrap();
        let price_id = repo
            .insert_price(sym_id, "2024-01-15", 150.0, 155.0, 148.0, 152.0, 1000000)
            .await
            .unwrap();
        assert!(price_id > 0);

        let prices = repo.get_prices_for_symbol(sym_id, 10).await.unwrap();
        assert_eq!(prices.len(), 1);
        assert!((prices[0].close - 152.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_get_latest_price_date() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let sym_id = repo.create_symbol("AAPL", None, None).await.unwrap();
        repo.insert_price(sym_id, "2024-01-10", 148.0, 150.0, 147.0, 149.0, 500000)
            .await
            .unwrap();
        repo.insert_price(sym_id, "2024-01-15", 150.0, 155.0, 148.0, 152.0, 1000000)
            .await
            .unwrap();

        let date = repo.get_latest_price_date(sym_id).await.unwrap();
        assert!(date.is_some());
        assert_eq!(date.unwrap(), "2024-01-15");
    }

    #[tokio::test]
    async fn test_get_latest_price_date_empty() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);
        let sym_id = repo.create_symbol("AAPL", None, None).await.unwrap();
        let date = repo.get_latest_price_date(sym_id).await.unwrap();
        assert!(date.is_none());
    }

    #[tokio::test]
    async fn test_create_and_get_plan() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let script = r#"{"name":"Growth Plan"}"#;
        let plan_id = repo.create_plan("Growth Plan", script).await.unwrap();
        assert!(plan_id > 0);

        let plan = repo.get_plan(plan_id).await.unwrap();
        assert!(plan.is_some());
        let plan = plan.unwrap();
        assert_eq!(plan.name, "Growth Plan");
        assert_eq!(plan.script_json, script);
    }

    #[tokio::test]
    async fn test_update_plan() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let plan_id = repo.create_plan("Plan A", r#"{"v":1}"#).await.unwrap();
        repo.update_plan(plan_id, r#"{"v":2}"#, Some(r#"{"compiled":true}"#))
            .await
            .unwrap();

        let plan = repo.get_plan(plan_id).await.unwrap().unwrap();
        assert_eq!(plan.script_json, r#"{"v":2}"#);
        assert_eq!(plan.compiled_json, Some(r#"{"compiled":true}"#.to_string()));
    }

    #[tokio::test]
    async fn test_list_plans() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        repo.create_plan("Plan A", "{}").await.unwrap();
        repo.create_plan("Plan B", "{}").await.unwrap();

        let plans = repo.list_plans().await.unwrap();
        assert_eq!(plans.len(), 2);
    }

    #[tokio::test]
    async fn test_create_and_get_journal_entry() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let plan_id = repo.create_plan("Plan", "{}").await.unwrap();
        let entry_id = repo
            .create_journal_entry(plan_id, "TRADE", r#"{"symbol":"AAPL"}"#, "hash123")
            .await
            .unwrap();
        assert!(entry_id > 0);

        let entries = repo.get_journal_entries(plan_id, 10).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].event_type, "TRADE");
    }

    #[tokio::test]
    async fn test_upsert_and_get_fundamental() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let sym_id = repo.create_symbol("AAPL", None, None).await.unwrap();
        let raw = r#"{"pe_ratio":25.5}"#;
        let fund_id = repo.upsert_fundamental(sym_id, raw).await.unwrap();
        assert!(fund_id > 0);

        let fund = repo.get_fundamental(sym_id).await.unwrap();
        assert!(fund.is_some());
        assert_eq!(fund.unwrap().raw_json, raw);
    }

    #[tokio::test]
    async fn test_upsert_fundamental_replaces_existing() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let sym_id = repo.create_symbol("AAPL", None, None).await.unwrap();
        repo.upsert_fundamental(sym_id, r#"{"v":1}"#).await.unwrap();
        repo.upsert_fundamental(sym_id, r#"{"v":2}"#).await.unwrap();

        let fund = repo.get_fundamental(sym_id).await.unwrap().unwrap();
        assert_eq!(fund.raw_json, r#"{"v":2}"#);
    }

    #[tokio::test]
    async fn test_create_and_get_pending_jobs() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let job_id = repo
            .create_refresh_job("alphavantage", "/quote", Some("AAPL"))
            .await
            .unwrap();
        assert!(job_id > 0);

        let jobs = repo.get_pending_jobs(10).await.unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].provider, "alphavantage");
    }

    #[tokio::test]
    async fn test_update_job_status() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let job_id = repo
            .create_refresh_job("finnhub", "/quote", None)
            .await
            .unwrap();
        repo.update_job_status(job_id, "completed", None)
            .await
            .unwrap();

        let pending = repo.get_pending_jobs(10).await.unwrap();
        assert!(pending.is_empty(), "Completed job should not be in pending");
    }

    #[tokio::test]
    async fn test_update_job_status_with_error() {
        let pool = setup_db().await;
        let repo = Repository::new(pool);

        let job_id = repo
            .create_refresh_job("polygon", "/aggs", Some("SPY"))
            .await
            .unwrap();
        repo.update_job_status(job_id, "failed", Some("Rate limit exceeded"))
            .await
            .unwrap();

        let pending = repo.get_pending_jobs(10).await.unwrap();
        assert!(pending.is_empty());
    }
}
