# Comprehensive Codebase Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical security vulnerabilities, architectural issues, code quality problems, testing gaps, and incomplete features identified in the comprehensive code review.

**Architecture:** Six phases executed sequentially — security fixes first (they block everything), then architecture cleanup, developer experience, code standards compliance, testing, and feature completion. Each phase produces independently committable, working software.

**Tech Stack:** Rust (Tauri 2), React 19, TypeScript, SQLite, tracing, ESLint, Vitest

---

## Phase 1: Security Fixes

### Task 1: Remove Hardcoded Encryption Keys — Use Machine-Derived Key

**Files:**
- Modify: `src-tauri/src/core/encrypted_env.rs:21-31`
- Modify: `src-tauri/src/core/encrypted_env.rs:38-59` (encrypt_string)
- Modify: `src-tauri/src/core/encrypted_env.rs:63-89` (decrypt_string)
- Modify: `src-tauri/src/core/encrypted_env.rs:161-174` (load_embedded_env)

**Context:** The current implementation uses hardcoded static AES and ChaCha20 keys/nonces embedded in the binary. Anyone who extracts the binary can decrypt `.env.encrypted`. The dual-layer encryption with static keys provides zero actual security.

**Approach:** Replace with a single-layer AES-256-GCM using a key derived at runtime from a machine-specific identifier (hostname + username hash) via PBKDF2. Random nonces stored alongside the ciphertext. This is obfuscation-grade (appropriate for a desktop app where the user owns the machine), but honestly documented as such.

- [ ] **Step 1: Update module documentation to be honest about security level**

Replace the module doc comment at the top of `src-tauri/src/core/encrypted_env.rs`:

```rust
//! Encrypted Environment Variables — Obfuscation Layer
//!
//! This module provides obfuscated storage of environment variables for release
//! builds. API keys are encrypted using AES-256-GCM with a machine-derived key.
//!
//! IMPORTANT: This is NOT cryptographically secure against a determined attacker
//! with access to the binary and the same machine. It prevents casual inspection
//! of the binary and protects against accidental key leakage in logs/screenshots.
//!
//! For true secret protection, use the Stronghold vault (requires master password).
//!
//! In debug mode, plain .env files are used for convenience.
//! In release mode, the encrypted payload is embedded at compile time.
```

- [ ] **Step 2: Replace static keys with machine-derived key**

Remove the four `const` lines (AES_KEY, CHACHA_KEY, AES_NONCE, CHACHA_NONCE). Replace with a key derivation function:

```rust
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce, AeadCore,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::collections::HashMap;

/// Derive an encryption key from machine-specific identifiers.
/// This is obfuscation-grade — not secure against local attackers.
fn derive_machine_key() -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "flowfolio-default".to_string());

    let username = whoami::username();

    let mut hasher = DefaultHasher::new();
    format!("flowfolio-env-key-{}-{}", hostname, username).hash(&mut hasher);
    let seed = hasher.finish();

    // Stretch the seed into 32 bytes using repeated hashing
    let mut key = [0u8; 32];
    for i in 0..4 {
        let mut h = DefaultHasher::new();
        (seed, i as u64).hash(&mut h);
        let chunk = h.finish().to_le_bytes();
        key[i * 8..(i + 1) * 8].copy_from_slice(&chunk);
    }
    key
}
```

- [ ] **Step 3: Update encrypt_string to use random nonces**

```rust
/// Encrypt a string using AES-256-GCM with a machine-derived key.
/// The random 12-byte nonce is prepended to the ciphertext.
pub fn encrypt_string(plaintext: &str) -> Result<String, String> {
    let key = derive_machine_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}
```

- [ ] **Step 4: Update decrypt_string to extract nonce from ciphertext**

```rust
/// Decrypt a base64-encoded AES-256-GCM encrypted string.
/// Expects the 12-byte nonce prepended to the ciphertext.
pub fn decrypt_string(encrypted: &str) -> Result<String, String> {
    let combined = BASE64.decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    if combined.len() < 12 {
        return Err("Encrypted data too short (missing nonce)".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = derive_machine_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 conversion failed: {}", e))
}
```

- [ ] **Step 5: Remove chacha20poly1305 dependency**

In `src-tauri/Cargo.toml`, remove the line:
```
chacha20poly1305 = "0.10"
```

Add `whoami` crate (cross-platform, supports all targets including mobile):
```toml
whoami = "1.5"
```

Note: Do NOT use the `hostname` crate as it lacks Android/iOS support. Use `whoami::fallible::hostname()` instead which is cross-platform. Update `derive_machine_key()` accordingly:
```rust
fn derive_machine_key() -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let hostname = whoami::fallible::hostname()
        .unwrap_or_else(|_| "flowfolio-default".to_string());
    let username = whoami::username();
    // ... rest unchanged
}
```

Remove the `use chacha20poly1305` import from `encrypted_env.rs`.

- [ ] **Step 6: Fix `std::env::set_var` unsoundness in `load_embedded_env`**

Replace the unsafe `set_var` loop with a safe approach that stores vars in a `HashMap` and provides a lookup function:

```rust
use once_cell::sync::OnceCell;

/// Decrypted environment variables (set once at startup)
static DECRYPTED_ENV: OnceCell<HashMap<String, String>> = OnceCell::new();

/// Get a decrypted env var by key (checks DECRYPTED_ENV first, then std::env)
pub fn get_env_var(key: &str) -> Option<String> {
    DECRYPTED_ENV
        .get()
        .and_then(|vars| vars.get(key).cloned())
        .or_else(|| std::env::var(key).ok())
}

/// Decrypt the compile-time embedded encrypted env and store in memory
pub fn load_embedded_env() -> Result<(), String> {
    let encrypted_content = EMBEDDED_ENCRYPTED_ENV.trim();
    let vars = decrypt_env_file(encrypted_content)?;
    let count = vars.len();

    DECRYPTED_ENV.set(vars).map_err(|_| "Encrypted env already loaded".to_string())?;

    eprintln!(
        "[INFO] [env] Loaded {} embedded encrypted env vars",
        count
    );
    Ok(())
}
```

- [ ] **Step 7: Update encrypt_env.rs binary to use library functions**

The `src-tauri/src/bin/encrypt_env.rs` has its own standalone copy of all encryption logic with the old static keys. It MUST be updated to call the library functions, otherwise it will produce ciphertext incompatible with the updated library.

Replace the entire file content:

