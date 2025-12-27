import { HistoricalData } from './marketData';

/**
 * Advanced Quantitative Analysis Module
 * Pure mathematical and statistical analysis without AI/LLM
 * Implements modern portfolio theory, risk metrics, and technical indicators
 */

// ============================================================================
// STATISTICAL ANALYSIS
// ============================================================================

export interface StatisticalMetrics {
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  range: number;
}

export class Statistics {
  static calculateMetrics(data: number[]): StatisticalMetrics {
    // Filter out invalid values
    const validData = data.filter(x => !isNaN(x) && isFinite(x));
    
    if (validData.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        variance: 0,
        skewness: 0,
        kurtosis: 0,
        min: 0,
        max: 0,
        range: 0
      };
    }
    
    const sorted = [...validData].sort((a, b) => a - b);
    const n = validData.length;
    
    // Mean
    const mean = validData.reduce((a, b) => a + b, 0) / n;
    
    // Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
    
    // Variance and Standard Deviation
    const variance = validData.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    // Skewness (Fisher-Pearson coefficient)
    const skewness = stdDev > 0 
      ? validData.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 3), 0) / n
      : 0;
    
    // Kurtosis (excess kurtosis)
    const kurtosis = stdDev > 0
      ? (validData.reduce((sum, x) => sum + Math.pow((x - mean) / stdDev, 4), 0) / n) - 3
      : 0;
    
    return {
      mean: isFinite(mean) ? mean : 0,
      median: isFinite(median) ? median : 0,
      stdDev: isFinite(stdDev) ? stdDev : 0,
      variance: isFinite(variance) ? variance : 0,
      skewness: isFinite(skewness) ? skewness : 0,
      kurtosis: isFinite(kurtosis) ? kurtosis : 0,
      min: sorted[0] || 0,
      max: sorted[n - 1] || 0,
      range: (sorted[n - 1] - sorted[0]) || 0
    };
  }

  static correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    
    if (n === 0) return 0;
    
    const xMean = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const yMean = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let xSumSq = 0;
    let ySumSq = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = x[i] - xMean;
      const yDiff = y[i] - yMean;
      numerator += xDiff * yDiff;
      xSumSq += xDiff * xDiff;
      ySumSq += yDiff * yDiff;
    }
    
    const denominator = Math.sqrt(xSumSq * ySumSq);
    if (denominator === 0) return 0;
    
    const corr = numerator / denominator;
    return isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : 0;
  }

  static covariance(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const xMean = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const yMean = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
    
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (x[i] - xMean) * (y[i] - yMean);
    }
    
    return sum / (n - 1);
  }
}

// ============================================================================
// RETURNS CALCULATION
// ============================================================================

export interface ReturnsAnalysis {
  dailyReturns: number[];
  cumulativeReturns: number[];
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  informationRatio: number;
}

export class ReturnsCalculator {
  private static readonly TRADING_DAYS = 252;
  private static readonly RISK_FREE_RATE = 0.045; // 4.5% risk-free rate

  static calculateReturns(historicalData: HistoricalData[]): ReturnsAnalysis {
    if (!historicalData || historicalData.length < 2) {
      return {
        dailyReturns: [],
        cumulativeReturns: [],
        annualizedReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        informationRatio: 0
      };
    }
    
    const prices = historicalData.map(d => d.close).filter(p => !isNaN(p) && isFinite(p) && p > 0).reverse();
    
    if (prices.length < 2) {
      return {
        dailyReturns: [],
        cumulativeReturns: [],
        annualizedReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        informationRatio: 0
      };
    }
    
    // Calculate daily returns
    const dailyReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
      if (isFinite(ret)) {
        dailyReturns.push(ret);
      }
    }
    
    if (dailyReturns.length === 0) {
      return {
        dailyReturns: [],
        cumulativeReturns: [],
        annualizedReturn: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        calmarRatio: 0,
        informationRatio: 0
      };
    }
    
