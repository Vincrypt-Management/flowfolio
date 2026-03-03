import { describe, it, expect } from 'vitest';
import { globalRateLimiter } from '../../services/rateLimiter';

describe('GlobalRateLimiter', () => {
  it('getQueueLength starts at 0', () => {
    expect(globalRateLimiter.getQueueLength()).toBe(0);
  });

  it('waitForSlot resolves', async () => {
    // The first call should resolve quickly since no prior request
    const result = await globalRateLimiter.waitForSlot();
    expect(result).toBeUndefined();
  });

  it('getEstimatedWaitTime returns a number', () => {
    const waitTime = globalRateLimiter.getEstimatedWaitTime(3);
    expect(typeof waitTime).toBe('number');
    expect(waitTime).toBeGreaterThan(0);
  });

  it('getEstimatedWaitTime scales with queue position', () => {
    const wait1 = globalRateLimiter.getEstimatedWaitTime(1);
    const wait5 = globalRateLimiter.getEstimatedWaitTime(5);
    expect(wait5).toBe(wait1 * 5);
  });
});
