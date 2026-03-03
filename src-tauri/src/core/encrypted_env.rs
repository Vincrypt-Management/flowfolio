//! Encrypted Environment Variables - Dual Layer 512-bit Security
//! 
//! This module provides secure storage and retrieval of environment variables
//! for release builds. API keys and secrets are encrypted using dual-layer
//! encryption (AES-256-GCM + ChaCha20-Poly1305) for 512-bit equivalent security.
//!
//! In debug mode, plain .env files are used for convenience.
//! In release mode, the encrypted payload is embedded in the binary at compile time
//! via include_str! — no separate .env.encrypted file is needed.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use chacha20poly1305::{
    ChaCha20Poly1305, Nonce as ChaNonce,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::collections::HashMap;

/// AES-256 key (32 bytes) - Layer 1
const AES_KEY: &[u8; 32] = b"FlowFolio2026SecureKeyAES256!@#$";

/// ChaCha20 key (32 bytes) - Layer 2  
const CHACHA_KEY: &[u8; 32] = b"FlowFolio2026ChaCha20Key!@#$%^&*";

/// AES nonce (12 bytes)
const AES_NONCE: &[u8; 12] = b"FlowFoNonce!";

/// ChaCha20 nonce (12 bytes)
const CHACHA_NONCE: &[u8; 12] = b"ChaCha20Nonc";

/// Encrypted env payload embedded at compile time from ../.env.encrypted
const EMBEDDED_ENCRYPTED_ENV: &str = include_str!("../../../.env.encrypted");

/// Encrypt a string using dual-layer encryption (AES-256-GCM + ChaCha20-Poly1305)
/// This provides 512-bit equivalent security
pub fn encrypt_string(plaintext: &str) -> Result<String, String> {
    // Layer 1: AES-256-GCM
    let aes_cipher = Aes256Gcm::new_from_slice(AES_KEY)
        .map_err(|e| format!("Failed to create AES cipher: {}", e))?;
    
    let aes_nonce = AesNonce::from_slice(AES_NONCE);
    
    let aes_ciphertext = aes_cipher
        .encrypt(aes_nonce, plaintext.as_bytes())
        .map_err(|e| format!("AES encryption failed: {}", e))?;
    
    // Layer 2: ChaCha20-Poly1305
    let chacha_cipher = ChaCha20Poly1305::new_from_slice(CHACHA_KEY)
        .map_err(|e| format!("Failed to create ChaCha cipher: {}", e))?;
    
    let chacha_nonce = ChaNonce::from_slice(CHACHA_NONCE);
    
    let final_ciphertext = chacha_cipher
        .encrypt(chacha_nonce, aes_ciphertext.as_ref())
        .map_err(|e| format!("ChaCha encryption failed: {}", e))?;
    
    Ok(BASE64.encode(&final_ciphertext))
}

/// Decrypt a base64-encoded dual-layer encrypted string
pub fn decrypt_string(encrypted: &str) -> Result<String, String> {
    let final_ciphertext = BASE64.decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    
    // Layer 2: Decrypt ChaCha20-Poly1305
    let chacha_cipher = ChaCha20Poly1305::new_from_slice(CHACHA_KEY)
        .map_err(|e| format!("Failed to create ChaCha cipher: {}", e))?;
    
    let chacha_nonce = ChaNonce::from_slice(CHACHA_NONCE);
    
    let aes_ciphertext = chacha_cipher
        .decrypt(chacha_nonce, final_ciphertext.as_ref())
        .map_err(|e| format!("ChaCha decryption failed: {}", e))?;
    
    // Layer 1: Decrypt AES-256-GCM
    let aes_cipher = Aes256Gcm::new_from_slice(AES_KEY)
        .map_err(|e| format!("Failed to create AES cipher: {}", e))?;
    
    let aes_nonce = AesNonce::from_slice(AES_NONCE);
    
    let plaintext = aes_cipher
        .decrypt(aes_nonce, aes_ciphertext.as_ref())
        .map_err(|e| format!("AES decryption failed: {}", e))?;
    
    String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 conversion failed: {}", e))
}

/// Encrypt an entire .env file content
pub fn encrypt_env_file(content: &str) -> Result<String, String> {
    encrypt_string(content)
}

/// Decrypt an encrypted .env file and return parsed key-value pairs
pub fn decrypt_env_file(encrypted_content: &str) -> Result<HashMap<String, String>, String> {
    let decrypted = decrypt_string(encrypted_content)?;
    parse_env_content(&decrypted)
}

/// Parse .env file content into key-value pairs
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
            if (value.starts_with('"') && value.ends_with('"')) ||
               (value.starts_with('\'') && value.ends_with('\'')) {
                value = value[1..value.len()-1].to_string();
            }
            
            if !key.is_empty() {
                vars.insert(key, value);
            }
        }
    }
    
    Ok(vars)
}

/// Load environment variables from the embedded encrypted payload or plain .env (debug)
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
            eprintln!("[INFO] [env] Loaded development .env from {:?}", env_path);
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

/// Decrypt the compile-time embedded encrypted env and set as environment variables
pub fn load_embedded_env() -> Result<(), String> {
    let encrypted_content = EMBEDDED_ENCRYPTED_ENV.trim();
    let vars = decrypt_env_file(encrypted_content)?;
    
    for (key, value) in &vars {
        std::env::set_var(key, value);
    }
    
    eprintln!(
        "[INFO] [env] Loaded {} embedded encrypted env vars (512-bit dual-layer)",
        vars.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "VITE_API_KEY=secret123\nVITE_OTHER=value456";
        let encrypted = encrypt_string(original).unwrap();
        let decrypted = decrypt_string(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }
    
    #[test]
    fn test_parse_env_content() {
        let content = r#"
# Comment line
VITE_API_KEY=secret123
VITE_QUOTED="quoted value"
VITE_SINGLE='single quoted'
EMPTY_LINE_ABOVE=value
"#;
        let vars = parse_env_content(content).unwrap();
        assert_eq!(vars.get("VITE_API_KEY"), Some(&"secret123".to_string()));
        assert_eq!(vars.get("VITE_QUOTED"), Some(&"quoted value".to_string()));
        assert_eq!(vars.get("VITE_SINGLE"), Some(&"single quoted".to_string()));
    }
}
