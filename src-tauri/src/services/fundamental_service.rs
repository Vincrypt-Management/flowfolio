// Fundamental Data Service - Backend Implementation
// Fetches company financials from Yahoo Finance and Alpha Vantage
// Features: Caching, rate limiting, fallback providers

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Fundamental metrics for a company
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FundamentalMetrics {
    pub symbol: String,
    pub company_name: String,
    pub sector: String,
    pub industry: String,
    pub market_cap: f64,
    
    // Valuation metrics
    pub pe_ratio: Option<f64>,
    pub forward_pe: Option<f64>,
    pub peg_ratio: Option<f64>,
    pub price_to_book: Option<f64>,
    pub price_to_sales: Option<f64>,
    pub ev_to_ebitda: Option<f64>,
    
    // Profitability metrics
    pub profit_margin: Option<f64>,
    pub operating_margin: Option<f64>,
    pub return_on_assets: Option<f64>,
    pub return_on_equity: Option<f64>,
    
    // Growth metrics
    pub revenue_growth_yoy: Option<f64>,
    pub earnings_growth_yoy: Option<f64>,
    
    // Financial health
    pub debt_to_equity: Option<f64>,
    pub current_ratio: Option<f64>,
    pub quick_ratio: Option<f64>,
    pub free_cash_flow: Option<f64>,
    
    // Dividend metrics
    pub dividend_yield: Option<f64>,
    pub payout_ratio: Option<f64>,
    
    // Additional info
    pub eps: Option<f64>,
    pub beta: Option<f64>,
    pub fifty_two_week_high: Option<f64>,
    pub fifty_two_week_low: Option<f64>,
    
    // Source and timestamp
    pub source: String,
    pub last_updated: String,
}

/// Cache entry for fundamentals
struct CacheEntry {
    data: FundamentalMetrics,
    timestamp: Instant,
}

/// Fundamental Data Service
pub struct FundamentalDataService {
    client: Client,
    alpha_vantage_key: Option<String>,
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    cache_ttl: Duration,
}

