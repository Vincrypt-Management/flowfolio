# Quantitative Analysis Module

## Date: December 27, 2025

### 🧮 Mathematical & Statistical Portfolio Analysis

---

## Overview

A comprehensive quantitative analysis system implementing modern financial mathematics, statistical analysis, and technical indicators **without AI/LLM dependency**. Pure TypeScript implementation for real-time portfolio analysis.

---

## 1. Statistical Analysis

### **Descriptive Statistics**

```typescript
interface StatisticalMetrics {
  mean: number;              // Average value
  median: number;            // Middle value
  stdDev: number;            // Standard deviation
  variance: number;          // Variance (risk measure)
  skewness: number;          // Distribution asymmetry
  kurtosis: number;          // Distribution tail weight
  min: number;               // Minimum value
  max: number;               // Maximum value
  range: number;             // Max - Min
}
```

### **Correlation & Covariance**
- Pearson correlation coefficient
- Covariance matrix calculation
- Portfolio diversification analysis

### **Use Cases:**
- Understand return distributions
- Identify asymmetric risks (skewness)
- Detect fat-tail events (kurtosis)
- Measure asset relationships

---

## 2. Returns Analysis

### **Metrics Calculated**

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Annualized Return** | `(1 + total_return)^(1/years) - 1` | Expected yearly gain |
| **Annualized Volatility** | `stdDev * √252` | Risk measure (252 trading days) |
| **Sharpe Ratio** | `(Return - RFR) / Volatility` | Risk-adjusted return |
| **Sortino Ratio** | `(Return - RFR) / Downside Deviation` | Downside risk focus |
| **Max Drawdown** | `Max peak-to-trough decline` | Worst loss scenario |
| **Calmar Ratio** | `Return / |Max Drawdown|` | Return per unit drawdown |
| **Information Ratio** | `(Return - Benchmark) / Tracking Error` | Active return efficiency |

### **Risk-Free Rate**
- Default: 4.5% (current T-Bill rates)
- Adjustable for different market conditions

### **Key Features:**
- Geometric mean for compound returns
- Separate tracking of downside volatility
- Drawdown analysis with peak tracking
- Benchmark comparison (default: 10% S&P 500)

---

## 3. Technical Indicators

### **Trend Indicators**

#### **Simple Moving Averages (SMA)**
- **SMA20**: 20-day moving average (short-term)
- **SMA50**: 50-day moving average (medium-term)
- **SMA200**: 200-day moving average (long-term)

**Signals:**
- Price > SMA20 > SMA50 → Bullish trend
- Price < SMA20 < SMA50 → Bearish trend

#### **Exponential Moving Averages (EMA)**
- **EMA12**: Fast EMA for MACD
- **EMA26**: Slow EMA for MACD
- More responsive to recent price changes

### **Momentum Indicators**

#### **MACD (Moving Average Convergence Divergence)**
```
MACD Line = EMA12 - EMA26
Signal Line = EMA9 of MACD
Histogram = MACD - Signal
```

**Signals:**
- MACD > Signal → Bullish momentum
- MACD < Signal → Bearish momentum
- Histogram expanding → Strengthening trend

#### **RSI (Relative Strength Index)**
```
RSI = 100 - (100 / (1 + RS))
RS = Average Gain / Average Loss
```

**Zones:**
- RSI < 30 → Oversold (potential buy)
- RSI > 70 → Overbought (potential sell)
- RSI 30-70 → Neutral zone

### **Volatility Indicators**

#### **Bollinger Bands**
```
Middle Band = SMA20
Upper Band = Middle + (2 * StdDev)
Lower Band = Middle - (2 * StdDev)
```

**Signals:**
- Price near lower band → Potentially oversold
- Price near upper band → Potentially overbought
- Band squeeze → Low volatility (breakout coming)
- Band expansion → High volatility

#### **ATR (Average True Range)**
```
True Range = max(
  High - Low,
  |High - Previous Close|,
  |Low - Previous Close|
)
ATR = Average of True Range over period
```

**Use:** Stop-loss placement, position sizing

### **Volume Indicators**

#### **OBV (On-Balance Volume)**
```
If Close > Previous Close: OBV += Volume
If Close < Previous Close: OBV -= Volume
```

**Signals:**
- Rising OBV + Rising Price → Bullish confirmation
- Falling OBV + Rising Price → Bearish divergence

### **Oscillators**

#### **Williams %R**
```
%R = (Highest High - Close) / (Highest High - Lowest Low) * -100
```

**Zones:**
- %R < -80 → Oversold
- %R > -20 → Overbought

#### **Stochastic Oscillator**
```
%K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
%D = SMA3 of %K
```

