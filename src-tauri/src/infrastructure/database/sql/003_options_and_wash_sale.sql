CREATE TABLE IF NOT EXISTS option_positions (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    strategy TEXT NOT NULL CHECK(strategy IN ('covered_call', 'cash_secured_put')),
    strike REAL NOT NULL,
    expiration TEXT NOT NULL,
    contracts INTEGER NOT NULL,
    premium_per_contract REAL NOT NULL,
    open_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open', 'expired', 'assigned', 'closed_early')),
    close_date TEXT,
    close_premium REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_option_positions_portfolio
    ON option_positions(portfolio_name);
CREATE INDEX IF NOT EXISTS idx_option_positions_symbol
    ON option_positions(portfolio_name, symbol);
CREATE INDEX IF NOT EXISTS idx_option_positions_status
    ON option_positions(portfolio_name, status);

CREATE TABLE IF NOT EXISTS wash_sale_events (
    id TEXT PRIMARY KEY,
    portfolio_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    harvested_loss REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wash_sale_events_symbol_date
    ON wash_sale_events(portfolio_name, symbol, sale_date);

CREATE TABLE IF NOT EXISTS dividend_calendar_cache (
    symbol TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    pay_date TEXT,
    amount_per_share REAL NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (symbol, ex_date)
);

CREATE INDEX IF NOT EXISTS idx_dividend_calendar_cache_fetched_at
    ON dividend_calendar_cache(fetched_at);
