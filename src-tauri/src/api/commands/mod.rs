// API Commands Module
// Structure for future clean separation of Tauri commands
// Currently, commands are still in lib.rs

pub mod market;
pub mod cache;
pub mod health;

// Re-export command structs
pub use market::MarketCommands;
pub use cache::CacheCommands;
pub use health::HealthCommands;
