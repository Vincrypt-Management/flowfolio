#![allow(dead_code)]

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
        sorted_factors.sort_by(|a, b| b.contribution.partial_cmp(&a.contribution).unwrap_or(std::cmp::Ordering::Equal));
        
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
            parts.push("Strong candidate across all factors".to_string());
        } else if total_score >= 60.0 {
            parts.push("Solid candidate with good overall profile".to_string());
        } else if total_score >= 40.0 {
            parts.push("Mixed signals - review specific factors".to_string());
        } else {
            parts.push("Below average on key metrics".to_string());
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

    fn sample_financial() -> FinancialMetrics {
        FinancialMetrics {
            roe: Some(0.20),
            roic: Some(0.15),
            pe_ratio: Some(15.0),
            pb_ratio: Some(2.0),
            revenue_growth_yoy: Some(0.12),
            ..Default::default()
        }
    }

    fn sample_momentum() -> MomentumMetrics {
        MomentumMetrics {
            return_3m: Some(0.05),
            return_6m: Some(0.10),
            return_12m: Some(0.15),
            ..Default::default()
        }
    }

    #[test]
    fn test_scoring_engine() {
        let engine = ScoringEngine::with_default_config();

        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());

        assert!(score.total_score > 0.0);
        assert!(score.total_score <= 100.0);
        assert!(!score.factors.is_empty());
        assert!(!score.explanation.is_empty());
    }

    #[test]
    fn test_scoring_config_default_weights() {
        let config = ScoringConfig::default();
        assert_eq!(config.factor_weights.len(), 4);
        assert_eq!(*config.factor_weights.get("quality").unwrap(), 0.25);
        assert_eq!(*config.factor_weights.get("value").unwrap(), 0.25);
        assert_eq!(*config.factor_weights.get("momentum").unwrap(), 0.25);
        assert_eq!(*config.factor_weights.get("growth").unwrap(), 0.25);
    }

    #[test]
    fn test_scoring_config_weights_sum_to_one() {
        let config = ScoringConfig::default();
        let total: f64 = config.factor_weights.values().sum();
        assert!((total - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_scoring_engine_symbol_name_preserved() {
        let engine = ScoringEngine::with_default_config();
        let score = engine.calculate_score("AAPL", &sample_financial(), &sample_momentum());
        assert_eq!(score.symbol, "AAPL");
    }

    #[test]
    fn test_scoring_engine_score_in_range() {
        let engine = ScoringEngine::with_default_config();
        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());
        assert!(score.total_score >= 0.0);
        assert!(score.total_score <= 100.0);
    }

    #[test]
    fn test_scoring_engine_no_data_gives_zero() {
        let engine = ScoringEngine::with_default_config();
        let financial = FinancialMetrics::default();
        let momentum = MomentumMetrics::default();
        let score = engine.calculate_score("EMPTY", &financial, &momentum);
        assert_eq!(score.total_score, 0.0);
        assert!(score.factors.is_empty());
    }

    #[test]
    fn test_factor_score_contribution() {
        let engine = ScoringEngine::with_default_config();
        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());

        for fs in &score.factors {
            // contribution should equal normalized_value * weight
            let expected = fs.normalized_value * fs.weight;
            assert!((fs.contribution - expected).abs() < 1e-10);
        }
    }

    #[test]
    fn test_rank_symbols_descending_order() {
        let engine = ScoringEngine::with_default_config();

        let scores = vec![
            SymbolScore {
                symbol: "A".to_string(),
                total_score: 30.0,
                factors: vec![],
                explanation: String::new(),
            },
            SymbolScore {
                symbol: "B".to_string(),
                total_score: 80.0,
                factors: vec![],
                explanation: String::new(),
            },
            SymbolScore {
                symbol: "C".to_string(),
                total_score: 55.0,
                factors: vec![],
                explanation: String::new(),
            },
        ];

        let ranked = engine.rank_symbols(scores);
        assert_eq!(ranked[0].symbol, "B");
        assert_eq!(ranked[1].symbol, "C");
        assert_eq!(ranked[2].symbol, "A");
    }

    #[test]
    fn test_rank_symbols_empty_input() {
        let engine = ScoringEngine::with_default_config();
        let ranked = engine.rank_symbols(vec![]);
        assert!(ranked.is_empty());
    }

    #[test]
    fn test_score_batch_returns_all_symbols() {
        let engine = ScoringEngine::with_default_config();

        let batch = vec![
            ("AAPL".to_string(), sample_financial(), sample_momentum()),
            ("MSFT".to_string(), sample_financial(), sample_momentum()),
            ("GOOGL".to_string(), sample_financial(), sample_momentum()),
        ];

        let scores = engine.score_batch(batch);
        assert_eq!(scores.len(), 3);
        let symbols: Vec<&str> = scores.iter().map(|s| s.symbol.as_str()).collect();
        assert!(symbols.contains(&"AAPL"));
        assert!(symbols.contains(&"MSFT"));
        assert!(symbols.contains(&"GOOGL"));
    }

    #[test]
    fn test_score_batch_empty_input() {
        let engine = ScoringEngine::with_default_config();
        let scores = engine.score_batch(vec![]);
        assert!(scores.is_empty());
    }

    #[test]
    fn test_explanation_contains_overall_score() {
        let engine = ScoringEngine::with_default_config();
        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());
        assert!(score.explanation.contains("Overall Score"));
    }

    #[test]
    fn test_explanation_contains_factor_breakdown() {
        let engine = ScoringEngine::with_default_config();
        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());
        assert!(score.explanation.contains("Factor Breakdown"));
    }

    #[test]
    fn test_custom_scoring_config_only_quality() {
        let mut weights = HashMap::new();
        weights.insert("quality".to_string(), 1.0);
        let config = ScoringConfig { factor_weights: weights };
        let engine = ScoringEngine::new(config);

        let score = engine.calculate_score("TEST", &sample_financial(), &sample_momentum());
        // Only quality factor should appear
        assert!(score.factors.iter().all(|f| f.name == "quality"));
    }

    #[test]
    fn test_dividend_factor_included_when_weight_configured() {
        let mut weights = HashMap::new();
        weights.insert("dividend".to_string(), 1.0);
        let config = ScoringConfig { factor_weights: weights };
        let engine = ScoringEngine::new(config);

        let financial = FinancialMetrics {
            dividend_yield: Some(0.04),
            payout_ratio: Some(0.50),
            ..Default::default()
        };

        let score = engine.calculate_score("DIV", &financial, &MomentumMetrics::default());
        assert!(score.factors.iter().any(|f| f.name == "dividend"));
        assert!(score.total_score > 0.0);
    }
}
