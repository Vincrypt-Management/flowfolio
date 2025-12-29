-- Market data cache tables for offline-first architecture
-- This migration adds caching tables to store fetched data locally

-- Cache for sentiment/news analysis
CREATE TABLE IF NOT EXISTS sentiment_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    overall_sentiment TEXT NOT NULL,
    sentiment_score REAL NOT NULL,
    news_count INTEGER NOT NULL DEFAULT 0,
    buzz_score REAL NOT NULL DEFAULT 0,
    raw_json TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sentiment_symbol ON sentiment_cache(symbol);
CREATE INDEX idx_sentiment_updated ON sentiment_cache(updated_at);

-- Cache for analyst ratings
CREATE TABLE IF NOT EXISTS analyst_cache (
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
);

CREATE INDEX idx_analyst_symbol ON analyst_cache(symbol);
CREATE INDEX idx_analyst_updated ON analyst_cache(updated_at);

-- Cache for quant metrics
CREATE TABLE IF NOT EXISTS quant_metrics_cache (
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
);

CREATE INDEX idx_quant_symbol ON quant_metrics_cache(symbol);
CREATE INDEX idx_quant_updated ON quant_metrics_cache(updated_at);

-- Current price cache (for quick lookups)
CREATE TABLE IF NOT EXISTS price_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    current_price REAL NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_symbol ON price_cache(symbol);
CREATE INDEX idx_price_updated ON price_cache(updated_at);
