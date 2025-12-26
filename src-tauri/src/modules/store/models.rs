use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, NaiveDate};

/// Symbol metadata
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Symbol {
    pub id: i64,
    pub ticker: String,
    pub exchange: Option<String>,
    pub name: Option<String>,
    pub currency: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

/// Daily price data
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PriceDaily {
    pub id: i64,
    pub symbol_id: i64,
    pub date: NaiveDate,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub adj_close: Option<f64>,
    pub volume: i64,
}

/// Fundamental data overview
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FundamentalOverview {
    pub id: i64,
    pub symbol_id: i64,
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub pb_ratio: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub eps: Option<f64>,
    pub roe: Option<f64>,
    pub roic: Option<f64>,
    pub raw_json: String,
    pub updated_at: DateTime<Utc>,
}

/// VibePlan - the core investing plan
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VibePlan {
    pub id: i64,
    pub name: String,
    pub version: i32,
    pub script_json: String,
    pub compiled_json: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Journal event for tracking decisions
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEvent {
    pub id: i64,
    pub plan_id: i64,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub payload_json: String,
    pub plan_version_hash: String,
}

/// Refresh job for data fetching
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RefreshJob {
    pub id: i64,
    pub provider: String,
    pub endpoint: String,
    pub symbol: Option<String>,
    pub status: String,
    pub scheduled_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}
