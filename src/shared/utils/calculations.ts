// Optimized Quantitative Analysis
// High-performance calculations using typed arrays and SIMD-friendly operations

// ============================================================================
// CONSTANTS
// ============================================================================

const TRADING_DAYS = 252;
const SQRT_252 = Math.sqrt(252);
const RISK_FREE_RATE = 0.045; // 4.5%

// ============================================================================
// OPTIMIZED STATISTICAL FUNCTIONS
// ============================================================================

/**
 * Calculate mean using Kahan summation for numerical stability
 */
export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  
  let sum = 0;
  let c = 0; // Compensation for lost low-order bits
  
  for (const value of data) {
    const y = value - c;
    const t = sum + y;
    c = (t - sum) - y;
    sum = t;
  }
  
  return sum / data.length;
}

/**
 * Calculate variance in single pass using Welford's algorithm
 */
export function varianceWelford(data: number[]): { mean: number; variance: number; stdDev: number } {
  if (data.length === 0) return { mean: 0, variance: 0, stdDev: 0 };
  
  let n = 0;
  let mean = 0;
  let m2 = 0;
  
  for (const x of data) {
    n++;
    const delta = x - mean;
    mean += delta / n;
    const delta2 = x - mean;
    m2 += delta * delta2;
  }
  
  const variance = n > 1 ? m2 / (n - 1) : 0;
  return { mean, variance, stdDev: Math.sqrt(variance) };
}

/**
 * Calculate returns from prices (optimized)
 */
export function calculateReturns(prices: number[]): Float64Array {
  if (prices.length < 2) return new Float64Array(0);
  
  const returns = new Float64Array(prices.length - 1);
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns[i - 1] = (prices[i] - prices[i - 1]) / prices[i - 1];
    }
  }
  
  return returns;
}

/**
 * Calculate log returns (more numerically stable for compounding)
 */
export function calculateLogReturns(prices: number[]): Float64Array {
  if (prices.length < 2) return new Float64Array(0);
  
  const returns = new Float64Array(prices.length - 1);
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns[i - 1] = Math.log(prices[i] / prices[i - 1]);
    }
  }
  
  return returns;
}

// ============================================================================
// RISK METRICS (OPTIMIZED)
// ============================================================================

/**
 * Sharpe ratio with annualization
 */
export function sharpeRatio(returns: ArrayLike<number>, riskFreeRate = RISK_FREE_RATE): number {
  if (returns.length === 0) return 0;
  
  const stats = varianceWelford(Array.from(returns));
  if (stats.stdDev === 0) return 0;
  
  const annualizedReturn = stats.mean * TRADING_DAYS;
  const annualizedVol = stats.stdDev * SQRT_252;
  
  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

/**
 * Sortino ratio (downside deviation only)
 */
export function sortinoRatio(returns: ArrayLike<number>, riskFreeRate = RISK_FREE_RATE): number {
  if (returns.length === 0) return 0;
  
  // Calculate mean
  let sum = 0;
  for (let i = 0; i < returns.length; i++) {
    sum += returns[i];
  }
  const meanReturn = sum / returns.length;
  
  // Calculate downside deviation
  let downsideSum = 0;
  let downsideCount = 0;
  
  for (let i = 0; i < returns.length; i++) {
    if (returns[i] < 0) {
      downsideSum += returns[i] * returns[i];
      downsideCount++;
    }
  }
  
  if (downsideCount === 0) return meanReturn > 0 ? Infinity : 0;
  
  const downsideDev = Math.sqrt(downsideSum / downsideCount) * SQRT_252;
  const annualizedReturn = meanReturn * TRADING_DAYS;
  
  return (annualizedReturn - riskFreeRate) / downsideDev;
}

/**
 * Maximum drawdown (single pass, O(n))
 */
export function maxDrawdown(prices: number[]): number {
  if (prices.length === 0) return 0;
  
  let peak = prices[0];
  let maxDD = 0;
  
  for (const price of prices) {
    if (price > peak) {
      peak = price;
    }
    const dd = (price - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
    }
  }
  
  return Math.abs(maxDD);
}

/**
 * Value at Risk (VaR) using historical simulation
 */
export function valueAtRisk(returns: number[], confidenceLevel = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (1 - confidenceLevel));
  
  return -sorted[index] * SQRT_252; // Annualized
}

