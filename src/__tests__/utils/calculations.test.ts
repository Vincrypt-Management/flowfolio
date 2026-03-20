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
  macd,
  bollingerBands,
  correlationMatrix,
  covarianceMatrix,
  portfolioVariance,
  quickAnalysis,
} from '../../shared/utils/calculations';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_PRICES = [100, 102, 101, 105, 103, 107, 110, 108, 112, 115];

// Pre-computed simple returns for SAMPLE_PRICES
const SAMPLE_RETURNS = SAMPLE_PRICES.slice(1).map(
  (p, i) => (p - SAMPLE_PRICES[i]) / SAMPLE_PRICES[i],
);

// Longer price series for indicators that need ≥ 15 data points
const LONG_PRICES: number[] = [];
(() => {
  let p = 100;
  for (let i = 0; i < 60; i++) {
    p += (Math.sin(i / 3) + 0.05) * 2;
    LONG_PRICES.push(parseFloat(p.toFixed(4)));
  }
})();

// ---------------------------------------------------------------------------
// mean
// ---------------------------------------------------------------------------

describe('mean', () => {
  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the value for a single-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('computes mean for positive and negative values', () => {
    expect(mean([1, -1, 2, -2])).toBeCloseTo(0, 10);
  });

  it('handles a large dataset', () => {
    const data = Array.from({ length: 10_000 }, (_, i) => i);
    expect(mean(data)).toBeCloseTo(4999.5, 5);
  });

  it('maintains precision with Kahan summation', () => {
    // Many small values – naive sum would accumulate error
    const data = Array.from({ length: 100_000 }, () => 0.1);
    expect(mean(data)).toBeCloseTo(0.1, 10);
  });
});

// ---------------------------------------------------------------------------
// varianceWelford
// ---------------------------------------------------------------------------