    // Calculate cumulative returns
    const cumulativeReturns: number[] = [0];
    let cumReturn = 1;
    for (const ret of dailyReturns) {
      cumReturn *= (1 + ret);
      cumulativeReturns.push(cumReturn - 1);
    }
    
    // Annualized return (geometric mean)
    const totalReturn = cumReturn - 1;
    const years = prices.length / this.TRADING_DAYS;
    const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;
    
    // Annualized volatility
    const returnStats = Statistics.calculateMetrics(dailyReturns);
    const annualizedVolatility = returnStats.stdDev * Math.sqrt(this.TRADING_DAYS);
    
    // Sharpe Ratio
    const excessReturn = annualizedReturn - this.RISK_FREE_RATE;
    const sharpeRatio = annualizedVolatility > 0 ? excessReturn / annualizedVolatility : 0;
    
    // Sortino Ratio (downside deviation)
    const downsideReturns = dailyReturns.filter(r => r < 0);
    const downsideDeviation = downsideReturns.length > 0
      ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length) * Math.sqrt(this.TRADING_DAYS)
      : annualizedVolatility;
    const sortinoRatio = downsideDeviation > 0 ? excessReturn / downsideDeviation : 0;
    
    // Maximum Drawdown
    const maxDrawdown = this.calculateMaxDrawdown(prices);
    
    // Calmar Ratio
    const calmarRatio = Math.abs(maxDrawdown) > 0.001 ? annualizedReturn / Math.abs(maxDrawdown) : 0;
    
    // Information Ratio (assuming benchmark return of 10%)
    const benchmarkReturn = 0.10;
    const trackingError = returnStats.stdDev * Math.sqrt(this.TRADING_DAYS);
    const informationRatio = trackingError > 0 ? (annualizedReturn - benchmarkReturn) / trackingError : 0;
    
    return {
      dailyReturns,
      cumulativeReturns,
      annualizedReturn: isFinite(annualizedReturn) ? annualizedReturn : 0,
      annualizedVolatility: isFinite(annualizedVolatility) ? annualizedVolatility : 0,
      sharpeRatio: isFinite(sharpeRatio) ? sharpeRatio : 0,
      sortinoRatio: isFinite(sortinoRatio) ? sortinoRatio : 0,
      maxDrawdown: isFinite(maxDrawdown) ? maxDrawdown : 0,
      calmarRatio: isFinite(calmarRatio) ? calmarRatio : 0,
      informationRatio: isFinite(informationRatio) ? informationRatio : 0
    };
  }

  private static calculateMaxDrawdown(prices: number[]): number {
    let maxDrawdown = 0;
    let peak = prices[0];
    
    for (const price of prices) {
      if (price > peak) {
        peak = price;
      }
      const drawdown = (price - peak) / peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }
}

// ============================================================================
// TECHNICAL INDICATORS
// ============================================================================

export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  rsi14: number;
  bollingerBands: { upper: number; middle: number; lower: number };
  atr14: number;
  obv: number;
  williamsR: number;
  stochastic: { k: number; d: number };
}

export class TechnicalAnalysis {
  static calculateIndicators(historicalData: HistoricalData[]): TechnicalIndicators {
    const closes = historicalData.map(d => d.close).reverse();
    const highs = historicalData.map(d => d.high).reverse();
    const lows = historicalData.map(d => d.low).reverse();
    const volumes = historicalData.map(d => d.volume).reverse();
    
    return {
      sma20: this.sma(closes, 20),
      sma50: this.sma(closes, 50),
      sma200: this.sma(closes, 200),
      ema12: this.ema(closes, 12),
      ema26: this.ema(closes, 26),
      ...this.macd(closes),
      rsi14: this.rsi(closes, 14),
      bollingerBands: this.bollingerBands(closes, 20, 2),
      atr14: this.atr(highs, lows, closes, 14),
      obv: this.obv(closes, volumes),
      williamsR: this.williamsR(highs, lows, closes, 14),
      stochastic: this.stochastic(highs, lows, closes, 14, 3)
    };
  }

