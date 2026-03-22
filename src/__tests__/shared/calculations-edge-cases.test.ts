import { describe, it, expect } from 'vitest';
import {
  mean,
  varianceWelford,
  calculateReturns,
  calculateLogReturns,
  sharpeRatio,
  sortinoRatio,
  maxDrawdown,
  valueAtRisk,
  conditionalVaR,
  sma,
  ema,
  rsi,
  bollingerBands,
  quickAnalysis,
} from '../../shared/utils/calculations';

// ============================================================================
// mean
// ============================================================================

describe('mean', () => {
  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the single value for a one-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('returns the correct mean for a normal array', () => {
    expect(mean([1, 2, 3, 4, 5])).toBeCloseTo(3, 10);
  });

  it('handles all-zero prices without NaN', () => {
    const result = mean([0, 0, 0]);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(0);
  });

  it('handles negative values correctly', () => {
    expect(mean([-10, 10])).toBeCloseTo(0, 10);
    expect(mean([-5, -15])).toBeCloseTo(-10, 10);
  });
});

// ============================================================================
// varianceWelford
// ============================================================================

describe('varianceWelford', () => {
  it('returns zeros for an empty array', () => {
    const result = varianceWelford([]);
    expect(result.mean).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it('returns zero variance for a single-element array', () => {
    const result = varianceWelford([100]);
    expect(result.mean).toBe(100);
    expect(result.variance).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it('returns zero variance when all elements are identical (zero return scenario)', () => {
    const result = varianceWelford([50, 50, 50, 50]);
    expect(result.variance).toBeCloseTo(0, 10);
    expect(result.stdDev).toBeCloseTo(0, 10);
  });

  it('produces a finite stdDev for normal data', () => {
    const result = varianceWelford([1, 2, 3, 4, 5]);
    expect(Number.isFinite(result.stdDev)).toBe(true);
    expect(result.stdDev).toBeGreaterThan(0);
  });

  it('handles negative returns without NaN', () => {
    const result = varianceWelford([-0.05, -0.03, -0.01, -0.04]);
    expect(Number.isNaN(result.variance)).toBe(false);
    expect(Number.isNaN(result.stdDev)).toBe(false);
  });
});

// ============================================================================
// calculateReturns
// ============================================================================

describe('calculateReturns', () => {
  it('returns an empty Float64Array for an empty price array', () => {
    const result = calculateReturns([]);
    expect(result.length).toBe(0);
  });

  it('returns an empty Float64Array for a single-element price array', () => {
    const result = calculateReturns([100]);
    expect(result.length).toBe(0);
  });

  it('returns 0 for the return when the prior price is zero (no division by zero crash)', () => {
    // prices[i-1] = 0 → guard produces 0 instead of NaN/Infinity
    const result = calculateReturns([0, 100]);
    expect(result.length).toBe(1);
    expect(Number.isNaN(result[0])).toBe(false);
    expect(Number.isFinite(result[0])).toBe(true);
    expect(result[0]).toBe(0);
  });

  it('calculates a correct positive return', () => {
    const result = calculateReturns([100, 110]);
    expect(result[0]).toBeCloseTo(0.1, 10);
  });

  it('calculates a correct negative return', () => {
    const result = calculateReturns([200, 150]);
    expect(result[0]).toBeCloseTo(-0.25, 10);
  });

  it('returns zero for identical consecutive prices (zero return)', () => {
    const result = calculateReturns([100, 100, 100]);
    expect(result[0]).toBeCloseTo(0, 10);
    expect(result[1]).toBeCloseTo(0, 10);
  });

  it('produces finite values for a long price series including a zero price', () => {
    const prices = [0, 50, 100, 150, 200];
    const result = calculateReturns(prices);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i])).toBe(true);
    }
  });
});

// ============================================================================
// calculateLogReturns
// ============================================================================

describe('calculateLogReturns', () => {
  it('returns an empty Float64Array for an empty array', () => {
    expect(calculateLogReturns([]).length).toBe(0);
  });

  it('returns an empty Float64Array for a single-element array', () => {
    expect(calculateLogReturns([100]).length).toBe(0);
  });

  it('returns 0 when either price is zero (guard branch)', () => {
    // Both prices must be > 0 for log to be computed; otherwise the entry stays 0
    const result = calculateLogReturns([0, 100]);
    expect(result[0]).toBe(0);
    expect(Number.isNaN(result[0])).toBe(false);
  });

  it('calculates a correct positive log return', () => {
    const result = calculateLogReturns([100, Math.E * 100]);
    expect(result[0]).toBeCloseTo(1, 5);
  });

  it('calculates a correct negative log return', () => {
    const result = calculateLogReturns([Math.E * 100, 100]);
    expect(result[0]).toBeCloseTo(-1, 5);
  });

  it('returns 0 for identical consecutive prices', () => {
    const result = calculateLogReturns([100, 100]);
    expect(result[0]).toBeCloseTo(0, 10);
  });
});

