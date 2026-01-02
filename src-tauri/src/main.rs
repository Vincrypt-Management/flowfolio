// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Load .env file from the project root (parent of src-tauri)
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
    if env_path.exists() {
        dotenvy::from_path(&env_path).ok();
        eprintln!("[INFO] [main] Loaded environment configuration from {:?}", env_path);
    } else {
        // Try current directory
        dotenvy::dotenv().ok();
    }
    
    flowfolio_lib::run()
}