  private static sma(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1] || 0;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private static ema(data: number[], period: number): number {
    if (data.length === 0) return 0;
    if (data.length < period) return data[data.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = this.sma(data.slice(0, period), period);
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  private static macd(data: number[]): { macd: number; macdSignal: number; macdHistogram: number } {
    const ema12 = this.ema(data, 12);
    const ema26 = this.ema(data, 26);
    const macd = ema12 - ema26;
    
    // Calculate MACD line values for signal
    const macdLine: number[] = [];
    for (let i = 26; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const e12 = this.ema(slice, 12);
      const e26 = this.ema(slice, 26);
      macdLine.push(e12 - e26);
    }
    
    const macdSignal = this.ema(macdLine, 9);
    const macdHistogram = macd - macdSignal;
    
    return { macd, macdSignal, macdHistogram };
  }

  private static rsi(data: number[], period: number): number {
    if (data.length < period + 1) return 50;
    
    const changes = [];
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }
    
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private static bollingerBands(data: number[], period: number, stdDevMultiplier: number): { upper: number; middle: number; lower: number } {
    const middle = this.sma(data, period);
    const slice = data.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: middle + (stdDevMultiplier * stdDev),
      middle,
      lower: middle - (stdDevMultiplier * stdDev)
    };
  }

  private static atr(highs: number[], lows: number[], closes: number[], period: number): number {
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
    
    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  private static obv(closes: number[], volumes: number[]): number {
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }
    return obv;
  }

  private static williamsR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period) return -50;
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const currentClose = closes[closes.length - 1];
    
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  private static stochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number): { k: number; d: number } {
    if (highs.length < kPeriod) return { k: 50, d: 50 };
    
    const recentHighs = highs.slice(-kPeriod);
    const recentLows = lows.slice(-kPeriod);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const currentClose = closes[closes.length - 1];
    
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    // Calculate %D (SMA of %K)
    const kValues: number[] = [];
    for (let i = closes.length - dPeriod; i < closes.length; i++) {
      if (i >= kPeriod - 1) {
        const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
        const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
        kValues.push(((closes[i] - l) / (h - l)) * 100);
      }
    }
    const d = kValues.length > 0 ? kValues.reduce((a, b) => a + b, 0) / kValues.length : k;
    
    return { k, d };
  }
}

// ============================================================================
// PORTFOLIO OPTIMIZATION
// ============================================================================

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  weights: Record<string, number>;
  correlationMatrix: number[][];
  diversificationRatio: number;
  conditionalVaR: number; // CVaR at 95%
  beta: number;
}

