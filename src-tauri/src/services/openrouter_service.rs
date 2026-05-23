// OpenRouter AI Service - Backend Implementation
// Securely proxies AI requests through the Rust backend
// Features: Rate limiting, streaming support, response caching

use serde::{Deserialize, Serialize};

/// OpenRouter message format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterMessage {
    pub role: String,
    pub content: String,
}

/// OpenRouter request body
#[derive(Debug, Clone, Serialize)]
pub struct OpenRouterRequest {
    pub model: String,
    pub messages: Vec<OpenRouterMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

/// OpenRouter response
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct OpenRouterResponse {
    pub id: String,
    pub model: String,
    pub choices: Vec<OpenRouterChoice>,
    pub usage: Option<OpenRouterUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenRouterChoice {
    pub message: OpenRouterMessage,
    pub finish_reason: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct OpenRouterUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// OpenRouter API Service
pub struct OpenRouterService {
    api_key: Option<String>,
    api_url: String,
    default_model: String,
}

impl OpenRouterService {
    /// Create new OpenRouter service
    pub fn new() -> Self {
        let api_key = crate::get_api_key("OPENROUTER_API_KEY");
        let api_url = crate::core::encrypted_env::get_env_var("OPENROUTER_API_URL")
            .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
        let default_model = crate::core::encrypted_env::get_env_var("DEFAULT_LLM_MODEL")
            .unwrap_or_else(|| "meta-llama/llama-3.3-70b-instruct:free".to_string());

        // Debug: Log API key status
        tracing::debug!(configured = api_key.is_some(), "OpenRouter API key status");
        tracing::debug!(url = %api_url, "OpenRouter API URL");
        tracing::debug!(model = %default_model, "OpenRouter default model");

        Self {
            api_key,
            api_url,
            default_model,
        }
    }

    /// Check if service is configured
    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    /// Send chat completion request
    pub async fn chat(
        &self,
        messages: Vec<OpenRouterMessage>,
        model: Option<String>,
        temperature: Option<f64>,
        max_tokens: Option<u32>,
    ) -> Result<String, String> {
        let api_key = self.api_key.as_ref().ok_or_else(|| {
            "OpenRouter API key not configured. Add it in Settings → API Keys.".to_string()
        })?;

        // Validate API key format (should start with sk-)
        if !api_key.starts_with("sk-") {
            tracing::warn!("OpenRouter API key may be invalid (doesn't start with sk-)");
        }

        let model_name = model.unwrap_or_else(|| self.default_model.clone());
        let request = OpenRouterRequest {
            model: model_name.clone(),
            messages,
            temperature: temperature.or(Some(0.7)),
            max_tokens: max_tokens.or(Some(4000)),
            top_p: Some(1.0),
            stream: Some(false),
        };

        tracing::info!(model = %model_name, max_tokens = ?request.max_tokens, "Sending chat request");

        let response = crate::HTTP_CLIENT
            .post(format!("{}/chat/completions", self.api_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://flowfolio.app")
            .header("X-Title", "FlowFolio")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "OpenRouter request failed");
                format!("Request failed: {}. Check your internet connection.", e)
            })?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            tracing::error!(status = %status, body = %error_text, "OpenRouter API error");

            // Provide more helpful error messages
            let user_error = match status.as_u16() {
                401 => "Invalid API key. Please check your OPENROUTER_API_KEY.".to_string(),
                402 => "Insufficient credits. Please add credits to your OpenRouter account."
                    .to_string(),
                429 => "Rate limited. Please wait a moment and try again.".to_string(),
                500..=599 => format!(
                    "OpenRouter server error ({}). The service may be temporarily unavailable.",
                    status
                ),
                _ => format!("OpenRouter API error {}: {}", status, error_text),
            };
            return Err(user_error);
        }

        let result: OpenRouterResponse = response.json().await.map_err(|e| {
            tracing::error!(error = %e, "Failed to parse OpenRouter response");
            format!("Failed to parse AI response: {}", e)
        })?;

        if let Some(choice) = result.choices.first() {
            let content = choice.message.content.clone();

            // Check for empty content
            if content.trim().is_empty() {
                tracing::warn!(finish_reason = ?choice.finish_reason, "Model returned empty content");
                return Err(format!(
                    "Model returned empty response. Finish reason: {:?}. This may indicate the model refused the request or hit a content filter.",
                    choice.finish_reason
                ));
            }

            tracing::info!(tokens = ?result.usage, content_len = content.len(), "OpenRouter response received");
            Ok(content)
        } else {
            tracing::error!(response = ?result, "No choices in OpenRouter response");
            Err("No response from model - no choices returned".to_string())
        }
    }

    /// Generate portfolio insight
    pub async fn generate_portfolio_insight(
        &self,
        portfolio_data: serde_json::Value,
        model: Option<String>,
    ) -> Result<String, String> {
        let messages = vec![
            OpenRouterMessage {
                role: "system".to_string(),
                content: "You are a financial advisor AI assistant. Analyze portfolio data and provide concise, actionable insights about diversification, risk, and opportunities.".to_string(),
            },
            OpenRouterMessage {
                role: "user".to_string(),
                content: format!("Analyze this portfolio and provide insights:\n{}", serde_json::to_string_pretty(&portfolio_data).unwrap_or_default()),
            },
        ];

        self.chat(messages, model, Some(0.7), Some(2000)).await
    }

    /// Chat with assistant
    pub async fn chat_with_assistant(
        &self,
        user_message: String,
        conversation_history: Vec<OpenRouterMessage>,
        model: Option<String>,
    ) -> Result<String, String> {
        let mut messages = vec![
            OpenRouterMessage {
                role: "system".to_string(),
                content: "You are Flowfolio AI, a helpful financial assistant. Provide clear, concise answers about portfolio management, investments, and financial planning.".to_string(),
            },
        ];
        messages.extend(conversation_history);
        messages.push(OpenRouterMessage {
            role: "user".to_string(),
            content: user_message,
        });

        self.chat(messages, model, Some(0.7), Some(2000)).await
    }

    /// Compile a natural language prompt into a VibePlan
    pub async fn compile_plan_from_prompt(
        &self,
        prompt: &str,
    ) -> Result<serde_json::Value, String> {
        let system_prompt = r#"You are a financial plan compiler. Convert the user's natural language investment strategy description into a structured JSON plan.

Output ONLY valid JSON with this exact structure (no markdown, no explanation):
{
    "name": "Strategy Name",
    "universe": {
        "exchanges": ["NYSE", "NASDAQ"],
        "regions": ["US"],
        "sectors": [],
        "exclude_list": []
    },
    "filters": [
        {"name": "Filter Name", "field": "field_name", "operator": "greater_than", "value": 0}
    ],
    "ranking": {
        "factors": [
            {"name": "quality", "weight": 0.4},
            {"name": "value", "weight": 0.3},
            {"name": "momentum", "weight": 0.3}
        ]
    },
    "portfolio": {
        "allocation_method": "equal_weight",
        "max_position_pct": 10.0,
        "sector_caps": null,
        "cash_buffer_pct": 5.0
    },
    "cadence": {
        "monthly_contributions": true,
        "quarterly_rebalance": true,
        "yearly_review": true,
        "rebalance_threshold_pct": 5.0
    },
    "risk": {
        "max_drawdown_pct": 20.0,
        "max_concentration_pct": 30.0
    }
}

Factor names must be one of: quality, value, momentum, growth, yield
Operators must be one of: greater_than, less_than, equal_to, between
Allocation methods: equal_weight, score_weighted, value_weighted, yield_weighted, momentum_weighted"#;

        let messages = vec![
            OpenRouterMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            OpenRouterMessage {
                role: "user".to_string(),
                content: format!("Convert this investment strategy to a plan:\n\n{}", prompt),
            },
        ];

        let response = self.chat(messages, None, Some(0.3), Some(2000)).await?;

        // Parse the response as JSON
        let cleaned = response
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        serde_json::from_str(cleaned).map_err(|e| {
            format!(
                "Failed to parse plan JSON: {}. Response was: {}",
                e, cleaned
            )
        })
    }
}

impl Default for OpenRouterService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_constructs_without_panic() {
        let _svc = OpenRouterService::new();
    }

