use governor::{Quota, RateLimiter as GovernorLimiter, DefaultDirectRateLimiter};
use anyhow::Result;
use std::time::Duration;

/// Rate limiter for API providers with configurable quotas
pub struct RateLimiter {
    limiter: DefaultDirectRateLimiter,
}

impl RateLimiter {
    /// Create a new rate limiter with daily quota (e.g., 25 requests per day for Alpha Vantage free tier)
    pub fn new_daily(requests_per_day: u32) -> Self {
        // Create quota: 1 request per (24 hours / requests_per_day)
        let seconds_per_request = (24 * 60 * 60) / requests_per_day;
        let quota = Quota::with_period(Duration::from_secs(seconds_per_request as u64))
            .expect("Invalid quota period");
        let limiter = GovernorLimiter::direct(quota);
        Self { limiter }
    }

    /// Check if a request can proceed
    pub async fn check(&self, _key: String) -> Result<()> {
        self.limiter
            .check()
            .map_err(|e| anyhow::anyhow!("Rate limit exceeded: {:?}", e))?;
        Ok(())
    }

    /// Get remaining capacity estimation (approximate)
    pub fn remaining_capacity(&self, _key: &str) -> u32 {
        // Note: governor doesn't expose remaining capacity directly
        // This is a simplified approximation
        25 // Placeholder - in production, track this separately
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter() {
        let limiter = RateLimiter::new_daily(5);
        
        for _ in 0..5 {
            assert!(limiter.check("test".to_string()).await.is_ok());
        }
        
        // Next request should fail
        assert!(limiter.check("test".to_string()).await.is_err());
    }
}
