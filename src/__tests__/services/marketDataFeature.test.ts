import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/api', () => ({
  apiClient: { recordCacheHit: vi.fn(), recordCacheMiss: vi.fn() },
  invokeCommand: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../core/cache', () => ({
  cacheService: {
    getBatch: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
  }
}));
vi.mock('../../core/errors', () => ({ handleError: vi.fn() }));
vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import { marketDataService } from '../../features/market-data/service';

describe('MarketDataService – private helpers', () => {
  it('MEMORY_TTL is 60000 ms', () => {
    expect((marketDataService as any).MEMORY_TTL).toBe(60000);
  });

  it('setInMemory then getFromMemory returns the stored value', () => {
    const svc = marketDataService as any;
    svc.setInMemory('test:round-trip', { value: 42 });
    expect(svc.getFromMemory('test:round-trip')).toEqual({ value: 42 });
  });

  it('getFromMemory returns null for a missing key', () => {
    const svc = marketDataService as any;
    expect(svc.getFromMemory('test:nonexistent-key-xyz')).toBeNull();
  });

  it('getFromMemory returns null for an expired entry and removes it from the map', () => {
    const svc = marketDataService as any;
    svc.setInMemory('test:expired-key', 42);
    // Force expiry by backdating the timestamp
    const entry = svc.memoryCache.get('test:expired-key');
    entry.timestamp = Date.now() - 70000;
    expect(svc.getFromMemory('test:expired-key')).toBeNull();
    // The key should have been deleted from the map
    expect(svc.memoryCache.has('test:expired-key')).toBe(false);
  });

  it('setInMemory evicts the oldest entry when the cache exceeds 500 entries', () => {
    const svc = marketDataService as any;
    // Clear any existing state to start from a known baseline
    svc.memoryCache.clear();

    // The guard is `size > 500`: eviction fires on the 502nd+ insert (size was 501).
    // Each call evicts 1 then adds 1, so the map stabilises at 501.
    // Insert 510 entries to exercise the eviction path multiple times.
    for (let i = 0; i < 510; i++) {
      svc.setInMemory(`eviction-test:key-${i}`, i);
    }

    // Size must not grow unboundedly — it should be capped at 501 (500 after
    // eviction + 1 newly inserted).
    expect(svc.memoryCache.size).toBeLessThanOrEqual(501);
    // The first key (key-0) must have been evicted
    expect(svc.memoryCache.has('eviction-test:key-0')).toBe(false);
  });

  it('getDefaultQuantMetrics returns zero-value QuantMetrics for the given symbol', () => {
    const svc = marketDataService as any;
    const metrics = svc.getDefaultQuantMetrics('AAPL');
    expect(metrics).toEqual({
      symbol: 'AAPL',
      sharpe_ratio: 0,
      annualized_return: 0,
      volatility: 0,
      max_drawdown: 0,
      rsi: 50,
      signal: 'INSUFFICIENT DATA',
      confidence: 0,
    });
  });
});
