use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

pub struct QuantAnalyzer;

impl QuantAnalyzer {
    /// Calculate quantitative metrics from historical price data
    pub fn calculate_metrics(symbol: &str, prices: &[HistoricalPrice]) -> QuantMetrics {
        if prices.len() < 14 {
            return Self::insufficient_data(symbol);
        }

        let returns = Self::calculate_returns(prices);
        let sharpe_ratio = Self::calculate_sharpe_ratio(&returns);
        let annualized_return = Self::calculate_annualized_return(&returns, prices.len());
        let volatility = Self::calculate_volatility(&returns);
        let max_drawdown = Self::calculate_max_drawdown(prices);
        let rsi = Self::calculate_rsi(prices, 14);
        
        let (signal, confidence) = Self::generate_signal(sharpe_ratio, rsi, volatility);

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

    fn calculate_returns(prices: &[HistoricalPrice]) -> Vec<f64> {
        prices
            .windows(2)
            .map(|w| (w[1].close - w[0].close) / w[0].close)
            .collect()
    }

    fn calculate_sharpe_ratio(returns: &[f64]) -> f64 {
        if returns.is_empty() {
            return 0.0;
        }

        let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
        let variance = returns
            .iter()
            .map(|r| (r - mean_return).powi(2))
            .sum::<f64>()
            / returns.len() as f64;
        let std_dev = variance.sqrt();

        if std_dev == 0.0 {
            return 0.0;
        }

        // Annualize: sqrt(252 trading days) * (mean / std_dev)
        // Assume risk-free rate of 0 for simplicity
        (252.0_f64).sqrt() * (mean_return / std_dev)
    }

    fn calculate_annualized_return(returns: &[f64], num_prices: usize) -> f64 {
        if returns.is_empty() {
            return 0.0;
        }

        let total_return: f64 = returns.iter().map(|r| 1.0 + r).product::<f64>() - 1.0;
        let years = num_prices as f64 / 252.0; // Assuming 252 trading days per year

        if years <= 0.0 {
            return 0.0;
        }

        ((1.0 + total_return).powf(1.0 / years) - 1.0) * 100.0
    }

    fn calculate_volatility(returns: &[f64]) -> f64 {
        if returns.is_empty() {
            return 0.0;
        }

        let mean = returns.iter().sum::<f64>() / returns.len() as f64;
        let variance = returns
            .iter()
            .map(|r| (r - mean).powi(2))
            .sum::<f64>()
            / returns.len() as f64;

        // Annualize volatility
        variance.sqrt() * (252.0_f64).sqrt() * 100.0
    }

    fn calculate_max_drawdown(prices: &[HistoricalPrice]) -> f64 {
        if prices.is_empty() {
            return 0.0;
        }

        let mut max_price = prices[0].close;
        let mut max_dd = 0.0;

        for price in prices.iter() {
            if price.close > max_price {
                max_price = price.close;
            }
            let dd = ((price.close - max_price) / max_price) * 100.0;
            if dd < max_dd {
                max_dd = dd;
            }
        }

        max_dd.abs()
    }

    fn calculate_rsi(prices: &[HistoricalPrice], period: usize) -> f64 {
        if prices.len() < period + 1 {
            return 50.0;
        }

        let mut gains = Vec::new();
        let mut losses = Vec::new();

        for i in 1..prices.len() {
            let change = prices[i].close - prices[i - 1].close;
            if change > 0.0 {
                gains.push(change);
                losses.push(0.0);
            } else {
                gains.push(0.0);
                losses.push(-change);
            }
        }

        if gains.len() < period {
            return 50.0;
        }

        let avg_gain: f64 = gains[gains.len() - period..].iter().sum::<f64>() / period as f64;
        let avg_loss: f64 = losses[losses.len() - period..].iter().sum::<f64>() / period as f64;

        if avg_loss == 0.0 {
            return 100.0;
        }

        let rs = avg_gain / avg_loss;
        100.0 - (100.0 / (1.0 + rs))
    }

    fn generate_signal(sharpe: f64, rsi: f64, volatility: f64) -> (String, f64) {
        let mut score = 0.0;
        let mut factors = 0;

        // Sharpe ratio signal (higher is better)
        if sharpe > 1.5 {
            score += 0.4;
        } else if sharpe > 1.0 {
            score += 0.3;
        } else if sharpe > 0.5 {
            score += 0.2;
        } else if sharpe < 0.0 {
            score -= 0.3;
        }
        factors += 1;

        // RSI signal (oversold/overbought)
        if rsi < 30.0 {
            score += 0.3; // Oversold - potential buy
        } else if rsi > 70.0 {
            score -= 0.3; // Overbought - potential sell
        } else if rsi >= 40.0 && rsi <= 60.0 {
            score += 0.1; // Neutral zone
        }
        factors += 1;

        // Volatility signal (moderate is good)
        if volatility > 50.0 {
            score -= 0.2; // Too volatile
        } else if volatility > 30.0 {
            score += 0.1; // Acceptable
        } else if volatility > 15.0 {
            score += 0.2; // Good range
        }
        factors += 1;

        let normalized_score: f64 = (score + 1.0) / 2.0;
        let confidence = normalized_score.max(0.0).min(1.0) * 100.0;

        let signal = if score > 0.4 {
            "STRONG BUY"
        } else if score > 0.2 {
            "BUY"
        } else if score > -0.2 {
            "HOLD"
        } else if score > -0.4 {
            "SELL"
        } else {
            "STRONG SELL"
        };

        (signal.to_string(), confidence)
    }

    /// Calculate portfolio-level metrics
    pub fn calculate_portfolio_metrics(
        holdings: &[(String, f64, Vec<HistoricalPrice>)],
    ) -> HashMap<String, f64> {
        let mut metrics = HashMap::new();

        if holdings.is_empty() {
            return metrics;
        }

        // Calculate weighted metrics
        let total_weight: f64 = holdings.iter().map(|(_, w, _)| w).sum();
        
        let mut portfolio_return = 0.0;
        let mut portfolio_volatility = 0.0;
        let mut portfolio_sharpe = 0.0;

        for (symbol, weight, prices) in holdings {
            let individual_metrics = Self::calculate_metrics(symbol, prices);
            let normalized_weight = weight / total_weight;

            portfolio_return += individual_metrics.annualized_return * normalized_weight;
            portfolio_volatility += individual_metrics.volatility.powi(2) * normalized_weight.powi(2);
            portfolio_sharpe += individual_metrics.sharpe_ratio * normalized_weight;
        }

        portfolio_volatility = portfolio_volatility.sqrt();

        metrics.insert("portfolio_return".to_string(), portfolio_return);
        metrics.insert("portfolio_volatility".to_string(), portfolio_volatility);
        metrics.insert("portfolio_sharpe".to_string(), portfolio_sharpe);

        metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_metrics() {
        let prices = vec![
            HistoricalPrice { date: "2024-01-01".to_string(), close: 100.0 },
            HistoricalPrice { date: "2024-01-02".to_string(), close: 102.0 },
            HistoricalPrice { date: "2024-01-03".to_string(), close: 101.0 },
            HistoricalPrice { date: "2024-01-04".to_string(), close: 103.0 },
            HistoricalPrice { date: "2024-01-05".to_string(), close: 105.0 },
            HistoricalPrice { date: "2024-01-06".to_string(), close: 104.0 },
            HistoricalPrice { date: "2024-01-07".to_string(), close: 106.0 },
            HistoricalPrice { date: "2024-01-08".to_string(), close: 108.0 },
            HistoricalPrice { date: "2024-01-09".to_string(), close: 107.0 },
            HistoricalPrice { date: "2024-01-10".to_string(), close: 109.0 },
            HistoricalPrice { date: "2024-01-11".to_string(), close: 111.0 },
            HistoricalPrice { date: "2024-01-12".to_string(), close: 110.0 },
            HistoricalPrice { date: "2024-01-13".to_string(), close: 112.0 },
            HistoricalPrice { date: "2024-01-14".to_string(), close: 114.0 },
            HistoricalPrice { date: "2024-01-15".to_string(), close: 113.0 },
        ];

        let metrics = QuantAnalyzer::calculate_metrics("TEST", &prices);
        
        assert!(metrics.sharpe_ratio > 0.0);
        assert!(metrics.annualized_return > 0.0);
        assert!(metrics.volatility >= 0.0);
        assert!(metrics.max_drawdown >= 0.0);
        assert!(metrics.rsi >= 0.0 && metrics.rsi <= 100.0);
        assert!(!metrics.signal.is_empty());
    }
}
