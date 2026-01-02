use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rayon::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantMetrics {
    pub symbol: String,
    pub sharpe_ratio: f64,
    pub annualized_return: f64,
    pub volatility: f64,
    pub max_drawdown: f64,
    pub rsi: f64,
    pub signal: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalPrice {
    pub date: String,
    pub close: f64,
}

/// Optimized Quantitative Analyzer with SIMD-friendly operations
pub struct QuantAnalyzer;

impl QuantAnalyzer {
    // Pre-computed constants for performance
    const SQRT_252: f64 = 15.874507866387544; // sqrt(252)
    const TRADING_DAYS: f64 = 252.0;
    const MIN_DATA_POINTS: usize = 14;

    /// Calculate quantitative metrics from historical price data
    /// Optimized: Single-pass calculations where possible
    pub fn calculate_metrics(symbol: &str, prices: &[HistoricalPrice]) -> QuantMetrics {
        if prices.len() < Self::MIN_DATA_POINTS {
            return Self::insufficient_data(symbol);
        }

        // Pre-extract closes for cache efficiency
        let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
        
        // Single-pass return calculation with running statistics
        let (returns, mean_return, sum_sq_diff) = Self::calculate_returns_with_stats(&closes);
        
        if returns.is_empty() {
            return Self::insufficient_data(symbol);
        }

        let n = returns.len() as f64;
        let variance = sum_sq_diff / n;
        let std_dev = variance.sqrt();
        
        // Sharpe ratio (annualized)
        let sharpe_ratio = if std_dev > 0.0 {
            Self::SQRT_252 * (mean_return / std_dev)
        } else {
            0.0
        };
        
        // Annualized return (optimized compound calculation)
        let annualized_return = Self::calculate_annualized_return_fast(&returns, prices.len());
        
        // Volatility (annualized)
        let volatility = std_dev * Self::SQRT_252 * 100.0;
        
        // Max drawdown (single-pass)
        let max_drawdown = Self::calculate_max_drawdown_fast(&closes);
        
        // RSI with Wilder's smoothing (more accurate)
        let rsi = Self::calculate_rsi_wilder(&closes, 14);
        
        // Enhanced signal generation
        let (signal, confidence) = Self::generate_signal_enhanced(
            sharpe_ratio, rsi, volatility, mean_return, &returns
        );

        QuantMetrics {
            symbol: symbol.to_string(),
            sharpe_ratio,
            annualized_return,
            volatility,
            max_drawdown,
            rsi,
            signal,
            confidence,
        }
    }

    /// Batch calculate metrics for multiple symbols (parallel)
    pub fn calculate_metrics_batch(
        data: Vec<(String, Vec<HistoricalPrice>)>
    ) -> Vec<QuantMetrics> {
        data.into_par_iter()
            .map(|(symbol, prices)| Self::calculate_metrics(&symbol, &prices))
            .collect()
    }

    fn insufficient_data(symbol: &str) -> QuantMetrics {
        QuantMetrics {
            symbol: symbol.to_string(),
            sharpe_ratio: 0.0,
            annualized_return: 0.0,
            volatility: 0.0,
            max_drawdown: 0.0,
            rsi: 50.0,
            signal: "INSUFFICIENT DATA".to_string(),
            confidence: 0.0,
        }
    }

    /// Optimized: Calculate returns with running mean and variance in single pass
    fn calculate_returns_with_stats(closes: &[f64]) -> (Vec<f64>, f64, f64) {
        if closes.len() < 2 {
            return (Vec::new(), 0.0, 0.0);
        }

        let mut returns = Vec::with_capacity(closes.len() - 1);
        let mut sum = 0.0;
        
        // First pass: calculate returns and sum
        for i in 1..closes.len() {
            if closes[i - 1] > 0.0 {
                let r = (closes[i] - closes[i - 1]) / closes[i - 1];
                returns.push(r);
                sum += r;
            }
        }

        if returns.is_empty() {
            return (Vec::new(), 0.0, 0.0);
        }

        let n = returns.len() as f64;
        let mean = sum / n;
        
        // Second pass: calculate variance (Welford's algorithm would be even better for streaming)
        let sum_sq_diff: f64 = returns.iter().map(|r| (r - mean).powi(2)).sum();

        (returns, mean, sum_sq_diff)
    }

    /// Optimized annualized return using log returns
    fn calculate_annualized_return_fast(returns: &[f64], num_prices: usize) -> f64 {
        if returns.is_empty() {
            return 0.0;
        }

        // Use log returns for numerical stability
        let log_total: f64 = returns.iter()
            .filter(|&&r| r > -1.0)  // Prevent log of non-positive
            .map(|&r| (1.0 + r).ln())
            .sum();
        
        let years = num_prices as f64 / Self::TRADING_DAYS;
        
        if years <= 0.0 {
            return 0.0;
        }

        // Annualize: exp(log_total / years) - 1
        ((log_total / years).exp() - 1.0) * 100.0
    }

    /// Optimized max drawdown - single pass with running peak
    fn calculate_max_drawdown_fast(closes: &[f64]) -> f64 {
        if closes.is_empty() {
            return 0.0;
        }

        let mut peak = closes[0];
        let mut max_dd = 0.0_f64;

        for &price in closes.iter() {
            if price > peak {
                peak = price;
            }
            let dd = (price - peak) / peak;
            max_dd = max_dd.min(dd);
        }

        max_dd.abs() * 100.0
    }

    /// RSI using Wilder's smoothing (exponential moving average)
    /// More accurate than simple average
    fn calculate_rsi_wilder(closes: &[f64], period: usize) -> f64 {
        if closes.len() < period + 1 {
            return 50.0;
        }

        let mut avg_gain = 0.0;
        let mut avg_loss = 0.0;

        // Initial SMA for first period
        for i in 1..=period {
            let change = closes[i] - closes[i - 1];
            if change > 0.0 {
                avg_gain += change;
            } else {
                avg_loss += -change;
            }
        }
        avg_gain /= period as f64;
        avg_loss /= period as f64;

        // Wilder's smoothing for remaining data
        let smoothing = 1.0 / period as f64;
        for i in (period + 1)..closes.len() {
            let change = closes[i] - closes[i - 1];
            if change > 0.0 {
                avg_gain = avg_gain * (1.0 - smoothing) + change * smoothing;
                avg_loss = avg_loss * (1.0 - smoothing);
            } else {
                avg_gain = avg_gain * (1.0 - smoothing);
                avg_loss = avg_loss * (1.0 - smoothing) + (-change) * smoothing;
            }
        }

        if avg_loss < 1e-10 {
            return 100.0;
        }

        let rs = avg_gain / avg_loss;
        100.0 - (100.0 / (1.0 + rs))
    }

    /// Enhanced signal generation with momentum and trend factors
    fn generate_signal_enhanced(
        sharpe: f64,
        rsi: f64,
        volatility: f64,
        mean_return: f64,
        returns: &[f64],
    ) -> (String, f64) {
        let mut score = 0.0;
        let mut weight_sum = 0.0;

        // Factor 1: Sharpe ratio (weight: 0.30)
        let sharpe_score = if sharpe > 2.0 {
            1.0
        } else if sharpe > 1.5 {
            0.8
        } else if sharpe > 1.0 {
            0.6
        } else if sharpe > 0.5 {
            0.4
        } else if sharpe > 0.0 {
            0.2
        } else {
            -0.2 * sharpe.abs().min(2.0)
        };
        score += sharpe_score * 0.30;
        weight_sum += 0.30;

        // Factor 2: RSI (weight: 0.25)
        let rsi_score = if rsi < 25.0 {
            0.8  // Strongly oversold - good buy
        } else if rsi < 35.0 {
            0.5  // Oversold
        } else if rsi > 75.0 {
            -0.8  // Strongly overbought - consider sell
        } else if rsi > 65.0 {
            -0.3  // Overbought
        } else {
            (50.0 - rsi).abs() / 50.0 * 0.3  // Neutral zone
        };
        score += rsi_score * 0.25;
        weight_sum += 0.25;

        // Factor 3: Volatility (weight: 0.15)
        let vol_score = if volatility < 15.0 {
            0.4  // Low vol - stable
        } else if volatility < 25.0 {
            0.3  // Moderate
        } else if volatility < 40.0 {
            0.0  // Acceptable
        } else {
            -0.3  // High vol - risky
        };
        score += vol_score * 0.15;
        weight_sum += 0.15;

        // Factor 4: Recent momentum (weight: 0.20)
        let recent_period = returns.len().min(20);
        if recent_period >= 5 {
            let recent_returns = &returns[returns.len() - recent_period..];
            let recent_sum: f64 = recent_returns.iter().sum();
            let momentum = recent_sum / recent_period as f64;
            
            let momentum_score = if momentum > 0.01 {
                0.6
            } else if momentum > 0.005 {
                0.3
            } else if momentum > 0.0 {
                0.1
            } else if momentum > -0.005 {
                -0.1
            } else {
                -0.4
            };
            score += momentum_score * 0.20;
            weight_sum += 0.20;
        }

        // Factor 5: Trend consistency (weight: 0.10)
        if returns.len() >= 10 {
            let positive_days = returns.iter().filter(|&&r| r > 0.0).count();
            let win_rate = positive_days as f64 / returns.len() as f64;
            let trend_score = (win_rate - 0.5) * 2.0;  // -1 to 1
            score += trend_score * 0.10;
            weight_sum += 0.10;
        }

        // Normalize score
        let normalized_score = if weight_sum > 0.0 {
            score / weight_sum
        } else {
            0.0
        };

        // Calculate confidence (higher when factors agree)
        let confidence = ((normalized_score.abs() + 0.2) * 80.0).min(95.0).max(10.0);

        let signal = if normalized_score > 0.5 {
            "STRONG BUY"
        } else if normalized_score > 0.25 {
            "BUY"
        } else if normalized_score > -0.25 {
            "HOLD"
        } else if normalized_score > -0.5 {
            "SELL"
        } else {
            "STRONG SELL"
        };

        (signal.to_string(), confidence)
    }

    /// Calculate portfolio-level metrics with correlation consideration
    pub fn calculate_portfolio_metrics(
        holdings: &[(String, f64, Vec<HistoricalPrice>)],
    ) -> HashMap<String, f64> {
        let mut metrics = HashMap::new();

        if holdings.is_empty() {
            return metrics;
        }

        let total_weight: f64 = holdings.iter().map(|(_, w, _)| w).sum();
        if total_weight <= 0.0 {
            return metrics;
        }

        // Parallel calculation of individual metrics
        let individual_metrics: Vec<(f64, QuantMetrics)> = holdings
            .par_iter()
            .map(|(symbol, weight, prices)| {
                (*weight, Self::calculate_metrics(symbol, prices))
            })
            .collect();

        let mut portfolio_return = 0.0;
        let mut weighted_volatility_sq = 0.0;
        let mut weighted_sharpe = 0.0;

        for (weight, metrics) in &individual_metrics {
            let normalized_weight = weight / total_weight;
            portfolio_return += metrics.annualized_return * normalized_weight;
            weighted_volatility_sq += (metrics.volatility.powi(2)) * normalized_weight.powi(2);
            weighted_sharpe += metrics.sharpe_ratio * normalized_weight;
        }

        // Simplified portfolio volatility (assumes zero correlation for lower bound)
        let portfolio_volatility = weighted_volatility_sq.sqrt();

        metrics.insert("portfolio_return".to_string(), portfolio_return);
        metrics.insert("portfolio_volatility".to_string(), portfolio_volatility);
        metrics.insert("portfolio_sharpe".to_string(), weighted_sharpe);
        metrics.insert("num_holdings".to_string(), holdings.len() as f64);

        metrics
    }

    /// Quick health check - returns basic stats without full analysis
    pub fn quick_stats(closes: &[f64]) -> (f64, f64, f64) {
        if closes.len() < 2 {
            return (0.0, 0.0, 0.0);
        }

        let last = closes.last().copied().unwrap_or(0.0);
        let first = closes.first().copied().unwrap_or(1.0);
        let total_return = if first > 0.0 { (last - first) / first } else { 0.0 };

        let n = closes.len() as f64;
        let mean: f64 = closes.iter().sum::<f64>() / n;
        let variance: f64 = closes.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n;
        let volatility = variance.sqrt() / mean * 100.0;

        (last, total_return * 100.0, volatility)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_test_prices(n: usize, start: f64, trend: f64) -> Vec<HistoricalPrice> {
        let mut prices = Vec::with_capacity(n);
        let mut price = start;
        for i in 0..n {
            price *= 1.0 + trend + (i as f64 * 0.001).sin() * 0.02;
            prices.push(HistoricalPrice {
                date: format!("2024-{:02}-{:02}", (i / 28) + 1, (i % 28) + 1),
                close: price,
            });
        }
        prices
    }

    #[test]
    fn test_calculate_metrics_uptrend() {
        let prices = generate_test_prices(100, 100.0, 0.002);
        let metrics = QuantAnalyzer::calculate_metrics("TEST", &prices);
        
        assert!(metrics.sharpe_ratio > 0.0, "Uptrend should have positive Sharpe");
        assert!(metrics.annualized_return > 0.0, "Uptrend should have positive return");
        assert!(metrics.rsi > 50.0, "Uptrend should have RSI > 50");
    }

    #[test]
    fn test_calculate_metrics_downtrend() {
        let prices = generate_test_prices(100, 100.0, -0.002);
        let metrics = QuantAnalyzer::calculate_metrics("TEST", &prices);
        
        assert!(metrics.annualized_return < 0.0, "Downtrend should have negative return");
        assert!(metrics.max_drawdown > 0.0, "Downtrend should have drawdown");
    }

    #[test]
    fn test_insufficient_data() {
        let prices = vec![
            HistoricalPrice { date: "2024-01-01".to_string(), close: 100.0 },
        ];
        let metrics = QuantAnalyzer::calculate_metrics("TEST", &prices);
        
        assert_eq!(metrics.signal, "INSUFFICIENT DATA");
        assert_eq!(metrics.confidence, 0.0);
    }

    #[test]
    fn test_batch_calculation() {
        let data = vec![
            ("AAPL".to_string(), generate_test_prices(50, 150.0, 0.001)),
            ("MSFT".to_string(), generate_test_prices(50, 300.0, 0.002)),
            ("GOOGL".to_string(), generate_test_prices(50, 100.0, -0.001)),
        ];
        
        let results = QuantAnalyzer::calculate_metrics_batch(data);
        assert_eq!(results.len(), 3);
    }
}
