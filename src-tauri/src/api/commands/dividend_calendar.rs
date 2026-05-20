use crate::get_pool;
use crate::modules::dividend_calendar::{
    DividendCalendarChain, DividendCalendarProvider, UpcomingDividend, EMPTY_SENTINEL_EX_DATE,
};
use futures::stream::{self, StreamExt};
use serde::Deserialize;
use std::env;

const CACHE_CONCURRENCY: usize = 5;

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
            "https://finnhub.io/api/v1/stock/dividend?symbol={}&from={}&to={}",
            symbol,
            today.format("%Y-%m-%d"),
            until.format("%Y-%m-%d"),
        );
        let resp = self
            .http
            .get(&url)
            .header("X-Finnhub-Token", &self.api_key)
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
                    shares_held: None,
                    projected_payout: None,
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

fn scrub_fmp_err(e: reqwest::Error) -> String {
    let raw = e.to_string();
    if raw.contains("apikey=") {
        let status = e
            .status()
            .map(|s| s.as_u16().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        format!("FMP request failed: status={}", status)
    } else {
        raw
    }
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
        let resp = self.http.get(&url).send().await.map_err(scrub_fmp_err)?;
        if !resp.status().is_success() {
            return Err(format!("fmp http {}", resp.status()));
        }
        #[derive(Deserialize)]
        struct FmpEnvelope {
            symbol: String,
            historical: Vec<FmpDividendRow>,
        }
        let env: FmpEnvelope = resp.json().await.map_err(scrub_fmp_err)?;
        Ok(env
            .historical
            .into_iter()
            .filter_map(|r| {
                Some(UpcomingDividend {
                    symbol: env.symbol.clone(),
                    ex_date: r.date?,
                    pay_date: r.payment_date,
                    amount_per_share: r.dividend.unwrap_or(0.0),
                    shares_held: None,
                    projected_payout: None,
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

const NON_EMPTY_TTL_HOURS: i64 = 24;
const EMPTY_TTL_HOURS: i64 = 6;

/// Returns Some(rows) on cache hit (empty Vec == negative-cache hit), None on miss.
async fn read_cache(symbol: &str) -> Result<Option<Vec<UpcomingDividend>>, String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now();
    let non_empty_cutoff = (now - chrono::Duration::hours(NON_EMPTY_TTL_HOURS))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let empty_cutoff = (now - chrono::Duration::hours(EMPTY_TTL_HOURS))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    // Negative-cache check first: a fresh sentinel row means provider returned empty recently.
    let sentinel: Option<(String,)> = sqlx::query_as(
        "SELECT symbol FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date = ? AND fetched_at >= ?",
    )
    .bind(symbol)
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&empty_cutoff)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;
    if sentinel.is_some() {
        return Ok(Some(Vec::new()));
    }

    let rows: Vec<(String, String, Option<String>, f64)> = sqlx::query_as(
        "SELECT symbol, ex_date, pay_date, amount_per_share FROM dividend_calendar_cache
         WHERE symbol = ? AND ex_date != ? AND fetched_at >= ?",
    )
    .bind(symbol)
    .bind(EMPTY_SENTINEL_EX_DATE)
    .bind(&non_empty_cutoff)
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
                shares_held: None,
                projected_payout: None,
            })
            .collect(),
    ))
}

async fn write_cache(symbol: &str, divs: &[UpcomingDividend]) -> Result<(), String> {
    let pool = get_pool().await?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    if divs.is_empty() {
        // Negative cache: drop any stale sentinel and write a fresh one.
        sqlx::query(
            "INSERT OR REPLACE INTO dividend_calendar_cache
             (symbol, ex_date, pay_date, amount_per_share, fetched_at) VALUES (?, ?, NULL, 0, ?)",
        )
        .bind(symbol)
        .bind(EMPTY_SENTINEL_EX_DATE)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Non-empty payload: clear any prior sentinel so it doesn't shadow real rows.
    sqlx::query("DELETE FROM dividend_calendar_cache WHERE symbol = ? AND ex_date = ?")
        .bind(symbol)
        .bind(EMPTY_SENTINEL_EX_DATE)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

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

/// Fetches dividends for one symbol with cache-first + provider-chain fallback.
async fn fetch_one_with_cache(
    symbol: String,
    chain: &DividendCalendarChain,
    lookahead: u32,
) -> Vec<UpcomingDividend> {
    if let Ok(Some(cached)) = read_cache(&symbol).await {
        return cached;
    }
    match chain.upcoming(&symbol, lookahead).await {
        Ok(divs) => {
            let _ = write_cache(&symbol, &divs).await;
            divs
        }
        Err(_) => Vec::new(), // swallow per-symbol errors; caller sees zero rows
    }
}

/// Optional join: returns shares-held per symbol from open tax lots for the given portfolio.
/// Symbols not present in the map are simply absent (frontend treats as None).
async fn shares_held_by_symbol(
    portfolio_name: Option<&str>,
) -> std::collections::HashMap<String, f64> {
    let mut map = std::collections::HashMap::new();
    let Some(name) = portfolio_name else {
        return map;
    };
    let Ok(pool) = get_pool().await else {
        return map;
    };
    let rows: Result<Vec<(String, f64)>, _> = sqlx::query_as(
        "SELECT symbol, COALESCE(SUM(shares), 0) FROM tax_lots
         WHERE portfolio_name = ? AND is_closed = 0
         GROUP BY symbol",
    )
    .bind(name)
    .fetch_all(&pool)
    .await;
    if let Ok(rows) = rows {
        for (sym, shares) in rows {
            map.insert(sym, shares);
        }
    }
    map
}

#[tauri::command]
pub async fn get_upcoming_dividends(
    symbols: Vec<String>,
    lookahead_days: Option<u32>,
    portfolio_name: Option<String>,
) -> Result<Vec<UpcomingDividend>, String> {
    let lookahead = lookahead_days.unwrap_or(90);
    let chain = build_chain();
    let shares_map = shares_held_by_symbol(portfolio_name.as_deref()).await;

    let chain_ref = &chain;
    let results: Vec<Vec<UpcomingDividend>> = stream::iter(symbols.into_iter())
        .map(|sym| async move { fetch_one_with_cache(sym, chain_ref, lookahead).await })
        .buffer_unordered(CACHE_CONCURRENCY)
        .collect()
        .await;

    let mut out: Vec<UpcomingDividend> = Vec::new();
    for batch in results {
        for mut d in batch {
            if let Some(&shares) = shares_map.get(&d.symbol) {
                d.shares_held = Some(shares);
                d.projected_payout = Some(d.amount_per_share * shares);
            }
            out.push(d);
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

    // Trailing 12-month per-share total + per-event count per symbol.
    let per_share_rows: Vec<(String, f64, f64)> = sqlx::query_as(
        "SELECT symbol,
                COALESCE(SUM(amount_per_share), 0) AS trailing_per_share,
                COALESCE(SUM(total_amount), 0)     AS trailing_12mo
         FROM dividends
         WHERE portfolio_name = ? AND ex_date >= ?
         GROUP BY symbol",
    )
    .bind(&portfolio_name)
    .bind(&cutoff)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Current shares from open tax lots.
    let shares_rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT symbol, COALESCE(SUM(shares), 0) FROM tax_lots
         WHERE portfolio_name = ? AND is_closed = 0
         GROUP BY symbol",
    )
    .bind(&portfolio_name)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    let shares_map: std::collections::HashMap<String, f64> = shares_rows.into_iter().collect();

    let mut by_symbol = Vec::new();
    let mut total = 0.0;
    for (sym, trailing_per_share, trailing_12mo) in per_share_rows {
        let current_shares = shares_map.get(&sym).copied().unwrap_or(0.0);
        // Shares-adjusted projection: trailing per-share * current shares.
        let projected_annual = trailing_per_share * current_shares;
        by_symbol.push(serde_json::json!({
            "symbol": sym,
            "trailing_12mo": trailing_12mo,
            "trailing_per_share": trailing_per_share,
            "current_shares": current_shares,
            "projected_annual": projected_annual,
        }));
        total += projected_annual;
    }
    Ok(serde_json::json!({
        "portfolio_name": portfolio_name,
        "total_projected_annual": total,
        "by_symbol": by_symbol,
    }))
}
