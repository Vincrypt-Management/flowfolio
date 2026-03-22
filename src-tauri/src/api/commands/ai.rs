// API Commands - AI / OpenRouter
// Extracted from lib.rs

use crate::services::openrouter_service::OpenRouterMessage;
use crate::{OPENROUTER_SERVICE, get_user_tier};
use tauri::{AppHandle, Emitter};

/// Check if AI service is configured
#[tauri::command]
pub fn ai_is_configured() -> bool {
    OPENROUTER_SERVICE.is_configured()
}

/// Chat with AI assistant (proxied through backend)
#[tauri::command]
pub async fn ai_chat(
    messages: Vec<OpenRouterMessage>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    OPENROUTER_SERVICE.chat(messages, model, temperature, max_tokens).await
}

/// Generate portfolio insight using AI
#[tauri::command]
pub async fn ai_generate_portfolio_insight(portfolio_data: serde_json::Value) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    OPENROUTER_SERVICE.generate_portfolio_insight(portfolio_data).await
}

/// Chat with AI assistant (simple conversation)
#[tauri::command]
pub async fn ai_chat_assistant(
    message: String,
    history: Vec<OpenRouterMessage>,
) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    OPENROUTER_SERVICE.chat_with_assistant(message, history).await
}

/// AI streaming chat
#[tauri::command]
pub async fn ai_chat_stream(
    app: AppHandle,
    messages: Vec<serde_json::Value>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }

    let api_key = crate::core::encrypted_env::get_env_var("OPENROUTER_API_KEY")
        .ok_or_else(|| "OpenRouter API key not configured".to_string())?;

    let model = model.unwrap_or_else(|| "anthropic/claude-sonnet-4-20250514".to_string());
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.7),
        "max_tokens": max_tokens.unwrap_or(4096),
        "stream": true,
    });

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://flowfolio.app")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter API error {}: {}", status, text));
    }

    let mut full_response = String::new();
    use futures::StreamExt;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" { continue; }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_response.push_str(content);
                        let _ = app.emit("ai-token", content);
                    }
                }
            }
        }
    }

    Ok(full_response)
}
