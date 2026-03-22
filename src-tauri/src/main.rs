// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // In debug mode, load plain .env file
    #[cfg(debug_assertions)]
    {
        let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
        eprintln!("[DEBUG] [main] Looking for .env at: {:?}", env_path);
        if env_path.exists() {
            match dotenvy::from_path(&env_path) {
                Ok(_) => eprintln!("[INFO] [main] Loaded environment configuration from {:?}", env_path),
                Err(e) => eprintln!("[ERROR] [main] Failed to load .env: {:?}", e),
            }
            // Verify key env vars
            eprintln!("[DEBUG] [main] OPENROUTER_API_KEY present: {}", std::env::var("OPENROUTER_API_KEY").is_ok());
        } else {
            eprintln!("[WARN] [main] .env file not found at {:?}, trying current dir", env_path);
            dotenvy::dotenv().ok();
        }
    }
    
    // In release mode, decrypt the embedded env payload (baked into binary at compile time)
    #[cfg(not(debug_assertions))]
    {
        if let Err(e) = flowfolio_lib::core::encrypted_env::load_embedded_env() {
            eprintln!("[ERROR] [main] Failed to load embedded encrypted env: {}", e);
        }
    }
    
    flowfolio_lib::run()
}
