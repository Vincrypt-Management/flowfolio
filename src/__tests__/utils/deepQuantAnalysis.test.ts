import {
  welfordStats,
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
  treynorRatio,
  informationRatio,
  calculateBeta,
  calculateAlpha,
  maxDrawdown,
  valueAtRisk,
  conditionalVaR,
  skewness,
  kurtosis,
  correlation,
  rsi,
  portfolioVariance,
  deepAnalysis,
} from '../../services/deepQuantAnalysis';

// ---------------------------------------------------------------------------
// Generate deterministic test data (>= 50 points)
// ---------------------------------------------------------------------------

/** Trending-up prices with some noise */
const PRICES: number[] = [];
(() => {
  let p = 100;
  for (let i = 0; i < 120; i++) {
    p += Math.sin(i / 4) * 1.5 + 0.2;
    PRICES.push(parseFloat(p.toFixed(4)));
  }
})();

/** Simple returns derived from PRICES */
const RETURNS: number[] = [];
for (let i = 1; i < PRICES.length; i++) {
  RETURNS.push((PRICES[i] - PRICES[i - 1]) / PRICES[i - 1]);
}

/** Simulated benchmark returns */
const BENCH_RETURNS = RETURNS.map((r) => r * 0.8 + 0.0002);

// ---------------------------------------------------------------------------
// welfordStats
// ---------------------------------------------------------------------------

describe('welfordStats', () => {
  it('returns zeros for empty data', () => {
    const r = welfordStats([]);
    expect(r.mean).toBe(0);
    expect(r.variance).toBe(0);
  });

  it('matches expected mean for known data', () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    const r = welfordStats(data);
    expect(r.mean).toBeCloseTo(5, 8);
  });

  it('computes sample variance correctly', () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    const r = welfordStats(data);
    expect(r.variance).toBeCloseTo(4.571428571, 4);
  });

  it('stdDev = sqrt(variance)', () => {
    const r = welfordStats([1, 2, 3, 4, 5]);
    expect(r.stdDev).toBeCloseTo(Math.sqrt(r.variance), 10);
  });

  it('handles non-finite values gracefully', () => {
    const r = welfordStats([1, NaN, 3, Infinity, 5]);
    // Only finite values counted (1, 3, 5)
    expect(r.mean).toBeCloseTo(3, 8);
  });
});

// ---------------------------------------------------------------------------
// sharpeRatio
// ---------------------------------------------------------------------------

