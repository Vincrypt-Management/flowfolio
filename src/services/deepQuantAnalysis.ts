/**
 * Enhanced Quantitative Analysis Service
 * Provides deep statistical analysis, risk metrics, and portfolio optimization
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const TRADING_DAYS = 252;
const SQRT_252 = Math.sqrt(252);
const RISK_FREE_RATE = 0.045; // 4.5%

// ============================================================================
// CORE STATISTICAL FUNCTIONS (OPTIMIZED)
// ============================================================================

/**
 * Welford's online algorithm for variance - numerically stable single pass
 */
export function welfordStats(data: number[]): { mean: number; variance: number; stdDev: number } {
  if (data.length === 0) return { mean: 0, variance: 0, stdDev: 0 };
  
  let n = 0;
  let mean = 0;
  let m2 = 0;
  
  for (const x of data) {
    if (!isFinite(x)) continue;
    n++;
    const delta = x - mean;
    mean += delta / n;
    const delta2 = x - mean;
    m2 += delta * delta2;
  }
  
  if (n < 2) return { mean, variance: 0, stdDev: 0 };
  
  const variance = m2 / (n - 1);
  return { mean, variance, stdDev: Math.sqrt(variance) };
}

/**
 * Calculate returns from prices
 */
export function calculateReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

/**
 * Calculate log returns (more stable for compounding)
 */
export function calculateLogReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

// ============================================================================
// RISK-ADJUSTED RETURN METRICS
// ============================================================================

/**
 * Sharpe Ratio - Risk-adjusted return measure
 */
export function sharpeRatio(returns: number[], riskFreeRate = RISK_FREE_RATE): number {
  if (returns.length === 0) return 0;
  
  const stats = welfordStats(returns);
  if (stats.stdDev === 0) return 0;
  
  const annualizedReturn = stats.mean * TRADING_DAYS;
  const annualizedVol = stats.stdDev * SQRT_252;
  
  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

/**
 * Sortino Ratio - Uses downside deviation only
 */
export function sortinoRatio(returns: number[], riskFreeRate = RISK_FREE_RATE, targetReturn = 0): number {
  if (returns.length === 0) return 0;
  
  const stats = welfordStats(returns);
  const annualizedReturn = stats.mean * TRADING_DAYS;
  
  // Calculate downside deviation
  const downsideReturns = returns.filter(r => r < targetReturn);
  if (downsideReturns.length === 0) return annualizedReturn > riskFreeRate ? Infinity : 0;
  
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r - targetReturn, 2), 0) / downsideReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance) * SQRT_252;
  
  if (downsideDeviation === 0) return 0;
  
  return (annualizedReturn - riskFreeRate) / downsideDeviation;
}

/**
 * Calmar Ratio - Return / Max Drawdown
 */
export function calmarRatio(prices: number[]): number {
  const returns = calculateReturns(prices);
  if (returns.length === 0) return 0;
  
  const stats = welfordStats(returns);
  const annualizedReturn = stats.mean * TRADING_DAYS;
  const mdd = maxDrawdown(prices);
  
  if (mdd === 0) return 0;
  
  return annualizedReturn / Math.abs(mdd);
}

/**
 * Treynor Ratio - Excess return per unit of systematic risk
 */
export function treynorRatio(returns: number[], marketReturns: number[], riskFreeRate = RISK_FREE_RATE): number {
  if (returns.length === 0 || marketReturns.length === 0) return 0;
  
  const beta = calculateBeta(returns, marketReturns);
  if (beta === 0) return 0;
  
  const stats = welfordStats(returns);
  const annualizedReturn = stats.mean * TRADING_DAYS;
  
  return (annualizedReturn - riskFreeRate) / beta;
}

/**
 * Information Ratio - Active return / Tracking error
 */
export function informationRatio(returns: number[], benchmarkReturns: number[]): number {
  if (returns.length === 0 || benchmarkReturns.length === 0) return 0;
  
  const n = Math.min(returns.length, benchmarkReturns.length);
  const activeReturns = returns.slice(0, n).map((r, i) => r - benchmarkReturns[i]);
  
  const stats = welfordStats(activeReturns);
  if (stats.stdDev === 0) return 0;
  
  const annualizedActiveReturn = stats.mean * TRADING_DAYS;
  const annualizedTrackingError = stats.stdDev * SQRT_252;
  
  return annualizedActiveReturn / annualizedTrackingError;
}

// ============================================================================
// RISK METRICS
// ============================================================================