```rust
//! FlowFolio Environment Encryptor
//!
//! CLI tool to encrypt .env files for release builds.
//! Uses AES-256-GCM with machine-derived key.
//!
//! Usage:
//!     cargo run --bin encrypt-env [input_file] [output_file]

use flowfolio_lib::core::encrypted_env::{encrypt_string, decrypt_string};
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let default_input = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
    let default_output = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env.encrypted");

    let input_path = if args.len() > 1 { Path::new(&args[1]).to_path_buf() } else { default_input };
    let output_path = if args.len() > 2 { Path::new(&args[2]).to_path_buf() } else { default_output };

    println!("FlowFolio Environment Encryptor");
    println!("================================");
    println!("Security: AES-256-GCM with machine-derived key");
    println!();

    if !input_path.exists() {
        eprintln!("Error: Input file '{}' not found", input_path.display());
        std::process::exit(1);
    }

    let plaintext = std::fs::read_to_string(&input_path).unwrap_or_else(|e| {
        eprintln!("Error reading input file: {}", e);
        std::process::exit(1);
    });

    println!("Input:  {} ({} bytes)", input_path.display(), plaintext.len());

    let encrypted = encrypt_string(&plaintext).unwrap_or_else(|e| {
        eprintln!("Encryption failed: {}", e);
        std::process::exit(1);
    });

    std::fs::write(&output_path, &encrypted).unwrap_or_else(|e| {
        eprintln!("Error writing output file: {}", e);
        std::process::exit(1);
    });

    println!("Output: {} ({} bytes)", output_path.display(), encrypted.len());
    println!();

    println!("Verifying encryption...");
    let decrypted = decrypt_string(&encrypted).unwrap_or_else(|e| {
        eprintln!("Verification FAILED: {}", e);
        std::process::exit(1);
    });

    if decrypted == plaintext {
        println!("Verification successful - decryption matches original");
    } else {
        eprintln!("Verification FAILED - decryption does not match!");
        std::process::exit(1);
    }
}
```

**IMPORTANT:** For this to work, `encrypt_string` and `decrypt_string` must be `pub` in `core::encrypted_env` and `core` must be `pub mod core;` in `lib.rs` (it already is at line 13).

Run: `cd src-tauri && cargo check --bin encrypt-env`
Expected: Compiles successfully

- [ ] **Step 8: Update tests**

Update the test module in `encrypted_env.rs` to remove references to the old dual-layer scheme:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "API_KEY=secret123\nOTHER=value456";
        let encrypted = encrypt_string(original).unwrap();
        let decrypted = decrypt_string(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_parse_env_content() {
        let content = "# Comment\nAPI_KEY=secret123\nQUOTED=\"quoted value\"\n";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.get("API_KEY"), Some(&"secret123".to_string()));
        assert_eq!(vars.get("QUOTED"), Some(&"quoted value".to_string()));
    }

    #[test]
    fn test_decrypt_too_short() {
        let result = decrypt_string(&BASE64.encode(&[0u8; 5]));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too short"));
    }

    #[test]
    fn test_get_env_var_fallback() {
        // Before loading, should fall back to std::env
        std::env::set_var("TEST_FLOWFOLIO_VAR", "test_value");
        assert_eq!(get_env_var("TEST_FLOWFOLIO_VAR"), Some("test_value".to_string()));
        std::env::remove_var("TEST_FLOWFOLIO_VAR");
    }
}
```

- [ ] **Step 9: Run tests and verify**

Run: `cd src-tauri && cargo test core::encrypted_env -- --nocapture`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/core/encrypted_env.rs src-tauri/Cargo.toml
git commit -m "security: replace hardcoded encryption keys with machine-derived key

Remove static AES/ChaCha keys and nonces from binary. Use AES-256-GCM
with machine-derived key and random nonces. Fix std::env::set_var
unsoundness by storing decrypted vars in OnceCell. Honestly document
this as obfuscation-grade, not cryptographic security."
```

---

### Task 2: Remove VITE_ Prefix from API Keys

**Files:**
- Modify: `.env.example:19-67` (remove VITE_ prefixed keys)
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs:93-100`
- Modify: `src-tauri/src/services/openrouter_service.rs:66-72`
- Modify: `src-tauri/src/lib.rs:1449-1453` (diagnostics check)
- Modify: `src-tauri/src/lib.rs:2789-2791` (ai_chat_stream)

**Context:** All API keys use `VITE_` prefix which causes Vite to embed them in the frontend JS bundle. The Rust backend reads them with `std::env::var("VITE_*")` fallbacks. The non-VITE versions already exist as primary in `.env.example` lines 5-13 but the VITE_ versions remain as fallbacks everywhere.

- [ ] **Step 1: Remove all VITE_ fallbacks from multi_source_provider.rs**

In `src-tauri/src/modules/data_provider/multi_source_provider.rs`, lines 93-100, change each line from:
```rust
let alpaca_key = std::env::var("ALPACA_API_KEY").or_else(|_| std::env::var("VITE_ALPACA_API_KEY")).ok();
```
to:
```rust
let alpaca_key = std::env::var("ALPACA_API_KEY").ok();
```

Apply to all 8 provider keys (alpaca_key, alpaca_secret, polygon_key, alphavantage_key, finnhub_key, fmp_key, tiingo_key, twelve_data_key).

**REQUIRED:** Task 1 must be completed first. Use `get_env_var` from Task 1:
```rust
use crate::core::encrypted_env::get_env_var;
let alpaca_key = get_env_var("ALPACA_API_KEY");
```

- [ ] **Step 2: Remove VITE_ fallbacks from openrouter_service.rs**

In `src-tauri/src/services/openrouter_service.rs`, lines 66-72, change:
```rust
let api_key = std::env::var("OPENROUTER_API_KEY").or_else(|_| std::env::var("VITE_OPENROUTER_API_KEY")).ok();
let api_url = std::env::var("OPENROUTER_API_URL")
    .or_else(|_| std::env::var("VITE_OPENROUTER_API_URL"))
    .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string());
let default_model = std::env::var("DEFAULT_LLM_MODEL")
    .or_else(|_| std::env::var("VITE_DEFAULT_LLM_MODEL"))
    .unwrap_or_else(|_| "anthropic/claude-3-sonnet-20240229".to_string());
```
to:
```rust
let api_key = get_env_var("OPENROUTER_API_KEY");
let api_url = get_env_var("OPENROUTER_API_URL")
    .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
let default_model = get_env_var("DEFAULT_LLM_MODEL")
    .unwrap_or_else(|| "anthropic/claude-3-sonnet-20240229".to_string());
```

- [ ] **Step 3: Remove VITE_ fallbacks from lib.rs diagnostics**

In `src-tauri/src/lib.rs`, lines 1449-1453, change each:
```rust
let alpaca_configured = std::env::var("ALPACA_API_KEY").or_else(|_| std::env::var("VITE_ALPACA_API_KEY")).is_ok();
```
to:
```rust
let alpaca_configured = get_env_var("ALPACA_API_KEY").is_some();
```

- [ ] **Step 4: Fix ai_chat_stream in lib.rs**

At line 2789-2791:
```rust
let api_key = std::env::var("OPENROUTER_API_KEY")
    .or_else(|_| std::env::var("VITE_OPENROUTER_API_KEY"))
    .map_err(|_| "OpenRouter API key not configured".to_string())?;
```
Change to:
```rust
let api_key = get_env_var("OPENROUTER_API_KEY")
    .ok_or_else(|| "OpenRouter API key not configured".to_string())?;
```

- [ ] **Step 5: Clean up .env.example — remove VITE_ API key entries**

Remove lines 19-67 (all `VITE_*_API_KEY` entries). Keep only the non-prefixed keys at lines 5-13 and the non-secret `VITE_` config entries (APP_NAME, APP_VERSION, DEFAULT_LLM_MODEL, etc.):

```
# Backend API keys (read by Rust backend only — never embedded in JS bundle)
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
FINNHUB_API_KEY=
FMP_API_KEY=
TIINGO_API_KEY=
TWELVE_DATA_API_KEY=
POLYGON_API_KEY=
ALPHA_VANTAGE_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_API_URL=https://openrouter.ai/api/v1

