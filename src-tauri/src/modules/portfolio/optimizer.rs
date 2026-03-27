use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::modules::quant_analysis::QuantMetrics;

/// Represents a holding that has been evaluated for performance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluatedHolding {
    pub symbol: String,
    pub shares: f64,
    pub current_price: f64,
    pub market_value: f64,
    pub cost_basis: f64,
    pub total_return_pct: f64,
    pub metrics: HoldingMetrics,
    pub performance_grade: String, // A, B, C, D, F
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoldingMetrics {
    pub sharpe_ratio: f64,
    pub annualized_return: f64,
    pub volatility: f64,
    pub max_drawdown: f64,
    pub rsi: f64,
    pub signal: String,
    pub confidence: f64,
}

impl From<QuantMetrics> for HoldingMetrics {
    fn from(m: QuantMetrics) -> Self {
        Self {
            sharpe_ratio: m.sharpe_ratio,
            annualized_return: m.annualized_return,
            volatility: m.volatility,
            max_drawdown: m.max_drawdown,
            rsi: m.rsi,
            signal: m.signal,
            confidence: m.confidence,
        }
    }
}

/// Recommendation to drop a holding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DropRecommendation {
    pub symbol: String,
    pub current_value: f64,
    pub grade: String,
    pub primary_reason: String,
    pub all_reasons: Vec<String>,
    pub urgency: String, // "HIGH", "MEDIUM", "LOW"
    pub estimated_loss_if_held: f64,
    pub tax_impact_note: String,
}

/// Recommendation for a replacement holding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacementOption {
    pub symbol: String,
    pub score: f64,
    pub metrics: HoldingMetrics,
    pub why_better: Vec<String>,
    pub suggested_allocation_pct: f64,
    pub suggested_amount: f64,
}

/// Complete portfolio optimization report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioOptimizationReport {
    pub date: String,
    pub portfolio_name: String,
    pub current_health_score: f64,
    pub projected_health_score: f64,
    pub evaluated_holdings: Vec<EvaluatedHolding>,
    pub drop_recommendations: Vec<DropRecommendation>,
    pub replacement_options: Vec<ReplacementOption>,
    pub action_plan: ActionPlan,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPlan {
    pub total_to_sell: f64,
    pub total_to_buy: f64,
    pub estimated_improvement_pct: f64,
    pub steps: Vec<ActionStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionStep {
    pub order: i32,
    pub action: String, // "SELL", "BUY"
    pub symbol: String,
    pub amount: f64,
    pub shares: f64,
    pub rationale: String,
}

/// Thresholds for identifying poor performers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationThresholds {
    pub min_sharpe_ratio: f64,
    pub max_volatility: f64,
    pub max_drawdown: f64,
    pub min_annualized_return: f64,
    pub min_holding_period_days: i32,
}

impl Default for OptimizationThresholds {
    fn default() -> Self {
        Self {
            min_sharpe_ratio: 0.3,
            max_volatility: 45.0,
            max_drawdown: 35.0,
            min_annualized_return: -15.0,
            min_holding_period_days: 30,
        }
    }
}

pub struct PortfolioOptimizer;

impl PortfolioOptimizer {
    /// Evaluate all holdings and generate a comprehensive optimization report
    pub fn generate_optimization_report(
        portfolio_name: &str,
        holdings: Vec<(String, f64, f64, f64)>, // (symbol, shares, cost_basis, current_price)
        holding_metrics: &HashMap<String, QuantMetrics>,
        candidate_metrics: &HashMap<String, QuantMetrics>,
        thresholds: OptimizationThresholds,
    ) -> PortfolioOptimizationReport {
        // Evaluate current holdings
        let evaluated_holdings: Vec<EvaluatedHolding> = holdings
            .iter()
            .map(|(symbol, shares, cost_basis, current_price)| {
                Self::evaluate_holding(
                    symbol,
                    *shares,
                    *cost_basis,
                    *current_price,
                    holding_metrics.get(symbol),
                    &thresholds,
                )
            })
            .collect();

        // Calculate current portfolio health score
        let current_health_score = Self::calculate_portfolio_health(&evaluated_holdings);

        // Identify holdings to drop
        let drop_recommendations = Self::identify_drops(&evaluated_holdings, &thresholds);

        // Calculate total value to be reallocated
        let total_to_reallocate: f64 = drop_recommendations.iter().map(|d| d.current_value).sum();

        // Find replacement options
        let replacement_options = Self::find_replacements(
            candidate_metrics,
            &evaluated_holdings,
            total_to_reallocate,
            &thresholds,
        );

        // Calculate projected health score after optimization
        let projected_health_score = Self::calculate_projected_health(
            &evaluated_holdings,
            &drop_recommendations,
            &replacement_options,
        );

        // Generate action plan
        let action_plan = Self::generate_action_plan(
            &drop_recommendations,
            &replacement_options,
            holding_metrics,
        );

        // Generate summary
        let summary = Self::generate_summary(
            &drop_recommendations,
            &replacement_options,
            current_health_score,
            projected_health_score,
        );

        PortfolioOptimizationReport {
            date: chrono::Utc::now().to_rfc3339(),
            portfolio_name: portfolio_name.to_string(),
            current_health_score,
            projected_health_score,
            evaluated_holdings,
            drop_recommendations,
            replacement_options,
            action_plan,
            summary,
        }
    }