describe('varianceWelford', () => {
  it('returns zeros for empty data', () => {
    const r = varianceWelford([]);
    expect(r.mean).toBe(0);
    expect(r.variance).toBe(0);
    expect(r.stdDev).toBe(0);
  });

  it('returns zero variance for a single value', () => {
    const r = varianceWelford([5]);
    expect(r.mean).toBe(5);
    expect(r.variance).toBe(0);
  });

  it('returns zero variance for identical values', () => {
    const r = varianceWelford([3, 3, 3, 3]);
    expect(r.variance).toBeCloseTo(0, 10);
  });

  it('computes known variance', () => {
    // Population variance of [2,4,4,4,5,5,7,9] = 4; sample = 4.571
    const r = varianceWelford([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBeCloseTo(5, 10);
    expect(r.variance).toBeCloseTo(4.571428571, 4);
    expect(r.stdDev).toBeCloseTo(Math.sqrt(4.571428571), 4);
  });
});

// ---------------------------------------------------------------------------
// calculateReturns
// ---------------------------------------------------------------------------

describe('calculateReturns', () => {
  it('returns empty Float64Array for fewer than 2 prices', () => {
    expect(calculateReturns([100]).length).toBe(0);
  });

  it('computes simple returns', () => {
    const r = calculateReturns([100, 110, 105]);
    expect(r[0]).toBeCloseTo(0.1, 10);
    expect(r[1]).toBeCloseTo(-0.04545, 4);
  });

  it('handles descending prices', () => {
    const r = calculateReturns([100, 90, 80]);
    expect(r[0]).toBeCloseTo(-0.1, 10);
    expect(r[1]).toBeCloseTo(-0.1111, 3);
  });
});

// ---------------------------------------------------------------------------
// calculateLogReturns
// ---------------------------------------------------------------------------

describe('calculateLogReturns', () => {
  it('returns empty for single price', () => {
    expect(calculateLogReturns([100]).length).toBe(0);
  });

  it('log returns close to simple returns for small changes', () => {
    const simple = calculateReturns([100, 101]);
    const log = calculateLogReturns([100, 101]);
    expect(log[0]).toBeCloseTo(simple[0], 3);
  });

  it('computes correct log returns', () => {
    const lr = calculateLogReturns([100, 200]);
    expect(lr[0]).toBeCloseTo(Math.log(2), 10);
  });
});

// ---------------------------------------------------------------------------
// sharpeRatio
// ---------------------------------------------------------------------------

describe('sharpeRatio', () => {
  it('returns 0 for empty returns', () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it('returns 0 for zero volatility', () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it('computes a positive Sharpe for positive returns', () => {
    const returns = Array.from({ length: 252 }, () => 0.001);
    // annualizedReturn = 0.001*252 = 0.252, vol = stdDev*sqrt(252) ≈ 0
    // all identical → stdDev=0 → 0, but let's add small noise
    const noisyReturns = returns.map((r, i) => r + (i % 2 === 0 ? 0.0001 : -0.0001));
    expect(sharpeRatio(noisyReturns)).toBeGreaterThan(0);
  });

  it('computes negative Sharpe for negative returns', () => {
    // Deterministic: alternating -0.005 and -0.003, mean ≈ -0.004, stdDev > 0
    // annualizedReturn = -0.004 * 252 = -1.008; after subtracting riskFree 0.045 → very negative numerator
    const negativeReturns = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? -0.005 : -0.003));
    expect(sharpeRatio(negativeReturns)).toBeLessThan(0);
  });

  it('accepts a custom risk-free rate', () => {
    const returns = Array.from({ length: 100 }, (_, i) => 0.002 + (i % 2 === 0 ? 0.001 : -0.001));
    const s1 = sharpeRatio(returns, 0);
    const s2 = sharpeRatio(returns, 0.1);
    expect(s1).toBeGreaterThan(s2);
  });
});

// ---------------------------------------------------------------------------
// sortinoRatio
// ---------------------------------------------------------------------------

describe('sortinoRatio', () => {
  it('returns 0 for empty returns', () => {
    expect(sortinoRatio([])).toBe(0);
  });

  it('returns Infinity when all returns are positive and mean > 0', () => {
    const returns = [0.01, 0.02, 0.03];
    expect(sortinoRatio(returns)).toBe(Infinity);
  });

  it('only counts downside deviation', () => {
    const returns = [0.05, -0.01, 0.04, -0.02, 0.03];
    const result = sortinoRatio(returns);
    expect(typeof result).toBe('number');
    expect(isFinite(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// maxDrawdown
// ---------------------------------------------------------------------------

describe('maxDrawdown', () => {
  it('returns 0 for empty prices', () => {
    expect(maxDrawdown([])).toBe(0);
  });

  it('returns 0 for monotonically increasing prices', () => {
    expect(maxDrawdown([1, 2, 3, 4, 5])).toBe(0);
  });

  it('calculates 100% drawdown', () => {
    expect(maxDrawdown([100, 50, 0.001])).toBeCloseTo(0.99999, 3);
  });

  it('finds peak-to-trough correctly', () => {
    // Peak at 200, trough at 100 → 50% dd
    expect(maxDrawdown([100, 200, 150, 100, 180])).toBeCloseTo(0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// valueAtRisk
// ---------------------------------------------------------------------------

describe('valueAtRisk', () => {
  it('returns 0 for empty returns', () => {
    expect(valueAtRisk([])).toBe(0);
  });

  it('computes 95% VaR', () => {
    const returns = Array.from({ length: 1000 }, (_, i) => (i - 500) / 10000);
    const var95 = valueAtRisk(returns, 0.95);
    expect(var95).toBeGreaterThan(0);
  });

  it('99% VaR ≥ 95% VaR', () => {
    const returns = Array.from({ length: 1000 }, (_, i) => (i - 500) / 10000);
    expect(valueAtRisk(returns, 0.99)).toBeGreaterThanOrEqual(valueAtRisk(returns, 0.95));
  });

  it('VaR is negative for all-positive returns (no downside risk)', () => {
    // All returns are +1%; sorted[index] = 0.01; VaR = -0.01 * sqrt(252) < 0
    // A negative VaR indicates the "worst" return is still a gain — no downside risk.
    const returns = Array.from({ length: 100 }, () => 0.01);
    const result = valueAtRisk(returns, 0.95);
    expect(typeof result).toBe('number');
    expect(isFinite(result)).toBe(true);
    expect(result).toBeCloseTo(-0.01 * Math.sqrt(252), 10);
    expect(result).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// conditionalVaR
// ---------------------------------------------------------------------------

describe('conditionalVaR', () => {
  it('returns 0 for empty returns', () => {
    expect(conditionalVaR([])).toBe(0);
  });

  it('CVaR ≥ VaR (in magnitude)', () => {
    const returns = Array.from({ length: 500 }, (_, i) => -0.05 + i * 0.0002);
    const var95 = valueAtRisk(returns, 0.95);
    const cvar95 = conditionalVaR(returns, 0.95);
    expect(cvar95).toBeGreaterThanOrEqual(var95);
  });
});

// ---------------------------------------------------------------------------
// sma
// ---------------------------------------------------------------------------

describe('sma', () => {
  it('returns empty when period > data length', () => {
    expect(sma([1, 2], 5)).toEqual([]);
  });

  it('computes simple moving average', () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(2, 10);
    expect(result[1]).toBeCloseTo(3, 10);
    expect(result[2]).toBeCloseTo(4, 10);
  });
});

// ---------------------------------------------------------------------------
// ema
// ---------------------------------------------------------------------------

describe('ema', () => {
  it('returns empty for empty data', () => {
    expect(ema([], 5)).toEqual([]);
  });

  it('has same length as input', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
  });

  it('first value equals SMA of first `period` values when data.length >= period', () => {
    const data = [10, 20, 30, 40, 50];
    const result = ema(data, 3);
    // first value = SMA of first 3 = (10+20+30)/3 = 20
    expect(result[0]).toBeCloseTo(20, 10);
  });
});

// ---------------------------------------------------------------------------
// rsi
// ---------------------------------------------------------------------------

describe('rsi', () => {
  it('returns 50 when not enough data', () => {
    expect(rsi([1, 2, 3])).toBe(50);
  });

  it('returns ~100 for strongly rising prices (overbought)', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 5);
    expect(rsi(rising)).toBeGreaterThan(70);
  });

  it('returns <30 for strongly falling prices (oversold)', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i * 5);
    expect(rsi(falling)).toBeLessThan(30);
  });

  it('returns value between 0 and 100', () => {
    const r = rsi(LONG_PRICES);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// macd
// ---------------------------------------------------------------------------

describe('macd', () => {
  it('returns macd, signal, histogram, and macdLine', () => {
    const result = macd(LONG_PRICES);
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('histogram');
    expect(result).toHaveProperty('macdLine');
    expect(result.macdLine).toHaveLength(LONG_PRICES.length);
  });

  it('histogram = macd - signal', () => {
    const result = macd(LONG_PRICES);
    expect(result.histogram).toBeCloseTo(result.macd - result.signal, 10);
  });
});

// ---------------------------------------------------------------------------
// bollingerBands
// ---------------------------------------------------------------------------

describe('bollingerBands', () => {
  it('upper > middle > lower when there is variance', () => {
    const result = bollingerBands(LONG_PRICES, 20, 2);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it('all bands equal last price when period > data length', () => {
    const result = bollingerBands([10, 20], 20, 2);
    expect(result.upper).toBe(result.middle);
    expect(result.middle).toBe(result.lower);
  });

  it('width increases with stdDev multiplier', () => {
    const narrow = bollingerBands(LONG_PRICES, 20, 1);
    const wide = bollingerBands(LONG_PRICES, 20, 3);
    const widthNarrow = narrow.upper - narrow.lower;
    const widthWide = wide.upper - wide.lower;
    expect(widthWide).toBeGreaterThan(widthNarrow);
  });
});

// ---------------------------------------------------------------------------
// correlationMatrix
// ---------------------------------------------------------------------------

describe('correlationMatrix', () => {
  it('diagonal entries equal 1', () => {
    const data = [
      [0.01, -0.02, 0.03, 0.01, -0.01],
      [0.02, -0.01, 0.02, 0.00, -0.02],
    ];
    const m = correlationMatrix(data);
    expect(m[0][0]).toBeCloseTo(1, 10);
    expect(m[1][1]).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    const data = [
      [0.01, -0.02, 0.03],
      [0.02, -0.01, 0.04],
      [-0.01, 0.03, -0.02],
    ];
    const m = correlationMatrix(data);
    expect(m[0][1]).toBeCloseTo(m[1][0], 10);
    expect(m[0][2]).toBeCloseTo(m[2][0], 10);
  });

  it('values are in [-1, 1]', () => {
    const data = [
      [0.01, 0.02, 0.03, 0.04],
      [-0.01, -0.02, -0.03, -0.04],
    ];
    const m = correlationMatrix(data);
    for (const row of m) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(-1.001);
        expect(v).toBeLessThanOrEqual(1.001);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// covarianceMatrix
// ---------------------------------------------------------------------------

describe('covarianceMatrix', () => {
  it('is symmetric', () => {
    const data = [
      [0.01, -0.02, 0.03, 0.01],
      [0.02, -0.01, 0.02, 0.00],
    ];
    const m = covarianceMatrix(data);
    expect(m[0][1]).toBeCloseTo(m[1][0], 10);
  });

  it('diagonal elements are non-negative', () => {
    const data = [
      [0.01, -0.02, 0.03],
      [0.02, -0.01, 0.04],
    ];
    const m = covarianceMatrix(data);
    expect(m[0][0]).toBeGreaterThanOrEqual(0);
    expect(m[1][1]).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// portfolioVariance
// ---------------------------------------------------------------------------

describe('portfolioVariance', () => {
  it('computes known portfolio variance', () => {
    const weights = [0.5, 0.5];
    const cov = [
      [0.04, 0.01],
      [0.01, 0.09],
    ];
    // 0.5²*0.04 + 2*0.5*0.5*0.01 + 0.5²*0.09 = 0.01 + 0.005 + 0.0225 = 0.0375
    expect(portfolioVariance(weights, cov)).toBeCloseTo(0.0375, 10);
  });

  it('equal weights with identity-like cov', () => {
    const weights = [1 / 3, 1 / 3, 1 / 3];
    const cov = [
      [0.01, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.01],
    ];
    expect(portfolioVariance(weights, cov)).toBeCloseTo(0.01 / 3, 10);
  });
});

// ---------------------------------------------------------------------------
// quickAnalysis
// ---------------------------------------------------------------------------

describe('quickAnalysis', () => {
  it('returns default values for short price series', () => {
    const result = quickAnalysis([100, 105, 110]);
    expect(result.signal).toBe('HOLD');
    expect(result.currentPrice).toBe(110);
  });

  it('returns all expected fields for sufficient data', () => {
    const result = quickAnalysis(LONG_PRICES);
    expect(result).toHaveProperty('currentPrice');
    expect(result).toHaveProperty('totalReturn');
    expect(result).toHaveProperty('annualizedReturn');
    expect(result).toHaveProperty('volatility');
    expect(result).toHaveProperty('sharpeRatio');
    expect(result).toHaveProperty('maxDrawdown');
    expect(result).toHaveProperty('rsi');
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('confidence');
  });

  it('currentPrice equals last price', () => {
    const result = quickAnalysis(LONG_PRICES);
    expect(result.currentPrice).toBe(LONG_PRICES[LONG_PRICES.length - 1]);
  });

  it('signal is one of the valid values', () => {
    const result = quickAnalysis(LONG_PRICES);
    expect(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']).toContain(result.signal);
  });

  it('confidence is between 10 and 95', () => {
    const result = quickAnalysis(LONG_PRICES);
    expect(result.confidence).toBeGreaterThanOrEqual(10);
    expect(result.confidence).toBeLessThanOrEqual(95);
  });
});
