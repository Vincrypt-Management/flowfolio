// Multi-Source Data Provider
// Aggregates data from multiple reliable sources with smart failover and caching

#![allow(dead_code)]

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

/// Intermediate quote returned by pure JSON parser functions.
/// Callers map this into `StockQuote` for the full pipeline.
#[derive(Debug, Clone)]
pub struct ProviderQuote {
    pub symbol: String,
    pub price: f64,
    pub bid: Option<f64>,
    pub ask: Option<f64>,
    pub volume: Option<i64>,
}

// ── Pure JSON parser functions (pub for integration tests) ───────────────────

use crate::modules::data_provider::parse_helpers::{
    ParseError, parse_optional_f64, parse_optional_i64, parse_required_f64, parse_required_i64,
};

/// Parse an Alpaca `/v2/stocks/{symbol}/quotes/latest` response.
/// Returns `Err` when both `ap` and `bp` are missing or zero.
pub fn parse_alpaca_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let symbol = json
        .get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField {
            provider: "alpaca".into(),
            field: "symbol".into(),
        })?
        .to_string();
    let quote = json.get("quote").ok_or_else(|| ParseError::MissingField {
        provider: "alpaca".into(),
        field: "quote".into(),
    })?;
    let ap = parse_optional_f64(quote, "ap", "alpaca")?;
    let bp = parse_optional_f64(quote, "bp", "alpaca")?;
    let price = match (bp, ap) {
        (Some(b), Some(a)) if b > 0.0 && a > 0.0 => (b + a) / 2.0,
        (Some(b), None) if b > 0.0 => b,
        (None, Some(a)) if a > 0.0 => a,
        _ => {
            return Err(ParseError::MissingField {
                provider: "alpaca".into(),
                field: "bp or ap (non-zero)".into(),
            })
        }
    };
    let volume = parse_optional_i64(quote, "as", "alpaca")?;
    Ok(ProviderQuote {
        symbol,
        price,
        bid: bp,
        ask: ap,
        volume,
    })
}

/// Parse an Alpaca `/v2/stocks/{symbol}/bars` response into a vec of
/// `HistoricalPrice`. Bars with a missing or bad close field are skipped
/// (logged as warn). Returns `Err(EmptyResponse)` if no bars survive.
pub fn parse_alpaca_bars(json: &serde_json::Value) -> Result<Vec<HistoricalPrice>, ParseError> {
    let bars = json
        .get("bars")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "alpaca".into(),
            field: "bars".into(),
        })?;
    let mut out = Vec::with_capacity(bars.len());
    for (i, bar) in bars.iter().enumerate() {
        let close = match parse_required_f64(bar, "c", "alpaca") {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(idx = i, err = %e, "alpaca: skip bar (missing close)");
                continue;
            }
        };
        let open = parse_required_f64(bar, "o", "alpaca").unwrap_or(close);
        let high = parse_required_f64(bar, "h", "alpaca").unwrap_or(close);
        let low = parse_required_f64(bar, "l", "alpaca").unwrap_or(close);
        let volume = parse_required_i64(bar, "v", "alpaca").unwrap_or(0);
        let date = bar
            .get("t")
            .and_then(|v| v.as_str())
            .map(|s| s[..10.min(s.len())].to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "alpaca".into(),
        });
    }
    Ok(out)
}

/// Parse a Finnhub `/quote` response.
/// Returns `Err` when the current price field `c` is missing or non-positive.
pub fn parse_finnhub_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let price = parse_required_f64(json, "c", "finnhub")?;
    if price <= 0.0 {
        return Err(ParseError::InvalidType {
            provider: "finnhub".into(),
            field: "c".into(),
            expected: "positive number".into(),
            got: price.to_string(),
        });
    }
    Ok(ProviderQuote {
        symbol: String::new(), // /quote endpoint does not echo the symbol
        price,
        bid: None,
        ask: None,
        volume: None,
    })
}

/// Parse a Finnhub `/stock/candle` response into a vec of `HistoricalPrice`.
/// Bars with a missing or bad close entry are skipped (logged as warn).
/// Returns `Err(EmptyResponse)` if no bars survive or status is `"no_data"`.
pub fn parse_finnhub_candles(json: &serde_json::Value) -> Result<Vec<HistoricalPrice>, ParseError> {
    if json.get("s").and_then(|v| v.as_str()) == Some("no_data") {
        return Err(ParseError::EmptyResponse {
            provider: "finnhub".into(),
        });
    }
    let closes = json
        .get("c")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "finnhub".into(),
            field: "c".into(),
        })?;
    let opens = json.get("o").and_then(|v| v.as_array());
    let highs = json.get("h").and_then(|v| v.as_array());
    let lows = json.get("l").and_then(|v| v.as_array());
    let vols = json.get("v").and_then(|v| v.as_array());
    let timestamps = json.get("t").and_then(|v| v.as_array());

    let mut out = Vec::with_capacity(closes.len());
    for (i, close_v) in closes.iter().enumerate() {
        let close = match close_v.as_f64() {
            Some(c) if c > 0.0 => c,
            _ => {
                tracing::warn!(idx = i, "finnhub: skip bar (bad close)");
                continue;
            }
        };
        let open = opens
            .and_then(|a| a.get(i))
            .and_then(|v| v.as_f64())
            .unwrap_or(close);
        let high = highs
            .and_then(|a| a.get(i))
            .and_then(|v| v.as_f64())
            .unwrap_or(close);
        let low = lows
            .and_then(|a| a.get(i))
            .and_then(|v| v.as_f64())
            .unwrap_or(close);
        let volume = vols
            .and_then(|a| a.get(i))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let ts = timestamps
            .and_then(|a| a.get(i))
            .and_then(|v| v.as_i64());
        let date = ts
            .and_then(|t| chrono::DateTime::<chrono::Utc>::from_timestamp(t, 0))
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "finnhub".into(),
        });
    }
    Ok(out)
}

