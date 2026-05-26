// Local AI stub — local model inference removed.
// AI features are provided exclusively via OpenRouter (configured in Settings).

use super::openrouter_service::OpenRouterMessage;
use std::path::PathBuf;

pub struct LocalAiService;

impl LocalAiService {
    pub fn new() -> Self {
        Self
    }

    pub fn is_ready(&self) -> bool {
        false
    }

    pub fn init_in_background(&self, _bundled_model: Option<PathBuf>, _download_dir: PathBuf) {}

    pub async fn chat(&self, _messages: Vec<OpenRouterMessage>) -> Result<String, String> {
        Err("Local AI is not available. Configure an OpenRouter API key in Settings.".to_string())
    }
}

impl Default for LocalAiService {
    fn default() -> Self {
        Self::new()
    }
}
