use crate::get_pool;
use crate::modules::dividend_calendar::{
    DividendCalendarChain, DividendCalendarProvider, UpcomingDividend,
};
use serde::Deserialize;
use std::env;

const CACHE_TTL_HOURS: i64 = 24;

// ─── Finnhub ───────────────────────────────────────────────────

struct FinnhubDividendProvider {
    api_key: String,
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct FinnhubDividendRow {
    symbol: String,
    #[serde(rename = "exDate")]
    ex_date: Option<String>,
    #[serde(rename = "payDate")]
    pay_date: Option<String>,
    amount: Option<f64>,
}

#[async_trait::async_trait]
impl DividendCalendarProvider for FinnhubDividendProvider {
    fn name(&self) -> &str {
        "finnhub"
    }
    async fn upcoming(
        &self,
        symbol: &str,
        lookahead_days: u32,
    ) -> Result<Vec<UpcomingDividend>, String> {
        let today = chrono::Utc::now().date_naive();
        let until = today + chrono::Duration::days(lookahead_days as i64);
        let url = format!(
            "https://finnhub.io/api/v1/stock/dividend?symbol={}&from={}&to={}&token={}",
            symbol,
            today.format("%Y-%m-%d"),
            until.format("%Y-%m-%d"),
            self.api_key
        );
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("finnhub http {}", resp.status()));
        }
        let rows: Vec<FinnhubDividendRow> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(rows
            .into_iter()
            .filter_map(|r| {
                Some(UpcomingDividend {
                    symbol: r.symbol,
                    ex_date: r.ex_date?,
                    pay_date: r.pay_date,
                    amount_per_share: r.amount.unwrap_or(0.0),
                })
            })
            .collect())
    }
}

// ─── FMP ───────────────────────────────────────────────────────

struct FmpDividendProvider {
    api_key: String,
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct FmpDividendRow {
    date: Option<String>, // ex-date for FMP
    #[serde(rename = "paymentDate")]
    payment_date: Option<String>,
    dividend: Option<f64>,
}

#[async_trait::async_trait]
impl DividendCalendarProvider for FmpDividendProvider {
    fn name(&self) -> &str {
        "fmp"
    }
    async fn upcoming(
        &self,
        symbol: &str,
        lookahead_days: u32,
    ) -> Result<Vec<UpcomingDividend>, String> {
        let today = chrono::Utc::now().date_naive();
        let until = today + chrono::Duration::days(lookahead_days as i64);
        let url = format!(
            "https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/{}?from={}&to={}&apikey={}",
            symbol,
            today.format("%Y-%m-%d"),
            until.format("%Y-%m-%d"),
            self.api_key,
        );
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("fmp http {}", resp.status()));
        }
        #[derive(Deserialize)]
        struct FmpEnvelope {
            symbol: String,
            historical: Vec<FmpDividendRow>,
        }
        let env: FmpEnvelope = resp.json().await.map_err(|e| e.to_string())?;
        Ok(env
            .historical
            .into_iter()
            .filter_map(|r| {
                Some(UpcomingDividend {
                    symbol: env.symbol.clone(),
                    ex_date: r.date?,
                    pay_date: r.payment_date,
                    amount_per_share: r.dividend.unwrap_or(0.0),
                })
            })
            .collect())
    }
}

// ─── Chain construction ─────────────────────────────────────────

fn build_chain() -> DividendCalendarChain {
    let mut providers: Vec<Box<dyn DividendCalendarProvider>> = Vec::new();
    let http = reqwest::Client::new();
    if let Ok(k) = env::var("FINNHUB_API_KEY") {
        if !k.is_empty() {
            providers.push(Box::new(FinnhubDividendProvider {
                api_key: k,
                http: http.clone(),
            }));
        }
    }
    if let Ok(k) = env::var("FMP_API_KEY") {
        if !k.is_empty() {
            providers.push(Box::new(FmpDividendProvider { api_key: k, http }));
        }
    }
    DividendCalendarChain::new(providers)
}

// ─── Cache helpers ──────────────────────────────────────────────

async fn read_cache(symbol: &str) -> Result<Option<Vec<UpcomingDividend>>, String> {
    let pool = get_pool().await?;
    let cutoff = chrono::Utc::now() - chrono::Duration::hours(CACHE_TTL_HOURS);
    let rows: Vec<(String, String, Option<String>, f64)> = sqlx::query_as(
        "SELECT symbol, ex_date, pay_date, amount_per_share FROM dividend_calendar_cache
         WHERE symbol = ? AND fetched_at >= ?",
    )
    .bind(symbol)
    .bind(cutoff.format("%Y-%m-%dT%H:%M:%SZ").to_string())
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    if rows.is_empty() {
        return Ok(None);
    }
    Ok(Some(
        rows.into_iter()
            .map(|r| UpcomingDividend {
                symbol: r.0,
                ex_date: r.1,
                pay_date: r.2,
                amount_per_share: r.3,
            })
            .collect(),
    ))
}

async fn write_cache(divs: &[UpcomingDividend]) -> Result<(), String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    for d in divs {
        sqlx::query(
            "INSERT OR REPLACE INTO dividend_calendar_cache
             (symbol, ex_date, pay_date, amount_per_share, fetched_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&d.symbol)
        .bind(&d.ex_date)
        .bind(&d.pay_date)
        .bind(d.amount_per_share)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_upcoming_dividends(
    symbols: Vec<String>,
    lookahead_days: Option<u32>,
) -> Result<Vec<UpcomingDividend>, String> {
    let lookahead = lookahead_days.unwrap_or(90);
    let chain = build_chain();
    let mut out: Vec<UpcomingDividend> = Vec::new();

    for sym in symbols {
        // Cache check first.
        if let Some(cached) = read_cache(&sym).await? {
            out.extend(cached);
            continue;
        }
        // Cache miss → provider chain.
        match chain.upcoming(&sym, lookahead).await {
            Ok(divs) => {
                if !divs.is_empty() {
                    write_cache(&divs).await?;
                }
                out.extend(divs);
            }
            Err(_) => {
                // Swallow per-symbol provider errors; caller sees zero rows.
                continue;
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_projected_annual_income(
    portfolio_name: String,
) -> Result<serde_json::Value, String> {
    let pool = get_pool().await?;
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(365))
        .format("%Y-%m-%d")
        .to_string();

    let rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT symbol, COALESCE(SUM(total_amount), 0) FROM dividends
         WHERE portfolio_name = ? AND ex_date >= ? GROUP BY symbol",
    )
    .bind(&portfolio_name)
    .bind(&cutoff)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut by_symbol = Vec::new();
    let mut total = 0.0;
    for (sym, sum) in rows {
        // 1:1 projection: trailing-12-month total is the projected annual.
        // Refinement (shares-adjusted) can come in 0.4.7.
        by_symbol.push(serde_json::json!({
            "symbol": sym,
            "trailing_12mo": sum,
            "projected_annual": sum,
        }));
        total += sum;
    }
    Ok(serde_json::json!({
        "portfolio_name": portfolio_name,
        "total_projected_annual": total,
        "by_symbol": by_symbol,
    }))
}
