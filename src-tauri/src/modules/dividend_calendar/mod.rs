use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpcomingDividend {
    pub symbol: String,
    pub ex_date: String,
    pub pay_date: Option<String>,
    pub amount_per_share: f64,
}

#[async_trait::async_trait]
pub trait DividendCalendarProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn upcoming(
        &self,
        symbol: &str,
        lookahead_days: u32,
    ) -> Result<Vec<UpcomingDividend>, String>;
}

pub struct DividendCalendarChain {
    providers: Vec<Box<dyn DividendCalendarProvider>>,
}

impl DividendCalendarChain {
    pub fn new(providers: Vec<Box<dyn DividendCalendarProvider>>) -> Self {
        Self { providers }
    }

    pub async fn upcoming(
        &self,
        symbol: &str,
        lookahead_days: u32,
    ) -> Result<Vec<UpcomingDividend>, String> {
        let mut last_err = String::from("no providers configured");
        for p in &self.providers {
            match p.upcoming(symbol, lookahead_days).await {
                Ok(divs) => return Ok(divs),
                Err(e) => {
                    last_err = format!("{}: {}", p.name(), e);
                }
            }
        }
        Err(last_err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubProvider {
        n: String,
        result: Result<Vec<UpcomingDividend>, String>,
    }

    #[async_trait::async_trait]
    impl DividendCalendarProvider for StubProvider {
        fn name(&self) -> &str {
            &self.n
        }
        async fn upcoming(
            &self,
            _symbol: &str,
            _lookahead_days: u32,
        ) -> Result<Vec<UpcomingDividend>, String> {
            self.result.clone()
        }
    }

    fn one(symbol: &str) -> UpcomingDividend {
        UpcomingDividend {
            symbol: symbol.into(),
            ex_date: "2026-06-01".into(),
            pay_date: Some("2026-06-15".into()),
            amount_per_share: 0.50,
        }
    }

    #[tokio::test]
    async fn first_provider_success_returns_immediately() {
        let chain = DividendCalendarChain::new(vec![
            Box::new(StubProvider {
                n: "finnhub".into(),
                result: Ok(vec![one("VTI")]),
            }),
            Box::new(StubProvider {
                n: "fmp".into(),
                result: Err("should not be called".into()),
            }),
        ]);
        let r = chain.upcoming("VTI", 90).await.unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].symbol, "VTI");
    }

    #[tokio::test]
    async fn fallback_when_first_provider_errors() {
        let chain = DividendCalendarChain::new(vec![
            Box::new(StubProvider {
                n: "finnhub".into(),
                result: Err("rate limit".into()),
            }),
            Box::new(StubProvider {
                n: "fmp".into(),
                result: Ok(vec![one("VTI")]),
            }),
        ]);
        let r = chain.upcoming("VTI", 90).await.unwrap();
        assert_eq!(r.len(), 1);
    }

    #[tokio::test]
    async fn returns_last_error_when_all_providers_fail() {
        let chain = DividendCalendarChain::new(vec![
            Box::new(StubProvider {
                n: "finnhub".into(),
                result: Err("rate limit".into()),
            }),
            Box::new(StubProvider {
                n: "fmp".into(),
                result: Err("auth".into()),
            }),
        ]);
        let err = chain.upcoming("VTI", 90).await.unwrap_err();
        assert!(err.contains("fmp"));
        assert!(err.contains("auth"));
    }

    #[tokio::test]
    async fn empty_chain_returns_helpful_error() {
        let chain = DividendCalendarChain::new(vec![]);
        let err = chain.upcoming("VTI", 90).await.unwrap_err();
        assert!(err.contains("no providers"));
    }
}
