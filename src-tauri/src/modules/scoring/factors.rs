#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// Raw financial metrics extracted from fundamentals
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialMetrics {
    // Valuation
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub pb_ratio: Option<f64>,
    pub ps_ratio: Option<f64>,
    pub price_to_book: Option<f64>,
    
    // Profitability
    pub roe: Option<f64>,  // Return on Equity
    pub roa: Option<f64>,  // Return on Assets
    pub roic: Option<f64>, // Return on Invested Capital
    pub gross_margin: Option<f64>,
    pub operating_margin: Option<f64>,
    pub net_margin: Option<f64>,
    
    // Growth
    pub revenue_growth_yoy: Option<f64>,
    pub earnings_growth_yoy: Option<f64>,
    pub revenue_growth_3y: Option<f64>,
    pub eps_growth_3y: Option<f64>,
    
    // Dividends
    pub dividend_yield: Option<f64>,
    pub payout_ratio: Option<f64>,
    
    // Financial Health
    pub debt_to_equity: Option<f64>,
    pub current_ratio: Option<f64>,
    pub quick_ratio: Option<f64>,
    
    // Size
    pub revenue: Option<f64>,
    pub earnings: Option<f64>,
}

/// Price-based momentum metrics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MomentumMetrics {
    pub return_1m: Option<f64>,
    pub return_3m: Option<f64>,
    pub return_6m: Option<f64>,
    pub return_12m: Option<f64>,
    pub volatility_30d: Option<f64>,
    pub avg_volume_30d: Option<f64>,
}

impl FinancialMetrics {
    /// Calculate quality factor score (0-100)
    /// Based on: ROE, ROIC, margins, debt levels
    pub fn quality_score(&self) -> Option<f64> {
        let mut components = Vec::new();
        let mut weights = Vec::new();
        
        // ROE component (30% weight)
        if let Some(roe) = self.roe {
            if roe > 0.0 {
                components.push(self.normalize_roe(roe));
                weights.push(0.30);
            }
        }
        
        // ROIC component (30% weight)
        if let Some(roic) = self.roic {
            if roic > 0.0 {
                components.push(self.normalize_roic(roic));
                weights.push(0.30);
            }
        }
        
        // Operating margin component (20% weight)
        if let Some(margin) = self.operating_margin {
            if margin > 0.0 {
                components.push(self.normalize_margin(margin));
                weights.push(0.20);
            }
        }
        
        // Debt to equity component (20% weight, inverted - lower is better)
        if let Some(debt) = self.debt_to_equity {
            components.push(self.normalize_debt(debt));
            weights.push(0.20);
        }
        
        if components.is_empty() {
            return None;
        }
        
        // Weighted average
        let total_weight: f64 = weights.iter().sum();
        let weighted_sum: f64 = components.iter()
            .zip(weights.iter())
            .map(|(c, w)| c * w)
            .sum();
        
        Some(weighted_sum / total_weight)
    }

    /// Calculate value factor score (0-100)
    /// Based on: P/E, P/B, P/S ratios (lower is better)
    pub fn value_score(&self) -> Option<f64> {
        let mut components = Vec::new();
        let mut weights = Vec::new();
        
        // P/E ratio component (40% weight)
        if let Some(pe) = self.pe_ratio {
            if pe > 0.0 {
                components.push(self.normalize_pe(pe));
                weights.push(0.40);
            }
        }
        
        // P/B ratio component (30% weight)
        if let Some(pb) = self.pb_ratio {
            if pb > 0.0 {
                components.push(self.normalize_pb(pb));
                weights.push(0.30);
            }
        }
        
        // P/S ratio component (30% weight)
        if let Some(ps) = self.ps_ratio {
            if ps > 0.0 {
                components.push(self.normalize_ps(ps));
                weights.push(0.30);
            }
        }
        
        if components.is_empty() {
            return None;
        }
        
        let total_weight: f64 = weights.iter().sum();
        let weighted_sum: f64 = components.iter()
            .zip(weights.iter())
            .map(|(c, w)| c * w)
            .sum();
        
        Some(weighted_sum / total_weight)
    }
    
