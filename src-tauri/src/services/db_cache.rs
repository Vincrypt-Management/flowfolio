// Database Cache Service
// Provides local SQLite caching for market data to reduce API calls

use sqlx::{Pool, Sqlite, Row};
use chrono::{Utc, Duration};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedPrice {
    pub symbol: String,
    pub current_price: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedQuantMetrics {
    pub symbol: String,
    pub sharpe_ratio: f64,
    pub annualized_return: f64,
    pub volatility: f64,
    pub max_drawdown: f64,
    pub rsi: f64,
    pub signal: String,
    pub confidence: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFundamentals {
    pub symbol: String,
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub pb_ratio: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub eps: Option<f64>,
    pub roe: Option<f64>,
    pub raw_json: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedSentiment {
    pub symbol: String,
    pub overall_sentiment: String,
    pub sentiment_score: f64,
    pub news_count: i32,
    pub buzz_score: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedAnalystRating {
    pub symbol: String,
    pub consensus_rating: String,
    pub target_price_mean: Option<f64>,
    pub target_price_high: Option<f64>,
    pub target_price_low: Option<f64>,
    pub number_of_analysts: i32,
    pub updated_at: String,
}

pub struct DatabaseCacheService {
    pool: Pool<Sqlite>,
    // Cache TTL settings (in hours)
    price_ttl_hours: i64,
    quant_ttl_hours: i64,
    fundamentals_ttl_hours: i64,
    sentiment_ttl_hours: i64,
    analyst_ttl_hours: i64,
}

impl DatabaseCacheService {
    pub fn new(pool: Pool<Sqlite>) -> Self {
        Self {
            pool,
            price_ttl_hours: 1,        // Prices refresh every hour
            quant_ttl_hours: 6,        // Quant metrics refresh every 6 hours
            fundamentals_ttl_hours: 24, // Fundamentals refresh daily
            sentiment_ttl_hours: 4,    // Sentiment refresh every 4 hours
            analyst_ttl_hours: 24,     // Analyst ratings refresh daily
        }
    }

    fn is_cache_valid(updated_at: &str, ttl_hours: i64) -> bool {
        if let Ok(cached_time) = chrono::DateTime::parse_from_rfc3339(updated_at) {
            let now = Utc::now();
            let cache_age = now.signed_duration_since(cached_time);
            return cache_age < Duration::hours(ttl_hours);
        }
        // Try parsing without timezone
        if let Ok(cached_time) = chrono::NaiveDateTime::parse_from_str(updated_at, "%Y-%m-%d %H:%M:%S") {
            let now = Utc::now().naive_utc();
            let cache_age = now.signed_duration_since(cached_time);
            return cache_age < Duration::hours(ttl_hours);
        }
        false
    }

    // ========== PRICE CACHE ==========
    
    pub async fn get_cached_price(&self, symbol: &str) -> Option<CachedPrice> {
        let result = sqlx::query(
            "SELECT symbol, current_price, updated_at FROM price_cache WHERE symbol = ?"
        )
        .bind(symbol)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(row)) => {
                let updated_at: String = row.get("updated_at");
                if Self::is_cache_valid(&updated_at, self.price_ttl_hours) {
                    Some(CachedPrice {
                        symbol: row.get("symbol"),
                        current_price: row.get("current_price"),
                        updated_at,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub async fn set_cached_price(&self, symbol: &str, price: f64) -> Result<(), String> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        sqlx::query(
            "INSERT INTO price_cache (symbol, current_price, updated_at) 
             VALUES (?, ?, ?)
             ON CONFLICT(symbol) DO UPDATE SET 
             current_price = excluded.current_price,
             updated_at = excluded.updated_at"
        )
        .bind(symbol)
        .bind(price)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to cache price: {}", e))?;

        Ok(())
    }

    // ========== QUANT METRICS CACHE ==========
    
    pub async fn get_cached_quant_metrics(&self, symbol: &str) -> Option<CachedQuantMetrics> {
        let result = sqlx::query(
            "SELECT * FROM quant_metrics_cache WHERE symbol = ?"
        )
        .bind(symbol)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(row)) => {
                let updated_at: String = row.get("updated_at");
                if Self::is_cache_valid(&updated_at, self.quant_ttl_hours) {
                    Some(CachedQuantMetrics {
                        symbol: row.get("symbol"),
                        sharpe_ratio: row.get("sharpe_ratio"),
                        annualized_return: row.get("annualized_return"),
                        volatility: row.get("volatility"),
                        max_drawdown: row.get("max_drawdown"),
                        rsi: row.get("rsi"),
                        signal: row.get("signal"),
                        confidence: row.get("confidence"),
                        updated_at,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub async fn set_cached_quant_metrics(
        &self,
        symbol: &str,
        sharpe_ratio: f64,
        annualized_return: f64,
        volatility: f64,
        max_drawdown: f64,
        rsi: f64,
        signal: &str,
        confidence: f64,
    ) -> Result<(), String> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        sqlx::query(
            "INSERT INTO quant_metrics_cache 
             (symbol, sharpe_ratio, annualized_return, volatility, max_drawdown, rsi, signal, confidence, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(symbol) DO UPDATE SET 
             sharpe_ratio = excluded.sharpe_ratio,
             annualized_return = excluded.annualized_return,
             volatility = excluded.volatility,
             max_drawdown = excluded.max_drawdown,
             rsi = excluded.rsi,
             signal = excluded.signal,
             confidence = excluded.confidence,
             updated_at = excluded.updated_at"
        )
        .bind(symbol)
        .bind(sharpe_ratio)
        .bind(annualized_return)
        .bind(volatility)
        .bind(max_drawdown)
        .bind(rsi)
        .bind(signal)
        .bind(confidence)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to cache quant metrics: {}", e))?;

        Ok(())
    }

    // ========== FUNDAMENTALS CACHE ==========
    
    pub async fn get_cached_fundamentals(&self, symbol: &str) -> Option<CachedFundamentals> {
        // First get or create symbol_id
        let symbol_row = sqlx::query("SELECT id FROM symbols WHERE ticker = ?")
            .bind(symbol)
            .fetch_optional(&self.pool)
            .await
            .ok()??;
        
        let symbol_id: i64 = symbol_row.get("id");

        let result = sqlx::query(
            "SELECT * FROM fundamentals_overview WHERE symbol_id = ?"
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(row)) => {
                let updated_at: String = row.get("updated_at");
                if Self::is_cache_valid(&updated_at, self.fundamentals_ttl_hours) {
                    Some(CachedFundamentals {
                        symbol: symbol.to_string(),
                        market_cap: row.get("market_cap"),
                        pe_ratio: row.get("pe_ratio"),
                        pb_ratio: row.get("pb_ratio"),
                        dividend_yield: row.get("dividend_yield"),
                        eps: row.get("eps"),
                        roe: row.get("roe"),
                        raw_json: row.get("raw_json"),
                        updated_at,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    // ========== SENTIMENT CACHE ==========
    
    pub async fn get_cached_sentiment(&self, symbol: &str) -> Option<CachedSentiment> {
        let result = sqlx::query(
            "SELECT * FROM sentiment_cache WHERE symbol = ?"
        )
        .bind(symbol)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(row)) => {
                let updated_at: String = row.get("updated_at");
                if Self::is_cache_valid(&updated_at, self.sentiment_ttl_hours) {
                    Some(CachedSentiment {
                        symbol: row.get("symbol"),
                        overall_sentiment: row.get("overall_sentiment"),
                        sentiment_score: row.get("sentiment_score"),
                        news_count: row.get("news_count"),
                        buzz_score: row.get("buzz_score"),
                        updated_at,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub async fn set_cached_sentiment(
        &self,
        symbol: &str,
        overall_sentiment: &str,
        sentiment_score: f64,
        news_count: i32,
        buzz_score: f64,
    ) -> Result<(), String> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        sqlx::query(
            "INSERT INTO sentiment_cache 
             (symbol, overall_sentiment, sentiment_score, news_count, buzz_score, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(symbol) DO UPDATE SET 
             overall_sentiment = excluded.overall_sentiment,
             sentiment_score = excluded.sentiment_score,
             news_count = excluded.news_count,
             buzz_score = excluded.buzz_score,
             updated_at = excluded.updated_at"
        )
        .bind(symbol)
        .bind(overall_sentiment)
        .bind(sentiment_score)
        .bind(news_count)
        .bind(buzz_score)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to cache sentiment: {}", e))?;

        Ok(())
    }

    // ========== ANALYST CACHE ==========
    
    pub async fn get_cached_analyst_rating(&self, symbol: &str) -> Option<CachedAnalystRating> {
        let result = sqlx::query(
            "SELECT * FROM analyst_cache WHERE symbol = ?"
        )
        .bind(symbol)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(row)) => {
                let updated_at: String = row.get("updated_at");
                if Self::is_cache_valid(&updated_at, self.analyst_ttl_hours) {
                    Some(CachedAnalystRating {
                        symbol: row.get("symbol"),
                        consensus_rating: row.get("consensus_rating"),
                        target_price_mean: row.get("target_price_mean"),
                        target_price_high: row.get("target_price_high"),
                        target_price_low: row.get("target_price_low"),
                        number_of_analysts: row.get("number_of_analysts"),
                        updated_at,
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub async fn set_cached_analyst_rating(
        &self,
        symbol: &str,
        consensus_rating: &str,
        target_price_mean: Option<f64>,
        target_price_high: Option<f64>,
        target_price_low: Option<f64>,
        number_of_analysts: i32,
    ) -> Result<(), String> {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        sqlx::query(
            "INSERT INTO analyst_cache 
             (symbol, consensus_rating, target_price_mean, target_price_high, target_price_low, number_of_analysts, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(symbol) DO UPDATE SET 
             consensus_rating = excluded.consensus_rating,
             target_price_mean = excluded.target_price_mean,
             target_price_high = excluded.target_price_high,
             target_price_low = excluded.target_price_low,
             number_of_analysts = excluded.number_of_analysts,
             updated_at = excluded.updated_at"
        )
        .bind(symbol)
        .bind(consensus_rating)
        .bind(target_price_mean)
        .bind(target_price_high)
        .bind(target_price_low)
        .bind(number_of_analysts)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to cache analyst rating: {}", e))?;

        Ok(())
    }

    // ========== HISTORICAL PRICES CACHE ==========
    
    pub async fn get_cached_historical_prices(&self, symbol: &str) -> Option<Vec<(String, f64, f64, f64, f64, i64)>> {
        // Get symbol_id
        let symbol_row = sqlx::query("SELECT id FROM symbols WHERE ticker = ?")
            .bind(symbol)
            .fetch_optional(&self.pool)
            .await
            .ok()??;
        
        let symbol_id: i64 = symbol_row.get("id");

        // Check if we have recent data (within 1 day)
        let latest = sqlx::query(
            "SELECT date FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT 1"
        )
        .bind(symbol_id)
        .fetch_optional(&self.pool)
        .await
        .ok()??;

        let latest_date: String = latest.get("date");
        
        // Parse and check if data is fresh (within 1 day for historical data)
        if let Ok(cached_date) = chrono::NaiveDate::parse_from_str(&latest_date, "%Y-%m-%d") {
            let today = Utc::now().date_naive();
            let days_old = today.signed_duration_since(cached_date).num_days();
            
            // If data is more than 2 days old on a weekday, it's stale
            if days_old > 2 {
                return None;
            }
        }

        // Fetch historical prices
        let rows = sqlx::query(
            "SELECT date, open, high, low, close, volume 
             FROM prices_daily 
             WHERE symbol_id = ? 
             ORDER BY date DESC 
             LIMIT 365"
        )
        .bind(symbol_id)
        .fetch_all(&self.pool)
        .await
        .ok()?;

        if rows.is_empty() {
            return None;
        }

        let prices: Vec<(String, f64, f64, f64, f64, i64)> = rows
            .iter()
            .map(|row| {
                (
                    row.get::<String, _>("date"),
                    row.get::<f64, _>("open"),
                    row.get::<f64, _>("high"),
                    row.get::<f64, _>("low"),
                    row.get::<f64, _>("close"),
                    row.get::<i64, _>("volume"),
                )
            })
            .collect();

        Some(prices)
    }

    pub async fn set_cached_historical_prices(
        &self,
        symbol: &str,
        prices: &[(String, f64, f64, f64, f64, i64)],
    ) -> Result<(), String> {
        // Ensure symbol exists
        sqlx::query(
            "INSERT INTO symbols (ticker, status) VALUES (?, 'active') ON CONFLICT(ticker) DO NOTHING"
        )
        .bind(symbol)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to insert symbol: {}", e))?;

        // Get symbol_id
        let symbol_row = sqlx::query("SELECT id FROM symbols WHERE ticker = ?")
            .bind(symbol)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to get symbol id: {}", e))?;
        
        let symbol_id: i64 = symbol_row.get("id");

        // Insert prices in batches
        for (date, open, high, low, close, volume) in prices {
            let _ = sqlx::query(
                "INSERT INTO prices_daily (symbol_id, date, open, high, low, close, volume) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(symbol_id, date) DO UPDATE SET 
                 open = excluded.open,
                 high = excluded.high,
                 low = excluded.low,
                 close = excluded.close,
                 volume = excluded.volume"
            )
            .bind(symbol_id)
            .bind(date)
            .bind(open)
            .bind(high)
            .bind(low)
            .bind(close)
            .bind(volume)
            .execute(&self.pool)
            .await;
        }

        Ok(())
    }

    // ========== UTILITY METHODS ==========
    
    pub async fn clear_expired_cache(&self) -> Result<(), String> {
        let now = Utc::now();
        
        // Clear expired price cache
        let price_cutoff = (now - Duration::hours(self.price_ttl_hours))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        sqlx::query("DELETE FROM price_cache WHERE updated_at < ?")
            .bind(&price_cutoff)
            .execute(&self.pool)
            .await
            .ok();

        // Clear expired quant metrics cache
        let quant_cutoff = (now - Duration::hours(self.quant_ttl_hours))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        sqlx::query("DELETE FROM quant_metrics_cache WHERE updated_at < ?")
            .bind(&quant_cutoff)
            .execute(&self.pool)
            .await
            .ok();

        // Clear expired sentiment cache
        let sentiment_cutoff = (now - Duration::hours(self.sentiment_ttl_hours))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        sqlx::query("DELETE FROM sentiment_cache WHERE updated_at < ?")
            .bind(&sentiment_cutoff)
            .execute(&self.pool)
            .await
            .ok();

        // Clear expired analyst cache
        let analyst_cutoff = (now - Duration::hours(self.analyst_ttl_hours))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        sqlx::query("DELETE FROM analyst_cache WHERE updated_at < ?")
            .bind(&analyst_cutoff)
            .execute(&self.pool)
            .await
            .ok();

        Ok(())
    }

    pub async fn get_cache_stats(&self) -> (i64, i64, i64, i64, i64) {
        let prices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM price_cache")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        
        let quant: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quant_metrics_cache")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        
        let sentiment: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sentiment_cache")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        
        let analyst: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM analyst_cache")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        
        let historical: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT symbol_id) FROM prices_daily")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        (prices, quant, sentiment, analyst, historical)
    }
}
