// Multi-Source Data Provider
// Aggregates data from multiple reliable sources with smart failover and caching

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use dashmap::DashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockQuote {
    pub symbol: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub volume: i64,
    pub timestamp: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalPrice {
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketDataResult {
    pub quote: Option<StockQuote>,
    pub historical: Vec<HistoricalPrice>,
    pub source: String,
    pub cached: bool,
}

#[derive(Debug, Clone)]
struct CacheEntry<T> {
    data: T,
    timestamp: SystemTime,
    source: String,
}

/// Provider priority and configuration
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub enabled: bool,
    pub priority: u8,
    pub rate_limit_per_min: u32,
}

/// Multi-source data provider with intelligent failover
pub struct MultiSourceProvider {
    // API Keys (prioritizing free tier providers)
    // Top tier - Unlimited/No key required
    alpaca_key: Option<String>,      // Unlimited free basic data
    alpaca_secret: Option<String>,

    // High tier - Generous free limits
    finnhub_key: Option<String>,     // 60 calls/min free
    tiingo_key: Option<String>,      // 500 calls/hour free
    twelve_data_key: Option<String>, // 800 calls/day free
    fmp_key: Option<String>,         // 250 calls/day free

    // Lower tier - Has paid tiers (use as fallback only)
    alphavantage_key: Option<String>, // 5 calls/min free, but has paid plans
    polygon_key: Option<String>,      // 5 calls/min free, but has paid plans

    // In-memory cache with TTL
    quote_cache: Arc<DashMap<String, CacheEntry<StockQuote>>>,
    historical_cache: Arc<DashMap<String, CacheEntry<Vec<HistoricalPrice>>>>,

    // Rate limiting
    rate_limits: Arc<DashMap<String, (u32, SystemTime)>>,

    // Provider health tracking
    provider_health: Arc<DashMap<String, (u32, u32)>>, // (successes, failures)

    // Cache TTL settings
    quote_cache_ttl: Duration,
    historical_cache_ttl: Duration,
}

impl MultiSourceProvider {
    pub fn new() -> Self {
        // Load API keys from environment
        use crate::core::encrypted_env::get_env_var;
        let alpaca_key = get_env_var("ALPACA_API_KEY");
        let alpaca_secret = get_env_var("ALPACA_SECRET_KEY");
        let polygon_key = get_env_var("POLYGON_API_KEY");
        let alphavantage_key = get_env_var("ALPHA_VANTAGE_API_KEY");
        let finnhub_key = get_env_var("FINNHUB_API_KEY");
        let fmp_key = get_env_var("FMP_API_KEY");
        let tiingo_key = get_env_var("TIINGO_API_KEY");
        let twelve_data_key = get_env_var("TWELVE_DATA_API_KEY");
        
        tracing::info!("Multi-Source Provider initialized");
        tracing::info!(
            alpaca = if alpaca_key.is_some() && alpaca_secret.is_some() { "configured" } else { "not configured" },
            polygon = if polygon_key.is_some() { "configured" } else { "not configured" },
            alpha_vantage = if alphavantage_key.is_some() { "configured" } else { "not configured" },
            finnhub = if finnhub_key.is_some() { "configured" } else { "not configured" },
            fmp = if fmp_key.is_some() { "configured" } else { "not configured" },
            tiingo = if tiingo_key.is_some() { "configured" } else { "not configured" },
            twelve_data = if twelve_data_key.is_some() { "configured" } else { "not configured" },
            yahoo = "available",
            "API Keys status"
        );

        Self {
            alpaca_key,
            alpaca_secret,
            polygon_key,
            alphavantage_key,
            finnhub_key,
            fmp_key,
            tiingo_key,
            twelve_data_key,
            quote_cache: Arc::new(DashMap::new()),
            historical_cache: Arc::new(DashMap::new()),
            rate_limits: Arc::new(DashMap::new()),
            provider_health: Arc::new(DashMap::new()),
            quote_cache_ttl: Duration::from_secs(120), // 2 minutes for quotes (reduced API calls)
            historical_cache_ttl: Duration::from_secs(7200), // 2 hours for historical (market data doesn't change)
        }
    }

    /// Check if we can make a request to this provider (rate limiting)
    fn check_rate_limit(&self, provider: &str, limit_per_min: u32) -> bool {
        let now = SystemTime::now();
        
        if let Some(mut entry) = self.rate_limits.get_mut(provider) {
            let (count, reset_time) = entry.value();
            
            // Check if we need to reset the counter
            if now.duration_since(*reset_time).unwrap_or(Duration::ZERO) > Duration::from_secs(60) {
                *entry.value_mut() = (1, now);
                return true;
            }
            
            if *count >= limit_per_min {
                return false;
            }
            
            entry.value_mut().0 += 1;
            true
        } else {
            self.rate_limits.insert(provider.to_string(), (1, now));
            true
        }
    }

    /// Track provider health for smart failover
    fn track_success(&self, provider: &str) {
        self.provider_health
            .entry(provider.to_string())
            .and_modify(|(s, _)| *s += 1)
            .or_insert((1, 0));
    }

    fn track_failure(&self, provider: &str) {
        self.provider_health
            .entry(provider.to_string())
            .and_modify(|(_, f)| *f += 1)
            .or_insert((0, 1));
    }

    /// Get provider health score (0-100)
    fn get_provider_health(&self, provider: &str) -> u32 {
        if let Some(entry) = self.provider_health.get(provider) {
            let (successes, failures) = *entry.value();
            let total = successes + failures;
            if total == 0 {
                return 100;
            }
            (successes * 100 / total) as u32
        } else {
            100 // New provider, assume healthy
        }
    }

    /// Get ordered list of providers based on health and priority
    /// Prioritizes free providers with best rate limits
    fn get_provider_order(&self) -> Vec<&'static str> {
        // Priority tiers (higher tier = better free limits)
        let tier_priority = |name: &str| -> u8 {
            match name {
                "alpaca" => 10,      // Unlimited free tier
                "yahoo" => 9,        // No key required
                "tiingo" => 8,       // 500/hour free
                "finnhub" => 7,      // 60/min free
                "twelve_data" => 6,  // 800/day free
                "fmp" => 5,          // 250/day free
                "alphavantage" => 2, // 5/min free (has paid tiers)
                "polygon" => 1,      // 5/min free (has paid tiers)
                _ => 0,
            }
        };
        
        let mut providers: Vec<(&'static str, u32, u8)> = vec![
            ("alpaca", self.get_provider_health("alpaca"), tier_priority("alpaca")),
            ("yahoo", self.get_provider_health("yahoo"), tier_priority("yahoo")),
            ("tiingo", self.get_provider_health("tiingo"), tier_priority("tiingo")),
            ("finnhub", self.get_provider_health("finnhub"), tier_priority("finnhub")),
            ("twelve_data", self.get_provider_health("twelve_data"), tier_priority("twelve_data")),
            ("fmp", self.get_provider_health("fmp"), tier_priority("fmp")),
            ("alphavantage", self.get_provider_health("alphavantage"), tier_priority("alphavantage")),
            ("polygon", self.get_provider_health("polygon"), tier_priority("polygon")),
        ];
        
        // Sort by tier first, then by health score
        providers.sort_by(|a, b| {
            match b.2.cmp(&a.2) {
                std::cmp::Ordering::Equal => b.1.cmp(&a.1),
                other => other,
            }
        });
        
        providers.into_iter().map(|(name, _, _)| name).collect()
    }

    // ================== PROVIDER IMPLEMENTATIONS ==================

    /// Alpaca Data API (unlimited for basic stock data)
    async fn fetch_from_alpaca(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.alpaca_key.as_ref().ok_or("Alpaca API key not configured")?;
        let api_secret = self.alpaca_secret.as_ref().ok_or("Alpaca API secret not configured")?;

        if !self.check_rate_limit("alpaca", 200) {
            return Err("Alpaca rate limit exceeded".to_string());
        }

        // Fetch recent bars (last 5 days to get at least one trading day)
        let end_date = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(5)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
        
        let bars_url = format!(
            "https://data.alpaca.markets/v2/stocks/{}/bars?timeframe=1Day&start={}&end={}&limit=5&adjustment=split&feed=iex",
            symbol, start_date, end_date
        );

        let response = crate::HTTP_CLIENT
            .get(&bars_url)
            .header("APCA-API-KEY-ID", api_key.trim())
            .header("APCA-API-SECRET-KEY", api_secret.trim())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Alpaca request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error: {} - {}", status, body));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
        
        // Get latest bar from bars array
        let bars = data.get("bars").and_then(|b| b.as_array()).ok_or("No bars data")?;
        let latest_bar = bars.last().ok_or("No recent bars")?;
        
        let price = latest_bar.get("c").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let volume = latest_bar.get("v").and_then(|v| v.as_i64()).unwrap_or(0);
        let timestamp = latest_bar.get("t").and_then(|v| v.as_str()).unwrap_or("").to_string();
        
        // Calculate change from previous bar if available
        let (change, change_percent) = if bars.len() >= 2 {
            let prev_bar = &bars[bars.len() - 2];
            let prev_close = prev_bar.get("c").and_then(|v| v.as_f64()).unwrap_or(price);
            let chg = price - prev_close;
            let chg_pct = if prev_close > 0.0 { (chg / prev_close) * 100.0 } else { 0.0 };
            (chg, chg_pct)
        } else {
            (0.0, 0.0)
        };

        // Fetch historical bars (1 year)
        let hist_end = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let hist_start = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m-%d").to_string();
        
        let hist_url = format!(
            "https://data.alpaca.markets/v2/stocks/{}/bars?timeframe=1Day&start={}&end={}&limit=365&adjustment=split&feed=iex",
            symbol, hist_start, hist_end
        );

        let hist_response = crate::HTTP_CLIENT
            .get(&hist_url)
            .header("APCA-API-KEY-ID", api_key.trim())
            .header("APCA-API-SECRET-KEY", api_secret.trim())
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Alpaca historical request failed: {}", e))?;

        let hist_data: Value = hist_response.json().await.unwrap_or(Value::Null);
        let hist_bars = hist_data.get("bars").and_then(|b| b.as_array());
        
        let historical: Vec<HistoricalPrice> = hist_bars
            .map(|b| {
                b.iter()
                    .filter_map(|bar| {
                        Some(HistoricalPrice {
                            date: bar.get("t")?.as_str()?.split('T').next()?.to_string(),
                            open: bar.get("o")?.as_f64()?,
                            high: bar.get("h")?.as_f64()?,
                            low: bar.get("l")?.as_f64()?,
                            close: bar.get("c")?.as_f64()?,
                            volume: bar.get("v")?.as_i64()?,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        self.track_success("alpaca");

        Ok(MarketDataResult {
            quote: Some(StockQuote {
                symbol: symbol.to_string(),
                price,
                change,
                change_percent,
                volume,
                timestamp,
                source: "alpaca".to_string(),
            }),
            historical,
            source: "alpaca".to_string(),
            cached: false,
        })
    }

    /// Finnhub API (60 calls/min free tier - optimize to stay within limits)
    async fn fetch_from_finnhub(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.finnhub_key.as_ref().ok_or("Finnhub API key not configured")?;

        // Conservative rate limit: 50/min to leave buffer
        if !self.check_rate_limit("finnhub", 50) {
            return Err("Finnhub rate limit exceeded".to_string());
        }

        // Fetch quote — API key in header to avoid leaking it in logs
        let quote_url = format!("https://finnhub.io/api/v1/quote?symbol={}", symbol);

        let response = crate::HTTP_CLIENT.get(&quote_url)
            .header("X-Finnhub-Token", api_key.trim())
            .send().await
            .map_err(|e| format!("Finnhub request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Finnhub API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
        
        let price = data.get("c").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let change = data.get("d").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let change_percent = data.get("dp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let timestamp = data.get("t").and_then(|v| v.as_i64())
            .map(|t| chrono::DateTime::from_timestamp(t, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default())
            .unwrap_or_default();

        // Fetch candles for historical data
        let end_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(1_700_000_000);
        let start_time = end_time - (365 * 24 * 60 * 60);
        
        let candles_url = format!(
            "https://finnhub.io/api/v1/stock/candle?symbol={}&resolution=D&from={}&to={}",
            symbol, start_time, end_time
        );

        let candles_response = crate::HTTP_CLIENT.get(&candles_url)
            .header("X-Finnhub-Token", api_key.trim())
            .send().await;
        let historical = if let Ok(resp) = candles_response {
            if let Ok(candles_data) = resp.json::<Value>().await {
                if candles_data.get("s").and_then(|s| s.as_str()) == Some("ok") {
                    let timestamps = candles_data.get("t").and_then(|t| t.as_array());
                    let opens = candles_data.get("o").and_then(|o| o.as_array());
                    let highs = candles_data.get("h").and_then(|h| h.as_array());
                    let lows = candles_data.get("l").and_then(|l| l.as_array());
                    let closes = candles_data.get("c").and_then(|c| c.as_array());
                    let volumes = candles_data.get("v").and_then(|v| v.as_array());

                    if let (Some(ts), Some(o), Some(h), Some(l), Some(c), Some(v)) = 
                        (timestamps, opens, highs, lows, closes, volumes) {
                        ts.iter().enumerate().filter_map(|(i, t)| {
                            Some(HistoricalPrice {
                                date: chrono::DateTime::from_timestamp(t.as_i64()?, 0)?
                                    .format("%Y-%m-%d").to_string(),
                                open: o.get(i)?.as_f64()?,
                                high: h.get(i)?.as_f64()?,
                                low: l.get(i)?.as_f64()?,
                                close: c.get(i)?.as_f64()?,
                                volume: v.get(i)?.as_i64()?,
                            })
                        }).collect()
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("finnhub");

        Ok(MarketDataResult {
            quote: Some(StockQuote {
                symbol: symbol.to_string(),
                price,
                change,
                change_percent,
                volume: 0,
                timestamp,
                source: "finnhub".to_string(),
            }),
            historical,
            source: "finnhub".to_string(),
            cached: false,
        })
    }

    /// Financial Modeling Prep (250 calls/day free tier)
    async fn fetch_from_fmp(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.fmp_key.as_ref().ok_or("FMP API key not configured")?;

        if !self.check_rate_limit("fmp", 4) { // ~250/day = 4/min
            return Err("FMP rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://financialmodelingprep.com/api/v3/quote/{}?apikey={}",
            symbol, api_key.trim()
        );

        let response = crate::HTTP_CLIENT.get(&quote_url).send().await
            .map_err(|e| format!("FMP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("FMP API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let quote_data = data.as_array().and_then(|a| a.first());
        
        let quote = quote_data.map(|q| StockQuote {
            symbol: symbol.to_string(),
            price: q.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: q.get("change").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change_percent: q.get("changesPercentage").and_then(|v| v.as_f64()).unwrap_or(0.0),
            volume: q.get("volume").and_then(|v| v.as_i64()).unwrap_or(0),
            timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            source: "fmp".to_string(),
        });

        // Fetch historical prices
        let hist_url = format!(
            "https://financialmodelingprep.com/api/v3/historical-price-full/{}?apikey={}",
            symbol, api_key.trim()
        );

        let hist_response = crate::HTTP_CLIENT.get(&hist_url).send().await;
        let historical = if let Ok(resp) = hist_response {
            if let Ok(hist_data) = resp.json::<Value>().await {
                hist_data.get("historical")
                    .and_then(|h| h.as_array())
                    .map(|arr| {
                        arr.iter().take(365).filter_map(|bar| {
                            Some(HistoricalPrice {
                                date: bar.get("date")?.as_str()?.to_string(),
                                open: bar.get("open")?.as_f64()?,
                                high: bar.get("high")?.as_f64()?,
                                low: bar.get("low")?.as_f64()?,
                                close: bar.get("close")?.as_f64()?,
                                volume: bar.get("volume")?.as_i64()?,
                            })
                        }).collect()
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("fmp");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "fmp".to_string(),
            cached: false,
        })
    }

    /// Tiingo API (500 calls/hour free tier - optimize to stay within limits)
    async fn fetch_from_tiingo(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.tiingo_key.as_ref().ok_or("Tiingo API key not configured")?;

        // Conservative rate limit: 7/min (420/hour) to leave buffer
        if !self.check_rate_limit("tiingo", 7) {
            return Err("Tiingo rate limit exceeded".to_string());
        }

        // Fetch IEX data (real-time)
        let iex_url = format!(
            "https://api.tiingo.com/iex/{}",
            symbol
        );

        let response = crate::HTTP_CLIENT
            .get(&iex_url)
            .header("Authorization", format!("Token {}", api_key.trim()))
            .send()
            .await
            .map_err(|e| format!("Tiingo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Tiingo API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let quote_data = data.as_array().and_then(|a| a.first());

        let quote = quote_data.map(|q| StockQuote {
            symbol: symbol.to_string(),
            price: q.get("last").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: 0.0,
            change_percent: q.get("prevClose").and_then(|prev| {
                let prev = prev.as_f64()?;
                let last = q.get("last")?.as_f64()?;
                Some(((last - prev) / prev) * 100.0)
            }).unwrap_or(0.0),
            volume: q.get("volume").and_then(|v| v.as_i64()).unwrap_or(0),
            timestamp: q.get("timestamp").and_then(|t| t.as_str()).unwrap_or("").to_string(),
            source: "tiingo".to_string(),
        });

        // Fetch historical data
        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m-%d").to_string();

        let hist_url = format!(
            "https://api.tiingo.com/tiingo/daily/{}/prices?startDate={}&endDate={}",
            symbol, start_date, end_date
        );

        let hist_response = crate::HTTP_CLIENT
            .get(&hist_url)
            .header("Authorization", format!("Token {}", api_key.trim()))
            .send()
            .await;

        let historical = if let Ok(resp) = hist_response {
            if let Ok(hist_data) = resp.json::<Value>().await {
                hist_data.as_array()
                    .map(|arr| {
                        arr.iter().filter_map(|bar| {
                            Some(HistoricalPrice {
                                date: bar.get("date")?.as_str()?.split('T').next()?.to_string(),
                                open: bar.get("open")?.as_f64()?,
                                high: bar.get("high")?.as_f64()?,
                                low: bar.get("low")?.as_f64()?,
                                close: bar.get("close")?.as_f64()?,
                                volume: bar.get("volume")?.as_i64()?,
                            })
                        }).collect()
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("tiingo");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "tiingo".to_string(),
            cached: false,
        })
    }

    /// Twelve Data API (800 calls/day free tier)
    async fn fetch_from_twelve_data(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.twelve_data_key.as_ref().ok_or("Twelve Data API key not configured")?;

        if !self.check_rate_limit("twelve_data", 1) { // Conservative rate limit
            return Err("Twelve Data rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://api.twelvedata.com/quote?symbol={}&apikey={}",
            symbol, api_key.trim()
        );

        let response = crate::HTTP_CLIENT.get(&quote_url).send().await
            .map_err(|e| format!("Twelve Data request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Twelve Data API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;

        if data.get("code").is_some() {
            return Err("Twelve Data API error".to_string());
        }

        let quote = Some(StockQuote {
            symbol: symbol.to_string(),
            price: data.get("close").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change: data.get("change").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change_percent: data.get("percent_change").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            volume: data.get("volume").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0),
            timestamp: data.get("datetime").and_then(|d| d.as_str()).unwrap_or("").to_string(),
            source: "twelve_data".to_string(),
        });

        // Fetch time series
        let ts_url = format!(
            "https://api.twelvedata.com/time_series?symbol={}&interval=1day&outputsize=365&apikey={}",
            symbol, api_key.trim()
        );

        let ts_response = crate::HTTP_CLIENT.get(&ts_url).send().await;
        let historical = if let Ok(resp) = ts_response {
            if let Ok(ts_data) = resp.json::<Value>().await {
                ts_data.get("values")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter().filter_map(|bar| {
                            Some(HistoricalPrice {
                                date: bar.get("datetime")?.as_str()?.to_string(),
                                open: bar.get("open")?.as_str()?.parse().ok()?,
                                high: bar.get("high")?.as_str()?.parse().ok()?,
                                low: bar.get("low")?.as_str()?.parse().ok()?,
                                close: bar.get("close")?.as_str()?.parse().ok()?,
                                volume: bar.get("volume")?.as_str()?.parse().ok()?,
                            })
                        }).collect()
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("twelve_data");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "twelve_data".to_string(),
            cached: false,
        })
    }

    /// Polygon.io API (5 calls/min free tier - AVOID unless necessary, has paid tiers)
    async fn fetch_from_polygon(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.polygon_key.as_ref().ok_or("Polygon API key not configured")?;

        // Very conservative for free tier (4/min to leave buffer)
        if !self.check_rate_limit("polygon", 4) {
            return Err("Polygon rate limit exceeded".to_string());
        }

        // Fetch previous close
        let quote_url = format!(
            "https://api.polygon.io/v2/aggs/ticker/{}/prev?adjusted=true&apiKey={}",
            symbol, api_key.trim()
        );

        let response = crate::HTTP_CLIENT.get(&quote_url).send().await
            .map_err(|e| format!("Polygon request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Polygon API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let results = data.get("results").and_then(|r| r.as_array()).and_then(|a| a.first());

        let quote = results.map(|r| StockQuote {
            symbol: symbol.to_string(),
            price: r.get("c").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: 0.0,
            change_percent: 0.0,
            volume: r.get("v").and_then(|v| v.as_i64()).unwrap_or(0),
            timestamp: r.get("t").and_then(|t| t.as_i64())
                .map(|ts| chrono::DateTime::from_timestamp_millis(ts)
                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                    .unwrap_or_default())
                .unwrap_or_default(),
            source: "polygon".to_string(),
        });

        // Fetch historical data
        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365)).format("%Y-%m-%d").to_string();

        let hist_url = format!(
            "https://api.polygon.io/v2/aggs/ticker/{}/range/1/day/{}/{}?adjusted=true&sort=asc&limit=365&apiKey={}",
            symbol, start_date, end_date, api_key.trim()
        );

        let hist_response = crate::HTTP_CLIENT.get(&hist_url).send().await;
        let historical = if let Ok(resp) = hist_response {
            if let Ok(hist_data) = resp.json::<Value>().await {
                hist_data.get("results")
                    .and_then(|r| r.as_array())
                    .map(|arr| {
                        arr.iter().filter_map(|bar| {
                            Some(HistoricalPrice {
                                date: chrono::DateTime::from_timestamp_millis(bar.get("t")?.as_i64()?)?
                                    .format("%Y-%m-%d").to_string(),
                                open: bar.get("o")?.as_f64()?,
                                high: bar.get("h")?.as_f64()?,
                                low: bar.get("l")?.as_f64()?,
                                close: bar.get("c")?.as_f64()?,
                                volume: bar.get("v")?.as_i64()?,
                            })
                        }).collect()
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("polygon");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "polygon".to_string(),
            cached: false,
        })
    }

    /// Alpha Vantage API (5 calls/min free tier)
    /// Alpha Vantage API (5 calls/min free tier - AVOID unless necessary, has paid tiers)
    async fn fetch_from_alphavantage(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self.alphavantage_key.as_ref().ok_or("Alpha Vantage API key not configured")?;

        // Very conservative for free tier (4/min to leave buffer)
        if !self.check_rate_limit("alphavantage", 4) {
            return Err("Alpha Vantage rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={}&apikey={}",
            symbol, api_key.trim()
        );

        let response = crate::HTTP_CLIENT.get(&quote_url).send().await
            .map_err(|e| format!("Alpha Vantage request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Alpha Vantage API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;

        // Check for rate limit
        if data.get("Note").is_some() || data.get("Information").is_some() {
            return Err("Alpha Vantage rate limit".to_string());
        }

        let global_quote = data.get("Global Quote");
        let quote = global_quote.map(|q| StockQuote {
            symbol: symbol.to_string(),
            price: q.get("05. price").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change: q.get("09. change").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change_percent: q.get("10. change percent").and_then(|v| v.as_str())
                .and_then(|s| s.trim_end_matches('%').parse().ok()).unwrap_or(0.0),
            volume: q.get("06. volume").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0),
            timestamp: q.get("07. latest trading day").and_then(|d| d.as_str()).unwrap_or("").to_string(),
            source: "alphavantage".to_string(),
        });

        // Fetch time series
        let ts_url = format!(
            "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol={}&outputsize=full&apikey={}",
            symbol, api_key.trim()
        );

        let ts_response = crate::HTTP_CLIENT.get(&ts_url).send().await;
        let historical = if let Ok(resp) = ts_response {
            if let Ok(ts_data) = resp.json::<Value>().await {
                ts_data.get("Time Series (Daily)")
                    .and_then(|ts| ts.as_object())
                    .map(|obj| {
                        let mut prices: Vec<HistoricalPrice> = obj.iter()
                            .take(365)
                            .filter_map(|(date, values)| {
                                Some(HistoricalPrice {
                                    date: date.clone(),
                                    open: values.get("1. open")?.as_str()?.parse().ok()?,
                                    high: values.get("2. high")?.as_str()?.parse().ok()?,
                                    low: values.get("3. low")?.as_str()?.parse().ok()?,
                                    close: values.get("5. adjusted close")?.as_str()?.parse().ok()?,
                                    volume: values.get("6. volume")?.as_str()?.parse().ok()?,
                                })
                            })
                            .collect();
                        prices.sort_by(|a, b| a.date.cmp(&b.date));
                        prices
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("alphavantage");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "alphavantage".to_string(),
            cached: false,
        })
    }

    /// Yahoo Finance (no API key needed, but can be rate limited)
    async fn fetch_from_yahoo(&self, symbol: &str) -> Result<MarketDataResult, String> {
        // Yahoo is generally reliable, increase rate limit
        if !self.check_rate_limit("yahoo", 60) {
            return Err("Yahoo rate limit exceeded".to_string());
        }

        let end_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(1_700_000_000);
        let start_time = end_time - (365 * 24 * 60 * 60);

        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d",
            symbol, start_time, end_time
        );

        tracing::debug!(symbol = %symbol, "Fetching data from Yahoo");

        let response = crate::HTTP_CLIENT
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .send()
            .await
            .map_err(|e| format!("Yahoo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Yahoo API error: {}", response.status()));
        }

        let data: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;

        let result = data.get("chart")
            .and_then(|c| c.get("result"))
            .and_then(|r| r.as_array())
            .and_then(|a| a.first())
            .ok_or("Invalid Yahoo response")?;

        let meta = result.get("meta");
        let quote = meta.map(|m| StockQuote {
            symbol: symbol.to_string(),
            price: m.get("regularMarketPrice").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: m.get("regularMarketPrice").and_then(|p| {
                let price = p.as_f64()?;
                let prev = m.get("previousClose")?.as_f64()?;
                Some(price - prev)
            }).unwrap_or(0.0),
            change_percent: m.get("regularMarketPrice").and_then(|p| {
                let price = p.as_f64()?;
                let prev = m.get("previousClose")?.as_f64()?;
                Some(((price - prev) / prev) * 100.0)
            }).unwrap_or(0.0),
            volume: m.get("regularMarketVolume").and_then(|v| v.as_i64()).unwrap_or(0),
            timestamp: m.get("regularMarketTime").and_then(|t| t.as_i64())
                .map(|ts| chrono::DateTime::from_timestamp(ts, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default())
                .unwrap_or_default(),
            source: "yahoo".to_string(),
        });

        // Parse historical data
        let timestamps = result.get("timestamp").and_then(|t| t.as_array());
        let indicators = result.get("indicators").and_then(|i| i.get("quote")).and_then(|q| q.as_array()).and_then(|a| a.first());

        let historical = if let (Some(ts), Some(ind)) = (timestamps, indicators) {
            let opens = ind.get("open").and_then(|o| o.as_array());
            let highs = ind.get("high").and_then(|h| h.as_array());
            let lows = ind.get("low").and_then(|l| l.as_array());
            let closes = ind.get("close").and_then(|c| c.as_array());
            let volumes = ind.get("volume").and_then(|v| v.as_array());

            if let (Some(o), Some(h), Some(l), Some(c), Some(v)) = (opens, highs, lows, closes, volumes) {
                ts.iter().enumerate().filter_map(|(i, t)| {
                    Some(HistoricalPrice {
                        date: chrono::DateTime::from_timestamp(t.as_i64()?, 0)?
                            .format("%Y-%m-%d").to_string(),
                        open: o.get(i)?.as_f64()?,
                        high: h.get(i)?.as_f64()?,
                        low: l.get(i)?.as_f64()?,
                        close: c.get(i)?.as_f64()?,
                        volume: v.get(i)?.as_i64()?,
                    })
                }).collect()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        self.track_success("yahoo");

        Ok(MarketDataResult {
            quote,
            historical,
            source: "yahoo".to_string(),
            cached: false,
        })
    }

    // ================== PUBLIC API ==================

    /// Fetch market data with intelligent failover and caching
    pub async fn get_market_data(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let symbol = symbol.to_uppercase();

        // Check in-memory quote cache
        if let Some(entry) = self.quote_cache.get(&symbol) {
            if entry.timestamp.elapsed().unwrap_or(Duration::MAX) < self.quote_cache_ttl {
                return Ok(MarketDataResult {
                    quote: Some(entry.data.clone()),
                    historical: self.historical_cache.get(&symbol)
                        .map(|h| h.data.clone())
                        .unwrap_or_default(),
                    source: entry.source.clone(),
                    cached: true,
                });
            }
        }

        // Try providers in health-based order
        let providers = self.get_provider_order();
        let mut last_error = String::new();

        for provider in providers {
            let result = match provider {
                "alpaca" if self.alpaca_key.is_some() => self.fetch_from_alpaca(&symbol).await,
                "finnhub" if self.finnhub_key.is_some() => self.fetch_from_finnhub(&symbol).await,
                "fmp" if self.fmp_key.is_some() => self.fetch_from_fmp(&symbol).await,
                "tiingo" if self.tiingo_key.is_some() => self.fetch_from_tiingo(&symbol).await,
                "twelve_data" if self.twelve_data_key.is_some() => self.fetch_from_twelve_data(&symbol).await,
                "polygon" if self.polygon_key.is_some() => self.fetch_from_polygon(&symbol).await,
                "alphavantage" if self.alphavantage_key.is_some() => self.fetch_from_alphavantage(&symbol).await,
                "yahoo" => self.fetch_from_yahoo(&symbol).await,
                _ => continue,
            };

            match result {
                Ok(data) => {
                    // Cache the result
                    if let Some(ref quote) = data.quote {
                        self.quote_cache.insert(symbol.clone(), CacheEntry {
                            data: quote.clone(),
                            timestamp: SystemTime::now(),
                            source: data.source.clone(),
                        });
                    }
                    
                    if !data.historical.is_empty() {
                        self.historical_cache.insert(symbol.clone(), CacheEntry {
                            data: data.historical.clone(),
                            timestamp: SystemTime::now(),
                            source: data.source.clone(),
                        });
                    }

                    return Ok(data);
                }
                Err(e) => {
                    self.track_failure(provider);
                    last_error = format!("{}: {}", provider, e);
                    tracing::warn!(provider = %provider, symbol = %symbol, error = %e, "Provider failed");
                    continue;
                }
            }
        }

        Err(format!("All providers failed for {}: {}", symbol, last_error))
    }

    /// Batch fetch market data for multiple symbols
    pub async fn get_batch_market_data(&self, symbols: Vec<String>) -> HashMap<String, MarketDataResult> {
        use futures::stream::{self, StreamExt};

        let results: Vec<(String, Result<MarketDataResult, String>)> = stream::iter(symbols)
            .map(|symbol| async move {
                let result = self.get_market_data(&symbol).await;
                (symbol, result)
            })
            .buffer_unordered(5) // Limit concurrency
            .collect()
            .await;

        results.into_iter()
            .filter_map(|(symbol, result)| result.ok().map(|data| (symbol, data)))
            .collect()
    }

    /// Get current price only (optimized)
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        let data = self.get_market_data(symbol).await?;
        data.quote.map(|q| q.price).ok_or("No price data".to_string())
    }

    /// Batch get current prices
    pub async fn get_batch_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        let data = self.get_batch_market_data(symbols).await;
        data.into_iter()
            .filter_map(|(symbol, result)| {
                result.quote.map(|q| (symbol, q.price))
            })
            .collect()
    }

    /// Get provider health stats
    pub fn get_health_stats(&self) -> HashMap<String, (u32, u32)> {
        self.provider_health.iter()
            .map(|entry| (entry.key().clone(), *entry.value()))
            .collect()
    }

    /// Clear caches
    pub fn clear_cache(&self) {
        self.quote_cache.clear();
        self.historical_cache.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Test 1: new() constructs with empty caches and default TTLs ──────────

    #[test]
    fn test_new_creates_empty_caches() {
        let provider = MultiSourceProvider::new();
        assert!(provider.quote_cache.is_empty(), "quote_cache should be empty on construction");
        assert!(provider.historical_cache.is_empty(), "historical_cache should be empty on construction");
        assert!(provider.rate_limits.is_empty(), "rate_limits should be empty on construction");
        assert!(provider.provider_health.is_empty(), "provider_health should be empty on construction");
    }

    #[test]
    fn test_new_default_ttls() {
        let provider = MultiSourceProvider::new();
        assert_eq!(provider.quote_cache_ttl, Duration::from_secs(120), "quote TTL should be 2 minutes");
        assert_eq!(provider.historical_cache_ttl, Duration::from_secs(7200), "historical TTL should be 2 hours");
    }

    // ── Test 2: check_rate_limit ─────────────────────────────────────────────

    #[test]
    fn test_check_rate_limit_first_call_returns_true() {
        let provider = MultiSourceProvider::new();
        assert!(provider.check_rate_limit("test_provider_first", 5));
    }

    #[test]
    fn test_check_rate_limit_subsequent_calls_within_limit_return_true() {
        let provider = MultiSourceProvider::new();
        let limit = 5u32;
        // First call inserts with count=1; calls 2..limit should all succeed
        assert!(provider.check_rate_limit("rl_within", limit));
        for _ in 1..limit {
            assert!(provider.check_rate_limit("rl_within", limit));
        }
    }

    #[test]
    fn test_check_rate_limit_at_limit_returns_false() {
        let provider = MultiSourceProvider::new();
        let limit = 3u32;
        // Exhaust the limit
        for _ in 0..limit {
            provider.check_rate_limit("rl_exhaust", limit);
        }
        // Next call should be rejected
        assert!(!provider.check_rate_limit("rl_exhaust", limit), "should return false when limit reached");
    }

    #[test]
    fn test_check_rate_limit_window_resets_after_60s() {
        let provider = MultiSourceProvider::new();
        // Insert a "full" counter with a timestamp >60 s in the past
        provider.rate_limits.insert(
            "rl_old".to_string(),
            (5, SystemTime::now() - Duration::from_secs(120)),
        );
        // The window is expired, so the counter resets and the call is allowed
        assert!(provider.check_rate_limit("rl_old", 5), "should reset and return true after window expires");
    }

    // ── Test 3: track_success / track_failure / get_provider_health ──────────

    #[test]
    fn test_get_provider_health_new_provider_scores_100() {
        let provider = MultiSourceProvider::new();
        assert_eq!(provider.get_provider_health("unknown_provider"), 100);
    }

    #[test]
    fn test_track_success_one_success_scores_100() {
        let provider = MultiSourceProvider::new();
        provider.track_success("prov_success");
        assert_eq!(provider.get_provider_health("prov_success"), 100);
    }

    #[test]
    fn test_track_failure_one_failure_scores_0() {
        let provider = MultiSourceProvider::new();
        provider.track_failure("prov_failure");
        assert_eq!(provider.get_provider_health("prov_failure"), 0);
    }

    #[test]
    fn test_mixed_success_failure_scores_correctly() {
        let provider = MultiSourceProvider::new();
        // 3 successes, 1 failure → 3/4 = 75
        provider.track_success("prov_mixed");
        provider.track_success("prov_mixed");
        provider.track_success("prov_mixed");
        provider.track_failure("prov_mixed");
        assert_eq!(provider.get_provider_health("prov_mixed"), 75);
    }

    #[test]
    fn test_equal_success_failure_scores_50() {
        let provider = MultiSourceProvider::new();
        provider.track_success("prov_equal");
        provider.track_failure("prov_equal");
        assert_eq!(provider.get_provider_health("prov_equal"), 50);
    }

    // ── Test 4: get_provider_order ───────────────────────────────────────────

    #[test]
    fn test_get_provider_order_returns_eight_providers() {
        let provider = MultiSourceProvider::new();
        let order = provider.get_provider_order();
        assert_eq!(order.len(), 8, "should return exactly 8 providers");
    }

    #[test]
    fn test_get_provider_order_alpaca_is_first() {
        let provider = MultiSourceProvider::new();
        let order = provider.get_provider_order();
        assert_eq!(order[0], "alpaca", "alpaca should be first (highest tier)");
    }

    #[test]
    fn test_get_provider_order_contains_all_expected_providers() {
        let provider = MultiSourceProvider::new();
        let order = provider.get_provider_order();
        let expected = ["alpaca", "yahoo", "tiingo", "finnhub", "twelve_data", "fmp", "alphavantage", "polygon"];
        for name in &expected {
            assert!(order.contains(name), "provider order should contain {}", name);
        }
    }

    #[test]
    fn test_get_provider_order_unhealthy_provider_ranks_lower_within_tier() {
        let provider = MultiSourceProvider::new();
        // Degrade tiingo (tier 8) so yahoo (tier 9) stays ahead but also degrade
        // both alpaca peers to check intra-tier health sorting.
        // Degrade tiingo: inject many failures
        for _ in 0..10 {
            provider.track_failure("tiingo");
        }
        let order = provider.get_provider_order();
        // tiingo should still exist but yahoo (tier 9) should precede it
        let tiingo_pos = order.iter().position(|&p| p == "tiingo").unwrap();
        let yahoo_pos = order.iter().position(|&p| p == "yahoo").unwrap();
        assert!(yahoo_pos < tiingo_pos, "yahoo (tier 9) should appear before a degraded tiingo (tier 8)");
    }

    // ── Test 5: get_health_stats ─────────────────────────────────────────────

    #[test]
    fn test_get_health_stats_empty_initially() {
        let provider = MultiSourceProvider::new();
        let stats = provider.get_health_stats();
        assert!(stats.is_empty(), "health stats should be empty on a fresh provider");
    }

    #[test]
    fn test_get_health_stats_reflects_tracked_health() {
        let provider = MultiSourceProvider::new();
        provider.track_success("stat_prov");
        provider.track_failure("stat_prov");
        let stats = provider.get_health_stats();
        assert!(stats.contains_key("stat_prov"), "stats should contain tracked provider");
        let (successes, failures) = stats["stat_prov"];
        assert_eq!(successes, 1);
        assert_eq!(failures, 1);
    }

    #[test]
    fn test_get_health_stats_multiple_providers() {
        let provider = MultiSourceProvider::new();
        provider.track_success("provA");
        provider.track_success("provB");
        provider.track_failure("provB");
        let stats = provider.get_health_stats();
        assert_eq!(stats.len(), 2);
        assert_eq!(stats["provA"], (1, 0));
        assert_eq!(stats["provB"], (1, 1));
    }

    // ── Test 6: clear_cache ──────────────────────────────────────────────────

    #[test]
    fn test_clear_cache_empties_quote_cache() {
        let provider = MultiSourceProvider::new();
        let quote = StockQuote {
            symbol: "AAPL".to_string(),
            price: 150.0,
            change: 1.0,
            change_percent: 0.67,
            volume: 1_000_000,
            timestamp: "2026-01-01".to_string(),
            source: "test".to_string(),
        };
        provider.quote_cache.insert(
            "AAPL".to_string(),
            CacheEntry {
                data: quote,
                timestamp: SystemTime::now(),
                source: "test".to_string(),
            },
        );
        assert!(!provider.quote_cache.is_empty(), "quote_cache should have one entry before clear");
        provider.clear_cache();
        assert!(provider.quote_cache.is_empty(), "quote_cache should be empty after clear_cache");
    }

    #[test]
    fn test_clear_cache_empties_historical_cache() {
        let provider = MultiSourceProvider::new();
        let hist = vec![HistoricalPrice {
            date: "2026-01-01".to_string(),
            open: 148.0,
            high: 152.0,
            low: 147.0,
            close: 150.0,
            volume: 500_000,
        }];
        provider.historical_cache.insert(
            "AAPL_90".to_string(),
            CacheEntry {
                data: hist,
                timestamp: SystemTime::now(),
                source: "test".to_string(),
            },
        );
        assert!(!provider.historical_cache.is_empty(), "historical_cache should have one entry before clear");
        provider.clear_cache();
        assert!(provider.historical_cache.is_empty(), "historical_cache should be empty after clear_cache");
    }

    #[test]
    fn test_clear_cache_empties_both_caches_together() {
        let provider = MultiSourceProvider::new();
        let quote = StockQuote {
            symbol: "MSFT".to_string(),
            price: 400.0,
            change: 2.0,
            change_percent: 0.5,
            volume: 800_000,
            timestamp: "2026-01-02".to_string(),
            source: "test".to_string(),
        };
        provider.quote_cache.insert(
            "MSFT".to_string(),
            CacheEntry { data: quote, timestamp: SystemTime::now(), source: "test".to_string() },
        );
        provider.historical_cache.insert(
            "MSFT_30".to_string(),
            CacheEntry {
                data: vec![],
                timestamp: SystemTime::now(),
                source: "test".to_string(),
            },
        );
        provider.clear_cache();
        assert!(provider.quote_cache.is_empty());
        assert!(provider.historical_cache.is_empty());
    }
}
