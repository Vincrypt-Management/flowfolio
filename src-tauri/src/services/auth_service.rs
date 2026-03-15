use serde::{Deserialize, Serialize};

// ── Types ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubscriptionPublic {
    pub tier: String,
    pub credits: i32,
    pub monthly_credits: i32,
    pub max_portfolios: i32,
    pub max_watchlist_items: i32,
    pub backtest_limit: i32,
    pub ai_queries_limit: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreditTransactionRow {
    pub id: String,
    pub user_id: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: i32,
    pub balance: i32,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

// ── Auth Service (Supabase REST, service_role) ──────────

pub struct AuthService {
    supabase_url: String,
    service_role_key: String,
    http: reqwest::Client,
}

impl AuthService {
    pub fn new(supabase_url: String, service_role_key: String) -> Self {
        Self {
            supabase_url,
            service_role_key,
            http: reqwest::Client::new(),
        }
    }

    /// GET from Supabase REST API (service_role bypasses RLS)
    async fn rest_get(&self, path: &str) -> Result<serde_json::Value, String> {
        let res = self.http
            .get(format!("{}/rest/v1/{}", self.supabase_url, path))
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("Supabase error {}: {}", status, body));
        }

        res.json().await.map_err(|e| format!("JSON error: {}", e))
    }

    /// PATCH a Supabase table row
    async fn rest_patch(&self, path: &str, body: &serde_json::Value) -> Result<(), String> {
        let res = self.http
            .patch(format!("{}/rest/v1/{}", self.supabase_url, path))
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("Supabase error {}: {}", status, body));
        }

        Ok(())
    }

    /// POST to a Supabase table
    async fn rest_post(&self, table: &str, body: &serde_json::Value) -> Result<(), String> {
        let res = self.http
            .post(format!("{}/rest/v1/{}", self.supabase_url, table))
            .header("apikey", &self.service_role_key)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Supabase error {}: {}", status, text));
        }

        Ok(())
    }

    /// Get subscription for a user.
    pub async fn get_subscription(&self, user_id: &str) -> Result<SubscriptionPublic, String> {
        let data = self.rest_get(
            &format!("subscriptions?user_id=eq.{}&select=tier,credits,monthly_credits,max_portfolios,max_watchlist_items,backtest_limit,ai_queries_limit&limit=1", user_id)
        ).await?;

        let arr = data.as_array().ok_or("Unexpected response")?;

        if let Some(sub) = arr.first() {
            Ok(SubscriptionPublic {
                tier: sub["tier"].as_str().unwrap_or("free").to_string(),
                credits: sub["credits"].as_i64().unwrap_or(0) as i32,
                monthly_credits: sub["monthly_credits"].as_i64().unwrap_or(0) as i32,
                max_portfolios: sub["max_portfolios"].as_i64().unwrap_or(1) as i32,
                max_watchlist_items: sub["max_watchlist_items"].as_i64().unwrap_or(5) as i32,
                backtest_limit: sub["backtest_limit"].as_i64().unwrap_or(1) as i32,
                ai_queries_limit: sub["ai_queries_limit"].as_i64().unwrap_or(2) as i32,
            })
        } else {
            Ok(SubscriptionPublic {
                tier: "free".into(),
                credits: 0,
                monthly_credits: 0,
                max_portfolios: 1,
                max_watchlist_items: 5,
                backtest_limit: 1,
                ai_queries_limit: 2,
            })
        }
    }

    /// Deduct credits for a server-side operation.
    pub async fn deduct_credits(
        &self,
        user_id: &str,
        amount: i32,
        description: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<i32, String> {
        let sub = self.get_subscription(user_id).await?;

        if sub.credits < amount {
            return Err("Insufficient credits".into());
        }

        let new_balance = sub.credits - amount;

        self.rest_patch(
            &format!("subscriptions?user_id=eq.{}", user_id),
            &serde_json::json!({ "credits": new_balance, "updated_at": chrono::Utc::now().to_rfc3339() }),
        ).await?;

        self.rest_post("credit_transactions", &serde_json::json!({
            "user_id": user_id,
            "type": "usage",
            "amount": -amount,
            "balance": new_balance,
            "description": description,
            "metadata": metadata,
        })).await?;

        Ok(new_balance)
    }

    /// Get recent credit transactions.
    pub async fn get_credit_history(&self, user_id: &str, limit: i32) -> Result<Vec<CreditTransactionRow>, String> {
        let data = self.rest_get(
            &format!("credit_transactions?user_id=eq.{}&select=id,user_id,type,amount,balance,description,metadata,created_at&order=created_at.desc&limit={}", user_id, limit)
        ).await?;

        serde_json::from_value(data).map_err(|e| format!("Parse error: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_service_new_constructs_without_panic() {
        let svc = AuthService::new(
            "https://example.supabase.co".to_string(),
            "service_key_123".to_string(),
        );
        assert_eq!(svc.supabase_url, "https://example.supabase.co");
        assert_eq!(svc.service_role_key, "service_key_123");
    }

    #[test]
    fn test_subscription_public_serializes_with_correct_field_names() {
        let sub = SubscriptionPublic {
            tier: "pro".to_string(),
            credits: 100,
            monthly_credits: 500,
            max_portfolios: 10,
            max_watchlist_items: 50,
            backtest_limit: 20,
            ai_queries_limit: 30,
        };
        let json = serde_json::to_string(&sub).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["tier"], "pro");
        assert_eq!(value["credits"], 100);
        assert_eq!(value["monthly_credits"], 500);
        assert_eq!(value["max_portfolios"], 10);
        assert_eq!(value["max_watchlist_items"], 50);
        assert_eq!(value["backtest_limit"], 20);
        assert_eq!(value["ai_queries_limit"], 30);
    }

    #[test]
    fn test_subscription_public_deserializes_from_json() {
        let json = r#"{
            "tier": "free",
            "credits": 0,
            "monthly_credits": 0,
            "max_portfolios": 1,
            "max_watchlist_items": 5,
            "backtest_limit": 1,
            "ai_queries_limit": 2
        }"#;
        let sub: SubscriptionPublic = serde_json::from_str(json).unwrap();
        assert_eq!(sub.tier, "free");
        assert_eq!(sub.credits, 0);
        assert_eq!(sub.max_portfolios, 1);
        assert_eq!(sub.ai_queries_limit, 2);
    }

    #[test]
    fn test_credit_transaction_row_serializes_type_rename() {
        let row = CreditTransactionRow {
            id: "txn-001".to_string(),
            user_id: "user-abc".to_string(),
            tx_type: "usage".to_string(),
            amount: -5,
            balance: 95,
            description: Some("AI query".to_string()),
            metadata: Some(serde_json::json!({"model": "gpt-4"})),
            created_at: "2024-01-15T10:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&row).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        // tx_type must appear as "type" in JSON due to #[serde(rename = "type")]
        assert_eq!(value["type"], "usage");
        assert!(value.get("tx_type").is_none());
        assert_eq!(value["id"], "txn-001");
        assert_eq!(value["amount"], -5);
    }

    #[test]
    fn test_credit_transaction_row_with_none_fields_serializes_correctly() {
        let row = CreditTransactionRow {
            id: "txn-002".to_string(),
            user_id: "user-xyz".to_string(),
            tx_type: "grant".to_string(),
            amount: 100,
            balance: 100,
            description: None,
            metadata: None,
            created_at: "2024-01-16T12:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&row).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["type"], "grant");
        assert_eq!(value["balance"], 100);
        // None fields serialize as JSON null
        assert!(value["description"].is_null());
        assert!(value["metadata"].is_null());
    }

    #[test]
    fn test_credit_transaction_row_deserializes_type_key_to_tx_type() {
        let json = r#"{
            "id": "txn-003",
            "user_id": "user-def",
            "type": "refund",
            "amount": 10,
            "balance": 110,
            "description": null,
            "metadata": null,
            "created_at": "2024-01-17T08:30:00Z"
        }"#;
        let row: CreditTransactionRow = serde_json::from_str(json).unwrap();
        assert_eq!(row.tx_type, "refund");
        assert_eq!(row.id, "txn-003");
        assert_eq!(row.amount, 10);
        assert!(row.description.is_none());
    }
}
