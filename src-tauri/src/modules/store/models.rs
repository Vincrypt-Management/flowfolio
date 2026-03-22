#![allow(dead_code)]

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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, Utc};

    #[test]
    fn test_symbol_serializes_and_deserializes() {
        let symbol = Symbol {
            id: 1,
            ticker: "AAPL".to_string(),
            exchange: Some("NASDAQ".to_string()),
            name: Some("Apple Inc".to_string()),
            currency: Some("USD".to_string()),
            status: "active".to_string(),
            created_at: Utc::now(),
        };
        let json = serde_json::to_string(&symbol).unwrap();
        let deserialized: Symbol = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ticker, "AAPL");
        assert_eq!(deserialized.id, 1);
        assert_eq!(deserialized.exchange, Some("NASDAQ".to_string()));
        assert_eq!(deserialized.status, "active");
    }

    #[test]
    fn test_price_daily_serializes_and_deserializes() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let price = PriceDaily {
            id: 42,
            symbol_id: 1,
            date,
            open: 180.0,
            high: 185.5,
            low: 179.0,
            close: 184.2,
            adj_close: Some(184.2),
            volume: 12_000_000,
        };
        let json = serde_json::to_string(&price).unwrap();
        // NaiveDate serializes as "YYYY-MM-DD"
        assert!(json.contains("2024-01-15"));
        let deserialized: PriceDaily = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.date, date);
        assert_eq!(deserialized.close, 184.2);
        assert_eq!(deserialized.volume, 12_000_000);
    }

    #[test]
    fn test_vibe_plan_serializes_and_deserializes_including_optional_compiled_json() {
        let now = Utc::now();
        let plan_with_compiled = VibePlan {
            id: 10,
            name: "Growth Vibe".to_string(),
            version: 3,
            script_json: r#"{"factors":[]}"#.to_string(),
            compiled_json: Some(r#"{"compiled":true}"#.to_string()),
            created_at: now,
            updated_at: now,
        };
        let json = serde_json::to_string(&plan_with_compiled).unwrap();
        let deserialized: VibePlan = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "Growth Vibe");
        assert_eq!(deserialized.version, 3);
        assert!(deserialized.compiled_json.is_some());

        let plan_no_compiled = VibePlan {
            id: 11,
            name: "Simple Vibe".to_string(),
            version: 1,
            script_json: r#"{"factors":[]}"#.to_string(),
            compiled_json: None,
            created_at: now,
            updated_at: now,
        };
        let json2 = serde_json::to_string(&plan_no_compiled).unwrap();
        let deserialized2: VibePlan = serde_json::from_str(&json2).unwrap();
        assert_eq!(deserialized2.compiled_json, None);
    }

    #[test]
    fn test_journal_event_serializes_and_deserializes() {
        let event = JournalEvent {
            id: 5,
            plan_id: 10,
            timestamp: Utc::now(),
            event_type: "BUY".to_string(),
            payload_json: r#"{"ticker":"TSLA","qty":10}"#.to_string(),
            plan_version_hash: "abc123def456".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: JournalEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.event_type, "BUY");
        assert_eq!(deserialized.plan_id, 10);
        assert_eq!(deserialized.plan_version_hash, "abc123def456");
    }

    #[test]
    fn test_refresh_job_with_none_completed_at_and_last_error_serializes_correctly() {
        let job = RefreshJob {
            id: 7,
            provider: "finnhub".to_string(),
            endpoint: "/quote".to_string(),
            symbol: Some("MSFT".to_string()),
            status: "pending".to_string(),
            scheduled_at: Utc::now(),
            completed_at: None,
            last_error: None,
        };
        let json = serde_json::to_string(&job).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["provider"], "finnhub");
        assert_eq!(value["status"], "pending");
        assert!(value["completed_at"].is_null());
        assert!(value["last_error"].is_null());

        let deserialized: RefreshJob = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.completed_at, None);
        assert_eq!(deserialized.last_error, None);
    }

    #[test]
    fn test_fundamental_overview_serializes_and_deserializes() {
        let overview = FundamentalOverview {
            id: 3,
            symbol_id: 1,
            market_cap: Some(3_000_000_000_000.0),
            pe_ratio: Some(28.5),
            pb_ratio: Some(45.2),
            dividend_yield: Some(0.006),
            eps: Some(6.42),
            roe: Some(1.47),
            roic: Some(0.55),
            raw_json: r#"{"source":"finnhub"}"#.to_string(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&overview).unwrap();
        let deserialized: FundamentalOverview = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, 3);
        assert_eq!(deserialized.symbol_id, 1);
        assert!((deserialized.pe_ratio.unwrap() - 28.5).abs() < f64::EPSILON);
        assert_eq!(deserialized.raw_json, r#"{"source":"finnhub"}"#);
        assert_eq!(deserialized.roe, Some(1.47));
    }
}