**Signals:**
- %K crosses above %D → Bullish
- %K crosses below %D → Bearish

---

## 4. Portfolio Optimization

### **Modern Portfolio Theory (MPT)**

#### **Expected Return**
```
E(Rp) = Σ (wi * E(Ri))
```
Where:
- wi = weight of asset i
- E(Ri) = expected return of asset i

#### **Portfolio Variance**
```
σ²p = Σ Σ (wi * wj * Cov(Ri, Rj))
```

#### **Sharpe Ratio Maximization**
```
max: (E(Rp) - Rf) / σp
```

### **Diversification Metrics**

#### **Diversification Ratio**
```
DR = (Σ wi * σi) / σp
```

Higher DR = Better diversification

#### **Correlation Matrix**
- Measures pairwise asset correlations
- Identifies redundant holdings
- Optimizes true diversification

### **Risk Measures**

#### **Conditional Value at Risk (CVaR)**
- Also known as Expected Shortfall
- 95% confidence level
- Average loss in worst 5% scenarios
- More conservative than VaR

#### **Beta**
```
β = Cov(Rp, Rm) / Var(Rm)
```

**Interpretation:**
- β > 1: More volatile than market
- β = 1: Moves with market
- β < 1: Less volatile than market

---

## 5. Monte Carlo Simulation

### **Geometric Brownian Motion (GBM)**

```
St+1 = St * exp(μΔt - 0.5σ²Δt + σε√Δt)
```

Where:
- St = price at time t
- μ = expected return (drift)
- σ = volatility
- ε = random shock (normal distribution)
- Δt = time step (1/252 for daily)

### **Box-Muller Transform**
```
Z = √(-2 * ln(U1)) * cos(2π * U2)
```

Converts uniform random to normal distribution

### **Simulation Outputs**

```typescript
interface MonteCarloResult {
  simulations: number[][];      // All paths
  percentiles: {
    p5: number;                  // Worst 5%
    p25: number;                 // Lower quartile
    p50: number;                 // Median
    p75: number;                 // Upper quartile
    p95: number;                 // Best 5%
  };
  probabilityOfLoss: number;     // P(Final < Initial)
  expectedValue: number;         // Mean final value
}
```

### **Default Configuration**
- Simulations: 1,000 paths
- Time horizon: Configurable periods
- Trading days: 252/year

---

## 6. Signal Generation

### **Multi-Factor Analysis**

#### **Factors Evaluated:**
1. **Trend** (40% weight)
   - Price vs SMA crossovers
   - SMA alignment

2. **Momentum** (30% weight)
   - MACD signals
   - Recent returns

3. **Oscillators** (20% weight)
   - RSI levels
   - Stochastic position

4. **Mean Reversion** (10% weight)
   - Bollinger Band position
   - Williams %R

### **Signal Aggregation**

```typescript
Bullish Score = Σ (Bullish Signals * Weights)
Confidence = max(Bullish Score, 1 - Bullish Score) * 100
```

### **Recommendations**

| Condition | Recommendation |
|-----------|---------------|
| Bullish Score > 0.65 & Sharpe > 0.5 | **BUY** |
| Bullish Score < 0.35 or Sharpe < 0 | **SELL** |
| Otherwise | **HOLD** |

### **Confidence Levels**
- **High (70-100%)**: Strong conviction
- **Medium (50-70%)**: Moderate conviction
- **Low (0-50%)**: Weak signal

---

## 7. Implementation Details

### **Algorithms & Complexity**

| Operation | Time Complexity | Space Complexity |
|-----------|----------------|------------------|
| SMA Calculation | O(n) | O(1) |
| EMA Calculation | O(n) | O(1) |
| RSI Calculation | O(n) | O(n) |
| Correlation Matrix | O(n²) | O(n²) |
| Portfolio Optimization | O(n²) | O(n²) |
| Monte Carlo (m paths, n periods) | O(m*n) | O(m*n) |

### **Memory Optimization**
- Streaming calculations where possible
- Minimal data copying
- Efficient array operations
- No redundant storage

### **Numerical Stability**
- Variance calculations use sum of squares
- Correlation bounded to [-1, 1]
- Division by zero checks
- NaN/Infinity handling

---

## 8. Usage Example

