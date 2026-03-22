// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // In debug mode, load plain .env file
    #[cfg(debug_assertions)]
    {
        let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
        tracing::debug!(path = ?env_path, "Looking for .env");
        if env_path.exists() {
            match dotenvy::from_path(&env_path) {
                Ok(_) => tracing::info!(path = ?env_path, "Loaded environment configuration"),
                Err(e) => tracing::error!(path = ?env_path, error = ?e, "Failed to load .env"),
            }
            // Verify key env vars
            tracing::debug!(present = std::env::var("OPENROUTER_API_KEY").is_ok(), "OPENROUTER_API_KEY status");
        } else {
            tracing::warn!(path = ?env_path, "env file not found, trying current dir");
            dotenvy::dotenv().ok();
        }
    }

    // In release mode, decrypt the embedded env payload (baked into binary at compile time)
    #[cfg(not(debug_assertions))]
    {
        if let Err(e) = flowfolio_lib::core::encrypted_env::load_embedded_env() {
            tracing::error!(error = %e, "Failed to load embedded encrypted env");
        }
    }
    
    flowfolio_lib::run()
}
