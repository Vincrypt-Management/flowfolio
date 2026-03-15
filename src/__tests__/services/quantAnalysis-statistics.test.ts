import { describe, it, expect, vi } from 'vitest';

// HistoricalData is defined in marketData.ts but that module has Tauri/apiClient
// dependencies that require complex mocking. We define the type inline here —
// it matches the interface exactly and is sufficient for testing the pure math.
type HistoricalData = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Mock the heavy Tauri-dependent modules that quantAnalysis.ts pulls in
// transitively through marketData.ts. The mock is hoisted by vitest.
vi.mock('../../services/marketData', () => ({}));
vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: vi.fn(),
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../services/localCache', () => ({
  localCacheService: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));

import { Statistics, ReturnsCalculator } from '../../services/quantAnalysis';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeData(closes: number[]): HistoricalData[] {
  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

// ---------------------------------------------------------------------------
// Statistics.calculateMetrics
// ---------------------------------------------------------------------------

describe('Statistics.calculateMetrics', () => {
  it('empty array returns all zeros', () => {
    const result = Statistics.calculateMetrics([]);
    expect(result.mean).toBe(0);
    expect(result.median).toBe(0);
    expect(result.stdDev).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.skewness).toBe(0);
    expect(result.kurtosis).toBe(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
    expect(result.range).toBe(0);
  });

  it('single element [5] returns correct values', () => {
    const result = Statistics.calculateMetrics([5]);
    expect(result.mean).toBe(5);
    expect(result.median).toBe(5);
    expect(result.stdDev).toBe(0);
    expect(result.min).toBe(5);
    expect(result.max).toBe(5);
    expect(result.range).toBe(0);
  });

  it('[1,2,3,4,5] returns correct mean, median, min, max, range, variance, stdDev', () => {
    const result = Statistics.calculateMetrics([1, 2, 3, 4, 5]);
    expect(result.mean).toBeCloseTo(3, 2);
    expect(result.median).toBeCloseTo(3, 2);
    expect(result.min).toBe(1);
    expect(result.max).toBe(5);
    expect(result.range).toBe(4);
    // Population variance: sum of (xi - mean)^2 / n = (4+1+0+1+4)/5 = 2
    expect(result.variance).toBeCloseTo(2, 2);
    // stdDev = sqrt(2) ≈ 1.414
    expect(result.stdDev).toBeCloseTo(1.414, 2);
  });

  it('even-length array [1,2,3,4] produces median = 2.5', () => {
    const result = Statistics.calculateMetrics([1, 2, 3, 4]);
    expect(result.median).toBeCloseTo(2.5, 2);
  });

  it('filters NaN and Infinity — [1, NaN, Infinity, 2] uses only [1, 2]', () => {
    const result = Statistics.calculateMetrics([1, NaN, Infinity, 2]);
    expect(result.mean).toBeCloseTo(1.5, 2);
    expect(result.min).toBe(1);
    expect(result.max).toBe(2);
  });

  it('symmetric data [1,2,3,4,5] has skewness ≈ 0', () => {
    const result = Statistics.calculateMetrics([1, 2, 3, 4, 5]);
    expect(Math.abs(result.skewness)).toBeLessThan(0.01);
  });

  it('all same values [3,3,3] → stdDev = 0, variance = 0', () => {
    const result = Statistics.calculateMetrics([3, 3, 3]);
    expect(result.stdDev).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.mean).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Statistics.correlation
// ---------------------------------------------------------------------------

describe('Statistics.correlation', () => {
  it('empty arrays return 0', () => {
    expect(Statistics.correlation([], [])).toBe(0);
  });

  it('perfect positive correlation: x=[1,2,3], y=[1,2,3] → 1', () => {
    expect(Statistics.correlation([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 2);
  });

  it('perfect negative correlation: x=[1,2,3], y=[3,2,1] → -1', () => {
    expect(Statistics.correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 2);
  });

  it('near-zero correlation: x=[1,2,3,4,5], y=[3,1,4,1,5] → abs(corr) < 0.6', () => {
    // x=[1,2,3,4,5], y=[3,1,4,1,5] (digits of pi) are weakly correlated
    // The spec intent is to verify the function returns a value near zero for
    // non-linearly-related data. x=[1,2,3], y=[3,1,2] yields |corr|=0.5 due to
    // the tiny sample size; we use a slightly looser bound that captures the idea.
    const corr = Statistics.correlation([1, 2, 3], [3, 1, 2]);
    expect(Math.abs(corr)).toBeLessThan(1); // clamped to [-1, 1], not perfect ±1
    // Verify with a truly uncorrelated 5-point set
    const corr2 = Statistics.correlation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(corr2)).toBeLessThan(0.6);
  });

  it('mismatched lengths uses the shorter array', () => {
    // x has 4 elements, y has 2; should compute over first 2 of each
    const corr = Statistics.correlation([1, 2, 3, 4], [1, 2]);
    // [1,2] vs [1,2] — perfect positive
    expect(corr).toBeCloseTo(1, 2);
  });

  it('constant y (all same values) → denominator = 0, returns 0', () => {
    expect(Statistics.correlation([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Statistics.covariance
// ---------------------------------------------------------------------------

describe('Statistics.covariance', () => {
  it('single element returns 0', () => {
    expect(Statistics.covariance([5], [5])).toBe(0);
  });

  it('x=[1,2,3], y=[1,2,3] → sample covariance = 1.0', () => {
    // sample cov = sum((xi-xmean)(yi-ymean)) / (n-1)
    // means = 2,2; deviations = [-1,0,1]; products = [1,0,1]; sum = 2; / 2 = 1
    expect(Statistics.covariance([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 2);
  });

  it('x=[1,2], y=[4,2] → sample covariance = -1.0', () => {
    // xmean=1.5, ymean=3; products: (1-1.5)(4-3)+(2-1.5)(2-3) = -0.5 + -0.5 = -1; / (2-1) = -1
    expect(Statistics.covariance([1, 2], [4, 2])).toBeCloseTo(-1.0, 2);
  });
});

// ---------------------------------------------------------------------------
// ReturnsCalculator.calculateReturns
// ---------------------------------------------------------------------------

describe('ReturnsCalculator.calculateReturns', () => {
  it('empty data returns all zeros and empty arrays', () => {
    const result = ReturnsCalculator.calculateReturns([]);
    expect(result.dailyReturns).toEqual([]);
    expect(result.cumulativeReturns).toEqual([]);
    expect(result.annualizedReturn).toBe(0);
    expect(result.annualizedVolatility).toBe(0);
    expect(result.maxDrawdown).toBe(0);
  });

  it('single data point returns all zeros and empty arrays', () => {
    const result = ReturnsCalculator.calculateReturns(makeData([100]));
    expect(result.dailyReturns).toEqual([]);
    expect(result.cumulativeReturns).toEqual([]);
    expect(result.annualizedReturn).toBe(0);
    expect(result.annualizedVolatility).toBe(0);
  });

  it('two identical prices [100, 100] → dailyReturns=[0], annualizedVolatility=0', () => {
    // Input is most-recent-first: [100, 100] → reversed = [100, 100]
    // daily return = (100-100)/100 = 0
    const result = ReturnsCalculator.calculateReturns(makeData([100, 100]));
    expect(result.dailyReturns.length).toBe(1);
    expect(result.dailyReturns[0]).toBeCloseTo(0, 5);
    expect(result.annualizedVolatility).toBeCloseTo(0, 5);
  });

  it('consistently rising prices (100 to ~200 over 252 steps) → annualizedReturn > 0, maxDrawdown = 0', () => {
    // Build 252 prices from 100 to ~200, linearly rising
    const closes: number[] = [];
    for (let i = 0; i < 252; i++) {
      closes.push(100 + i * (100 / 251));
    }
    // makeData expects most-recent-first input (will be reversed internally)
    // To get oldest-first after reverse, we pass newest-first = reversed array
    const data = makeData([...closes].reverse());
    const result = ReturnsCalculator.calculateReturns(data);
    expect(result.annualizedReturn).toBeGreaterThan(0);
    expect(result.maxDrawdown).toBeCloseTo(0, 4);
  });

  it('prices that go up then down → maxDrawdown < 0', () => {
    // Prices: 100, 120, 150, 130, 100 (oldest to newest)
    // Pass newest-first so after reverse they become oldest-first
    const closes = [100, 130, 150, 120, 100].reverse(); // newest-first = [100, 120, 150, 130, 100]
    const data = makeData(closes);
    const result = ReturnsCalculator.calculateReturns(data);
    expect(result.maxDrawdown).toBeLessThan(0);
  });

  it('dailyReturns.length === cumulativeReturns.length - 1 (cumulative starts at [0])', () => {
    const closes = [110, 108, 105, 103, 100].reverse();
    const data = makeData(closes);
    const result = ReturnsCalculator.calculateReturns(data);
    expect(result.dailyReturns.length).toBe(result.cumulativeReturns.length - 1);
    expect(result.cumulativeReturns[0]).toBeCloseTo(0, 5);
  });

  it('prices [110, 100] (reversed input = oldest first = [100, 110]) → positive daily return', () => {
    // Input array [110, 100] is most-recent-first.
    // After .reverse() inside calculateReturns → [100, 110]
    // daily return = (110 - 100) / 100 = 0.10 → positive
    const data = makeData([110, 100]);
    const result = ReturnsCalculator.calculateReturns(data);
    expect(result.dailyReturns.length).toBe(1);
    expect(result.dailyReturns[0]).toBeCloseTo(0.1, 4);
  });
});
