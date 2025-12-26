pub mod sync_service;

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::modules::rate_limiter::RateLimiter;
use std::collections::HashMap;

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
}
