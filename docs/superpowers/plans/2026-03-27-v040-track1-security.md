# Track 1 — Security: API Key Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the gap between keys stored in `tauri-plugin-store` (via SettingsPage) and the Rust data providers that currently only read from env vars via `get_env_var()`.

**Architecture:** Add a `RUNTIME_KEYS` global (`Arc<RwLock<HashMap>>`) in `lib.rs`. Populate it at startup from `API_KEYS_STORE` and on every `save_api_keys` call. Add a `get_api_key()` helper that checks `RUNTIME_KEYS` before falling back to `get_env_var()`. Update `MultiSourceProvider` and other services to use this helper. Fix `DataSourcesPage.tsx` stale VITE_ instructions.

**Tech Stack:** Rust (parking_lot RwLock, once_cell), tauri-plugin-store, TypeScript/React

---

## Context

The `SettingsPage` already has a full Stronghold vault UI and calls `save_api_keys` (stores in `tauri-plugin-store` JSON). However, `MultiSourceProvider::new()` (`src-tauri/src/modules/data_provider/multi_source_provider.rs:91-99`) calls `get_env_var()` which only reads from the in-memory `DECRYPTED_ENV` (loaded from `.env` at startup) or process env. Keys saved via Settings are silently ignored by data providers. The fix adds a runtime-mutable key store that bridges both code paths.

`DataSourcesPage.tsx` (lines 333-406) shows setup instructions with `VITE_*` env var names — this is stale and confusing, since keys are now managed via Settings → API Keys.

---

## File Map

| File | Action |
|---|---|
| `src-tauri/src/lib.rs` | Add `RUNTIME_KEYS` global + `get_api_key()` helper |
| `src-tauri/src/api/commands/settings.rs` | Update `save_api_keys` to also write to `RUNTIME_KEYS`; add `load_keys_from_store` command |
| `src-tauri/src/modules/data_provider/multi_source_provider.rs` | Use `get_api_key()` instead of `get_env_var()` in `new()` |
| `src-tauri/src/services/mod.rs` (or service files) | Same — use `get_api_key()` |
| `src/components/DataSourcesPage.tsx` | Replace VITE_ setup instructions with Settings-based instructions |
| `src-tauri/src/lib.rs` setup_fn | Call `load_keys_from_store` at app startup after DB init |

---

### Task 1: Add `RUNTIME_KEYS` global and `get_api_key()` helper

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `src-tauri/src/lib.rs` (or a new `src-tauri/src/core/api_keys.rs`):

```rust
#[cfg(test)]
mod runtime_keys_tests {
    use super::*;

    #[test]
    fn test_get_api_key_runtime_takes_priority_over_env() {
        // Set an env var
        std::env::set_var("TEST_FLOWFOLIO_PRIO", "from_env");
        // Set a runtime key
        RUNTIME_KEYS.write().insert("TEST_FLOWFOLIO_PRIO".to_string(), "from_runtime".to_string());
        // Runtime should win
        assert_eq!(get_api_key("TEST_FLOWFOLIO_PRIO"), Some("from_runtime".to_string()));
        // Cleanup
        RUNTIME_KEYS.write().remove("TEST_FLOWFOLIO_PRIO");
        std::env::remove_var("TEST_FLOWFOLIO_PRIO");
    }

    #[test]
    fn test_get_api_key_falls_back_to_env() {
        std::env::set_var("TEST_FLOWFOLIO_FALLBACK", "env_value");
        assert_eq!(get_api_key("TEST_FLOWFOLIO_FALLBACK"), Some("env_value".to_string()));
        std::env::remove_var("TEST_FLOWFOLIO_FALLBACK");
    }

    #[test]
    fn test_get_api_key_returns_none_when_absent() {
        assert_eq!(get_api_key("TEST_FLOWFOLIO_MISSING_XYZ"), None);
    }
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd src-tauri && cargo test runtime_keys_tests -- --nocapture
```

Expected: compile error — `RUNTIME_KEYS` and `get_api_key` not defined yet.

- [ ] **Step 3: Add `RUNTIME_KEYS` global and `get_api_key()` to `lib.rs`**

After the existing `Lazy` statics in `src-tauri/src/lib.rs` (around line 54), add:

```rust
use parking_lot::RwLock;

/// Runtime-mutable API key store. Keys saved via SettingsPage are written here
/// and take priority over environment variables. Updated at startup and on save.
pub(crate) static RUNTIME_KEYS: Lazy<Arc<RwLock<HashMap<String, String>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

/// Get an API key, checking RUNTIME_KEYS first, then falling back to get_env_var().
/// Use this everywhere instead of get_env_var() for user-configurable API keys.
pub(crate) fn get_api_key(key: &str) -> Option<String> {
    {
        let guard = RUNTIME_KEYS.read();
        if let Some(val) = guard.get(key) {
            if !val.is_empty() {
                return Some(val.clone());
            }
        }
    }
    crate::core::encrypted_env::get_env_var(key)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd src-tauri && cargo test runtime_keys_tests -- --nocapture
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(security): add RUNTIME_KEYS global and get_api_key() helper"
```

