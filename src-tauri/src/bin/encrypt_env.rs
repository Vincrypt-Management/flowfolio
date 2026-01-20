//! FlowFolio Environment Encryptor - 512-bit Dual Layer Security
//!
//! CLI tool to encrypt .env files for secure distribution in release builds.
//! Uses dual-layer encryption (AES-256-GCM + ChaCha20-Poly1305) for 512-bit equivalent security.
//!
//! Usage:
//!     cargo run --bin encrypt-env [input_file] [output_file]
//!
//!     Defaults:
//!         input_file: ../.env (relative to src-tauri)
//!         output_file: ../.env.encrypted

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce as AesNonce,
};
use chacha20poly1305::{
    ChaCha20Poly1305, Nonce as ChaNonce,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::path::Path;

// Must match the keys in src/core/encrypted_env.rs
const AES_KEY: &[u8; 32] = b"FlowFolio2026SecureKeyAES256!@#$";
const CHACHA_KEY: &[u8; 32] = b"FlowFolio2026ChaCha20Key!@#$%^&*";
const AES_NONCE: &[u8; 12] = b"FlowFoNonce!";
const CHACHA_NONCE: &[u8; 12] = b"ChaCha20Nonc";

fn encrypt_string(plaintext: &str) -> Result<String, String> {
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

fn decrypt_string(encrypted: &str) -> Result<String, String> {
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    
    // Default paths relative to src-tauri directory
    let default_input = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
    let default_output = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env.encrypted");
    
    let input_path = if args.len() > 1 {
        Path::new(&args[1]).to_path_buf()
    } else {
        default_input
    };
    
    let output_path = if args.len() > 2 {
        Path::new(&args[2]).to_path_buf()
    } else {
        default_output
    };
    
    println!("FlowFolio Environment Encryptor");
    println!("================================");
    println!("Security: 512-bit dual-layer (AES-256-GCM + ChaCha20-Poly1305)");
    println!();
    
    // Check input file exists
    if !input_path.exists() {
        eprintln!("Error: Input file '{}' not found", input_path.display());
        std::process::exit(1);
    }
    
    // Read input file
    let plaintext = match std::fs::read_to_string(&input_path) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("Error reading input file: {}", e);
            std::process::exit(1);
        }
    };
    
    println!("Input:  {} ({} bytes)", input_path.display(), plaintext.len());
    
    // Encrypt
    let encrypted = match encrypt_string(&plaintext) {
        Ok(enc) => enc,
        Err(e) => {
            eprintln!("Encryption failed: {}", e);
            std::process::exit(1);
        }
    };
    
    // Write output file
    if let Err(e) = std::fs::write(&output_path, &encrypted) {
        eprintln!("Error writing output file: {}", e);
        std::process::exit(1);
    }
    
    println!("Output: {} ({} bytes)", output_path.display(), encrypted.len());
    println!();
    
    // Verify by decrypting
    println!("Verifying encryption...");
    let decrypted = match decrypt_string(&encrypted) {
        Ok(dec) => dec,
        Err(e) => {
            eprintln!("Verification FAILED - Decryption error: {}", e);
            std::process::exit(1);
        }
    };
    
    if decrypted == plaintext {
        println!("✓ Verification successful - decryption matches original");
    } else {
        eprintln!("✗ Verification FAILED - decryption does not match!");
        std::process::exit(1);
    }
    
    println!();
    println!("Encryption keys are embedded in the FlowFolio executable.");
    println!();
    println!("Place '{}' in your release bundle:", output_path.file_name().unwrap().to_string_lossy());
    println!("  - macOS: FlowFolio.app/Contents/Resources/.env.encrypted");
    println!("  - Windows: Same folder as FlowFolio.exe");
    println!("  - Linux: Same folder as the executable");
}