/**
 * Maximum Drawdown - Largest peak-to-trough decline
 */
export function maxDrawdown(prices: number[]): number {
  if (prices.length === 0) return 0;
  
  let peak = prices[0];
  let maxDD = 0;
  
  for (const price of prices) {
    if (price > peak) peak = price;
    const dd = (price - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  
  return maxDD;
}

/**
 * Drawdown series for charting
 */
export function drawdownSeries(prices: number[]): number[] {
  if (prices.length === 0) return [];
  
  const drawdowns: number[] = [];
  let peak = prices[0];
  
  for (const price of prices) {
    if (price > peak) peak = price;
    drawdowns.push(((price - peak) / peak) * 100);
  }
  
  return drawdowns;
}

/**
 * Value at Risk (VaR) - Historical simulation method
 */
export function valueAtRisk(returns: number[], confidenceLevel = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (1 - confidenceLevel));
  
  return Math.abs(sorted[index]) * SQRT_252 * 100; // Annualized percentage
}

/**
 * Conditional VaR (Expected Shortfall) - Average loss beyond VaR
 */
export function conditionalVaR(returns: number[], confidenceLevel = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sorted.length * (1 - confidenceLevel));
  
  if (cutoffIndex === 0) return Math.abs(sorted[0]) * SQRT_252 * 100;
  
  let sum = 0;
  for (let i = 0; i <= cutoffIndex; i++) {
    sum += sorted[i];
  }
  
  return Math.abs(sum / (cutoffIndex + 1)) * SQRT_252 * 100;
}

/**
 * Beta - Systematic risk measure
 */
export function calculateBeta(returns: number[], marketReturns: number[]): number {
  const n = Math.min(returns.length, marketReturns.length);
  if (n < 2) return 1;
  
  const assetStats = welfordStats(returns.slice(0, n));
  const marketStats = welfordStats(marketReturns.slice(0, n));
  
  if (marketStats.variance === 0) return 1;
  
  // Calculate covariance
  const assetMean = assetStats.mean;
  const marketMean = marketStats.mean;
  
  let covariance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (returns[i] - assetMean) * (marketReturns[i] - marketMean);
  }
  covariance /= (n - 1);
  
  return covariance / marketStats.variance;
}

/**
 * Alpha - Jensen's Alpha (excess return over CAPM)
 */
export function calculateAlpha(returns: number[], marketReturns: number[], riskFreeRate = RISK_FREE_RATE): number {
  const beta = calculateBeta(returns, marketReturns);
  const assetStats = welfordStats(returns);
  const marketStats = welfordStats(marketReturns);
  
  const annualizedReturn = assetStats.mean * TRADING_DAYS;
  const annualizedMarketReturn = marketStats.mean * TRADING_DAYS;
  
  // CAPM expected return
  const expectedReturn = riskFreeRate + beta * (annualizedMarketReturn - riskFreeRate);
  
  return (annualizedReturn - expectedReturn) * 100; // Percentage
}

// ============================================================================
// HIGHER-ORDER STATISTICS
// ============================================================================

/**
 * Skewness - Measure of asymmetry
 */
export function skewness(data: number[]): number {
  if (data.length < 3) return 0;
  
  const stats = welfordStats(data);
  if (stats.stdDev === 0) return 0;
  
  const n = data.length;
  let sum = 0;
  
  for (const x of data) {
    sum += Math.pow((x - stats.mean) / stats.stdDev, 3);
  }
  
  // Sample skewness with correction factor
  return (n * sum) / ((n - 1) * (n - 2));
}

/**
 * Kurtosis - Measure of tail heaviness (excess kurtosis, normal = 0)
 */
export function kurtosis(data: number[]): number {
  if (data.length < 4) return 0;
  
  const stats = welfordStats(data);
  if (stats.stdDev === 0) return 0;
  
  const n = data.length;
  let sum = 0;
  
  for (const x of data) {
    sum += Math.pow((x - stats.mean) / stats.stdDev, 4);
  }
  
  // Excess kurtosis with correction factors
  const excess = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum;
  const correction = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  
  return excess - correction;
}

/**
 * Jarque-Bera test statistic for normality
 */
export function jarqueBera(data: number[]): { statistic: number; isNormal: boolean } {
  const n = data.length;
  const s = skewness(data);
  const k = kurtosis(data);
  
  const statistic = (n / 6) * (Math.pow(s, 2) + Math.pow(k, 2) / 4);
  
  // At 95% confidence, critical value is ~5.99
  return { statistic, isNormal: statistic < 5.99 };
}

