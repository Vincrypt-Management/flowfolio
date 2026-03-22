import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient, invokeCommand, getApiMetrics, resetMetrics } from '../../services/apiClient';

describe('ApiClient', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('invokeCommand resolves without throwing in test env (invoke is mocked)', async () => {
    // In test env, ../services/tauri invoke is mocked as vi.fn() returning undefined
    const result = await invokeCommand('health_check');
    // The mock returns undefined; we just verify it doesn't throw
    expect(result).toBeUndefined();
  });

  it('invokeCommand resolves for any command in test env', async () => {
    const result = await invokeCommand('unknown_command');
    expect(result).toBeUndefined();
  });

  it('getApiMetrics returns metrics object', () => {
    const metrics = getApiMetrics();
    expect(metrics).toHaveProperty('totalRequests');
    expect(metrics).toHaveProperty('successfulRequests');
    expect(metrics).toHaveProperty('failedRequests');
    expect(metrics).toHaveProperty('avgLatencyMs');
    expect(metrics).toHaveProperty('cacheHits');
    expect(metrics).toHaveProperty('cacheMisses');
    expect(metrics).toHaveProperty('circuitBreakerState');
    expect(typeof metrics.totalRequests).toBe('number');
  });

  it('resetCircuitBreaker does not throw', () => {
    expect(() => apiClient.resetCircuitBreaker()).not.toThrow();
    // Calling again after reset is safe
    expect(() => apiClient.resetCircuitBreaker()).not.toThrow();
  });

  it('metrics update after invokeCommand', async () => {
    await invokeCommand('get_cache_stats');
    const metrics = getApiMetrics();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(1);
    expect(metrics.successfulRequests).toBeGreaterThanOrEqual(1);
  });

  it('recordCacheHit and recordCacheMiss update metrics', () => {
    apiClient.recordCacheHit();
    apiClient.recordCacheHit();
    apiClient.recordCacheMiss();
    const metrics = getApiMetrics();
    expect(metrics.cacheHits).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
  });

  it('resetMetrics clears all counters', () => {
    apiClient.recordCacheHit();
    resetMetrics();
    const metrics = getApiMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
  });
});
