import { describe, it, expect } from 'vitest';
import { MonteCarloSimulator, QuantitativeAnalyzer } from '../../services/quantAnalysis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HistoricalData = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function makeData(closes: number[]): HistoricalData[] {
  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1_000_000,
  }));
}

// 250-point strongly trending dataset (100 → 349)
const trendingCloses = Array.from({ length: 250 }, (_, i) => 100 + i);
const trendingData = makeData(trendingCloses);

// ---------------------------------------------------------------------------
// MonteCarloSimulator
// ---------------------------------------------------------------------------

describe('MonteCarloSimulator.simulate', () => {
  const INITIAL = 10_000;
  const RETURN = 0.08;    // 8 % annual
  const VOL = 0.20;       // 20 % annual
  const PERIODS = 30;

  it('uses 1000 simulations by default', () => {
    const result = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS);
    expect(result.simulations.length).toBe(1000);
  });

  it('respects a custom simulation count (50)', () => {
    const result = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 50);
    expect(result.simulations.length).toBe(50);
  });

  it('each simulation path has periods + 1 values', () => {
    const result = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 50);
    for (const path of result.simulations) {
      expect(path.length).toBe(PERIODS + 1);
    }
  });

  it('first value of each path equals initialValue', () => {
    const result = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 50);
    for (const path of result.simulations) {
      expect(path[0]).toBeCloseTo(INITIAL, 5);
    }
  });

  it('percentiles are strictly ordered p5 < p25 < p50 < p75 < p95', () => {
    const { percentiles } = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 100);
    expect(percentiles.p5).toBeLessThan(percentiles.p25);
    expect(percentiles.p25).toBeLessThan(percentiles.p50);
    expect(percentiles.p50).toBeLessThan(percentiles.p75);
    expect(percentiles.p75).toBeLessThan(percentiles.p95);
  });

  it('probabilityOfLoss is between 0 and 1', () => {
    const { probabilityOfLoss } = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 100);
    expect(probabilityOfLoss).toBeGreaterThanOrEqual(0);
    expect(probabilityOfLoss).toBeLessThanOrEqual(1);
  });

  it('expectedValue is positive for a positive initial value', () => {
    const { expectedValue } = MonteCarloSimulator.simulate(INITIAL, RETURN, VOL, PERIODS, 100);
    expect(expectedValue).toBeGreaterThan(0);
  });

  it('very high expected return → p50 > initialValue', () => {
    // 100 % annual expected return over 30 periods should reliably end above start
    const { percentiles } = MonteCarloSimulator.simulate(INITIAL, 1.0, 0.10, PERIODS, 100);
    expect(percentiles.p50).toBeGreaterThan(INITIAL);
  });

  it('very high volatility with negative return → probabilityOfLoss > 0.3', () => {
    const { probabilityOfLoss } = MonteCarloSimulator.simulate(
      INITIAL, -0.30, 0.80, PERIODS, 100
    );
    expect(probabilityOfLoss).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// QuantitativeAnalyzer
// ---------------------------------------------------------------------------

describe('QuantitativeAnalyzer.analyze', () => {
  it('returns the correct symbol field', () => {
    const report = QuantitativeAnalyzer.analyze('AAPL', trendingData);
    expect(report.symbol).toBe('AAPL');
  });

  it('signals.confidence is between 0 and 100', () => {
    const { signals } = QuantitativeAnalyzer.analyze('MSFT', trendingData);
    expect(signals.confidence).toBeGreaterThanOrEqual(0);
    expect(signals.confidence).toBeLessThanOrEqual(100);
  });

  it('signals.trend is one of bullish | bearish | neutral', () => {
    const { signals } = QuantitativeAnalyzer.analyze('TSLA', trendingData);
    expect(['bullish', 'bearish', 'neutral']).toContain(signals.trend);
  });

  it('signals.recommendation is one of buy | hold | sell', () => {
    const { signals } = QuantitativeAnalyzer.analyze('GOOG', trendingData);
    expect(['buy', 'hold', 'sell']).toContain(signals.recommendation);
  });

  it('short data (< 2 points) → returnsAnalysis.dailyReturns is empty', () => {
    const shortData = makeData([150]);
    const { returnsAnalysis } = QuantitativeAnalyzer.analyze('SPY', shortData);
    expect(returnsAnalysis.dailyReturns.length).toBe(0);
  });
});