# Application Configuration (safe to embed — not secrets)
VITE_APP_NAME=Flowfolio
VITE_APP_VERSION=1.0.0
VITE_DEFAULT_LLM_MODEL=anthropic/claude-3-sonnet-20240229
```

- [ ] **Step 6: Search for any remaining VITE_ key references in Rust**

Run: `cd src-tauri && grep -rn "VITE_.*API_KEY\|VITE_.*SECRET" src/`
Expected: No matches (all removed)

- [ ] **Step 7: Commit**

```bash
git add .env.example src-tauri/src/modules/data_provider/multi_source_provider.rs src-tauri/src/services/openrouter_service.rs src-tauri/src/lib.rs
git commit -m "security: remove VITE_ prefix from all API keys

API keys with VITE_ prefix get embedded in the frontend JS bundle by
Vite, exposing them to anyone who inspects the app. All Rust backend
code now reads non-prefixed env vars only via get_env_var()."
```

---

### Task 3: Fix Updater Public Key and CSP

**Files:**
- Modify: `src-tauri/tauri.conf.json:23,32-35`
- Modify: `src-tauri/capabilities/default.json:23-28`

- [ ] **Step 1: Fix CSP — remove supabase, localhost, and object-src blob:**

In `src-tauri/tauri.conf.json`, line 23, update the CSP:

```json
"csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.openrouter.ai https://*.alphavantage.co https://*.finnhub.io https://*.yahoo.com https://*.duckduckgo.com https://*.tavily.com https://*.brave.com https://*.alpaca.markets; object-src 'none'; base-uri 'self'; form-action 'self';"
```

Changes:
- Removed `blob: data:` from `default-src`
- Removed `https://*.supabase.co` (not used)
- Removed `http://localhost:3001` (dev-only)
- Changed `object-src blob:` to `object-src 'none'`

- [ ] **Step 2: Disable updater until a real pubkey is generated**

In `src-tauri/tauri.conf.json`, remove the updater plugin config (lines 32-35):

```json
"plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["flowfolio"]
      }
    }
  },
```

Also remove `tauri_plugin_updater::Builder::new().build()` from `lib.rs` line 3088 and `"updater:default"` from `capabilities/default.json` line 19.

When ready to ship auto-updates, generate a key pair with `tauri signer generate -w ~/.tauri/flowfolio.key` and add the pubkey back.

- [ ] **Step 3: Scope filesystem permissions**

In `src-tauri/capabilities/default.json`, replace the fs:scope:

```json
{
    "identifier": "fs:scope",
    "allow": [
        "$APPDATA/**",
        "$APPCACHE/**",
        "$APPLOCALDATA/**",
        "$DOWNLOAD/**",
        "$DOCUMENT/**"
    ]
}
```

Removes `$HOME/**` (entire home directory) and `$DESKTOP/**` (unnecessary). Adds `$APPDATA`, `$APPCACHE`, `$APPLOCALDATA` for the app's own data.

- [ ] **Step 4: Run cargo check to verify config changes don't break the build**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/src/lib.rs
git commit -m "security: fix CSP, disable unsigned updater, scope filesystem

