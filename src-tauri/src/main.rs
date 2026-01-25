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
            eprintln!("[DEBUG] [main] VITE_OPENROUTER_API_KEY present: {}", std::env::var("VITE_OPENROUTER_API_KEY").is_ok());
        } else {
            eprintln!("[WARN] [main] .env file not found at {:?}, trying current dir", env_path);
            dotenvy::dotenv().ok();
        }
    }
    
    // In release mode, encrypted env is loaded by the app after data dir is known
    #[cfg(not(debug_assertions))]
    {
        // Try to load from executable directory first
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let encrypted_path = exe_dir.join(".env.encrypted");
                if encrypted_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&encrypted_path) {
                        if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                            for (key, value) in vars {
                                std::env::set_var(&key, &value);
                            }
                            eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", encrypted_path);
                        }
                    }
                }
                
                // Also check Resources folder on macOS
                #[cfg(target_os = "macos")]
                {
                    let resources_path = exe_dir.parent()
                        .map(|p| p.join("Resources").join(".env.encrypted"));
                    if let Some(res_path) = resources_path {
                        if res_path.exists() {
                            if let Ok(content) = std::fs::read_to_string(&res_path) {
                                if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                                    for (key, value) in vars {
                                        std::env::set_var(&key, &value);
                                    }
                                    eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", res_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    flowfolio_lib::run()
}
