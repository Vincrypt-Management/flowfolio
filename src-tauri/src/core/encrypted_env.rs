//! Encrypted Environment Variables
//!
//! This module provides obfuscation-grade storage of environment variables for
//! release builds. API keys are encrypted using AES-256-GCM with a key derived
//! from machine identifiers (hostname + username) and a random per-encryption nonce.
//!
//! SECURITY NOTE: This is obfuscation, not cryptographic security. The encryption
//! key is deterministically derived from publicly-observable machine attributes.
//! A determined attacker with binary access can recover the key. This protects
//! against casual inspection of the binary, not against targeted analysis.
//!
//! In debug mode, plain .env files are used for convenience.
//! In release mode, the encrypted payload is embedded in the binary at compile time
//! via include_str! — no separate .env.encrypted file is needed at runtime.

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use once_cell::sync::OnceCell;
use std::collections::HashMap;

/// Encrypted env payload embedded at compile time from ../.env.encrypted
const EMBEDDED_ENCRYPTED_ENV: &str = include_str!("../../../.env.encrypted");

/// Decrypted env vars stored in memory, populated once at startup in release mode.
static DECRYPTED_ENV: OnceCell<HashMap<String, String>> = OnceCell::new();

/// Derive a 32-byte key from machine identifiers.
///
/// Uses hostname and username hashed together. This is deterministic per machine,
/// meaning data encrypted on one machine cannot be decrypted on another.
fn derive_machine_key() -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let hostname = whoami::fallible::hostname()
        .unwrap_or_else(|_| "flowfolio-default".to_string());
    let username = whoami::username();

    let mut hasher = DefaultHasher::new();
    format!("flowfolio-env-key-{}-{}", hostname, username).hash(&mut hasher);
    let seed = hasher.finish();

    let mut key = [0u8; 32];
    for i in 0..4 {
        let mut h = DefaultHasher::new();
        (seed, i as u64).hash(&mut h);
        let chunk = h.finish().to_le_bytes();
        key[i * 8..(i + 1) * 8].copy_from_slice(&chunk);
    }
    key
}

/// Encrypt a string using AES-256-GCM with a random nonce.
///
/// Output format: base64( nonce[12] || ciphertext )
pub fn encrypt_string(plaintext: &str) -> Result<String, String> {
    let key = derive_machine_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

/// Decrypt a base64-encoded AES-256-GCM string produced by `encrypt_string`.
///
/// Expects the first 12 bytes (after base64 decode) to be the nonce.
pub fn decrypt_string(encrypted: &str) -> Result<String, String> {
    let combined = BASE64
        .decode(encrypted)
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
    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 conversion failed: {}", e))
}

/// Encrypt an entire .env file content.
pub fn encrypt_env_file(content: &str) -> Result<String, String> {
    encrypt_string(content)
}

/// Decrypt an encrypted .env file and return parsed key-value pairs.
pub fn decrypt_env_file(encrypted_content: &str) -> Result<HashMap<String, String>, String> {
    let decrypted = decrypt_string(encrypted_content)?;
    parse_env_content(&decrypted)
}

/// Parse .env file content into key-value pairs.
pub fn parse_env_content(content: &str) -> Result<HashMap<String, String>, String> {
    let mut vars = HashMap::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Parse KEY=VALUE format
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            let mut value = line[eq_pos + 1..].trim().to_string();

            // Remove surrounding quotes if present
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }

            if !key.is_empty() {
                vars.insert(key, value);
            }
        }
    }

    Ok(vars)
}

/// Look up an env var from the in-memory decrypted store, falling back to the
/// process environment. Use this instead of `std::env::var` in release builds.
pub fn get_env_var(key: &str) -> Option<String> {
    DECRYPTED_ENV
        .get()
        .and_then(|vars| vars.get(key).cloned())
        .or_else(|| std::env::var(key).ok())
}

/// Load environment variables from the embedded encrypted payload or plain .env (debug).
pub fn load_encrypted_env(_app_data_dir: Option<&std::path::Path>) -> Result<(), String> {
    // In debug mode, use plain .env
    #[cfg(debug_assertions)]
    {
        let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".env");

        if env_path.exists() {
            dotenvy::from_path(&env_path).ok();
            tracing::info!(path = ?env_path, "Loaded development .env");
            return Ok(());
        }
    }

    // In release mode, decrypt the embedded payload
    #[cfg(not(debug_assertions))]
    {
        load_embedded_env()?;
    }

    Ok(())
}

/// Decrypt the compile-time embedded encrypted env and store in `DECRYPTED_ENV`.
///
/// Safe to call from any thread. Calling more than once returns an error.
pub fn load_embedded_env() -> Result<(), String> {
    let encrypted_content = EMBEDDED_ENCRYPTED_ENV.trim();
    let vars = decrypt_env_file(encrypted_content)?;
    let count = vars.len();
    DECRYPTED_ENV
        .set(vars)
        .map_err(|_| "Encrypted env already loaded".to_string())?;
    tracing::info!(count = count, "Loaded embedded encrypted env vars");
    Ok(())
}

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
    fn test_encrypt_env_file_roundtrip() {
        let content = "API_KEY=test123\nOTHER=value";
        let encrypted = encrypt_env_file(content).unwrap();
        assert!(!encrypted.is_empty());
        let decrypted = decrypt_string(&encrypted).unwrap();
        assert_eq!(decrypted, content);
    }

    #[test]
    fn test_decrypt_env_file_roundtrip() {
        let content = "KEY1=val1\nKEY2=val2";
        let encrypted = encrypt_string(content).unwrap();
        let vars = decrypt_env_file(&encrypted).unwrap();
        assert_eq!(vars.get("KEY1"), Some(&"val1".to_string()));
        assert_eq!(vars.get("KEY2"), Some(&"val2".to_string()));
    }

    #[test]
    fn test_get_env_var_std_fallback() {
        std::env::set_var("TEST_FLOWFOLIO_VAR", "test_value");
        assert_eq!(
            get_env_var("TEST_FLOWFOLIO_VAR"),
            Some("test_value".to_string())
        );
        std::env::remove_var("TEST_FLOWFOLIO_VAR");
    }

    #[test]
    fn test_parse_env_content_empty() {
        let vars = parse_env_content("").unwrap();
        assert!(vars.is_empty());
    }

    #[test]
    fn test_parse_env_content_no_equals_skipped() {
        let content = "NOT_AN_ASSIGNMENT\nVALID=yes";
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.len(), 1);
    }
}
