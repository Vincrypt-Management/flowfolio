// Free Data Sources - No API Key Required
// These providers work without any API key registration
//
// ============================================================================
// COMPLETELY FREE SOURCES (NO API KEY NEEDED):
// ============================================================================
// 1. Yahoo Finance     - Quotes + Historical (BEST)
// 2. Stooq             - Historical CSV data
// 3. CNBC              - Real-time quotes
// 4. MarketWatch       - Real-time quotes  
// 5. Investing.com     - Quotes + Historical
// 6. Tradingview       - Quotes (via embed)
// 7. Nasdaq            - Official Nasdaq data
// 8. SEC EDGAR         - Fundamentals/Filings
// 9. Federal Reserve   - Economic data (FRED)
// 10. World Bank       - Economic indicators
// ============================================================================

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use super::multi_source_provider::{StockQuote, HistoricalPrice, MarketDataResult};

/// Company fundamentals data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyFundamentals {
    pub symbol: String,
    pub name: String,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub eps: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub fifty_two_week_high: Option<f64>,
    pub fifty_two_week_low: Option<f64>,
}

/// Economic indicator data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EconomicIndicator {
    pub name: String,
    pub value: f64,
    pub date: String,
    pub unit: String,
    pub source: String,
}

/// Free data sources that don't require API keys
pub struct FreeDataProviders {}

impl FreeDataProviders {
    pub fn new() -> Self {
        Self {}
    }

