//! FlowFolio Environment Encryptor
//! CLI tool to encrypt .env files for release builds.
//!
//! Usage:
//!     cargo run --bin encrypt-env [input_file] [output_file]
//!
//!     Defaults:
//!         input_file:  ../.env (relative to src-tauri)
//!         output_file: ../.env.encrypted

use flowfolio_lib::core::encrypted_env::{decrypt_string, encrypt_string};
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let default_input = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env");
    let default_output = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env.encrypted");

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