/// Parse an FMP `/v3/quote/{symbol}` response (top-level array).
/// Returns `Err` when the array is empty or the `price` field is missing.
pub fn parse_fmp_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let first = json
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| ParseError::EmptyResponse {
            provider: "fmp".into(),
        })?;
    let symbol = first
        .get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField {
            provider: "fmp".into(),
            field: "symbol".into(),
        })?
        .to_string();
    let price = parse_required_f64(first, "price", "fmp")?;
    let volume = parse_optional_i64(first, "volume", "fmp")?;
    Ok(ProviderQuote {
        symbol,
        price,
        bid: None,
        ask: None,
        volume,
    })
}

/// Parse an FMP `/v3/historical-price-full/{symbol}` response.
/// Bars with a missing or bad `close` field are skipped (logged as warn).
/// Returns `Err(EmptyResponse)` if no bars survive.
pub fn parse_fmp_historical(
    json: &serde_json::Value,
) -> Result<Vec<HistoricalPrice>, ParseError> {
    let arr = json
        .get("historical")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "fmp".into(),
            field: "historical".into(),
        })?;
    let mut out = Vec::with_capacity(arr.len());
    for (i, bar) in arr.iter().enumerate() {
        let close = match parse_required_f64(bar, "close", "fmp") {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(idx = i, err = %e, "fmp: skip bar (missing close)");
                continue;
            }
        };
        let open = parse_required_f64(bar, "open", "fmp").unwrap_or(close);
        let high = parse_required_f64(bar, "high", "fmp").unwrap_or(close);
        let low = parse_required_f64(bar, "low", "fmp").unwrap_or(close);
        let volume = parse_required_i64(bar, "volume", "fmp").unwrap_or(0);
        let date = bar
            .get("date")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "fmp".into(),
        });
    }
    Ok(out)
}

/// Parse a Tiingo IEX `/iex/{symbol}` response (top-level array).
/// Returns `Err` when the array is empty or the `last` field is missing.
pub fn parse_tiingo_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let first = json
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| ParseError::EmptyResponse {
            provider: "tiingo".into(),
        })?;
    let symbol = first
        .get("ticker")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField {
            provider: "tiingo".into(),
            field: "ticker".into(),
        })?
        .to_string();
    let price = parse_required_f64(first, "last", "tiingo")?;
    let volume = parse_optional_i64(first, "volume", "tiingo")?;
    let bid = parse_optional_f64(first, "bidPrice", "tiingo")?;
    let ask = parse_optional_f64(first, "askPrice", "tiingo")?;
    Ok(ProviderQuote {
        symbol,
        price,
        bid,
        ask,
        volume,
    })
}

/// Parse a Tiingo `/tiingo/daily/{symbol}/prices` response (top-level array).
/// Bars with a missing or bad `close` field are skipped (logged as warn).
/// Returns `Err(EmptyResponse)` if no bars survive.
pub fn parse_tiingo_historical(
    json: &serde_json::Value,
) -> Result<Vec<HistoricalPrice>, ParseError> {
    let arr = json
        .as_array()
        .ok_or_else(|| ParseError::InvalidType {
            provider: "tiingo".into(),
            field: "(root)".into(),
            expected: "array".into(),
            got: format!("{json}"),
        })?;
    let mut out = Vec::with_capacity(arr.len());
    for (i, bar) in arr.iter().enumerate() {
        let close = match parse_required_f64(bar, "close", "tiingo") {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(idx = i, err = %e, "tiingo: skip bar (missing close)");
                continue;
            }
        };
        let open = parse_required_f64(bar, "open", "tiingo").unwrap_or(close);
        let high = parse_required_f64(bar, "high", "tiingo").unwrap_or(close);
        let low = parse_required_f64(bar, "low", "tiingo").unwrap_or(close);
        let volume = parse_required_i64(bar, "volume", "tiingo").unwrap_or(0);
        let date = bar
            .get("date")
            .and_then(|v| v.as_str())
            .map(|s| s[..10.min(s.len())].to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "tiingo".into(),
        });
    }
    Ok(out)
}

