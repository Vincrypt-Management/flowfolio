-- Migration 002: Performance indexes
-- Adds indexes to eliminate full table scans on hot query paths.

-- transactions: portfolio_name filter + executed_at ordering
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_executed
    ON transactions (portfolio_name, executed_at DESC);

-- dividends: portfolio_name filter + ex_date ordering
CREATE INDEX IF NOT EXISTS idx_dividends_portfolio_exdate
    ON dividends (portfolio_name, ex_date DESC);

-- tax_lots: portfolio_name + symbol lookups
CREATE INDEX IF NOT EXISTS idx_tax_lots_portfolio_symbol
    ON tax_lots (portfolio_name, symbol);

-- tax_lots: open lot queries (is_closed = 0)
CREATE INDEX IF NOT EXISTS idx_tax_lots_portfolio_open
    ON tax_lots (portfolio_name, is_closed);

-- rebalance_transactions: plan_name filter + executed_at ordering
CREATE INDEX IF NOT EXISTS idx_rebalance_transactions_plan_executed
    ON rebalance_transactions (plan_name, executed_at DESC);
