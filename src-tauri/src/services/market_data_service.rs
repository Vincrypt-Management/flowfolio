use crate::modules::quant_analysis::{HistoricalPrice, QuantAnalyzer, QuantMetrics};
use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct MarketDataService {
    client: Client,
    cache: Arc<RwLock<HashMap<String, Vec<HistoricalPrice>>>>,
}

impl MarketDataService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap(),
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Fetch historical data for a symbol (1 year daily) with retry logic
    pub async fn fetch_historical_data(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(data) = cache.get(symbol) {
                return Ok(data.clone());
            }
        }

        // Try Yahoo Finance with retries
        let mut last_error = String::new();
        for attempt in 1..=3 {
            match self.fetch_from_yahoo(symbol).await {
                Ok(data) => {
                    let mut cache = self.cache.write().await;
                    cache.insert(symbol.to_string(), data.clone());
                    return Ok(data);
                }
                Err(e) => {
                    last_error = e.clone();
                    eprintln!("Attempt {} failed for {}: {}", attempt, symbol, e);
                    if attempt < 3 {
                        // Exponential backoff: 1s, 2s, 4s
                        let delay_ms = 1000 * (1 << (attempt - 1));
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    }
                }
            }
        }

        // After all retries failed, return error
        eprintln!("All fetch attempts failed for {}", symbol);
        Err(format!("Failed to fetch data for {}: {}", symbol, last_error))
    }

    /// Fetch from Yahoo Finance API with robust error handling
    async fn fetch_from_yahoo(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        // Get 1 year of data
        let end_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let start_time = end_time - (365 * 24 * 60 * 60); // 1 year ago

        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d",
            symbol, start_time, end_time
        );

        // Send request with error handling
        let response = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                eprintln!("Network error fetching {}: {}", symbol, e);
                return Err(format!("Network error: {}", e));
            }
        };

        // Check status code
        if !response.status().is_success() {
            eprintln!("HTTP error for {}: {}", symbol, response.status());
            return Err(format!("HTTP error: {}", response.status()));
        }

        // Get response text first for better error handling
        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Failed to read response for {}: {}", symbol, e);
                return Err(format!("Read error: {}", e));
            }
        };

        // Try to parse JSON with detailed error
        let data: Value = match serde_json::from_str(&text) {
            Ok(json) => json,
            Err(e) => {
                eprintln!("JSON parse error for {}: {}", symbol, e);
                eprintln!("Response text (first 500 chars): {}", &text[..text.len().min(500)]);
                return Err(format!("JSON parse error: {}", e));
            }
        };

        // Check for API error in response
        if let Some(error) = data.get("chart").and_then(|c| c.get("error")) {
            eprintln!("Yahoo API error for {}: {:?}", symbol, error);
            return Err(format!("API error: {:?}", error));
        }

        self.parse_yahoo_response(&data)
    }

    fn parse_yahoo_response(&self, data: &Value) -> Result<Vec<HistoricalPrice>, String> {
        // Detailed parsing with better error messages
        let chart = data.get("chart")
            .ok_or("Missing 'chart' field in response")?;

        let result_array = chart.get("result")
            .and_then(|r| r.as_array())
            .ok_or("Missing or invalid 'result' field")?;

        if result_array.is_empty() {
            return Err("Empty result array - symbol may not exist".to_string());
        }

        let result = &result_array[0];

        let timestamps = result.get("timestamp")
            .and_then(|t| t.as_array())
            .ok_or("No timestamps in response")?;

        let indicators = result.get("indicators")
            .ok_or("Missing 'indicators' field")?;

        let quote_array = indicators.get("quote")
            .and_then(|q| q.as_array())
            .ok_or("Missing or invalid 'quote' field")?;

        if quote_array.is_empty() {
            return Err("Empty quote array".to_string());
        }

        let closes = quote_array[0].get("close")
            .and_then(|c| c.as_array())
            .ok_or("No close prices in response")?;

        let mut prices = Vec::new();
        for (i, timestamp) in timestamps.iter().enumerate() {
            if let Some(ts) = timestamp.as_i64() {
                // Handle null values in close prices
                if let Some(close_value) = closes.get(i) {
                    if let Some(close) = close_value.as_f64() {
                        let date = chrono::DateTime::from_timestamp(ts, 0)
                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                            .unwrap_or_default();
                        
                        prices.push(HistoricalPrice { date, close });
                    }
                    // Skip null values
                }
            }
        }

        if prices.is_empty() {
            Err("No valid price data found after parsing".to_string())
        } else {
            Ok(prices)
        }
    }

    /// Calculate quantitative metrics for a symbol
    pub async fn get_quant_metrics(&self, symbol: &str) -> Result<QuantMetrics, String> {
        let prices = self.fetch_historical_data(symbol).await?;
        Ok(QuantAnalyzer::calculate_metrics(symbol, &prices))
    }

    /// Batch calculate metrics for multiple symbols with parallel processing
    pub async fn batch_get_quant_metrics(&self, symbols: Vec<String>) -> Vec<QuantMetrics> {
        use futures::stream::{self, StreamExt};
        
        let results: Vec<QuantMetrics> = stream::iter(symbols)
            .map(|symbol| async move {
                match self.get_quant_metrics(&symbol).await {
                    Ok(metrics) => metrics,
                    Err(_) => QuantMetrics {
                        symbol: symbol.clone(),
                        sharpe_ratio: 0.0,
                        annualized_return: 0.0,
                        volatility: 0.0,
                        max_drawdown: 0.0,
                        rsi: 50.0,
                        signal: "INSUFFICIENT DATA".to_string(),
                        confidence: 0.0,
                    },
                }
            })
            .buffer_unordered(2) // Reduced from 10 to 2 to avoid rate limits
            .collect()
            .await;

        results
    }

    /// Get current price for a symbol with robust error handling
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d",
            symbol
        );

        // Send request with error handling
        let response = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                eprintln!("Network error fetching price for {}: {}", symbol, e);
                return Err(format!("Network error: {}", e));
            }
        };

        // Check status code
        if !response.status().is_success() {
            eprintln!("HTTP error for {}: {}", symbol, response.status());
            return Err(format!("HTTP error: {}", response.status()));
        }

        // Get response text first
        let text = match response.text().await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Failed to read response for {}: {}", symbol, e);
                return Err(format!("Read error: {}", e));
            }
        };

        // Parse JSON
        let data: Value = match serde_json::from_str(&text) {
            Ok(json) => json,
            Err(e) => {
                eprintln!("JSON parse error for {}: {}", symbol, e);
                return Err(format!("JSON parse error: {}", e));
            }
        };

        // Extract price with detailed error handling
        let price = data.get("chart")
            .and_then(|c| c.get("result"))
            .and_then(|r| r.as_array())
            .and_then(|arr| arr.get(0))
            .and_then(|r0| r0.get("meta"))
            .and_then(|m| m.get("regularMarketPrice"))
            .and_then(|p| p.as_f64())
            .ok_or_else(|| {
                eprintln!("Could not extract price for {} from response", symbol);
                "Could not extract price from response".to_string()
            })?;

        Ok(price)
    }

    /// Batch get current prices with parallel processing and retry
    pub async fn batch_get_current_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        use futures::stream::{self, StreamExt};
        
        let results: Vec<_> = stream::iter(symbols)
            .map(|symbol| async move {
                // Try up to 3 times
                for attempt in 1..=3 {
                    match self.get_current_price(&symbol).await {
                        Ok(price) => return Some((symbol, price)),
                        Err(e) => {
                            eprintln!("Price fetch attempt {} failed for {}: {}", attempt, symbol, e);
                            if attempt < 3 {
                                // Exponential backoff: 1s, 2s
                                tokio::time::sleep(std::time::Duration::from_millis(1000 * attempt as u64)).await;
                            }
                        }
                    }
                }
                None
            })
            .buffer_unordered(2) // Reduced from 5 to 2 to avoid rate limits
            .collect()
            .await;

        results.into_iter().flatten().collect()
    }
}