// ============================================================================
// sharpeRatio
// ============================================================================

describe('sharpeRatio', () => {
  it('returns 0 for an empty returns array', () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it('returns 0 when all returns are identical (stdDev = 0)', () => {
    // When stdDev is 0 the function short-circuits to 0 to avoid division by zero
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it('returns a finite number for a normal returns array', () => {
    const returns = [0.01, -0.005, 0.02, 0.015, -0.01, 0.008];
    const result = sharpeRatio(returns);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('returns a negative Sharpe for consistently negative returns', () => {
    const negReturns = [-0.02, -0.03, -0.015, -0.025, -0.01];
    expect(sharpeRatio(negReturns)).toBeLessThan(0);
  });
});

// ============================================================================
// sortinoRatio
// ============================================================================

describe('sortinoRatio', () => {
  it('returns 0 for an empty returns array', () => {
    expect(sortinoRatio([])).toBe(0);
  });

  it('returns Infinity when all returns are positive (no downside deviation)', () => {
    const result = sortinoRatio([0.01, 0.02, 0.015]);
    expect(result).toBe(Infinity);
  });

  it('returns a finite number when there are negative returns', () => {
    const returns = [0.01, -0.005, 0.02, -0.01];
    expect(Number.isFinite(sortinoRatio(returns))).toBe(true);
  });
});

// ============================================================================
// maxDrawdown
// ============================================================================

describe('maxDrawdown', () => {
  it('returns 0 for an empty price array', () => {
    expect(maxDrawdown([])).toBe(0);
  });

  it('returns 0 for a single-element price array', () => {
    expect(maxDrawdown([100])).toBe(0);
  });

  it('returns 0 when prices only go up (no drawdown)', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBeCloseTo(0, 10);
  });

  it('calculates a correct drawdown for a simple down sequence', () => {
    // Peak = 100, trough = 50 → drawdown = 50%
    expect(maxDrawdown([100, 80, 60, 50, 70])).toBeCloseTo(0.5, 5);
  });

  it('handles identical prices (zero return / zero drawdown)', () => {
    expect(maxDrawdown([100, 100, 100])).toBeCloseTo(0, 10);
  });

  it('handles negative prices without NaN', () => {
    // Negative prices are unusual but must not crash
    const result = maxDrawdown([-10, -5, -20]);
    expect(Number.isNaN(result)).toBe(false);
  });
});

// ============================================================================
// valueAtRisk
// ============================================================================

describe('valueAtRisk', () => {
  it('returns 0 for an empty returns array', () => {
    expect(valueAtRisk([])).toBe(0);
  });

  it('returns a finite value for a normal returns array', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.008, -0.012];
    expect(Number.isFinite(valueAtRisk(returns))).toBe(true);
  });

  it('returns a non-negative value (VaR is expressed as a positive loss)', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.008, -0.012];
    expect(valueAtRisk(returns)).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// conditionalVaR
// ============================================================================

describe('conditionalVaR', () => {
  it('returns 0 for an empty returns array', () => {
    expect(conditionalVaR([])).toBe(0);
  });

  it('returns a finite value for a normal returns array', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.008, -0.012];
    expect(Number.isFinite(conditionalVaR(returns))).toBe(true);
  });
});

// ============================================================================
// sma
// ============================================================================

describe('sma', () => {
  it('returns [] when the array is shorter than the period', () => {
    expect(sma([1, 2], 5)).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(sma([], 3)).toEqual([]);
  });

  it('returns a single value when data length equals period', () => {
    const result = sma([10, 20, 30], 3);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(20, 10);
  });

  it('computes correct rolling SMA values', () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(2, 10); // (1+2+3)/3
    expect(result[1]).toBeCloseTo(3, 10); // (2+3+4)/3
    expect(result[2]).toBeCloseTo(4, 10); // (3+4+5)/3
  });

  it('handles identical prices (all values equal to that price)', () => {
    const result = sma([5, 5, 5, 5], 2);
    for (const v of result) {
      expect(v).toBeCloseTo(5, 10);
    }
  });
});

// ============================================================================
// ema
// ============================================================================

describe('ema', () => {
  it('returns [] for an empty array', () => {
    expect(ema([], 3)).toEqual([]);
  });

  it('returns an array of the same length as the input', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
  });

  it('handles a single-element array without throwing', () => {
    const result = ema([100], 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(100);
  });

  it('handles identical prices producing a constant EMA', () => {
    const result = ema([10, 10, 10, 10, 10], 3);
    for (const v of result) {
      expect(v).toBeCloseTo(10, 10);
    }
  });
});

// ============================================================================
// rsi
// ============================================================================

describe('rsi', () => {
  it('returns 50 when prices array is shorter than period+1', () => {
    expect(rsi([100, 105], 14)).toBe(50);
    expect(rsi([], 14)).toBe(50);
  });

  it('returns 100 when all moves are gains (avgLoss near 0)', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(prices, 14)).toBe(100);
  });

  it('returns a value in the range [0, 100] for normal data', () => {
    const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45, 45.1, 45.15,
      43.61, 44.33, 44.83, 45, 45.1, 43.5, 44, 44.2];
    const result = rsi(prices, 14);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('handles identical prices without NaN', () => {
    const prices = Array.from({ length: 20 }, () => 100);
    const result = rsi(prices, 14);
    expect(Number.isNaN(result)).toBe(false);
    // All gains AND losses are 0 → avgLoss < 1e-10 → returns 100
    expect(result).toBe(100);
  });
});

