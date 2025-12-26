use anyhow::Result;
use crate::modules::{
    store::{Store, repository::Repository},
    data_provider::AlphaVantageClient,
};

/// Data sync service for orchestrating data fetching and caching
pub struct DataSyncService {
    provider: AlphaVantageClient,
}

impl DataSyncService {
    pub fn new(api_key: String) -> Self {
        Self {
            provider: AlphaVantageClient::new(api_key),
        }
    }

    /// Fetch and cache daily prices for a symbol
    pub async fn sync_symbol_prices(&self, repo: &Repository, ticker: &str) -> Result<usize> {
        // Get or create symbol
        let symbol = match repo.get_symbol_by_ticker(ticker).await? {
            Some(s) => s,
            None => {
                let id = repo.create_symbol(ticker, None, None).await?;
                repo.get_symbol_by_ticker(ticker).await?.expect("Symbol should exist")
            }
        };

        // Check latest price date
        let latest_date = repo.get_latest_price_date(symbol.id).await?;
        
        // Fetch time series (compact for updates, full for initial load)
        let outputsize = if latest_date.is_some() { "compact" } else { "full" };
        let prices = self.provider.get_time_series_daily(ticker, outputsize).await?;

        // Insert prices
        let mut inserted = 0;
        for price in prices {
            // Skip if we already have this date
            if let Some(ref date) = latest_date {
                if price.date <= *date {
                    continue;
                }
            }

            repo.insert_price(
                symbol.id,
                &price.date,
                price.open,
                price.high,
                price.low,
                price.close,
                price.volume,
            ).await?;
            inserted += 1;
        }

        Ok(inserted)
    }

    /// Fetch and cache company overview/fundamentals
    pub async fn sync_symbol_fundamentals(&self, repo: &Repository, ticker: &str) -> Result<()> {
        // Get or create symbol
        let symbol = match repo.get_symbol_by_ticker(ticker).await? {
            Some(s) => s,
            None => {
                let id = repo.create_symbol(ticker, None, None).await?;
                repo.get_symbol_by_ticker(ticker).await?.expect("Symbol should exist")
            }
        };

        // Fetch overview
        let overview = self.provider.get_company_overview(ticker).await?;
        
        // Store as JSON
        let json = serde_json::to_string(&overview)?;
        repo.upsert_fundamental(symbol.id, &json).await?;

        Ok(())
    }

    /// Batch sync multiple symbols
    pub async fn sync_symbols(&self, repo: &Repository, tickers: &[String]) -> Result<SyncReport> {
        let mut report = SyncReport {
            symbols_synced: 0,
            prices_inserted: 0,
            fundamentals_synced: 0,
            errors: Vec::new(),
        };

        for ticker in tickers {
            // Sync prices
            match self.sync_symbol_prices(repo, ticker).await {
                Ok(count) => {
                    report.symbols_synced += 1;
                    report.prices_inserted += count;
                }
                Err(e) => {
                    report.errors.push(format!("Failed to sync prices for {}: {}", ticker, e));
                }
            }

            // Sync fundamentals (less frequent, can be done separately)
            match self.sync_symbol_fundamentals(repo, ticker).await {
                Ok(_) => {
                    report.fundamentals_synced += 1;
                }
                Err(e) => {
                    report.errors.push(format!("Failed to sync fundamentals for {}: {}", ticker, e));
                }
            }

            // Add delay to respect rate limits
            tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
        }

        Ok(report)
    }

    pub fn remaining_quota(&self) -> u32 {
        self.provider.remaining_quota()
    }
}

#[derive(Debug)]
pub struct SyncReport {
    pub symbols_synced: usize,
    pub prices_inserted: usize,
    pub fundamentals_synced: usize,
    pub errors: Vec<String>,
}