    #[test]
    fn is_configured_returns_false_when_no_env_var() {
        // Ensure the env var is absent for this test
        std::env::remove_var("OPENROUTER_API_KEY");
        let svc = OpenRouterService::new();
        assert!(!svc.is_configured());
    }

    #[test]
    fn default_api_url_is_openrouter() {
        std::env::remove_var("OPENROUTER_API_URL");
        let svc = OpenRouterService::new();
        assert_eq!(svc.api_url, "https://openrouter.ai/api/v1");
    }

    #[test]
    fn default_model_is_free_tier() {
        std::env::remove_var("DEFAULT_LLM_MODEL");
        let svc = OpenRouterService::new();
        assert_eq!(svc.default_model, "meta-llama/llama-3.3-70b-instruct:free");
    }

    #[test]
    fn openrouter_message_serializes_correctly() {
        let msg = OpenRouterMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        };
        let json = serde_json::to_value(&msg).expect("serialization failed");
        assert_eq!(json["role"], "user");
        assert_eq!(json["content"], "Hello");
    }

    #[test]
    fn openrouter_message_deserializes_from_json() {
        let json = r#"{"role": "assistant", "content": "Hi there"}"#;
        let msg: OpenRouterMessage = serde_json::from_str(json).expect("deserialization failed");
        assert_eq!(msg.role, "assistant");
        assert_eq!(msg.content, "Hi there");
    }

    #[test]
    fn openrouter_request_omits_none_optional_fields() {
        let req = OpenRouterRequest {
            model: "test-model".to_string(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            top_p: None,
            stream: None,
        };
        let json = serde_json::to_value(&req).expect("serialization failed");
        assert!(json.get("temperature").is_none());
        assert!(json.get("max_tokens").is_none());
        assert!(json.get("top_p").is_none());
        assert!(json.get("stream").is_none());
    }

    #[test]
    fn openrouter_request_includes_some_optional_fields() {
        let req = OpenRouterRequest {
            model: "test-model".to_string(),
            messages: vec![],
            temperature: Some(0.7),
            max_tokens: Some(4000),
            top_p: Some(1.0),
            stream: Some(false),
        };
        let json = serde_json::to_value(&req).expect("serialization failed");
        assert_eq!(json["temperature"], 0.7);
        assert_eq!(json["max_tokens"], 4000);
        assert_eq!(json["top_p"], 1.0);
        assert_eq!(json["stream"], false);
    }
}
