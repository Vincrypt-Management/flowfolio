use serde::{Deserialize, Serialize};
use anyhow::Result;

/// VibePlan structure - the core investing plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VibePlanScript {
    pub name: String,
    pub universe: UniverseDefinition,
    pub filters: Vec<FilterRule>,
    pub ranking: RankingConfig,
    pub portfolio: PortfolioConfig,
    pub cadence: CadencePolicy,
    pub risk: RiskPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniverseDefinition {
    pub exchanges: Vec<String>,
    pub regions: Vec<String>,
    pub sectors: Vec<String>,
    pub exclude_list: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterRule {
    pub name: String,
    pub field: String,
    pub operator: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankingConfig {
    pub factors: Vec<FactorWeight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactorWeight {
    pub name: String,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioConfig {
    pub allocation_method: String,
    pub max_position_pct: f64,
    pub sector_caps: Option<serde_json::Value>,
    pub cash_buffer_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CadencePolicy {
    pub monthly_contributions: bool,
    pub quarterly_rebalance: bool,
    pub yearly_review: bool,
    pub rebalance_threshold_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskPolicy {
    pub max_drawdown_pct: Option<f64>,
    pub max_concentration_pct: f64,
}

/// Plan compiler - converts prompts/templates to VibePlan
pub struct PlanCompiler;

impl PlanCompiler {
    /// Compile a prompt into a VibePlan
    pub fn from_prompt(_prompt: &str) -> Result<VibePlanScript> {
        // TODO: Implement prompt parsing
        // For now, return a default template
        Ok(Self::default_template())
    }

    /// Get a template plan
    pub fn default_template() -> VibePlanScript {
        VibePlanScript {
            name: "Quality Compounders".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "NASDAQ".to_string()],
                regions: vec!["US".to_string()],
                sectors: vec![],
                exclude_list: vec![],
            },
            filters: vec![],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.4,
                    },
                    FactorWeight {
                        name: "value".to_string(),
                        weight: 0.3,
                    },
                    FactorWeight {
                        name: "momentum".to_string(),
                        weight: 0.3,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "equal_weight".to_string(),
                max_position_pct: 10.0,
                sector_caps: None,
                cash_buffer_pct: 5.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: true,
                yearly_review: true,
                rebalance_threshold_pct: 5.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(20.0),
                max_concentration_pct: 30.0,
            },
        }
    }

    /// Validate a VibePlan
    pub fn validate(plan: &VibePlanScript) -> Result<()> {
        // Basic validation
        if plan.portfolio.max_position_pct <= 0.0 || plan.portfolio.max_position_pct > 100.0 {
            anyhow::bail!("Invalid max_position_pct: must be between 0 and 100");
        }
        
        let total_weight: f64 = plan.ranking.factors.iter().map(|f| f.weight).sum();
        if (total_weight - 1.0).abs() > 0.01 {
            anyhow::bail!("Factor weights must sum to 1.0");
        }

        Ok(())
    }
}
