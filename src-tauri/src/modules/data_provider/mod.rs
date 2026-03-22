#![allow(dead_code)]

pub mod multi_source_provider;
pub mod free_sources;

pub use multi_source_provider::{MultiSourceProvider, HistoricalPrice};

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::modules::rate_limiter::RateLimiter;

/// Alpha Vantage API client
pub struct AlphaVantageClient {
    client: Client,
    api_key: String,
    rate_limiter: RateLimiter,
    base_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimeSeriesDaily {
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanyOverview {
    #[serde(rename = "Symbol")]
    pub symbol: String,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Exchange")]
    pub exchange: Option<String>,
    #[serde(rename = "Currency")]
    pub currency: Option<String>,
    #[serde(rename = "MarketCapitalization")]
    pub market_cap: Option<String>,
    #[serde(rename = "PERatio")]
    pub pe_ratio: Option<String>,
    #[serde(rename = "DividendYield")]
    pub dividend_yield: Option<String>,
    #[serde(rename = "ReturnOnEquityTTM")]
    pub roe: Option<String>,
    #[serde(rename = "ROIC")]
    pub roic: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlphaVantageError {
    #[serde(rename = "Note")]
    pub note: Option<String>,
    #[serde(rename = "Error Message")]
    pub error_message: Option<String>,
}

impl AlphaVantageClient {
    /// Create new Alpha Vantage client with API key
    pub fn new(api_key: String) -> Self {
        let rate_limiter = RateLimiter::new_daily(25); // Free tier: 25 requests/day
        
        Self {
            client: Client::new(),
            api_key,
            rate_limiter,
            base_url: "https://www.alphavantage.co/query".to_string(),
        }
    }

    /// Fetch daily time series for a symbol
    pub async fn get_time_series_daily(&self, symbol: &str, outputsize: &str) -> Result<Vec<TimeSeriesDaily>> {
        self.rate_limiter.check("alpha_vantage".to_string()).await?;

        let url = format!(
            "{}?function=TIME_SERIES_DAILY&symbol={}&outputsize={}&apikey={}",
            self.base_url, symbol, outputsize, self.api_key
        );

        let response = self.client.get(&url).send().await?;
        let body = response.text().await?;
        
        // Parse response
        let json: Value = serde_json::from_str(&body)?;

        // Check for errors
        if let Some(note) = json.get("Note") {
            anyhow::bail!("API limit: {}", note.as_str().unwrap_or("Rate limit exceeded"));
        }
        if let Some(error) = json.get("Error Message") {
            anyhow::bail!("API error: {}", error.as_str().unwrap_or("Unknown error"));
        }

        // Parse time series data
        let time_series = json
            .get("Time Series (Daily)")
            .ok_or_else(|| anyhow::anyhow!("No time series data found"))?;

        let mut results = Vec::new();

        if let Some(series_map) = time_series.as_object() {
            for (date, values) in series_map {
                if let Some(vals) = values.as_object() {
                    let entry = TimeSeriesDaily {
                        date: date.clone(),
                        open: vals.get("1. open")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0),
                        high: vals.get("2. high")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0),
                        low: vals.get("3. low")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0),
                        close: vals.get("4. close")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0.0),
                        volume: vals.get("5. volume")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0),
                    };
                    results.push(entry);
                }
            }
        }

        // Sort by date descending
        results.sort_by(|a, b| b.date.cmp(&a.date));

        Ok(results)
    }

    /// Fetch company overview/fundamentals
    pub async fn get_company_overview(&self, symbol: &str) -> Result<CompanyOverview> {
        self.rate_limiter.check("alpha_vantage".to_string()).await?;

        let url = format!(
            "{}?function=OVERVIEW&symbol={}&apikey={}",
            self.base_url, symbol, self.api_key
        );

        let response = self.client.get(&url).send().await?;
        let body = response.text().await?;
        
        // Check for errors first
        let json: Value = serde_json::from_str(&body)?;
        if let Some(note) = json.get("Note") {
            anyhow::bail!("API limit: {}", note.as_str().unwrap_or("Rate limit exceeded"));
        }
        if let Some(error) = json.get("Error Message") {
            anyhow::bail!("API error: {}", error.as_str().unwrap_or("Unknown error"));
        }

        let overview: CompanyOverview = serde_json::from_str(&body)?;
        Ok(overview)
    }

    /// Get remaining API quota
    pub fn remaining_quota(&self) -> u32 {
        self.rate_limiter.remaining_capacity("alpha_vantage")
    }
}

