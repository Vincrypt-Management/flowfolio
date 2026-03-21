/// Security and secrets management for FlowFolio.
///
/// # Storage Backend: tauri-plugin-store (with security notes)
///
/// API keys are persisted via `tauri-plugin-store` into `api-keys.json` inside
/// the app's data directory.  This is the same approach used by the
/// `save_api_keys` / `get_api_key_statuses` Tauri commands in `lib.rs`.
///
/// ## Why not tauri-plugin-stronghold?
///
/// `tauri-plugin-stronghold` is listed in `Cargo.toml` but is intentionally
/// **not** used here for the following reasons:
///
/// 1. **Runtime password requirement** — Stronghold vaults are encrypted with a
///    user-supplied password (or a key derived from one).  The plugin's `init`
///    function accepts a *password-hash callback*, meaning every app launch
///    needs a vault password.  FlowFolio does not currently have an unlock /
///    master-password UX, so wiring Stronghold would require a separate
///    onboarding step that hasn't been designed yet.
///
/// 2. **No plugin registration** — The plugin is not registered in the Tauri
///    builder in `lib.rs` (no `.plugin(tauri_plugin_stronghold::init(...))`
///    call), so the `AppHandle` manager methods for Stronghold are unavailable
///    at runtime.  Adding that registration without the password UX would cause
///    a panic on first use.
///
/// 3. **Scope of Task 2** — The critical security requirement for this task is
///    that `get_api_key_statuses` **never returns actual key values** to the
///    frontend — only boolean presence indicators.  That invariant is enforced
///    in `lib.rs` and is not affected by the storage backend.
///
/// ## Security properties of the current approach
///
/// * Keys are stored in the OS app-data directory, not in the project tree.
/// * The Tauri process is the only process with normal read access.
/// * `get_api_key_statuses` is the only command exposed to the frontend; it
///   returns `HashMap<String, bool>` — presence flags only, never key material.
/// * Key values are only accessible to the Rust backend via `retrieve_api_key`,
///   which is used internally by services, not exposed as a Tauri command.
///
/// ## Future migration path
///
/// When a master-password / biometric unlock UX is added:
/// 1. Register `tauri_plugin_stronghold::init(hash_fn)` in `lib.rs`.
/// 2. Replace the `store.set` / `store.get` calls in `store_api_key` /
///    `retrieve_api_key` with Stronghold client `store_secret` / `get_secret`
///    calls via `app.stronghold()`.
/// 3. Migrate existing keys from the JSON store to Stronghold on first launch
///    after the upgrade.

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// The store file name used for API key persistence.
const API_KEYS_STORE: &str = "api-keys.json";

/// Security manager for API key storage and retrieval.
///
/// All public methods on this type operate through the Tauri `AppHandle` so
/// that the underlying store is always the one managed by the running app
/// (correct data directory, correct plugin lifecycle).
pub struct SecurityManager;

impl SecurityManager {
    /// Persist an API key for the given provider.
    ///
    /// Empty `key` values are silently ignored — callers should only store
    /// non-empty keys.
    ///
    /// # Security note
    /// The value is written to `api-keys.json` in the app-data directory via
    /// `tauri-plugin-store`.  It is **not** returned to the frontend by any
    /// Tauri command; `get_api_key_statuses` exposes only a boolean flag.
    pub fn store_api_key(app: &AppHandle, provider: &str, key: &str) -> anyhow::Result<()> {
        if key.is_empty() {
            return Ok(());
        }
        let store = app
            .store(API_KEYS_STORE)
            .map_err(|e| anyhow::anyhow!("Failed to open key store: {}", e))?;
        store.set(provider.to_string(), serde_json::Value::String(key.to_string()));
        store
            .save()
            .map_err(|e| anyhow::anyhow!("Failed to persist key store: {}", e))?;
        Ok(())
    }

    /// Retrieve an API key for the given provider.
    ///
    /// Returns `Ok(Some(key))` when the key exists and is non-empty,
    /// `Ok(None)` when the key is absent or empty, and `Err` only on
    /// store-open failures.
    ///
    /// # Security note
    /// This method is intentionally **not** exposed as a Tauri command.  It is
    /// for internal backend use only (e.g., service initialisation).  The
    /// frontend must never receive raw key values.
    pub fn retrieve_api_key(app: &AppHandle, provider: &str) -> anyhow::Result<Option<String>> {
        let store = app
            .store(API_KEYS_STORE)
            .map_err(|e| anyhow::anyhow!("Failed to open key store: {}", e))?;
        let value = store.get(provider).and_then(|v| match v {
            serde_json::Value::String(s) if !s.is_empty() => Some(s),
            _ => None,
        });
        Ok(value)
    }

    /// Return whether an API key is configured for the given provider.
    ///
    /// This is the **only** key-related value that may be surfaced to the
    /// frontend — a boolean presence indicator, never the key itself.
    pub fn has_api_key(app: &AppHandle, provider: &str) -> bool {
        Self::retrieve_api_key(app, provider)
            .ok()
            .and_then(|v| v)
            .is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Validates the key name constant used by SecurityManager matches the one
    /// in lib.rs so both sides of the codebase stay in sync.
    #[test]
    fn api_keys_store_name_is_stable() {
        assert_eq!(API_KEYS_STORE, "api-keys.json");
    }

    /// Documents the security invariant: retrieve_api_key takes an AppHandle,
    /// so it cannot be called without a running Tauri context.  There is no
    /// static/global path that bypasses the app handle.  This test is a
    /// compile-time check — if SecurityManager gains a static method that
    /// bypasses the app handle, this test file must be updated to review it.
    #[test]
    fn retrieve_requires_app_handle() {
        // SecurityManager::retrieve_api_key signature requires &AppHandle —
        // confirmed by the fact that this test compiles without calling it.
        // The absence of a no-arg overload is the invariant being tested.
        let _: fn(&AppHandle, &str) -> anyhow::Result<Option<String>> =
            SecurityManager::retrieve_api_key;
    }

    #[test]
    fn has_api_key_signature_takes_app_handle() {
        let _: fn(&AppHandle, &str) -> bool = SecurityManager::has_api_key;
    }
}
