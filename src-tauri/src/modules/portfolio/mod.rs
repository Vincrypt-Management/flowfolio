pub mod review;
pub mod optimizer;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use optimizer::{
    PortfolioOptimizer, PortfolioOptimizationReport,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portfolio {
    pub name: String,
    pub holdings: Vec<Holding>,
    pub cash: f64,
    pub total_value: f64,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Holding {
    pub symbol: String,
    pub shares: f64,
    pub cost_basis: f64,
    pub current_price: f64,
    pub market_value: f64,
    pub target_pct: f64,
    pub current_pct: f64,
    pub drift_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuyList {
    pub date: String,
    pub total_contribution: f64,
    pub recommendations: Vec<BuyRecommendation>,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuyRecommendation {
    pub symbol: String,
    pub action: String, // "BUY" or "ADD"
    pub amount: f64,
    pub shares: f64,
    pub rationale: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocationPlan {
    pub method: String,
    pub allocations: Vec<TargetAllocation>,
    pub constraints: AllocationConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetAllocation {
    pub symbol: String,
    pub target_pct: f64,
    pub score: f64,
    pub weight_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocationConstraints {
    pub max_position_pct: f64,
    pub min_position_pct: f64,
    pub max_sector_pct: Option<f64>,
    pub cash_buffer_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebalanceReport {
    pub date: String,
    pub drift_detected: bool,
    pub max_drift_pct: f64,
    pub threshold_pct: f64,
    pub actions: Vec<RebalanceAction>,
    pub estimated_transactions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebalanceAction {
    pub symbol: String,
    pub action: String, // "BUY", "SELL", "HOLD"
    pub current_pct: f64,
    pub target_pct: f64,
    pub drift_pct: f64,
    pub amount: f64,
    pub shares: f64,
}

impl Portfolio {
    pub fn new(name: String) -> Self {
        Self {
            name,
            holdings: Vec::new(),
            cash: 0.0,
            total_value: 0.0,
            last_updated: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn calculate_total_value(&mut self) {
        self.total_value = self.holdings.iter()
            .map(|h| h.market_value)
            .sum::<f64>() + self.cash;
    }

    pub fn update_percentages(&mut self) {
        if self.total_value == 0.0 {
            return;
        }

        for holding in &mut self.holdings {
            holding.current_pct = (holding.market_value / self.total_value) * 100.0;
            holding.drift_pct = holding.current_pct - holding.target_pct;
        }
    }

    pub fn add_holding(&mut self, holding: Holding) {
        self.holdings.push(holding);
        self.calculate_total_value();
        self.update_percentages();
    }

    pub fn get_max_drift(&self) -> f64 {
        self.holdings.iter()
            .map(|h| h.drift_pct.abs())
            .fold(0.0, f64::max)
    }
}

impl Holding {
    pub fn new(
        symbol: String,
        shares: f64,
        cost_basis: f64,
        current_price: f64,
        target_pct: f64,
    ) -> Self {
        let market_value = shares * current_price;
        
        Self {
            symbol,
            shares,
            cost_basis,
            current_price,
            market_value,
            target_pct,
            current_pct: 0.0,
            drift_pct: 0.0,
        }
    }

    pub fn update_price(&mut self, new_price: f64) {
        self.current_price = new_price;
        self.market_value = self.shares * new_price;
    }
}

/// Portfolio construction and management
pub struct PortfolioManager;

impl PortfolioManager {
    /// Generate equal-weight allocation
    pub fn equal_weight_allocation(
        symbols: Vec<String>,
        constraints: AllocationConstraints,
    ) -> AllocationPlan {
        let num_symbols = symbols.len() as f64;
        let equal_pct = ((100.0 - constraints.cash_buffer_pct) / num_symbols)
            .min(constraints.max_position_pct);

        let allocations = symbols.into_iter()
            .map(|symbol| TargetAllocation {
                symbol,
                target_pct: equal_pct,
                score: 0.0,
                weight_reason: "Equal weight allocation".to_string(),
            })
            .collect();

        AllocationPlan {
            method: "equal_weight".to_string(),
            allocations,
            constraints,
        }
    }

    /// Generate score-weighted allocation
    pub fn score_weighted_allocation(
        symbols_with_scores: Vec<(String, f64)>,
        constraints: AllocationConstraints,
    ) -> AllocationPlan {
        let total_score: f64 = symbols_with_scores.iter()
            .map(|(_, score)| score)
            .sum();

        if total_score == 0.0 {
            // Fallback to equal weight
            return Self::equal_weight_allocation(
                symbols_with_scores.into_iter().map(|(s, _)| s).collect(),
                constraints,
            );
        }

        let investable_pct = 100.0 - constraints.cash_buffer_pct;

        let allocations = symbols_with_scores.into_iter()
            .map(|(symbol, score)| {
                let raw_pct = (score / total_score) * investable_pct;
                let target_pct = raw_pct
                    .max(constraints.min_position_pct)
                    .min(constraints.max_position_pct);

                TargetAllocation {
                    symbol,
                    target_pct,
                    score,
                    weight_reason: format!("Score-weighted: {:.1}/100", score),
                }
            })
            .collect();

        AllocationPlan {
            method: "score_weighted".to_string(),
            allocations,
            constraints,
        }
    }

    /// Generate monthly buy list
    pub fn generate_buy_list(
        contribution: f64,
        portfolio: &Portfolio,
        allocation_plan: &AllocationPlan,
        prices: &HashMap<String, f64>,
    ) -> BuyList {
        let mut recommendations = Vec::new();

        // Calculate current total including new contribution
        let new_total = portfolio.total_value + contribution;

        // For each target allocation, calculate how much to buy
        for target in &allocation_plan.allocations {
            let target_value = (target.target_pct / 100.0) * new_total;
            
            // Find current holding
            let current_value = portfolio.holdings.iter()
                .find(|h| h.symbol == target.symbol)
                .map(|h| h.market_value)
                .unwrap_or(0.0);

            let needed_value = target_value - current_value;

            if needed_value > 10.0 { // Minimum $10 purchase
                let price = prices.get(&target.symbol).unwrap_or(&100.0);
                let shares = (needed_value / price).floor();

                if shares > 0.0 {
                    let action = if current_value > 0.0 { "ADD" } else { "BUY" };
                    
                    recommendations.push(BuyRecommendation {
                        symbol: target.symbol.clone(),
                        action: action.to_string(),
                        amount: shares * price,
                        shares,
                        rationale: format!(
                            "Target: {:.1}%, Current: {:.1}%, Score: {:.1}",
                            target.target_pct,
                            (current_value / new_total) * 100.0,
                            target.score
                        ),
                        priority: 1,
                    });
                }
            }
        }

        // Sort by largest gap first
        recommendations.sort_by(|a, b| {
            b.amount.partial_cmp(&a.amount).unwrap_or(std::cmp::Ordering::Equal)
        });

        // Update priorities
        for (i, rec) in recommendations.iter_mut().enumerate() {
            rec.priority = (i + 1) as i32;
        }

        let rationale = format!(
            "Monthly contribution of ${:.2} allocated across {} positions using {} method",
            contribution,
            recommendations.len(),
            allocation_plan.method
        );

        BuyList {
            date: chrono::Utc::now().to_rfc3339(),
            total_contribution: contribution,
            recommendations,
            rationale,
        }
    }

    /// Check if rebalancing is needed
    pub fn check_rebalance(
        portfolio: &Portfolio,
        threshold_pct: f64,
    ) -> RebalanceReport {
        let max_drift = portfolio.get_max_drift();
        let drift_detected = max_drift > threshold_pct;

        let actions = if drift_detected {
            portfolio.holdings.iter()
                .filter(|h| h.drift_pct.abs() > threshold_pct)
                .map(|h| {
                    let action = if h.drift_pct > 0.0 {
                        "SELL"
                    } else {
                        "BUY"
                    };

                    let target_value = (h.target_pct / 100.0) * portfolio.total_value;
                    let amount = target_value - h.market_value;
                    let shares = (amount / h.current_price).abs();

                    RebalanceAction {
                        symbol: h.symbol.clone(),
                        action: action.to_string(),
                        current_pct: h.current_pct,
                        target_pct: h.target_pct,
                        drift_pct: h.drift_pct,
                        amount: amount.abs(),
                        shares,
                    }
                })
                .collect()
        } else {
            Vec::new()
        };

        let estimated_transactions = actions.len();

        RebalanceReport {
            date: chrono::Utc::now().to_rfc3339(),
            drift_detected,
            max_drift_pct: max_drift,
            threshold_pct,
            actions,
            estimated_transactions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equal_weight_allocation() {
        let symbols = vec!["AAPL".to_string(), "MSFT".to_string(), "GOOGL".to_string()];
        let constraints = AllocationConstraints {
            max_position_pct: 50.0,
            min_position_pct: 1.0,
            max_sector_pct: None,
            cash_buffer_pct: 5.0,
        };

        let plan = PortfolioManager::equal_weight_allocation(symbols, constraints);
        
        assert_eq!(plan.method, "equal_weight");
        assert_eq!(plan.allocations.len(), 3);
        
        // Each should get ~31.67% (95% / 3)
        for alloc in plan.allocations {
            assert!((alloc.target_pct - 31.67).abs() < 0.1);
        }
    }

    #[test]
    fn test_portfolio_drift_calculation() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.total_value = 10000.0;

        let holding = Holding::new(
            "AAPL".to_string(),
            10.0,
            150.0,
            180.0,
            20.0, // Target 20%
        );

        portfolio.add_holding(holding);
        
        // Current is 18% (1800/10000), target is 20%, drift is -2%
        assert!((portfolio.holdings[0].current_pct - 18.0).abs() < 0.1);
        assert!((portfolio.holdings[0].drift_pct + 2.0).abs() < 0.1);
    }
}
