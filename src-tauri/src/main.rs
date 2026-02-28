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
        let mut loaded = false;

        // Try to load from executable directory first
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // 1. Same directory as executable (all platforms)
                let encrypted_path = exe_dir.join(".env.encrypted");
                if !loaded && encrypted_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&encrypted_path) {
                        if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                            for (key, value) in vars {
                                std::env::set_var(&key, &value);
                            }
                            eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", encrypted_path);
                            loaded = true;
                        }
                    }
                }

                // 2. macOS: AppName.app/Contents/Resources/
                #[cfg(target_os = "macos")]
                if !loaded {
                    if let Some(res_path) = exe_dir.parent()
                        .map(|p| p.join("Resources").join(".env.encrypted"))
                    {
                        if res_path.exists() {
                            if let Ok(content) = std::fs::read_to_string(&res_path) {
                                if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                                    for (key, value) in vars {
                                        std::env::set_var(&key, &value);
                                    }
                                    eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", res_path);
                                    loaded = true;
                                }
                            }
                        }
                    }
                }

                // 3. Windows: resources/ subfolder next to exe (Tauri 2 NSIS/MSI bundle)
                #[cfg(target_os = "windows")]
                if !loaded {
                    let win_res_path = exe_dir.join("resources").join(".env.encrypted");
                    if win_res_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&win_res_path) {
                            if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                                for (key, value) in vars {
                                    std::env::set_var(&key, &value);
                                }
                                eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", win_res_path);
                                loaded = true;
                            }
                        }
                    }
                }

                // 4. Linux: ../lib/{identifier}/ or ../share/{identifier}/ relative to exe
                #[cfg(target_os = "linux")]
                if !loaded {
                    let identifier = "com.evintleovonzko.flowfolio";
                    let linux_candidates = [
                        exe_dir.parent().map(|p| p.join("lib").join(identifier).join(".env.encrypted")),
                        exe_dir.parent().map(|p| p.join("share").join(identifier).join(".env.encrypted")),
                        Some(exe_dir.join("resources").join(".env.encrypted")),
                    ];
                    for candidate in linux_candidates.iter().flatten() {
                        if candidate.exists() {
                            if let Ok(content) = std::fs::read_to_string(candidate) {
                                if let Ok(vars) = flowfolio_lib::core::decrypt_env_file(&content) {
                                    for (key, value) in vars {
                                        std::env::set_var(&key, &value);
                                    }
                                    eprintln!("[INFO] [main] Loaded encrypted environment from {:?}", candidate);
                                    loaded = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if !loaded {
            eprintln!("[WARN] [main] No .env.encrypted found — some features may be unavailable");
        }
    }
    
    flowfolio_lib::run()
}