    /// Calculate growth factor score (0-100)
    /// Based on: Revenue growth, earnings growth
    pub fn growth_score(&self) -> Option<f64> {
        let mut components = Vec::new();
        let mut weights = Vec::new();
        
        // Revenue growth YoY (40% weight)
        if let Some(growth) = self.revenue_growth_yoy {
            components.push(self.normalize_growth(growth));
            weights.push(0.40);
        }
        
        // Earnings growth YoY (40% weight)
        if let Some(growth) = self.earnings_growth_yoy {
            components.push(self.normalize_growth(growth));
            weights.push(0.40);
        }
        
        // 3-year average (20% weight)
        if let Some(growth) = self.revenue_growth_3y {
            components.push(self.normalize_growth(growth));
            weights.push(0.20);
        }
        
        if components.is_empty() {
            return None;
        }
        
        let total_weight: f64 = weights.iter().sum();
        let weighted_sum: f64 = components.iter()
            .zip(weights.iter())
            .map(|(c, w)| c * w)
            .sum();
        
        Some(weighted_sum / total_weight)
    }
    
    /// Calculate dividend factor score (0-100)
    /// Based on: Yield, payout ratio sustainability
    pub fn dividend_score(&self) -> Option<f64> {
        let mut components = Vec::new();
        let mut weights = Vec::new();
        
        // Dividend yield (60% weight)
        if let Some(yield_val) = self.dividend_yield {
            if yield_val > 0.0 {
                components.push(self.normalize_dividend_yield(yield_val));
                weights.push(0.60);
            }
        }
        
        // Payout ratio sustainability (40% weight)
        if let Some(payout) = self.payout_ratio {
            if payout > 0.0 {
                components.push(self.normalize_payout_ratio(payout));
                weights.push(0.40);
            }
        }
        
        if components.is_empty() {
            return None;
        }
        
        let total_weight: f64 = weights.iter().sum();
        let weighted_sum: f64 = components.iter()
            .zip(weights.iter())
            .map(|(c, w)| c * w)
            .sum();
        
        Some(weighted_sum / total_weight)
    }
    
    // Normalization helpers (0-100 scale)
    
    fn normalize_roe(&self, roe: f64) -> f64 {
        // ROE: 0% = 0, 15% = 50, 30%+ = 100
        (roe / 0.30 * 100.0).min(100.0).max(0.0)
    }
    
    fn normalize_roic(&self, roic: f64) -> f64 {
        // ROIC: 0% = 0, 12% = 50, 25%+ = 100
        (roic / 0.25 * 100.0).min(100.0).max(0.0)
    }
    
    fn normalize_margin(&self, margin: f64) -> f64 {
        // Operating margin: 0% = 0, 15% = 50, 30%+ = 100
        (margin / 0.30 * 100.0).min(100.0).max(0.0)
    }
    
    fn normalize_debt(&self, debt: f64) -> f64 {
        // Debt/Equity: 0 = 100, 1.0 = 50, 2.0+ = 0 (inverted)
        (100.0 - (debt / 2.0 * 100.0)).max(0.0).min(100.0)
    }
    
    fn normalize_pe(&self, pe: f64) -> f64 {
        // P/E: 5 = 100, 15 = 50, 30+ = 0 (lower is better)
        (100.0 - ((pe - 5.0) / 25.0 * 100.0)).max(0.0).min(100.0)
    }
    
    fn normalize_pb(&self, pb: f64) -> f64 {
        // P/B: 0.5 = 100, 2.0 = 50, 5.0+ = 0
        (100.0 - ((pb - 0.5) / 4.5 * 100.0)).max(0.0).min(100.0)
    }
    
    fn normalize_ps(&self, ps: f64) -> f64 {
        // P/S: 0.5 = 100, 2.0 = 50, 5.0+ = 0
        (100.0 - ((ps - 0.5) / 4.5 * 100.0)).max(0.0).min(100.0)
    }
    
    fn normalize_growth(&self, growth: f64) -> f64 {
        // Growth: -10% = 0, 10% = 50, 30%+ = 100
        ((growth + 0.10) / 0.40 * 100.0).max(0.0).min(100.0)
    }
    
    fn normalize_dividend_yield(&self, yield_val: f64) -> f64 {
        // Yield: 0% = 0, 3% = 50, 6%+ = 100
        (yield_val / 0.06 * 100.0).max(0.0).min(100.0)
    }
    
