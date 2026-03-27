use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    pub id: String,
    pub timestamp: String,
    pub event_type: String,
    pub title: String,
    pub content: String,
    pub plan_version: Option<String>,
    pub metadata: HashMap<String, String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanVersionDiff {
    pub from_version: String,
    pub to_version: String,
    pub timestamp: String,
    pub changes: Vec<PlanChange>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanChange {
    pub field: String,
    pub old_value: String,
    pub new_value: String,
    pub change_type: String, // "added", "removed", "modified"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalFilter {
    pub event_types: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search_query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalStats {
    pub total_entries: usize,
    pub entries_by_type: HashMap<String, usize>,
    pub entries_by_month: HashMap<String, usize>,
    pub common_tags: Vec<(String, usize)>,
}

/// Journal for decision tracking and plan versioning
pub struct Journal;

impl Journal {
    /// Create a new journal entry
    pub fn create_entry(
        event_type: &str,
        title: &str,
        content: &str,
        plan_version: Option<String>,
        tags: Vec<String>,
    ) -> JournalEntry {
        let id = format!("{}-{}", Utc::now().timestamp(), uuid::Uuid::new_v4());
        
        JournalEntry {
            id,
            timestamp: Utc::now().to_rfc3339(),
            event_type: event_type.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            plan_version,
            metadata: HashMap::new(),
            tags,
        }
    }

    /// Create a strategy change entry
    pub fn log_strategy_change(
        change_description: &str,
        old_plan: &str,
        new_plan: &str,
    ) -> JournalEntry {
        let mut metadata = HashMap::new();
        metadata.insert("old_plan".to_string(), old_plan.to_string());
        metadata.insert("new_plan".to_string(), new_plan.to_string());

        let mut entry = Self::create_entry(
            "strategy_change",
            "Strategy Modified",
            change_description,
            Some(new_plan.to_string()),
            vec!["strategy".to_string(), "change".to_string()],
        );
        entry.metadata = metadata;
        entry
    }

    /// Create a trade decision entry
    pub fn log_trade_decision(
        symbol: &str,
        action: &str,
        rationale: &str,
    ) -> JournalEntry {
        let mut metadata = HashMap::new();
        metadata.insert("symbol".to_string(), symbol.to_string());
        metadata.insert("action".to_string(), action.to_string());

        let mut entry = Self::create_entry(
            "trade_decision",
            &format!("{} {}", action, symbol),
            rationale,
            None,
            vec!["trade".to_string(), symbol.to_string()],
        );
        entry.metadata = metadata;
        entry
    }

    /// Create a rebalance entry
    pub fn log_rebalance(
        trigger_reason: &str,
        actions_summary: &str,
    ) -> JournalEntry {
        Self::create_entry(
            "rebalance",
            "Portfolio Rebalanced",
            &format!("Trigger: {}\n\nActions:\n{}", trigger_reason, actions_summary),
            None,
            vec!["rebalance".to_string()],
        )
    }

    /// Create a review entry
    pub fn log_review(
        review_type: &str,
        findings: &str,
        action_items: Vec<String>,
    ) -> JournalEntry {
        let mut metadata = HashMap::new();
        metadata.insert("review_type".to_string(), review_type.to_string());
        metadata.insert("action_items".to_string(), action_items.join(", "));

        let mut entry = Self::create_entry(
            "review",
            &format!("{} Review", review_type),
            findings,
            None,
            vec!["review".to_string(), review_type.to_lowercase()],
        );
        entry.metadata = metadata;
        entry
    }

    /// Create a reflection entry
    #[allow(dead_code)]
    pub fn log_reflection(
        title: &str,
        content: &str,
        tags: Vec<String>,
    ) -> JournalEntry {
        Self::create_entry(
            "reflection",
            title,
            content,
            None,
            tags,
        )
    }

    /// Generate plan version diff
    pub fn compare_plans(
        old_plan: &str,
        new_plan: &str,
        from_version: &str,
        to_version: &str,
    ) -> PlanVersionDiff {
        let changes = Self::calculate_changes(old_plan, new_plan);
        let summary = Self::generate_diff_summary(&changes);

        PlanVersionDiff {
            from_version: from_version.to_string(),
            to_version: to_version.to_string(),
            timestamp: Utc::now().to_rfc3339(),
            changes,
            summary,
        }
    }

    fn calculate_changes(old_plan: &str, new_plan: &str) -> Vec<PlanChange> {
        let mut changes = Vec::new();

        // Simple line-by-line comparison
        let old_lines: Vec<&str> = old_plan.lines().collect();
        let new_lines: Vec<&str> = new_plan.lines().collect();

        // Look for additions
        for new_line in &new_lines {
            if !old_lines.contains(new_line) && !new_line.trim().is_empty() {
                changes.push(PlanChange {
                    field: "plan_content".to_string(),
                    old_value: "".to_string(),
                    new_value: new_line.to_string(),
                    change_type: "added".to_string(),
                });
            }
        }

        // Look for removals
        for old_line in &old_lines {
            if !new_lines.contains(old_line) && !old_line.trim().is_empty() {
                changes.push(PlanChange {
                    field: "plan_content".to_string(),
                    old_value: old_line.to_string(),
                    new_value: "".to_string(),
                    change_type: "removed".to_string(),
                });
            }
        }

        changes
    }

    fn generate_diff_summary(changes: &[PlanChange]) -> String {
        let additions = changes.iter().filter(|c| c.change_type == "added").count();
        let removals = changes.iter().filter(|c| c.change_type == "removed").count();
        let modifications = changes.iter().filter(|c| c.change_type == "modified").count();

        format!(
            "Plan updated: {} addition(s), {} removal(s), {} modification(s)",
            additions, removals, modifications
        )
    }

    /// Filter journal entries
    pub fn filter_entries(
        entries: &[JournalEntry],
        filter: &JournalFilter,
    ) -> Vec<JournalEntry> {
        entries.iter()
            .filter(|entry| {
                // Filter by event type
                if let Some(ref types) = filter.event_types {
                    if !types.contains(&entry.event_type) {
                        return false;
                    }
                }

                // Filter by tags
                if let Some(ref tags) = filter.tags {
                    if !entry.tags.iter().any(|t| tags.contains(t)) {
                        return false;
                    }
                }

                // Filter by date range
                if let Some(ref from) = filter.date_from {
                    if entry.timestamp < *from {
                        return false;
                    }
                }
                if let Some(ref to) = filter.date_to {
                    if entry.timestamp > *to {
                        return false;
                    }
                }

                // Search query
                if let Some(ref query) = filter.search_query {
                    let query_lower = query.to_lowercase();
                    if !entry.title.to_lowercase().contains(&query_lower) &&
                       !entry.content.to_lowercase().contains(&query_lower) {
                        return false;
                    }
                }

                true
            })
            .cloned()
            .collect()
    }

    /// Generate statistics
    pub fn calculate_stats(entries: &[JournalEntry]) -> JournalStats {
        let mut entries_by_type: HashMap<String, usize> = HashMap::new();
        let mut entries_by_month: HashMap<String, usize> = HashMap::new();
        let mut tag_counts: HashMap<String, usize> = HashMap::new();

        for entry in entries {
            *entries_by_type.entry(entry.event_type.clone()).or_insert(0) += 1;

            // Extract year-month
            if let Some(month) = entry.timestamp.get(..7) {
                *entries_by_month.entry(month.to_string()).or_insert(0) += 1;
            }

            // Count tags
            for tag in &entry.tags {
                *tag_counts.entry(tag.clone()).or_insert(0) += 1;
            }
        }

        // Get top 10 tags
        let mut common_tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
        common_tags.sort_by(|a, b| b.1.cmp(&a.1));
        common_tags.truncate(10);

        JournalStats {
            total_entries: entries.len(),
            entries_by_type,
            entries_by_month,
            common_tags,
        }
    }

    /// Export entries to markdown
    pub fn export_to_markdown(entries: &[JournalEntry]) -> String {
        let mut md = String::from("# Investment Journal\n\n");
        md.push_str(&format!("Generated: {}\n\n", Utc::now().format("%Y-%m-%d %H:%M:%S")));
        md.push_str(&format!("Total Entries: {}\n\n", entries.len()));
        md.push_str("---\n\n");

        for entry in entries {
            md.push_str(&format!("## {} ({})\n\n", entry.title, entry.event_type));
            md.push_str(&format!("**Date:** {}\n\n", entry.timestamp));
            
            if !entry.tags.is_empty() {
                md.push_str(&format!("**Tags:** {}\n\n", entry.tags.join(", ")));
            }

            md.push_str(&format!("{}\n\n", entry.content));

            if !entry.metadata.is_empty() {
                md.push_str("**Metadata:**\n");
                for (key, value) in &entry.metadata {
                    md.push_str(&format!("- {}: {}\n", key, value));
                }
                md.push('\n');
            }

            md.push_str("---\n\n");
        }

        md
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_entry() {
        let entry = Journal::create_entry(
            "test",
            "Test Entry",
            "Test content",
            None,
            vec!["test".to_string()],
        );

        assert_eq!(entry.event_type, "test");
        assert_eq!(entry.title, "Test Entry");
        assert_eq!(entry.content, "Test content");
        assert!(!entry.id.is_empty());
    }

    #[test]
    fn test_log_trade_decision() {
        let entry = Journal::log_trade_decision("AAPL", "BUY", "Strong fundamentals");

        assert_eq!(entry.event_type, "trade_decision");
        assert_eq!(entry.metadata.get("symbol").unwrap(), "AAPL");
        assert_eq!(entry.metadata.get("action").unwrap(), "BUY");
    }

    #[test]
    fn test_filter_entries() {
        let entries = vec![
            Journal::create_entry("type1", "Entry 1", "Content 1", None, vec![]),
            Journal::create_entry("type2", "Entry 2", "Content 2", None, vec![]),
        ];

        let filter = JournalFilter {
            event_types: Some(vec!["type1".to_string()]),
            tags: None,
            date_from: None,
            date_to: None,
            search_query: None,
        };

        let filtered = Journal::filter_entries(&entries, &filter);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].event_type, "type1");
    }

    #[test]
    fn test_calculate_stats() {
        let entries = vec![
            Journal::create_entry("trade", "Trade 1", "Content", None, vec!["stock".to_string()]),
            Journal::create_entry("trade", "Trade 2", "Content", None, vec!["stock".to_string()]),
            Journal::create_entry("review", "Review", "Content", None, vec!["quarterly".to_string()]),
        ];

        let stats = Journal::calculate_stats(&entries);
        
        assert_eq!(stats.total_entries, 3);
        assert_eq!(*stats.entries_by_type.get("trade").unwrap(), 2);
        assert_eq!(*stats.entries_by_type.get("review").unwrap(), 1);
    }

    // Helper to create entries with specific fields for testing
    fn make_entry(event_type: &str, title: &str, content: &str, tags: Vec<&str>, timestamp: &str) -> JournalEntry {
        JournalEntry {
            id: format!("test-{}", title),
            timestamp: timestamp.to_string(),
            event_type: event_type.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            plan_version: None,
            metadata: HashMap::new(),
            tags: tags.into_iter().map(|t| t.to_string()).collect(),
        }
    }

    // ===== filter_entries tests =====

    #[test]
    fn test_filter_by_tags() {
        let entries = vec![
            make_entry("trade", "Buy AAPL", "content", vec!["stock", "tech"], "2024-03-01T00:00:00Z"),
            make_entry("trade", "Buy MSFT", "content", vec!["stock", "tech"], "2024-03-02T00:00:00Z"),
            make_entry("review", "Q1 Review", "content", vec!["quarterly"], "2024-03-15T00:00:00Z"),
        ];
        let filter = JournalFilter {
            event_types: None,
            tags: Some(vec!["quarterly".to_string()]),
            date_from: None,
            date_to: None,
            search_query: None,
        };
        let result = Journal::filter_entries(&entries, &filter);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Q1 Review");
    }

    #[test]
    fn test_filter_by_date_range() {
        let entries = vec![
            make_entry("trade", "E1", "c", vec![], "2024-01-15T00:00:00Z"),
            make_entry("trade", "E2", "c", vec![], "2024-03-15T00:00:00Z"),
            make_entry("trade", "E3", "c", vec![], "2024-06-15T00:00:00Z"),
        ];
        let filter = JournalFilter {
            event_types: None,
            tags: None,
            date_from: Some("2024-02-01T00:00:00Z".to_string()),
            date_to: Some("2024-05-01T00:00:00Z".to_string()),
            search_query: None,
        };
        let result = Journal::filter_entries(&entries, &filter);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "E2");
    }

    #[test]
    fn test_filter_by_search_query() {
        let entries = vec![
            make_entry("trade", "Buy Apple Stock", "Great fundamentals", vec![], "2024-03-01T00:00:00Z"),
            make_entry("trade", "Sell Google", "Overvalued", vec![], "2024-03-02T00:00:00Z"),
            make_entry("review", "Monthly Review", "apple performance was good", vec![], "2024-03-15T00:00:00Z"),
        ];
        let filter = JournalFilter {
            event_types: None,
            tags: None,
            date_from: None,
            date_to: None,
            search_query: Some("apple".to_string()),
        };
        let result = Journal::filter_entries(&entries, &filter);
        assert_eq!(result.len(), 2); // "Apple" in title + "apple" in content
    }

    #[test]
    fn test_filter_no_filters() {
        let entries = vec![
            make_entry("a", "A", "c", vec![], "2024-01-01T00:00:00Z"),
            make_entry("b", "B", "c", vec![], "2024-02-01T00:00:00Z"),
        ];
        let filter = JournalFilter {
            event_types: None,
            tags: None,
            date_from: None,
            date_to: None,
            search_query: None,
        };
        let result = Journal::filter_entries(&entries, &filter);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_filter_combined() {
        let entries = vec![
            make_entry("trade", "Buy AAPL", "good stock", vec!["tech"], "2024-03-01T00:00:00Z"),
            make_entry("trade", "Sell AAPL", "bad stock", vec!["tech"], "2024-06-01T00:00:00Z"),
            make_entry("review", "Review", "content", vec!["quarterly"], "2024-03-15T00:00:00Z"),
        ];
        let filter = JournalFilter {
            event_types: Some(vec!["trade".to_string()]),
            tags: Some(vec!["tech".to_string()]),
            date_from: None,
            date_to: Some("2024-04-01T00:00:00Z".to_string()),
            search_query: Some("good".to_string()),
        };
        let result = Journal::filter_entries(&entries, &filter);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Buy AAPL");
    }

    // ===== calculate_stats extended tests =====

    #[test]
    fn test_stats_empty() {
        let stats = Journal::calculate_stats(&[]);
        assert_eq!(stats.total_entries, 0);
        assert!(stats.entries_by_type.is_empty());
        assert!(stats.common_tags.is_empty());
    }

    #[test]
    fn test_stats_tag_frequency() {
        let entries = vec![
            make_entry("trade", "T1", "c", vec!["stock", "tech"], "2024-03-01T00:00:00Z"),
            make_entry("trade", "T2", "c", vec!["stock"], "2024-03-02T00:00:00Z"),
            make_entry("review", "R1", "c", vec!["quarterly", "tech"], "2024-03-15T00:00:00Z"),
        ];
        let stats = Journal::calculate_stats(&entries);
        // stock: 2, tech: 2, quarterly: 1
        let stock_count = stats.common_tags.iter().find(|(t, _)| t == "stock").map(|(_, c)| *c).unwrap_or(0);
        assert_eq!(stock_count, 2);
        let tech_count = stats.common_tags.iter().find(|(t, _)| t == "tech").map(|(_, c)| *c).unwrap_or(0);
        assert_eq!(tech_count, 2);
    }

    #[test]
    fn test_stats_by_month() {
        let entries = vec![
            make_entry("trade", "T1", "c", vec![], "2024-01-15T00:00:00Z"),
            make_entry("trade", "T2", "c", vec![], "2024-01-20T00:00:00Z"),
            make_entry("trade", "T3", "c", vec![], "2024-03-01T00:00:00Z"),
        ];
        let stats = Journal::calculate_stats(&entries);
        assert_eq!(*stats.entries_by_month.get("2024-01").unwrap(), 2);
        assert_eq!(*stats.entries_by_month.get("2024-03").unwrap(), 1);
    }

    // ===== compare_plans / calculate_changes tests =====

    #[test]
    fn test_compare_plans_additions() {
        let old = "line1\nline2";
        let new = "line1\nline2\nline3";
        let diff = Journal::compare_plans(old, new, "v1", "v2");
        let additions: Vec<_> = diff.changes.iter().filter(|c| c.change_type == "added").collect();
        assert_eq!(additions.len(), 1);
        assert_eq!(additions[0].new_value, "line3");
    }

    #[test]
    fn test_compare_plans_removals() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline2";
        let diff = Journal::compare_plans(old, new, "v1", "v2");
        let removals: Vec<_> = diff.changes.iter().filter(|c| c.change_type == "removed").collect();
        assert_eq!(removals.len(), 1);
        assert_eq!(removals[0].old_value, "line3");
    }

    #[test]
    fn test_compare_plans_no_changes() {
        let plan = "line1\nline2";
        let diff = Journal::compare_plans(plan, plan, "v1", "v2");
        assert!(diff.changes.is_empty());
    }

    #[test]
    fn test_compare_plans_complete_replacement() {
        let old = "alpha\nbeta";
        let new = "gamma\ndelta";
        let diff = Journal::compare_plans(old, new, "v1", "v2");
        let additions: Vec<_> = diff.changes.iter().filter(|c| c.change_type == "added").collect();
        let removals: Vec<_> = diff.changes.iter().filter(|c| c.change_type == "removed").collect();
        assert_eq!(additions.len(), 2);
        assert_eq!(removals.len(), 2);
    }

    #[test]
    fn test_compare_plans_empty_lines_ignored() {
        let old = "line1\n\nline2";
        let new = "line1\n\nline3";
        let diff = Journal::compare_plans(old, new, "v1", "v2");
        // Empty lines are skipped in change detection
        let additions: Vec<_> = diff.changes.iter().filter(|c| c.change_type == "added").collect();
        assert_eq!(additions.len(), 1);
        assert_eq!(additions[0].new_value, "line3");
    }

    // ===== generate_diff_summary tests =====

    #[test]
    fn test_diff_summary() {
        let changes = vec![
            PlanChange { field: "f".to_string(), old_value: "".to_string(), new_value: "x".to_string(), change_type: "added".to_string() },
            PlanChange { field: "f".to_string(), old_value: "".to_string(), new_value: "y".to_string(), change_type: "added".to_string() },
            PlanChange { field: "f".to_string(), old_value: "z".to_string(), new_value: "".to_string(), change_type: "removed".to_string() },
            PlanChange { field: "f".to_string(), old_value: "a".to_string(), new_value: "b".to_string(), change_type: "modified".to_string() },
        ];
        let summary = Journal::generate_diff_summary(&changes);
        assert!(summary.contains("2 addition(s)"));
        assert!(summary.contains("1 removal(s)"));
        assert!(summary.contains("1 modification(s)"));
    }

    #[test]
    fn test_diff_summary_empty() {
        let summary = Journal::generate_diff_summary(&[]);
        assert!(summary.contains("0 addition(s)"));
        assert!(summary.contains("0 removal(s)"));
        assert!(summary.contains("0 modification(s)"));
    }

    // ===== export_to_markdown tests =====

    #[test]
    fn test_export_to_markdown_empty() {
        let md = Journal::export_to_markdown(&[]);
        assert!(md.contains("# Investment Journal"));
        assert!(md.contains("Total Entries: 0"));
    }

    #[test]
    fn test_export_to_markdown_with_entries() {
        let mut entry = make_entry("trade", "Buy AAPL", "Great stock", vec!["tech", "buy"], "2024-03-01T00:00:00Z");
        entry.metadata.insert("symbol".to_string(), "AAPL".to_string());

        let md = Journal::export_to_markdown(&[entry]);
        assert!(md.contains("## Buy AAPL (trade)"));
        assert!(md.contains("**Tags:** tech, buy"));
        assert!(md.contains("Great stock"));
        assert!(md.contains("**Metadata:**"));
        assert!(md.contains("symbol: AAPL"));
    }

    #[test]
    fn test_export_to_markdown_no_tags() {
        let entry = make_entry("review", "Review", "Content here", vec![], "2024-03-01T00:00:00Z");
        let md = Journal::export_to_markdown(&[entry]);
        assert!(!md.contains("**Tags:**"));
    }

    // ===== entry creation helper tests =====

    #[test]
    fn test_log_strategy_change() {
        let entry = Journal::log_strategy_change("Changed allocation", "old plan", "new plan");
        assert_eq!(entry.event_type, "strategy_change");
        assert_eq!(entry.metadata.get("old_plan").unwrap(), "old plan");
        assert_eq!(entry.metadata.get("new_plan").unwrap(), "new plan");
        assert!(entry.tags.contains(&"strategy".to_string()));
        assert!(entry.tags.contains(&"change".to_string()));
    }

    #[test]
    fn test_log_rebalance() {
        let entry = Journal::log_rebalance("Drift exceeded 5%", "Sold AAPL, Bought MSFT");
        assert_eq!(entry.event_type, "rebalance");
        assert!(entry.content.contains("Drift exceeded 5%"));
        assert!(entry.content.contains("Sold AAPL, Bought MSFT"));
    }

    #[test]
    fn test_log_review() {
        let entry = Journal::log_review("Quarterly", "Everything looks good", vec!["item1".to_string(), "item2".to_string()]);
        assert_eq!(entry.event_type, "review");
        assert!(entry.title.contains("Quarterly"));
        assert_eq!(entry.metadata.get("action_items").unwrap(), "item1, item2");
    }

    #[test]
    fn test_log_reflection() {
        let entry = Journal::log_reflection("My Thoughts", "Reflecting on decisions", vec!["personal".to_string()]);
        assert_eq!(entry.event_type, "reflection");
        assert_eq!(entry.title, "My Thoughts");
        assert_eq!(entry.content, "Reflecting on decisions");
    }
}
