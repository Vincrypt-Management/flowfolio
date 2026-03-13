// API Commands Module
// Structure for future clean separation of Tauri commands
// Currently, commands are still in lib.rs

#[allow(dead_code)]
pub mod market;
#[allow(dead_code)]
pub mod cache;
#[allow(dead_code)]
pub mod health;

// Re-export command structs (future migration targets)
#[allow(unused_imports)]
pub use market::MarketCommands;
#[allow(unused_imports)]
pub use cache::CacheCommands;
#[allow(unused_imports)]
pub use health::HealthCommands;
