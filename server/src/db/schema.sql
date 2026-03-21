-- FlowFolio auth database schema

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT        PRIMARY KEY,
  email                TEXT        NOT NULL UNIQUE,
  name                 TEXT,
  avatar_url           TEXT,
  subscription_tier    TEXT        NOT NULL DEFAULT 'free',
  google_id            TEXT,
  stripe_customer_id   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent migration for existing deployments:
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
