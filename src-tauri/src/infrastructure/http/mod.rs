// Infrastructure HTTP Client
// Centralized HTTP client with connection pooling

use reqwest::Client;
use std::time::Duration;
use once_cell::sync::Lazy;

/// Global HTTP client with optimized settings
pub static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))
        .gzip(true)
        .brotli(true)
        .build()
        .expect("Failed to create HTTP client")
});

/// Get a reference to the global HTTP client
pub fn get_client() -> &'static Client {
    &HTTP_CLIENT
}
