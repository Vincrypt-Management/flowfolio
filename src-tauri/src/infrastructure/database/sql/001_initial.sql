-- Migration 001: Initial schema
-- Creates all base cache and application tables.

CREATE TABLE IF NOT EXISTS price_cache (
    symbol TEXT PRIMARY KEY,
    current_price REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quant_metrics_cache (
    symbol TEXT PRIMARY KEY,
    sharpe_ratio REAL NOT NULL,
    annualized_return REAL NOT NULL,
    volatility REAL NOT NULL,
    max_drawdown REAL NOT NULL,
    rsi REAL NOT NULL,
    signal TEXT NOT NULL,
    confidence REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historical_prices_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open_price REAL NOT NULL,
    high_price REAL NOT NULL,
    low_price REAL NOT NULL,
    close_price REAL NOT NULL,
    volume INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_historical_symbol_date
    ON historical_prices_cache(symbol, date);

CREATE TABLE IF NOT EXISTS fundamentals_cache (
    symbol TEXT PRIMARY KEY,
    market_cap REAL,
    pe_ratio REAL,
    pb_ratio REAL,
    dividend_yield REAL,
    eps REAL,
    roe REAL,
    raw_json TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentiment_cache (
    symbol TEXT PRIMARY KEY,
    overall_sentiment TEXT NOT NULL,
    sentiment_score REAL NOT NULL,
    news_count INTEGER NOT NULL,
    buzz_score REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyst_ratings_cache (
    symbol TEXT PRIMARY KEY,
    consensus_rating TEXT NOT NULL,
    target_price_mean REAL,
    target_price_high REAL,
    target_price_low REAL,
    number_of_analysts INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_portfolios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_alerts (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL,
    threshold REAL NOT NULL,
    reference_price REAL,
    active INTEGER NOT NULL DEFAULT 1,
    triggered INTEGER NOT NULL DEFAULT 0,
    triggered_at TEXT,
    created_at TEXT NOT NULL,
    note TEXT
);

CREATE TABLE IF NOT EXISTS rebalance_schedules (
    id TEXT PRIMARY KEY,
    plan_name TEXT NOT NULL,
    cadence TEXT NOT NULL,
    next_run TEXT NOT NULL,
    last_run TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    day_of_week INTEGER,
    day_of_month INTEGER
);

CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS universes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    symbols TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '{}',
    exclude_list TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rebalance_transactions (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT,
    plan_name TEXT,
    method TEXT NOT NULL,
    symbols TEXT NOT NULL,
    allocations TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    shares REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    fees REAL DEFAULT 0,
    notes TEXT,
    executed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    total_value REAL NOT NULL,
    cash REAL NOT NULL,
    holdings_json TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(portfolio_name, snapshot_date)
);

CREATE TABLE IF NOT EXISTS dividends (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    amount_per_share REAL NOT NULL,
    total_amount REAL NOT NULL,
    shares_held REAL NOT NULL,
    ex_date TEXT NOT NULL,
    pay_date TEXT,
    reinvested INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tax_lots (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    shares REAL NOT NULL,
    cost_basis_per_share REAL NOT NULL,
    purchase_date TEXT NOT NULL,
    is_closed INTEGER DEFAULT 0,
    close_date TEXT,
    close_price REAL,
    created_at TEXT DEFAULT (datetime('now'))
)