Remove supabase and localhost from CSP. Change object-src to 'none'.
Disable updater plugin until a real signing key is generated. Restrict
fs:scope from \$HOME/** to app-specific directories only."
```

---

### Task 4: Fix Production .unwrap() Panics

**Files:**
- Modify: `src-tauri/src/lib.rs:3046` (tax loss sort)
- Modify: `src-tauri/src/lib.rs:3216-3218` (setup expect)
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs:377` (SystemTime unwrap)

- [ ] **Step 1: Fix tax loss harvest sort**

Replace line 3046:
```rust
opportunities.sort_by(|a, b| a["unrealized_loss"].as_f64().unwrap().partial_cmp(&b["unrealized_loss"].as_f64().unwrap()).unwrap());
```
with:
```rust
opportunities.sort_by(|a, b| {
    let a_val = a["unrealized_loss"].as_f64().unwrap_or(0.0);
    let b_val = b["unrealized_loss"].as_f64().unwrap_or(0.0);
    a_val.partial_cmp(&b_val).unwrap_or(std::cmp::Ordering::Equal)
});
```

- [ ] **Step 2: Fix setup expect**

Replace lines 3216-3218:
```rust
let salt_path = app.path().app_local_data_dir()
    .expect("could not resolve app local data path")
    .join("stronghold-salt.txt");
```
with:
```rust
let salt_path = match app.path().app_local_data_dir() {
    Ok(dir) => dir.join("stronghold-salt.txt"),
    Err(e) => {
        eprintln!("[WARN] [app] Could not resolve app local data path: {e}");
        return Ok(());
    }
};
```

- [ ] **Step 3: Fix SystemTime unwrap in Finnhub provider**

Replace `multi_source_provider.rs` line 377:
```rust
let end_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
```
with:
```rust
let end_time = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(1_700_000_000); // Fallback: ~Nov 2023 (reasonable default)
```

Note: Do NOT use `Duration::from_secs(0)` as fallback — it would make `start_time = 0 - 1_year` which overflows. A known reasonable timestamp is safer.

- [ ] **Step 4: Verify no other production unwraps remain**

Run: `cd src-tauri && grep -n '\.unwrap()' src/lib.rs | grep -v '#\[cfg(test)\]' | grep -v 'mod tests' | head -20`

Check that remaining unwraps are either in test code or on infallible operations (like `NonZeroU32::new(1).unwrap()`).

- [ ] **Step 5: Run tests**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/modules/data_provider/multi_source_provider.rs
git commit -m "security: replace production .unwrap() calls with safe alternatives

Fix panic risks in tax loss harvest sort, app setup, and Finnhub
SystemTime calculation. All now use unwrap_or or match for graceful
error handling."
```

---

### Task 5: Add Ticker Symbol Input Validation

**Files:**
- Create: `src-tauri/src/core/validation.rs`
- Modify: `src-tauri/src/core/mod.rs` (add validation module)
- Modify: `src-tauri/src/lib.rs` (add validation to key commands)

- [ ] **Step 1: Add regex to Cargo.toml and create validation module**

First add `regex = "1.11"` to `src-tauri/Cargo.toml` dependencies, then create the file:

```rust
// src-tauri/src/core/validation.rs

use once_cell::sync::Lazy;
use regex::Regex;

static SYMBOL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[A-Z0-9.\-]{1,10}$").expect("invalid regex")
});

/// Validate a ticker symbol. Allows uppercase letters, digits, dots, hyphens. 1-10 chars.
pub fn validate_symbol(symbol: &str) -> Result<(), String> {
    let symbol = symbol.trim();
    if symbol.is_empty() {
        return Err("Symbol cannot be empty".to_string());
    }
    if !SYMBOL_RE.is_match(symbol) {
        return Err(format!(
            "Invalid symbol '{}': must be 1-10 uppercase alphanumeric characters",
            symbol
        ));
    }
    Ok(())
}

/// Validate a list of symbols
pub fn validate_symbols(symbols: &[String]) -> Result<(), String> {
    for s in symbols {
        validate_symbol(s)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_symbols() {
        assert!(validate_symbol("AAPL").is_ok());
        assert!(validate_symbol("BRK.B").is_ok());
        assert!(validate_symbol("SPY").is_ok());
        assert!(validate_symbol("X").is_ok());
    }

    #[test]
    fn test_invalid_symbols() {
        assert!(validate_symbol("").is_err());
        assert!(validate_symbol("aapl").is_err()); // lowercase
        assert!(validate_symbol("TOOLONGSYMBOL").is_err()); // >10 chars
        assert!(validate_symbol("AAPL/../hack").is_err()); // path traversal
        assert!(validate_symbol("A%00B").is_err()); // null byte
    }
}
```

- [ ] **Step 2: Register module in core/mod.rs**

Add `pub mod validation;` to `src-tauri/src/core/mod.rs`.

- [ ] **Step 3: Add validation to key Tauri commands in lib.rs**

Add `use crate::core::validation::validate_symbol;` at the imports.

Add validation at the start of commands that take symbol parameters, e.g. in `score_symbols_batch`, `get_quant_metrics_batch`, `get_current_prices` (wherever symbols are received from the frontend). Example:

```rust
for symbol in &symbols {
    validate_symbol(symbol)?;
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test core::validation -- --nocapture`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/validation.rs src-tauri/src/core/mod.rs src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "security: add ticker symbol input validation

Validate symbol format (uppercase alphanumeric, 1-10 chars) before
passing to API URL construction. Prevents path traversal injection
via crafted symbol names."
```

---

## Phase 2: Architecture Core

### Task 6: Remove Outer Mutex from ENHANCED_MARKET_SERVICE

**Files:**
- Modify: `src-tauri/src/lib.rs:46,52-54` (change type from `Arc<Mutex<T>>` to `Arc<T>`)
- Modify: `src-tauri/src/lib.rs` (all ~19 `.lock().await` call sites)
- Modify: `src-tauri/src/services/enhanced_market_service.rs` (ensure methods take `&self` not `&mut self`)

**Context:** `EnhancedMarketDataService` already uses `Arc<RwLock<HashMap>>` and `Arc<DashMap>` internally for thread safety. The outer `Mutex` serializes all market data commands behind a single lock, including across network I/O await points (up to 30s timeouts). This kills all concurrency.

- [ ] **Step 1: Verify EnhancedMarketDataService methods use &self**

Read `src-tauri/src/services/enhanced_market_service.rs` and confirm all public methods take `&self`, not `&mut self`. If any take `&mut self`, change them to `&self` using interior mutability.

- [ ] **Step 2: Change global type to Arc (no Mutex)**

In `lib.rs`, change:
```rust
static ref ENHANCED_MARKET_SERVICE: Arc<Mutex<EnhancedMarketDataService>> =
    Arc::new(Mutex::new(EnhancedMarketDataService::new_without_db()));
```
to:
```rust
static ref ENHANCED_MARKET_SERVICE: Arc<EnhancedMarketDataService> =
    Arc::new(EnhancedMarketDataService::new_without_db());
```

Remove the `use tokio::sync::Mutex;` import if no longer needed.

- [ ] **Step 3: Replace all .lock().await with direct method calls**

Search for `ENHANCED_MARKET_SERVICE.lock().await` — there are approximately 26 call sites (not 19). Replace each occurrence. For example:

Before:
```rust
let service = ENHANCED_MARKET_SERVICE.lock().await;
let result = service.get_current_price(&symbol).await;
```

After:
```rust
let result = ENHANCED_MARKET_SERVICE.get_current_price(&symbol).await;
```

Run: `grep -c "ENHANCED_MARKET_SERVICE.lock()" src-tauri/src/lib.rs` to get exact count, then verify zero remain after changes.

**IMPORTANT:** Do NOT remove the `use tokio::sync::Mutex;` import — it is still needed by `DB_POOL: Arc<Mutex<Option<Pool<Sqlite>>>>`. Only the `ENHANCED_MARKET_SERVICE` mutex is being removed.

- [ ] **Step 4: Fix init_market_service_with_db**

This function currently takes the mutex to set the DB pool. Change it to use an interior-mutable setter on the service:

```rust
async fn init_market_service_with_db(pool: sqlx::Pool<sqlx::Sqlite>) {
    ENHANCED_MARKET_SERVICE.set_db_pool(pool.clone()).await;
    // Store pool globally too
    let mut db = DB_POOL.lock().await;
    *db = Some(pool);
    DB_INITIALIZED.store(true, Ordering::Release);
}
```

This requires `EnhancedMarketDataService` to have an `async fn set_db_pool(&self, pool: Pool<Sqlite>)` method that sets via interior mutability (e.g., `RwLock<Option<Pool>>`).

- [ ] **Step 5: Run tests and cargo check**

Run: `cd src-tauri && cargo check && cargo test -- --nocapture`
Expected: Compiles and all tests pass

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/services/enhanced_market_service.rs
git commit -m "perf: remove outer Mutex from ENHANCED_MARKET_SERVICE

The service already uses interior mutability (RwLock, DashMap). The
outer Tokio Mutex serialized all market data commands behind a single
lock held across network I/O, killing concurrency. Now uses Arc<T>
directly."
```

---

### Task 7: Delete Dead Code

**Files:**
- Delete: `src-tauri/src/services/market_data_service.rs`
- Delete: `src/App_rankings.tsx`
- Modify: `src-tauri/src/services/mod.rs` (remove market_data_service module)
- Modify: `src-tauri/src/modules/export/mod.rs` (remove dead stubs or delete)
- Modify: `src-tauri/src/domain/` (remove empty facade modules)

- [ ] **Step 1: Delete market_data_service.rs**

Verify it's unused: `grep -rn "market_data_service" src-tauri/src/ --include="*.rs" | grep -v "market_data_service.rs"`

If only referenced in `services/mod.rs` as `#[allow(dead_code)] mod market_data_service;`, remove the module declaration and delete the file.

- [ ] **Step 2: Delete App_rankings.tsx**

Verify it's unused: `grep -rn "App_rankings" src/`

If no imports, delete the file.

- [ ] **Step 3: Clean up domain/ facades**

Check each domain module (`market`, `analysis`, `portfolio`, `journal`). If they only contain `#[allow(unused_imports)] pub use crate::modules::*;` re-exports with no actual logic, delete the re-exports and leave only `pub mod` declarations or remove the module files entirely.

- [ ] **Step 4: Clean up modules/export**

If `ExportManager` is completely unimplemented (only `// TODO` stubs) and the actual export commands are inline in `lib.rs`, delete the `modules/export/` directory and its mod declaration.

- [ ] **Step 5: Remove unused Cargo dependencies**

Remove from Cargo.toml:
```toml
# Remove these unused crates
metrics = "0.24"
backoff = { version = "0.4", features = ["tokio"] }
arc-swap = "1.7"
lazy_static = "1.4"  # Replace with once_cell (already a dep)
```

Replace ALL `lazy_static!` macro usages with `once_cell::sync::Lazy`. The macro appears in these files:
- `src-tauri/src/lib.rs` (2 blocks: line 52 and line 1755)
- `src-tauri/src/core/config/mod.rs` (line 138)
- `src-tauri/src/modules/progress.rs` (line 190)
- `src-tauri/src/modules/health.rs` (line 339)

ALL must be converted before removing the crate. Example conversion:

```rust
// Before (lazy_static)
lazy_static::lazy_static! {
    static ref ENHANCED_MARKET_SERVICE: Arc<EnhancedMarketDataService> =
        Arc::new(EnhancedMarketDataService::new_without_db());
}

// After (once_cell)
use once_cell::sync::Lazy;

static ENHANCED_MARKET_SERVICE: Lazy<Arc<EnhancedMarketDataService>> =
    Lazy::new(|| Arc::new(EnhancedMarketDataService::new_without_db()));
```

Run `grep -rn "lazy_static" src-tauri/src/` to verify zero references remain before removing the crate.

- [ ] **Step 6: Run cargo check and tests**

Run: `cd src-tauri && cargo check && cargo test`
Expected: Compiles and all tests pass

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove dead code and unused dependencies

Delete superseded market_data_service.rs, dead App_rankings.tsx,
empty domain facades, unimplemented ExportManager stubs. Remove
unused crates (metrics, backoff, arc-swap, lazy_static)."
```

---

### Task 8: Replace eprintln! with tracing

**Files:**
- Modify: `src-tauri/src/lib.rs` (all `eprintln!` calls)
- Modify: `src-tauri/src/services/enhanced_market_service.rs`
- Modify: `src-tauri/src/services/openrouter_service.rs`
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs`
- Modify: `src-tauri/src/core/encrypted_env.rs`

**Context:** The codebase has `tracing` and `tracing-subscriber` as dependencies but uses `eprintln!` everywhere (151 occurrences). The structured logging infrastructure exists but isn't used.

- [ ] **Step 1: Initialize tracing subscriber in run()**

In `lib.rs` `run()` function, before `tauri::Builder::default()`:

```rust
use tracing_subscriber::EnvFilter;

// Use try_init to avoid panic if called multiple times (e.g., in tests)
let _ = tracing_subscriber::fmt()
    .with_env_filter(
        EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("flowfolio=info,warn"))
    )
    .with_target(true)
    .try_init();
```

- [ ] **Step 2: Replace eprintln! with tracing macros across all files**

Pattern replacements:
- `eprintln!("[INFO] ...")` → `tracing::info!(...)`
- `eprintln!("[WARN] ...")` → `tracing::warn!(...)`
- `eprintln!("[ERROR] ...")` → `tracing::error!(...)`
- `eprintln!("[DEBUG] ...")` → `tracing::debug!(...)`

For structured fields, use tracing's key-value syntax:
```rust
// Before
eprintln!("[INFO] [db] Initializing local cache database at: {}", db_path.display());
// After
tracing::info!(path = %db_path.display(), "Initializing local cache database");
```

Do this for all files: `lib.rs`, `enhanced_market_service.rs`, `openrouter_service.rs`, `multi_source_provider.rs`, `encrypted_env.rs`, and any others found with `grep -rn "eprintln!" src-tauri/src/`.

- [ ] **Step 3: Ensure no API keys are logged**

After replacement, search for any tracing calls that might log sensitive data:
Run: `grep -n "tracing::.*api_key\|tracing::.*secret\|tracing::.*token" src-tauri/src/**/*.rs`
Expected: No matches with actual key values (status-only logging like "configured" / "not configured" is fine)

- [ ] **Step 4: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/
git commit -m "refactor: replace eprintln! with tracing structured logging

Replace 151 eprintln! calls with tracing::{info,warn,error,debug}
macros. Initialize tracing-subscriber with env filter. Enables
log-level filtering at runtime via RUST_LOG env var."
```

