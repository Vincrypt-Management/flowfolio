use serde::{Deserialize, Serialize};

/// Factor scores for a symbol
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolScore {
    pub symbol: String,
    pub total_score: f64,
    pub factors: Vec<FactorScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactorScore {
    pub name: String,
    pub raw_value: f64,
    pub normalized_value: f64,
    pub weight: f64,
    pub contribution: f64,
}

/// Scoring engine for ranking symbols
pub struct ScoringEngine;

impl ScoringEngine {
    /// Calculate scores for symbols
    pub fn calculate_scores(_symbols: &[String]) -> Vec<SymbolScore> {
        // TODO: Implement scoring logic
        vec![]
    }
}