// ============================================================================
// bollingerBands
// ============================================================================

describe('bollingerBands', () => {
  it('returns last price for all bands when array is shorter than period', () => {
    const result = bollingerBands([50], 20);
    expect(result.upper).toBe(50);
    expect(result.middle).toBe(50);
    expect(result.lower).toBe(50);
  });

  it('returns {0,0,0} for an empty array (last price is 0)', () => {
    const result = bollingerBands([], 20);
    expect(result.upper).toBe(0);
    expect(result.middle).toBe(0);
    expect(result.lower).toBe(0);
  });

  it('returns upper >= middle >= lower for a normal price series', () => {
    const prices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = bollingerBands(prices, 20);
    expect(result.upper).toBeGreaterThanOrEqual(result.middle);
    expect(result.middle).toBeGreaterThanOrEqual(result.lower);
  });

  it('returns all equal bands when all prices are identical (zero stdDev)', () => {
    const prices = Array.from({ length: 25 }, () => 100);
    const result = bollingerBands(prices, 20);
    expect(result.upper).toBeCloseTo(result.middle, 10);
    expect(result.lower).toBeCloseTo(result.middle, 10);
  });
});

// ============================================================================
// quickAnalysis — high-level edge cases
// ============================================================================

describe('quickAnalysis', () => {
  it('returns a safe default result for fewer than 14 prices', () => {
    const result = quickAnalysis([100, 105, 102]);
    expect(result.currentPrice).toBe(102);
    expect(result.totalReturn).toBe(0);
    expect(result.sharpeRatio).toBe(0);
    expect(result.maxDrawdown).toBe(0);
    expect(result.rsi).toBe(50);
    expect(result.signal).toBe('HOLD');
  });

  it('returns 0 for currentPrice when the array is empty', () => {
    const result = quickAnalysis([]);
    expect(result.currentPrice).toBe(0);
  });

  it('produces only finite metrics for a normal price series', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
    const result = quickAnalysis(prices);
    expect(Number.isFinite(result.totalReturn)).toBe(true);
    expect(Number.isFinite(result.annualizedReturn)).toBe(true);
    expect(Number.isFinite(result.volatility)).toBe(true);
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    expect(Number.isFinite(result.maxDrawdown)).toBe(true);
  });

  it('handles a series of identical prices without NaN', () => {
    const prices = Array.from({ length: 20 }, () => 100);
    const result = quickAnalysis(prices);
    expect(Number.isNaN(result.totalReturn)).toBe(false);
    expect(Number.isNaN(result.volatility)).toBe(false);
    expect(Number.isNaN(result.sharpeRatio)).toBe(false);
    expect(result.totalReturn).toBeCloseTo(0, 5);
    expect(result.volatility).toBeCloseTo(0, 5);
  });

  it('handles a steadily declining price series (negative returns)', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
    const result = quickAnalysis(prices);
    expect(result.totalReturn).toBeLessThan(0);
    expect(Number.isFinite(result.maxDrawdown)).toBe(true);
  });

  it('produces a signal value that is one of the five expected strings', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = quickAnalysis(prices);
    expect(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']).toContain(result.signal);
  });

  it('confidence is always in the range [10, 95]', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = quickAnalysis(prices);
    expect(result.confidence).toBeGreaterThanOrEqual(10);
    expect(result.confidence).toBeLessThanOrEqual(95);
  });
});
