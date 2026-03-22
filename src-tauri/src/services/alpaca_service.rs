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
        use crate::core::encrypted_env::get_env_var;
        let api_key = get_env_var("ALPACA_API_KEY");
        let api_secret = get_env_var("ALPACA_SECRET_KEY");
        let is_paper = get_env_var("ALPACA_PAPER_TRADING")
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

        tracing::info!(mode = if self.is_paper { "paper" } else { "live" }, "Fetching Alpaca account info");

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

        tracing::info!("Fetching Alpaca positions");

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
    #[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_constructs_without_panic() {
        let _svc = AlpacaService::new();
    }

    #[test]
    fn is_configured_returns_false_without_env_vars() {
        std::env::remove_var("ALPACA_API_KEY");
        std::env::remove_var("ALPACA_SECRET_KEY");
        let svc = AlpacaService::new();
        assert!(!svc.is_configured());
    }

    #[test]
    fn is_paper_defaults_to_true_when_env_var_absent() {
        std::env::remove_var("ALPACA_PAPER_TRADING");
        let svc = AlpacaService::new();
        assert!(svc.is_paper);
    }

    #[test]
    fn base_url_returns_paper_url_when_is_paper_true() {
        std::env::remove_var("ALPACA_PAPER_TRADING");
        let svc = AlpacaService::new();
        assert_eq!(svc.base_url(), "https://paper-api.alpaca.markets");
    }

    #[test]
    fn base_url_returns_live_url_when_is_paper_false() {
        let svc = AlpacaService {
            client: reqwest::Client::new(),
            api_key: None,
            api_secret: None,
            is_paper: false,
        };
        assert_eq!(svc.base_url(), "https://api.alpaca.markets");
    }

    #[test]
    fn alpaca_order_serializes_and_deserializes_correctly() {
        let order = AlpacaOrder {
            id: "order-1".to_string(),
            client_order_id: "client-1".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: Some("2024-01-01T01:00:00Z".to_string()),
            submitted_at: None,
            filled_at: None,
            expired_at: None,
            canceled_at: None,
            failed_at: None,
            asset_id: "asset-1".to_string(),
            symbol: "AAPL".to_string(),
            asset_class: "us_equity".to_string(),
            qty: "10".to_string(),
            filled_qty: "0".to_string(),
            r#type: "market".to_string(),
            side: "buy".to_string(),
            time_in_force: "day".to_string(),
            status: "new".to_string(),
        };

        let json = serde_json::to_value(&order).expect("serialization failed");
        assert_eq!(json["symbol"], "AAPL");
        assert_eq!(json["type"], "market");
        assert_eq!(json["side"], "buy");

        let round_tripped: AlpacaOrder =
            serde_json::from_value(json).expect("deserialization failed");
        assert_eq!(round_tripped.symbol, "AAPL");
        assert_eq!(round_tripped.r#type, "market");
    }

    #[test]
    fn alpaca_account_serializes_correctly() {
        let account = AlpacaAccount {
            id: "acc-1".to_string(),
            account_number: "PA123456".to_string(),
            status: "ACTIVE".to_string(),
            currency: "USD".to_string(),
            buying_power: "10000.00".to_string(),
            cash: "5000.00".to_string(),
            portfolio_value: "15000.00".to_string(),
            pattern_day_trader: false,
            trading_blocked: false,
            transfers_blocked: false,
            account_blocked: false,
            equity: "15000.00".to_string(),
            last_equity: "14500.00".to_string(),
            long_market_value: "10000.00".to_string(),
            short_market_value: "0.00".to_string(),
            initial_margin: "0.00".to_string(),
            maintenance_margin: "0.00".to_string(),
            daytrade_count: 0,
        };

        let json = serde_json::to_value(&account).expect("serialization failed");
        assert_eq!(json["status"], "ACTIVE");
        assert_eq!(json["currency"], "USD");
        assert_eq!(json["portfolio_value"], "15000.00");
        assert_eq!(json["pattern_day_trader"], false);
    }
}
