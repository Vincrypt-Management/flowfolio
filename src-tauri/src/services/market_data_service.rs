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

    /// Fetch historical data for a symbol (1 year daily)
    pub async fn fetch_historical_data(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(data) = cache.get(symbol) {
                return Ok(data.clone());
            }
        }

        // Try Yahoo Finance first (free, no API key needed)
        if let Ok(data) = self.fetch_from_yahoo(symbol).await {
            let mut cache = self.cache.write().await;
            cache.insert(symbol.to_string(), data.clone());
            return Ok(data);
        }

        // Fallback to demo data
        Ok(self.generate_demo_data(symbol))
    }

    /// Fetch from Yahoo Finance API
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

        let response = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        let data: Value = response.json().await.map_err(|e| e.to_string())?;

        self.parse_yahoo_response(&data)
    }

    fn parse_yahoo_response(&self, data: &Value) -> Result<Vec<HistoricalPrice>, String> {
        let result = data.get("chart")
            .and_then(|c| c.get("result"))
            .and_then(|r| r.get(0))
            .ok_or("Invalid Yahoo Finance response")?;

        let timestamps = result.get("timestamp")
            .and_then(|t| t.as_array())
            .ok_or("No timestamps in response")?;

        let closes = result.get("indicators")
            .and_then(|i| i.get("quote"))
            .and_then(|q| q.get(0))
            .and_then(|q0| q0.get("close"))
            .and_then(|c| c.as_array())
            .ok_or("No close prices in response")?;

        let mut prices = Vec::new();
        for (i, timestamp) in timestamps.iter().enumerate() {
            if let (Some(ts), Some(close)) = (timestamp.as_i64(), closes.get(i).and_then(|c| c.as_f64())) {
                let date = chrono::DateTime::from_timestamp(ts, 0)
                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                    .unwrap_or_default();
                
                prices.push(HistoricalPrice { date, close });
            }
        }

        if prices.is_empty() {
            Err("No price data found".to_string())
        } else {
            Ok(prices)
        }
    }

    /// Generate realistic demo data for testing
    fn generate_demo_data(&self, symbol: &str) -> Vec<HistoricalPrice> {
        let mut prices = Vec::new();
        let base_price = match symbol {
            "NVDA" => 190.0,
            "MSFT" => 487.0,
            "TSLA" => 475.0,
            "AMZN" => 232.0,
            "ICLN" => 20.0,
            "VTI" => 280.0,
            "VWO" => 42.0,
            "ABT" => 118.0,
            "ENPH" => 33.0,
            "XLF" => 48.0,
            "PBD" => 5.5,
            _ => 100.0,
        };

        // Generate 252 trading days (1 year)
        for i in 0..252 {
            let date = chrono::Local::now()
                .checked_sub_signed(chrono::Duration::days(252 - i))
                .unwrap()
                .format("%Y-%m-%d")
                .to_string();

            // Simulate realistic price movement
            let trend = (i as f64 / 252.0) * 0.15; // 15% upward trend
            let noise = (((i * 17 + 13) % 100) as f64 - 50.0) / 1000.0; // -5% to +5% noise
            let close = base_price * (1.0 + trend + noise);

            prices.push(HistoricalPrice { date, close });
        }

        prices
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
            .buffer_unordered(10) // Process 10 symbols concurrently
            .collect()
            .await;

        results
    }

    /// Get current price for a symbol
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        // Try Yahoo Finance for real-time price
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d",
            symbol
        );

        let response = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        let data: Value = response.json().await.map_err(|e| e.to_string())?;

        let price = data.get("chart")
            .and_then(|c| c.get("result"))
            .and_then(|r| r.get(0))
            .and_then(|r0| r0.get("meta"))
            .and_then(|m| m.get("regularMarketPrice"))
            .and_then(|p| p.as_f64())
            .ok_or("Could not extract price")?;

        Ok(price)
    }

    /// Batch get current prices with parallel processing
    pub async fn batch_get_current_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        use futures::stream::{self, StreamExt};
        
        let results: Vec<_> = stream::iter(symbols)
            .map(|symbol| async move {
                match self.get_current_price(&symbol).await {
                    Ok(price) => Some((symbol, price)),
                    Err(_) => None,
                }
            })
            .buffer_unordered(10) // Process 10 symbols concurrently
            .collect()
            .await;

        results.into_iter().flatten().collect()
    }
}