---

### Task 2: Populate `RUNTIME_KEYS` on startup and on save

**Files:**
- Modify: `src-tauri/src/api/commands/settings.rs`
- Modify: `src-tauri/src/lib.rs` (setup function)

- [ ] **Step 1: Write failing test**

Add to `src-tauri/src/api/commands/settings.rs`:

```rust
#[cfg(test)]
mod populate_keys_tests {
    use super::*;

    #[test]
    fn test_populate_runtime_keys_from_map() {
        use crate::RUNTIME_KEYS;
        let mut keys = std::collections::HashMap::new();
        keys.insert("FINNHUB_API_KEY".to_string(), "test_key_abc".to_string());
        populate_runtime_keys(keys);
        let guard = RUNTIME_KEYS.read();
        assert_eq!(guard.get("FINNHUB_API_KEY"), Some(&"test_key_abc".to_string()));
    }

    #[test]
    fn test_populate_runtime_keys_skips_empty_values() {
        use crate::RUNTIME_KEYS;
        let mut keys = std::collections::HashMap::new();
        keys.insert("SOME_KEY".to_string(), "".to_string());
        populate_runtime_keys(keys);
        let guard = RUNTIME_KEYS.read();
        assert_eq!(guard.get("SOME_KEY"), None);
    }
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd src-tauri && cargo test populate_keys_tests -- --nocapture
```

Expected: compile error — `populate_runtime_keys` not defined.

- [ ] **Step 3: Add `populate_runtime_keys` function to `settings.rs`**

Add this function before the `#[tauri::command]` handlers in `settings.rs`:

```rust
/// Write API keys from the store into RUNTIME_KEYS so data providers can use them.
/// Only non-empty values are written.
pub(crate) fn populate_runtime_keys(keys: HashMap<String, String>) {
    let mut guard = crate::RUNTIME_KEYS.write();
    for (k, v) in keys {
        if !v.is_empty() {
            guard.insert(k, v);
        }
    }
}
```

- [ ] **Step 4: Update `save_api_keys` to also call `populate_runtime_keys`**

In `save_api_keys` (line 34 of `settings.rs`), add after the store save:

```rust
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
    // Also update in-memory runtime keys so data providers use them immediately
    populate_runtime_keys(keys);
    Ok(())
}
```

- [ ] **Step 5: Add `load_keys_from_store` Tauri command**

Add after `save_api_keys` in `settings.rs`:

```rust
/// Load all API keys from the JSON store into RUNTIME_KEYS.
/// Called once at app startup so data providers can use store-saved keys immediately.
#[tauri::command]
pub async fn load_keys_from_store(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store(API_KEYS_STORE).map_err(|e| e.to_string())?;
    let mut keys = HashMap::new();
    for &key_name in API_KEY_NAMES {
        if let Some(serde_json::Value::String(val)) = store.get(key_name) {
            if !val.is_empty() {
                keys.insert(key_name.to_string(), val);
            }
        }
    }
    populate_runtime_keys(keys);
    Ok(())
}
```

- [ ] **Step 6: Register `load_keys_from_store` in `lib.rs` invoke_handler**

Find the `.invoke_handler(tauri::generate_handler![...])` call in `lib.rs` and add `settings::load_keys_from_store` to the list.

- [ ] **Step 7: Call `load_keys_from_store` at app startup**

In the `setup` closure in `lib.rs` (where `load_encrypted_env` and DB init are called), add:

```rust
// After DB init, load user-configured API keys from store into runtime
let app_handle_for_keys = app.handle().clone();
tauri::async_runtime::spawn(async move {
    if let Err(e) = crate::api::commands::settings::load_keys_from_store(app_handle_for_keys).await {
        tracing::warn!("Failed to load API keys from store: {}", e);
    }
});
```

- [ ] **Step 8: Run tests**

```bash
cd src-tauri && cargo test populate_keys_tests -- --nocapture
cd src-tauri && cargo test -- --nocapture 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/api/commands/settings.rs src-tauri/src/lib.rs
git commit -m "feat(security): populate RUNTIME_KEYS from store at startup and on save"
```

---

### Task 3: Update data providers to use `get_api_key()`

