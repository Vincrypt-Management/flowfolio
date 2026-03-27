use anyhow::Result;
use serde::{Deserialize, Serialize};

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
            "Value Deep Dive" => Some(Self::value_template()),
            "Small Cap Growth" => Some(Self::small_cap_growth_template()),
            "Global Diversified" => Some(Self::global_diversified_template()),
            _ => None,
        }
    }

    /// List available templates
    pub fn list_templates() -> Vec<String> {
        vec![
            "Quality Compounders".to_string(),
            "Dividend Calm".to_string(),
            "AI Picks & Shovels".to_string(),
            "Value Deep Dive".to_string(),
            "Small Cap Growth".to_string(),
            "Global Diversified".to_string(),
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
                sectors: vec![
                    "Utilities".to_string(),
                    "Consumer Staples".to_string(),
                    "Financials".to_string(),
                ],
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
                sectors: vec![
                    "Technology".to_string(),
                    "Communication Services".to_string(),
                ],
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

    /// Value Deep Dive template
    fn value_template() -> VibePlanScript {
        VibePlanScript {
            name: "Value Deep Dive".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "NASDAQ".to_string()],
                regions: vec!["US".to_string()],
                sectors: vec![],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "P/E Ratio".to_string(),
                    field: "pe_ratio".to_string(),
                    operator: "less_than".to_string(),
                    value: serde_json::json!(20.0),
                },
                FilterRule {
                    name: "P/B Ratio".to_string(),
                    field: "pb_ratio".to_string(),
                    operator: "less_than".to_string(),
                    value: serde_json::json!(3.0),
                },
            ],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "value".to_string(),
                        weight: 0.5,
                    },
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.3,
                    },
                    FactorWeight {
                        name: "momentum".to_string(),
                        weight: 0.2,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "value_weighted".to_string(),
                max_position_pct: 12.0,
                sector_caps: None,
                cash_buffer_pct: 10.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: true,
                yearly_review: true,
                rebalance_threshold_pct: 7.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(25.0),
                max_concentration_pct: 35.0,
            },
        }
    }

    /// Small Cap Growth template
    fn small_cap_growth_template() -> VibePlanScript {
        VibePlanScript {
            name: "Small Cap Growth".to_string(),
            universe: UniverseDefinition {
                exchanges: vec!["NYSE".to_string(), "NASDAQ".to_string()],
                regions: vec!["US".to_string()],
                sectors: vec![
                    "Technology".to_string(),
                    "Healthcare".to_string(),
                    "Consumer Discretionary".to_string(),
                ],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "Market Cap".to_string(),
                    field: "market_cap".to_string(),
                    operator: "between".to_string(),
                    value: serde_json::json!([300_000_000i64, 2_000_000_000i64]),
                },
                FilterRule {
                    name: "Revenue Growth".to_string(),
                    field: "revenue_growth_yoy".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(20.0),
                },
            ],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "growth".to_string(),
                        weight: 0.5,
                    },
                    FactorWeight {
                        name: "momentum".to_string(),
                        weight: 0.35,
                    },
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.15,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "score_weighted".to_string(),
                max_position_pct: 8.0,
                sector_caps: Some(serde_json::json!({"max_sector_pct": 40.0})),
                cash_buffer_pct: 5.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: true,
                yearly_review: true,
                rebalance_threshold_pct: 8.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(35.0),
                max_concentration_pct: 30.0,
            },
        }
    }

    /// Global Diversified template
    fn global_diversified_template() -> VibePlanScript {
        VibePlanScript {
            name: "Global Diversified".to_string(),
            universe: UniverseDefinition {
                exchanges: vec![
                    "NYSE".to_string(),
                    "NASDAQ".to_string(),
                    "LSE".to_string(),
                    "TSX".to_string(),
                ],
                regions: vec![
                    "US".to_string(),
                    "UK".to_string(),
                    "CA".to_string(),
                    "EU".to_string(),
                ],
                sectors: vec![],
                exclude_list: vec![],
            },
            filters: vec![
                FilterRule {
                    name: "Market Cap".to_string(),
                    field: "market_cap".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(10_000_000_000i64),
                },
                FilterRule {
                    name: "Liquidity".to_string(),
                    field: "avg_volume".to_string(),
                    operator: "greater_than".to_string(),
                    value: serde_json::json!(1_000_000i64),
                },
            ],
            ranking: RankingConfig {
                factors: vec![
                    FactorWeight {
                        name: "quality".to_string(),
                        weight: 0.35,
                    },
                    FactorWeight {
                        name: "value".to_string(),
                        weight: 0.35,
                    },
                    FactorWeight {
                        name: "momentum".to_string(),
                        weight: 0.30,
                    },
                ],
            },
            portfolio: PortfolioConfig {
                allocation_method: "equal_weight".to_string(),
                max_position_pct: 5.0,
                sector_caps: Some(
                    serde_json::json!({"max_sector_pct": 25.0, "max_region_pct": 50.0}),
                ),
                cash_buffer_pct: 10.0,
            },
            cadence: CadencePolicy {
                monthly_contributions: true,
                quarterly_rebalance: true,
                yearly_review: true,
                rebalance_threshold_pct: 5.0,
            },
            risk: RiskPolicy {
                max_drawdown_pct: Some(20.0),
                max_concentration_pct: 20.0,
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- list_templates ---

    #[test]
    fn test_list_templates_returns_six_entries() {
        let templates = PlanCompiler::list_templates();
        assert_eq!(templates.len(), 6);
    }

    #[test]
    fn test_list_templates_contains_expected_names() {
        let templates = PlanCompiler::list_templates();
        let expected = [
            "Quality Compounders",
            "Dividend Calm",
            "AI Picks & Shovels",
            "Value Deep Dive",
            "Small Cap Growth",
            "Global Diversified",
        ];
        for name in &expected {
            assert!(
                templates.contains(&name.to_string()),
                "Missing template: {}",
                name
            );
        }
    }

    // --- get_template ---

    #[test]
    fn test_get_template_quality_compounders() {
        let plan = PlanCompiler::get_template("Quality Compounders").unwrap();
        assert_eq!(plan.name, "Quality Compounders");
    }

    #[test]
    fn test_get_template_dividend_calm() {
        let plan = PlanCompiler::get_template("Dividend Calm").unwrap();
        assert_eq!(plan.name, "Dividend Calm");
    }

    #[test]
    fn test_get_template_ai_infrastructure() {
        let plan = PlanCompiler::get_template("AI Picks & Shovels").unwrap();
        assert_eq!(plan.name, "AI Picks & Shovels");
    }

    #[test]
    fn test_get_template_value_deep_dive() {
        let plan = PlanCompiler::get_template("Value Deep Dive").unwrap();
        assert_eq!(plan.name, "Value Deep Dive");
    }

    #[test]
    fn test_get_template_small_cap_growth() {
        let plan = PlanCompiler::get_template("Small Cap Growth").unwrap();
        assert_eq!(plan.name, "Small Cap Growth");
    }

    #[test]
    fn test_get_template_global_diversified() {
        let plan = PlanCompiler::get_template("Global Diversified").unwrap();
        assert_eq!(plan.name, "Global Diversified");
    }

    #[test]
    fn test_get_template_unknown_returns_none() {
        assert!(PlanCompiler::get_template("Nonexistent Template").is_none());
    }

    // --- default_template ---

    #[test]
    fn test_default_template_is_quality_compounders() {
        let plan = PlanCompiler::default_template();
        assert_eq!(plan.name, "Quality Compounders");
    }

    // --- from_prompt ---

    #[test]
    fn test_from_prompt_returns_plan() {
        let plan = PlanCompiler::from_prompt("some prompt").unwrap();
        // Should return the default template for now
        assert!(!plan.name.is_empty());
    }

    // --- validate ---

    #[test]
    fn test_validate_valid_plan_passes() {
        let plan = PlanCompiler::default_template();
        assert!(PlanCompiler::validate(&plan).is_ok());
    }

    #[test]
    fn test_validate_zero_max_position_fails() {
        let mut plan = PlanCompiler::default_template();
        plan.portfolio.max_position_pct = 0.0;
        assert!(PlanCompiler::validate(&plan).is_err());
    }

    #[test]
    fn test_validate_negative_max_position_fails() {
        let mut plan = PlanCompiler::default_template();
        plan.portfolio.max_position_pct = -5.0;
        assert!(PlanCompiler::validate(&plan).is_err());
    }

    #[test]
    fn test_validate_max_position_over_100_fails() {
        let mut plan = PlanCompiler::default_template();
        plan.portfolio.max_position_pct = 101.0;
        assert!(PlanCompiler::validate(&plan).is_err());
    }

    #[test]
    fn test_validate_exactly_100_position_passes() {
        let mut plan = PlanCompiler::default_template();
        plan.portfolio.max_position_pct = 100.0;
        // Need weights to sum to 1.0 — keep the ranking factors
        assert!(PlanCompiler::validate(&plan).is_ok());
    }

    #[test]
    fn test_validate_weights_not_summing_to_one_fails() {
        let mut plan = PlanCompiler::default_template();
        // Corrupt one factor weight
        plan.ranking.factors[0].weight = 0.9;
        assert!(PlanCompiler::validate(&plan).is_err());
    }

    #[test]
    fn test_validate_weights_exactly_one_passes() {
        let mut plan = PlanCompiler::default_template();
        // Overwrite factors to exactly 3 items summing to 1.0
        plan.ranking.factors = vec![
            FactorWeight {
                name: "quality".to_string(),
                weight: 0.5,
            },
            FactorWeight {
                name: "value".to_string(),
                weight: 0.5,
            },
        ];
        assert!(PlanCompiler::validate(&plan).is_ok());
    }

    #[test]
    fn test_validate_empty_factors_fails() {
        let mut plan = PlanCompiler::default_template();
        plan.ranking.factors = vec![];
        // Sum = 0.0, not 1.0 → should fail
        assert!(PlanCompiler::validate(&plan).is_err());
    }

    // --- structure assertions on templates ---

    #[test]
    fn test_quality_compounders_uses_nyse_and_nasdaq() {
        let plan = PlanCompiler::get_template("Quality Compounders").unwrap();
        assert!(plan.universe.exchanges.contains(&"NYSE".to_string()));
        assert!(plan.universe.exchanges.contains(&"NASDAQ".to_string()));
    }

    #[test]
    fn test_dividend_calm_has_sector_caps() {
        let plan = PlanCompiler::get_template("Dividend Calm").unwrap();
        assert!(plan.portfolio.sector_caps.is_some());
    }

    #[test]
    fn test_quality_compounders_has_no_sector_caps() {
        let plan = PlanCompiler::get_template("Quality Compounders").unwrap();
        assert!(plan.portfolio.sector_caps.is_none());
    }

    #[test]
    fn test_every_template_has_at_least_one_filter() {
        for name in PlanCompiler::list_templates() {
            let plan = PlanCompiler::get_template(&name).unwrap();
            assert!(
                !plan.filters.is_empty(),
                "Template '{}' has no filters",
                name
            );
        }
    }

    #[test]
    fn test_every_template_has_at_least_one_factor() {
        for name in PlanCompiler::list_templates() {
            let plan = PlanCompiler::get_template(&name).unwrap();
            assert!(
                !plan.ranking.factors.is_empty(),
                "Template '{}' has no ranking factors",
                name
            );
        }
    }

    #[test]
    fn test_every_template_passes_validation() {
        for name in PlanCompiler::list_templates() {
            let plan = PlanCompiler::get_template(&name).unwrap();
            assert!(
                PlanCompiler::validate(&plan).is_ok(),
                "Template '{}' failed validation",
                name
            );
        }
    }

    #[test]
    fn test_cadence_policy_quarterly_rebalance_quality_compounders() {
        let plan = PlanCompiler::get_template("Quality Compounders").unwrap();
        assert!(plan.cadence.quarterly_rebalance);
        assert!(plan.cadence.monthly_contributions);
        assert!(plan.cadence.yearly_review);
    }

    #[test]
    fn test_risk_policy_max_drawdown_set_for_all_templates() {
        for name in PlanCompiler::list_templates() {
            let plan = PlanCompiler::get_template(&name).unwrap();
            assert!(
                plan.risk.max_drawdown_pct.is_some(),
                "Template '{}' has no max_drawdown_pct",
                name
            );
        }
    }

    #[test]
    fn test_global_diversified_includes_multiple_regions() {
        let plan = PlanCompiler::get_template("Global Diversified").unwrap();
        assert!(plan.universe.regions.len() > 1);
    }
}