impl FundamentalDataService {
    /// Create new service
    pub fn new() -> Self {
        use crate::core::encrypted_env::get_env_var;
        let alpha_vantage_key = get_env_var("ALPHA_VANTAGE_API_KEY");
        
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            alpha_vantage_key,
            cache: Arc::new(RwLock::new(HashMap::new())),
            cache_ttl: Duration::from_secs(48 * 60 * 60), // 48 hours
        }
    }

    /// Check if Alpha Vantage is configured
    #[allow(dead_code)]
    pub fn has_alpha_vantage(&self) -> bool {
        self.alpha_vantage_key.is_some()
    }

    /// Get fundamentals for a symbol
    pub async fn get_fundamentals(&self, symbol: &str) -> Result<FundamentalMetrics, String> {
        let symbol = symbol.to_uppercase();
        
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(&symbol) {
                if entry.timestamp.elapsed() < self.cache_ttl {
                    tracing::debug!(symbol = %symbol, "Fundamentals cache hit");
                    return Ok(entry.data.clone());
                }
            }
        }

        // Try Yahoo Finance first (free, no API key required)
        match self.fetch_from_yahoo(&symbol).await {
            Ok(data) => {
                // Cache the result
                let mut cache = self.cache.write().await;
                cache.insert(symbol.clone(), CacheEntry {
                    data: data.clone(),
                    timestamp: Instant::now(),
                });
                return Ok(data);
            }
            Err(e) => {
                tracing::warn!(symbol = %symbol, error = %e, "Yahoo Finance fundamentals failed");
            }
        }

        // Fallback to Alpha Vantage if configured
        if self.alpha_vantage_key.is_some() {
            match self.fetch_from_alpha_vantage(&symbol).await {
                Ok(data) => {
                    let mut cache = self.cache.write().await;
                    cache.insert(symbol.clone(), CacheEntry {
                        data: data.clone(),
                        timestamp: Instant::now(),
                    });
                    return Ok(data);
                }
                Err(e) => {
                    tracing::warn!(symbol = %symbol, error = %e, "Alpha Vantage fundamentals failed");
                }
            }
        }

        Err(format!("Failed to fetch fundamentals for {}", symbol))
    }

    /// Fetch from Yahoo Finance
    async fn fetch_from_yahoo(&self, symbol: &str) -> Result<FundamentalMetrics, String> {
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=defaultKeyStatistics,financialData,summaryDetail,price",
            symbol
        );

        tracing::debug!(symbol = %symbol, "Fetching fundamentals from Yahoo Finance");

        let response = self.client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Yahoo Finance returned status {}", response.status()));
        }

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let result = data.get("quoteSummary")
            .and_then(|q| q.get("result"))
            .and_then(|r| r.get(0))
            .ok_or_else(|| "Invalid Yahoo Finance response".to_string())?;

        let key_stats = result.get("defaultKeyStatistics").unwrap_or(&serde_json::Value::Null);
        let financial_data = result.get("financialData").unwrap_or(&serde_json::Value::Null);
        let summary_detail = result.get("summaryDetail").unwrap_or(&serde_json::Value::Null);
        let price_data = result.get("price").unwrap_or(&serde_json::Value::Null);

        Ok(FundamentalMetrics {
            symbol: symbol.to_string(),
            company_name: Self::extract_string(price_data, &["longName"])
                .or_else(|| Self::extract_string(price_data, &["shortName"]))
                .unwrap_or_else(|| symbol.to_string()),
            sector: Self::extract_string(price_data, &["sector"]).unwrap_or_else(|| "Unknown".to_string()),
            industry: Self::extract_string(price_data, &["industry"]).unwrap_or_else(|| "Unknown".to_string()),
            market_cap: Self::extract_raw_number(price_data, &["marketCap"]).unwrap_or(0.0),
            
            pe_ratio: Self::extract_raw_number(summary_detail, &["trailingPE"]),
            forward_pe: Self::extract_raw_number(summary_detail, &["forwardPE"]),
            peg_ratio: Self::extract_raw_number(key_stats, &["pegRatio"]),
            price_to_book: Self::extract_raw_number(key_stats, &["priceToBook"]),
            price_to_sales: Self::extract_raw_number(summary_detail, &["priceToSalesTrailing12Months"]),
            ev_to_ebitda: Self::extract_raw_number(key_stats, &["enterpriseToEbitda"]),
            
            profit_margin: Self::extract_raw_number(financial_data, &["profitMargins"]),
            operating_margin: Self::extract_raw_number(financial_data, &["operatingMargins"]),
            return_on_assets: Self::extract_raw_number(financial_data, &["returnOnAssets"]),
            return_on_equity: Self::extract_raw_number(financial_data, &["returnOnEquity"]),
            
            revenue_growth_yoy: Self::extract_raw_number(financial_data, &["revenueGrowth"]),
            earnings_growth_yoy: Self::extract_raw_number(financial_data, &["earningsGrowth"]),
            
            debt_to_equity: Self::extract_raw_number(financial_data, &["debtToEquity"]),
            current_ratio: Self::extract_raw_number(financial_data, &["currentRatio"]),
            quick_ratio: Self::extract_raw_number(financial_data, &["quickRatio"]),
            free_cash_flow: Self::extract_raw_number(financial_data, &["freeCashflow"]),
            
            dividend_yield: Self::extract_raw_number(summary_detail, &["dividendYield"]),
            payout_ratio: Self::extract_raw_number(summary_detail, &["payoutRatio"]),
            
            eps: Self::extract_raw_number(key_stats, &["trailingEps"]),
            beta: Self::extract_raw_number(key_stats, &["beta"]),
            fifty_two_week_high: Self::extract_raw_number(summary_detail, &["fiftyTwoWeekHigh"]),
            fifty_two_week_low: Self::extract_raw_number(summary_detail, &["fiftyTwoWeekLow"]),
            
            source: "yahoo".to_string(),
            last_updated: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Fetch from Alpha Vantage
    async fn fetch_from_alpha_vantage(&self, symbol: &str) -> Result<FundamentalMetrics, String> {
        let api_key = self.alpha_vantage_key.as_ref()
            .ok_or_else(|| "Alpha Vantage API key not configured".to_string())?;

        let url = format!(
            "https://www.alphavantage.co/query?function=OVERVIEW&symbol={}&apikey={}",
            symbol, api_key
        );

        tracing::debug!(symbol = %symbol, "Fetching fundamentals from Alpha Vantage");

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Alpha Vantage returned status {}", response.status()));
        }

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        // Check for rate limit or error
        if data.get("Note").is_some() || data.get("Error Message").is_some() {
            return Err("Alpha Vantage rate limit or error".to_string());
        }

        Ok(FundamentalMetrics {
            symbol: symbol.to_string(),
            company_name: data.get("Name")
                .and_then(|v| v.as_str())
                .unwrap_or(symbol)
                .to_string(),
            sector: data.get("Sector")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            industry: data.get("Industry")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            market_cap: Self::parse_av_number(&data, "MarketCapitalization"),
            
            pe_ratio: Self::parse_av_number_opt(&data, "PERatio"),
            forward_pe: Self::parse_av_number_opt(&data, "ForwardPE"),
            peg_ratio: Self::parse_av_number_opt(&data, "PEGRatio"),
            price_to_book: Self::parse_av_number_opt(&data, "PriceToBookRatio"),
            price_to_sales: Self::parse_av_number_opt(&data, "PriceToSalesRatioTTM"),
            ev_to_ebitda: Self::parse_av_number_opt(&data, "EVToEBITDA"),
            
            profit_margin: Self::parse_av_number_opt(&data, "ProfitMargin"),
            operating_margin: Self::parse_av_number_opt(&data, "OperatingMarginTTM"),
            return_on_assets: Self::parse_av_number_opt(&data, "ReturnOnAssetsTTM"),
            return_on_equity: Self::parse_av_number_opt(&data, "ReturnOnEquityTTM"),
            
            revenue_growth_yoy: Self::parse_av_number_opt(&data, "QuarterlyRevenueGrowthYOY"),
            earnings_growth_yoy: Self::parse_av_number_opt(&data, "QuarterlyEarningsGrowthYOY"),
            
            debt_to_equity: Self::parse_av_number_opt(&data, "DebtToEquity"),
            current_ratio: Self::parse_av_number_opt(&data, "CurrentRatio"),
            quick_ratio: Self::parse_av_number_opt(&data, "QuickRatio"),
            free_cash_flow: None,
            
            dividend_yield: Self::parse_av_number_opt(&data, "DividendYield"),
            payout_ratio: Self::parse_av_number_opt(&data, "PayoutRatio"),
            
            eps: Self::parse_av_number_opt(&data, "EPS"),
            beta: Self::parse_av_number_opt(&data, "Beta"),
            fifty_two_week_high: Self::parse_av_number_opt(&data, "52WeekHigh"),
            fifty_two_week_low: Self::parse_av_number_opt(&data, "52WeekLow"),
            
            source: "alphavantage".to_string(),
            last_updated: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Get fundamentals for multiple symbols
    pub async fn get_batch_fundamentals(&self, symbols: Vec<String>) -> HashMap<String, FundamentalMetrics> {
        let mut results = HashMap::new();
        
        for symbol in symbols {
            match self.get_fundamentals(&symbol).await {
                Ok(data) => {
                    results.insert(symbol, data);
                }
                Err(e) => {
                    tracing::warn!(symbol = %symbol, error = %e, "Failed to get fundamentals");
                }
            }
            // Rate limiting delay
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        
        results
    }

    /// Clear cache
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    // Helper functions
    fn extract_raw_number(obj: &serde_json::Value, path: &[&str]) -> Option<f64> {
        let mut current = obj;
        for key in path {
            current = current.get(*key)?;
        }
        current.get("raw").and_then(|v| v.as_f64())
    }

    fn extract_string(obj: &serde_json::Value, path: &[&str]) -> Option<String> {
        let mut current = obj;
        for key in path {
            current = current.get(*key)?;
        }
        current.as_str().map(|s| s.to_string())
    }

    fn parse_av_number(data: &serde_json::Value, key: &str) -> f64 {
        data.get(key)
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0)
    }

    fn parse_av_number_opt(data: &serde_json::Value, key: &str) -> Option<f64> {
        data.get(key)
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<f64>().ok())
    }
}

impl Default for FundamentalDataService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // 1. new() / has_alpha_vantage() without env var
    // ---------------------------------------------------------------------------
    #[test]
    fn test_new_does_not_panic_and_has_no_av_key_when_env_absent() {
        // Make sure the env var is not set for this test.
        std::env::remove_var("ALPHA_VANTAGE_API_KEY");

        let svc = FundamentalDataService::new();
        assert!(
            !svc.has_alpha_vantage(),
            "has_alpha_vantage() should be false when env var is absent"
        );
    }

    // ---------------------------------------------------------------------------
    // 2-4. parse_av_number
    // ---------------------------------------------------------------------------
    #[test]
    fn test_parse_av_number_valid_key_returns_parsed_f64() {
        let data = serde_json::json!({"PERatio": "25.5"});
        let result = FundamentalDataService::parse_av_number(&data, "PERatio");
        assert!(
            (result - 25.5).abs() < 0.001,
            "expected 25.5, got {result}"
        );
    }

    #[test]
    fn test_parse_av_number_missing_key_returns_zero() {
        let data = serde_json::json!({});
        let result = FundamentalDataService::parse_av_number(&data, "NonExistentKey");
        assert_eq!(result, 0.0, "missing key should return 0.0");
    }

    #[test]
    fn test_parse_av_number_non_numeric_value_returns_zero() {
        let data = serde_json::json!({"PERatio": "N/A"});
        let result = FundamentalDataService::parse_av_number(&data, "PERatio");
        assert_eq!(result, 0.0, "non-numeric string should return 0.0");
    }

    // ---------------------------------------------------------------------------
    // 5-7. parse_av_number_opt
    // ---------------------------------------------------------------------------
    #[test]
    fn test_parse_av_number_opt_valid_key_returns_some() {
        let data = serde_json::json!({"Beta": "1.23"});
        let result = FundamentalDataService::parse_av_number_opt(&data, "Beta");
        assert!(result.is_some(), "expected Some(f64)");
        assert!(
            (result.unwrap() - 1.23).abs() < 0.001,
            "expected 1.23, got {:?}",
            result
        );
    }

    #[test]
    fn test_parse_av_number_opt_missing_key_returns_none() {
        let data = serde_json::json!({});
        let result = FundamentalDataService::parse_av_number_opt(&data, "NonExistentKey");
        assert!(result.is_none(), "missing key should return None");
    }

    #[test]
    fn test_parse_av_number_opt_non_numeric_value_returns_none() {
        let data = serde_json::json!({"Beta": "None"});
        let result = FundamentalDataService::parse_av_number_opt(&data, "Beta");
        assert!(result.is_none(), "non-numeric string should return None");
    }

    // ---------------------------------------------------------------------------
    // 8. Cache TTL – fresh entry is still within cache_ttl
    // ---------------------------------------------------------------------------
    #[tokio::test]
    async fn test_cache_fresh_entry_is_within_ttl() {
        std::env::remove_var("ALPHA_VANTAGE_API_KEY");
        let svc = FundamentalDataService::new();

        let metrics = FundamentalMetrics {
            symbol: "AAPL".to_string(),
            company_name: "Apple Inc.".to_string(),
            sector: "Technology".to_string(),
            industry: "Consumer Electronics".to_string(),
            market_cap: 3_000_000_000_000.0,
            pe_ratio: Some(28.5),
            forward_pe: None,
            peg_ratio: None,
            price_to_book: None,
            price_to_sales: None,
            ev_to_ebitda: None,
            profit_margin: None,
            operating_margin: None,
            return_on_assets: None,
            return_on_equity: None,
            revenue_growth_yoy: None,
            earnings_growth_yoy: None,
            debt_to_equity: None,
            current_ratio: None,
            quick_ratio: None,
            free_cash_flow: None,
            dividend_yield: None,
            payout_ratio: None,
            eps: None,
            beta: None,
            fifty_two_week_high: None,
            fifty_two_week_low: None,
            source: "test".to_string(),
            last_updated: "2026-03-15T00:00:00Z".to_string(),
        };

        // Insert a fresh entry directly into the cache.
        {
            let mut cache = svc.cache.write().await;
            cache.insert(
                "AAPL".to_string(),
                CacheEntry {
                    data: metrics,
                    timestamp: Instant::now(),
                },
            );
        }

        // Verify the entry is present and still fresh.
        let cache = svc.cache.read().await;
        assert_eq!(cache.len(), 1, "cache should contain exactly one entry");

        let entry = cache.get("AAPL").expect("AAPL entry should be in cache");
        assert!(
            entry.timestamp.elapsed() < svc.cache_ttl,
            "fresh entry should have elapsed time less than cache_ttl (48h)"
        );
    }

    // ---------------------------------------------------------------------------
    // 9. Default delegates to new()
    // ---------------------------------------------------------------------------
    #[test]
    fn test_default_creates_service_equivalent_to_new() {
        std::env::remove_var("ALPHA_VANTAGE_API_KEY");

        let from_new = FundamentalDataService::new();
        let from_default = FundamentalDataService::default();

        // Both should agree on has_alpha_vantage() and cache_ttl.
        assert_eq!(
            from_new.has_alpha_vantage(),
            from_default.has_alpha_vantage(),
            "new() and default() should agree on has_alpha_vantage()"
        );
        assert_eq!(
            from_new.cache_ttl, from_default.cache_ttl,
            "new() and default() should have the same cache_ttl"
        );
    }

    // ---------------------------------------------------------------------------
    // 10. cache_ttl is 48 hours (172_800 seconds)
    // ---------------------------------------------------------------------------
    #[test]
    fn test_cache_ttl_is_48_hours() {
        std::env::remove_var("ALPHA_VANTAGE_API_KEY");
        let svc = FundamentalDataService::new();
        assert_eq!(
            svc.cache_ttl.as_secs(),
            172_800,
            "cache_ttl should be 172800 seconds (48 hours)"
        );
    }
}