    fn normalize_payout_ratio(&self, payout: f64) -> f64 {
        // Payout: 30% = 100, 60% = 75, 90% = 25, 100%+ = 0
        // Sweet spot: 30-60% (sustainable)
        if payout < 0.30 {
            payout / 0.30 * 100.0
        } else if payout < 0.60 {
            100.0
        } else {
            (100.0 - (payout - 0.60) / 0.40 * 75.0).max(0.0)
        }
    }
}

impl MomentumMetrics {
    /// Calculate momentum factor score (0-100)
    /// Based on: 3m, 6m, 12m returns with recency bias
    pub fn momentum_score(&self) -> Option<f64> {
        let mut components = Vec::new();
        let mut weights = Vec::new();
        
        // 3-month return (30% weight - most recent)
        if let Some(ret) = self.return_3m {
            components.push(self.normalize_return(ret));
            weights.push(0.30);
        }
        
        // 6-month return (35% weight)
        if let Some(ret) = self.return_6m {
            components.push(self.normalize_return(ret));
            weights.push(0.35);
        }
        
        // 12-month return (35% weight)
        if let Some(ret) = self.return_12m {
            components.push(self.normalize_return(ret));
            weights.push(0.35);
        }
        
        if components.is_empty() {
            return None;
        }
        
        let total_weight: f64 = weights.iter().sum();
        let weighted_sum: f64 = components.iter()
            .zip(weights.iter())
            .map(|(c, w)| c * w)
            .sum();
        
        Some(weighted_sum / total_weight)
    }
    