    fn evaluate_holding(
        symbol: &str,
        shares: f64,
        cost_basis: f64,
        current_price: f64,
        metrics: Option<&QuantMetrics>,
        thresholds: &OptimizationThresholds,
    ) -> EvaluatedHolding {
        let market_value = shares * current_price;
        let total_cost = shares * cost_basis;
        let total_return_pct = if total_cost > 0.0 {
            ((market_value - total_cost) / total_cost) * 100.0
        } else {
            0.0
        };

        let (holding_metrics, grade, issues) = if let Some(m) = metrics {
            let mut issues = Vec::new();
            let mut score = 100.0;

            // Check Sharpe ratio
            if m.sharpe_ratio < thresholds.min_sharpe_ratio {
                issues.push(format!(
                    "Poor risk-adjusted returns (Sharpe: {:.2} < {:.2})",
                    m.sharpe_ratio, thresholds.min_sharpe_ratio
                ));
                score -= 25.0;
            }

            // Check volatility
            if m.volatility > thresholds.max_volatility {
                issues.push(format!(
                    "High volatility ({:.1}% > {:.1}%)",
                    m.volatility, thresholds.max_volatility
                ));
                score -= 20.0;
            }

            // Check max drawdown
            if m.max_drawdown > thresholds.max_drawdown {
                issues.push(format!(
                    "Excessive drawdown ({:.1}% > {:.1}%)",
                    m.max_drawdown, thresholds.max_drawdown
                ));
                score -= 20.0;
            }

            // Check annualized return
            if m.annualized_return < thresholds.min_annualized_return {
                issues.push(format!(
                    "Poor returns ({:.1}% < {:.1}%)",
                    m.annualized_return, thresholds.min_annualized_return
                ));
                score -= 25.0;
            }

            // Check signal
            if m.signal == "STRONG SELL" || m.signal == "SELL" {
                issues.push(format!("Negative signal: {}", m.signal));
                score -= 15.0;
            }

            // Check RSI for overbought
            if m.rsi > 75.0 {
                issues.push(format!("Overbought (RSI: {:.1})", m.rsi));
                score -= 10.0;
            }

            let grade = Self::score_to_grade(score);

            (HoldingMetrics::from(m.clone()), grade, issues)
        } else {
            (
                HoldingMetrics {
                    sharpe_ratio: 0.0,
                    annualized_return: 0.0,
                    volatility: 0.0,
                    max_drawdown: 0.0,
                    rsi: 50.0,
                    signal: "NO DATA".to_string(),
                    confidence: 0.0,
                },
                "N/A".to_string(),
                vec!["No metrics data available".to_string()],
            )
        };

        EvaluatedHolding {
            symbol: symbol.to_string(),
            shares,
            current_price,
            market_value,
            cost_basis,
            total_return_pct,
            metrics: holding_metrics,
            performance_grade: grade,
            issues,
        }
    }

    fn score_to_grade(score: f64) -> String {
        match score {
            s if s >= 90.0 => "A",
            s if s >= 80.0 => "B",
            s if s >= 70.0 => "C",
            s if s >= 60.0 => "D",
            _ => "F",
        }
        .to_string()
    }

    fn identify_drops(
        holdings: &[EvaluatedHolding],
        _thresholds: &OptimizationThresholds,
    ) -> Vec<DropRecommendation> {
        holdings
            .iter()
            .filter(|h| {
                h.performance_grade == "D" || h.performance_grade == "F" || !h.issues.is_empty()
            })
            .filter(|h| h.issues.len() >= 2 || h.performance_grade == "F") // Only recommend dropping if multiple issues or F grade
            .map(|h| {
                let urgency = match h.performance_grade.as_str() {
                    "F" => "HIGH",
                    "D" => "MEDIUM",
                    _ => "LOW",
                };

                let primary_reason = h
                    .issues
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Poor overall performance".to_string());

                // Estimate potential loss if held (based on current trend)
                let estimated_loss = if h.metrics.annualized_return < 0.0 {
                    h.market_value * (h.metrics.annualized_return.abs() / 100.0) * 0.25
                // 3-month projection
                } else {
                    0.0
                };

                // Tax impact note
                let tax_note = if h.total_return_pct < 0.0 {
                    format!(
                        "💡 Tax-loss harvesting opportunity: {:.1}% loss can offset gains",
                        h.total_return_pct.abs()
                    )
                } else {
                    format!(
                        "⚠️ Selling will realize {:.1}% gain - consider tax implications",
                        h.total_return_pct
                    )
                };

                DropRecommendation {
                    symbol: h.symbol.clone(),
                    current_value: h.market_value,
                    grade: h.performance_grade.clone(),
                    primary_reason,
                    all_reasons: h.issues.clone(),
                    urgency: urgency.to_string(),
                    estimated_loss_if_held: estimated_loss,
                    tax_impact_note: tax_note,
                }
            })
            .collect()
    }

    fn find_replacements(
        candidate_metrics: &HashMap<String, QuantMetrics>,
        current_holdings: &[EvaluatedHolding],
        total_to_reallocate: f64,
        thresholds: &OptimizationThresholds,
    ) -> Vec<ReplacementOption> {
        // Get symbols already in portfolio
        let held_symbols: Vec<String> = current_holdings.iter().map(|h| h.symbol.clone()).collect();

        // Score and filter candidates
        let mut candidates: Vec<(String, f64, &QuantMetrics)> = candidate_metrics
            .iter()
            .filter(|(symbol, _)| !held_symbols.contains(symbol))
            .filter(|(_, m)| {
                m.sharpe_ratio >= thresholds.min_sharpe_ratio
                    && m.volatility <= thresholds.max_volatility
                    && m.max_drawdown <= thresholds.max_drawdown
                    && m.annualized_return >= thresholds.min_annualized_return
            })
            .map(|(symbol, metrics)| {
                let score = Self::calculate_replacement_score(metrics);
                (symbol.clone(), score, metrics)
            })
            .collect();

        // Sort by score descending
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Take top candidates
        let num_recommendations = (total_to_reallocate / 1000.0).ceil() as usize;
        let num_recommendations = num_recommendations.clamp(3, 10);

        candidates
            .into_iter()
            .take(num_recommendations)
            .enumerate()
            .map(|(i, (symbol, score, metrics))| {
                let allocation_pct = if i < 3 { 30.0 - (i as f64 * 5.0) } else { 15.0 };

                let suggested_amount =
                    (total_to_reallocate * allocation_pct / 100.0).min(total_to_reallocate);

                let why_better = Self::generate_why_better(metrics, thresholds);

                ReplacementOption {
                    symbol,
                    score,
                    metrics: HoldingMetrics::from(metrics.clone()),
                    why_better,
                    suggested_allocation_pct: allocation_pct,
                    suggested_amount,
                }
            })
            .collect()
    }

