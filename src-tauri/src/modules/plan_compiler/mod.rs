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

    /// Get a template plan by name
    pub fn get_template(name: &str) -> Option<VibePlanScript> {
        match name {
            "Quality Compounders" => Some(Self::quality_compounders_template()),
            "Dividend Calm" => Some(Self::dividend_calm_template()),
            "AI Picks & Shovels" => Some(Self::ai_infrastructure_template()),
            _ => None,
        }
    }

    /// List available templates
    pub fn list_templates() -> Vec<String> {
        vec![
            "Quality Compounders".to_string(),
            "Dividend Calm".to_string(),
            "AI Picks & Shovels".to_string(),
        ]
    }

    /// Quality Compounders template
    fn quality_compounders_template() -> VibePlanScript {
        VibePlanScript {
            name: "Quality Compounders".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "NASDAQ".to_string()],
                regions: vec!["US".to_string()],
                sectors: vec![],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "Market Cap".to_string(),
                    field: "market_cap".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(1_000_000_000),
                },
                FilterRule {
                    name: "ROE".to_string(),
                    field: "roe".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(15.0),
                },
            ],
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

    /// Dividend Calm template
    fn dividend_calm_template() -> VibePlanScript {
        VibePlanScript {
            name: "Dividend Calm".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "TSX".to_string()],
                regions: vec!["US".to_string(), "CA".to_string()],
                sectors: vec!["Utilities".to_string(), "Consumer Staples".to_string(), "Financials".to_string()],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "Dividend Yield".to_string(),
                    field: "dividend_yield".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(3.0),
                },
                FilterRule {
                    name: "Dividend History".to_string(),
                    field: "dividend_years".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(10),
                },
            ],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "yield".to_string(),
                        weight: 0.5,
                    },
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.3,
                    },
                    FactorWeight {
                        name: "value".to_string(),
                        weight: 0.2,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "yield_weighted".to_string(),
                max_position_pct: 8.0,
                sector_caps: Some(serde_json::json!({"max_sector_pct": 30.0})),
                cash_buffer_pct: 10.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: false,
                yearly_review: true,
                rebalance_threshold_pct: 10.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(15.0),
                max_concentration_pct: 25.0,
            },
        }
    }

    /// AI Infrastructure template
    fn ai_infrastructure_template() -> VibePlanScript {
        VibePlanScript {
            name: "AI Picks & Shovels".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "NASDAQ".to_string()],
                regions: vec!["US".to_string()],
                sectors: vec!["Technology".to_string(), "Communication Services".to_string()],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "Market Cap".to_string(),
                    field: "market_cap".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(5_000_000_000i64),
                },
                FilterRule {
                    name: "Revenue Growth".to_string(),
                    field: "revenue_growth_yoy".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(15.0),
                },
            ],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "growth".to_string(),
                        weight: 0.4,
                    },
                    FactorWeight {
                        name: "momentum".to_string(),
                        weight: 0.3,
                    },
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.3,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "momentum_weighted".to_string(),
                max_position_pct: 15.0,
                sector_caps: None,
                cash_buffer_pct: 5.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: true,
                yearly_review: true,
                rebalance_threshold_pct: 10.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(30.0),
                max_concentration_pct: 40.0,
            },
        }
    }

    /// Get a template plan
    pub fn default_template() -> VibePlanScript {
        Self::quality_compounders_template()
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