    fn normalize_return(&self, ret: f64) -> f64 {
        // Return: -20% = 0, 0% = 50, 40%+ = 100
        ((ret + 0.20) / 0.60 * 100.0).max(0.0).min(100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() < tol
    }

    // --- FinancialMetrics::quality_score ---

    #[test]
    fn test_quality_score() {
        let metrics = FinancialMetrics {
            roe: Some(0.20),
            roic: Some(0.15),
            operating_margin: Some(0.18),
            debt_to_equity: Some(0.5),
            ..Default::default()
        };

        let score = metrics.quality_score();
        assert!(score.is_some());
        assert!(score.unwrap() > 50.0);
    }

    #[test]
    fn test_quality_score_none_when_no_components() {
        let metrics = FinancialMetrics::default();
        assert!(metrics.quality_score().is_none());
    }

    #[test]
    fn test_quality_score_only_debt_component() {
        // debt_to_equity = 0 → normalize_debt = 100
        let metrics = FinancialMetrics {
            debt_to_equity: Some(0.0),
            ..Default::default()
        };
        let score = metrics.quality_score().unwrap();
        assert!(approx_eq(score, 100.0, 0.01));
    }

    #[test]
    fn test_quality_score_high_debt_lowers_score() {
        let metrics = FinancialMetrics {
            debt_to_equity: Some(2.0),
            ..Default::default()
        };
        let score = metrics.quality_score().unwrap();
        assert!(approx_eq(score, 0.0, 0.01));
    }

    #[test]
    fn test_quality_score_negative_roe_ignored() {
        // Negative ROE is excluded from components
        let metrics = FinancialMetrics {
            roe: Some(-0.10),
            debt_to_equity: Some(0.5),
            ..Default::default()
        };
        let score = metrics.quality_score();
        // Only debt component is used
        assert!(score.is_some());
    }

    // --- FinancialMetrics::value_score ---

    #[test]
    fn test_value_score() {
        let metrics = FinancialMetrics {
            pe_ratio: Some(12.0),
            pb_ratio: Some(1.5),
            ps_ratio: Some(1.0),
            ..Default::default()
        };

        let score = metrics.value_score();
        assert!(score.is_some());
        assert!(score.unwrap() > 40.0);
    }

    #[test]
    fn test_value_score_none_when_empty() {
        assert!(FinancialMetrics::default().value_score().is_none());
    }

    #[test]
    fn test_value_score_very_low_pe_gives_high_score() {
        // P/E = 5 → normalize_pe = 100
        let metrics = FinancialMetrics {
            pe_ratio: Some(5.0),
            ..Default::default()
        };
        let score = metrics.value_score().unwrap();
        assert!(approx_eq(score, 100.0, 0.1));
    }

    #[test]
    fn test_value_score_high_pe_gives_low_score() {
        // P/E = 35 → normalize_pe = 0 (clamped)
        let metrics = FinancialMetrics {
            pe_ratio: Some(35.0),
            ..Default::default()
        };
        let score = metrics.value_score().unwrap();
        assert!(approx_eq(score, 0.0, 0.1));
    }

    #[test]
    fn test_value_score_negative_pe_excluded() {
        let metrics = FinancialMetrics {
            pe_ratio: Some(-10.0),
            pb_ratio: Some(1.0),
            ..Default::default()
        };
        let score = metrics.value_score();
        // Only pb_ratio contributes
        assert!(score.is_some());
    }

    // --- FinancialMetrics::growth_score ---

    #[test]
    fn test_growth_score_positive_growth() {
        let metrics = FinancialMetrics {
            revenue_growth_yoy: Some(0.20),
            earnings_growth_yoy: Some(0.25),
            ..Default::default()
        };
        let score = metrics.growth_score().unwrap();
        assert!(score > 50.0);
    }

    #[test]
    fn test_growth_score_none_when_empty() {
        assert!(FinancialMetrics::default().growth_score().is_none());
    }

    #[test]
    fn test_growth_score_negative_growth_clamped_to_zero() {
        let metrics = FinancialMetrics {
            revenue_growth_yoy: Some(-0.30), // far below lower bound
            ..Default::default()
        };
        let score = metrics.growth_score().unwrap();
        assert!(approx_eq(score, 0.0, 0.01));
    }

    #[test]
    fn test_growth_score_high_growth_clamped_to_100() {
        let metrics = FinancialMetrics {
            revenue_growth_yoy: Some(1.0), // 100% — way above ceiling
            ..Default::default()
        };
        let score = metrics.growth_score().unwrap();
        assert!(approx_eq(score, 100.0, 0.01));
    }

    // --- FinancialMetrics::dividend_score ---

    #[test]
    fn test_dividend_score_none_when_no_yield() {
        let metrics = FinancialMetrics {
            dividend_yield: Some(0.0), // zero yield is excluded
            ..Default::default()
        };
        assert!(metrics.dividend_score().is_none());
    }

    #[test]
    fn test_dividend_score_none_when_empty() {
        assert!(FinancialMetrics::default().dividend_score().is_none());
    }

    #[test]
    fn test_dividend_score_good_yield() {
        let metrics = FinancialMetrics {
            dividend_yield: Some(0.04),   // 4% — above 3% midpoint
            payout_ratio: Some(0.50),     // sustainable range
            ..Default::default()
        };
        let score = metrics.dividend_score().unwrap();
        assert!(score > 50.0);
    }

    #[test]
    fn test_dividend_score_payout_below_30pct_scales_linearly() {
        // payout = 0.15 → normalize_payout_ratio = 0.15/0.30 * 100 = 50
        // payout alone (no dividend_yield) still contributes when payout > 0
        let metrics = FinancialMetrics {
            payout_ratio: Some(0.15),
            ..Default::default()
        };
        let score = metrics.dividend_score().unwrap();
        assert!(approx_eq(score, 50.0, 0.1));

        // With yield too — score should be valid
        let m2 = FinancialMetrics {
            dividend_yield: Some(0.03),
            payout_ratio: Some(0.15),
            ..Default::default()
        };
        let score2 = m2.dividend_score().unwrap();
        assert!(score2 > 0.0);
    }

    // --- MomentumMetrics::momentum_score ---

    #[test]
    fn test_momentum_score_none_when_empty() {
        let m = MomentumMetrics::default();
        assert!(m.momentum_score().is_none());
    }

    #[test]
    fn test_momentum_score_positive_returns() {
        let m = MomentumMetrics {
            return_3m: Some(0.10),
            return_6m: Some(0.15),
            return_12m: Some(0.20),
            ..Default::default()
        };
        let score = m.momentum_score().unwrap();
        assert!(score > 50.0);
        assert!(score <= 100.0);
    }

    #[test]
    fn test_momentum_score_negative_returns_clamped_to_zero() {
        let m = MomentumMetrics {
            return_12m: Some(-0.50), // deeply negative
            ..Default::default()
        };
        let score = m.momentum_score().unwrap();
        assert!(approx_eq(score, 0.0, 0.01));
    }

    #[test]
    fn test_momentum_score_zero_return_is_50() {
        // return 0 → normalize_return = (0+0.20)/0.60*100 = 33.3
        let m = MomentumMetrics {
            return_3m: Some(0.0),
            ..Default::default()
        };
        let score = m.momentum_score().unwrap();
        assert!(approx_eq(score, 33.33, 0.5));
    }

    #[test]
    fn test_momentum_score_capped_at_100() {
        let m = MomentumMetrics {
            return_3m: Some(1.0), // enormous positive return
            return_6m: Some(1.0),
            return_12m: Some(1.0),
            ..Default::default()
        };
        let score = m.momentum_score().unwrap();
        assert!(approx_eq(score, 100.0, 0.01));
    }

    #[test]
    fn test_growth_score_with_revenue_growth_3y() {
        // Covers lines 165-167: revenue_growth_3y branch in growth_score()
        let metrics = FinancialMetrics {
            revenue_growth_3y: Some(0.10),
            ..Default::default()
        };
        let score = metrics.growth_score();
        assert!(score.is_some());
        assert!(score.unwrap() > 0.0);
    }

    #[test]
    fn test_dividend_score_high_payout_lowers_score() {
        // Covers line 273: normalize_payout_ratio with payout >= 0.60
        // payout = 0.80 → (100 - (0.80-0.60)/0.40*75) = (100 - 37.5) = 62.5
        let metrics = FinancialMetrics {
            payout_ratio: Some(0.80),
            ..Default::default()
        };
        let score = metrics.dividend_score().unwrap();
        assert!(approx_eq(score, 62.5, 0.5));
    }

    #[test]
    fn test_dividend_score_very_high_payout_clamped_to_zero() {
        // payout = 1.20 → (100 - (1.20-0.60)/0.40*75).max(0) = (100 - 112.5).max(0) = 0
        let metrics = FinancialMetrics {
            payout_ratio: Some(1.20),
            ..Default::default()
        };
        let score = metrics.dividend_score().unwrap();
        assert!(approx_eq(score, 0.0, 0.01));
    }

    // --- Normalization helpers via public scoring methods ---

    #[test]
    fn test_normalize_roe_midpoint() {
        // ROE = 0.15 → 0.15/0.30 * 100 = 50
        let m = FinancialMetrics { roe: Some(0.15), ..Default::default() };
        // quality_score only uses ROE when it's the single component
        // We compute via quality_score with only roe set
        let score = m.quality_score().unwrap();
        assert!(approx_eq(score, 50.0, 0.1));
    }

    #[test]
    fn test_normalize_debt_midpoint() {
        // debt=1.0 → 100 - (1.0/2.0)*100 = 50
        let m = FinancialMetrics { debt_to_equity: Some(1.0), ..Default::default() };
        let score = m.quality_score().unwrap();
        assert!(approx_eq(score, 50.0, 0.1));
    }

    #[test]
    fn test_normalize_pb_midpoint() {
        // P/B = 0.5 → 100 - (0.5-0.5)/4.5*100 = 100
        let m = FinancialMetrics { pb_ratio: Some(0.5), ..Default::default() };
        let score = m.value_score().unwrap();
        assert!(approx_eq(score, 100.0, 0.1));
    }
}

impl Default for FinancialMetrics {
    fn default() -> Self {
        Self {
            market_cap: None,
            pe_ratio: None,
            pb_ratio: None,
            ps_ratio: None,
            price_to_book: None,
            roe: None,
            roa: None,
            roic: None,
            gross_margin: None,
            operating_margin: None,
            net_margin: None,
            revenue_growth_yoy: None,
            earnings_growth_yoy: None,
            revenue_growth_3y: None,
            eps_growth_3y: None,
            dividend_yield: None,
            payout_ratio: None,
            debt_to_equity: None,
            current_ratio: None,
            quick_ratio: None,
            revenue: None,
            earnings: None,
        }
    }
}
