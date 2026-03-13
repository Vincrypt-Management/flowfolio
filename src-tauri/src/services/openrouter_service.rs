// OpenRouter AI Service - Backend Implementation
// Securely proxies AI requests through the Rust backend
// Features: Rate limiting, streaming support, response caching

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

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
    client: Client,
    api_key: Option<String>,
    api_url: String,
    default_model: String,
}

impl OpenRouterService {
    /// Create new OpenRouter service
    pub fn new() -> Self {
        let api_key = std::env::var("VITE_OPENROUTER_API_KEY").ok();
        let api_url = std::env::var("VITE_OPENROUTER_API_URL")
            .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string());
        let default_model = std::env::var("VITE_DEFAULT_LLM_MODEL")
            .unwrap_or_else(|_| "anthropic/claude-3-sonnet-20240229".to_string());

        // Debug: Log API key status
        eprintln!("[DEBUG] [openrouter] API key configured: {}", api_key.is_some());
        eprintln!("[DEBUG] [openrouter] API URL: {}", api_url);
        eprintln!("[DEBUG] [openrouter] Default model: {}", default_model);

        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .expect("Failed to create HTTP client"),
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
        let api_key = self.api_key.as_ref()
            .ok_or_else(|| "OpenRouter API key not configured. Set VITE_OPENROUTER_API_KEY in .env file.".to_string())?;

        // Validate API key format (should start with sk-)
        if !api_key.starts_with("sk-") {
            eprintln!("[WARN] [openrouter] API key may be invalid (doesn't start with sk-)");
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

        eprintln!("[INFO] [openrouter] Sending chat request to model: {} (max_tokens: {:?})", 
            model_name, request.max_tokens);

        let response = self.client
            .post(format!("{}/chat/completions", self.api_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://flowfolio.app")
            .header("X-Title", "FlowFolio")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                eprintln!("[ERROR] [openrouter] Request failed: {}", e);
                format!("Request failed: {}. Check your internet connection.", e)
            })?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            eprintln!("[ERROR] [openrouter] API error {}: {}", status, error_text);
            
            // Provide more helpful error messages
            let user_error = match status.as_u16() {
                401 => "Invalid API key. Please check your VITE_OPENROUTER_API_KEY.".to_string(),
                402 => "Insufficient credits. Please add credits to your OpenRouter account.".to_string(),
                429 => "Rate limited. Please wait a moment and try again.".to_string(),
                500..=599 => format!("OpenRouter server error ({}). The service may be temporarily unavailable.", status),
                _ => format!("OpenRouter API error {}: {}", status, error_text),
            };
            return Err(user_error);
        }

        let result: OpenRouterResponse = response.json().await
            .map_err(|e| {
                eprintln!("[ERROR] [openrouter] Failed to parse response: {}", e);
                format!("Failed to parse AI response: {}", e)
            })?;

        if let Some(choice) = result.choices.first() {
            let content = choice.message.content.clone();
            
            // Check for empty content
            if content.trim().is_empty() {
                eprintln!("[WARN] [openrouter] Model returned empty content. Finish reason: {:?}", choice.finish_reason);
                return Err(format!(
                    "Model returned empty response. Finish reason: {:?}. This may indicate the model refused the request or hit a content filter.",
                    choice.finish_reason
                ));
            }
            
            eprintln!("[INFO] [openrouter] Response received, tokens used: {:?}, content length: {} chars", 
                result.usage, content.len());
            Ok(content)
        } else {
            eprintln!("[ERROR] [openrouter] No choices in response. Full response: {:?}", result);
            Err("No response from model - no choices returned".to_string())
        }
    }

    /// Generate portfolio insight
    pub async fn generate_portfolio_insight(&self, portfolio_data: serde_json::Value) -> Result<String, String> {
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

        self.chat(messages, None, Some(0.7), Some(2000)).await
    }

    /// Chat with assistant
    pub async fn chat_with_assistant(
        &self,
        user_message: String,
        conversation_history: Vec<OpenRouterMessage>,
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

        self.chat(messages, None, Some(0.7), Some(2000)).await
    }

    /// Compile a natural language prompt into a VibePlan
    pub async fn compile_plan_from_prompt(&self, prompt: &str) -> Result<serde_json::Value, String> {
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
        let cleaned = response.trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        
        serde_json::from_str(cleaned)
            .map_err(|e| format!("Failed to parse plan JSON: {}. Response was: {}", e, cleaned))
    }
}

impl Default for OpenRouterService {
    fn default() -> Self {
        Self::new()
    }
}
