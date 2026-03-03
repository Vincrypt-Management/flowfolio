import {
  CACHE_CONFIG,
  API_CONFIG,
  DEFAULT_SYMBOLS,
  STORAGE_KEYS,
  RATE_LIMITS,
} from '../../shared/constants/index';

describe('CACHE_CONFIG', () => {
  it('has valid TTL values (positive numbers)', () => {
    for (const [key, value] of Object.entries(CACHE_CONFIG.TTL)) {
      expect(value).toBeGreaterThan(0);
      expect(typeof value).toBe('number');
    }
  });

  it('has valid cache limits (positive numbers)', () => {
    for (const [key, value] of Object.entries(CACHE_CONFIG.LIMITS)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe('API_CONFIG', () => {
  it('CIRCUIT_BREAKER has valid thresholds', () => {
    expect(API_CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD).toBeGreaterThan(0);
    expect(API_CONFIG.CIRCUIT_BREAKER.RECOVERY_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('RETRY has valid settings', () => {
    expect(API_CONFIG.RETRY.MAX_RETRIES).toBeGreaterThan(0);
    expect(API_CONFIG.RETRY.INITIAL_DELAY_MS).toBeGreaterThan(0);
    expect(API_CONFIG.RETRY.MAX_DELAY_MS).toBeGreaterThan(0);
    expect(API_CONFIG.RETRY.BACKOFF_MULTIPLIER).toBeGreaterThan(0);
  });

  it('MAX_DELAY >= INITIAL_DELAY', () => {
    expect(API_CONFIG.RETRY.MAX_DELAY_MS).toBeGreaterThanOrEqual(
      API_CONFIG.RETRY.INITIAL_DELAY_MS
    );
  });
});

describe('DEFAULT_SYMBOLS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_SYMBOLS)).toBe(true);
    expect(DEFAULT_SYMBOLS.length).toBeGreaterThan(0);
  });

  it('contains valid ticker symbols (uppercase letters)', () => {
    for (const symbol of DEFAULT_SYMBOLS) {
      expect(symbol).toMatch(/^[A-Z]+$/);
    }
  });
});

describe('STORAGE_KEYS', () => {
  it('all values are non-empty strings', () => {
    for (const [key, value] of Object.entries(STORAGE_KEYS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('RATE_LIMITS', () => {
  it('all rate limits are positive numbers', () => {
    for (const [key, value] of Object.entries(RATE_LIMITS)) {
      expect(value).toBeGreaterThan(0);
      expect(typeof value).toBe('number');
    }
  });
});
