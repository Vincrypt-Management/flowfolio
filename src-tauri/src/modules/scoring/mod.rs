pub mod factors;
pub mod parser;

use serde::{Deserialize, Serialize};
use factors::{FinancialMetrics, MomentumMetrics};
use std::collections::HashMap;

/// Factor scores for a symbol
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolScore {
    pub symbol: String,
    pub total_score: f64,
    pub factors: Vec<FactorScore>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactorScore {
    pub name: String,
    pub raw_value: Option<f64>,
    pub normalized_value: f64,
    pub weight: f64,
    pub contribution: f64,
}

/// Scoring engine configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoringConfig {
    pub factor_weights: HashMap<String, f64>,
}

impl Default for ScoringConfig {
    fn default() -> Self {
        let mut weights = HashMap::new();
        weights.insert("quality".to_string(), 0.25);
        weights.insert("value".to_string(), 0.25);
        weights.insert("momentum".to_string(), 0.25);
        weights.insert("growth".to_string(), 0.25);
        
        Self { factor_weights: weights }
    }
}

/// Scoring engine for ranking symbols
pub struct ScoringEngine {
    config: ScoringConfig,
}

impl ScoringEngine {
    pub fn new(config: ScoringConfig) -> Self {
        Self { config }
    }
    
    pub fn with_default_config() -> Self {
        Self::new(ScoringConfig::default())
    }
    
    /// Calculate comprehensive score for a symbol
    pub fn calculate_score(
        &self,
        symbol: &str,
        financial_metrics: &FinancialMetrics,
        momentum_metrics: &MomentumMetrics,
    ) -> SymbolScore {
        let mut factors = Vec::new();
        let mut total_contribution = 0.0;
        let mut total_weight = 0.0;
        
        // Quality factor
        if let Some(weight) = self.config.factor_weights.get("quality") {
            if let Some(score) = financial_metrics.quality_score() {
                let contribution = score * weight;
                factors.push(FactorScore {
                    name: "quality".to_string(),
                    raw_value: None, // Composite score
                    normalized_value: score,
                    weight: *weight,
                    contribution,
                });
                total_contribution += contribution;
                total_weight += weight;
            }
        }
        
        // Value factor
        if let Some(weight) = self.config.factor_weights.get("value") {
            if let Some(score) = financial_metrics.value_score() {
                let contribution = score * weight;
                factors.push(FactorScore {
                    name: "value".to_string(),
                    raw_value: None,
                    normalized_value: score,
                    weight: *weight,
                    contribution,
                });
                total_contribution += contribution;
                total_weight += weight;
            }
        }
        
        // Growth factor
        if let Some(weight) = self.config.factor_weights.get("growth") {
            if let Some(score) = financial_metrics.growth_score() {
                let contribution = score * weight;
                factors.push(FactorScore {
                    name: "growth".to_string(),
                    raw_value: None,
                    normalized_value: score,
                    weight: *weight,
                    contribution,
                });
                total_contribution += contribution;
                total_weight += weight;
            }
        }
        
        // Momentum factor
        if let Some(weight) = self.config.factor_weights.get("momentum") {
            if let Some(score) = momentum_metrics.momentum_score() {
                let contribution = score * weight;
                factors.push(FactorScore {
                    name: "momentum".to_string(),
                    raw_value: None,
                    normalized_value: score,
                    weight: *weight,
                    contribution,
                });
                total_contribution += contribution;
                total_weight += weight;
            }
        }
        
        // Dividend factor (if configured)
        if let Some(weight) = self.config.factor_weights.get("dividend") {
            if let Some(score) = financial_metrics.dividend_score() {
                let contribution = score * weight;
                factors.push(FactorScore {
                    name: "dividend".to_string(),
                    raw_value: None,
                    normalized_value: score,
                    weight: *weight,
                    contribution,
                });
                total_contribution += contribution;
                total_weight += weight;
            }
        }
        
        // Calculate final score (normalized to 0-100)
        let total_score = if total_weight > 0.0 {
            total_contribution / total_weight
        } else {
            0.0
        };
        
        // Generate explanation
        let explanation = self.generate_explanation(&factors, total_score);
        
        SymbolScore {
            symbol: symbol.to_string(),
            total_score,
            factors,
            explanation,
        }
    }
    
    /// Generate human-readable explanation
    fn generate_explanation(&self, factors: &[FactorScore], total_score: f64) -> String {
        let mut parts = Vec::new();
        
        parts.push(format!("Overall Score: {:.1}/100", total_score));
        
        // Sort factors by contribution (descending)
        let mut sorted_factors = factors.to_vec();
        sorted_factors.sort_by(|a, b| b.contribution.partial_cmp(&a.contribution).unwrap());
        
        parts.push("Factor Breakdown:".to_string());
        for factor in &sorted_factors {
            parts.push(format!(
                "  • {} ({:.0}% weight): {:.1}/100 → contributes {:.1} points",
                factor.name.to_uppercase(),
                factor.weight * 100.0,
                factor.normalized_value,
                factor.contribution
            ));
        }
        
        // Interpretation
        if total_score >= 80.0 {
            parts.push("⭐ Strong candidate across all factors".to_string());
        } else if total_score >= 60.0 {
            parts.push("✓ Solid candidate with good overall profile".to_string());
        } else if total_score >= 40.0 {
            parts.push("○ Mixed signals, review specific factors".to_string());
        } else {
            parts.push("⚠ Below average on key metrics".to_string());
        }
        
        parts.join("\n")
    }
    
    /// Calculate scores for multiple symbols
    pub fn score_batch(
        &self,
        symbols: Vec<(String, FinancialMetrics, MomentumMetrics)>,
    ) -> Vec<SymbolScore> {
        symbols
            .into_iter()
            .map(|(symbol, financial, momentum)| {
                self.calculate_score(&symbol, &financial, &momentum)
            })
            .collect()
    }
    
    /// Rank symbols by total score (descending)
    pub fn rank_symbols(&self, mut scores: Vec<SymbolScore>) -> Vec<SymbolScore> {
        scores.sort_by(|a, b| {
            b.total_score.partial_cmp(&a.total_score).unwrap_or(std::cmp::Ordering::Equal)
        });
        scores
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_scoring_engine() {
        let engine = ScoringEngine::with_default_config();
        
        let financial = FinancialMetrics {
            roe: Some(0.20),
            roic: Some(0.15),
            pe_ratio: Some(15.0),
            pb_ratio: Some(2.0),
            revenue_growth_yoy: Some(0.12),
            ..Default::default()
        };
        
        let momentum = MomentumMetrics {
            return_3m: Some(0.05),
            return_6m: Some(0.10),
            return_12m: Some(0.15),
            ..Default::default()
        };
        
        let score = engine.calculate_score("TEST", &financial, &momentum);
        
        assert!(score.total_score > 0.0);
        assert!(score.total_score <= 100.0);
        assert!(!score.factors.is_empty());
        assert!(!score.explanation.is_empty());
    }
}