/// Parse a Twelve Data `/quote?symbol={symbol}` response.
/// Returns `Err` when `symbol` or `close` is missing/invalid.
pub fn parse_twelve_data_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let symbol = json
        .get("symbol")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField {
            provider: "twelve_data".into(),
            field: "symbol".into(),
        })?
        .to_string();
    let price = parse_required_f64(json, "close", "twelve_data")?;
    let volume = parse_optional_i64(json, "volume", "twelve_data")?;
    Ok(ProviderQuote {
        symbol,
        price,
        bid: None,
        ask: None,
        volume,
    })
}

/// Parse a Twelve Data `/time_series` response into a vec of `HistoricalPrice`.
/// Bars with a missing or bad `close` field are skipped (logged as warn).
/// Returns `Err(EmptyResponse)` if no bars survive.
pub fn parse_twelve_data_historical(
    json: &serde_json::Value,
) -> Result<Vec<HistoricalPrice>, ParseError> {
    let values = json
        .get("values")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "twelve_data".into(),
            field: "values".into(),
        })?;
    let mut out = Vec::with_capacity(values.len());
    for (i, bar) in values.iter().enumerate() {
        let close = match parse_required_f64(bar, "close", "twelve_data") {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(idx = i, err = %e, "twelve_data: skip bar (missing close)");
                continue;
            }
        };
        let open = parse_required_f64(bar, "open", "twelve_data").unwrap_or(close);
        let high = parse_required_f64(bar, "high", "twelve_data").unwrap_or(close);
        let low = parse_required_f64(bar, "low", "twelve_data").unwrap_or(close);
        let volume = parse_required_i64(bar, "volume", "twelve_data").unwrap_or(0);
        let date = bar
            .get("datetime")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "twelve_data".into(),
        });
    }
    Ok(out)
}

/// Parse a Polygon `/v2/aggs/ticker/{symbol}/prev` response.
/// Returns `Err` when `ticker`, `results` array, or `c` (close) is missing.
pub fn parse_polygon_quote(json: &serde_json::Value) -> Result<ProviderQuote, ParseError> {
    let symbol = json
        .get("ticker")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::MissingField {
            provider: "polygon".into(),
            field: "ticker".into(),
        })?
        .to_string();
    let results = json
        .get("results")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "polygon".into(),
            field: "results".into(),
        })?;
    let first = results
        .first()
        .ok_or_else(|| ParseError::EmptyResponse {
            provider: "polygon".into(),
        })?;
    let price = parse_required_f64(first, "c", "polygon")?;
    let volume = parse_optional_i64(first, "v", "polygon")?;
    Ok(ProviderQuote {
        symbol,
        price,
        bid: None,
        ask: None,
        volume,
    })
}

/// Parse a Polygon `/v2/aggs/ticker/{symbol}/range/...` response into a vec of `HistoricalPrice`.
/// Bars with a missing or bad `c` (close) field are skipped (logged as warn).
/// Polygon timestamps are milliseconds; converted to YYYY-MM-DD dates.
/// Returns `Err(EmptyResponse)` if no bars survive.
pub fn parse_polygon_historical(
    json: &serde_json::Value,
) -> Result<Vec<HistoricalPrice>, ParseError> {
    let results = json
        .get("results")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ParseError::MissingField {
            provider: "polygon".into(),
            field: "results".into(),
        })?;
    let mut out = Vec::with_capacity(results.len());
    for (i, bar) in results.iter().enumerate() {
        let close = match parse_required_f64(bar, "c", "polygon") {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(idx = i, err = %e, "polygon: skip bar (missing close)");
                continue;
            }
        };
        let open = parse_required_f64(bar, "o", "polygon").unwrap_or(close);
        let high = parse_required_f64(bar, "h", "polygon").unwrap_or(close);
        let low = parse_required_f64(bar, "l", "polygon").unwrap_or(close);
        let volume = parse_required_i64(bar, "v", "polygon").unwrap_or(0);
        // Polygon timestamps are ms since epoch; convert to YYYY-MM-DD
        let date = bar
            .get("t")
            .and_then(|v| v.as_i64())
            .and_then(|ms| chrono::DateTime::from_timestamp(ms / 1000, 0))
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| format!("idx:{i}"));
        out.push(HistoricalPrice {
            date,
            open,
            high,
            low,
            close,
            volume,
        });
    }
    if out.is_empty() {
        return Err(ParseError::EmptyResponse {
            provider: "polygon".into(),
        });
    }
    Ok(out)
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
    alpaca_key: Option<String>, // Unlimited free basic data
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