// ============================================================================
// CORRELATION ANALYSIS
// ============================================================================

/**
 * Pearson correlation coefficient
 */
export function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  const xStats = welfordStats(x.slice(0, n));
  const yStats = welfordStats(y.slice(0, n));
  
  if (xStats.stdDev === 0 || yStats.stdDev === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - xStats.mean) * (y[i] - yStats.mean);
  }
  
  const covariance = sum / (n - 1);
  return covariance / (xStats.stdDev * yStats.stdDev);
}

/**
 * Full correlation matrix
 */
export function correlationMatrix(returnsData: number[][]): number[][] {
  const n = returnsData.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const corr = correlation(returnsData[i], returnsData[j]);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }
  
  return matrix;
}

/**
 * Covariance matrix
 */
export function covarianceMatrix(returnsData: number[][]): number[][] {
  const n = returnsData.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  const means = returnsData.map(r => welfordStats(r).mean);
  
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const len = Math.min(returnsData[i].length, returnsData[j].length);
      let sum = 0;
      
      for (let k = 0; k < len; k++) {
        sum += (returnsData[i][k] - means[i]) * (returnsData[j][k] - means[j]);
      }
      
      const cov = len > 1 ? sum / (len - 1) : 0;
      matrix[i][j] = cov;
      matrix[j][i] = cov;
    }
  }
  
  return matrix;
}

// ============================================================================
// TECHNICAL INDICATORS
// ============================================================================

/**
 * Relative Strength Index (RSI) with Wilder's smoothing
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
  const alpha = 1 / period;
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = avgGain * (1 - alpha) + change * alpha;
      avgLoss = avgLoss * (1 - alpha);
    } else {
      avgGain = avgGain * (1 - alpha);
      avgLoss = avgLoss * (1 - alpha) - change * alpha;
    }
  }
  
  if (avgLoss < 1e-10) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * MACD - Moving Average Convergence Divergence
 */
export function macd(prices: number[], fast = 12, slow = 26, signal = 9): {
  macd: number;
  signal: number;
  histogram: number;
  line: number[];
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
    line: macdLine,
  };
}

/**
 * Exponential Moving Average
 */
export function ema(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  
  const result: number[] = new Array(data.length);
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
 * Simple Moving Average
 */
export function sma(data: number[], period: number): number[] {
  if (data.length < period) return [];
  
  const result: number[] = new Array(data.length - period + 1);
  let sum = 0;
  
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[0] = sum / period;
  
  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period] + data[i];
    result[i - period + 1] = sum / period;
  }
  
  return result;
}

/**
 * Bollinger Bands
 */
export function bollingerBands(prices: number[], period = 20, stdDevMultiplier = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number;
  percentB: number;
} {
  const middle = sma(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const stats = welfordStats(slice);
    upper.push(middle[i - period + 1] + stdDevMultiplier * stats.stdDev);
    lower.push(middle[i - period + 1] - stdDevMultiplier * stats.stdDev);
  }
  
  const lastUpper = upper[upper.length - 1] || 0;
  const lastLower = lower[lower.length - 1] || 0;
  const lastMiddle = middle[middle.length - 1] || 0;
  const lastPrice = prices[prices.length - 1];
  
  const bandwidth = lastMiddle > 0 ? ((lastUpper - lastLower) / lastMiddle) * 100 : 0;
  const percentB = (lastUpper - lastLower) > 0 
    ? ((lastPrice - lastLower) / (lastUpper - lastLower)) * 100 
    : 50;
  
  return { upper, middle, lower, bandwidth, percentB };
}

/**
 * Average True Range (ATR)
 */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
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
  
  // Wilder's smoothing
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
 * Portfolio variance given weights and covariance matrix
 */
export function portfolioVariance(weights: number[], covMatrix: number[][]): number {
  const n = weights.length;
  let variance = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  
  return variance;
}

/**
 * Portfolio expected return
 */
export function portfolioReturn(weights: number[], returns: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * returns[i], 0);
}

/**
 * Portfolio Sharpe ratio
 */
export function portfolioSharpe(
  weights: number[], 
  returns: number[], 
  covMatrix: number[][], 
  riskFreeRate = RISK_FREE_RATE
): number {
  const portReturn = portfolioReturn(weights, returns) * TRADING_DAYS;
  const portVolatility = Math.sqrt(portfolioVariance(weights, covMatrix)) * SQRT_252;
  
  if (portVolatility === 0) return 0;
  return (portReturn - riskFreeRate) / portVolatility;
}

