-- FlowFolio Supabase Schema
-- Run this against your Supabase PostgreSQL database

-- Enums
CREATE TYPE subscription_tier AS ENUM('free', 'starter', 'pro', 'enterprise');
CREATE TYPE credit_tx_type AS ENUM('purchase', 'usage', 'bonus', 'refund', 'expiry');
CREATE TYPE portfolio_status AS ENUM('active', 'archived', 'deleted');

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    name TEXT,
    avatar_url TEXT,
    google_id TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier subscription_tier NOT NULL DEFAULT 'free',
    credits INTEGER NOT NULL DEFAULT 100,
    monthly_credits INTEGER NOT NULL DEFAULT 100,
    max_portfolios INTEGER NOT NULL DEFAULT 3,
    max_watchlist_items INTEGER NOT NULL DEFAULT 20,
    backtest_limit INTEGER NOT NULL DEFAULT 5,
    ai_queries_limit INTEGER NOT NULL DEFAULT 10,
    expires_at TIMESTAMP,
    renews_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Credit Transactions (audit log)
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type credit_tx_type NOT NULL,
    amount INTEGER NOT NULL,
    balance INTEGER NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- API Keys (user-provided provider keys)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Portfolios
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status portfolio_status NOT NULL DEFAULT 'active',
    initial_capital NUMERIC(14, 2) NOT NULL DEFAULT 10000,
    currency TEXT NOT NULL DEFAULT 'USD',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Holdings
CREATE TABLE holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    shares NUMERIC(14, 6) NOT NULL,
    avg_cost NUMERIC(14, 4) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Watchlist
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    notes TEXT,
    target_price NUMERIC(14, 4),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Vibe Plans
CREATE TABLE vibe_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    plan_data JSONB NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Backtest Results
CREATE TABLE backtest_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vibe_plan_id UUID REFERENCES vibe_plans(id) ON DELETE SET NULL,
    config JSONB NOT NULL,
    results JSONB NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Journal Entries
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT,
    mood TEXT,
    tags JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Row Level Security (users can only access their own data)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibe_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Users: can read/update own row
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Subscriptions: read own
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_insert_own" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscriptions_update_own" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Credit transactions: read own, insert own
CREATE POLICY "credit_tx_select_own" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "credit_tx_insert_own" ON credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- API Keys: full CRUD own
CREATE POLICY "api_keys_all_own" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- Portfolios: full CRUD own
CREATE POLICY "portfolios_all_own" ON portfolios FOR ALL USING (auth.uid() = user_id);

-- Holdings: access via portfolio ownership
CREATE POLICY "holdings_select" ON holdings FOR SELECT USING (
  EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings.portfolio_id AND portfolios.user_id = auth.uid())
);
CREATE POLICY "holdings_insert" ON holdings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings.portfolio_id AND portfolios.user_id = auth.uid())
);
CREATE POLICY "holdings_update" ON holdings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings.portfolio_id AND portfolios.user_id = auth.uid())
);
CREATE POLICY "holdings_delete" ON holdings FOR DELETE USING (
  EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = holdings.portfolio_id AND portfolios.user_id = auth.uid())
);

-- Watchlist: full CRUD own
CREATE POLICY "watchlist_all_own" ON watchlist_items FOR ALL USING (auth.uid() = user_id);

-- Vibe Plans: read own + public, write own
CREATE POLICY "vibe_plans_select" ON vibe_plans FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "vibe_plans_insert_own" ON vibe_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vibe_plans_update_own" ON vibe_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vibe_plans_delete_own" ON vibe_plans FOR DELETE USING (auth.uid() = user_id);

-- Backtest Results: full CRUD own
CREATE POLICY "backtest_all_own" ON backtest_results FOR ALL USING (auth.uid() = user_id);

-- Journal Entries: full CRUD own
CREATE POLICY "journal_all_own" ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Sessions: managed by server only (service_role), not accessible via anon
CREATE POLICY "sessions_deny_all" ON sessions FOR ALL USING (false);

-- Indexes for performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX idx_watchlist_items_user_id ON watchlist_items(user_id);
CREATE INDEX idx_vibe_plans_user_id ON vibe_plans(user_id);
CREATE INDEX idx_backtest_results_user_id ON backtest_results(user_id);
CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
