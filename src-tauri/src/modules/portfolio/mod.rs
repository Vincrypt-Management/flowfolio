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

        // Add two holdings so percentages are non-trivial
        let aapl = Holding::new(
            "AAPL".to_string(),
            10.0,  // 10 shares
            150.0, // cost basis
            180.0, // current price -> market_value = 1800
            60.0,  // target 60%
        );
        let msft = Holding::new(
            "MSFT".to_string(),
            10.0,  // 10 shares
            100.0, // cost basis
            120.0, // current price -> market_value = 1200
            40.0,  // target 40%
        );

        portfolio.add_holding(aapl);
        portfolio.add_holding(msft);

        // total_value = 1800 + 1200 = 3000
        // AAPL current_pct = 1800/3000 * 100 = 60.0, target 60 -> drift 0
        // MSFT current_pct = 1200/3000 * 100 = 40.0, target 40 -> drift 0
        assert!((portfolio.total_value - 3000.0).abs() < 0.1);
        assert!((portfolio.holdings[0].current_pct - 60.0).abs() < 0.1);
        assert!(portfolio.holdings[0].drift_pct.abs() < 0.1);
        assert!((portfolio.holdings[1].current_pct - 40.0).abs() < 0.1);
        assert!(portfolio.holdings[1].drift_pct.abs() < 0.1);
    }

    // ===== Portfolio::calculate_total_value tests =====

    #[test]
    fn test_total_value_with_cash() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.cash = 500.0;
        portfolio.holdings.push(Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0));
        portfolio.calculate_total_value();
        // 10 * 150 + 500 = 2000
        assert!((portfolio.total_value - 2000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_total_value_empty_portfolio() {
        let mut portfolio = Portfolio::new("Empty".to_string());
        portfolio.cash = 1000.0;
        portfolio.calculate_total_value();
        assert!((portfolio.total_value - 1000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_total_value_no_cash() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.holdings.push(Holding::new("AAPL".to_string(), 5.0, 100.0, 200.0, 100.0));
        portfolio.calculate_total_value();
        assert!((portfolio.total_value - 1000.0).abs() < f64::EPSILON);
    }

    // ===== Portfolio::update_percentages tests =====

    #[test]
    fn test_update_percentages_zero_total() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.total_value = 0.0;
        portfolio.holdings.push(Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0));
        portfolio.update_percentages();
        // Should not panic, percentages unchanged
        assert!((portfolio.holdings[0].current_pct - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_update_percentages_drift() {
        let mut portfolio = Portfolio::new("Test".to_string());
        let h1 = Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 40.0); // mv=1500, target 40%
        let h2 = Holding::new("MSFT".to_string(), 10.0, 100.0, 100.0, 60.0); // mv=1000, target 60%
        portfolio.holdings.push(h1);
        portfolio.holdings.push(h2);
        portfolio.calculate_total_value();
        portfolio.update_percentages();
        // total = 2500
        // AAPL: 1500/2500*100 = 60%, drift = 60-40 = 20
        // MSFT: 1000/2500*100 = 40%, drift = 40-60 = -20
        assert!((portfolio.holdings[0].current_pct - 60.0).abs() < 1e-6);
        assert!((portfolio.holdings[0].drift_pct - 20.0).abs() < 1e-6);
        assert!((portfolio.holdings[1].current_pct - 40.0).abs() < 1e-6);
        assert!((portfolio.holdings[1].drift_pct - (-20.0)).abs() < 1e-6);
    }

    // ===== Portfolio::get_max_drift tests =====

    #[test]
    fn test_max_drift_no_holdings() {
        let portfolio = Portfolio::new("Empty".to_string());
        assert!((portfolio.get_max_drift() - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_max_drift_with_drift() {
        let mut portfolio = Portfolio::new("Test".to_string());
        let mut h1 = Holding::new("A".to_string(), 10.0, 100.0, 150.0, 50.0);
        h1.drift_pct = 5.0;
        let mut h2 = Holding::new("B".to_string(), 10.0, 100.0, 100.0, 50.0);
        h2.drift_pct = -8.0;
        portfolio.holdings.push(h1);
        portfolio.holdings.push(h2);
        assert!((portfolio.get_max_drift() - 8.0).abs() < f64::EPSILON);
    }

    // ===== Holding::update_price tests =====

    #[test]
    fn test_holding_update_price() {
        let mut holding = Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0);
        assert!((holding.market_value - 1500.0).abs() < f64::EPSILON);
        holding.update_price(200.0);
        assert!((holding.current_price - 200.0).abs() < f64::EPSILON);
        assert!((holding.market_value - 2000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_holding_update_price_zero() {
        let mut holding = Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0);
        holding.update_price(0.0);
        assert!((holding.market_value - 0.0).abs() < f64::EPSILON);
    }

    // ===== Holding::new tests =====

    #[test]
    fn test_holding_new() {
        let h = Holding::new("AAPL".to_string(), 5.0, 100.0, 200.0, 30.0);
        assert_eq!(h.symbol, "AAPL");
        assert!((h.shares - 5.0).abs() < f64::EPSILON);
        assert!((h.cost_basis - 100.0).abs() < f64::EPSILON);
        assert!((h.current_price - 200.0).abs() < f64::EPSILON);
        assert!((h.market_value - 1000.0).abs() < f64::EPSILON);
        assert!((h.target_pct - 30.0).abs() < f64::EPSILON);
        assert!((h.current_pct - 0.0).abs() < f64::EPSILON);
        assert!((h.drift_pct - 0.0).abs() < f64::EPSILON);
    }

    // ===== PortfolioManager::score_weighted_allocation tests =====

    #[test]
    fn test_score_weighted_allocation() {
        let symbols = vec![
            ("AAPL".to_string(), 80.0),
            ("MSFT".to_string(), 20.0),
        ];
        let constraints = AllocationConstraints {
            max_position_pct: 50.0,
            min_position_pct: 5.0,
            max_sector_pct: None,
            cash_buffer_pct: 10.0,
        };
        let plan = PortfolioManager::score_weighted_allocation(symbols, constraints);
        assert_eq!(plan.method, "score_weighted");
        assert_eq!(plan.allocations.len(), 2);
        // AAPL: 80/100 * 90 = 72 -> clamped to max 50
        assert!((plan.allocations[0].target_pct - 50.0).abs() < 1e-6);
        // MSFT: 20/100 * 90 = 18 -> within bounds
        assert!((plan.allocations[1].target_pct - 18.0).abs() < 1e-6);
    }

    #[test]
    fn test_score_weighted_allocation_zero_scores() {
        let symbols = vec![
            ("AAPL".to_string(), 0.0),
            ("MSFT".to_string(), 0.0),
        ];
        let constraints = AllocationConstraints {
            max_position_pct: 50.0,
            min_position_pct: 1.0,
            max_sector_pct: None,
            cash_buffer_pct: 5.0,
        };
        let plan = PortfolioManager::score_weighted_allocation(symbols, constraints);
        // Falls back to equal weight
        assert_eq!(plan.method, "equal_weight");
    }

    #[test]
    fn test_score_weighted_min_position() {
        let symbols = vec![
            ("A".to_string(), 99.0),
            ("B".to_string(), 1.0),
        ];
        let constraints = AllocationConstraints {
            max_position_pct: 80.0,
            min_position_pct: 5.0,
            max_sector_pct: None,
            cash_buffer_pct: 0.0,
        };
        let plan = PortfolioManager::score_weighted_allocation(symbols, constraints);
        // B raw = 1/100*100 = 1% -> clamped to min 5%
        assert!(plan.allocations[1].target_pct >= 5.0);
    }

    // ===== PortfolioManager::generate_buy_list tests =====

    #[test]
    fn test_generate_buy_list_basic() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.total_value = 10000.0;
        portfolio.holdings.push(Holding {
            symbol: "AAPL".to_string(), shares: 10.0, cost_basis: 100.0,
            current_price: 150.0, market_value: 1500.0, target_pct: 30.0,
            current_pct: 15.0, drift_pct: -15.0,
        });

        let plan = AllocationPlan {
            method: "equal_weight".to_string(),
            allocations: vec![
                TargetAllocation { symbol: "AAPL".to_string(), target_pct: 30.0, score: 80.0, weight_reason: "test".to_string() },
                TargetAllocation { symbol: "MSFT".to_string(), target_pct: 30.0, score: 75.0, weight_reason: "test".to_string() },
            ],
            constraints: AllocationConstraints { max_position_pct: 50.0, min_position_pct: 1.0, max_sector_pct: None, cash_buffer_pct: 5.0 },
        };

        let mut prices = HashMap::new();
        prices.insert("AAPL".to_string(), 150.0);
        prices.insert("MSFT".to_string(), 300.0);

        let buy_list = PortfolioManager::generate_buy_list(1000.0, &portfolio, &plan, &prices);
        assert!(!buy_list.recommendations.is_empty());
        assert!(buy_list.rationale.contains("1000.00"));
    }

    #[test]
    fn test_generate_buy_list_empty_portfolio() {
        let portfolio = Portfolio::new("Empty".to_string());
        let plan = AllocationPlan {
            method: "equal_weight".to_string(),
            allocations: vec![
                TargetAllocation { symbol: "AAPL".to_string(), target_pct: 50.0, score: 80.0, weight_reason: "test".to_string() },
            ],
            constraints: AllocationConstraints { max_position_pct: 50.0, min_position_pct: 1.0, max_sector_pct: None, cash_buffer_pct: 5.0 },
        };
        let mut prices = HashMap::new();
        prices.insert("AAPL".to_string(), 150.0);

        let buy_list = PortfolioManager::generate_buy_list(1000.0, &portfolio, &plan, &prices);
        // target_value = 50% of 1000 = 500, current = 0, needed = 500
        // shares = floor(500/150) = 3
        assert_eq!(buy_list.recommendations.len(), 1);
        assert_eq!(buy_list.recommendations[0].action, "BUY");
        assert!((buy_list.recommendations[0].shares - 3.0).abs() < f64::EPSILON);
    }

    // ===== PortfolioManager::check_rebalance tests =====

    #[test]
    fn test_check_rebalance_no_drift() {
        let mut portfolio = Portfolio::new("Test".to_string());
        let mut h = Holding::new("AAPL".to_string(), 10.0, 100.0, 100.0, 100.0);
        h.current_pct = 100.0;
        h.drift_pct = 0.0;
        portfolio.holdings.push(h);
        portfolio.total_value = 1000.0;

        let report = PortfolioManager::check_rebalance(&portfolio, 5.0);
        assert!(!report.drift_detected);
        assert!(report.actions.is_empty());
    }

    #[test]
    fn test_check_rebalance_with_drift() {
        let mut portfolio = Portfolio::new("Test".to_string());
        let mut h1 = Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0);
        h1.market_value = 1500.0;
        h1.current_pct = 60.0;
        h1.drift_pct = 10.0; // 60 - 50 = 10% drift
        let mut h2 = Holding::new("MSFT".to_string(), 10.0, 100.0, 100.0, 50.0);
        h2.market_value = 1000.0;
        h2.current_pct = 40.0;
        h2.drift_pct = -10.0;
        portfolio.holdings.push(h1);
        portfolio.holdings.push(h2);
        portfolio.total_value = 2500.0;

        let report = PortfolioManager::check_rebalance(&portfolio, 5.0);
        assert!(report.drift_detected);
        assert_eq!(report.actions.len(), 2);
        // AAPL drifted +10% -> should SELL
        let aapl_action = report.actions.iter().find(|a| a.symbol == "AAPL").unwrap();
        assert_eq!(aapl_action.action, "SELL");
        // MSFT drifted -10% -> should BUY
        let msft_action = report.actions.iter().find(|a| a.symbol == "MSFT").unwrap();
        assert_eq!(msft_action.action, "BUY");
    }

    #[test]
    fn test_check_rebalance_threshold_boundary() {
        let mut portfolio = Portfolio::new("Test".to_string());
        let mut h = Holding::new("AAPL".to_string(), 10.0, 100.0, 100.0, 50.0);
        h.current_pct = 55.0;
        h.drift_pct = 5.0; // Exactly at threshold
        portfolio.holdings.push(h);
        portfolio.total_value = 1000.0;

        let report = PortfolioManager::check_rebalance(&portfolio, 5.0);
        // max_drift = 5.0, threshold = 5.0, drift_detected = 5.0 > 5.0 = false
        assert!(!report.drift_detected);
    }

    // ===== equal_weight with max_position constraint =====

    #[test]
    fn test_equal_weight_capped_by_max() {
        let symbols = vec!["A".to_string(), "B".to_string()];
        let constraints = AllocationConstraints {
            max_position_pct: 20.0, // cap at 20%
            min_position_pct: 1.0,
            max_sector_pct: None,
            cash_buffer_pct: 0.0,
        };
        let plan = PortfolioManager::equal_weight_allocation(symbols, constraints);
        // equal = 100/2 = 50, but capped at 20
        for alloc in &plan.allocations {
            assert!((alloc.target_pct - 20.0).abs() < f64::EPSILON);
        }
    }

    // ===== Portfolio::add_holding tests =====

    #[test]
    fn test_add_holding_recalculates() {
        let mut portfolio = Portfolio::new("Test".to_string());
        portfolio.cash = 500.0;
        let h = Holding::new("AAPL".to_string(), 10.0, 100.0, 150.0, 50.0);
        portfolio.add_holding(h);
        // total_value = 1500 + 500 = 2000
        assert!((portfolio.total_value - 2000.0).abs() < f64::EPSILON);
        // AAPL pct = 1500/2000*100 = 75
        assert!((portfolio.holdings[0].current_pct - 75.0).abs() < 1e-6);
    }
}
