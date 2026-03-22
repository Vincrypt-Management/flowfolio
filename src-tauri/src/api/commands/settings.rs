// API Commands - Settings, Vault, Alerts, Schedules, Export/Import
// Extracted from lib.rs

use crate::{
    VAULT_UNLOCKED, STRONGHOLD_VAULT, API_KEYS_STORE, API_KEY_NAMES,
    get_pool, PriceAlert, RebalanceSchedule, ExportBundle,
};
use crate::modules::plan_compiler::VibePlanScript;
use crate::modules::journal::JournalEntry;
use crate::api::commands::portfolio::{create_universe, list_universes};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

// ==================== API KEY MANAGEMENT ====================

#[tauri::command]
pub async fn get_api_key_statuses(app: tauri::AppHandle) -> Result<HashMap<String, bool>, String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    let statuses = API_KEY_NAMES
        .iter()
        .map(|&key| {
            let is_set = store
                .get(key)
                .map(|v| matches!(v, serde_json::Value::String(s) if !s.is_empty()))
                .unwrap_or(false);
            (key.to_string(), is_set)
        })
        .collect();
    Ok(statuses)
}

#[tauri::command]
pub async fn save_api_keys(
    app: tauri::AppHandle,
    keys: HashMap<String, String>,
) -> Result<(), String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    for (key, value) in &keys {
        if !value.is_empty() {
            store.set(key.clone(), serde_json::Value::String(value.clone()));
        }
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== STRONGHOLD VAULT ====================

/// Check if a Stronghold vault file exists on disk.
#[tauri::command]
pub async fn vault_exists(app: tauri::AppHandle) -> Result<bool, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join(STRONGHOLD_VAULT).exists())
}

/// Check if the vault is currently unlocked.
#[tauri::command]
pub async fn vault_is_unlocked() -> bool {
    VAULT_UNLOCKED.load(Ordering::Relaxed)
}

/// Return the vault snapshot path for the JS Stronghold API to use.
#[tauri::command]
pub async fn vault_get_path(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join(STRONGHOLD_VAULT).to_string_lossy().into_owned())
}

/// Mark vault as unlocked (called from JS after successful Stronghold.load).
#[tauri::command]
pub async fn vault_set_unlocked() -> () {
    VAULT_UNLOCKED.store(true, Ordering::Relaxed);
}

/// Mark vault as locked.
#[tauri::command]
pub async fn vault_set_locked() -> () {
    VAULT_UNLOCKED.store(false, Ordering::Relaxed);
}

/// Migrate API keys from JSON store to Stronghold (returns keys for JS to write).
#[tauri::command]
pub async fn vault_migrate_keys(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    let mut keys = HashMap::new();
    for &key_name in API_KEY_NAMES {
        if let Some(serde_json::Value::String(val)) = store.get(key_name) {
            if !val.is_empty() {
                keys.insert(key_name.to_string(), val);
            }
        }
    }
    for &key_name in API_KEY_NAMES {
        store.delete(key_name);
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(keys)
}

// ==================== PRICE ALERT NOTIFICATIONS ====================

#[tauri::command]
pub fn send_price_alert_notification(
    app: tauri::AppHandle,
    symbol: String,
    message: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(format!("FlowFolio Alert: {symbol}"))
        .body(message)
        .show()
        .map_err(|e| e.to_string())
}

// ==================== PRICE ALERTS (SQLite) ====================

#[tauri::command]
pub async fn create_alert(alert: PriceAlert) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT INTO price_alerts (id, symbol, condition, threshold, reference_price, active, triggered, triggered_at, created_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&alert.id)
    .bind(&alert.symbol)
    .bind(&alert.condition)
    .bind(alert.threshold)
    .bind(alert.reference_price)
    .bind(alert.active as i64)
    .bind(alert.triggered as i64)
    .bind(&alert.triggered_at)
    .bind(&alert.created_at)
    .bind(&alert.note)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create alert: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_alerts() -> Result<Vec<PriceAlert>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query(
        "SELECT id, symbol, condition, threshold, reference_price, active, triggered, triggered_at, created_at, note
         FROM price_alerts ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list alerts: {}", e))?;

    let alerts = rows.iter().map(|row| {
        use sqlx::Row;
        PriceAlert {
            id: row.get("id"),
            symbol: row.get("symbol"),
            condition: row.get("condition"),
            threshold: row.get("threshold"),
            reference_price: row.get("reference_price"),
            active: row.get::<i64, _>("active") != 0,
            triggered: row.get::<i64, _>("triggered") != 0,
            triggered_at: row.get("triggered_at"),
            created_at: row.get("created_at"),
            note: row.get("note"),
        }
    }).collect();

    Ok(alerts)
}

#[tauri::command]
pub async fn update_alert(alert: PriceAlert) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "UPDATE price_alerts SET symbol=?, condition=?, threshold=?, reference_price=?,
         active=?, triggered=?, triggered_at=?, note=? WHERE id=?"
    )
    .bind(&alert.symbol)
    .bind(&alert.condition)
    .bind(alert.threshold)
    .bind(alert.reference_price)
    .bind(alert.active as i64)
    .bind(alert.triggered as i64)
    .bind(&alert.triggered_at)
    .bind(&alert.note)
    .bind(&alert.id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update alert: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_alert(id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("DELETE FROM price_alerts WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete alert: {}", e))?;
    Ok(())
}

