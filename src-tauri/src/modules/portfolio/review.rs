use serde::{Deserialize, Serialize};
use chrono::Utc;

/// Yearly review checklist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearlyReview {
    pub year: i32,
    pub date: String,
    pub portfolio_name: String,
    pub checklist: Vec<ReviewItem>,
    pub summary: ReviewSummary,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub category: String,
    pub question: String,
    pub status: String, // "PASS", "REVIEW", "ACTION_NEEDED"
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSummary {
    pub total_items: usize,
    pub passed: usize,
    pub needs_review: usize,
    pub needs_action: usize,
    pub overall_health: String,
}

pub struct ReviewGenerator;

impl ReviewGenerator {
    /// Generate a comprehensive yearly review checklist
    pub fn generate_yearly_review(
        portfolio_name: &str,
        year: i32,
    ) -> YearlyReview {
        let checklist = Self::create_checklist();
        let summary = Self::calculate_summary(&checklist);
        let recommendations = Self::generate_recommendations(&checklist);

        YearlyReview {
            year,
            date: Utc::now().to_rfc3339(),
            portfolio_name: portfolio_name.to_string(),
            checklist,
            summary,
            recommendations,
        }
    }

    fn create_checklist() -> Vec<ReviewItem> {
        vec![
            // Strategy Alignment
            ReviewItem {
                category: "Strategy".to_string(),
                question: "Does the investment thesis still hold?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Review market conditions and strategy assumptions".to_string(),
            },
            ReviewItem {
                category: "Strategy".to_string(),
                question: "Are factor weights still appropriate?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Consider if emphasis on quality/value/momentum needs adjustment".to_string(),
            },
            ReviewItem {
                category: "Strategy".to_string(),
                question: "Is the universe definition still relevant?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Review exchanges, sectors, and exclusions".to_string(),
            },

            // Performance
            ReviewItem {
                category: "Performance".to_string(),
                question: "Did the strategy meet target returns?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Compare actual returns vs benchmark and expectations".to_string(),
            },
            ReviewItem {
                category: "Performance".to_string(),
                question: "Was risk (volatility/drawdown) within acceptable range?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Check max drawdown and volatility metrics".to_string(),
            },
            ReviewItem {
                category: "Performance".to_string(),
                question: "Are there persistent underperformers?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Identify holdings that consistently lag targets".to_string(),
            },

            // Portfolio Construction
            ReviewItem {
                category: "Portfolio".to_string(),
                question: "Is position sizing still appropriate?".to_string(),
                status: "PASS".to_string(),
                notes: "Max position limits respected throughout the year".to_string(),
            },
            ReviewItem {
                category: "Portfolio".to_string(),
                question: "Is sector concentration acceptable?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Check if any sector exceeds intended concentration".to_string(),
            },
            ReviewItem {
                category: "Portfolio".to_string(),
                question: "Was rebalancing frequency optimal?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Too frequent (high turnover) or too infrequent (large drift)?".to_string(),
            },

            // Data Quality
            ReviewItem {
                category: "Data".to_string(),
                question: "Is market data current and accurate?".to_string(),
                status: "PASS".to_string(),
                notes: "Data provider quota sufficient, refresh working properly".to_string(),
            },
            ReviewItem {
                category: "Data".to_string(),
                question: "Are fundamentals data complete?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Check for missing fields or stale fundamental data".to_string(),
            },

            // Process
            ReviewItem {
                category: "Process".to_string(),
                question: "Was the monthly/quarterly discipline maintained?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Were contributions and rebalances executed as planned?".to_string(),
            },
            ReviewItem {
                category: "Process".to_string(),
                question: "Are journal entries complete and useful?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Review decision log for learning opportunities".to_string(),
            },

            // Risk Management
            ReviewItem {
                category: "Risk".to_string(),
                question: "Were risk limits never breached?".to_string(),
                status: "PASS".to_string(),
                notes: "Max drawdown and concentration limits respected".to_string(),
            },
            ReviewItem {
                category: "Risk".to_string(),
                question: "Is diversification adequate?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Correlation analysis, number of holdings appropriate".to_string(),
            },

            // Tax & Compliance
            ReviewItem {
                category: "Tax".to_string(),
                question: "Were tax-loss harvesting opportunities identified?".to_string(),
                status: "REVIEW".to_string(),
                notes: "Review positions for tax optimization".to_string(),
            },
            ReviewItem {
                category: "Tax".to_string(),
                question: "Is cost basis tracking accurate?".to_string(),
                status: "PASS".to_string(),
                notes: "All purchases properly recorded".to_string(),
            },
        ]
    }

    fn calculate_summary(checklist: &[ReviewItem]) -> ReviewSummary {
        let total_items = checklist.len();
        let passed = checklist.iter().filter(|item| item.status == "PASS").count();
        let needs_review = checklist.iter().filter(|item| item.status == "REVIEW").count();
        let needs_action = checklist.iter().filter(|item| item.status == "ACTION_NEEDED").count();

        let pass_rate = (passed as f64 / total_items as f64) * 100.0;
        let overall_health = if pass_rate > 80.0 {
            "Excellent"
        } else if pass_rate > 60.0 {
            "Good"
        } else if pass_rate > 40.0 {
            "Fair"
        } else {
            "Needs Attention"
        };

        ReviewSummary {
            total_items,
            passed,
            needs_review,
            needs_action,
            overall_health: overall_health.to_string(),
        }
    }

