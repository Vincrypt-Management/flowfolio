import { describe, it, expect } from 'vitest';
import { TechnicalAnalysis, PortfolioOptimizer } from '../../services/quantAnalysis';

// Inline definition so we don't depend on marketData export shape
type HistoricalData = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function makeData(closes: number[], highs?: number[], lows?: number[]): HistoricalData[] {
  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: highs?.[i] ?? close,
    low: lows?.[i] ?? close,
    close,
    volume: 100000,
  }));
}

// ============================================================================
// TechnicalAnalysis.calculateIndicators
// ============================================================================

describe('TechnicalAnalysis.calculateIndicators', () => {
  it('empty data returns an object with numeric properties without throwing', () => {
    const result = TechnicalAnalysis.calculateIndicators([]);
    expect(typeof result.sma20).toBe('number');
    expect(typeof result.sma50).toBe('number');
    expect(typeof result.sma200).toBe('number');
    expect(typeof result.ema12).toBe('number');
    expect(typeof result.ema26).toBe('number');
    expect(typeof result.macd).toBe('number');
    expect(typeof result.macdSignal).toBe('number');
    expect(typeof result.macdHistogram).toBe('number');
    expect(typeof result.rsi14).toBe('number');
    expect(typeof result.bollingerBands.upper).toBe('number');
    expect(typeof result.bollingerBands.middle).toBe('number');
    expect(typeof result.bollingerBands.lower).toBe('number');
    expect(typeof result.atr14).toBe('number');
    expect(typeof result.obv).toBe('number');
    expect(typeof result.williamsR).toBe('number');
    expect(typeof result.stochastic.k).toBe('number');
    expect(typeof result.stochastic.d).toBe('number');
  });

  it('250 constant prices of 100 → sma20, sma50, sma200, ema12, ema26 all equal 100', () => {
    // Note: calculateIndicators calls .reverse() on the input, but constant data
    // is order-independent so we can pass the array directly.
    const closes = Array(250).fill(100);
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);

    expect(result.sma20).toBeCloseTo(100, 5);
    expect(result.sma50).toBeCloseTo(100, 5);
    expect(result.sma200).toBeCloseTo(100, 5);
    expect(result.ema12).toBeCloseTo(100, 5);
    expect(result.ema26).toBeCloseTo(100, 5);
  });

  it('trending up prices → sma20 > sma50 (recent average higher than longer-term)', () => {
    // 250 prices linearly from 100 to 349 (index 0 = newest in final reversed array)
    // We want the *input* array to be newest-first so that after .reverse() the
    // data is oldest-first as expected by the SMA slicing logic.
    // Input index 0 = newest (349), index 249 = oldest (100).
    const closes = Array.from({ length: 250 }, (_, i) => 349 - i); // 349, 348, ..., 100
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);

    // After reverse() inside the method, the array is 100..349 (oldest→newest).
    // sma20 = avg of last 20 = ~340, sma50 = avg of last 50 = ~325
    expect(result.sma20).toBeGreaterThan(result.sma50);
  });

  it('all-up prices → rsi14 close to 100 (> 70)', () => {
    // Prices strictly increasing: after reverse() inside the method, differences
    // are all positive so avgLoss = 0 → rsi = 100.
    // Input (newest-first): descending so that after reverse() = ascending.
    const closes = Array.from({ length: 50 }, (_, i) => 50 - i); // 50,49,...,1 newest-first
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);
    expect(result.rsi14).toBeGreaterThan(70);
  });

  it('all-down prices → rsi14 close to 0 (< 30)', () => {
    // Prices strictly decreasing after reverse(): input newest-first = ascending.
    const closes = Array.from({ length: 50 }, (_, i) => i + 1); // 1,2,...,50 newest-first
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);
    expect(result.rsi14).toBeLessThan(30);
  });

  it('bollinger bands: middle === sma20, upper > middle, lower < middle for non-constant data', () => {
    // Use varied closes so stdDev > 0. Input is newest-first.
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i) * 5);
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);

    expect(result.bollingerBands.middle).toBeCloseTo(result.sma20, 5);
    expect(result.bollingerBands.upper).toBeGreaterThan(result.bollingerBands.middle);
    expect(result.bollingerBands.lower).toBeLessThan(result.bollingerBands.middle);
  });

  it('constant prices → bollingerBands upper === middle === lower === 100', () => {
    const closes = Array(50).fill(100);
    const data = makeData(closes);
    const result = TechnicalAnalysis.calculateIndicators(data);

    expect(result.bollingerBands.upper).toBeCloseTo(100, 5);
    expect(result.bollingerBands.middle).toBeCloseTo(100, 5);
    expect(result.bollingerBands.lower).toBeCloseTo(100, 5);
  });
});

// ============================================================================
// PortfolioOptimizer.analyzePortfolio
// ============================================================================

const returns50 = Array.from({ length: 50 }, (_, i) => Math.sin(i) * 0.01);

describe('PortfolioOptimizer.analyzePortfolio', () => {
  it('single asset → weights = { AAPL: 1 }, correlationMatrix = [[1]]', () => {
    const result = PortfolioOptimizer.analyzePortfolio(['AAPL'], { AAPL: returns50 });

    expect(result.weights).toEqual({ AAPL: 1 });
    expect(result.correlationMatrix).toHaveLength(1);
    expect(result.correlationMatrix[0]).toHaveLength(1);
    expect(result.correlationMatrix[0][0]).toBe(1);
  });

  it('two assets equal weights → weights = { AAPL: 0.5, MSFT: 0.5 }, diagonal of correlationMatrix = 1', () => {
    const result = PortfolioOptimizer.analyzePortfolio(
      ['AAPL', 'MSFT'],
      { AAPL: returns50, MSFT: returns50.map(r => r * 0.9) }
    );

    expect(result.weights.AAPL).toBeCloseTo(0.5, 10);
    expect(result.weights.MSFT).toBeCloseTo(0.5, 10);
    expect(result.correlationMatrix[0][0]).toBe(1);
    expect(result.correlationMatrix[1][1]).toBe(1);
  });

  it('positive expected returns data → expectedReturn > 0', () => {
    const posReturns = Array.from({ length: 50 }, () => 0.005); // all positive
    const result = PortfolioOptimizer.analyzePortfolio(['AAPL'], { AAPL: posReturns });

    expect(result.expectedReturn).toBeGreaterThan(0);
  });

  it('all-zero returns → expectedReturn === 0, volatility === 0', () => {
    const zeroReturns = Array(50).fill(0);
    const result = PortfolioOptimizer.analyzePortfolio(
      ['AAPL', 'MSFT'],
      { AAPL: zeroReturns, MSFT: zeroReturns }
    );

    expect(result.expectedReturn).toBe(0);
    expect(result.volatility).toBe(0);
  });

  it('two perfectly correlated assets → correlationMatrix[0][1] close to 1', () => {
    const up = [0.01, 0.02, -0.01, 0.03, 0.01];
    const result = PortfolioOptimizer.analyzePortfolio(
      ['AAPL', 'MSFT'],
      { AAPL: up, MSFT: up }
    );

    expect(result.correlationMatrix[0][1]).toBeCloseTo(1, 5);
  });

  it('two perfectly anti-correlated assets → correlationMatrix[0][1] close to -1', () => {
    const up = [0.01, 0.02, -0.01, 0.03, 0.01];
    const down = up.map(r => -r);
    const result = PortfolioOptimizer.analyzePortfolio(
      ['AAPL', 'MSFT'],
      { AAPL: up, MSFT: down }
    );

    expect(result.correlationMatrix[0][1]).toBeCloseTo(-1, 5);
  });
});