    fn calculate_replacement_score(metrics: &QuantMetrics) -> f64 {
        let mut score = 0.0;

        // Sharpe ratio contribution (0-30 points)
        score += (metrics.sharpe_ratio * 15.0).clamp(0.0, 30.0);

        // Return contribution (0-25 points)
        score += (metrics.annualized_return * 0.5).clamp(0.0, 25.0);

        // Low volatility bonus (0-15 points)
        score += ((50.0 - metrics.volatility) * 0.3).clamp(0.0, 15.0);

        // Low drawdown bonus (0-15 points)
        score += ((40.0 - metrics.max_drawdown) * 0.375).clamp(0.0, 15.0);

        // Signal bonus (0-15 points)
        score += match metrics.signal.as_str() {
            "STRONG BUY" => 15.0,
            "BUY" => 10.0,
            "HOLD" => 5.0,
            _ => 0.0,
        };

        score
    }

    fn generate_why_better(
        metrics: &QuantMetrics,
        thresholds: &OptimizationThresholds,
    ) -> Vec<String> {
        let mut reasons = Vec::new();

        if metrics.sharpe_ratio > thresholds.min_sharpe_ratio * 2.0 {
            reasons.push(format!(
                "Strong risk-adjusted returns (Sharpe: {:.2})",
                metrics.sharpe_ratio
            ));
        }

        if metrics.annualized_return > 10.0 {
            reasons.push(format!(
                "Solid growth ({:.1}% annualized return)",
                metrics.annualized_return
            ));
        }

        if metrics.volatility < 25.0 {
            reasons.push(format!("Lower volatility ({:.1}%)", metrics.volatility));
        }

        if metrics.max_drawdown < 20.0 {
            reasons.push(format!(
                "Limited downside ({:.1}% max drawdown)",
                metrics.max_drawdown
            ));
        }

        if metrics.signal == "STRONG BUY" || metrics.signal == "BUY" {
            reasons.push(format!(
                "Positive momentum signal: {} ({:.0}% confidence)",
                metrics.signal, metrics.confidence
            ));
        }

        if reasons.is_empty() {
            reasons.push("Meets all quality thresholds".to_string());
        }

        reasons
    }

    fn calculate_portfolio_health(holdings: &[EvaluatedHolding]) -> f64 {
        if holdings.is_empty() {
            return 0.0;
        }

        let total_value: f64 = holdings.iter().map(|h| h.market_value).sum();
        if total_value <= 0.0 {
            return 0.0;
        }

        let weighted_score: f64 = holdings
            .iter()
            .map(|h| {
                let grade_score = match h.performance_grade.as_str() {
                    "A" => 100.0,
                    "B" => 85.0,
                    "C" => 70.0,
                    "D" => 55.0,
                    "F" => 30.0,
                    _ => 50.0,
                };
                grade_score * (h.market_value / total_value)
            })
            .sum();

        weighted_score
    }

    fn calculate_projected_health(
        holdings: &[EvaluatedHolding],
        drops: &[DropRecommendation],
        replacements: &[ReplacementOption],
    ) -> f64 {
        if holdings.is_empty() {
            return 0.0;
        }

        let drop_symbols: Vec<String> = drops.iter().map(|d| d.symbol.clone()).collect();

        // Calculate remaining holdings value
        let remaining_holdings: Vec<&EvaluatedHolding> = holdings
            .iter()
            .filter(|h| !drop_symbols.contains(&h.symbol))
            .collect();

        let remaining_value: f64 = remaining_holdings.iter().map(|h| h.market_value).sum();
        let dropped_value: f64 = drops.iter().map(|d| d.current_value).sum();
        let total_value = remaining_value + dropped_value;

        if total_value <= 0.0 {
            return 0.0;
        }

        // Score remaining holdings
        let mut weighted_score: f64 = remaining_holdings
            .iter()
            .map(|h| {
                let grade_score = match h.performance_grade.as_str() {
                    "A" => 100.0,
                    "B" => 85.0,
                    "C" => 70.0,
                    "D" => 55.0,
                    "F" => 30.0,
                    _ => 50.0,
                };
                grade_score * (h.market_value / total_value)
            })
            .sum();

        // Add projected score from replacements (assume B+ average for new picks)
        if !replacements.is_empty() {
            let replacement_avg_score = 88.0; // Assume good replacement picks
            weighted_score += replacement_avg_score * (dropped_value / total_value);
        }

        weighted_score
    }

    fn generate_action_plan(
        drops: &[DropRecommendation],
        replacements: &[ReplacementOption],
        holding_metrics: &HashMap<String, QuantMetrics>,
    ) -> ActionPlan {
        let mut steps = Vec::new();
        let mut order = 1;

        // First, sell the underperformers
        let total_to_sell: f64 = drops.iter().map(|d| d.current_value).sum();

        for drop in drops {
            let _price = holding_metrics
                .get(&drop.symbol)
                .map(|_| drop.current_value) // Simplified - would need actual price
                .unwrap_or(drop.current_value);

            steps.push(ActionStep {
                order,
                action: "SELL".to_string(),
                symbol: drop.symbol.clone(),
                amount: drop.current_value,
                shares: 0.0, // Would need price to calculate
                rationale: drop.primary_reason.clone(),
            });
            order += 1;
        }

        // Then, buy the replacements
        let total_to_buy: f64 = replacements.iter().map(|r| r.suggested_amount).sum();

        for replacement in replacements {
            steps.push(ActionStep {
                order,
                action: "BUY".to_string(),
                symbol: replacement.symbol.clone(),
                amount: replacement.suggested_amount,
                shares: 0.0, // Would need price to calculate
                rationale: replacement
                    .why_better
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Better risk-adjusted returns".to_string()),
            });
            order += 1;
        }

        let estimated_improvement = if total_to_sell > 0.0 {
            15.0 // Estimated improvement percentage
        } else {
            0.0
        };

        ActionPlan {
            total_to_sell,
            total_to_buy: total_to_buy.min(total_to_sell),
            estimated_improvement_pct: estimated_improvement,
            steps,
        }
    }