```typescript
import { quantAnalyzer } from './quantAnalysis';

// Analyze single asset
const report = quantAnalyzer.analyze('AAPL', historicalData);

console.log('Sharpe Ratio:', report.returnsAnalysis.sharpeRatio);
console.log('RSI:', report.technicalIndicators.rsi14);
console.log('Signal:', report.signals.recommendation);
console.log('Confidence:', report.signals.confidence);

// Optimize portfolio
const metrics = quantAnalyzer.optimizePortfolio(
  ['AAPL', 'MSFT', 'GOOGL'],
  returnsData
);

console.log('Expected Return:', metrics.expectedReturn);
console.log('Portfolio Beta:', metrics.beta);
console.log('Diversification:', metrics.diversificationRatio);

// Monte Carlo simulation
const simulation = quantAnalyzer.simulateMonteCarlo(
  10000,    // Initial value
  0.10,     // 10% expected return
  0.20,     // 20% volatility
  252       // 1 year
);

console.log('Expected Value:', simulation.expectedValue);
console.log('P(Loss):', simulation.probabilityOfLoss);
console.log('95th Percentile:', simulation.percentiles.p95);
```

---

## 9. UI Integration

### **Quantitative Metrics Table**

Displays per-asset analysis:

| Column | Description | Color Coding |
|--------|-------------|--------------|
| **Sharpe Ratio** | Risk-adjusted return | >1: Green, >0: Yellow, <0: Red |
| **Ann. Return** | Expected yearly return | >0: Green, <0: Red |
| **Volatility** | Annualized risk | <20%: Green, 20-30%: Yellow, >30%: Red |
| **Max Drawdown** | Worst decline | >-15%: Green, -15 to -30%: Yellow, <-30%: Red |
| **RSI** | Momentum indicator | <30: Blue (oversold), >70: Orange (overbought) |
| **Signal** | Buy/Hold/Sell | Color-coded badge |
| **Confidence** | Signal strength | Progress bar with gradient |

### **Visual Feedback**
- ✅ Green: Good metrics
- ⚠️ Yellow: Neutral/Warning
- ❌ Red: Poor metrics
- 🔵 Blue: Oversold opportunity
- 🟠 Orange: Overbought warning

---

## 10. Mathematical Foundations

### **Statistical Theory**
- **Central Limit Theorem**: Returns approximated as normal
- **Law of Large Numbers**: Averages converge to expectation
- **Brownian Motion**: Stochastic process for prices

### **Financial Theory**
- **Efficient Market Hypothesis**: Prices reflect information
- **Random Walk Theory**: Price changes unpredictable
- **Mean Reversion**: Oscillators return to average

### **Risk Management**
- **Value at Risk (VaR)**: Quantile-based risk
- **Expected Shortfall**: Tail risk measure
- **Drawdown Analysis**: Peak-to-trough risk

---

## 11. Advantages

### **vs. AI/ML Models:**
- ✅ Deterministic and explainable
- ✅ No training data required
- ✅ Real-time calculation
- ✅ No overfitting risk
- ✅ Transparent logic

### **vs. Simple Indicators:**
- ✅ Multi-factor analysis
- ✅ Statistical rigor
- ✅ Risk-adjusted metrics
- ✅ Portfolio-level optimization

---

## 12. Limitations & Considerations

### **Assumptions**
- Returns follow log-normal distribution
- Markets are reasonably efficient
- Historical patterns continue
- No transaction costs in calculations

### **Not Included**
- Fundamental analysis (P/E, revenue, etc.)
- Sentiment analysis
- News impact
- Regulatory events

### **Best Practices**
- Combine with fundamental analysis
- Use appropriate time horizons
- Consider transaction costs
- Rebalance based on thresholds
- Monitor correlations regularly

---

## 13. Future Enhancements

### **Short-term**
- [ ] Multi-asset correlation heatmaps
- [ ] Efficient frontier visualization
- [ ] Factor attribution analysis
- [ ] Scenario analysis tools

### **Medium-term**
- [ ] Black-Litterman model
- [ ] Risk parity allocation
- [ ] Dynamic rebalancing algorithms
- [ ] Tax-aware optimization

### **Long-term**
- [ ] Machine learning integration (optional)
- [ ] Alternative data sources
- [ ] High-frequency indicators
- [ ] Options pricing models

---

## Conclusion

The quantitative analysis module provides **institutional-grade** financial analysis using pure mathematical and statistical methods. It combines:

1. **Rigorous Statistics**: Mean, variance, skewness, kurtosis
2. **Modern Portfolio Theory**: Optimization, diversification
3. **Technical Analysis**: 10+ indicators
4. **Risk Management**: VaR, drawdown, volatility
5. **Simulation**: Monte Carlo forecasting

All calculations are **transparent, explainable**, and **real-time**, making it suitable for production use in professional portfolio management applications.

---

**Status**: ✅ Fully implemented and tested
**Performance**: O(n²) for correlation, O(n) for most indicators
**Build Size**: 650.91 kB (202.79 kB gzipped)