/**
 * Diversification ratio
 */
export function diversificationRatio(weights: number[], volatilities: number[], covMatrix: number[][]): number {
  const weightedVol = weights.reduce((sum, w, i) => sum + w * volatilities[i], 0);
  const portVol = Math.sqrt(portfolioVariance(weights, covMatrix));
  
  if (portVol === 0) return 1;
  return weightedVol / portVol;
}

// ============================================================================
// COMPREHENSIVE ANALYSIS
// ============================================================================

export interface DeepQuantMetrics {
  // Basic metrics
  symbol: string;
  currentPrice: number;
  
  // Returns
  totalReturn: number;
  annualizedReturn: number;
  dailyReturns: number[];
  
  // Volatility
  volatility: number;
  annualizedVolatility: number;
  downsideVolatility: number;
  
  // Risk-adjusted returns
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  treynorRatio: number;
  informationRatio: number;
  
  // Risk metrics
  maxDrawdown: number;
  drawdownSeries: number[];
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  
  // CAPM metrics
  beta: number;
  alpha: number;
  rsquared: number;
  
  // Distribution metrics
  skewness: number;
  kurtosis: number;
  isNormallyDistributed: boolean;
  
  // Technical indicators
  rsi: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
  };
  
  // Signal
  signal: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  confidence: number;
}

/**
 * Generate comprehensive quantitative analysis
 */
export function deepAnalysis(
  symbol: string,
  prices: number[],
  marketPrices?: number[]
): DeepQuantMetrics {
  // Defaults for insufficient data
  if (prices.length < 30) {
    return getDefaultMetrics(symbol, prices[prices.length - 1] || 0);
  }
  
  // Calculate returns
  const returns = calculateReturns(prices);
  // Log returns available for advanced calculations if needed
  void calculateLogReturns(prices);
  
  // Use S&P 500 simulation if no market data
  const mktReturns = marketPrices 
    ? calculateReturns(marketPrices) 
    : returns.map(r => r * 0.7 + (Math.random() - 0.5) * 0.01);
  
  const stats = welfordStats(returns);
  const currentPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  
  // Returns
  const totalReturn = ((currentPrice - firstPrice) / firstPrice) * 100;
  const years = prices.length / TRADING_DAYS;
  const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
  
  // Volatility
  const volatility = stats.stdDev * 100;
  const annualizedVolatility = volatility * SQRT_252;
  
  // Downside volatility
  const downsideReturns = returns.filter(r => r < 0);
  const downsideStats = welfordStats(downsideReturns);
  const downsideVolatility = downsideStats.stdDev * SQRT_252 * 100;
  
  // Risk-adjusted returns
  const sharpe = sharpeRatio(returns);
  const sortino = sortinoRatio(returns);
  const calmar = calmarRatio(prices);
  const treynor = treynorRatio(returns, mktReturns);
  const infoRatio = informationRatio(returns, mktReturns);
  
  // Risk metrics
  const mdd = maxDrawdown(prices) * 100;
  const ddSeries = drawdownSeries(prices);
  const var95 = valueAtRisk(returns, 0.95);
  const var99 = valueAtRisk(returns, 0.99);
  const cvar95 = conditionalVaR(returns, 0.95);
  const cvar99 = conditionalVaR(returns, 0.99);
  
  // CAPM metrics
  const beta = calculateBeta(returns, mktReturns);
  const alpha = calculateAlpha(returns, mktReturns);
  const rsq = Math.pow(correlation(returns, mktReturns), 2) * 100;
  
  // Distribution
  const skew = skewness(returns);
  const kurt = kurtosis(returns);
  const jbTest = jarqueBera(returns);
  
  // Technical indicators
  const rsiValue = rsi(prices);
  const macdResult = macd(prices);
  const bbands = bollingerBands(prices);
  
  // Generate signal
  const { signal, confidence } = generateSignal(
    sharpe, sortino, rsiValue, mdd, beta, skew, annualizedReturn
  );
  
  return {
    symbol,
    currentPrice,
    totalReturn,
    annualizedReturn,
    dailyReturns: returns,
    volatility,
    annualizedVolatility,
    downsideVolatility,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    treynorRatio: treynor,
    informationRatio: infoRatio,
    maxDrawdown: mdd,
    drawdownSeries: ddSeries,
    var95,
    var99,
    cvar95,
    cvar99,
    beta,
    alpha,
    rsquared: rsq,
    skewness: skew,
    kurtosis: kurt,
    isNormallyDistributed: jbTest.isNormal,
    rsi: rsiValue,
    macd: {
      value: macdResult.macd,
      signal: macdResult.signal,
      histogram: macdResult.histogram,
    },
    bollingerBands: {
      upper: bbands.upper[bbands.upper.length - 1] || currentPrice,
      middle: bbands.middle[bbands.middle.length - 1] || currentPrice,
      lower: bbands.lower[bbands.lower.length - 1] || currentPrice,
      bandwidth: bbands.bandwidth,
      percentB: bbands.percentB,
    },
    signal,
    confidence,
  };
}

