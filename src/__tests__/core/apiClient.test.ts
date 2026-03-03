import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient, invokeCommand, getApiMetrics } from '../../core/api/client';

describe('ApiClient', () => {
  beforeEach(() => {
    apiClient.resetMetrics();
  });

  it('invokeCommand returns a result (web mode mock)', async () => {
    // In test env, isTauri() returns false, so web mode mocks are used
    const result = await invokeCommand('health_check');
    expect(result).toEqual({ status: 'ok', mode: 'web' });
  });

  it('invokeCommand returns empty object for unknown commands in web mode', async () => {
    const result = await invokeCommand('unknown_command');
    expect(result).toEqual({});
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
    expect(() => apiClient.resetCircuitBreaker('custom-service')).not.toThrow();
  });

  it('metrics update after invokeCommand', async () => {
    // Use a unique command to avoid request deduplication
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
    apiClient.resetMetrics();
    const metrics = getApiMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
  });
});
