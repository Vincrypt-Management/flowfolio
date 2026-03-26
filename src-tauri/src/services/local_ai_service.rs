// Local AI Service — native Gemma 3 1B inference via llama.cpp
//
// No Ollama, no external process. On first use:
//   1. Downloads `gemma-3-1b-it-Q4_K_M.gguf` (~700 MB) from HuggingFace.
//   2. Loads the GGUF into llama.cpp (Metal-accelerated on macOS).
//   3. Runs inference in a dedicated blocking thread (actor pattern).
//
// Used as a fallback when OpenRouter is unavailable, keeping the app fully
// functional offline after the initial download.

use futures::StreamExt;
use llama_cpp::{LlamaModel, LlamaParams, SessionParams};
use llama_cpp::standard_sampler::StandardSampler;
use reqwest::Client;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use tokio::fs;
use tokio::io::AsyncWriteExt;

use super::openrouter_service::OpenRouterMessage;

// ─── Model source ─────────────────────────────────────────────────────────────

const MODEL_URL: &str =
    "https://huggingface.co/bartowski/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf";
const MODEL_FILENAME: &str = "gemma-3-1b-it-Q4_K_M.gguf";
const MAX_NEW_TOKENS: usize = 512;

// ─── Actor message ────────────────────────────────────────────────────────────

enum InferenceMsg {
    Chat {
        prompt: String,
        reply: tokio::sync::oneshot::Sender<Result<String, String>>,
    },
}

// ─── Public service ───────────────────────────────────────────────────────────

pub struct LocalAiService {
    client: Client,
    ready: Arc<AtomicBool>,
    /// Sender to the dedicated inference thread. None until model is loaded.
    tx: Arc<Mutex<Option<mpsc::SyncSender<InferenceMsg>>>>,
}

impl LocalAiService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .expect("Failed to create HTTP client"),
            ready: Arc::new(AtomicBool::new(false)),
            tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Whether the model is loaded and ready.
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    /// Kick off load (and optional download) in background. Returns immediately.
    ///
    /// - `bundled_model`: path to the GGUF bundled inside the app resources (checked first).
    /// - `download_dir`: directory to download the GGUF into if the bundled copy is absent.
    pub fn init_in_background(&self, bundled_model: Option<PathBuf>, download_dir: PathBuf) {
        let client = self.client.clone();
        let ready = self.ready.clone();
        let tx_cell = self.tx.clone();

        tokio::spawn(async move {
            // 1. Resolve which model file to use — bundled copy first, download fallback.
            let model_path = if let Some(ref bp) = bundled_model {
                if let Ok(meta) = tokio::fs::metadata(bp).await {
                    if meta.len() > 10 * 1_048_576 {
                        eprintln!("[LOCAL_AI] Using bundled model: {:?}", bp);
                        bp.clone()
                    } else {
                        eprintln!("[LOCAL_AI] Bundled model looks incomplete — will download.");
                        download_dir.join(MODEL_FILENAME)
                    }
                } else {
                    eprintln!("[LOCAL_AI] Bundled model not found — will download.");
                    download_dir.join(MODEL_FILENAME)
                }
            } else {
                download_dir.join(MODEL_FILENAME)
            };

            // Download only if the resolved path doesn't already exist.
            if model_path != bundled_model.unwrap_or_default() {
                if let Err(e) = download_if_needed(&client, &model_path).await {
                    eprintln!("[LOCAL_AI] Download failed: {e}");
                    return;
                }
            }

            // 2. Load model in a blocking thread (llama.cpp is not async).
            let mp = model_path.clone();
            let (actor_tx, actor_rx) = mpsc::sync_channel::<InferenceMsg>(8);

            let load_result = tokio::task::spawn_blocking(move || {
                eprintln!("[LOCAL_AI] Loading GGUF from {:?}...", mp);
                let model = LlamaModel::load_from_file(&mp, LlamaParams::default())
                    .map_err(|e| format!("Failed to load model: {e}"))?;
                eprintln!("[LOCAL_AI] Model loaded — starting inference actor.");
                Ok::<LlamaModel, String>(model)
            })
            .await;

            let model = match load_result {
                Ok(Ok(m)) => m,
                Ok(Err(e)) => {
                    eprintln!("[LOCAL_AI] Load error: {e}");
                    return;
                }
                Err(e) => {
                    eprintln!("[LOCAL_AI] Spawn error: {e}");
                    return;
                }
            };

            // 3. Store the sender, mark ready.
            {
                let mut guard = tx_cell.lock().unwrap();
                *guard = Some(actor_tx);
            }
            ready.store(true, Ordering::Relaxed);
            eprintln!("[LOCAL_AI] gemma3:1b ready for inference.");

            // 4. Run inference actor loop in this blocking thread.
            //    (model lives here — no Send requirement across threads.)
            tokio::task::spawn_blocking(move || {
                while let Ok(msg) = actor_rx.recv() {
                    match msg {
                        InferenceMsg::Chat { prompt, reply } => {
                            let result = run_inference(&model, &prompt);
                            let _ = reply.send(result);
                        }
                    }
                }
                eprintln!("[LOCAL_AI] Inference actor shut down.");
            })
            .await
            .ok();
        });
    }

    /// Send a chat request to the local model.
    pub async fn chat(&self, messages: Vec<OpenRouterMessage>) -> Result<String, String> {
        if !self.is_ready() {
            return Err(
                "Local AI not ready (model may still be downloading).".to_string()
            );
        }

        let prompt = format_gemma_prompt(&messages);

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        {
            let guard = self.tx.lock().unwrap();
            match guard.as_ref() {
                Some(tx) => tx
                    .send(InferenceMsg::Chat { prompt, reply: reply_tx })
                    .map_err(|_| "Inference actor is unavailable.".to_string())?,
                None => return Err("Inference actor not started.".to_string()),
            }
        }

        reply_rx
            .await
            .map_err(|_| "Inference actor dropped the reply channel.".to_string())?
    }
}

