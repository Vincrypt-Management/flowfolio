-- Response cache for OpenRouter calls. Keyed by SHA256(model + messages + temp).
-- Reduces 429s by short-circuiting identical requests within the TTL window.
CREATE TABLE IF NOT EXISTS openrouter_cache (
    cache_key TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ttl_seconds INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openrouter_cache_created_at
    ON openrouter_cache(created_at);
