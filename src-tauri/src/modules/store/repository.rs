use super::models::*;
use anyhow::Result;
use sqlx::{SqlitePool, Row};

/// Repository for database operations
pub struct Repository {
    pool: SqlitePool,
}

impl Repository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    // Symbol operations
    pub async fn create_symbol(&self, symbol: &str, exchange: Option<&str>, name: Option<&str>) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO symbols (ticker, exchange, name, currency, status) VALUES (?, ?, ?, ?, ?)"
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
        let symbol = sqlx::query_as::<_, Symbol>(
            "SELECT * FROM symbols WHERE ticker = ?"
        )
        .bind(ticker)
        .fetch_optional(&self.pool)
        .await?;

        Ok(symbol)
    }

    pub async fn list_symbols(&self, limit: i64) -> Result<Vec<Symbol>> {
        let symbols = sqlx::query_as::<_, Symbol>(
            "SELECT * FROM symbols WHERE status = 'active' ORDER BY ticker LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(symbols)
    }

    // Price operations
    pub async fn insert_price(&self, symbol_id: i64, date: &str, open: f64, high: f64, low: f64, close: f64, volume: i64) -> Result<i64> {
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

    pub async fn get_prices_for_symbol(&self, symbol_id: i64, limit: i64) -> Result<Vec<PriceDaily>> {
        let prices = sqlx::query_as::<_, PriceDaily>(
            "SELECT * FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT ?"
        )
        .bind(symbol_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(prices)
    }

    pub async fn get_latest_price_date(&self, symbol_id: i64) -> Result<Option<String>> {
        let row = sqlx::query(
            "SELECT date FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT 1"
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.get::<String, _>("date")))
    }

    // VibePlan operations
    pub async fn create_plan(&self, name: &str, script_json: &str) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO vibe_plans (name, version, script_json) VALUES (?, ?, ?)"
        )
        .bind(name)
        .bind(1)
        .bind(script_json)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn update_plan(&self, plan_id: i64, script_json: &str, compiled_json: Option<&str>) -> Result<()> {
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
        let plan = sqlx::query_as::<_, VibePlan>(
            "SELECT * FROM vibe_plans WHERE id = ?"
        )
        .bind(plan_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(plan)
    }

    pub async fn list_plans(&self) -> Result<Vec<VibePlan>> {
        let plans = sqlx::query_as::<_, VibePlan>(
            "SELECT * FROM vibe_plans ORDER BY updated_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(plans)
    }

    // Journal operations
    pub async fn create_journal_entry(&self, plan_id: i64, event_type: &str, payload_json: &str, plan_version_hash: &str) -> Result<i64> {
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
            "SELECT * FROM journal_events WHERE plan_id = ? ORDER BY timestamp DESC LIMIT ?"
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
        let result = sqlx::query(
            "INSERT INTO fundamentals_overview (symbol_id, raw_json) VALUES (?, ?)"
        )
        .bind(symbol_id)
        .bind(raw_json)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_fundamental(&self, symbol_id: i64) -> Result<Option<FundamentalOverview>> {
        let fundamental = sqlx::query_as::<_, FundamentalOverview>(
            "SELECT * FROM fundamentals_overview WHERE symbol_id = ?"
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(fundamental)
    }

    // Refresh job operations
    pub async fn create_refresh_job(&self, provider: &str, endpoint: &str, symbol: Option<&str>) -> Result<i64> {
        let result = sqlx::query(
            "INSERT INTO refresh_jobs (provider, endpoint, symbol, status) VALUES (?, ?, ?, ?)"
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
            "SELECT * FROM refresh_jobs WHERE status = 'pending' ORDER BY scheduled_at ASC LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(jobs)
    }

    pub async fn update_job_status(&self, job_id: i64, status: &str, error: Option<&str>) -> Result<()> {
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