impl Default for LocalAiService {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Inference ────────────────────────────────────────────────────────────────

fn run_inference(model: &LlamaModel, prompt: &str) -> Result<String, String> {
    let mut session = model
        .create_session(SessionParams::default())
        .map_err(|e| format!("Failed to create session: {e}"))?;

    session
        .advance_context(prompt)
        .map_err(|e| format!("Failed to tokenize prompt: {e}"))?;

    let completions = session
        .start_completing_with(StandardSampler::default(), MAX_NEW_TOKENS)
        .map_err(|e| format!("Failed to start completion: {e}"))?;

    let mut response = String::new();
    for token in completions.into_strings() {
        // Stop on Gemma end-of-turn marker.
        if token.contains("<end_of_turn>") {
            break;
        }
        response.push_str(&token);
    }

    let trimmed = response.trim().to_string();
    if trimmed.is_empty() {
        return Err("Model returned empty response.".to_string());
    }
    Ok(trimmed)
}

// ─── Chat template ────────────────────────────────────────────────────────────

/// Format messages into Gemma 3 instruct template.
///
/// Format:
///   <start_of_turn>system\n{sys}<end_of_turn>\n
///   <start_of_turn>user\n{msg}<end_of_turn>\n
///   <start_of_turn>model\n          ← model fills from here
fn format_gemma_prompt(messages: &[OpenRouterMessage]) -> String {
    let mut out = String::new();
    for msg in messages {
        let tag = match msg.role.as_str() {
            "assistant" => "model",
            other => other, // "user" | "system"
        };
        out.push_str(&format!(
            "<start_of_turn>{}\n{}<end_of_turn>\n",
            tag, msg.content
        ));
    }
    // Prompt model to complete.
    out.push_str("<start_of_turn>model\n");
    out
}

// ─── Download ─────────────────────────────────────────────────────────────────

async fn download_if_needed(client: &Client, dest: &PathBuf) -> Result<(), String> {
    // Check if file already exists and has non-zero size.
    if let Ok(meta) = fs::metadata(dest).await {
        if meta.len() > 0 {
            eprintln!("[LOCAL_AI] GGUF already present ({} MB).", meta.len() / 1_048_576);
            return Ok(());
        }
    }

    // Ensure parent directory exists.
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create models dir: {e}"))?;
    }

    eprintln!("[LOCAL_AI] Downloading {MODEL_FILENAME} (~700 MB)...");
    eprintln!("[LOCAL_AI] Source: {MODEL_URL}");

    let resp = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HuggingFace returned HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut file = fs::File::create(dest)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut last_log_pct = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("File write error: {e}"))?;
        downloaded += chunk.len() as u64;

        if total > 0 {
            let pct = downloaded * 100 / total;
            if pct >= last_log_pct + 10 {
                eprintln!("[LOCAL_AI] Download: {pct}% ({} / {} MB)", downloaded / 1_048_576, total / 1_048_576);
                last_log_pct = pct;
            }
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {e}"))?;
    eprintln!("[LOCAL_AI] Download complete ({} MB).", downloaded / 1_048_576);
    Ok(())
}
