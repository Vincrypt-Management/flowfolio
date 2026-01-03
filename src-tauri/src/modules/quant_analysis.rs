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
    // Extended metrics for better analysis
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sortino_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calmar_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpha: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_95: Option<f64>,
    // Daily returns for correlation analysis (last 60 days to limit payload size)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_returns: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalPrice {
    pub date: String,
    pub close: f64,
}

/// Pre-computed dashboard data - sent to frontend to avoid client-side calculations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardData {
    pub assets: Vec<AssetDashboardMetrics>,
    pub correlation_matrix: Vec<Vec<f64>>,
    pub correlation_symbols: Vec<String>,
    pub returns_distribution: Vec<DistributionBin>,
    pub portfolio_metrics: PortfolioDashboardMetrics,
    pub risk_return_scatter: Vec<RiskReturnPoint>,
    pub drawdown_series: Vec<DrawdownPoint>,
    pub diversification_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetDashboardMetrics {
    pub symbol: String,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub beta: f64,
    pub alpha: f64,
    pub volatility: f64,
    pub max_drawdown: f64,
    pub var_95: f64,
    pub cvar_95: f64,
    pub rsi: f64,
    pub expected_return: f64,
    pub information_ratio: f64,
    pub treynor_ratio: f64,
    pub signal: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionBin {
    pub bin: String,
    pub frequency: f64,
    pub normal_curve: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioDashboardMetrics {
    pub sharpe_ratio: f64,
    pub volatility: f64,
    pub expected_return: f64,
    pub max_drawdown: f64,
    pub var_95: f64,
    pub cvar_95: f64,
    pub beta: f64,
    pub alpha: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskReturnPoint {
    pub symbol: String,
    pub risk: f64,
    pub return_pct: f64,
    pub sharpe: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawdownPoint {
    pub date: String,
    pub drawdown: f64,
    pub price: f64,
}

/// Welford's online algorithm statistics - numerically stable
#[derive(Debug, Clone, Default)]
struct WelfordStats {
    count: usize,
    mean: f64,
    m2: f64, // Sum of squared differences from mean
}

impl WelfordStats {
    fn update(&mut self, value: f64) {
        self.count += 1;
        let delta = value - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = value - self.mean;
        self.m2 += delta * delta2;
    }

    fn variance(&self) -> f64 {
        if self.count < 2 {
            0.0
        } else {
            self.m2 / self.count as f64
        }
    }

    fn std_dev(&self) -> f64 {
        self.variance().sqrt()
    }
}

/// High-performance Quantitative Analyzer
/// Uses SIMD-friendly operations, single-pass algorithms, and parallel processing
pub struct QuantAnalyzer;

impl QuantAnalyzer {
    // Pre-computed constants for performance (avoid runtime sqrt calls)
    const SQRT_252: f64 = 15.874507866387544; // sqrt(252)
    const SQRT_12: f64 = 3.4641016151377544;  // sqrt(12) for monthly
    const TRADING_DAYS: f64 = 252.0;
    const RISK_FREE_RATE: f64 = 0.045; // 4.5% annual risk-free rate
    const MIN_DATA_POINTS: usize = 14;
    const OPTIMAL_DATA_POINTS: usize = 252; // 1 year for best accuracy

    /// Calculate quantitative metrics from historical price data
    /// Optimized: Single-pass calculations, vectorized operations, minimal allocations
    pub fn calculate_metrics(symbol: &str, prices: &[HistoricalPrice]) -> QuantMetrics {
        if prices.len() < Self::MIN_DATA_POINTS {
            return Self::insufficient_data(symbol);
        }

        // Pre-extract closes for cache efficiency (single allocation)
        let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
        
        // Single-pass return calculation with running statistics (Welford's algorithm)
        let (returns, stats) = Self::calculate_returns_with_welford(&closes);
        
        if returns.is_empty() || stats.count < 2 {
            return Self::insufficient_data(symbol);
        }

        let std_dev = stats.std_dev();
        let mean_return = stats.mean;
        
        // Annualized metrics using pre-computed constants
        let daily_rf = Self::RISK_FREE_RATE / Self::TRADING_DAYS;
        
        // Sharpe ratio (annualized, excess return over risk-free rate)
        let sharpe_ratio = if std_dev > 1e-10 {
            let excess_return = mean_return - daily_rf;
            Self::SQRT_252 * (excess_return / std_dev)
        } else {
            0.0
        };
        
        // Sortino ratio (downside deviation only)
        let sortino_ratio = Self::calculate_sortino_ratio(&returns, mean_return, daily_rf);
        
        // Annualized return (optimized compound calculation)
        let annualized_return = Self::calculate_annualized_return_fast(&returns, prices.len());
        
        // Volatility (annualized)
        let volatility = std_dev * Self::SQRT_252 * 100.0;
        
        // Max drawdown (single-pass with running peak)
        let max_drawdown = Self::calculate_max_drawdown_fast(&closes);
        
        // Calmar ratio (return / max drawdown)
        let calmar_ratio = if max_drawdown > 0.01 {
            Some(annualized_return / max_drawdown)
        } else {
            None
        };
        
        // Value at Risk (95% confidence)
        let var_95 = Self::calculate_var_95(&returns);
        
        // RSI with Wilder's smoothing (more accurate)
        let rsi = Self::calculate_rsi_wilder(&closes, 14);
        
        // Enhanced signal generation with all metrics
        let (signal, confidence) = Self::generate_signal_enhanced(
            sharpe_ratio, sortino_ratio, rsi, volatility, mean_return, &returns, max_drawdown
        );

        // Limit daily returns to last 60 days to reduce payload size
        let daily_returns = if returns.len() >= 10 {
            Some(returns.iter().take(60).cloned().collect())
        } else {
            None
        };

        QuantMetrics {
            symbol: symbol.to_string(),
            sharpe_ratio,
            annualized_return,
            volatility,
            max_drawdown,
            rsi,
            signal,
            confidence,
            sortino_ratio: Some(sortino_ratio),
            calmar_ratio,
            beta: None, // Calculated separately with market data
            alpha: None,
            var_95: Some(var_95),
            daily_returns,
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
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            daily_returns: None,
        }
    }

    /// Welford's online algorithm for numerically stable mean and variance
    /// Single-pass, O(n) time, O(1) additional space
    fn calculate_returns_with_welford(closes: &[f64]) -> (Vec<f64>, WelfordStats) {
        if closes.len() < 2 {
            return (Vec::new(), WelfordStats::default());
        }

        let mut returns = Vec::with_capacity(closes.len() - 1);
        let mut stats = WelfordStats::default();
        
        // Single pass: calculate returns and update running statistics
        for i in 1..closes.len() {
            if closes[i - 1] > 0.0 {
                let r = (closes[i] - closes[i - 1]) / closes[i - 1];
                if r.is_finite() {
                    returns.push(r);
                    stats.update(r);
                }
            }
        }

        (returns, stats)
    }

    /// Calculate Sortino ratio (penalizes only downside volatility)
    fn calculate_sortino_ratio(returns: &[f64], mean_return: f64, daily_rf: f64) -> f64 {
        if returns.is_empty() {
            return 0.0;
        }

        // Calculate downside deviation (only negative returns)
        let target = daily_rf; // Use risk-free rate as target
        let mut downside_sum_sq = 0.0;
        let mut downside_count = 0;

        for &r in returns {
            if r < target {
                downside_sum_sq += (r - target).powi(2);
                downside_count += 1;
            }
        }

        if downside_count == 0 {
            return if mean_return > daily_rf { 5.0 } else { 0.0 }; // No downside = excellent
        }

        let downside_dev = (downside_sum_sq / downside_count as f64).sqrt();
        
        if downside_dev > 1e-10 {
            let excess_return = mean_return - daily_rf;
            Self::SQRT_252 * (excess_return / downside_dev)
        } else {
            0.0
        }
    }

    /// Calculate Value at Risk at 95% confidence (parametric method)
    fn calculate_var_95(returns: &[f64]) -> f64 {
        if returns.len() < 10 {
            return 0.0;
        }

        // Use percentile method (more robust than parametric)
        let mut sorted: Vec<f64> = returns.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        
        let index = (returns.len() as f64 * 0.05).floor() as usize;
        let var_daily = -sorted.get(index).unwrap_or(&0.0);
        
        // Annualize (scale by sqrt of time)
        var_daily * Self::SQRT_252 * 100.0
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

    /// Enhanced signal generation with all metrics
    fn generate_signal_enhanced(
        sharpe: f64,
        sortino: f64,
        rsi: f64,
        volatility: f64,
        mean_return: f64,
        returns: &[f64],
        max_drawdown: f64,
    ) -> (String, f64) {
        let mut score = 0.0;
        let mut weight_sum = 0.0;

        // Factor 1: Sharpe ratio (weight: 0.25)
        let sharpe_score = match sharpe {
            s if s > 2.0 => 1.0,
            s if s > 1.5 => 0.8,
            s if s > 1.0 => 0.6,
            s if s > 0.5 => 0.4,
            s if s > 0.0 => 0.2,
            s => -0.2 * s.abs().min(2.0),
        };
        score += sharpe_score * 0.25;
        weight_sum += 0.25;

        // Factor 2: Sortino ratio (weight: 0.15) - rewards asymmetric returns
        let sortino_score = match sortino {
            s if s > 2.5 => 1.0,
            s if s > 1.5 => 0.7,
            s if s > 1.0 => 0.4,
            s if s > 0.0 => 0.2,
            _ => -0.2,
        };
        score += sortino_score * 0.15;
        weight_sum += 0.15;

        // Factor 3: RSI (weight: 0.20)
        let rsi_score = match rsi {
            r if r < 25.0 => 0.8,  // Strongly oversold - good buy
            r if r < 35.0 => 0.5,  // Oversold
            r if r > 75.0 => -0.8, // Strongly overbought - consider sell
            r if r > 65.0 => -0.3, // Overbought
            _ => (50.0 - rsi).abs() / 50.0 * 0.3, // Neutral zone
        };
        score += rsi_score * 0.20;
        weight_sum += 0.20;

        // Factor 4: Volatility (weight: 0.10)
        let vol_score = match volatility {
            v if v < 15.0 => 0.4,  // Low vol - stable
            v if v < 25.0 => 0.3,  // Moderate
            v if v < 40.0 => 0.0,  // Acceptable
            _ => -0.3,              // High vol - risky
        };
        score += vol_score * 0.10;
        weight_sum += 0.10;

        // Factor 5: Recent momentum (weight: 0.15)
        let recent_period = returns.len().min(20);
        if recent_period >= 5 {
            let recent_returns = &returns[returns.len() - recent_period..];
            let recent_sum: f64 = recent_returns.iter().sum();
            let momentum = recent_sum / recent_period as f64;
            
            let momentum_score = match momentum {
                m if m > 0.01 => 0.6,
                m if m > 0.005 => 0.3,
                m if m > 0.0 => 0.1,
                m if m > -0.005 => -0.1,
                _ => -0.4,
            };
            score += momentum_score * 0.15;
            weight_sum += 0.15;
        }

        // Factor 6: Trend consistency / Win rate (weight: 0.10)
        if returns.len() >= 10 {
            let positive_days = returns.iter().filter(|&&r| r > 0.0).count();
            let win_rate = positive_days as f64 / returns.len() as f64;
            let trend_score = (win_rate - 0.5) * 2.0; // -1 to 1
            score += trend_score * 0.10;
            weight_sum += 0.10;
        }

        // Factor 7: Max drawdown risk (weight: 0.05) - penalize large drawdowns
        let dd_score = match max_drawdown {
            d if d < 10.0 => 0.3,
            d if d < 20.0 => 0.1,
            d if d < 30.0 => -0.1,
            _ => -0.4,
        };
        score += dd_score * 0.05;
        weight_sum += 0.05;

        // Normalize score
        let normalized_score = if weight_sum > 0.0 {
            score / weight_sum
        } else {
            0.0
        };

        // Calculate confidence (higher when factors agree, lower with high volatility)
        let base_confidence = ((normalized_score.abs() + 0.2) * 80.0).min(95.0).max(10.0);
        let vol_penalty = (volatility / 100.0).min(0.3); // Up to 30% penalty for high vol
        let confidence = base_confidence * (1.0 - vol_penalty);

        let signal = match normalized_score {
            s if s > 0.5 => "STRONG BUY",
            s if s > 0.25 => "BUY",
            s if s > -0.25 => "HOLD",
            s if s > -0.5 => "SELL",
            _ => "STRONG SELL",
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

    /// Generate comprehensive dashboard data - ALL calculations done on backend
    /// This eliminates heavy frontend calculations
    pub fn generate_dashboard_data(
        assets_data: Vec<(String, Vec<HistoricalPrice>)>,
    ) -> DashboardData {
        let n = assets_data.len();
        
        // Calculate metrics for all assets in parallel
        let asset_metrics: Vec<(QuantMetrics, Vec<f64>)> = assets_data
            .par_iter()
            .map(|(symbol, prices)| {
                let metrics = Self::calculate_metrics(symbol, prices);
                let closes: Vec<f64> = prices.iter().map(|p| p.close).collect();
                let returns = Self::compute_returns(&closes);
                (metrics, returns)
            })
            .collect();

        // Build asset dashboard metrics
        let assets: Vec<AssetDashboardMetrics> = asset_metrics
            .iter()
            .map(|(m, _)| AssetDashboardMetrics {
                symbol: m.symbol.clone(),
                sharpe_ratio: m.sharpe_ratio,
                sortino_ratio: m.sortino_ratio.unwrap_or(0.0),
                calmar_ratio: m.calmar_ratio.unwrap_or(0.0),
                beta: m.beta.unwrap_or(1.0),
                alpha: m.alpha.unwrap_or(0.0),
                volatility: m.volatility,
                max_drawdown: m.max_drawdown,
                var_95: m.var_95.unwrap_or(0.0),
                cvar_95: m.var_95.unwrap_or(0.0) * 1.2, // Approximate CVaR
                rsi: m.rsi,
                expected_return: m.annualized_return,
                information_ratio: m.sortino_ratio.unwrap_or(0.0) * 0.8, // Approximation
                treynor_ratio: if m.beta.unwrap_or(1.0) != 0.0 {
                    (m.annualized_return - 4.5) / m.beta.unwrap_or(1.0)
                } else {
                    0.0
                },
                signal: m.signal.clone(),
                confidence: m.confidence,
            })
            .collect();

        // Calculate correlation matrix
        let returns_matrix: Vec<&Vec<f64>> = asset_metrics.iter().map(|(_, r)| r).collect();
        let (correlation_matrix, correlation_symbols) = Self::compute_correlation_matrix(&assets_data, &returns_matrix);

        // Calculate returns distribution
        let all_returns: Vec<f64> = asset_metrics.iter().flat_map(|(_, r)| r.clone()).collect();
        let returns_distribution = Self::compute_returns_distribution(&all_returns);

        // Calculate risk-return scatter
        let risk_return_scatter: Vec<RiskReturnPoint> = assets
            .iter()
            .map(|a| RiskReturnPoint {
                symbol: a.symbol.clone(),
                risk: a.volatility,
                return_pct: a.expected_return,
                sharpe: a.sharpe_ratio,
            })
            .collect();

        // Calculate drawdown series for first asset (or portfolio)
        let drawdown_series = if !assets_data.is_empty() {
            Self::compute_drawdown_series(&assets_data[0].1)
        } else {
            vec![]
        };

        // Portfolio metrics (weighted average)
        let portfolio_metrics = Self::compute_portfolio_dashboard_metrics(&assets);

        // Diversification score
        let diversification_score = Self::compute_diversification_score(&correlation_matrix);

        DashboardData {
            assets,
            correlation_matrix,
            correlation_symbols,
            returns_distribution,
            portfolio_metrics,
            risk_return_scatter,
            drawdown_series,
            diversification_score,
        }
    }

    fn compute_returns(closes: &[f64]) -> Vec<f64> {
        if closes.len() < 2 {
            return vec![];
        }
        closes.windows(2)
            .map(|w| (w[1] - w[0]) / w[0])
            .filter(|r| r.is_finite())
            .collect()
    }

    fn compute_correlation_matrix(
        assets_data: &[(String, Vec<HistoricalPrice>)],
        returns: &[&Vec<f64>],
    ) -> (Vec<Vec<f64>>, Vec<String>) {
        let n = assets_data.len();
        let symbols: Vec<String> = assets_data.iter().map(|(s, _)| s.clone()).collect();
        let mut matrix = vec![vec![0.0; n]; n];

        for i in 0..n {
            matrix[i][i] = 1.0;
            for j in (i + 1)..n {
                let corr = Self::compute_correlation(returns[i], returns[j]);
                matrix[i][j] = corr;
                matrix[j][i] = corr;
            }
        }

        (matrix, symbols)
    }

    fn compute_correlation(x: &[f64], y: &[f64]) -> f64 {
        let n = x.len().min(y.len());
        if n < 10 {
            return 0.5; // Default moderate correlation
        }

        let x_mean: f64 = x[..n].iter().sum::<f64>() / n as f64;
        let y_mean: f64 = y[..n].iter().sum::<f64>() / n as f64;

        let mut numerator = 0.0;
        let mut x_sum_sq = 0.0;
        let mut y_sum_sq = 0.0;

        for i in 0..n {
            let x_diff = x[i] - x_mean;
            let y_diff = y[i] - y_mean;
            numerator += x_diff * y_diff;
            x_sum_sq += x_diff * x_diff;
            y_sum_sq += y_diff * y_diff;
        }

        let denominator = (x_sum_sq * y_sum_sq).sqrt();
        if denominator < 1e-10 {
            return 0.0;
        }

        (numerator / denominator).clamp(-1.0, 1.0)
    }

    fn compute_returns_distribution(returns: &[f64]) -> Vec<DistributionBin> {
        if returns.len() < 10 {
            // Generate sample distribution
            let bins = ["-4%", "-3%", "-2%", "-1%", "0%", "1%", "2%", "3%", "4%"];
            let frequencies = [2.0, 5.0, 15.0, 25.0, 30.0, 25.0, 15.0, 5.0, 2.0];
            let normal_curve = [3.0, 8.0, 18.0, 28.0, 30.0, 28.0, 18.0, 8.0, 3.0];
            
            return bins.iter().enumerate().map(|(i, b)| DistributionBin {
                bin: b.to_string(),
                frequency: frequencies[i],
                normal_curve: normal_curve[i],
            }).collect();
        }

        let min = returns.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = returns.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        
        if (max - min).abs() < 1e-10 {
            return vec![];
        }

        let bin_count = 15;
        let bin_size = (max - min) / bin_count as f64;
        
        let mean: f64 = returns.iter().sum::<f64>() / returns.len() as f64;
        let variance: f64 = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / returns.len() as f64;
        let std_dev = variance.sqrt();

        (0..bin_count).map(|i| {
            let bin_start = min + i as f64 * bin_size;
            let bin_end = bin_start + bin_size;
            let bin_mid = (bin_start + bin_end) / 2.0;
            
            let frequency = returns.iter().filter(|&&r| r >= bin_start && r < bin_end).count() as f64;
            let normal_curve = if std_dev > 1e-10 {
                (returns.len() as f64 * bin_size / (std_dev * (2.0 * std::f64::consts::PI).sqrt()))
                    * (-((bin_mid - mean).powi(2)) / (2.0 * std_dev * std_dev)).exp()
            } else {
                0.0
            };
            
            DistributionBin {
                bin: format!("{:.1}%", bin_mid * 100.0),
                frequency,
                normal_curve,
            }
        }).collect()
    }

    fn compute_drawdown_series(prices: &[HistoricalPrice]) -> Vec<DrawdownPoint> {
        if prices.is_empty() {
            return vec![];
        }

        let mut peak = prices[0].close;
        prices.iter().map(|p| {
            if p.close > peak {
                peak = p.close;
            }
            let drawdown = ((p.close - peak) / peak) * 100.0;
            DrawdownPoint {
                date: p.date.clone(),
                drawdown,
                price: p.close,
            }
        }).collect()
    }

    fn compute_portfolio_dashboard_metrics(assets: &[AssetDashboardMetrics]) -> PortfolioDashboardMetrics {
        if assets.is_empty() {
            return PortfolioDashboardMetrics {
                sharpe_ratio: 0.0,
                volatility: 0.0,
                expected_return: 0.0,
                max_drawdown: 0.0,
                var_95: 0.0,
                cvar_95: 0.0,
                beta: 1.0,
                alpha: 0.0,
            };
        }

        let n = assets.len() as f64;
        let weight = 1.0 / n; // Equal weight

        let expected_return: f64 = assets.iter().map(|a| a.expected_return * weight).sum();
        let volatility: f64 = (assets.iter().map(|a| (a.volatility * weight).powi(2)).sum::<f64>()).sqrt();
        let sharpe_ratio: f64 = assets.iter().map(|a| a.sharpe_ratio * weight).sum();
        let max_drawdown: f64 = assets.iter().map(|a| a.max_drawdown).fold(0.0, f64::max);
        let var_95: f64 = assets.iter().map(|a| a.var_95 * weight).sum();
        let cvar_95: f64 = assets.iter().map(|a| a.cvar_95 * weight).sum();
        let beta: f64 = assets.iter().map(|a| a.beta * weight).sum();
        let alpha: f64 = assets.iter().map(|a| a.alpha * weight).sum();

        PortfolioDashboardMetrics {
            sharpe_ratio,
            volatility,
            expected_return,
            max_drawdown,
            var_95,
            cvar_95,
            beta,
            alpha,
        }
    }

    fn compute_diversification_score(correlation_matrix: &[Vec<f64>]) -> f64 {
        let n = correlation_matrix.len();
        if n < 2 {
            return 100.0;
        }

        let mut total_corr = 0.0;
        let mut count = 0;

        for i in 0..n {
            for j in (i + 1)..n {
                total_corr += correlation_matrix[i][j].abs();
                count += 1;
            }
        }

        if count == 0 {
            return 100.0;
        }

        let avg_corr = total_corr / count as f64;
        ((1.0 - avg_corr) * 100.0).round()
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