---

### Task 9: Extract Tauri Commands from lib.rs into api/commands/

**Files:**
- Create/Modify: `src-tauri/src/api/commands/market.rs`
- Create/Modify: `src-tauri/src/api/commands/portfolio.rs`
- Create/Modify: `src-tauri/src/api/commands/backtest.rs`
- Create/Modify: `src-tauri/src/api/commands/journal.rs`
- Create/Modify: `src-tauri/src/api/commands/vibe.rs`
- Create/Modify: `src-tauri/src/api/commands/settings.rs`
- Create/Modify: `src-tauri/src/api/commands/ai.rs`
- Modify: `src-tauri/src/api/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (slim down to just run() + registrations)

**Context:** `lib.rs` is ~3,700 lines with ~70 Tauri commands. The `api/commands/` directory exists as stubs. This task moves commands into their domain modules.

- [ ] **Step 1: Plan the command groupings**

Group commands by domain:
- **market**: `get_current_prices`, `get_historical_prices`, `get_quant_metrics_batch`, `get_provider_status`, `get_cache_stats`, `health_check`, `get_database_status`, `get_exchange_rate`, `get_fundamental_data`
- **vibe**: `get_default_plan`, `list_templates`, `get_template`, `compile_plan`, `validate_plan`, `get_scoring_config`, `score_symbols_batch`
- **portfolio**: `create_equal_weight_allocation`, `create_score_weighted_allocation`, `generate_monthly_buy_list`, `check_portfolio_rebalance`, `generate_yearly_review`, `generate_optimization_report`, `generate_optimization_report_live`, `save_generated_portfolio`, `load_generated_portfolio`, `list_saved_portfolios`, `delete_saved_portfolio`, `save_portfolio_snapshot`, `get_portfolio_snapshots`
- **backtest**: `run_backtest_simulation`
- **journal**: `create_journal_entry`, `log_strategy_change`, `log_trade_decision`, `log_rebalance_event`, `log_review_event`, `compare_plan_versions`, `filter_journal_entries`, `calculate_journal_stats`, `export_journal_markdown`
- **settings**: `save_api_keys`, `load_api_keys`, `get_api_key_status`, `vault_exists`, `vault_is_unlocked`, `vault_unlock`, `vault_migrate_keys`, `export_data_bundle`, `import_data_bundle`, `send_price_alert_notification`
- **ai**: `ai_is_configured`, `ai_chat`, `ai_chat_stream`
- **dividends_tax**: `record_dividend`, `list_dividends`, `get_dividend_summary`, `create_tax_lot`, `list_tax_lots`, `get_tax_loss_harvest_opportunities`

- [ ] **Step 2: Move commands module by module**

For each group:
1. Move the command functions from `lib.rs` to the appropriate `api/commands/{module}.rs`
2. Add necessary imports at the top of each file
3. Make functions `pub` so they can be re-exported
4. Re-export from `api/commands/mod.rs`

- [ ] **Step 3: Slim lib.rs to just setup and registration**

`lib.rs` should contain only:
- Module declarations
- Global state (service instances, DB pool)
- `init_local_database` function
- `init_market_service_with_db` function
- `run()` function with `.invoke_handler()`
- Test module

- [ ] **Step 4: Update mod.rs re-exports**

In `api/commands/mod.rs`, re-export all command functions:
```rust
pub mod market;
pub mod vibe;
pub mod portfolio;
pub mod backtest;
pub mod journal;
pub mod settings;
pub mod ai;
pub mod dividends_tax;