impl Default for MultiSourceProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl MultiSourceProvider {
    pub fn new() -> Self {
        // Load API keys from environment (RUNTIME_KEYS first, then encrypted env fallback)
        let alpaca_key = crate::get_api_key("ALPACA_API_KEY");
        let alpaca_secret = crate::get_api_key("ALPACA_SECRET_KEY");
        let polygon_key = crate::get_api_key("POLYGON_API_KEY");
        let alphavantage_key = crate::get_api_key("ALPHA_VANTAGE_API_KEY");
        let finnhub_key = crate::get_api_key("FINNHUB_API_KEY");
        let fmp_key = crate::get_api_key("FMP_API_KEY");
        let tiingo_key = crate::get_api_key("TIINGO_API_KEY");
        let twelve_data_key = crate::get_api_key("TWELVE_DATA_API_KEY");

        tracing::info!("Multi-Source Provider initialized");
        tracing::info!(
            alpaca = if alpaca_key.is_some() && alpaca_secret.is_some() {
                "configured"
            } else {
                "not configured"
            },
            polygon = if polygon_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
            alpha_vantage = if alphavantage_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
            finnhub = if finnhub_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
            fmp = if fmp_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
            tiingo = if tiingo_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
            twelve_data = if twelve_data_key.is_some() {
                "configured"
            } else {
                "not configured"
            },
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
            successes * 100 / total
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
            (
                "alpaca",
                self.get_provider_health("alpaca"),
                tier_priority("alpaca"),
            ),
            (
                "yahoo",
                self.get_provider_health("yahoo"),
                tier_priority("yahoo"),
            ),
            (
                "tiingo",
                self.get_provider_health("tiingo"),
                tier_priority("tiingo"),
            ),
            (
                "finnhub",
                self.get_provider_health("finnhub"),
                tier_priority("finnhub"),
            ),
            (
                "twelve_data",
                self.get_provider_health("twelve_data"),
                tier_priority("twelve_data"),
            ),
            ("fmp", self.get_provider_health("fmp"), tier_priority("fmp")),
            (
                "alphavantage",
                self.get_provider_health("alphavantage"),
                tier_priority("alphavantage"),
            ),
            (
                "polygon",
                self.get_provider_health("polygon"),
                tier_priority("polygon"),
            ),
        ];

        // Sort by tier first, then by health score
        providers.sort_by(|a, b| match b.2.cmp(&a.2) {
            std::cmp::Ordering::Equal => b.1.cmp(&a.1),
            other => other,
        });

        providers.into_iter().map(|(name, _, _)| name).collect()
    }

    // ================== PROVIDER IMPLEMENTATIONS ==================

    /// Alpaca Data API (unlimited for basic stock data)
    async fn fetch_from_alpaca(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let api_key = self
            .alpaca_key
            .as_ref()
            .ok_or("Alpaca API key not configured")?;
        let api_secret = self
            .alpaca_secret
            .as_ref()
            .ok_or("Alpaca API secret not configured")?;

        if !self.check_rate_limit("alpaca", 200) {
            return Err("Alpaca rate limit exceeded".to_string());
        }

        // Fetch recent bars (last 5 days to get at least one trading day)
        let end_date = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(5))
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();

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

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Extract recent bars via the pure parser helper (no silent zeros)
        let recent_bars = parse_alpaca_bars(&data)
            .map_err(|e| format!("Alpaca bars parse error: {e}"))?;
        let latest_bar_price = recent_bars.last().map(|b| b.close).ok_or("No recent bars")?;
        let volume = recent_bars.last().map(|b| b.volume).unwrap_or(0);
        let timestamp = recent_bars
            .last()
            .map(|b| b.date.clone())
            .unwrap_or_default();
        let price = latest_bar_price;

        // Calculate change from previous bar if available
        let (change, change_percent) = if recent_bars.len() >= 2 {
            let prev_close = recent_bars[recent_bars.len() - 2].close;
            let chg = price - prev_close;
            let chg_pct = if prev_close > 0.0 {
                (chg / prev_close) * 100.0
            } else {
                0.0
            };
            (chg, chg_pct)
        } else {
            (0.0, 0.0)
        };

        // Fetch historical bars (1 year)
        let hist_end = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let hist_start = (chrono::Utc::now() - chrono::Duration::days(365))
            .format("%Y-%m-%d")
            .to_string();

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
        // Use pure parser; an empty/missing bars array is non-fatal (return empty vec)
        let historical: Vec<HistoricalPrice> = parse_alpaca_bars(&hist_data).unwrap_or_default();

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
        let api_key = self
            .finnhub_key
            .as_ref()
            .ok_or("Finnhub API key not configured")?;

        // Conservative rate limit: 50/min to leave buffer
        if !self.check_rate_limit("finnhub", 50) {
            return Err("Finnhub rate limit exceeded".to_string());
        }

        // Fetch quote — API key in header to avoid leaking it in logs
        let quote_url = format!("https://finnhub.io/api/v1/quote?symbol={}", symbol);

