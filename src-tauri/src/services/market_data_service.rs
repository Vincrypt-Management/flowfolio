use crate::modules::quant_analysis::{HistoricalPrice, QuantAnalyzer, QuantMetrics};
use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct MarketDataService {
    client: Client,
    cache: Arc<RwLock<HashMap<String, Vec<HistoricalPrice>>>>,
    price_cache: Arc<RwLock<HashMap<String, f64>>>,
    alpaca_key: Option<String>,
    alpaca_secret: Option<String>,
    polygon_key: Option<String>,
    alphavantage_key: Option<String>,
}

impl MarketDataService {
    pub fn new() -> Self {
        // Read API keys from environment
        let alpaca_key = std::env::var("VITE_ALPACA_API_KEY").ok();
        let alpaca_secret = std::env::var("VITE_ALPACA_API_SECRET").ok();
        let polygon_key = std::env::var("VITE_POLYGON_API_KEY").ok();
        let alphavantage_key = std::env::var("VITE_ALPHAVANTAGE_API_KEY").ok();
        
        eprintln!("[INFO] [market_data] API Keys status:");
        eprintln!("[INFO] [market_data]   Polygon: {}", if polygon_key.is_some() { "configured" } else { "not configured" });
        eprintln!("[INFO] [market_data]   Alpha Vantage: {}", if alphavantage_key.is_some() { "configured" } else { "not configured" });
        eprintln!("[INFO] [market_data]   Alpaca: {}", if alpaca_key.is_some() && alpaca_secret.is_some() { "configured" } else { "not configured" });
        
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap(),
            cache: Arc::new(RwLock::new(HashMap::new())),
            price_cache: Arc::new(RwLock::new(HashMap::new())),
            alpaca_key,
            alpaca_secret,
            polygon_key,
            alphavantage_key,
        }
    }

    /// Fetch historical data for a symbol (1 year daily) with retry logic
    pub async fn fetch_historical_data(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(data) = cache.get(symbol) {
                eprintln!("[DEBUG] [market_data] Cache hit for symbol: {}", symbol);
                return Ok(data.clone());
            }
        }

        // Try providers in order: Polygon -> Alpha Vantage -> Alpaca -> Yahoo
        let result = self.try_all_providers(symbol).await;

        // Cache successful results
        if let Ok(ref data) = result {
            let mut cache = self.cache.write().await;
            cache.insert(symbol.to_string(), data.clone());
            
            // Also cache the latest price
            if let Some(latest) = data.last() {
                let mut price_cache = self.price_cache.write().await;
                price_cache.insert(symbol.to_string(), latest.close);
            }
        }

        result
    }

    /// Try all providers in sequence
    async fn try_all_providers(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let mut errors: Vec<String> = vec![];

        // 1. Try Polygon (5 free calls/min but reliable)
        if self.polygon_key.is_some() {
            match self.fetch_from_polygon(symbol).await {
                Ok(data) => return Ok(data),
                Err(e) => {
                    eprintln!("[WARN] [market_data] Polygon provider failed for {}: {}", symbol, e);
                    errors.push(format!("Polygon: {}", e));
                }
            }
        }

        // 2. Try Alpha Vantage (5 free calls/min)
        if self.alphavantage_key.is_some() {
            match self.fetch_from_alphavantage(symbol).await {
                Ok(data) => return Ok(data),
                Err(e) => {
                    eprintln!("[WARN] [market_data] Alpha Vantage provider failed for {}: {}", symbol, e);
                    errors.push(format!("AlphaVantage: {}", e));
                }
            }
        }

        // 3. Try Alpaca (needs data subscription)
        if self.alpaca_key.is_some() && self.alpaca_secret.is_some() {
            match self.fetch_from_alpaca(symbol).await {
                Ok(data) => return Ok(data),
                Err(e) => {
                    eprintln!("[WARN] [market_data] Alpaca provider failed for {}: {}", symbol, e);
                    errors.push(format!("Alpaca: {}", e));
                }
            }
        }

        // 4. Fallback to Yahoo Finance
        match self.fetch_from_yahoo_with_retry(symbol).await {
            Ok(data) => return Ok(data),
            Err(e) => {
                errors.push(format!("Yahoo: {}", e));
            }
        }

        Err(format!("All providers failed for {}: {}", symbol, errors.join("; ")))
    }

    /// Fetch from Polygon.io
    async fn fetch_from_polygon(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let api_key = self.polygon_key.as_ref().ok_or("Polygon API key not configured")?;

        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m-%d").to_string();

        let url = format!(
            "https://api.polygon.io/v2/aggs/ticker/{}/range/1/day/{}/{}?adjusted=true&sort=asc&limit=1000&apiKey={}",
            symbol, start_date, end_date, api_key.trim()
        );

        eprintln!("[DEBUG] [market_data] Fetching {} from Polygon", symbol);

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Polygon request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Polygon API error {}: {}", status, text));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Polygon JSON parse error: {}", e))?;

        let results = data.get("results")
            .and_then(|r| r.as_array())
            .ok_or("No results in Polygon response")?;

        if results.is_empty() {
            return Err(format!("No data for {} from Polygon", symbol));
        }

        let prices: Vec<HistoricalPrice> = results
            .iter()
            .filter_map(|bar| {
                let ts = bar.get("t")?.as_i64()?;
                let date = chrono::DateTime::from_timestamp_millis(ts)?
                    .format("%Y-%m-%d")
                    .to_string();
                Some(HistoricalPrice {
                    date,
                    close: bar.get("c")?.as_f64()?,
                })
            })
            .collect();

        if prices.is_empty() {
            return Err("Failed to parse Polygon data".to_string());
        }

        eprintln!("[DEBUG] [market_data] Polygon returned {} days for {}", prices.len(), symbol);
        Ok(prices)
    }

    /// Fetch from Alpha Vantage
    async fn fetch_from_alphavantage(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let api_key = self.alphavantage_key.as_ref().ok_or("Alpha Vantage API key not configured")?;

        let url = format!(
            "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol={}&outputsize=full&apikey={}",
            symbol, api_key.trim()
        );

        eprintln!("[DEBUG] [market_data] Fetching {} from Alpha Vantage", symbol);

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Alpha Vantage request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(format!("Alpha Vantage API error {}", status));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Alpha Vantage JSON parse error: {}", e))?;

        // Check for rate limit message
        if data.get("Note").is_some() || data.get("Information").is_some() {
            return Err("Alpha Vantage rate limit reached".to_string());
        }

        let time_series = data.get("Time Series (Daily)")
            .and_then(|ts| ts.as_object())
            .ok_or("No time series in Alpha Vantage response")?;

        let mut prices: Vec<HistoricalPrice> = time_series
            .iter()
            .filter_map(|(date, values)| {
                Some(HistoricalPrice {
                    date: date.clone(),
                    close: values.get("5. adjusted close")?.as_str()?.parse().ok()?,
                })
            })
            .collect();

        // Sort by date ascending
        prices.sort_by(|a, b| a.date.cmp(&b.date));

        // Keep only last 365 days
        if prices.len() > 365 {
            prices = prices.into_iter().rev().take(365).rev().collect();
        }

        if prices.is_empty() {
            return Err("Failed to parse Alpha Vantage data".to_string());
        }

        eprintln!("[DEBUG] [market_data] Alpha Vantage returned {} days for {}", prices.len(), symbol);
        Ok(prices)
    }

    /// Fetch from Alpaca Data API (unlimited free for stocks)
    async fn fetch_from_alpaca(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let api_key = self.alpaca_key.as_ref().ok_or("Alpaca API key not configured")?;
        let api_secret = self.alpaca_secret.as_ref().ok_or("Alpaca API secret not configured")?;

        // Get 1 year of daily bars
        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m-%d").to_string();

        let url = format!(
            "https://data.alpaca.markets/v2/stocks/{}/bars?timeframe=1Day&start={}&end={}&limit=1000&adjustment=split",
            symbol, start_date, end_date
        );

        eprintln!("[DEBUG] [market_data] Fetching {} from Alpaca", symbol);

        let response = self.client
            .get(&url)
            .header("APCA-API-KEY-ID", api_key.trim())
            .header("APCA-API-SECRET-KEY", api_secret.trim())
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Alpaca request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error {}: {}", status, text));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Alpaca JSON parse error: {}", e))?;

        let bars = data.get("bars")
            .and_then(|b| b.as_array())
            .ok_or("No bars data in Alpaca response")?;

        if bars.is_empty() {
            return Err(format!("No historical data for {} from Alpaca", symbol));
        }

        let prices: Vec<HistoricalPrice> = bars
            .iter()
            .filter_map(|bar| {
                Some(HistoricalPrice {
                    date: bar.get("t")?.as_str()?.split('T').next()?.to_string(),
                    close: bar.get("c")?.as_f64()?,
                })
            })
            .collect();

        if prices.is_empty() {
            return Err("Failed to parse Alpaca bars data".to_string());
        }

        eprintln!("[DEBUG] [market_data] Alpaca returned {} days for {}", prices.len(), symbol);
        Ok(prices)
    }

    /// Fetch from Yahoo Finance with retry logic (fallback)
    async fn fetch_from_yahoo_with_retry(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let mut last_error = String::new();
        
        for attempt in 1..=3 {
            // Add delay between retries (exponential backoff)
            if attempt > 1 {
                let delay_ms = 2000 * (1 << (attempt - 1)); // 4s, 8s
                eprintln!("[DEBUG] [market_data] Yahoo retry {}/3, waiting {}ms", attempt, delay_ms);
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            }

            match self.fetch_from_yahoo(symbol).await {
                Ok(data) => return Ok(data),
                Err(e) => {
                    last_error = e.clone();
                    eprintln!("[WARN] [market_data] Yahoo attempt {} failed for {}: {}", attempt, symbol, e);
                }
            }
        }

        Err(format!("All Yahoo attempts failed for {}: {}", symbol, last_error))
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

    /// Batch calculate metrics for multiple symbols - uses global rate limiter
    pub async fn batch_get_quant_metrics(&self, symbols: Vec<String>) -> Vec<QuantMetrics> {
        let mut results = Vec::new();
        
        for symbol in symbols {
            let metrics = match self.get_quant_metrics(&symbol).await {
                Ok(m) => m,
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
            };
            results.push(metrics);
        }
        
        results
    }

    /// Get current price for a symbol - uses cached price from historical data
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        // First check price cache (populated when we fetch historical data)
        {
            let price_cache = self.price_cache.read().await;
            if let Some(&price) = price_cache.get(symbol) {
                eprintln!("[DEBUG] [market_data] Price cache hit for {} = ${:.2}", symbol, price);
                return Ok(price);
            }
        }
        
        // If not in cache, fetch historical data (which will populate price cache)
        let prices = self.fetch_historical_data(symbol).await?;
        
        // Get the latest price
        prices.last()
            .map(|p| p.close)
            .ok_or_else(|| "No price data available".to_string())
    }

    /// Batch get current prices - uses cache primarily, avoids redundant API calls
    pub async fn batch_get_current_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        let mut results = HashMap::new();
        
        // First pass: get all cached prices
        {
            let price_cache = self.price_cache.read().await;
            for symbol in &symbols {
                if let Some(&price) = price_cache.get(symbol) {
                    results.insert(symbol.clone(), price);
                }
            }
        }
        
        eprintln!("[DEBUG] [market_data] Price cache: {}/{} symbols cached", results.len(), symbols.len());
        
        // Second pass: fetch only missing symbols (will populate cache via historical data)
        let missing: Vec<_> = symbols.iter()
            .filter(|s| !results.contains_key(*s))
            .cloned()
            .collect();
        
        for symbol in missing {
            match self.get_current_price(&symbol).await {
                Ok(price) => {
                    results.insert(symbol, price);
                }
                Err(e) => {
                    eprintln!("Failed to get price for {}: {}", symbol, e);
                }
            }
        }
        
        results
    }
}