    fn generate_summary(
        drops: &[DropRecommendation],
        replacements: &[ReplacementOption],
        current_health: f64,
        projected_health: f64,
    ) -> String {
        let improvement = projected_health - current_health;

        if drops.is_empty() {
            return "✅ Your portfolio looks healthy! No immediate optimization needed."
                .to_string();
        }

        let high_urgency: Vec<&DropRecommendation> =
            drops.iter().filter(|d| d.urgency == "HIGH").collect();

        let mut summary = format!(
            "📊 Portfolio Optimization Report\n\n\
            Current Health Score: {:.0}/100\n\
            Projected Health Score: {:.0}/100 (+{:.0})\n\n",
            current_health, projected_health, improvement
        );

        if !high_urgency.is_empty() {
            summary.push_str(&format!(
                "⚠️ {} position(s) need immediate attention:\n",
                high_urgency.len()
            ));
            for drop in &high_urgency {
                summary.push_str(&format!("  • {} (Grade: {})\n", drop.symbol, drop.grade));
            }
            summary.push('\n');
        }

        summary.push_str(&format!(
            "📋 Action Summary:\n\
            • Sell {} underperforming position(s)\n\
            • Reallocate ${:.2} to {} better alternatives\n\
            • Expected portfolio improvement: +{:.0}%",
            drops.len(),
            drops.iter().map(|d| d.current_value).sum::<f64>(),
            replacements.len(),
            improvement
        ));

        summary
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_metrics(
        sharpe: f64,
        return_pct: f64,
        vol: f64,
        dd: f64,
        signal: &str,
    ) -> QuantMetrics {
        QuantMetrics {
            symbol: "TEST".to_string(),
            sharpe_ratio: sharpe,
            annualized_return: return_pct,
            volatility: vol,
            max_drawdown: dd,
            rsi: 50.0,
            signal: signal.to_string(),
            confidence: 75.0,
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            omega_ratio: None,
            tail_ratio: None,
            skewness: None,
            kurtosis: None,
            ulcer_index: None,
            gain_to_loss_ratio: None,
            win_rate: None,
            daily_returns: None,
        }
    }

    #[test]
    fn test_evaluate_holding_good() {
        let metrics = create_test_metrics(1.5, 15.0, 20.0, 10.0, "BUY");
        let mut holding_metrics = HashMap::new();
        holding_metrics.insert("AAPL".to_string(), metrics);

        let evaluated = PortfolioOptimizer::evaluate_holding(
            "AAPL",
            10.0,
            150.0,
            180.0,
            holding_metrics.get("AAPL"),
            &OptimizationThresholds::default(),
        );

        assert!(evaluated.performance_grade == "A" || evaluated.performance_grade == "B");
        assert!(evaluated.issues.is_empty());
    }

    #[test]
    fn test_evaluate_holding_poor() {
        let metrics = create_test_metrics(-0.5, -20.0, 60.0, 50.0, "STRONG SELL");
        let mut holding_metrics = HashMap::new();
        holding_metrics.insert("BAD".to_string(), metrics);

        let evaluated = PortfolioOptimizer::evaluate_holding(
            "BAD",
            10.0,
            100.0,
            50.0,
            holding_metrics.get("BAD"),
            &OptimizationThresholds::default(),
        );

        assert!(evaluated.performance_grade == "D" || evaluated.performance_grade == "F");
        assert!(!evaluated.issues.is_empty());
    }

    #[test]
    fn test_identify_drops() {
        let holdings = vec![
            EvaluatedHolding {
                symbol: "GOOD".to_string(),
                shares: 10.0,
                current_price: 100.0,
                market_value: 1000.0,
                cost_basis: 90.0,
                total_return_pct: 11.1,
                metrics: HoldingMetrics {
                    sharpe_ratio: 1.5,
                    annualized_return: 15.0,
                    volatility: 20.0,
                    max_drawdown: 10.0,
                    rsi: 55.0,
                    signal: "BUY".to_string(),
                    confidence: 80.0,
                },
                performance_grade: "A".to_string(),
                issues: vec![],
            },
            EvaluatedHolding {
                symbol: "BAD".to_string(),
                shares: 10.0,
                current_price: 50.0,
                market_value: 500.0,
                cost_basis: 100.0,
                total_return_pct: -50.0,
                metrics: HoldingMetrics {
                    sharpe_ratio: -0.5,
                    annualized_return: -20.0,
                    volatility: 60.0,
                    max_drawdown: 50.0,
                    rsi: 25.0,
                    signal: "STRONG SELL".to_string(),
                    confidence: 85.0,
                },
                performance_grade: "F".to_string(),
                issues: vec![
                    "Poor Sharpe".to_string(),
                    "High volatility".to_string(),
                    "Large drawdown".to_string(),
                ],
            },
        ];

        let drops =
            PortfolioOptimizer::identify_drops(&holdings, &OptimizationThresholds::default());

        assert_eq!(drops.len(), 1);
        assert_eq!(drops[0].symbol, "BAD");
        assert_eq!(drops[0].urgency, "HIGH");
    }

    // ===== score_to_grade tests =====

    #[test]
    fn test_score_to_grade_a() {
        assert_eq!(PortfolioOptimizer::score_to_grade(100.0), "A");
        assert_eq!(PortfolioOptimizer::score_to_grade(90.0), "A");
        assert_eq!(PortfolioOptimizer::score_to_grade(95.0), "A");
    }

    #[test]
    fn test_score_to_grade_b() {
        assert_eq!(PortfolioOptimizer::score_to_grade(89.9), "B");
        assert_eq!(PortfolioOptimizer::score_to_grade(80.0), "B");
        assert_eq!(PortfolioOptimizer::score_to_grade(85.0), "B");
    }

    #[test]
    fn test_score_to_grade_c() {
        assert_eq!(PortfolioOptimizer::score_to_grade(79.9), "C");
        assert_eq!(PortfolioOptimizer::score_to_grade(70.0), "C");
    }

    #[test]
    fn test_score_to_grade_d() {
        assert_eq!(PortfolioOptimizer::score_to_grade(69.9), "D");
        assert_eq!(PortfolioOptimizer::score_to_grade(60.0), "D");
    }

    #[test]
    fn test_score_to_grade_f() {
        assert_eq!(PortfolioOptimizer::score_to_grade(59.9), "F");
        assert_eq!(PortfolioOptimizer::score_to_grade(0.0), "F");
        assert_eq!(PortfolioOptimizer::score_to_grade(-10.0), "F");
    }

    // ===== calculate_replacement_score tests =====

    #[test]
    fn test_replacement_score_strong_buy() {
        let metrics = create_test_metrics(2.0, 20.0, 15.0, 10.0, "STRONG BUY");
        let score = PortfolioOptimizer::calculate_replacement_score(&metrics);
        // Sharpe: min(2.0*15, 30) = 30
        // Return: min(20*0.5, 25) = 10
        // Low vol: min((50-15)*0.3, 15) = 10.5
        // Low dd: min((40-10)*0.375, 15) = 11.25
        // Signal: 15
        let expected = 30.0 + 10.0 + 10.5 + 11.25 + 15.0;
        assert!(
            (score - expected).abs() < 1e-6,
            "Expected {}, got {}",
            expected,
            score
        );
    }

    #[test]
    fn test_replacement_score_poor_metrics() {
        let metrics = create_test_metrics(-1.0, -10.0, 60.0, 50.0, "SELL");
        let score = PortfolioOptimizer::calculate_replacement_score(&metrics);
        // Sharpe: max(-15, 0) = 0
        // Return: max(-5, 0) = 0
        // Low vol: max((50-60)*0.3, 0) = 0
        // Low dd: max((40-50)*0.375, 0) = 0
        // Signal SELL: 0
        assert!(
            (score - 0.0).abs() < 1e-6,
            "Poor metrics should score 0, got {}",
            score
        );
    }

    #[test]
    fn test_replacement_score_hold_signal() {
        let metrics = create_test_metrics(1.0, 10.0, 30.0, 20.0, "HOLD");
        let score = PortfolioOptimizer::calculate_replacement_score(&metrics);
        assert!(score > 0.0, "HOLD signal should contribute points");
        // Signal HOLD = 5 points
        let metrics_buy = create_test_metrics(1.0, 10.0, 30.0, 20.0, "BUY");
        let score_buy = PortfolioOptimizer::calculate_replacement_score(&metrics_buy);
        assert!(score_buy > score, "BUY should score higher than HOLD");
    }

    // ===== generate_why_better tests =====

    #[test]
    fn test_why_better_all_criteria() {
        let metrics = create_test_metrics(2.0, 15.0, 20.0, 15.0, "STRONG BUY");
        let thresholds = OptimizationThresholds::default(); // min_sharpe = 0.3
        let reasons = PortfolioOptimizer::generate_why_better(&metrics, &thresholds);
        // sharpe 2.0 > 0.3*2 = 0.6 -> strong risk-adjusted
        // return 15.0 > 10.0 -> solid growth
        // vol 20.0 < 25.0 -> lower volatility
        // dd 15.0 < 20.0 -> limited downside
        // signal STRONG BUY -> positive momentum
        assert!(
            reasons.len() >= 4,
            "Expected at least 4 reasons, got {}: {:?}",
            reasons.len(),
            reasons
        );
    }

    #[test]
    fn test_why_better_no_criteria_met() {
        let metrics = create_test_metrics(0.4, 5.0, 30.0, 25.0, "HOLD");
        let thresholds = OptimizationThresholds::default();
        let reasons = PortfolioOptimizer::generate_why_better(&metrics, &thresholds);
        // sharpe 0.4 < 0.6 -> no
        // return 5.0 < 10.0 -> no
        // vol 30.0 >= 25.0 -> no
        // dd 25.0 >= 20.0 -> no
        // signal HOLD -> no
        assert_eq!(reasons.len(), 1);
        assert_eq!(reasons[0], "Meets all quality thresholds");
    }

    // ===== calculate_portfolio_health tests =====

    #[test]
    fn test_portfolio_health_empty() {
        let result = PortfolioOptimizer::calculate_portfolio_health(&[]);
        assert!((result - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_portfolio_health_all_a() {
        let holdings = vec![EvaluatedHolding {
            symbol: "A1".to_string(),
            shares: 10.0,
            current_price: 100.0,
            market_value: 1000.0,
            cost_basis: 90.0,
            total_return_pct: 11.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 2.0,
                annualized_return: 20.0,
                volatility: 15.0,
                max_drawdown: 5.0,
                rsi: 55.0,
                signal: "BUY".to_string(),
                confidence: 80.0,
            },
            performance_grade: "A".to_string(),
            issues: vec![],
        }];
        let result = PortfolioOptimizer::calculate_portfolio_health(&holdings);
        assert!(
            (result - 100.0).abs() < 1e-6,
            "All A should be 100, got {}",
            result
        );
    }

    #[test]
    fn test_portfolio_health_mixed_grades() {
        let holdings = vec![
            EvaluatedHolding {
                symbol: "A1".to_string(),
                shares: 10.0,
                current_price: 100.0,
                market_value: 500.0,
                cost_basis: 90.0,
                total_return_pct: 11.0,
                metrics: HoldingMetrics {
                    sharpe_ratio: 2.0,
                    annualized_return: 20.0,
                    volatility: 15.0,
                    max_drawdown: 5.0,
                    rsi: 55.0,
                    signal: "BUY".to_string(),
                    confidence: 80.0,
                },
                performance_grade: "A".to_string(),
                issues: vec![],
            },
            EvaluatedHolding {
                symbol: "F1".to_string(),
                shares: 10.0,
                current_price: 50.0,
                market_value: 500.0,
                cost_basis: 100.0,
                total_return_pct: -50.0,
                metrics: HoldingMetrics {
                    sharpe_ratio: -1.0,
                    annualized_return: -20.0,
                    volatility: 60.0,
                    max_drawdown: 50.0,
                    rsi: 25.0,
                    signal: "SELL".to_string(),
                    confidence: 80.0,
                },
                performance_grade: "F".to_string(),
                issues: vec!["bad".to_string()],
            },
        ];
        let result = PortfolioOptimizer::calculate_portfolio_health(&holdings);
        // 100 * 0.5 + 30 * 0.5 = 65
        assert!((result - 65.0).abs() < 1e-6, "Expected 65, got {}", result);
    }

    #[test]
    fn test_portfolio_health_zero_value() {
        let holdings = vec![EvaluatedHolding {
            symbol: "Z".to_string(),
            shares: 0.0,
            current_price: 0.0,
            market_value: 0.0,
            cost_basis: 0.0,
            total_return_pct: 0.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 0.0,
                annualized_return: 0.0,
                volatility: 0.0,
                max_drawdown: 0.0,
                rsi: 50.0,
                signal: "HOLD".to_string(),
                confidence: 0.0,
            },
            performance_grade: "C".to_string(),
            issues: vec![],
        }];
        let result = PortfolioOptimizer::calculate_portfolio_health(&holdings);
        assert!((result - 0.0).abs() < f64::EPSILON);
    }

    // ===== calculate_projected_health tests =====

    #[test]
    fn test_projected_health_empty() {
        let result = PortfolioOptimizer::calculate_projected_health(&[], &[], &[]);
        assert!((result - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_projected_health_no_drops() {
        let holdings = vec![EvaluatedHolding {
            symbol: "A1".to_string(),
            shares: 10.0,
            current_price: 100.0,
            market_value: 1000.0,
            cost_basis: 90.0,
            total_return_pct: 11.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 2.0,
                annualized_return: 20.0,
                volatility: 15.0,
                max_drawdown: 5.0,
                rsi: 55.0,
                signal: "BUY".to_string(),
                confidence: 80.0,
            },
            performance_grade: "A".to_string(),
            issues: vec![],
        }];
        let result = PortfolioOptimizer::calculate_projected_health(&holdings, &[], &[]);
        assert!((result - 100.0).abs() < 1e-6);
    }

    #[test]
    fn test_projected_health_with_drops_and_replacements() {
        let holdings = vec![
            EvaluatedHolding {
                symbol: "GOOD".to_string(),
                shares: 10.0,
                current_price: 100.0,
                market_value: 500.0,
                cost_basis: 90.0,
                total_return_pct: 11.0,
                metrics: HoldingMetrics {
                    sharpe_ratio: 2.0,
                    annualized_return: 20.0,
                    volatility: 15.0,
                    max_drawdown: 5.0,
                    rsi: 55.0,
                    signal: "BUY".to_string(),
                    confidence: 80.0,
                },
                performance_grade: "A".to_string(),
                issues: vec![],
            },
            EvaluatedHolding {
                symbol: "BAD".to_string(),
                shares: 10.0,
                current_price: 50.0,
                market_value: 500.0,
                cost_basis: 100.0,
                total_return_pct: -50.0,
                metrics: HoldingMetrics {
                    sharpe_ratio: -1.0,
                    annualized_return: -20.0,
                    volatility: 60.0,
                    max_drawdown: 50.0,
                    rsi: 25.0,
                    signal: "SELL".to_string(),
                    confidence: 80.0,
                },
                performance_grade: "F".to_string(),
                issues: vec!["bad".to_string()],
            },
        ];
        let drops = vec![DropRecommendation {
            symbol: "BAD".to_string(),
            current_value: 500.0,
            grade: "F".to_string(),
            primary_reason: "bad".to_string(),
            all_reasons: vec![],
            urgency: "HIGH".to_string(),
            estimated_loss_if_held: 100.0,
            tax_impact_note: "note".to_string(),
        }];
        let replacements = vec![ReplacementOption {
            symbol: "NEW".to_string(),
            score: 80.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 1.5,
                annualized_return: 15.0,
                volatility: 20.0,
                max_drawdown: 10.0,
                rsi: 55.0,
                signal: "BUY".to_string(),
                confidence: 80.0,
            },
            why_better: vec!["Better".to_string()],
            suggested_allocation_pct: 50.0,
            suggested_amount: 500.0,
        }];
        let result =
            PortfolioOptimizer::calculate_projected_health(&holdings, &drops, &replacements);
        // remaining: GOOD = A (100) * 500/1000 = 50
        // replacement: 88 * 500/1000 = 44
        // total = 94
        assert!((result - 94.0).abs() < 1e-6, "Expected 94, got {}", result);
    }

    // ===== evaluate_holding with no metrics =====

    #[test]
    fn test_evaluate_holding_no_metrics() {
        let evaluated = PortfolioOptimizer::evaluate_holding(
            "UNKNOWN",
            10.0,
            100.0,
            110.0,
            None,
            &OptimizationThresholds::default(),
        );
        assert_eq!(evaluated.performance_grade, "N/A");
        assert_eq!(evaluated.issues.len(), 1);
        assert!(evaluated.issues[0].contains("No metrics data"));
    }

    #[test]
    fn test_evaluate_holding_zero_cost() {
        let evaluated = PortfolioOptimizer::evaluate_holding(
            "ZERO",
            10.0,
            0.0,
            50.0,
            None,
            &OptimizationThresholds::default(),
        );
        assert!((evaluated.total_return_pct - 0.0).abs() < f64::EPSILON);
    }

    // ===== generate_summary tests =====

    #[test]
    fn test_summary_no_drops() {
        let summary = PortfolioOptimizer::generate_summary(&[], &[], 80.0, 80.0);
        assert!(summary.contains("healthy"));
    }

    #[test]
    fn test_summary_with_drops() {
        let drops = vec![DropRecommendation {
            symbol: "BAD".to_string(),
            current_value: 500.0,
            grade: "F".to_string(),
            primary_reason: "bad".to_string(),
            all_reasons: vec![],
            urgency: "HIGH".to_string(),
            estimated_loss_if_held: 100.0,
            tax_impact_note: "note".to_string(),
        }];
        let summary = PortfolioOptimizer::generate_summary(&drops, &[], 60.0, 80.0);
        assert!(summary.contains("BAD"));
        assert!(summary.contains("immediate attention"));
    }

    // ===== generate_action_plan tests =====

    #[test]
    fn test_action_plan_empty() {
        let plan = PortfolioOptimizer::generate_action_plan(&[], &[], &HashMap::new());
        assert!((plan.total_to_sell - 0.0).abs() < f64::EPSILON);
        assert!((plan.total_to_buy - 0.0).abs() < f64::EPSILON);
        assert!((plan.estimated_improvement_pct - 0.0).abs() < f64::EPSILON);
        assert!(plan.steps.is_empty());
    }

    #[test]
    fn test_action_plan_with_actions() {
        let drops = vec![DropRecommendation {
            symbol: "BAD".to_string(),
            current_value: 1000.0,
            grade: "F".to_string(),
            primary_reason: "poor performance".to_string(),
            all_reasons: vec![],
            urgency: "HIGH".to_string(),
            estimated_loss_if_held: 200.0,
            tax_impact_note: "note".to_string(),
        }];
        let replacements = vec![ReplacementOption {
            symbol: "NEW".to_string(),
            score: 80.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 1.5,
                annualized_return: 15.0,
                volatility: 20.0,
                max_drawdown: 10.0,
                rsi: 55.0,
                signal: "BUY".to_string(),
                confidence: 80.0,
            },
            why_better: vec!["Better returns".to_string()],
            suggested_allocation_pct: 50.0,
            suggested_amount: 500.0,
        }];
        let plan = PortfolioOptimizer::generate_action_plan(&drops, &replacements, &HashMap::new());
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.steps[0].action, "SELL");
        assert_eq!(plan.steps[1].action, "BUY");
        assert!((plan.total_to_sell - 1000.0).abs() < f64::EPSILON);
        assert!((plan.estimated_improvement_pct - 15.0).abs() < f64::EPSILON);
    }

    // ===== RSI overbought branch =====

    #[test]
    fn test_evaluate_holding_rsi_overbought() {
        // Covers lines 268-269: RSI > 75 adds issue and reduces score
        let mut metrics = create_test_metrics(1.5, 15.0, 20.0, 10.0, "BUY");
        metrics.rsi = 80.0; // overbought
        let mut holding_metrics = HashMap::new();
        holding_metrics.insert("RSI_HIGH".to_string(), metrics);

        let evaluated = PortfolioOptimizer::evaluate_holding(
            "RSI_HIGH",
            10.0,
            100.0,
            150.0,
            holding_metrics.get("RSI_HIGH"),
            &OptimizationThresholds::default(),
        );
        // Should have the overbought issue
        assert!(evaluated.issues.iter().any(|i| i.contains("Overbought")));
    }

    #[test]
    fn test_identify_drops_d_grade_urgency_medium() {
        // Covers lines 328-329: urgency = "MEDIUM" for D grade
        let holdings = vec![EvaluatedHolding {
            symbol: "D_GRADE".to_string(),
            shares: 10.0,
            current_price: 50.0,
            market_value: 500.0,
            cost_basis: 100.0,
            total_return_pct: -50.0,
            metrics: HoldingMetrics {
                sharpe_ratio: -0.2,
                annualized_return: 5.0, // positive to cover line 340
                volatility: 50.0,
                max_drawdown: 40.0,
                rsi: 35.0,
                signal: "SELL".to_string(),
                confidence: 70.0,
            },
            performance_grade: "D".to_string(),
            issues: vec!["Issue1".to_string(), "Issue2".to_string()], // 2+ issues needed
        }];
        let drops =
            PortfolioOptimizer::identify_drops(&holdings, &OptimizationThresholds::default());
        assert_eq!(drops.len(), 1);
        assert_eq!(drops[0].urgency, "MEDIUM");
        // With positive annualized_return, estimated_loss = 0.0 (covers line 340)
        assert!((drops[0].estimated_loss_if_held - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_identify_drops_positive_return_gain_tax_note() {
        // Covers lines 350-351: tax note when total_return_pct > 0 (gain)
        let holdings = vec![EvaluatedHolding {
            symbol: "GAIN_DROP".to_string(),
            shares: 10.0,
            current_price: 60.0,
            market_value: 600.0,
            cost_basis: 50.0,
            total_return_pct: 20.0, // positive gain → covers lines 350-351
            metrics: HoldingMetrics {
                sharpe_ratio: -0.3,
                annualized_return: -5.0,
                volatility: 55.0,
                max_drawdown: 45.0,
                rsi: 30.0,
                signal: "SELL".to_string(),
                confidence: 70.0,
            },
            performance_grade: "D".to_string(),
            issues: vec!["Issue1".to_string(), "Issue2".to_string()],
        }];
        let drops =
            PortfolioOptimizer::identify_drops(&holdings, &OptimizationThresholds::default());
        assert_eq!(drops.len(), 1);
        assert!(
            drops[0].tax_impact_note.contains("gain") || drops[0].tax_impact_note.contains("20.0%")
        );
    }

    #[test]
    fn test_projected_health_zero_total_value() {
        // Covers line 553: total_value <= 0.0 → return 0.0
        let holdings = vec![EvaluatedHolding {
            symbol: "Z".to_string(),
            shares: 0.0,
            current_price: 0.0,
            market_value: 0.0,
            cost_basis: 0.0,
            total_return_pct: 0.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 0.0,
                annualized_return: 0.0,
                volatility: 0.0,
                max_drawdown: 0.0,
                rsi: 50.0,
                signal: "HOLD".to_string(),
                confidence: 0.0,
            },
            performance_grade: "C".to_string(),
            issues: vec![],
        }];
        let drops = vec![DropRecommendation {
            symbol: "Z".to_string(),
            current_value: 0.0,
            grade: "C".to_string(),
            primary_reason: "zero".to_string(),
            all_reasons: vec![],
            urgency: "LOW".to_string(),
            estimated_loss_if_held: 0.0,
            tax_impact_note: "none".to_string(),
        }];
        let result = PortfolioOptimizer::calculate_projected_health(&holdings, &drops, &[]);
        assert_eq!(result, 0.0); // line 553
    }

    // ===== generate_optimization_report tests =====

    #[test]
    fn test_generate_optimization_report_empty() {
        let report = PortfolioOptimizer::generate_optimization_report(
            "Test Portfolio",
            vec![],
            &HashMap::new(),
            &HashMap::new(),
            OptimizationThresholds::default(),
        );
        assert_eq!(report.portfolio_name, "Test Portfolio");
        assert!(report.evaluated_holdings.is_empty());
        assert!(report.drop_recommendations.is_empty());
    }

    #[test]
    fn test_generate_optimization_report_good_holding() {
        let mut holding_metrics = HashMap::new();
        holding_metrics.insert(
            "AAPL".to_string(),
            create_test_metrics(2.0, 20.0, 15.0, 8.0, "BUY"),
        );

        let holdings = vec![("AAPL".to_string(), 10.0, 100.0, 150.0)];

        let report = PortfolioOptimizer::generate_optimization_report(
            "Growth Portfolio",
            holdings,
            &holding_metrics,
            &HashMap::new(),
            OptimizationThresholds::default(),
        );

        assert_eq!(report.evaluated_holdings.len(), 1);
        assert_eq!(report.evaluated_holdings[0].symbol, "AAPL");
        assert!(report.current_health_score > 0.0);
    }

    #[test]
    fn test_generate_optimization_report_poor_holding_with_candidates() {
        let mut holding_metrics = HashMap::new();
        // Poor holding: low sharpe, high vol, bad signal
        holding_metrics.insert(
            "BAD".to_string(),
            create_test_metrics(-0.5, -10.0, 60.0, 50.0, "SELL"),
        );

        let mut candidate_metrics = HashMap::new();
        // Good candidate
        candidate_metrics.insert(
            "GOOD".to_string(),
            create_test_metrics(2.0, 20.0, 15.0, 8.0, "STRONG BUY"),
        );

        let holdings = vec![("BAD".to_string(), 10.0, 150.0, 100.0)]; // at a loss

        let report = PortfolioOptimizer::generate_optimization_report(
            "Test Portfolio",
            holdings,
            &holding_metrics,
            &candidate_metrics,
            OptimizationThresholds::default(),
        );

        assert_eq!(report.evaluated_holdings.len(), 1);
        // The bad holding should generate issues and potentially drop recommendations
        assert!(!report.evaluated_holdings[0].issues.is_empty());
        // Projected health should still be valid
        assert!(report.projected_health_score >= 0.0);
    }

    #[test]
    fn test_generate_optimization_report_no_metrics() {
        // Holdings with no metrics data
        let holdings = vec![
            ("AAPL".to_string(), 10.0, 100.0, 150.0),
            ("MSFT".to_string(), 5.0, 200.0, 250.0),
        ];

        let report = PortfolioOptimizer::generate_optimization_report(
            "No Metrics Portfolio",
            holdings,
            &HashMap::new(),
            &HashMap::new(),
            OptimizationThresholds::default(),
        );

        assert_eq!(report.evaluated_holdings.len(), 2);
        for holding in &report.evaluated_holdings {
            assert_eq!(holding.performance_grade, "N/A");
        }
    }

    #[test]
    fn test_identify_drops_low_urgency_c_grade() {
        // Covers line 329: _ => "LOW" for grade != "F" and != "D" but 2+ issues
        let holdings = vec![EvaluatedHolding {
            symbol: "C_GRADE".to_string(),
            shares: 10.0,
            current_price: 80.0,
            market_value: 800.0,
            cost_basis: 100.0,
            total_return_pct: -20.0,
            metrics: HoldingMetrics {
                sharpe_ratio: 0.2,
                annualized_return: 3.0,
                volatility: 35.0,
                max_drawdown: 25.0,
                rsi: 40.0,
                signal: "HOLD".to_string(),
                confidence: 50.0,
            },
            performance_grade: "C".to_string(),
            issues: vec!["Issue1".to_string(), "Issue2".to_string()],
        }];

        let drops =
            PortfolioOptimizer::identify_drops(&holdings, &OptimizationThresholds::default());
        assert_eq!(drops.len(), 1);
        assert_eq!(drops[0].urgency, "LOW");
    }

    #[test]
    fn test_find_replacements_four_candidates() {
        // Covers line 413: allocation_pct = 15.0 for i >= 3
        let thresholds = OptimizationThresholds::default();
        let current_holdings: Vec<EvaluatedHolding> = vec![];
        // 4 candidates → num_recommendations = ceil(4000/1000).max(3).min(10) = 4
        let total_to_reallocate = 4000.0_f64;

        let mut candidates = HashMap::new();
        for sym in ["CAND1", "CAND2", "CAND3", "CAND4"] {
            let mut m = create_test_metrics(1.0, 10.0, 20.0, 15.0, "BUY");
            m.symbol = sym.to_string();
            candidates.insert(sym.to_string(), m);
        }

        let replacements = PortfolioOptimizer::find_replacements(
            &candidates,
            &current_holdings,
            total_to_reallocate,
            &thresholds,
        );

        assert_eq!(replacements.len(), 4);
        // The 4th replacement (index 3) should have allocation_pct = 15.0
        assert!((replacements[3].suggested_allocation_pct - 15.0).abs() < f64::EPSILON);
    }
}
