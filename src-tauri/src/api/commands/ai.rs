// API Commands - AI / OpenRouter
// Extracted from lib.rs

use crate::services::openrouter_service::OpenRouterMessage;
use crate::{get_user_tier, OPENROUTER_SERVICE};
use tauri::{AppHandle, Emitter};

const DEFAULT_FREE_MODEL: &str = "openrouter/owl-alpha";

/// Check if AI service is configured (OpenRouter key present)
#[tauri::command]
pub fn ai_is_configured() -> bool {
    OPENROUTER_SERVICE.is_configured()
}

/// Local AI is no longer supported — always returns false
#[tauri::command]
pub fn ai_local_is_ready() -> bool {
    false
}

/// Chat with AI assistant (proxied through OpenRouter)
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
    OPENROUTER_SERVICE
        .chat(messages, model, temperature, max_tokens)
        .await
}

/// Generate portfolio insight using AI
#[tauri::command]
pub async fn ai_generate_portfolio_insight(
    portfolio_data: serde_json::Value,
    model: Option<String>,
) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    OPENROUTER_SERVICE
        .generate_portfolio_insight(portfolio_data, model)
        .await
}

/// Chat with AI assistant (simple conversation)
#[tauri::command]
pub async fn ai_chat_assistant(
    message: String,
    history: Vec<OpenRouterMessage>,
    model: Option<String>,
) -> Result<String, String> {
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    OPENROUTER_SERVICE
        .chat_with_assistant(message, history, model)
        .await
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

    // Prefer the user's key; fall through to the embedded free-tier fallback
    // so streaming always works even without a configured key.
    let api_key = OPENROUTER_SERVICE
        .resolve_api_key()
        .ok_or_else(|| "OpenRouter API key not configured".to_string())?;

    let model = model.unwrap_or_else(|| DEFAULT_FREE_MODEL.to_string());

    // Build a streaming-specific client with ALL auto-decompression disabled.
    // reqwest's gzip/brotli decompressors fail on partial chunks that arrive in
    // an incremental SSE stream — they need the full payload to decompress.
    // Accept-Encoding: identity alone isn't enough because reqwest decompresses
    // based on the *response* Content-Encoding header, ignoring our request header.
    let stream_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .gzip(false)
        .brotli(false)
        .build()
        .map_err(|e| format!("Failed to build streaming client: {}", e))?;

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.7),
        "max_tokens": max_tokens.unwrap_or(4096),
        "stream": true,
    });

    let response = stream_client
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

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                let text = String::from_utf8_lossy(&chunk);
                for line in text.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data.trim() == "[DONE]" {
                            continue;
                        }
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str()
                            {
                                full_response.push_str(content);
                                let _ = app.emit("ai-token", content);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                // A single bad chunk should not abort the whole request.
                // Log and stop reading; return whatever we collected so far.
                tracing::warn!(error = %e, "Stream chunk error — stopping early");
                break;
            }
        }
    }

    // If the stream produced nothing (e.g. model doesn't support SSE),
    // fall back to a plain non-streaming request so the user still gets a response.
    if full_response.is_empty() {
        tracing::info!("Stream returned no content — falling back to non-streaming request");
        let messages_converted: Vec<OpenRouterMessage> = messages
            .iter()
            .filter_map(|m| {
                Some(OpenRouterMessage {
                    role: m["role"].as_str()?.to_string(),
                    content: m["content"].as_str()?.to_string(),
                })
            })
            .collect();

        let content = OPENROUTER_SERVICE
            .chat(
                messages_converted,
                Some(model),
                Some(temperature.unwrap_or(0.7)),
                Some(max_tokens.unwrap_or(4096)),
            )
            .await?;

        let _ = app.emit("ai-token", &content);
        return Ok(content);
    }

    Ok(full_response)
}

/// Clear all cached OpenRouter responses. Returns rows deleted.
#[tauri::command]
pub async fn ai_clear_cache() -> Result<u64, String> {
    OPENROUTER_SERVICE.clear_cache().await
}

/// (entry_count, oldest_entry_age_seconds) for the response cache.
#[tauri::command]
pub async fn ai_cache_stats() -> Result<(i64, i64), String> {
    OPENROUTER_SERVICE.cache_stats().await
}