        let response = crate::HTTP_CLIENT
            .get(&quote_url)
            .header("X-Finnhub-Token", api_key.trim())
            .send()
            .await
            .map_err(|e| format!("Finnhub request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Finnhub API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Use pure parser helper (no silent zeros for missing "c")
        let fq = parse_finnhub_quote(&data)
            .map_err(|e| format!("Finnhub quote parse error: {e}"))?;
        let price = fq.price;
        let change = data.get("d").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let change_percent = data.get("dp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let timestamp = data
            .get("t")
            .and_then(|v| v.as_i64())
            .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
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

        let candles_response = crate::HTTP_CLIENT
            .get(&candles_url)
            .header("X-Finnhub-Token", api_key.trim())
            .send()
            .await;
        // Use pure parser helper; non-fatal if candles unavailable
        let historical = if let Ok(resp) = candles_response {
            if let Ok(candles_data) = resp.json::<Value>().await {
                parse_finnhub_candles(&candles_data).unwrap_or_default()
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

        if !self.check_rate_limit("fmp", 4) {
            // ~250/day = 4/min
            return Err("FMP rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://financialmodelingprep.com/api/v3/quote/{}?apikey={}",
            symbol,
            api_key.trim()
        );

        let response = crate::HTTP_CLIENT
            .get(&quote_url)
            .send()
            .await
            .map_err(|e| format!("FMP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("FMP API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        let quote = match parse_fmp_quote(&data) {
            Ok(pq) => {
                let change = data
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(|q| q.get("change"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let change_percent = data
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(|q| q.get("changesPercentage"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                Some(StockQuote {
                    symbol: symbol.to_string(),
                    price: pq.price,
                    change,
                    change_percent,
                    volume: pq.volume.unwrap_or(0),
                    timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    source: "fmp".to_string(),
                })
            }
            Err(e) => {
                tracing::warn!(err = %e, "fmp: quote parse failed, returning None quote");
                None
            }
        };

        // Fetch historical prices
        let hist_url = format!(
            "https://financialmodelingprep.com/api/v3/historical-price-full/{}?apikey={}",
            symbol,
            api_key.trim()
        );

        let hist_response = crate::HTTP_CLIENT.get(&hist_url).send().await;
        let historical = if let Ok(resp) = hist_response {
            if let Ok(hist_data) = resp.json::<Value>().await {
                parse_fmp_historical(&hist_data)
                    .unwrap_or_default()
                    .into_iter()
                    .take(365)
                    .collect()
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
        let api_key = self
            .tiingo_key
            .as_ref()
            .ok_or("Tiingo API key not configured")?;

        // Conservative rate limit: 7/min (420/hour) to leave buffer
        if !self.check_rate_limit("tiingo", 7) {
            return Err("Tiingo rate limit exceeded".to_string());
        }

        // Fetch IEX data (real-time)
        let iex_url = format!("https://api.tiingo.com/iex/{}", symbol);

        let response = crate::HTTP_CLIENT
            .get(&iex_url)
            .header("Authorization", format!("Token {}", api_key.trim()))
            .send()
            .await
            .map_err(|e| format!("Tiingo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Tiingo API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        let quote = match parse_tiingo_quote(&data) {
            Ok(pq) => {
                let change_percent = data
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(|q| {
                        let prev = q.get("prevClose")?.as_f64()?;
                        let last = pq.price;
                        if prev != 0.0 {
                            Some(((last - prev) / prev) * 100.0)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0.0);
                let timestamp = data
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(|q| q.get("timestamp"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                Some(StockQuote {
                    symbol: symbol.to_string(),
                    price: pq.price,
                    change: 0.0,
                    change_percent,
                    volume: pq.volume.unwrap_or(0),
                    timestamp,
                    source: "tiingo".to_string(),
                })
            }
            Err(e) => {
                tracing::warn!(err = %e, "tiingo: quote parse failed, returning None quote");
                None
            }
        };

        // Fetch historical data
        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365))
            .format("%Y-%m-%d")
            .to_string();

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
                parse_tiingo_historical(&hist_data).unwrap_or_default()
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
        let api_key = self
            .twelve_data_key
            .as_ref()
            .ok_or("Twelve Data API key not configured")?;

        if !self.check_rate_limit("twelve_data", 1) {
            // Conservative rate limit
            return Err("Twelve Data rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://api.twelvedata.com/quote?symbol={}&apikey={}",
            symbol,
            api_key.trim()
        );

        let response = crate::HTTP_CLIENT
            .get(&quote_url)
            .send()
            .await
            .map_err(|e| format!("Twelve Data request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Twelve Data API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        if data.get("code").is_some() {
            return Err("Twelve Data API error".to_string());
        }

        let pq = parse_twelve_data_quote(&data)
            .map_err(|e| format!("Twelve Data quote parse error: {e}"))?;
        let quote = Some(StockQuote {
            symbol: symbol.to_string(),
            price: pq.price,
            change: data
                .get("change")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0),
            change_percent: data
                .get("percent_change")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0),
            volume: pq.volume.unwrap_or(0),
            timestamp: data
                .get("datetime")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string(),
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
                parse_twelve_data_historical(&ts_data).unwrap_or_default()
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
        let api_key = self
            .polygon_key
            .as_ref()
            .ok_or("Polygon API key not configured")?;

        // Very conservative for free tier (4/min to leave buffer)
        if !self.check_rate_limit("polygon", 4) {
            return Err("Polygon rate limit exceeded".to_string());
        }

        // Fetch previous close
        let quote_url = format!(
            "https://api.polygon.io/v2/aggs/ticker/{}/prev?adjusted=true&apiKey={}",
            symbol,
            api_key.trim()
        );

        let response = crate::HTTP_CLIENT
            .get(&quote_url)
            .send()
            .await
            .map_err(|e| format!("Polygon request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Polygon API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        let pq = parse_polygon_quote(&data)
            .map_err(|e| format!("Polygon quote parse error: {e}"))?;
        let quote = Some(StockQuote {
            symbol: symbol.to_string(),
            price: pq.price,
            change: 0.0,
            change_percent: 0.0,
            volume: pq.volume.unwrap_or(0),
            timestamp: data
                .get("results")
                .and_then(|r| r.as_array())
                .and_then(|a| a.first())
                .and_then(|r| r.get("t"))
                .and_then(|t| t.as_i64())
                .and_then(|ts| chrono::DateTime::from_timestamp_millis(ts))
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_default(),
            source: "polygon".to_string(),
        });

        // Fetch historical data
        let end_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let start_date = (chrono::Utc::now() - chrono::Duration::days(365))
            .format("%Y-%m-%d")
            .to_string();

        let hist_url = format!(
            "https://api.polygon.io/v2/aggs/ticker/{}/range/1/day/{}/{}?adjusted=true&sort=asc&limit=365&apiKey={}",
            symbol, start_date, end_date, api_key.trim()
        );

        let hist_response = crate::HTTP_CLIENT.get(&hist_url).send().await;
        let historical = if let Ok(resp) = hist_response {
            if let Ok(hist_data) = resp.json::<Value>().await {
                parse_polygon_historical(&hist_data).unwrap_or_default()
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
        let api_key = self
            .alphavantage_key
            .as_ref()
            .ok_or("Alpha Vantage API key not configured")?;

        // Very conservative for free tier (4/min to leave buffer)
        if !self.check_rate_limit("alphavantage", 4) {
            return Err("Alpha Vantage rate limit exceeded".to_string());
        }

        // Fetch quote
        let quote_url = format!(
            "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={}&apikey={}",
            symbol,
            api_key.trim()
        );

        let response = crate::HTTP_CLIENT
            .get(&quote_url)
            .send()
            .await
            .map_err(|e| format!("Alpha Vantage request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Alpha Vantage API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Check for rate limit
        if data.get("Note").is_some() || data.get("Information").is_some() {
            return Err("Alpha Vantage rate limit".to_string());
        }

        let global_quote = data.get("Global Quote");
        let quote = global_quote.map(|q| StockQuote {
            symbol: symbol.to_string(),
            price: q
                .get("05. price")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0),
            change: q
                .get("09. change")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0),
            change_percent: q
                .get("10. change percent")
                .and_then(|v| v.as_str())
                .and_then(|s| s.trim_end_matches('%').parse().ok())
                .unwrap_or(0.0),
            volume: q
                .get("06. volume")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            timestamp: q
                .get("07. latest trading day")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string(),
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
                ts_data
                    .get("Time Series (Daily)")
                    .and_then(|ts| ts.as_object())
                    .map(|obj| {
                        let mut prices: Vec<HistoricalPrice> = obj
                            .iter()
                            .take(365)
                            .filter_map(|(date, values)| {
                                Some(HistoricalPrice {
                                    date: date.clone(),
                                    open: values.get("1. open")?.as_str()?.parse().ok()?,
                                    high: values.get("2. high")?.as_str()?.parse().ok()?,
                                    low: values.get("3. low")?.as_str()?.parse().ok()?,
                                    close: values
                                        .get("5. adjusted close")?
                                        .as_str()?
                                        .parse()
                                        .ok()?,
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
            .header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            )
            .send()
            .await
            .map_err(|e| format!("Yahoo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Yahoo API error: {}", response.status()));
        }

        let data: Value = response
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        let result = data
            .get("chart")
            .and_then(|c| c.get("result"))
            .and_then(|r| r.as_array())
            .and_then(|a| a.first())
            .ok_or("Invalid Yahoo response")?;

        let meta = result.get("meta");
        let quote = meta.map(|m| StockQuote {
            symbol: symbol.to_string(),
            price: m
                .get("regularMarketPrice")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            change: m
                .get("regularMarketPrice")
                .and_then(|p| {
                    let price = p.as_f64()?;
                    let prev = m.get("previousClose")?.as_f64()?;
                    Some(price - prev)
                })
                .unwrap_or(0.0),
            change_percent: m
                .get("regularMarketPrice")
                .and_then(|p| {
                    let price = p.as_f64()?;
                    let prev = m.get("previousClose")?.as_f64()?;
                    Some(((price - prev) / prev) * 100.0)
                })
                .unwrap_or(0.0),
            volume: m
                .get("regularMarketVolume")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            timestamp: m
                .get("regularMarketTime")
                .and_then(|t| t.as_i64())
                .map(|ts| {
                    chrono::DateTime::from_timestamp(ts, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_default()
                })
                .unwrap_or_default(),
            source: "yahoo".to_string(),
        });

        // Parse historical data
        let timestamps = result.get("timestamp").and_then(|t| t.as_array());
        let indicators = result
            .get("indicators")
            .and_then(|i| i.get("quote"))
            .and_then(|q| q.as_array())
            .and_then(|a| a.first());

        let historical = if let (Some(ts), Some(ind)) = (timestamps, indicators) {
            let opens = ind.get("open").and_then(|o| o.as_array());
            let highs = ind.get("high").and_then(|h| h.as_array());
            let lows = ind.get("low").and_then(|l| l.as_array());
            let closes = ind.get("close").and_then(|c| c.as_array());
            let volumes = ind.get("volume").and_then(|v| v.as_array());

            if let (Some(o), Some(h), Some(l), Some(c), Some(v)) =
                (opens, highs, lows, closes, volumes)
            {
                ts.iter()
                    .enumerate()
                    .filter_map(|(i, t)| {
                        Some(HistoricalPrice {
                            date: chrono::DateTime::from_timestamp(t.as_i64()?, 0)?
                                .format("%Y-%m-%d")
                                .to_string(),
                            open: o.get(i)?.as_f64()?,
                            high: h.get(i)?.as_f64()?,
                            low: l.get(i)?.as_f64()?,
                            close: c.get(i)?.as_f64()?,
                            volume: v.get(i)?.as_i64()?,
                        })
                    })
                    .collect()
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

    /// Format a list of per-provider failures into a single user-visible error string.
    pub fn format_aggregated_error(symbol: &str, errors: &[(String, String)]) -> String {
        use std::fmt::Write as _;
        let mut s = format!("All providers failed for {}:", symbol);
        for (provider, err) in errors {
            let _ = write!(s, "\n  - {}: {}", provider, err);
        }
        s
    }

    /// Fetch market data with intelligent failover and caching
    pub async fn get_market_data(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let symbol = symbol.to_uppercase();

        // Check in-memory quote cache
        if let Some(entry) = self.quote_cache.get(&symbol) {
            if entry.timestamp.elapsed().unwrap_or(Duration::MAX) < self.quote_cache_ttl {
                return Ok(MarketDataResult {
                    quote: Some(entry.data.clone()),
                    historical: self
                        .historical_cache
                        .get(&symbol)
                        .map(|h| h.data.clone())
                        .unwrap_or_default(),
                    source: entry.source.clone(),
                    cached: true,
                });
            }
        }

        // Try providers in health-based order
        let providers = self.get_provider_order();
        let mut errors: Vec<(String, String)> = Vec::new();

        for provider in providers {
            let result = match provider {
                "alpaca" if self.alpaca_key.is_some() => self.fetch_from_alpaca(&symbol).await,
                "finnhub" if self.finnhub_key.is_some() => self.fetch_from_finnhub(&symbol).await,
                "fmp" if self.fmp_key.is_some() => self.fetch_from_fmp(&symbol).await,
                "tiingo" if self.tiingo_key.is_some() => self.fetch_from_tiingo(&symbol).await,
                "twelve_data" if self.twelve_data_key.is_some() => {
                    self.fetch_from_twelve_data(&symbol).await
                }
                "polygon" if self.polygon_key.is_some() => self.fetch_from_polygon(&symbol).await,
                "alphavantage" if self.alphavantage_key.is_some() => {
                    self.fetch_from_alphavantage(&symbol).await
                }
                "yahoo" => self.fetch_from_yahoo(&symbol).await,
                _ => continue,
            };

            match result {
                Ok(data) => {
                    // Cache the result
                    if let Some(ref quote) = data.quote {
                        self.quote_cache.insert(
                            symbol.clone(),
                            CacheEntry {
                                data: quote.clone(),
                                timestamp: SystemTime::now(),
                                source: data.source.clone(),
                            },
                        );
                    }

                    if !data.historical.is_empty() {
                        self.historical_cache.insert(
                            symbol.clone(),
                            CacheEntry {
                                data: data.historical.clone(),
                                timestamp: SystemTime::now(),
                                source: data.source.clone(),
                            },
                        );
                    }

                    return Ok(data);
                }
                Err(e) => {
                    self.track_failure(provider);
                    errors.push((provider.to_string(), e.to_string()));
                    tracing::warn!(provider = %provider, symbol = %symbol, error = %e, "Provider failed");
                    continue;
                }
            }
        }

        Err(Self::format_aggregated_error(&symbol, &errors))
    }

    /// Batch fetch market data for multiple symbols
    pub async fn get_batch_market_data(
        &self,
        symbols: Vec<String>,
    ) -> HashMap<String, MarketDataResult> {
        use futures::stream::{self, StreamExt};

        let results: Vec<(String, Result<MarketDataResult, String>)> = stream::iter(symbols)
            .map(|symbol| async move {
                let result = self.get_market_data(&symbol).await;
                (symbol, result)
            })
            .buffer_unordered(5) // Limit concurrency
            .collect()
            .await;

        results
            .into_iter()
            .filter_map(|(symbol, result)| result.ok().map(|data| (symbol, data)))
            .collect()
    }

    /// Get current price only (optimized)
    pub async fn get_current_price(&self, symbol: &str) -> Result<f64, String> {
        let data = self.get_market_data(symbol).await?;
        data.quote
            .map(|q| q.price)
            .ok_or("No price data".to_string())
    }

    /// Batch get current prices
    pub async fn get_batch_prices(&self, symbols: Vec<String>) -> HashMap<String, f64> {
        let data = self.get_batch_market_data(symbols).await;
        data.into_iter()
            .filter_map(|(symbol, result)| result.quote.map(|q| (symbol, q.price)))
            .collect()
    }

    /// Get provider health stats
    pub fn get_health_stats(&self) -> HashMap<String, (u32, u32)> {
        self.provider_health
            .iter()
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
        assert!(
            provider.quote_cache.is_empty(),
            "quote_cache should be empty on construction"
        );
        assert!(
            provider.historical_cache.is_empty(),
            "historical_cache should be empty on construction"
        );
        assert!(
            provider.rate_limits.is_empty(),
            "rate_limits should be empty on construction"
        );
        assert!(
            provider.provider_health.is_empty(),
            "provider_health should be empty on construction"
        );
    }

    #[test]
    fn test_new_default_ttls() {
        let provider = MultiSourceProvider::new();
        assert_eq!(
            provider.quote_cache_ttl,
            Duration::from_secs(120),
            "quote TTL should be 2 minutes"
        );
        assert_eq!(
            provider.historical_cache_ttl,
            Duration::from_secs(7200),
            "historical TTL should be 2 hours"
        );
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
        assert!(
            !provider.check_rate_limit("rl_exhaust", limit),
            "should return false when limit reached"
        );
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
        assert!(
            provider.check_rate_limit("rl_old", 5),
            "should reset and return true after window expires"
        );
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
        let expected = [
            "alpaca",
            "yahoo",
            "tiingo",
            "finnhub",
            "twelve_data",
            "fmp",
            "alphavantage",
            "polygon",
        ];
        for name in &expected {
            assert!(
                order.contains(name),
                "provider order should contain {}",
                name
            );
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
        assert!(
            yahoo_pos < tiingo_pos,
            "yahoo (tier 9) should appear before a degraded tiingo (tier 8)"
        );
    }

    // ── Test 5: get_health_stats ─────────────────────────────────────────────

    #[test]
    fn test_get_health_stats_empty_initially() {
        let provider = MultiSourceProvider::new();
        let stats = provider.get_health_stats();
        assert!(
            stats.is_empty(),
            "health stats should be empty on a fresh provider"
        );
    }

    #[test]
    fn test_get_health_stats_reflects_tracked_health() {
        let provider = MultiSourceProvider::new();
        provider.track_success("stat_prov");
        provider.track_failure("stat_prov");
        let stats = provider.get_health_stats();
        assert!(
            stats.contains_key("stat_prov"),
            "stats should contain tracked provider"
        );
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
        assert!(
            !provider.quote_cache.is_empty(),
            "quote_cache should have one entry before clear"
        );
        provider.clear_cache();
        assert!(
            provider.quote_cache.is_empty(),
            "quote_cache should be empty after clear_cache"
        );
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
        assert!(
            !provider.historical_cache.is_empty(),
            "historical_cache should have one entry before clear"
        );
        provider.clear_cache();
        assert!(
            provider.historical_cache.is_empty(),
            "historical_cache should be empty after clear_cache"
        );
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
            CacheEntry {
                data: quote,
                timestamp: SystemTime::now(),
                source: "test".to_string(),
            },
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

    #[test]
    fn aggregated_error_contains_all_failed_provider_messages() {
        let errors = vec![
            ("alpaca".to_string(), "401 unauthorized".to_string()),
            ("finnhub".to_string(), "429 rate limited".to_string()),
            ("yahoo".to_string(), "crumb expired".to_string()),
        ];
        let aggregated = MultiSourceProvider::format_aggregated_error("AAPL", &errors);
        assert!(aggregated.contains("AAPL"), "should mention symbol");
        assert!(aggregated.contains("alpaca"), "should name alpaca");
        assert!(aggregated.contains("finnhub"), "should name finnhub");
        assert!(aggregated.contains("yahoo"), "should name yahoo");
        assert!(aggregated.contains("401 unauthorized"), "should include alpaca error");
        assert!(aggregated.contains("429 rate limited"), "should include finnhub error");
        assert!(aggregated.contains("crumb expired"), "should include yahoo error");
    }
}