/**
 * Conditional VaR (Expected Shortfall)
 */
export function conditionalVaR(returns: number[], confidenceLevel = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sorted.length * (1 - confidenceLevel));
  
  let sum = 0;
  for (let i = 0; i <= cutoffIndex; i++) {
    sum += sorted[i];
  }
  
  return -sum / (cutoffIndex + 1) * SQRT_252; // Annualized
}

// ============================================================================
// TECHNICAL INDICATORS (OPTIMIZED)
// ============================================================================

/**
 * Simple Moving Average (optimized with running sum)
 */
export function sma(data: number[], period: number): number[] {
  if (data.length < period) return [];
  
  const result = new Array(data.length - period + 1);
  let sum = 0;
  
  // Initial sum
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[0] = sum / period;
  
  // Rolling calculation
  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period] + data[i];
    result[i - period + 1] = sum / period;
  }
  
  return result;
}

/**
 * Exponential Moving Average
 */
export function ema(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  
  const result = new Array(data.length);
  const multiplier = 2 / (period + 1);
  
  // First value is SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i];
  }
  result[0] = sum / Math.min(period, data.length);
  
  // EMA calculation
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  
  return result;
}

/**
 * RSI using Wilder's smoothing (more accurate than simple average)
 */
export function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  
  let avgGain = 0;
  let avgLoss = 0;
  
  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  
  // Wilder's smoothing
  const smoothing = 1 / period;
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = avgGain * (1 - smoothing) + change * smoothing;
      avgLoss = avgLoss * (1 - smoothing);
    } else {
      avgGain = avgGain * (1 - smoothing);
      avgLoss = avgLoss * (1 - smoothing) - change * smoothing;
    }
  }
  
  if (avgLoss < 1e-10) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * MACD (optimized)
 */
export function macd(prices: number[], fast = 12, slow = 26, signal = 9): {
  macd: number;
  signal: number;
  histogram: number;
  macdLine: number[];
} {
  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  
  const lastMacd = macdLine[macdLine.length - 1] || 0;
  const lastSignal = signalLine[signalLine.length - 1] || 0;
  
  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
    macdLine,
  };
}

/**
 * Bollinger Bands
 */
export function bollingerBands(prices: number[], period = 20, stdDevMultiplier = 2): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (prices.length < period) {
    const last = prices[prices.length - 1] || 0;
    return { upper: last, middle: last, lower: last };
  }
  
  const slice = prices.slice(-period);
  const stats = varianceWelford(slice);
  
  return {
    upper: stats.mean + stdDevMultiplier * stats.stdDev,
    middle: stats.mean,
    lower: stats.mean - stdDevMultiplier * stats.stdDev,
  };
}

/**
 * Average True Range (ATR)
 */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  if (highs.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  // Use EMA for smoothing (Wilder's method)
  let atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < trueRanges.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i]) / period;
  }
  
  return atrValue;
}

// ============================================================================
// PORTFOLIO OPTIMIZATION
// ============================================================================

/**
 * Calculate correlation matrix (optimized)
 */
export function correlationMatrix(returnsData: number[][]): number[][] {
  const n = returnsData.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  // Pre-calculate means and std devs
  const stats = returnsData.map(returns => varianceWelford(returns));
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    
    for (let j = i + 1; j < n; j++) {
      const corr = correlation(
        returnsData[i],
        returnsData[j],
        stats[i].mean,
        stats[j].mean,
        stats[i].stdDev,
        stats[j].stdDev
      );
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }
  
  return matrix;
}

/**
 * Correlation with pre-computed stats
 */
function correlation(
  x: number[],
  y: number[],
  meanX: number,
  meanY: number,
  stdX: number,
  stdY: number
): number {
  if (stdX === 0 || stdY === 0) return 0;
  
  const n = Math.min(x.length, y.length);
  let sum = 0;
  
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  
  return sum / (n * stdX * stdY);
}

/**
 * Portfolio variance calculation
 */
export function portfolioVariance(
  weights: number[],
  covMatrix: number[][]
): number {
  let variance = 0;
  const n = weights.length;
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  
  return variance;
}

/**
 * Covariance matrix from returns
 */
export function covarianceMatrix(returnsData: number[][]): number[][] {
  const n = returnsData.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  const means = returnsData.map(r => mean(r));
  
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const cov = covariance(returnsData[i], returnsData[j], means[i], means[j]);
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }
  
  return matrix;
}