function generateSignal(
  sharpe: number,
  sortino: number,
  rsiValue: number,
  maxDrawdown: number,
  beta: number,
  _skew: number,
  annReturn: number
): { signal: DeepQuantMetrics['signal']; confidence: number } {
  let score = 0;
  
  // Sharpe (30%)
  if (sharpe > 2) score += 30;
  else if (sharpe > 1.5) score += 24;
  else if (sharpe > 1) score += 18;
  else if (sharpe > 0.5) score += 12;
  else if (sharpe > 0) score += 6;
  else score -= 15;
  
  // Sortino (20%)
  if (sortino > 2.5) score += 20;
  else if (sortino > 1.5) score += 14;
  else if (sortino > 1) score += 10;
  else if (sortino > 0) score += 5;
  else score -= 10;
  
  // RSI (20%)
  if (rsiValue < 25) score += 20; // Oversold
  else if (rsiValue < 35) score += 12;
  else if (rsiValue < 50) score += 5;
  else if (rsiValue > 75) score -= 15; // Overbought
  else if (rsiValue > 65) score -= 8;
  
  // Max Drawdown (15%)
  if (Math.abs(maxDrawdown) < 10) score += 15;
  else if (Math.abs(maxDrawdown) < 20) score += 10;
  else if (Math.abs(maxDrawdown) < 30) score += 5;
  else score -= 10;
  
  // Return (10%)
  if (annReturn > 20) score += 10;
  else if (annReturn > 10) score += 7;
  else if (annReturn > 0) score += 3;
  else score -= 5;
  
  // Beta risk (5%)
  if (beta < 0.8) score += 5;
  else if (beta < 1.2) score += 3;
  else score -= 3;
  
  // Determine signal
  let signal: DeepQuantMetrics['signal'];
  if (score >= 70) signal = 'STRONG BUY';
  else if (score >= 45) signal = 'BUY';
  else if (score >= 20) signal = 'HOLD';
  else if (score >= -10) signal = 'SELL';
  else signal = 'STRONG SELL';
  
  const confidence = Math.min(95, Math.max(15, score + 30));
  
  return { signal, confidence };
}

function getDefaultMetrics(symbol: string, price: number): DeepQuantMetrics {
  return {
    symbol,
    currentPrice: price,
    totalReturn: 0,
    annualizedReturn: 0,
    dailyReturns: [],
    volatility: 0,
    annualizedVolatility: 0,
    downsideVolatility: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    treynorRatio: 0,
    informationRatio: 0,
    maxDrawdown: 0,
    drawdownSeries: [],
    var95: 0,
    var99: 0,
    cvar95: 0,
    cvar99: 0,
    beta: 1,
    alpha: 0,
    rsquared: 0,
    skewness: 0,
    kurtosis: 0,
    isNormallyDistributed: true,
    rsi: 50,
    macd: { value: 0, signal: 0, histogram: 0 },
    bollingerBands: { upper: price, middle: price, lower: price, bandwidth: 0, percentB: 50 },
    signal: 'HOLD',
    confidence: 50,
  };
}

// Export all functions
export const quantService = {
  // Statistics
  welfordStats,
  calculateReturns,
  calculateLogReturns,
  
  // Risk-adjusted returns
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
  treynorRatio,
  informationRatio,
  
  // Risk metrics
  maxDrawdown,
  drawdownSeries,
  valueAtRisk,
  conditionalVaR,
  calculateBeta,
  calculateAlpha,
  
  // Distribution
  skewness,
  kurtosis,
  jarqueBera,
  
  // Correlation
  correlation,
  correlationMatrix,
  covarianceMatrix,
  
  // Technical
  rsi,
  macd,
  ema,
  sma,
  bollingerBands,
  atr,
  
  // Portfolio
  portfolioVariance,
  portfolioReturn,
  portfolioSharpe,
  diversificationRatio,
  
  // Comprehensive
  deepAnalysis,
};