**Files:**
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs`

- [ ] **Step 1: Replace `get_env_var` calls in `MultiSourceProvider::new()`**

In `multi_source_provider.rs` lines 91-99, replace `crate::core::encrypted_env::get_env_var` with `crate::get_api_key`:

```rust
impl MultiSourceProvider {
    pub fn new() -> Self {
        // Load API keys — checks RUNTIME_KEYS (user-configured via Settings) first,
        // then falls back to get_env_var() (dev .env / encrypted release env).
        let alpaca_key = crate::get_api_key("ALPACA_API_KEY");
        let alpaca_secret = crate::get_api_key("ALPACA_SECRET_KEY");
        let polygon_key = crate::get_api_key("POLYGON_API_KEY");
        let alphavantage_key = crate::get_api_key("ALPHA_VANTAGE_API_KEY");
        let finnhub_key = crate::get_api_key("FINNHUB_API_KEY");
        let fmp_key = crate::get_api_key("FMP_API_KEY");
        // ... (continue for all keys, same pattern)
```

- [ ] **Step 2: Grep for other `get_env_var` calls in services that accept API keys**

```bash
grep -rn "get_env_var" src-tauri/src/services/ src-tauri/src/modules/
```

Replace any API key lookups (`*_API_KEY`, `*_SECRET`, `OPENROUTER_API_KEY`) with `crate::get_api_key()`. Leave non-key lookups (e.g. feature flags) using `get_env_var`.

- [ ] **Step 3: Build and verify**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/data_provider/ src-tauri/src/services/
git commit -m "feat(security): data providers now use get_api_key() for runtime-configurable keys"
```

---

### Task 4: Fix DataSourcesPage stale VITE_ instructions

**Files:**
- Modify: `src/components/DataSourcesPage.tsx`

- [ ] **Step 1: Find the stale instructions block**

The stale text is around lines 333-406 of `DataSourcesPage.tsx`. It shows a code block with `VITE_ALPACA_API_KEY=your_key` etc.

- [ ] **Step 2: Replace the stale env var setup block**

Find the block that renders VITE_ setup instructions and replace it with:

```tsx
{/* Setup Guide */}
<div className="setup-guide">
  <h4>How to configure API keys</h4>
  <p className="text-muted">
    API keys are stored securely on your device. To add or update keys:
  </p>
  <ol className="setup-steps">
    <li>Go to <strong>Settings → API Keys</strong></li>
    <li>Enter your key for each provider and click <strong>Save API Keys</strong></li>
    <li>Optionally, set up the <strong>Encrypted Vault</strong> to protect keys with a password</li>
  </ol>
  <p className="text-muted" style={{ fontSize: '12px' }}>
    Keys are stored locally and never sent to any external server.
    Free-tier keys are sufficient for all features.
  </p>
</div>
```

- [ ] **Step 3: Remove all literal `VITE_*` strings from the component**

```bash
grep -n "VITE_" src/components/DataSourcesPage.tsx
```

Replace any remaining `VITE_OPENROUTER_API_KEY` / `VITE_ALPACA_API_KEY` text references in the component with the proper key names (`OPENROUTER_API_KEY`, `ALPACA_API_KEY`), or remove the references if they're in old setup instructions.

- [ ] **Step 4: Verify the grep check passes**

```bash
grep -n "VITE_.*KEY" src/components/DataSourcesPage.tsx
```

Expected: no results (only `VITE_SERVER_URL`, `VITE_REPORT_MODEL`, `VITE_VIBE_STUDIO_MODEL` are acceptable non-key usages elsewhere).

- [ ] **Step 5: Visual check**

```bash
npm run dev:web
```

Open DataSourcesPage, verify setup instructions make sense and don't reference VITE_ env vars.

- [ ] **Step 6: Commit**

```bash
git add src/components/DataSourcesPage.tsx
git commit -m "fix(ui): replace stale VITE_ env var instructions in DataSourcesPage with Settings-based guide"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Start the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Add an API key via Settings**

Open Settings → API Keys, enter a test value for `Finnhub Key`, click Save.

- [ ] **Step 3: Verify key is in runtime store**

Add a temporary log line to `get_api_key()` in `lib.rs`:
```rust
tracing::debug!("get_api_key({}) => {:?}", key, result);
```
Check the console for `get_api_key("FINNHUB_API_KEY") => Some("...")`.

Remove the log line after verification.

- [ ] **Step 4: Final grep check**

```bash
grep -r "VITE_.*KEY" src/
```

Expected: zero results for actual API key env vars. Only model name vars (`VITE_VIBE_STUDIO_MODEL`, `VITE_REPORT_MODEL`) and server URL (`VITE_SERVER_URL`) are acceptable.

- [ ] **Step 5: Run full test suite**

```bash
cd src-tauri && cargo test
npm test
```

Expected: all pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(security): complete T1 — API keys bridge store→providers, fix DataSourcesPage instructions"
```