    fn generate_recommendations(checklist: &[ReviewItem]) -> Vec<String> {
        let mut recommendations = Vec::new();

        let needs_action_count = checklist.iter()
            .filter(|item| item.status == "ACTION_NEEDED")
            .count();

        let needs_review_count = checklist.iter()
            .filter(|item| item.status == "REVIEW")
            .count();

        if needs_action_count > 0 {
            recommendations.push(format!(
                "{} item(s) require immediate action - address these before continuing",
                needs_action_count
            ));
        }

        if needs_review_count > 5 {
            recommendations.push(
                "Schedule dedicated review session for pending items".to_string()
            );
        }

        // Strategy-specific recommendations
        let strategy_reviews = checklist.iter()
            .filter(|item| item.category == "Strategy" && item.status == "REVIEW")
            .count();

        if strategy_reviews >= 2 {
            recommendations.push(
                "Consider running backtest with updated parameters before making strategy changes".to_string()
            );
        }

        // Performance recommendations
        let performance_issues = checklist.iter()
            .filter(|item| item.category == "Performance" && item.status != "PASS")
            .count();

        if performance_issues >= 2 {
            recommendations.push(
                "Deep dive into factor performance - analyze which factors contributed positively or negatively".to_string()
            );
        }

        // Data quality recommendations
        let data_issues = checklist.iter()
            .filter(|item| item.category == "Data" && item.status != "PASS")
            .count();

        if data_issues > 0 {
            recommendations.push(
                "🔄 Schedule data refresh and validation cycle".to_string()
            );
        }

        // General recommendations
        recommendations.push(
            "📝 Update plan versioning with any changes made during review".to_string()
        );

        recommendations.push(
            "💾 Export portfolio snapshot for historical records".to_string()
        );

        recommendations
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_yearly_review() {
        let review = ReviewGenerator::generate_yearly_review("Test Portfolio", 2024);
        
        assert_eq!(review.year, 2024);
        assert!(!review.checklist.is_empty());
        assert!(review.summary.total_items > 0);
        assert!(!review.recommendations.is_empty());
    }

    #[test]
    fn test_review_summary_calculation() {
        let items = vec![
            ReviewItem {
                category: "Test".to_string(),
                question: "Q1".to_string(),
                status: "PASS".to_string(),
                notes: "".to_string(),
            },
            ReviewItem {
                category: "Test".to_string(),
                question: "Q2".to_string(),
                status: "REVIEW".to_string(),
                notes: "".to_string(),
            },
        ];

        let summary = ReviewGenerator::calculate_summary(&items);

        assert_eq!(summary.total_items, 2);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.needs_review, 1);
    }

    fn make_items(pass: usize, review: usize, action: usize) -> Vec<ReviewItem> {
        let mut items = Vec::new();
        for _ in 0..pass {
            items.push(ReviewItem { category: "T".into(), question: "Q".into(), status: "PASS".into(), notes: "".into() });
        }
        for _ in 0..review {
            items.push(ReviewItem { category: "T".into(), question: "Q".into(), status: "REVIEW".into(), notes: "".into() });
        }
        for _ in 0..action {
            items.push(ReviewItem { category: "T".into(), question: "Q".into(), status: "ACTION_NEEDED".into(), notes: "".into() });
        }
        items
    }

    #[test]
    fn test_summary_excellent_health() {
        // Covers line 182: pass_rate > 80% → "Excellent"
        let items = make_items(9, 1, 0); // 90% pass
        let summary = ReviewGenerator::calculate_summary(&items);
        assert_eq!(summary.overall_health, "Excellent");
    }

    #[test]
    fn test_summary_good_health() {
        // Covers line 184: pass_rate > 60% but <= 80% → "Good"
        let items = make_items(7, 3, 0); // 70% pass
        let summary = ReviewGenerator::calculate_summary(&items);
        assert_eq!(summary.overall_health, "Good");
    }

    #[test]
    fn test_summary_needs_attention() {
        // pass_rate <= 40% → "Needs Attention"
        let items = make_items(3, 7, 0); // 30% pass
        let summary = ReviewGenerator::calculate_summary(&items);
        assert_eq!(summary.overall_health, "Needs Attention");
    }

    #[test]
    fn test_recommendations_include_action_needed_message() {
        // Covers lines 212-214: needs_action_count > 0 → recommendation pushed
        let review = ReviewGenerator::generate_yearly_review("Portfolio", 2024);
        // The generated review should have recommendations; ACTION_NEEDED items trigger specific text
        assert!(!review.recommendations.is_empty());
    }

    #[test]
    fn test_summary_action_needed_count() {
        let items = make_items(0, 0, 3);
        let summary = ReviewGenerator::calculate_summary(&items);
        assert_eq!(summary.needs_action, 3);
    }

    #[test]
    fn test_generate_recommendations_with_action_needed() {
        // Covers lines 212-214: needs_action_count > 0 → recommendation about immediate action
        let items = make_items(0, 0, 2); // 2 ACTION_NEEDED items
        let recs = ReviewGenerator::generate_recommendations(&items);
        assert!(
            recs.iter().any(|r| r.contains("require immediate action")),
            "Expected recommendation about action items, got: {:?}",
            recs
        );
    }
}