export class PortfolioOptimizer {
  static analyzePortfolio(
    symbols: string[],
    returnsData: Record<string, number[]>
  ): PortfolioMetrics {
    const n = symbols.length;
    
    // Calculate expected returns
    const expectedReturns: Record<string, number> = {};
    for (const symbol of symbols) {
      const returns = returnsData[symbol] || [];
      expectedReturns[symbol] = returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : 0;
    }
    
    // Calculate covariance matrix
    const covMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      covMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        const returns1 = returnsData[symbols[i]] || [];
        const returns2 = returnsData[symbols[j]] || [];
        covMatrix[i][j] = i === j 
          ? Statistics.calculateMetrics(returns1).variance
          : Statistics.covariance(returns1, returns2);
      }
    }
    
    // Calculate correlation matrix
    const correlationMatrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      correlationMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        const returns1 = returnsData[symbols[i]] || [];
        const returns2 = returnsData[symbols[j]] || [];
        correlationMatrix[i][j] = i === j ? 1 : Statistics.correlation(returns1, returns2);
      }
    }
    
    // Equal weight for baseline
    const weights: Record<string, number> = {};
    symbols.forEach(symbol => {
      weights[symbol] = 1 / n;
    });
    
    // Calculate portfolio metrics
    let portfolioReturn = 0;
    for (const symbol of symbols) {
      portfolioReturn += weights[symbol] * expectedReturns[symbol];
    }
    
    // Portfolio variance
    let portfolioVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portfolioVariance += weights[symbols[i]] * weights[symbols[j]] * covMatrix[i][j];
      }
    }
    const volatility = Math.sqrt(portfolioVariance) * Math.sqrt(252); // Annualized
    
    // Sharpe Ratio
    const riskFreeRate = 0.045;
    const annualizedReturn = portfolioReturn * 252;
    const sharpeRatio = (annualizedReturn - riskFreeRate) / volatility;
    
    // Diversification Ratio
    const weightedVolatilities = symbols.reduce((sum, symbol, i) => {
      const individualVol = Math.sqrt(covMatrix[i][i]) * Math.sqrt(252);
      return sum + weights[symbol] * individualVol;
    }, 0);
    const diversificationRatio = weightedVolatilities / volatility;
    
    // Conditional VaR (CVaR) at 95% confidence
    const allReturns = Object.values(returnsData).flat();
    const sortedReturns = allReturns.sort((a, b) => a - b);
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const conditionalVaR = sortedReturns.slice(0, varIndex).reduce((a, b) => a + b, 0) / varIndex;
    
    // Beta (assuming market returns are average of all symbols)
    const marketReturns = allReturns;
    const portfolioReturns = Object.values(returnsData)[0] || []; // Simplified
    const beta = Statistics.covariance(portfolioReturns, marketReturns) / 
                 Statistics.calculateMetrics(marketReturns).variance;
    
    return {
      expectedReturn: annualizedReturn,
      volatility,
      sharpeRatio,
      weights,
      correlationMatrix,
      diversificationRatio,
      conditionalVaR: conditionalVaR * Math.sqrt(252),
      beta: isNaN(beta) ? 1 : beta
    };
  }
}

// ============================================================================
// MONTE CARLO SIMULATION
// ============================================================================

export interface MonteCarloResult {
  simulations: number[][];
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  probabilityOfLoss: number;
  expectedValue: number;
}

export class MonteCarloSimulator {
  static simulate(
    initialValue: number,
    expectedReturn: number,
    volatility: number,
    periods: number,
    simulations: number = 1000
  ): MonteCarloResult {
    const results: number[][] = [];
    const finalValues: number[] = [];
    
    for (let sim = 0; sim < simulations; sim++) {
      const path = [initialValue];
      let value = initialValue;
      
      for (let period = 0; period < periods; period++) {
        // Geometric Brownian Motion
        const randomShock = this.normalRandom() * volatility / Math.sqrt(252);
        const drift = (expectedReturn / 252) - 0.5 * Math.pow(volatility / Math.sqrt(252), 2);
        value = value * Math.exp(drift + randomShock);
        path.push(value);
      }
      
      results.push(path);
      finalValues.push(path[path.length - 1]);
    }
    
    // Calculate percentiles
    const sorted = finalValues.sort((a, b) => a - b);
    const percentiles = {
      p5: sorted[Math.floor(simulations * 0.05)],
      p25: sorted[Math.floor(simulations * 0.25)],
      p50: sorted[Math.floor(simulations * 0.50)],
      p75: sorted[Math.floor(simulations * 0.75)],
      p95: sorted[Math.floor(simulations * 0.95)]
    };
    
    const probabilityOfLoss = finalValues.filter(v => v < initialValue).length / simulations;
    const expectedValue = finalValues.reduce((a, b) => a + b, 0) / simulations;
    
    return {
      simulations: results,
      percentiles,
      probabilityOfLoss,
      expectedValue
    };
  }