pub use market::*;
pub use vibe::*;
pub use portfolio::*;
pub use backtest::*;
pub use journal::*;
pub use settings::*;
pub use ai::*;
pub use dividends_tax::*;
```

- [ ] **Step 5: Update invoke_handler registration**

In `lib.rs`, the `.invoke_handler()` macro should still work since functions are re-exported into scope via `use api::commands::*;`.

- [ ] **Step 6: Run cargo check and tests**

Run: `cd src-tauri && cargo check && cargo test`
Expected: Compiles and all tests pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/
git commit -m "refactor: extract Tauri commands from lib.rs into api/commands/

Move ~70 command handlers from 3700-line lib.rs into domain-grouped
modules: market, vibe, portfolio, backtest, journal, settings, ai,
dividends_tax. lib.rs now contains only setup and registration."
```

---

### Task 10: Implement SQLite Migration System

**Files:**
- Create: `src-tauri/src/infrastructure/database/migrations.rs`
- Modify: `src-tauri/src/infrastructure/database/mod.rs`
- Modify: `src-tauri/src/lib.rs` (init_local_database)

- [ ] **Step 1: Create the initial migration SQL file first (needed at compile time)**

Create `src-tauri/src/infrastructure/database/sql/001_initial.sql` containing all the `CREATE TABLE IF NOT EXISTS` statements currently in `lib.rs init_local_database`.

- [ ] **Step 2: Add `pub mod migrations;` to `infrastructure/database/mod.rs`**

The file currently only contains a comment. Replace with:
```rust
// Infrastructure Database
pub mod migrations;
```

- [ ] **Step 3: Create migrations table and runner**

```rust
// src-tauri/src/infrastructure/database/migrations.rs

use sqlx::{Pool, Sqlite};

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema",
        sql: include_str!("sql/001_initial.sql"),
    },
    // Future migrations go here
];

pub async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), String> {
    // Create migrations tracking table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create migrations table: {e}"))?;

    // Get current version
    let current: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _migrations")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to get migration version: {e}"))?;

    // Apply pending migrations
    for migration in MIGRATIONS {
        if migration.version > current {
            tracing::info!(version = migration.version, desc = migration.description, "Applying migration");
            sqlx::query(migration.sql)
                .execute(pool)
                .await
                .map_err(|e| format!("Migration {} failed: {e}", migration.version))?;

            sqlx::query("INSERT INTO _migrations (version, description) VALUES (?, ?)")
                .bind(migration.version)
                .bind(migration.description)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to record migration {}: {e}", migration.version))?;
        }
    }

    tracing::info!(version = MIGRATIONS.last().map(|m| m.version).unwrap_or(0), "Database up to date");
    Ok(())
}
```

- [ ] **Step 4: Wire migrations into init_local_database**

Replace the inline `CREATE TABLE` statements in `lib.rs init_local_database` with:
```rust
crate::infrastructure::database::migrations::run_migrations(&pool).await?;
```

- [ ] **Step 5: Run cargo check and test**

Run: `cd src-tauri && cargo check && cargo test`
Expected: Compiles and passes

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/infrastructure/database/
git commit -m "feat: implement SQLite migration system

Replace inline CREATE TABLE statements with versioned migration files.
Track applied migrations in _migrations table. Future schema changes
go in numbered SQL files and auto-apply on startup."
```

---

## Phase 3: Developer Experience

### Task 11: Add ESLint + Prettier

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Modify: `package.json` (add devDependencies and scripts)

- [ ] **Step 1: Install ESLint and Prettier**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh prettier
```

- [ ] **Step 2: Create ESLint config**

Create `eslint.config.js`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'node_modules', 'src/landing'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
```

- [ ] **Step 3: Create Prettier config**

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 4: Add lint scripts to package.json**

```json
"lint": "tsc --noEmit && eslint src/",
"lint:fix": "eslint src/ --fix && prettier --write src/",
"format": "prettier --write src/"
```

- [ ] **Step 5: Commit (do not auto-fix yet — separate commit)**

```bash
git add eslint.config.js .prettierrc package.json package-lock.json
git commit -m "chore: add ESLint and Prettier configuration

Configure ESLint with TypeScript, React hooks, and no-explicit-any
rules. Add Prettier for consistent formatting."
```

---

### Task 12: Fix Dependency Placement

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move test/build tools to devDependencies**

Move from `dependencies` to `devDependencies`:
- `@playwright/test`
- `playwright`
- `@remotion/cli`
- `@remotion/media`
- `@remotion/media-utils`
- `@remotion/player`
- `remotion`
- `dotenv-cli`

Also remove unused deps:
- `better-sqlite3` (not imported anywhere in frontend)
- `@types/better-sqlite3`
- `axios` (not imported anywhere)

- [ ] **Step 2: Run npm install to verify**

Run: `npm install`
Expected: Installs successfully

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: move test/build deps to devDependencies, remove unused

Move playwright, remotion, dotenv-cli to devDependencies. Remove
unused better-sqlite3 and axios."
```

---

### Task 13: Add CI Pre-flight Job

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add pre-flight job before build matrix**

Add a new job at the beginning of the workflow:

```yaml
preflight:
  runs-on: ubuntu-22.04
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npm run lint
    - uses: dtolnay/rust-toolchain@stable
      with:
        components: clippy
    - run: cd src-tauri && cargo clippy -- -D warnings
```

Add `needs: preflight` to all build jobs.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add pre-flight type-check and clippy job

Run tsc --noEmit and cargo clippy before expensive platform builds
to catch errors early."
```

---

### Task 14: Fix Rust Release Profile

**Files:**
- Modify: `src-tauri/Cargo.toml:79-84`

- [ ] **Step 1: Change opt-level from "s" to 3**

```toml
[profile.release]
lto = true
codegen-units = 1
strip = true
opt-level = 3     # Optimize for speed (financial calculations benefit)
panic = "abort"
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "perf: optimize release build for speed over size

Change opt-level from 's' (size) to 3 (speed). Desktop app is not
size-constrained; financial calculations and backtest simulations
benefit from faster codegen."
```

---

## Phase 4: Code Standards Compliance

### Task 15: Replace Direct invoke with invokeWithResilience

**Files:**
- Modify: `src/PortfolioTab.tsx` (lines 163, 224, 328, 333, 362, 372, 376, 393, 408)
- Modify: `src/services/fundamentalData.ts:5`
- Modify: `src/services/openrouter.ts:2`
- Modify: `src/components/DataSourcesPage.tsx:2`
- Modify: `src/components/AlertsPanel.tsx`
- Modify: `src/components/RebalanceScheduler.tsx`
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/components/WatchlistTab.tsx`
- Modify: `src/components/SavedPortfoliosTab.tsx`
- Modify: `src/JournalTab.tsx`
- Modify: `src/BacktestTab.tsx`
- Modify: `src/components/TickerAnalysis.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/RiskDashboard.tsx`
- Modify: `src/components/YearlyReview.tsx`
- Modify: `src/components/PortfolioOptimizer.tsx`
- Modify: `src/components/ComparisonMode.tsx`
- Modify: `src/components/VibeStudio.tsx`

