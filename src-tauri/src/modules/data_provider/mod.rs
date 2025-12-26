use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
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
    pub open: String,
    pub high: String,
    pub low: String,
    pub close: String,
    pub volume: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanyOverview {
    pub symbol: String,
    pub name: Option<String>,
    pub exchange: Option<String>,
    pub currency: Option<String>,
    pub market_cap: Option<String>,
    pub pe_ratio: Option<String>,
    pub dividend_yield: Option<String>,
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
    pub async fn get_time_series_daily(&self, symbol: &str) -> Result<Vec<TimeSeriesDaily>> {
        self.rate_limiter.check("alpha_vantage".to_string()).await?;

        let url = format!(
            "{}?function=TIME_SERIES_DAILY&symbol={}&apikey={}",
            self.base_url, symbol, self.api_key
        );

        let response = self.client.get(&url).send().await?;
        let body = response.text().await?;
        
        // TODO: Parse Alpha Vantage response format
        // For now, return empty vec - will implement full parsing later
        Ok(vec![])
    }

    /// Fetch company overview/fundamentals
    pub async fn get_company_overview(&self, symbol: &str) -> Result<CompanyOverview> {
        self.rate_limiter.check("alpha_vantage".to_string()).await?;

        let url = format!(
            "{}?function=OVERVIEW&symbol={}&apikey={}",
            self.base_url, symbol, self.api_key
        );

        let response = self.client.get(&url).send().await?;
        let overview: CompanyOverview = response.json().await?;
        
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
