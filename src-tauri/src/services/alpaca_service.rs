// Alpaca Trading Service - Backend Implementation
// Securely handles Alpaca API requests through the Rust backend
// Features: Account info, positions, paper/live trading support

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Alpaca account information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaAccount {
    pub id: String,
    pub account_number: String,
    pub status: String,
    pub currency: String,
    pub buying_power: String,
    pub cash: String,
    pub portfolio_value: String,
    pub pattern_day_trader: bool,
    pub trading_blocked: bool,
    pub transfers_blocked: bool,
    pub account_blocked: bool,
    pub equity: String,
    pub last_equity: String,
    pub long_market_value: String,
    pub short_market_value: String,
    pub initial_margin: String,
    pub maintenance_margin: String,
    pub daytrade_count: i32,
}

/// Alpaca position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaPosition {
    pub asset_id: String,
    pub symbol: String,
    pub exchange: String,
    pub asset_class: String,
    pub avg_entry_price: String,
    pub qty: String,
    pub side: String,
    pub market_value: String,
    pub cost_basis: String,
    pub unrealized_pl: String,
    pub unrealized_plpc: String,
    pub unrealized_intraday_pl: String,
    pub unrealized_intraday_plpc: String,
    pub current_price: String,
    pub lastday_price: String,
    pub change_today: String,
}

/// Alpaca order
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaOrder {
    pub id: String,
    pub client_order_id: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub submitted_at: Option<String>,
    pub filled_at: Option<String>,
    pub expired_at: Option<String>,
    pub canceled_at: Option<String>,
    pub failed_at: Option<String>,
    pub asset_id: String,
    pub symbol: String,
    pub asset_class: String,
    pub qty: String,
    pub filled_qty: String,
    pub r#type: String,
    pub side: String,
    pub time_in_force: String,
    pub status: String,
}

/// Alpaca Trading Service
pub struct AlpacaService {
    client: Client,
    api_key: Option<String>,
    api_secret: Option<String>,
    is_paper: bool,
}

impl AlpacaService {
    /// Create new Alpaca service
    pub fn new() -> Self {
        let api_key = std::env::var("VITE_ALPACA_API_KEY").ok();
        let api_secret = std::env::var("VITE_ALPACA_API_SECRET").ok();
        let is_paper = std::env::var("VITE_ALPACA_PAPER_TRADING")
            .map(|v| v == "true")
            .unwrap_or(true); // Default to paper trading for safety

        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
            api_key,
            api_secret,
            is_paper,
        }
    }

    /// Check if service is configured
    pub fn is_configured(&self) -> bool {
        self.api_key.is_some() && self.api_secret.is_some()
    }

    /// Get base URL based on paper/live trading
    fn base_url(&self) -> &str {
        if self.is_paper {
            "https://paper-api.alpaca.markets"
        } else {
            "https://api.alpaca.markets"
        }
    }

    /// Get account information
    pub async fn get_account(&self) -> Result<AlpacaAccount, String> {
        let api_key = self.api_key.as_ref()
            .ok_or_else(|| "Alpaca API key not configured".to_string())?;
        let api_secret = self.api_secret.as_ref()
            .ok_or_else(|| "Alpaca API secret not configured".to_string())?;

        eprintln!("[INFO] [alpaca] Fetching account info ({})", if self.is_paper { "paper" } else { "live" });

        let response = self.client
            .get(format!("{}/v2/account", self.base_url()))
            .header("APCA-API-KEY-ID", api_key)
            .header("APCA-API-SECRET-KEY", api_secret)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error {}: {}", status, error_text));
        }

        response.json().await
            .map_err(|e| format!("Failed to parse account response: {}", e))
    }

    /// Get all positions
    pub async fn get_positions(&self) -> Result<Vec<AlpacaPosition>, String> {
        let api_key = self.api_key.as_ref()
            .ok_or_else(|| "Alpaca API key not configured".to_string())?;
        let api_secret = self.api_secret.as_ref()
            .ok_or_else(|| "Alpaca API secret not configured".to_string())?;

        eprintln!("[INFO] [alpaca] Fetching positions");

        let response = self.client
            .get(format!("{}/v2/positions", self.base_url()))
            .header("APCA-API-KEY-ID", api_key)
            .header("APCA-API-SECRET-KEY", api_secret)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error {}: {}", status, error_text));
        }

        response.json().await
            .map_err(|e| format!("Failed to parse positions response: {}", e))
    }

    /// Get position for a specific symbol
    pub async fn get_position(&self, symbol: &str) -> Result<AlpacaPosition, String> {
        let api_key = self.api_key.as_ref()
            .ok_or_else(|| "Alpaca API key not configured".to_string())?;
        let api_secret = self.api_secret.as_ref()
            .ok_or_else(|| "Alpaca API secret not configured".to_string())?;

        let response = self.client
            .get(format!("{}/v2/positions/{}", self.base_url(), symbol))
            .header("APCA-API-KEY-ID", api_key)
            .header("APCA-API-SECRET-KEY", api_secret)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error {}: {}", status, error_text));
        }

        response.json().await
            .map_err(|e| format!("Failed to parse position response: {}", e))
    }

    /// Get all orders
    pub async fn get_orders(&self, status: Option<&str>) -> Result<Vec<AlpacaOrder>, String> {
        let api_key = self.api_key.as_ref()
            .ok_or_else(|| "Alpaca API key not configured".to_string())?;
        let api_secret = self.api_secret.as_ref()
            .ok_or_else(|| "Alpaca API secret not configured".to_string())?;

        let mut url = format!("{}/v2/orders", self.base_url());
        if let Some(s) = status {
            url = format!("{}?status={}", url, s);
        }

        let response = self.client
            .get(&url)
            .header("APCA-API-KEY-ID", api_key)
            .header("APCA-API-SECRET-KEY", api_secret)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Alpaca API error {}: {}", status, error_text));
        }

        response.json().await
            .map_err(|e| format!("Failed to parse orders response: {}", e))
    }

    /// Get trading status
    pub fn get_trading_mode(&self) -> serde_json::Value {
        serde_json::json!({
            "mode": if self.is_paper { "paper" } else { "live" },
            "configured": self.is_configured(),
        })
    }
}

impl Default for AlpacaService {
    fn default() -> Self {
        Self::new()
    }
}