function covariance(x: number[], y: number[], meanX: number, meanY: number): number {
  const n = Math.min(x.length, y.length);
  if (n <= 1) return 0;
  
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  
  return sum / (n - 1);
}

// ============================================================================
// COMPREHENSIVE ANALYSIS
// ============================================================================

export interface QuickMetrics {
  currentPrice: number;
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  rsi: number;
  signal: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  confidence: number;
}

/**
 * Quick analysis - optimized single-pass calculation
 */
export function quickAnalysis(prices: number[]): QuickMetrics {
  if (prices.length < 14) {
    return {
      currentPrice: prices[prices.length - 1] || 0,
      totalReturn: 0,
      annualizedReturn: 0,
      volatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      rsi: 50,
      signal: 'HOLD',
      confidence: 0,
    };
  }
  
  const currentPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  
  // Calculate returns
  const returns = calculateReturns(prices);
  const stats = varianceWelford(Array.from(returns));
  
  // Basic metrics
  const totalReturn = (currentPrice - firstPrice) / firstPrice;
  const years = prices.length / TRADING_DAYS;
  const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;
  const volatility = stats.stdDev * SQRT_252;
  const sr = sharpeRatio(returns);
  const mdd = maxDrawdown(prices);
  const rsiValue = rsi(prices, 14);
  
  // Generate signal
  const { signal, confidence } = generateSignal(sr, rsiValue, volatility, stats.mean, Array.from(returns));
  
  return {
    currentPrice,
    totalReturn: totalReturn * 100,
    annualizedReturn: annualizedReturn * 100,
    volatility: volatility * 100,
    sharpeRatio: sr,
    maxDrawdown: mdd * 100,
    rsi: rsiValue,
    signal,
    confidence,
  };
}

function generateSignal(
  sharpe: number,
  rsiValue: number,
  vol: number,
  _meanReturn: number, // Reserved for future use
  returns: number[]
): { signal: QuickMetrics['signal']; confidence: number } {
  let score = 0;
  
  // Sharpe factor (30%)
  if (sharpe > 2) score += 0.3;
  else if (sharpe > 1.5) score += 0.24;
  else if (sharpe > 1) score += 0.18;
  else if (sharpe > 0.5) score += 0.12;
  else if (sharpe > 0) score += 0.06;
  else score -= 0.15;
  
  // RSI factor (25%)
  if (rsiValue < 25) score += 0.2;
  else if (rsiValue < 35) score += 0.125;
  else if (rsiValue > 75) score -= 0.2;
  else if (rsiValue > 65) score -= 0.1;
  
  // Volatility factor (15%)
  if (vol < 0.15) score += 0.06;
  else if (vol < 0.25) score += 0.045;
  else if (vol > 0.4) score -= 0.075;
  
  // Momentum factor (20%)
  const recentReturns = returns.slice(-20);
  if (recentReturns.length >= 5) {
    const momentum = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    if (momentum > 0.01) score += 0.12;
    else if (momentum > 0.005) score += 0.06;
    else if (momentum < -0.005) score -= 0.08;
  }
  
  // Trend consistency (10%)
  const positiveCount = returns.filter(r => r > 0).length;
  const winRate = positiveCount / returns.length;
  score += (winRate - 0.5) * 0.2;
  
  // Determine signal
  let signal: QuickMetrics['signal'];
  if (score > 0.4) signal = 'STRONG BUY';
  else if (score > 0.2) signal = 'BUY';
  else if (score > -0.2) signal = 'HOLD';
  else if (score > -0.4) signal = 'SELL';
  else signal = 'STRONG SELL';
  
  const confidence = Math.min(95, Math.max(10, (Math.abs(score) + 0.2) * 100));
  
  return { signal, confidence };
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Batch analyze multiple symbols (uses parallel processing where available)
 */
export async function batchAnalysis(
  pricesMap: Map<string, number[]>
): Promise<Map<string, QuickMetrics>> {
  const results = new Map<string, QuickMetrics>();
  
  // Process in chunks for better memory efficiency
  const entries = Array.from(pricesMap.entries());
  const chunkSize = 10;
  
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    
    // Process chunk
    for (const [symbol, prices] of chunk) {
      results.set(symbol, quickAnalysis(prices));
    }
    
    // Yield to event loop to prevent blocking
    if (i + chunkSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return results;
}