/// Provider trait for extensibility
pub trait DataProvider: Send + Sync {
    fn name(&self) -> &str;
    fn remaining_quota(&self) -> u32;
}

impl DataProvider for AlphaVantageClient {
    fn name(&self) -> &str {
        "Alpha Vantage"
    }

    fn remaining_quota(&self) -> u32 {
        self.remaining_quota()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = AlphaVantageClient::new("demo".to_string());
        assert_eq!(client.name(), "Alpha Vantage");
    }

    #[test]
    fn test_remaining_quota_returns_placeholder() {
        let client = AlphaVantageClient::new("test_key".to_string());
        let quota = client.remaining_quota();
        assert_eq!(quota, 25);
    }

    #[test]
    fn test_data_provider_trait_name() {
        let client = AlphaVantageClient::new("test_key".to_string());
        let provider: &dyn DataProvider = &client;
        assert_eq!(provider.name(), "Alpha Vantage");
    }

    #[test]
    fn test_data_provider_trait_remaining_quota() {
        let client = AlphaVantageClient::new("test_key".to_string());
        let provider: &dyn DataProvider = &client;
        assert_eq!(provider.remaining_quota(), 25);
    }

    #[test]
    fn new_sets_base_url() {
        let client = AlphaVantageClient::new("key".to_string());
        assert_eq!(client.base_url, "https://www.alphavantage.co/query");
    }

    #[test]
    fn new_stores_api_key() {
        let client = AlphaVantageClient::new("test_key".to_string());
        assert_eq!(client.api_key, "test_key");
    }

    #[test]
    fn remaining_quota_starts_positive() {
        let client = AlphaVantageClient::new("k".to_string());
        assert!(client.remaining_quota() > 0);
    }

    #[test]
    fn time_series_daily_serializes() {
        let entry = TimeSeriesDaily {
            date: "2024-01-15".to_string(),
            open: 100.0,
            high: 105.0,
            low: 99.0,
            close: 103.0,
            volume: 1_000_000,
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["date"], "2024-01-15");
    }

    #[test]
    fn time_series_daily_deserializes() {
        let raw = r#"{"date":"2024-01-15","open":100.0,"high":105.0,"low":99.0,"close":103.0,"volume":1000000}"#;
        let entry: TimeSeriesDaily = serde_json::from_str(raw).unwrap();
        assert_eq!(entry.date, "2024-01-15");
        assert_eq!(entry.open, 100.0);
        assert_eq!(entry.high, 105.0);
        assert_eq!(entry.low, 99.0);
        assert_eq!(entry.close, 103.0);
        assert_eq!(entry.volume, 1_000_000);
    }

    #[test]
    fn company_overview_deserializes_renamed_fields() {
        let raw = r#"{"Symbol":"AAPL","Name":"Apple Inc","PERatio":"25.5"}"#;
        let overview: CompanyOverview = serde_json::from_str(raw).unwrap();
        assert_eq!(overview.symbol, "AAPL");
        assert_eq!(overview.pe_ratio, Some("25.5".to_string()));
    }

    #[test]
    fn company_overview_serializes_with_renames() {
        let overview = CompanyOverview {
            symbol: "AAPL".to_string(),
            name: None,
            exchange: None,
            currency: None,
            market_cap: None,
            pe_ratio: None,
            dividend_yield: None,
            roe: None,
            roic: None,
        };
        let json = serde_json::to_value(&overview).unwrap();
        assert!(json.get("Symbol").is_some(), "expected key 'Symbol' not 'symbol'");
        assert_eq!(json["Symbol"], "AAPL");
    }

    #[test]
    fn alpha_vantage_error_deserializes_note() {
        let raw = r#"{"Note": "API rate limit"}"#;
        let err: AlphaVantageError = serde_json::from_str(raw).unwrap();
        assert_eq!(err.note, Some("API rate limit".to_string()));
    }
}