  private static normalRandom(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================================
// MAIN QUANTITATIVE ANALYZER
// ============================================================================

export interface QuantAnalysisReport {
  symbol: string;
  statisticalMetrics: StatisticalMetrics;
  returnsAnalysis: ReturnsAnalysis;
  technicalIndicators: TechnicalIndicators;
  signals: {
    trend: 'bullish' | 'bearish' | 'neutral';
    momentum: 'strong' | 'moderate' | 'weak';
    volatility: 'high' | 'medium' | 'low';
    recommendation: 'buy' | 'hold' | 'sell';
    confidence: number; // 0-100
  };
}

export class QuantitativeAnalyzer {
  static analyze(symbol: string, historicalData: HistoricalData[]): QuantAnalysisReport {
    const closes = historicalData.map(d => d.close).reverse();
    
    // Calculate metrics
    const statisticalMetrics = Statistics.calculateMetrics(closes);
    const returnsAnalysis = ReturnsCalculator.calculateReturns(historicalData);
    const technicalIndicators = TechnicalAnalysis.calculateIndicators(historicalData);
    
    // Generate signals
    const signals = this.generateSignals(technicalIndicators, returnsAnalysis, closes);
    
    return {
      symbol,
      statisticalMetrics,
      returnsAnalysis,
      technicalIndicators,
      signals
    };
  }

  private static generateSignals(
    tech: TechnicalIndicators,
    returns: ReturnsAnalysis,
    closes: number[]
  ): QuantAnalysisReport['signals'] {
    const currentPrice = closes[closes.length - 1];
    let bullishSignals = 0;
    let bearishSignals = 0;
    let totalSignals = 0;
    
    // Trend analysis (SMA crossovers)
    if (currentPrice > tech.sma20) bullishSignals++;
    else bearishSignals++;
    totalSignals++;
    
    if (tech.sma20 > tech.sma50) bullishSignals++;
    else bearishSignals++;
    totalSignals++;
    
    // MACD
    if (tech.macd > tech.macdSignal) bullishSignals++;
    else bearishSignals++;
    totalSignals++;
    
    // RSI
    if (tech.rsi14 < 30) bullishSignals += 2; // Oversold
    else if (tech.rsi14 > 70) bearishSignals += 2; // Overbought
    else if (tech.rsi14 > 50) bullishSignals++;
    else bearishSignals++;
    totalSignals += 2;
    
    // Bollinger Bands
    if (currentPrice < tech.bollingerBands.lower) bullishSignals++;
    else if (currentPrice > tech.bollingerBands.upper) bearishSignals++;
    totalSignals++;
    
    // Stochastic
    if (tech.stochastic.k < 20) bullishSignals++;
    else if (tech.stochastic.k > 80) bearishSignals++;
    totalSignals++;
    
    const bullishRatio = bullishSignals / totalSignals;
    const trend: 'bullish' | 'bearish' | 'neutral' =
      bullishRatio > 0.6 ? 'bullish' :
      bullishRatio < 0.4 ? 'bearish' : 'neutral';
    
    // Momentum (based on recent returns)
    const recentReturns = returns.dailyReturns.slice(-20);
    const momentum = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const momentumStrength: 'strong' | 'moderate' | 'weak' =
      Math.abs(momentum) > 0.01 ? 'strong' :
      Math.abs(momentum) > 0.005 ? 'moderate' : 'weak';
    
    // Volatility classification
    const volatility: 'high' | 'medium' | 'low' =
      returns.annualizedVolatility > 0.30 ? 'high' :
      returns.annualizedVolatility > 0.15 ? 'medium' : 'low';
    
    // Recommendation
    let recommendation: 'buy' | 'hold' | 'sell';
    if (bullishRatio > 0.65 && returns.sharpeRatio > 0.5) recommendation = 'buy';
    else if (bullishRatio < 0.35 || returns.sharpeRatio < 0) recommendation = 'sell';
    else recommendation = 'hold';
    
    // Confidence score
    const confidence = Math.round(Math.max(bullishRatio, 1 - bullishRatio) * 100);
    
    return {
      trend,
      momentum: momentumStrength,
      volatility,
      recommendation,
      confidence
    };
  }
}

export const quantAnalyzer = {
  analyze: (symbol: string, data: HistoricalData[]) => QuantitativeAnalyzer.analyze(symbol, data),
  optimizePortfolio: (symbols: string[], returnsData: Record<string, number[]>) => 
    PortfolioOptimizer.analyzePortfolio(symbols, returnsData),
  simulateMonteCarlo: (initialValue: number, expectedReturn: number, volatility: number, periods: number) =>
    MonteCarloSimulator.simulate(initialValue, expectedReturn, volatility, periods)
};