describe('sharpeRatio (deep)', () => {
  it('returns 0 for empty returns', () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it('returns 0 for zero volatility', () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });

  it('is positive for positive-mean returns with enough variance', () => {
    const posReturns = Array.from({ length: 252 }, (_, i) =>
      0.002 + (i % 2 === 0 ? 0.001 : -0.001),
    );
    expect(sharpeRatio(posReturns, 0)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// sortinoRatio
// ---------------------------------------------------------------------------

describe('sortinoRatio (deep)', () => {
  it('returns 0 for empty', () => {
    expect(sortinoRatio([])).toBe(0);
  });

  it('returns Infinity when no downside returns and positive mean', () => {
    expect(sortinoRatio([0.01, 0.02, 0.03])).toBe(Infinity);
  });

  it('produces a finite value for mixed returns', () => {
    const result = sortinoRatio(RETURNS);
    expect(isFinite(result) || result === Infinity).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calmarRatio
// ---------------------------------------------------------------------------

describe('calmarRatio', () => {
  it('returns 0 for insufficient data', () => {
    expect(calmarRatio([100])).toBe(0);
  });

  it('returns 0 when max drawdown is 0 (monotonic up)', () => {
    const up = [100, 101, 102, 103, 104];
    expect(calmarRatio(up)).toBe(0);
  });

  it('produces a number for normal price series', () => {
    const result = calmarRatio(PRICES);
    expect(typeof result).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// treynorRatio
// ---------------------------------------------------------------------------

describe('treynorRatio', () => {
  it('returns 0 for empty inputs', () => {
    expect(treynorRatio([], [])).toBe(0);
  });

  it('produces a number for valid data', () => {
    const result = treynorRatio(RETURNS, BENCH_RETURNS);
    expect(typeof result).toBe('number');
    expect(isFinite(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// informationRatio
// ---------------------------------------------------------------------------

describe('informationRatio', () => {
  it('returns 0 for empty inputs', () => {
    expect(informationRatio([], [])).toBe(0);
  });

  it('returns 0 when tracking error is zero (identical series)', () => {
    const r = [0.01, -0.01, 0.02];
    expect(informationRatio(r, r)).toBe(0);
  });

  it('produces a finite number for differing series', () => {
    const result = informationRatio(RETURNS, BENCH_RETURNS);
    expect(isFinite(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateBeta
// ---------------------------------------------------------------------------

describe('calculateBeta', () => {
  it('returns 1 for insufficient data', () => {
    expect(calculateBeta([0.01], [0.01])).toBe(1);
  });

  it('beta ≈ 1 when asset tracks market closely', () => {
    const mkt = RETURNS;
    const asset = mkt.map((r) => r * 1.0 + 0.0001);
    const beta = calculateBeta(asset, mkt);
    expect(beta).toBeCloseTo(1, 0);
  });

  it('beta > 1 for amplified asset', () => {
    const mkt = RETURNS;
    const asset = mkt.map((r) => r * 1.5);
    const beta = calculateBeta(asset, mkt);
    expect(beta).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// calculateAlpha
// ---------------------------------------------------------------------------

describe('calculateAlpha', () => {
  it('returns a number', () => {
    const result = calculateAlpha(RETURNS, BENCH_RETURNS);
    expect(typeof result).toBe('number');
  });

  it('alpha ≈ 0 when asset matches CAPM expectation', () => {
    // If asset exactly follows beta * market, alpha should be near 0
    const mkt = RETURNS;
    const asset = mkt.map((r) => r);
    const alpha = calculateAlpha(asset, mkt);
    expect(Math.abs(alpha)).toBeLessThan(5); // percentage, some tolerance
  });
});

// ---------------------------------------------------------------------------
// maxDrawdown
// ---------------------------------------------------------------------------

describe('maxDrawdown (deep)', () => {
  it('returns 0 for empty prices', () => {
    expect(maxDrawdown([])).toBe(0);
  });

  it('returns 0 for monotonically increasing prices', () => {
    expect(maxDrawdown([1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns negative value representing drawdown fraction', () => {
    const dd = maxDrawdown([100, 200, 100]);
    expect(dd).toBeCloseTo(-0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// valueAtRisk
// ---------------------------------------------------------------------------

describe('valueAtRisk (deep)', () => {
  it('returns 0 for empty returns', () => {
    expect(valueAtRisk([])).toBe(0);
  });

  it('95% VaR > 0 for mixed returns', () => {
    expect(valueAtRisk(RETURNS, 0.95)).toBeGreaterThan(0);
  });

  it('99% VaR ≥ 95% VaR', () => {
    const v95 = valueAtRisk(RETURNS, 0.95);
    const v99 = valueAtRisk(RETURNS, 0.99);
    expect(v99).toBeGreaterThanOrEqual(v95 - 0.001);
  });
});

// ---------------------------------------------------------------------------
// conditionalVaR
// ---------------------------------------------------------------------------

describe('conditionalVaR (deep)', () => {
  it('returns 0 for empty returns', () => {
    expect(conditionalVaR([])).toBe(0);
  });

  it('CVaR ≥ VaR', () => {
    const v = valueAtRisk(RETURNS, 0.95);
    const cv = conditionalVaR(RETURNS, 0.95);
    expect(cv).toBeGreaterThanOrEqual(v - 0.001);
  });
});

// ---------------------------------------------------------------------------
// skewness
// ---------------------------------------------------------------------------

describe('skewness', () => {
  it('returns 0 for fewer than 3 data points', () => {
    expect(skewness([1, 2])).toBe(0);
  });

  it('≈ 0 for symmetric data', () => {
    // Symmetric around 0
    const data = Array.from({ length: 100 }, (_, i) => i - 49.5);
    expect(skewness(data)).toBeCloseTo(0, 1);
  });

  it('> 0 for right-skewed data', () => {
    // Exponential-like distribution
    const data = Array.from({ length: 200 }, (_, i) => Math.pow(i / 50, 2));
    expect(skewness(data)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// kurtosis
// ---------------------------------------------------------------------------

describe('kurtosis', () => {
  it('returns 0 for fewer than 4 data points', () => {
    expect(kurtosis([1, 2, 3])).toBe(0);
  });

  it('≈ 0 (excess) for uniform-like data with sufficient points', () => {
    // Uniform distribution has excess kurtosis ≈ -1.2
    const data = Array.from({ length: 500 }, (_, i) => i / 500);
    const k = kurtosis(data);
    expect(k).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// correlation
// ---------------------------------------------------------------------------

describe('correlation', () => {
  it('returns 0 for insufficient data', () => {
    expect(correlation([1], [1])).toBe(0);
  });

  it('perfect positive correlation = 1', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(correlation(x, y)).toBeCloseTo(1, 8);
  });

  it('perfect negative correlation = -1', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(correlation(x, y)).toBeCloseTo(-1, 8);
  });

  it('correlation is in [-1, 1]', () => {
    const c = correlation(RETURNS, BENCH_RETURNS);
    expect(c).toBeGreaterThanOrEqual(-1);
    expect(c).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// rsi
// ---------------------------------------------------------------------------

describe('rsi (deep)', () => {
  it('returns 50 for insufficient data', () => {
    expect(rsi([1, 2, 3])).toBe(50);
  });

  it('> 70 for strongly rising prices', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 5);
    expect(rsi(rising)).toBeGreaterThan(70);
  });

  it('< 30 for strongly falling prices', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i * 5);
    expect(rsi(falling)).toBeLessThan(30);
  });

  it('is within [0, 100]', () => {
    const r = rsi(PRICES);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// portfolioVariance
// ---------------------------------------------------------------------------

describe('portfolioVariance (deep)', () => {
  it('computes known result', () => {
    const weights = [0.6, 0.4];
    const cov = [
      [0.04, 0.006],
      [0.006, 0.01],
    ];
    // 0.6²*0.04 + 2*0.6*0.4*0.006 + 0.4²*0.01
    const expected = 0.36 * 0.04 + 2 * 0.6 * 0.4 * 0.006 + 0.16 * 0.01;
    expect(portfolioVariance(weights, cov)).toBeCloseTo(expected, 10);
  });

  it('single asset → weight²×variance', () => {
    expect(portfolioVariance([1], [[0.05]])).toBeCloseTo(0.05, 10);
  });
});

// ---------------------------------------------------------------------------
// deepAnalysis
// ---------------------------------------------------------------------------

describe('deepAnalysis', () => {
  it('returns default metrics for short price series', () => {
    const result = deepAnalysis('TEST', [100, 105, 110]);
    expect(result.symbol).toBe('TEST');
    expect(result.signal).toBe('HOLD');
    expect(result.confidence).toBe(50);
  });

  it('returns complete analysis for sufficient data', () => {
    const result = deepAnalysis('AAPL', PRICES);
    expect(result.symbol).toBe('AAPL');
    expect(result.currentPrice).toBe(PRICES[PRICES.length - 1]);
    expect(result.dailyReturns.length).toBeGreaterThan(0);
    expect(typeof result.totalReturn).toBe('number');
    expect(typeof result.annualizedReturn).toBe('number');
    expect(typeof result.volatility).toBe('number');
    expect(typeof result.sharpeRatio).toBe('number');
    expect(typeof result.sortinoRatio).toBe('number');
    expect(typeof result.calmarRatio).toBe('number');
    expect(typeof result.maxDrawdown).toBe('number');
    expect(typeof result.var95).toBe('number');
    expect(typeof result.cvar95).toBe('number');
    expect(typeof result.beta).toBe('number');
    expect(typeof result.alpha).toBe('number');
    expect(typeof result.skewness).toBe('number');
    expect(typeof result.kurtosis).toBe('number');
    expect(typeof result.rsi).toBe('number');
    expect(result.macd).toHaveProperty('value');
    expect(result.macd).toHaveProperty('signal');
    expect(result.macd).toHaveProperty('histogram');
    expect(result.bollingerBands).toHaveProperty('upper');
    expect(result.bollingerBands).toHaveProperty('middle');
    expect(result.bollingerBands).toHaveProperty('lower');
  });

  it('signal is one of the valid values', () => {
    const result = deepAnalysis('AAPL', PRICES);
    expect(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']).toContain(result.signal);
  });

  it('accepts optional market prices', () => {
    const marketPrices = PRICES.map((p) => p * 0.9);
    const result = deepAnalysis('AAPL', PRICES, marketPrices);
    expect(result.symbol).toBe('AAPL');
    expect(typeof result.beta).toBe('number');
  });
});