- [ ] **Step 1: Identify all direct invoke imports**

Run: `grep -rn "from.*@tauri-apps/api/core\|from.*services/tauri" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v __tests__`

- [ ] **Step 2: Replace each import and call site**

For each file, change:
```typescript
import { invoke } from '@tauri-apps/api/core';
// or
import { invoke } from '../services/tauri';
```
to:
```typescript
import { invokeWithResilience } from '@/services/apiClient';
```

And each `invoke('command', { args })` to `invokeWithResilience('command', { args })`.

Note: Some commands may intentionally bypass resilience (e.g., `vault_unlock` which should fail fast). Keep those as-is and add a comment explaining why.

- [ ] **Step 3: Consolidate the two API clients**

Delete `src/core/api/client.ts` and update any imports to use `src/services/apiClient.ts` instead. Merge any unique features (feature-flag config) from `core/api/client.ts` into `services/apiClient.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "fix: replace direct invoke with invokeWithResilience

Ensure all Tauri IPC calls go through the resilient API client with
circuit breaker, retry, and deduplication. Consolidate duplicate
API client implementations."
```

---

### Task 16: Add useReducer for Complex State Components

**Files:**
- Modify: `src/components/VibeStudio.tsx`
- Modify: `src/components/SettingsPage.tsx`

- [ ] **Step 1: Refactor VibeStudio to use useReducer**

Extract the 14+ `useState` calls into a reducer:

```typescript
type VibeStudioState = {
  isGenerating: boolean;
  generatedPortfolio: GeneratedPortfolio | null;
  chatMessages: ChatMessage[];
  inputMessage: string;
  selectedModel: string;
  // ... etc
};

type VibeStudioAction =
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_PORTFOLIO'; payload: GeneratedPortfolio | null }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_INPUT'; payload: string }
  // ... etc;

function vibeStudioReducer(state: VibeStudioState, action: VibeStudioAction): VibeStudioState {
  switch (action.type) {
    case 'SET_GENERATING': return { ...state, isGenerating: action.payload };
    // ... etc
  }
}
```

- [ ] **Step 2: Refactor SettingsPage similarly**

Extract the 9 `useState` calls into a reducer.

- [ ] **Step 3: Commit**

```bash
git add src/components/VibeStudio.tsx src/components/SettingsPage.tsx
git commit -m "refactor: use useReducer for complex component state

Replace 14+ useState calls in VibeStudio and 9 in SettingsPage with
useReducer per CODE_STANDARDS.md guidance for 4+ related states."
```

---

### Task 17: Add Per-Tab ErrorBoundary and Fix JSON.parse Safety

**Files:**
- Create: `src/components/TabErrorBoundary.tsx`
- Modify: `src/App.tsx` (wrap each tab)
- Verify: `src/shared/utils/index.ts:192-198` (deepClone already has try-catch — no change needed)

- [ ] **Step 1: Create TabErrorBoundary component**

```typescript
import React, { Component, ReactNode } from 'react';

interface Props {
  tabName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>{this.props.tabName} encountered an error</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap each tab in App.tsx**

```tsx
{state.activeTab === 'portfolio' && (
  <TabErrorBoundary tabName="Portfolio">
    <Suspense fallback={<Loading />}>
      <PortfolioTab />
    </Suspense>
  </TabErrorBoundary>
)}
```

Apply to all tabs.

- [ ] **Step 3: Verify deepClone already has try-catch (no change needed)**

`src/shared/utils/index.ts` lines 192-198 already wraps `JSON.parse` in try-catch. No change needed here. Instead, search for other unguarded `JSON.parse` calls in production code:

Run: `grep -rn "JSON.parse" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v node_modules`

Fix any instances not wrapped in try-catch (particularly in `src/services/portfolioAgent.ts`, `src/components/AlertsPanel.tsx`, `src/components/RebalanceScheduler.tsx`, `src/contexts/UserProfileContext.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/components/TabErrorBoundary.tsx src/App.tsx src/shared/utils/index.ts
git commit -m "fix: add per-tab ErrorBoundary, wrap unsafe JSON.parse

Each tab now has its own error boundary — a crash in one tab doesn't
kill the entire app. Fix unguarded JSON.parse in deepClone utility."
```

---

### Task 18: Add Effect Cleanup and Fix useEffect Patterns

**Files:**
- Modify: `src/components/AlertsPanel.tsx:155-170`
- Modify: `src/components/RebalanceScheduler.tsx:184-220`
- Modify: `src/JournalTab.tsx:49-53`

- [ ] **Step 1: Add mounted guard to AlertsPanel migration effect**

```typescript
useEffect(() => {
  let mounted = true;
  if (/* migration condition */) {
    Promise.all(/* ... */).then((result) => {
      if (mounted) setAlerts(result);
    });
  }
  return () => { mounted = false; };
}, []);
```

- [ ] **Step 2: Same for RebalanceScheduler migration effects**

Add `mounted` guard to both `useEffect` blocks at lines 184-202 and 205-220.

- [ ] **Step 3: Fix JournalTab floating promise**

```typescript
useEffect(() => {
  let mounted = true;
  if (entries.length > 0) {
    calculateStats().then(() => {
      // stats are set inside calculateStats
    }).catch((err) => {
      if (mounted) logger.error('Failed to calculate stats', err);
    });
  }
  return () => { mounted = false; };
}, [entries]);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AlertsPanel.tsx src/components/RebalanceScheduler.tsx src/JournalTab.tsx
git commit -m "fix: add effect cleanup and mounted guards