// ==================== REBALANCE SCHEDULES (SQLite) ====================

#[tauri::command]
pub async fn save_schedule(schedule: RebalanceSchedule) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query(
        "INSERT OR REPLACE INTO rebalance_schedules
         (id, plan_name, cadence, day_of_week, day_of_month, next_run, last_run, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&schedule.id)
    .bind(&schedule.plan_name)
    .bind(&schedule.frequency)
    .bind(schedule.day_of_week)
    .bind(schedule.day_of_month)
    .bind(&schedule.next_run)
    .bind(&schedule.last_run)
    .bind(schedule.enabled as i64)
    .bind(&schedule.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to save schedule: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_schedules() -> Result<Vec<RebalanceSchedule>, String> {
    let pool = get_pool().await?;
    let rows = sqlx::query(
        "SELECT id, plan_name, cadence, day_of_week, day_of_month, next_run, last_run, enabled, created_at
         FROM rebalance_schedules ORDER BY next_run ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list schedules: {}", e))?;

    let schedules = rows.iter().map(|row| {
        use sqlx::Row;
        RebalanceSchedule {
            id: row.get("id"),
            plan_name: row.get("plan_name"),
            frequency: row.get("cadence"),
            day_of_week: row.get("day_of_week"),
            day_of_month: row.get("day_of_month"),
            next_run: row.get("next_run"),
            last_run: row.get("last_run"),
            enabled: row.get::<i64, _>("enabled") != 0,
            created_at: row.get("created_at"),
        }
    }).collect();

    Ok(schedules)
}

#[tauri::command]
pub async fn delete_schedule(id: String) -> Result<(), String> {
    let pool = get_pool().await?;
    sqlx::query("DELETE FROM rebalance_schedules WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete schedule: {}", e))?;
    Ok(())
}

// ==================== USER SETTINGS (SQLite) ====================

#[tauri::command]
pub async fn save_setting(key: String, value: String) -> Result<(), String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR REPLACE INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)"
    )
    .bind(&key)
    .bind(&value)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn load_setting(key: String) -> Result<Option<String>, String> {
    let pool = get_pool().await?;
    let row = sqlx::query("SELECT value FROM user_settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Failed to load setting: {}", e))?;

    use sqlx::Row;
    Ok(row.map(|r| r.get("value")))
}

// ==================== EXPORT / IMPORT ====================

/// Export all data to JSON bundle
#[tauri::command]
pub async fn export_data_bundle(
    plan: Option<VibePlanScript>,
    journal_entries: Vec<JournalEntry>,
) -> Result<String, String> {
    let universes = list_universes().await?;

    let bundle = ExportBundle {
        version: "1.0.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        plan,
        universes,
        journal_entries,
        settings: HashMap::new(),
    };

    serde_json::to_string_pretty(&bundle)
        .map_err(|e| format!("Failed to serialize bundle: {}", e))
}

/// Import data from JSON bundle
#[tauri::command]
pub async fn import_data_bundle(bundle_json: String) -> Result<serde_json::Value, String> {
    let bundle: ExportBundle = serde_json::from_str(&bundle_json)
        .map_err(|e| format!("Failed to parse bundle: {}", e))?;

    let universe_count = bundle.universes.len();
    let journal_count = bundle.journal_entries.len();
    let has_plan = bundle.plan.is_some();

    for universe in bundle.universes {
        create_universe(universe.name, universe.description, universe.symbols).await?;
    }

    Ok(serde_json::json!({
        "success": true,
        "imported": {
            "universes": universe_count,
            "journal_entries": journal_count,
            "has_plan": has_plan,
        }
    }))
}
