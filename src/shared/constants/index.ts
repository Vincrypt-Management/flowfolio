// Application Constants
// Centralized configuration values

// ============ Cache Configuration ============

export const CACHE_CONFIG = {
  // TTL values in milliseconds
  TTL: {
    PRICE: 2 * 60 * 60 * 1000,          // 2 hours
    FUNDAMENTALS: 48 * 60 * 60 * 1000,  // 48 hours
    SENTIMENT: 6 * 60 * 60 * 1000,      // 6 hours
    ANALYST: 48 * 60 * 60 * 1000,       // 48 hours
    HISTORICAL: 48 * 60 * 60 * 1000,    // 48 hours
    QUANT: 4 * 60 * 60 * 1000,          // 4 hours
  },
  
  // Maximum entries per cache store
  LIMITS: {
    PRICES: 500,
    FUNDAMENTALS: 200,
    SENTIMENT: 200,
    ANALYST: 200,
    HISTORICAL: 100,
    QUANT: 300,
  },
  
  // LRU eviction percentage when limit is reached
  EVICTION_PERCENT: 0.1,
} as const;

// ============ API Configuration ============

export const API_CONFIG = {
  // Circuit breaker settings
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,
    RECOVERY_TIMEOUT_MS: 30000,
  },
  
  // Retry settings
  RETRY: {
    MAX_RETRIES: 3,
    INITIAL_DELAY_MS: 100,
    MAX_DELAY_MS: 5000,
    BACKOFF_MULTIPLIER: 2,
  },
  
  // Request deduplication window
  DEDUP_WINDOW_MS: 100,
  
  // Default timeout for API calls
  DEFAULT_TIMEOUT_MS: 30000,
} as const;

// ============ Data Provider Priorities ============

export const PROVIDER_PRIORITY = {
  // Tier 1: Unlimited/No key required (Priority 10-9)
  ALPACA: 10,
  YAHOO: 9,
  
  // Tier 2: Generous free limits (Priority 8-5)
  TIINGO: 8,       // 500/hour
  FINNHUB: 7,      // 60/min
  TWELVE_DATA: 6,  // 800/day
  FMP: 5,          // 250/day
  
  // Tier 3: Use sparingly - has paid tiers (Priority 2-1)
  ALPHAVANTAGE: 2, // 5/min free
  POLYGON: 1,      // 5/min free
} as const;

// ============ Rate Limits (requests per minute) ============

export const RATE_LIMITS = {
  FINNHUB: 50,        // 60/min limit, 17% buffer
  TIINGO: 7,          // 500/hour ≈ 8/min, 12% buffer
  POLYGON: 4,         // 5/min limit, 20% buffer
  ALPHAVANTAGE: 4,    // 5/min limit, 20% buffer
  GLOBAL: 5,          // 12s between requests = max 5/min
} as const;

// ============ UI Configuration ============

export const UI_CONFIG = {
  // Debounce delays
  DEBOUNCE: {
    SEARCH: 300,
    RESIZE: 150,
    SCROLL: 50,
  },
  
  // Animation durations
  ANIMATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
  },
  
  // Pagination
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },
} as const;

// ============ Feature Flags ============

export const FEATURES = {
  ENABLE_CIRCUIT_BREAKER: true,
  ENABLE_REQUEST_DEDUP: true,
  ENABLE_LOCAL_CACHE: true,
  ENABLE_METRICS: true,
  ENABLE_DEBUG_LOGGING: import.meta.env.DEV,
} as const;

// ============ Storage Keys ============

export const STORAGE_KEYS = {
  CACHE_PREFIX: 'flowfolio_cache_v2',
  SETTINGS: 'flowfolio_settings',
  THEME: 'flowfolio_theme',
  RECENT_SYMBOLS: 'flowfolio_recent_symbols',
} as const;

// ============ Event Names ============

export const EVENTS = {
  CACHE_HIT: 'cache:hit',
  CACHE_MISS: 'cache:miss',
  API_REQUEST: 'api:request',
  API_SUCCESS: 'api:success',
  API_ERROR: 'api:error',
  CIRCUIT_OPEN: 'circuit:open',
  CIRCUIT_CLOSE: 'circuit:close',
} as const;
