use crate::modules::journal::JournalEntry;
use crate::modules::plan_compiler::VibePlanScript;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceAlert {
    pub id: String,
    pub symbol: String,
    pub condition: String,
    pub threshold: f64,
    pub reference_price: Option<f64>,
    pub active: bool,
    pub triggered: bool,
    pub triggered_at: Option<String>,
    pub created_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebalanceSchedule {
    pub id: String,
    pub plan_name: String,
    pub frequency: String,
    pub day_of_week: Option<i64>,
    pub day_of_month: Option<i64>,
    pub next_run: String,
    pub last_run: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

/// Universe definition for symbol filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Universe {
    pub id: String,
    pub name: String,
    pub description: String,
    pub symbols: Vec<String>,
    pub tags: HashMap<String, Vec<String>>,
    pub exclude_list: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Export data bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportBundle {
    pub version: String,
    pub exported_at: String,
    pub plan: Option<VibePlanScript>,
    pub universes: Vec<Universe>,
    pub journal_entries: Vec<JournalEntry>,
    pub settings: HashMap<String, String>,
}