Add mounted guards to async effects in AlertsPanel, RebalanceScheduler,
and JournalTab to prevent state updates after unmount."
```

---

## Phase 5: Testing

### Task 19: Add Rust Integration Tests for Key Commands

**Files:**
- Create: `src-tauri/tests/commands_test.rs` (or add to existing test modules)

- [ ] **Step 1: Add test for validate_symbol**

Already done in Task 5.

- [ ] **Step 2: Add test for backtest division-by-zero edge case**

In `src-tauri/src/modules/backtest/mod.rs`, add guard:

```rust
fn calculate_allocation(symbols: &[String], /* ... */) -> Vec<(String, f64)> {
    if symbols.is_empty() {
        return vec![];
    }
    let weight = 1.0 / symbols.len() as f64;
    // ...
}
```

Test:
```rust
#[test]
fn test_empty_symbols_no_panic() {
    let result = calculate_allocation(&[], /* ... */);
    assert!(result.is_empty());
}
```

- [ ] **Step 3: Add test for tax loss sort with missing fields**

```rust
#[test]
fn test_tax_loss_sort_handles_missing_fields() {
    let mut opportunities = vec![
        json!({"symbol": "AAPL", "unrealized_loss": -500.0}),
        json!({"symbol": "MSFT"}), // missing unrealized_loss
    ];
    // Should not panic
    opportunities.sort_by(|a, b| {
        let a_val = a["unrealized_loss"].as_f64().unwrap_or(0.0);
        let b_val = b["unrealized_loss"].as_f64().unwrap_or(0.0);
        a_val.partial_cmp(&b_val).unwrap_or(std::cmp::Ordering::Equal)
    });
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "test: add integration tests for edge cases

Test division-by-zero in backtest, missing fields in tax loss sort,
symbol validation. Cover critical crash paths."
```

---

### Task 20: Add Frontend Tests for Financial Calculations

**Files:**
- Create: `src/__tests__/shared/calculations-edge-cases.test.ts`

- [ ] **Step 1: Write edge case tests**

```typescript
import { describe, it, expect } from 'vitest';
// Import calculation functions from src/shared/utils/calculations.ts

describe('Financial calculation edge cases', () => {
  it('handles zero prices without NaN', () => {
    // Test return calculations with price = 0
  });

  it('handles negative returns correctly', () => {
    // Test with negative price changes
  });

  it('handles empty price arrays', () => {
    // Test with [] input
  });

  it('handles single-element arrays', () => {
    // Test with [100] input
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- --run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/
git commit -m "test: add edge case tests for financial calculations

Cover zero prices, negative returns, empty arrays, single elements."
```

---

## Phase 6: Feature Completion

### Task 21: Wire Real Historical Data into Backtest

**Files:**
- Modify: `src-tauri/src/modules/backtest/mod.rs:211-221`

- [ ] **Step 1: Replace hardcoded get_price_at_date**

The backtest engine should fetch real historical data via the market data service. Change the function to accept a price map:

```rust
/// Run backtest with real historical prices
pub async fn run_backtest_with_data(
    config: &BacktestConfig,
    historical_prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
) -> Result<BacktestResult, String> {
    // Use historical_prices lookup instead of hardcoded values
}

fn get_price_at_date(
    symbol: &str,
    date: NaiveDate,
    prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
) -> Option<f64> {
    prices.get(symbol).and_then(|data| {
        // Find closest price on or before the date
        data.iter()
            .rev()
            .find(|(d, _)| *d <= date)
            .map(|(_, p)| *p)
    })
}
```

**IMPORTANT:** `get_price_at_date` is called by `calculate_portfolio_value` (line 224) and `create_snapshot` (line 233). Both callers must be updated to pass the `prices` HashMap. Update their signatures:

```rust
fn calculate_portfolio_value(
    cash: f64,
    positions: &HashMap<String, f64>,
    date: NaiveDate,
    prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
) -> f64 {
    let mut value = cash;
    for (symbol, shares) in positions {
        if let Some(price) = Self::get_price_at_date(symbol, date, prices) {
            value += shares * price;
        }
    }
    value
}

fn create_snapshot(
    date: NaiveDate,
    cash: f64,
    positions: &HashMap<String, f64>,
    prices: &HashMap<String, Vec<(NaiveDate, f64)>>,
) -> PortfolioSnapshot {
    // ... same logic but pass `prices` to get_price_at_date
}
```

Then propagate the `prices` parameter through all call sites within the backtest simulation loop.

- [ ] **Step 2: Update the Tauri command to fetch historical data first**

In the `run_backtest_simulation` command, fetch historical prices for all symbols in the config before running the simulation.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/modules/backtest/
git commit -m "feat: use real historical prices in backtest engine

Replace hardcoded fake price data with actual historical prices
fetched from market data providers. Backtest results now reflect
real market conditions."
```

---

### Task 22: Persist Critical Tab State

**Files:**
- Modify: `src/hooks/useAppState.ts` (add portfolio holdings to global state)
- Modify: `src/PortfolioTab.tsx` (use global state instead of local)

- [ ] **Step 1: Add portfolio holdings to AppState**

Add `holdings`, `portfolioName`, and related fields to the global `useReducer` state so they survive tab switches.

- [ ] **Step 2: Update PortfolioTab to use global state**

Replace local `useState` for holdings with `state.holdings` from `useAppState`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAppState.ts src/PortfolioTab.tsx
git commit -m "fix: persist portfolio holdings across tab switches

Move portfolio holdings from local component state to global app
state so data isn't lost when switching tabs."
```

---

### Task 23: Fix reqwest::Client Per-Request Creation

**Files:**
- Modify: `src-tauri/src/lib.rs` (ai_chat_stream, get_exchange_rate)

- [ ] **Step 1: Add a shared reqwest::Client to global state**

```rust
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("Failed to create HTTP client")
});
```

- [ ] **Step 2: Replace Client::new() with HTTP_CLIENT.clone()**

In `ai_chat_stream` (line 2794) and `get_exchange_rate` (line 3055), replace:
```rust
let client = reqwest::Client::new();
```
with:
```rust
let client = HTTP_CLIENT.clone();  // Clone shares the underlying connection pool
```

Note: Use `.clone()` not `&*` — reqwest::Client::clone() is cheap (shares the connection pool via Arc), and a reference would cause lifetime issues in async blocks that move the client.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "perf: share reqwest::Client across commands

Replace per-request Client::new() with a shared static client for
connection pooling and DNS caching."
```

---

### Task 24: Fix DB_INITIALIZED Ordering and get_provider_status

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Change SeqCst to Acquire/Release**

Line 3260:
```rust
let initialized = DB_INITIALIZED.load(Ordering::Acquire);
```

And wherever it's stored (after Task 6, in `init_market_service_with_db`):
```rust
DB_INITIALIZED.store(true, Ordering::Release);
```

- [ ] **Step 2: Fix get_provider_status to return real data**

Replace the hardcoded response at line 681-688 with actual provider health data from `MultiSourceProvider`:

```rust
#[tauri::command]
async fn get_provider_status() -> String {
    let service = &*ENHANCED_MARKET_SERVICE;
    service.get_provider_status_json().await
}
```

Add a `get_provider_status_json` method to `EnhancedMarketDataService` that queries the `MultiSourceProvider`'s health map.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/services/enhanced_market_service.rs
git commit -m "fix: use correct atomic ordering, return real provider status

Change DB_INITIALIZED from SeqCst to Acquire/Release. Replace
hardcoded get_provider_status with actual provider health data."
```

---

### Task 25: Move Finnhub API Key from URL to Header

**Files:**
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs:353-383`

- [ ] **Step 1: Use Authorization header instead of query parameter**

```rust
let quote_url = format!("https://finnhub.io/api/v1/quote?symbol={}", symbol);

let response = self.client
    .get(&quote_url)
    .header("X-Finnhub-Token", api_key.trim())
    .send()
    .await
    .map_err(|e| format!("Finnhub request failed: {}", e))?;
```

Apply same change to the candles URL at line 380-383.

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/modules/data_provider/multi_source_provider.rs
git commit -m "security: move Finnhub API key from URL to header

Use X-Finnhub-Token header instead of query parameter to prevent
API key from appearing in logs or browser history."
```

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 1-5 | Security: encryption, API keys, CSP, panics, validation |
| 2 | 6-10 | Architecture: mutex removal, dead code, tracing, lib.rs split, migrations |
| 3 | 11-14 | DX: ESLint, dependencies, CI, build profile |
| 4 | 15-18 | Standards: invokeWithResilience, useReducer, ErrorBoundary, effects |
| 5 | 19-20 | Testing: Rust integration tests, financial edge cases |
| 6 | 21-25 | Features: backtest data, tab state, HTTP client, provider status, Finnhub |
