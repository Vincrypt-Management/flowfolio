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
#[allow(dead_code)]
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
#[allow(dead_code)]
pub struct CachedSentiment {
    pub symbol: String,
    pub overall_sentiment: String,
    pub sentiment_score: f64,
    pub news_count: i32,
    pub buzz_score: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
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
    #[allow(dead_code)]
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

    /// Get reference to the database pool for direct queries
    pub fn get_pool(&self) -> &Pool<Sqlite> {
        &self.pool
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_db() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory pool");

        // Create required tables
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS price_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                current_price REAL NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS quant_metrics_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                sharpe_ratio REAL NOT NULL DEFAULT 0,
                annualized_return REAL NOT NULL DEFAULT 0,
                volatility REAL NOT NULL DEFAULT 0,
                max_drawdown REAL NOT NULL DEFAULT 0,
                rsi REAL NOT NULL DEFAULT 50,
                signal TEXT NOT NULL DEFAULT 'HOLD',
                confidence REAL NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sentiment_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                overall_sentiment TEXT NOT NULL,
                sentiment_score REAL NOT NULL,
                news_count INTEGER NOT NULL DEFAULT 0,
                buzz_score REAL NOT NULL DEFAULT 0,
                raw_json TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS analyst_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                consensus_rating TEXT NOT NULL,
                target_price_mean REAL,
                target_price_high REAL,
                target_price_low REAL,
                number_of_analysts INTEGER NOT NULL DEFAULT 0,
                strong_buy INTEGER NOT NULL DEFAULT 0,
                buy INTEGER NOT NULL DEFAULT 0,
                hold INTEGER NOT NULL DEFAULT 0,
                sell INTEGER NOT NULL DEFAULT 0,
                strong_sell INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL UNIQUE,
                exchange TEXT,
                name TEXT,
                currency TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS prices_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol_id INTEGER NOT NULL,
                date DATE NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                adj_close REAL,
                volume INTEGER NOT NULL,
                UNIQUE(symbol_id, date)
            )"
        ).execute(&pool).await.unwrap();

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS fundamentals_overview (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol_id INTEGER NOT NULL,
                market_cap REAL,
                pe_ratio REAL,
                pb_ratio REAL,
                dividend_yield REAL,
                eps REAL,
                roe REAL,
                roic REAL,
                raw_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"
        ).execute(&pool).await.unwrap();

        pool
    }

    #[tokio::test]
    async fn test_new_and_get_pool() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool.clone());
        // get_pool should return the pool without panicking
        let _ = svc.get_pool();
    }

    #[tokio::test]
    async fn test_set_and_get_cached_price() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_price("AAPL", 150.0).await.unwrap();
        let result = svc.get_cached_price("AAPL").await;
        assert!(result.is_some());
        let p = result.unwrap();
        assert_eq!(p.symbol, "AAPL");
        assert!((p.current_price - 150.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_get_cached_price_miss() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let result = svc.get_cached_price("NONEXISTENT").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_set_cached_price_upsert() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_price("AAPL", 150.0).await.unwrap();
        svc.set_cached_price("AAPL", 155.0).await.unwrap();

        let result = svc.get_cached_price("AAPL").await;
        assert!(result.is_some());
        assert!((result.unwrap().current_price - 155.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_set_and_get_quant_metrics() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_quant_metrics("AAPL", 1.5, 12.0, 20.0, 15.0, 55.0, "BUY", 80.0).await.unwrap();
        let result = svc.get_cached_quant_metrics("AAPL").await;
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.symbol, "AAPL");
        assert!((m.sharpe_ratio - 1.5).abs() < 1e-6);
        assert_eq!(m.signal, "BUY");
    }

    #[tokio::test]
    async fn test_get_quant_metrics_miss() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let result = svc.get_cached_quant_metrics("MISSING").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_set_and_get_sentiment() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_sentiment("AAPL", "bullish", 0.75, 10, 0.85).await.unwrap();
        let result = svc.get_cached_sentiment("AAPL").await;
        assert!(result.is_some());
        let s = result.unwrap();
        assert_eq!(s.overall_sentiment, "bullish");
        assert!((s.sentiment_score - 0.75).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_get_sentiment_miss() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let result = svc.get_cached_sentiment("MISSING").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_set_and_get_analyst_rating() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_analyst_rating("AAPL", "BUY", Some(200.0), Some(220.0), Some(180.0), 15).await.unwrap();
        let result = svc.get_cached_analyst_rating("AAPL").await;
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.consensus_rating, "BUY");
        assert_eq!(r.number_of_analysts, 15);
    }

    #[tokio::test]
    async fn test_get_analyst_rating_miss() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let result = svc.get_cached_analyst_rating("MISSING").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_get_cache_stats_empty() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let (prices, quant, sentiment, analyst, historical) = svc.get_cache_stats().await;
        assert_eq!(prices, 0);
        assert_eq!(quant, 0);
        assert_eq!(sentiment, 0);
        assert_eq!(analyst, 0);
        assert_eq!(historical, 0);
    }

    #[tokio::test]
    async fn test_get_cache_stats_with_data() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        svc.set_cached_price("AAPL", 150.0).await.unwrap();
        svc.set_cached_price("MSFT", 300.0).await.unwrap();
        svc.set_cached_quant_metrics("AAPL", 1.5, 12.0, 20.0, 15.0, 55.0, "BUY", 80.0).await.unwrap();
        svc.set_cached_sentiment("GOOG", "neutral", 0.5, 5, 0.5).await.unwrap();
        svc.set_cached_analyst_rating("MSFT", "HOLD", None, None, None, 10).await.unwrap();

        let (prices, quant, sentiment, analyst, _historical) = svc.get_cache_stats().await;
        assert_eq!(prices, 2);
        assert_eq!(quant, 1);
        assert_eq!(sentiment, 1);
        assert_eq!(analyst, 1);
    }

    #[tokio::test]
    async fn test_clear_expired_cache() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        // Insert some data and then clear expired (fresh data won't be cleared)
        svc.set_cached_price("AAPL", 150.0).await.unwrap();
        let result = svc.clear_expired_cache().await;
        assert!(result.is_ok());

        // Data should still be there since it was just inserted
        let price = svc.get_cached_price("AAPL").await;
        assert!(price.is_some());
    }

    #[test]
    fn test_is_cache_valid_rfc3339() {
        let now = Utc::now().to_rfc3339();
        assert!(DatabaseCacheService::is_cache_valid(&now, 1));
    }

    #[test]
    fn test_is_cache_valid_naive_datetime() {
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        assert!(DatabaseCacheService::is_cache_valid(&now, 1));
    }

    #[test]
    fn test_is_cache_valid_invalid_string() {
        assert!(!DatabaseCacheService::is_cache_valid("not-a-date", 1));
    }

    #[test]
    fn test_is_cache_valid_expired() {
        // A timestamp from 10 hours ago with TTL of 1 hour should be invalid
        let old_time = (Utc::now() - Duration::hours(10)).to_rfc3339();
        assert!(!DatabaseCacheService::is_cache_valid(&old_time, 1));
    }

    #[tokio::test]
    async fn test_get_cached_fundamentals_miss_no_symbol() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        // Symbol doesn't exist → should return None
        let result = svc.get_cached_fundamentals("NONEXISTENT").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_get_cached_fundamentals_with_data() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool.clone());

        // Insert a symbol directly
        sqlx::query("INSERT INTO symbols (ticker, status) VALUES ('AAPL', 'active')")
            .execute(&pool).await.unwrap();
        let sym_id: i64 = sqlx::query_scalar("SELECT id FROM symbols WHERE ticker = 'AAPL'")
            .fetch_one(&pool).await.unwrap();

        // Insert fundamentals directly with fresh timestamp
        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        sqlx::query(
            "INSERT INTO fundamentals_overview (symbol_id, market_cap, pe_ratio, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(sym_id)
        .bind(1_000_000_000.0_f64)
        .bind(25.5_f64)
        .bind(r#"{"pe":25.5}"#)
        .bind(&now)
        .execute(&pool).await.unwrap();

        let result = svc.get_cached_fundamentals("AAPL").await;
        assert!(result.is_some());
        let f = result.unwrap();
        assert_eq!(f.symbol, "AAPL");
        assert!((f.market_cap.unwrap() - 1_000_000_000.0).abs() < 1.0);
    }

    #[tokio::test]
    async fn test_set_and_get_historical_prices() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        // Use today's date so it won't be considered stale
        let today = Utc::now().date_naive();
        let date_str = today.format("%Y-%m-%d").to_string();

        let prices = vec![
            (date_str.clone(), 148.0_f64, 152.0_f64, 147.0_f64, 150.0_f64, 1_000_000_i64),
        ];

        svc.set_cached_historical_prices("AAPL", &prices).await.unwrap();
        let result = svc.get_cached_historical_prices("AAPL").await;
        assert!(result.is_some());
        let fetched = result.unwrap();
        assert_eq!(fetched.len(), 1);
        assert!((fetched[0].4 - 150.0).abs() < 1e-6); // close price
    }

    #[tokio::test]
    async fn test_get_historical_prices_miss() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);
        let result = svc.get_cached_historical_prices("NONEXISTENT").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_set_historical_prices_upsert() {
        let pool = setup_db().await;
        let svc = DatabaseCacheService::new(pool);

        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();
        let prices1 = vec![(today.clone(), 148.0_f64, 152.0_f64, 147.0_f64, 150.0_f64, 1_000_000_i64)];
        let prices2 = vec![(today.clone(), 155.0_f64, 160.0_f64, 154.0_f64, 158.0_f64, 2_000_000_i64)];

        svc.set_cached_historical_prices("AAPL", &prices1).await.unwrap();
        svc.set_cached_historical_prices("AAPL", &prices2).await.unwrap();

        let result = svc.get_cached_historical_prices("AAPL").await;
        assert!(result.is_some());
        // Should have updated to prices2 values
        assert!((result.unwrap()[0].4 - 158.0).abs() < 1e-6);
    }
}