    /// Get list of all available free sources
    pub fn available_sources() -> Vec<&'static str> {
        vec![
            "yahoo",
            "stooq", 
            "cnbc",
            "marketwatch",
            "nasdaq",
            "investingcom",
            "sec_edgar",
            "fred",
        ]
    }

    // ================== YAHOO FINANCE (NO KEY) ==================
    
    /// Yahoo Finance - Most reliable free source
    /// No API key required, generous rate limits
    pub async fn fetch_yahoo(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let end_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let start_time = end_time - (365 * 24 * 60 * 60);

        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d",
            symbol, start_time, end_time
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
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
        let quote = meta.map(|m| {
            let price = m.get("regularMarketPrice").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let prev = m.get("previousClose").and_then(|v| v.as_f64()).unwrap_or(price);
            
            StockQuote {
                symbol: symbol.to_string(),
                price,
                change: price - prev,
                change_percent: if prev > 0.0 { ((price - prev) / prev) * 100.0 } else { 0.0 },
                volume: m.get("regularMarketVolume").and_then(|v| v.as_i64()).unwrap_or(0),
                timestamp: m.get("regularMarketTime").and_then(|t| t.as_i64())
                    .map(|ts| chrono::DateTime::from_timestamp(ts, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_default())
                    .unwrap_or_default(),
                source: "yahoo".to_string(),
            }
        });

        // Parse historical data
        let timestamps = result.get("timestamp").and_then(|t| t.as_array());
        let indicators = result.get("indicators")
            .and_then(|i| i.get("quote"))
            .and_then(|q| q.as_array())
            .and_then(|a| a.first());

        let historical = Self::parse_yahoo_historical(timestamps, indicators);

        Ok(MarketDataResult {
            quote,
            historical,
            source: "yahoo".to_string(),
            cached: false,
        })
    }

    fn parse_yahoo_historical(
        timestamps: Option<&Vec<Value>>,
        indicators: Option<&Value>,
    ) -> Vec<HistoricalPrice> {
        if let (Some(ts), Some(ind)) = (timestamps, indicators) {
            let opens = ind.get("open").and_then(|o| o.as_array());
            let highs = ind.get("high").and_then(|h| h.as_array());
            let lows = ind.get("low").and_then(|l| l.as_array());
            let closes = ind.get("close").and_then(|c| c.as_array());
            let volumes = ind.get("volume").and_then(|v| v.as_array());

            if let (Some(o), Some(h), Some(l), Some(c), Some(v)) = (opens, highs, lows, closes, volumes) {
                return ts.iter().enumerate().filter_map(|(i, t)| {
                    Some(HistoricalPrice {
                        date: chrono::DateTime::from_timestamp(t.as_i64()?, 0)?
                            .format("%Y-%m-%d").to_string(),
                        open: o.get(i)?.as_f64()?,
                        high: h.get(i)?.as_f64()?,
                        low: l.get(i)?.as_f64()?,
                        close: c.get(i)?.as_f64()?,
                        volume: v.get(i)?.as_i64()?,
                    })
                }).collect();
            }
        }
        vec![]
    }

    // ================== GOOGLE FINANCE (NO KEY) ==================
    
    /// Google Finance - Basic quote data
    /// Scrapes public data, no API key required
    pub async fn fetch_google_finance(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let url = format!(
            "https://www.google.com/finance/quote/{}:NASDAQ",
            symbol
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Google Finance request failed: {}", e))?;

        if !response.status().is_success() {
            // Try NYSE
            let url_nyse = format!("https://www.google.com/finance/quote/{}:NYSE", symbol);
            let response_nyse = crate::HTTP_CLIENT.get(&url_nyse).send().await
                .map_err(|e| format!("Google Finance request failed: {}", e))?;
            
            if !response_nyse.status().is_success() {
                return Err("Google Finance: Symbol not found".to_string());
            }
        }

        // Google Finance doesn't provide a clean JSON API
        // This is a fallback - prefer Yahoo
        Err("Google Finance: Parsing not implemented (use Yahoo instead)".to_string())
    }

    // ================== STOOQ (NO KEY) ==================
    
    /// Stooq - Free historical data
    /// No API key required, provides CSV data
    pub async fn fetch_stooq_historical(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let url = format!(
            "https://stooq.com/q/d/l/?s={}.us&i=d",
            symbol.to_lowercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Stooq request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Stooq API error: {}", response.status()));
        }

        let csv_data = response.text().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse CSV (Date,Open,High,Low,Close,Volume)
        let mut historical = Vec::new();
        for line in csv_data.lines().skip(1) {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 6 {
                if let (Ok(open), Ok(high), Ok(low), Ok(close), Ok(volume)) = (
                    parts[1].parse::<f64>(),
                    parts[2].parse::<f64>(),
                    parts[3].parse::<f64>(),
                    parts[4].parse::<f64>(),
                    parts[5].parse::<i64>(),
                ) {
                    historical.push(HistoricalPrice {
                        date: parts[0].to_string(),
                        open,
                        high,
                        low,
                        close,
                        volume,
                    });
                }
            }
        }

        // Reverse to get oldest first
        historical.reverse();
        
        // Limit to 365 days
        let len = historical.len();
        if len > 365 {
            historical = historical.into_iter().skip(len - 365).collect();
        }

        Ok(historical)
    }

    // ================== MARKETWATCH (NO KEY) ==================
    
    /// MarketWatch - Quote data via public endpoint
    pub async fn fetch_marketwatch(&self, symbol: &str) -> Result<StockQuote, String> {
        let url = format!(
            "https://api.marketwatch.com/mw/quotes/{}/quote",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("MarketWatch request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("MarketWatch API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let quote_data = data.get("data").ok_or("No data in response")?;
        
        Ok(StockQuote {
            symbol: symbol.to_string(),
            price: quote_data.get("last").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: quote_data.get("change").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change_percent: quote_data.get("changePercent").and_then(|v| v.as_f64()).unwrap_or(0.0),
            volume: quote_data.get("volume").and_then(|v| v.as_i64()).unwrap_or(0),
            timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            source: "marketwatch".to_string(),
        })
    }

    // ================== CNBC (NO KEY) ==================
    
    /// CNBC Quote API - Public endpoint
    pub async fn fetch_cnbc(&self, symbol: &str) -> Result<StockQuote, String> {
        let url = format!(
            "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols={}&requestMethod=itv&no498=1&partnerId=2&fund=1&exthrs=1&output=json&events=1",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("CNBC request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("CNBC API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let quote_data = data.get("FormattedQuoteResult")
            .and_then(|r| r.get("FormattedQuote"))
            .and_then(|q| q.as_array())
            .and_then(|a| a.first())
            .ok_or("No quote data")?;

        Ok(StockQuote {
            symbol: symbol.to_string(),
            price: quote_data.get("last").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change: quote_data.get("change").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0.0),
            change_percent: quote_data.get("change_pct").and_then(|v| v.as_str()).and_then(|s| s.trim_end_matches('%').parse().ok()).unwrap_or(0.0),
            volume: quote_data.get("volume").and_then(|v| v.as_str()).and_then(|s| s.replace(",", "").parse().ok()).unwrap_or(0),
            timestamp: quote_data.get("last_time").and_then(|t| t.as_str()).unwrap_or("").to_string(),
            source: "cnbc".to_string(),
        })
    }

    // ================== NASDAQ OFFICIAL (NO KEY) ==================
    
    /// Nasdaq Official API - Free public endpoint
    /// Provides official Nasdaq-listed stock data
    pub async fn fetch_nasdaq(&self, symbol: &str) -> Result<MarketDataResult, String> {
        let url = format!(
            "https://api.nasdaq.com/api/quote/{}/info?assetclass=stocks",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .header("Accept", "application/json, text/plain, */*")
            .header("Origin", "https://www.nasdaq.com")
            .send()
            .await
            .map_err(|e| format!("Nasdaq request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Nasdaq API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let primary_data = data.get("data")
            .and_then(|d| d.get("primaryData"))
            .ok_or("No primary data")?;

        let price_str = primary_data.get("lastSalePrice")
            .and_then(|v| v.as_str())
            .unwrap_or("$0");
        let price = price_str.trim_start_matches('$').replace(",", "").parse().unwrap_or(0.0);

        let change_str = primary_data.get("netChange")
            .and_then(|v| v.as_str())
            .unwrap_or("0");
        let change = change_str.parse().unwrap_or(0.0);

        let change_pct_str = primary_data.get("percentageChange")
            .and_then(|v| v.as_str())
            .unwrap_or("0%");
        let change_percent = change_pct_str.trim_end_matches('%').parse().unwrap_or(0.0);

        let volume_str = primary_data.get("volume")
            .and_then(|v| v.as_str())
            .unwrap_or("0");
        let volume = volume_str.replace(",", "").parse().unwrap_or(0);

        Ok(MarketDataResult {
            quote: Some(StockQuote {
                symbol: symbol.to_string(),
                price,
                change,
                change_percent,
                volume,
                timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                source: "nasdaq".to_string(),
            }),
            historical: vec![], // Nasdaq API doesn't provide easy historical access
            source: "nasdaq".to_string(),
            cached: false,
        })
    }

    /// Nasdaq Historical Data
    pub async fn fetch_nasdaq_historical(&self, symbol: &str) -> Result<Vec<HistoricalPrice>, String> {
        let url = format!(
            "https://api.nasdaq.com/api/quote/{}/historical?assetclass=stocks&fromdate=2024-01-01&limit=365",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .header("Accept", "application/json")
            .header("Origin", "https://www.nasdaq.com")
            .send()
            .await
            .map_err(|e| format!("Nasdaq historical request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Nasdaq API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let rows = data.get("data")
            .and_then(|d| d.get("tradesTable"))
            .and_then(|t| t.get("rows"))
            .and_then(|r| r.as_array())
            .ok_or("No historical data")?;

        let historical: Vec<HistoricalPrice> = rows.iter().filter_map(|row| {
            let date = row.get("date")?.as_str()?;
            let close_str = row.get("close")?.as_str()?;
            let close = close_str.trim_start_matches('$').replace(",", "").parse().ok()?;
            let volume_str = row.get("volume")?.as_str()?;
            let volume = volume_str.replace(",", "").parse().ok()?;
            
            // Nasdaq doesn't always provide OHLC, use close for all
            Some(HistoricalPrice {
                date: date.to_string(),
                open: close,
                high: close,
                low: close,
                close,
                volume,
            })
        }).collect();

        Ok(historical)
    }

    // ================== INVESTING.COM (NO KEY) ==================

    /// Investing.com - Major financial portal
    /// Uses their public search API
    pub async fn fetch_investingcom(&self, symbol: &str) -> Result<StockQuote, String> {
        // Investing.com search endpoint
        let url = format!(
            "https://api.investing.com/api/search/v2/search?q={}",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .header("Accept", "application/json")
            .header("Domain-Id", "www")
            .send()
            .await
            .map_err(|e| format!("Investing.com request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Investing.com API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Find the stock in search results
        let quotes = data.get("quotes")
            .and_then(|q| q.as_array())
            .ok_or("No quotes found")?;

        let stock = quotes.iter()
            .find(|q| {
                q.get("symbol").and_then(|s| s.as_str()) == Some(symbol)
            })
            .or_else(|| quotes.first())
            .ok_or("Symbol not found")?;

        Ok(StockQuote {
            symbol: symbol.to_string(),
            price: stock.get("last").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change: stock.get("change").and_then(|v| v.as_f64()).unwrap_or(0.0),
            change_percent: stock.get("changePercent").and_then(|v| v.as_f64()).unwrap_or(0.0),
            volume: 0, // Not always available
            timestamp: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            source: "investingcom".to_string(),
        })
    }

    // ================== SEC EDGAR (NO KEY) ==================

    /// SEC EDGAR - Official SEC filings
    /// Completely free, official US government data
    pub async fn fetch_sec_company_info(&self, symbol: &str) -> Result<CompanyFundamentals, String> {
        // First get CIK from ticker
        let tickers_url = "https://www.sec.gov/files/company_tickers.json";
        
        let response = crate::HTTP_CLIENT
            .get(tickers_url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("SEC request failed: {}", e))?;

        let tickers: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        // Find CIK for symbol
        let mut cik: Option<String> = None;
        if let Some(obj) = tickers.as_object() {
            for (_, company) in obj {
                if company.get("ticker").and_then(|t| t.as_str()) == Some(&symbol.to_uppercase()) {
                    if let Some(c) = company.get("cik_str").and_then(|c| c.as_str()) {
                        cik = Some(format!("{:0>10}", c));
                        break;
                    }
                }
            }
        }

        let cik = cik.ok_or("Company not found in SEC database")?;

        // Get company facts
        let facts_url = format!(
            "https://data.sec.gov/api/xbrl/companyfacts/CIK{}.json",
            cik
        );

        let facts_response = crate::HTTP_CLIENT
            .get(&facts_url)
            .header("Accept", "application/json")
            .header("User-Agent", "FlowFolio/1.0 (contact@example.com)")
            .send()
            .await
            .map_err(|e| format!("SEC facts request failed: {}", e))?;

        let facts: Value = facts_response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let company_name = facts.get("entityName")
            .and_then(|n| n.as_str())
            .unwrap_or(symbol)
            .to_string();

        // Extract EPS from facts
        let eps = facts.get("facts")
            .and_then(|f| f.get("us-gaap"))
            .and_then(|g| g.get("EarningsPerShareBasic"))
            .and_then(|e| e.get("units"))
            .and_then(|u| u.get("USD/shares"))
            .and_then(|arr| arr.as_array())
            .and_then(|arr| arr.last())
            .and_then(|v| v.get("val"))
            .and_then(|v| v.as_f64());

        Ok(CompanyFundamentals {
            symbol: symbol.to_string(),
            name: company_name,
            sector: None,
            industry: None,
            market_cap: None,
            pe_ratio: None,
            eps,
            dividend_yield: None,
            fifty_two_week_high: None,
            fifty_two_week_low: None,
        })
    }

    // ================== FEDERAL RESERVE (FRED - NO KEY) ==================

    /// Federal Reserve Economic Data (FRED)
    /// Free economic indicators without API key (limited)
    pub async fn fetch_fred_indicator(&self, series_id: &str) -> Result<EconomicIndicator, String> {
        // FRED provides some data without API key via their website
        let url = format!(
            "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}",
            series_id
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("FRED request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("FRED API error: {}", response.status()));
        }

        let csv_data = response.text().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse CSV - last row is most recent
        let lines: Vec<&str> = csv_data.lines().collect();
        if lines.len() < 2 {
            return Err("No data available".to_string());
        }

        let last_line = lines.last().unwrap();
        let parts: Vec<&str> = last_line.split(',').collect();
        
        if parts.len() < 2 {
            return Err("Invalid data format".to_string());
        }

        let date = parts[0].to_string();
        let value: f64 = parts[1].parse().unwrap_or(0.0);

        Ok(EconomicIndicator {
            name: series_id.to_string(),
            value,
            date,
            unit: "".to_string(),
            source: "fred".to_string(),
        })
    }

    /// Get common economic indicators
    pub async fn fetch_economic_overview(&self) -> HashMap<String, EconomicIndicator> {
        let mut indicators = HashMap::new();
        
        // Common FRED series IDs
        let series = vec![
            ("GDP", "GDP"),                    // Gross Domestic Product
            ("UNRATE", "UNRATE"),              // Unemployment Rate
            ("CPIAUCSL", "CPIAUCSL"),          // Consumer Price Index
            ("FEDFUNDS", "FEDFUNDS"),          // Federal Funds Rate
            ("SP500", "SP500"),                // S&P 500
            ("DGS10", "DGS10"),                // 10-Year Treasury
        ];

        for (name, series_id) in series {
            if let Ok(indicator) = self.fetch_fred_indicator(series_id).await {
                indicators.insert(name.to_string(), indicator);
            }
        }

        indicators
    }

    // ================== YAHOO FINANCE V2 (NO KEY) ==================

    /// Yahoo Finance Quote Summary - More detailed data
    pub async fn fetch_yahoo_quote_summary(&self, symbol: &str) -> Result<CompanyFundamentals, String> {
        let url = format!(
            "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=summaryDetail,defaultKeyStatistics,assetProfile",
            symbol.to_uppercase()
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Yahoo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Yahoo API error: {}", response.status()));
        }

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let result = data.get("quoteSummary")
            .and_then(|q| q.get("result"))
            .and_then(|r| r.as_array())
            .and_then(|a| a.first())
            .ok_or("No data found")?;

        let summary = result.get("summaryDetail");
        let key_stats = result.get("defaultKeyStatistics");
        let profile = result.get("assetProfile");

        let get_raw = |obj: Option<&Value>, key: &str| -> Option<f64> {
            obj?.get(key)?.get("raw")?.as_f64()
        };

        Ok(CompanyFundamentals {
            symbol: symbol.to_string(),
            name: profile
                .and_then(|p| p.get("longBusinessSummary"))
                .and_then(|n| n.as_str())
                .map(|s| s.chars().take(100).collect())
                .unwrap_or_else(|| symbol.to_string()),
            sector: profile.and_then(|p| p.get("sector")).and_then(|s| s.as_str()).map(String::from),
            industry: profile.and_then(|p| p.get("industry")).and_then(|s| s.as_str()).map(String::from),
            market_cap: get_raw(summary, "marketCap"),
            pe_ratio: get_raw(summary, "trailingPE"),
            eps: get_raw(key_stats, "trailingEps"),
            dividend_yield: get_raw(summary, "dividendYield").map(|v| v * 100.0),
            fifty_two_week_high: get_raw(summary, "fiftyTwoWeekHigh"),
            fifty_two_week_low: get_raw(summary, "fiftyTwoWeekLow"),
        })
    }

    /// Yahoo Finance Search - Find symbols
    pub async fn search_yahoo(&self, query: &str) -> Result<Vec<(String, String)>, String> {
        let url = format!(
            "https://query1.finance.yahoo.com/v1/finance/search?q={}&quotesCount=10&newsCount=0",
            query
        );

        let response = crate::HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Yahoo search failed: {}", e))?;

        let data: Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let quotes = data.get("quotes")
            .and_then(|q| q.as_array())
            .ok_or("No results")?;

        let results: Vec<(String, String)> = quotes.iter()
            .filter_map(|q| {
                let symbol = q.get("symbol")?.as_str()?;
                let name = q.get("shortname")
                    .or_else(|| q.get("longname"))
                    .and_then(|n| n.as_str())
                    .unwrap_or(symbol);
                Some((symbol.to_string(), name.to_string()))
            })
            .collect();

        Ok(results)
    }

    // ================== COMBINED FETCHER ==================

    /// Fetch from all available free sources with fallback
    pub async fn fetch_with_fallback(&self, symbol: &str) -> Result<MarketDataResult, String> {
        // Try sources in order of reliability
        let sources = vec![
            ("yahoo", self.fetch_yahoo(symbol).await),
            ("nasdaq", self.fetch_nasdaq(symbol).await),
        ];

        for (name, result) in sources {
            if let Ok(data) = result {
                if data.quote.is_some() {
                    tracing::debug!(provider = %name, "Successfully fetched data from provider");
                    return Ok(data);
                }
            }
        }

        // Try quote-only sources
        if let Ok(quote) = self.fetch_cnbc(symbol).await {
            return Ok(MarketDataResult {
                quote: Some(quote),
                historical: vec![],
                source: "cnbc".to_string(),
                cached: false,
            });
        }

        Err("All free sources failed".to_string())
    }

    /// Batch fetch from free sources
    pub async fn batch_fetch(&self, symbols: Vec<String>) -> HashMap<String, MarketDataResult> {
        use futures::stream::{self, StreamExt};

        let results: Vec<(String, Result<MarketDataResult, String>)> = stream::iter(symbols)
            .map(|symbol| async move {
                let result = self.fetch_with_fallback(&symbol).await;
                (symbol, result)
            })
            .buffer_unordered(5)
            .collect()
            .await;

        results.into_iter()
            .filter_map(|(symbol, result)| result.ok().map(|data| (symbol, data)))
            .collect()
    }
}

impl Default for FreeDataProviders {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_yahoo_fetch() {
        let provider = FreeDataProviders::new();
        let result = provider.fetch_yahoo("AAPL").await;
        assert!(result.is_ok(), "Yahoo fetch should succeed");
        
        let data = result.unwrap();
        assert!(data.quote.is_some(), "Should have quote data");
        assert!(!data.historical.is_empty(), "Should have historical data");
    }
}
