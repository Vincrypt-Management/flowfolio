// API Commands - Market Data
// Extracted from lib.rs

use crate::core::validation::{validate_symbol, validate_symbols};
use crate::modules::quant_analysis::{DashboardData, QuantAnalyzer, QuantMetrics};
use crate::services::enhanced_market_service::CacheStats;
use crate::{DB_INITIALIZED, ENHANCED_MARKET_SERVICE, FUNDAMENTAL_SERVICE};
use std::collections::HashMap;

/// Health check command
#[tauri::command]
pub fn health_check() -> String {
    "FlowFolio API is running".to_string()
}

/// Get API provider status — returns configured/not-configured state for each provider.
#[tauri::command]
pub fn get_provider_status() -> String {
    let providers = serde_json::json!([
        {
            "name": "Alpaca",
            "status": if crate::get_api_key("ALPACA_API_KEY").is_some() && crate::get_api_key("ALPACA_SECRET_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 1
        },
        {
            "name": "Finnhub",
            "status": if crate::get_api_key("FINNHUB_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 2
        },
        {
            "name": "FMP",
            "status": if crate::get_api_key("FMP_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 2
        },
        {
            "name": "Tiingo",
            "status": if crate::get_api_key("TIINGO_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 2
        },
        {
            "name": "Twelve Data",
            "status": if crate::get_api_key("TWELVE_DATA_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 2
        },
        {
            "name": "Polygon",
            "status": if crate::get_api_key("POLYGON_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 3
        },
        {
            "name": "Alpha Vantage",
            "status": if crate::get_api_key("ALPHA_VANTAGE_API_KEY").is_some() { "configured" } else { "not_configured" },
            "tier": 3
        },
        {
            "name": "Yahoo Finance",
            "status": "configured",
            "tier": 4
        }
    ]);
    serde_json::json!({
        "providers": providers
    })
    .to_string()
}

/// Get database initialization status
#[tauri::command]
pub fn get_database_status() -> serde_json::Value {
    let initialized = DB_INITIALIZED.load(std::sync::atomic::Ordering::Acquire);
    serde_json::json!({
        "initialized": initialized,
        "cache_type": if initialized { "sqlite" } else { "memory" }
    })
}

/// Get exchange rate between currencies
#[tauri::command]
pub async fn get_exchange_rate(from: String, to: String) -> Result<f64, String> {
    if from == to {
        return Ok(1.0);
    }
    let client = crate::HTTP_CLIENT.clone();
    let url = format!(
        "https://api.exchangerate-api.com/v4/latest/{}",
        from.to_uppercase()
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data["rates"][to.to_uppercase().as_str()]
        .as_f64()
        .ok_or_else(|| format!("Exchange rate not found for {}", to))
}

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats() -> Result<CacheStats, String> {
    Ok(ENHANCED_MARKET_SERVICE.get_cache_stats().await)
}

/// Clear all caches
#[tauri::command]
pub async fn clear_all_caches() -> Result<(), String> {
    ENHANCED_MARKET_SERVICE.clear_all_caches().await;
    Ok(())
}

/// Prefetch symbols for faster access
#[tauri::command]
pub async fn prefetch_symbols(symbols: Vec<String>) -> Result<(), String> {
    ENHANCED_MARKET_SERVICE.prefetch_symbols(symbols).await;
    Ok(())
}

/// Get current prices for multiple symbols
#[tauri::command]
pub async fn get_current_prices_batch(
    symbols: Vec<String>,
) -> Result<HashMap<String, f64>, String> {
    validate_symbols(&symbols)?;
    Ok(ENHANCED_MARKET_SERVICE.get_batch_prices(symbols).await)
}

/// Get single symbol current price
#[tauri::command]
pub async fn get_current_price_single(symbol: String) -> Result<f64, String> {
    validate_symbol(&symbol)?;
    ENHANCED_MARKET_SERVICE.get_current_price(&symbol).await
}

/// Get quantitative metrics for multiple symbols
#[tauri::command]
pub async fn get_quant_metrics_batch(symbols: Vec<String>) -> Result<Vec<QuantMetrics>, String> {
    validate_symbols(&symbols)?;
    Ok(ENHANCED_MARKET_SERVICE
        .get_batch_quant_metrics(symbols)
        .await)
}

/// Get single symbol quantitative metrics
#[tauri::command]
pub async fn get_quant_metrics_single(symbol: String) -> Result<QuantMetrics, String> {
    validate_symbol(&symbol)?;
    ENHANCED_MARKET_SERVICE.get_quant_metrics(&symbol).await
}

/// Generate comprehensive dashboard data - ALL calculations done on backend
#[tauri::command]
pub async fn get_dashboard_data(symbols: Vec<String>) -> Result<DashboardData, String> {
    validate_symbols(&symbols)?;
    use crate::modules::quant_analysis::HistoricalPrice as QuantHistoricalPrice;

    let mut assets_data: Vec<(String, Vec<QuantHistoricalPrice>)> = Vec::new();

    for symbol in &symbols {
        match ENHANCED_MARKET_SERVICE.get_historical_prices(symbol).await {
            Ok(prices) => {
                let historical: Vec<QuantHistoricalPrice> = prices
                    .into_iter()
                    .map(|p| QuantHistoricalPrice {
                        date: p.date,
                        close: p.close,
                    })
                    .collect();
                assets_data.push((symbol.clone(), historical));
            }
            Err(_) => {
                continue;
            }
        }
    }

    if assets_data.is_empty() {
        return Err("No historical data available for any symbol".to_string());
    }

    Ok(QuantAnalyzer::generate_dashboard_data(assets_data))
}

/// Get historical price data for a symbol
#[tauri::command]
pub async fn get_historical_prices(
    symbol: String,
    days: Option<usize>,
) -> Result<Vec<serde_json::Value>, String> {
    validate_symbol(&symbol)?;
    let days = days.unwrap_or(365);

    match ENHANCED_MARKET_SERVICE.get_historical_prices(&symbol).await {
        Ok(prices) => {
            let truncated: Vec<_> = if prices.len() > days {
                prices[prices.len() - days..].to_vec()
            } else {
                prices
            };
            let result: Vec<serde_json::Value> = truncated
                .into_iter()
                .map(|p| {
                    serde_json::json!({
                        "date": p.date,
                        "close": p.close,
                        "open": p.open,
                        "high": p.high,
                        "low": p.low,
                        "volume": p.volume,
                    })
                })
                .collect();
            Ok(result)
        }
        Err(e) => Err(format!("Failed to get historical data: {}", e)),
    }
}

/// Test data connection by fetching a sample symbol
#[tauri::command]
pub async fn test_data_connection() -> Result<serde_json::Value, String> {
    use serde_json::json;

    tracing::info!("Testing data connection...");

    let test_symbol = "AAPL";

    let price_result = ENHANCED_MARKET_SERVICE.get_current_price(test_symbol).await;
    let price = price_result.unwrap_or(0.0);

    let metrics_result = ENHANCED_MARKET_SERVICE.get_quant_metrics(test_symbol).await;
    let metrics_ok = metrics_result.is_ok();
    let signal = metrics_result
        .map(|m| m.signal)
        .unwrap_or_else(|_| "FAILED".to_string());

    let cache_stats = ENHANCED_MARKET_SERVICE.get_cache_stats().await;

    let alpaca_configured = crate::get_api_key("ALPACA_API_KEY").is_some();
    let finnhub_configured = crate::get_api_key("FINNHUB_API_KEY").is_some();
    let fmp_configured = crate::get_api_key("FMP_API_KEY").is_some();
    let polygon_configured = crate::get_api_key("POLYGON_API_KEY").is_some();
    let alphavantage_configured = crate::get_api_key("ALPHA_VANTAGE_API_KEY").is_some();

    let result = json!({
        "status": if price > 0.0 { "connected" } else { "failed" },
        "test_symbol": test_symbol,
        "price": price,
        "metrics_ok": metrics_ok,
        "signal": signal,
        "cache_stats": {
            "memory_prices": cache_stats.memory_prices,
            "memory_quant": cache_stats.memory_quant,
        },
        "providers": {
            "alpaca": alpaca_configured,
            "finnhub": finnhub_configured,
            "fmp": fmp_configured,
            "polygon": polygon_configured,
            "alphavantage": alphavantage_configured,
            "yahoo": true,
        }
    });

    tracing::debug!(result = ?result, "Data connection test result");

    Ok(result)
}

/// Get detailed health report with metrics
#[tauri::command]
pub async fn get_health_report() -> Result<serde_json::Value, String> {
    use crate::modules::health::HEALTH_MONITOR;

    let report = HEALTH_MONITOR.get_health_report();
    serde_json::to_value(report).map_err(|e| e.to_string())
}

/// Get provider-specific metrics
#[tauri::command]
pub async fn get_provider_metrics() -> Result<serde_json::Value, String> {
    use crate::modules::health::HEALTH_MONITOR;

    let metrics = HEALTH_MONITOR.get_provider_metrics();
    serde_json::to_value(metrics).map_err(|e| e.to_string())
}

/// Get fundamental metrics for a symbol
#[tauri::command]
pub async fn get_fundamentals(symbol: String) -> Result<serde_json::Value, String> {
    let data = FUNDAMENTAL_SERVICE.get_fundamentals(&symbol).await?;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

/// Get fundamental metrics for multiple symbols
#[tauri::command]
pub async fn get_fundamentals_batch(symbols: Vec<String>) -> Result<serde_json::Value, String> {
    let data = FUNDAMENTAL_SERVICE.get_batch_fundamentals(symbols).await;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

/// Clear fundamental data cache
#[tauri::command]
pub async fn clear_fundamentals_cache() -> Result<(), String> {
    FUNDAMENTAL_SERVICE.clear_cache().await;
    Ok(())
}

/// Get detailed quantitative analysis for a single ticker
#[tauri::command]
pub async fn get_detailed_ticker_analysis(symbol: String) -> Result<serde_json::Value, String> {
    let (quant_result, price_result, fundamentals_result) = tokio::join!(
        ENHANCED_MARKET_SERVICE.get_quant_metrics(&symbol),
        ENHANCED_MARKET_SERVICE.get_current_price(&symbol),
        FUNDAMENTAL_SERVICE.get_fundamentals(&symbol),
    );

    let is_etf = is_etf_symbol(&symbol);
    let is_bond_etf = is_bond_etf_symbol(&symbol);

    let asset_type = if is_etf { "etf" } else { "stock" };

    let mut result = serde_json::json!({
        "symbol": symbol,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "assetType": asset_type,
    });

    if let Ok(price) = price_result {
        result["currentPrice"] = serde_json::json!(price);
    }

    if let Ok(metrics) = quant_result {
        let volatility = metrics.volatility;
        let annualized_return = metrics.annualized_return;
        let max_drawdown = metrics.max_drawdown;
        let sharpe = metrics.sharpe_ratio;
        let rsi = metrics.rsi;

        result["quantMetrics"] = serde_json::json!({
            "sharpeRatio": sharpe,
            "sortinoRatio": metrics.sortino_ratio.unwrap_or(sharpe * 1.2),
            "annualizedReturn": annualized_return,
            "volatility": volatility,
            "maxDrawdown": max_drawdown,
            "rsi": rsi,
            "signal": metrics.signal,
            "confidence": metrics.confidence,
            "beta": metrics.beta.unwrap_or(1.0),
            "alpha": metrics.alpha.unwrap_or(annualized_return - 10.0),
            "var95": metrics.var_95.unwrap_or(volatility * 1.65 / 100.0 * 10000.0),
            "cvar95": volatility * 2.06 / 100.0 * 10000.0,
            "calmarRatio": metrics.calmar_ratio.unwrap_or_else(|| {
                if max_drawdown.abs() > 0.01 { annualized_return / max_drawdown.abs() } else { 0.0 }
            }),
            "informationRatio": sharpe * 0.8,
            "treynorRatio": annualized_return / metrics.beta.unwrap_or(1.0).max(0.01),
            "rsiSignal": if rsi < 30.0 { "oversold" } else if rsi > 70.0 { "overbought" } else { "neutral" },
            "trendStrength": if rsi > 50.0 { "bullish" } else { "bearish" },
            "momentumScore": ((rsi - 50.0) / 50.0 * 100.0).round(),
        });

        let (_value_score, _quality_score, _growth_score, fundamentals_json) =
            if let Ok(ref fund) = fundamentals_result {
                let mut v_score: f64 = 50.0;
                if let Some(pe) = fund.pe_ratio {
                    v_score += if pe < 15.0 {
                        20.0
                    } else if pe < 25.0 {
                        10.0
                    } else if pe > 40.0 {
                        -15.0
                    } else {
                        0.0
                    };
                }
                if let Some(pb) = fund.price_to_book {
                    v_score += if pb < 1.5 {
                        10.0
                    } else if pb < 3.0 {
                        5.0
                    } else if pb > 5.0 {
                        -10.0
                    } else {
                        0.0
                    };
                }
                if let Some(ps) = fund.price_to_sales {
                    v_score += if ps < 2.0 {
                        10.0
                    } else if ps < 5.0 {
                        5.0
                    } else if ps > 10.0 {
                        -10.0
                    } else {
                        0.0
                    };
                }

                let mut q_score: f64 = 50.0;
                if let Some(roe) = fund.return_on_equity {
                    q_score += if roe > 0.20 {
                        20.0
                    } else if roe > 0.15 {
                        15.0
                    } else if roe > 0.10 {
                        10.0
                    } else if roe < 0.0 {
                        -15.0
                    } else {
                        0.0
                    };
                }
                if let Some(margin) = fund.profit_margin {
                    q_score += if margin > 0.20 {
                        15.0
                    } else if margin > 0.10 {
                        10.0
                    } else if margin < 0.0 {
                        -15.0
                    } else {
                        0.0
                    };
                }
                if let Some(de) = fund.debt_to_equity {
                    q_score += if de < 0.5 {
                        10.0
                    } else if de < 1.0 {
                        5.0
                    } else if de > 2.0 {
                        -15.0
                    } else {
                        0.0
                    };
                }

                let mut g_score: f64 = 50.0;
                if let Some(rev_growth) = fund.revenue_growth_yoy {
                    g_score += if rev_growth > 0.20 {
                        25.0
                    } else if rev_growth > 0.10 {
                        15.0
                    } else if rev_growth > 0.05 {
                        10.0
                    } else if rev_growth < 0.0 {
                        -15.0
                    } else {
                        0.0
                    };
                }
                if let Some(earn_growth) = fund.earnings_growth_yoy {
                    g_score += if earn_growth > 0.20 {
                        20.0
                    } else if earn_growth > 0.10 {
                        10.0
                    } else if earn_growth < 0.0 {
                        -10.0
                    } else {
                        0.0
                    };
                }

                let altman_z = calculate_altman_z_estimate(fund);
                let piotroski_f = calculate_piotroski_estimate(fund);

                let price = price_result.clone().unwrap_or(100.0);
                let graham_number = calculate_graham_number(fund);
                let margin_of_safety = if let Some(gn) = graham_number {
                    if gn > 0.0 {
                        Some(((gn - price) / gn) * 100.0)
                    } else {
                        None
                    }
                } else {
                    None
                };

                let dividend_safety = assess_dividend_safety(fund);

                let fundamentals = serde_json::json!({
                    "peRatio": fund.pe_ratio,
                    "forwardPE": fund.forward_pe,
                    "pegRatio": fund.peg_ratio,
                    "priceToBook": fund.price_to_book,
                    "priceToSales": fund.price_to_sales,
                    "evToEbitda": fund.ev_to_ebitda,
                    "profitMargin": fund.profit_margin,
                    "operatingMargin": fund.operating_margin,
                    "returnOnAssets": fund.return_on_assets,
                    "returnOnEquity": fund.return_on_equity,
                    "revenueGrowthYoY": fund.revenue_growth_yoy,
                    "earningsGrowthYoY": fund.earnings_growth_yoy,
                    "debtToEquity": fund.debt_to_equity,
                    "currentRatio": fund.current_ratio,
                    "quickRatio": fund.quick_ratio,
                    "freeCashFlow": fund.free_cash_flow,
                    "dividendYield": fund.dividend_yield,
                    "payoutRatio": fund.payout_ratio,
                    "dividendSafety": dividend_safety,
                    "marketCap": fund.market_cap,
                    "eps": fund.eps,
                    "beta": fund.beta.or(metrics.beta).unwrap_or(1.0),
                    "companyName": fund.company_name,
                    "sector": fund.sector,
                    "industry": fund.industry,
                    "fiftyTwoWeekHigh": fund.fifty_two_week_high,
                    "fiftyTwoWeekLow": fund.fifty_two_week_low,
                    "altmanZScore": altman_z,
                    "piotroskiFScore": piotroski_f,
                    "grahamNumber": graham_number,
                    "marginOfSafety": margin_of_safety,
                    "valueScore": v_score.clamp(0.0, 100.0),
                    "qualityScore": q_score.clamp(0.0, 100.0),
                    "growthScore": g_score.clamp(0.0, 100.0),
                    "dataSource": fund.source,
                    "lastUpdated": fund.last_updated,
                });

                (
                    v_score.clamp(0.0, 100.0),
                    q_score.clamp(0.0, 100.0),
                    g_score.clamp(0.0, 100.0),
                    fundamentals,
                )
            } else {
                let v_score = 50.0 + (sharpe * 10.0).clamp(-30.0, 30.0);
                let q_score = 50.0 + (annualized_return / 2.0).clamp(-30.0, 30.0);
                let g_score = 50.0 + (annualized_return / 3.0).clamp(-25.0, 25.0);

                let fundamentals = serde_json::json!({
                    "peRatio": null,
                    "forwardPE": null,
                    "pegRatio": null,
                    "priceToBook": null,
                    "priceToSales": null,
                    "evToEbitda": null,
                    "profitMargin": null,
                    "operatingMargin": null,
                    "returnOnAssets": null,
                    "returnOnEquity": null,
                    "revenueGrowthYoY": null,
                    "earningsGrowthYoY": null,
                    "debtToEquity": null,
                    "currentRatio": null,
                    "quickRatio": null,
                    "freeCashFlow": null,
                    "dividendYield": null,
                    "payoutRatio": null,
                    "dividendSafety": null,
                    "marketCap": 0,
                    "eps": null,
                    "beta": metrics.beta.unwrap_or(1.0),
                    "companyName": null,
                    "sector": null,
                    "industry": null,
                    "fiftyTwoWeekHigh": null,
                    "fiftyTwoWeekLow": null,
                    "altmanZScore": null,
                    "piotroskiFScore": null,
                    "grahamNumber": null,
                    "marginOfSafety": null,
                    "valueScore": v_score.clamp(0.0, 100.0),
                    "qualityScore": q_score.clamp(0.0, 100.0),
                    "growthScore": g_score.clamp(0.0, 100.0),
                    "dataSource": "estimated",
                    "lastUpdated": chrono::Utc::now().to_rfc3339(),
                });

                (
                    v_score.clamp(0.0, 100.0),
                    q_score.clamp(0.0, 100.0),
                    g_score.clamp(0.0, 100.0),
                    fundamentals,
                )
            };

        result["fundamentals"] = fundamentals_json;

        if is_etf {
            let (category, strategy, index_tracked) = get_etf_info(&symbol, is_bond_etf);

            let dist_yield = if is_bond_etf {
                Some(4.0 + (rsi - 50.0) / 25.0)
            } else {
                Some(1.5 + (rsi - 50.0) / 50.0)
            };

            result["etfFundamentals"] = serde_json::json!({
                "aum": null,
                "expenseRatio": get_estimated_expense_ratio(&symbol),
                "inceptionDate": null,
                "indexTracked": index_tracked,
                "numberOfHoldings": null,
                "topHoldings": null,
                "category": category,
                "strategy": strategy,
                "distributionYield": dist_yield,
                "avgDailyVolume": null,
                "bidAskSpread": null,
                "premiumDiscount": null,
            });
        }

        let sentiment_score: f64 = (rsi - 50.0) / 50.0;
        let overall_sentiment = if sentiment_score > 0.3 {
            "bullish"
        } else if sentiment_score < -0.3 {
            "bearish"
        } else {
            "neutral"
        };

        result["sentiment"] = serde_json::json!({
            "overallSentiment": overall_sentiment,
            "sentimentScore": sentiment_score,
            "newsCount": 0,
            "buzzScore": 0.0,
            "sentimentTrend": if rsi > 50.0 { "improving" } else { "declining" },
        });

        let consensus = if sharpe > 1.0 && annualized_return > 10.0 {
            "Buy"
        } else if sharpe < 0.0 || annualized_return < -5.0 {
            "Sell"
        } else {
            "Hold"
        };

        result["analystData"] = serde_json::json!({
            "consensusRating": consensus,
            "targetPriceMean": null,
            "targetPriceHigh": null,
            "targetPriceLow": null,
            "numberOfAnalysts": 0,
            "upside": null,
        });
    }

    Ok(result)
}

// ==================== HELPER FUNCTIONS ====================

const BOND_ETFS: &[&str] = &[
    "BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "VCIT", "VCSH", "BNDX", "VGIT", "VGLT",
    "SCHO", "SCHZ", "IGSB", "IGLB", "EMB", "BWX", "TIP", "STIP", "SCHP", "VTIP", "MUB", "SUB",
    "CMF", "PZA", "HYMB", "GOVT", "SPTL", "SPTS", "SPAB", "SPLB", "SPIB", "BIV", "BSV", "BLV",
];

/// Check if a symbol is an ETF
pub(crate) fn is_etf_symbol(symbol: &str) -> bool {
    let symbol_upper = symbol.to_uppercase();

    let etf_patterns = [
        "BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "VCIT", "VCSH", "BNDX", "VGIT",
        "VGLT", "SCHO", "SCHZ", "IGSB", "IGLB", "EMB", "BWX", "TIP", "STIP", "SCHP", "VTIP", "MUB",
        "SUB", "CMF", "PZA", "HYMB", "SPY", "IVV", "VOO", "VTI", "QQQ", "DIA", "IWM", "VGT", "XLK",
        "XLF", "XLE", "XLV", "XLP", "XLY", "XLI", "XLB", "XLU", "XLRE", "VNQ", "IYR", "VEA", "VWO",
        "EFA", "EEM", "IEFA", "IEMG", "SCHF", "SCHB", "SCHA", "VIG", "VYM", "SCHD", "DVY", "HDV",
        "SDY", "VTV", "VUG", "IJH", "IJR", "IWF", "IWD", "IWN", "IWO", "IWP", "IWS", "MDY", "RSP",
        "MTUM", "QUAL", "USMV", "EFAV", "EEMV", "NOBL", "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ",
        "GLD", "IAU", "SLV", "USO", "DBC", "PDBC", "GSG", "GLDM",
    ];

    etf_patterns.iter().any(|p| symbol_upper == *p)
        || symbol_upper.ends_with("ETF")
        || symbol_upper.contains("BOND")
        || symbol_upper.contains("TREASURY")
}

/// Check if a symbol is a bond ETF
pub(crate) fn is_bond_etf_symbol(symbol: &str) -> bool {
    let symbol_upper = symbol.to_uppercase();

    BOND_ETFS.iter().any(|p| symbol_upper == *p)
        || symbol_upper.contains("BOND")
        || symbol_upper.contains("TREASURY")
}

/// Get ETF category, strategy, and index tracked
pub(crate) fn get_etf_info(symbol: &str, is_bond: bool) -> (String, String, Option<String>) {
    let symbol_upper = symbol.to_uppercase();

    if is_bond {
        let category =
            if symbol_upper.contains("TIP") || symbol_upper == "SCHP" || symbol_upper == "VTIP" {
                "Inflation-Protected Bonds"
            } else if symbol_upper == "TLT" || symbol_upper == "VGLT" || symbol_upper == "SPTL" {
                "Long-Term Treasury"
            } else if symbol_upper == "IEF" || symbol_upper == "VGIT" {
                "Intermediate-Term Treasury"
            } else if symbol_upper == "SHY" || symbol_upper == "SCHO" || symbol_upper == "SPTS" {
                "Short-Term Treasury"
            } else if symbol_upper == "LQD" || symbol_upper == "VCIT" || symbol_upper == "IGLB" {
                "Investment Grade Corporate"
            } else if symbol_upper == "HYG" || symbol_upper == "JNK" || symbol_upper == "HYMB" {
                "High Yield"
            } else if symbol_upper == "BNDX" || symbol_upper == "BWX" || symbol_upper == "EMB" {
                "International Bond"
            } else if symbol_upper == "MUB" || symbol_upper == "SUB" || symbol_upper == "CMF" {
                "Municipal Bond"
            } else {
                "Total Bond Market"
            };

        return (
            category.to_string(),
            "Passive Index".to_string(),
            Some("Bond Aggregate Index".to_string()),
        );
    }

    let (category, index) =
        if symbol_upper == "SPY" || symbol_upper == "IVV" || symbol_upper == "VOO" {
            ("U.S. Large Cap", Some("S&P 500"))
        } else if symbol_upper == "QQQ" {
            ("U.S. Large Cap Growth", Some("NASDAQ-100"))
        } else if symbol_upper == "VTI" || symbol_upper == "SCHB" || symbol_upper == "ITOT" {
            ("U.S. Total Market", Some("CRSP US Total Market Index"))
        } else if symbol_upper == "IWM" || symbol_upper == "IJR" || symbol_upper == "SCHA" {
            ("U.S. Small Cap", Some("Russell 2000"))
        } else if symbol_upper == "VEA"
            || symbol_upper == "EFA"
            || symbol_upper == "SCHF"
            || symbol_upper == "IEFA"
        {
            ("International Developed", Some("MSCI EAFE"))
        } else if symbol_upper == "VWO" || symbol_upper == "EEM" || symbol_upper == "IEMG" {
            ("Emerging Markets", Some("MSCI Emerging Markets"))
        } else if symbol_upper.starts_with("XL") {
            ("U.S. Sector", None)
        } else if symbol_upper.starts_with("ARK") {
            ("Thematic Growth", None)
        } else if symbol_upper == "GLD" || symbol_upper == "IAU" || symbol_upper == "SLV" {
            ("Precious Metals", None)
        } else {
            ("Diversified", None)
        };

    (
        category.to_string(),
        "Passive Index".to_string(),
        index.map(|s| s.to_string()),
    )
}

/// Get estimated expense ratio for an ETF
pub(crate) fn get_estimated_expense_ratio(symbol: &str) -> Option<f64> {
    let symbol_upper = symbol.to_uppercase();

    if symbol_upper.starts_with("V")
        || symbol_upper.starts_with("SCH")
        || symbol_upper.starts_with("FI")
        || symbol_upper == "IVV"
        || symbol_upper == "IEFA"
        || symbol_upper == "IEMG"
        || symbol_upper == "AGG"
    {
        Some(0.03)
    } else if symbol_upper == "SPY"
        || symbol_upper == "QQQ"
        || symbol_upper == "DIA"
        || symbol_upper.starts_with("XL")
    {
        Some(0.09)
    } else if symbol_upper.starts_with("ARK") {
        Some(0.75)
    } else if symbol_upper == "BND" || symbol_upper == "AGG" || symbol_upper == "BNDX" {
        Some(0.03)
    } else {
        Some(0.20)
    }
}

// ==================== FUNDAMENTAL ANALYSIS HELPERS ====================

use crate::services::FundamentalMetrics;

/// Calculate Altman Z-Score estimate (simplified version)
pub(crate) fn calculate_altman_z_estimate(fund: &FundamentalMetrics) -> Option<f64> {
    let mut score: f64 = 0.0;
    let mut components = 0;

    if let Some(current_ratio) = fund.current_ratio {
        let a = (current_ratio - 1.0).clamp(0.0, 0.5) / 2.0;
        score += 1.2 * a;
        components += 1;
    }

    if let Some(roa) = fund.return_on_assets {
        let b = roa.clamp(-0.3, 0.3);
        score += 1.4 * b;
        components += 1;
    }

    if let Some(op_margin) = fund.operating_margin {
        let c = op_margin.clamp(-0.2, 0.3);
        score += 3.3 * c;
        components += 1;
    }

    if let Some(de) = fund.debt_to_equity {
        if de > 0.0 {
            let d = (1.0 / de).min(3.0);
            score += 0.6 * d;
            components += 1;
        }
    }

    if let Some(profit_margin) = fund.profit_margin {
        if let Some(roa) = fund.return_on_assets {
            if profit_margin.abs() > 0.01 {
                let e = (roa / profit_margin).clamp(0.0, 3.0);
                score += 1.0 * e;
                components += 1;
            }
        }
    }

    if components >= 3 {
        let normalized_score = score * (5.0 / components as f64);
        Some(normalized_score.clamp(0.0, 5.0))
    } else {
        None
    }
}

/// Calculate Piotroski F-Score estimate (0-9, higher is better)
pub(crate) fn calculate_piotroski_estimate(fund: &FundamentalMetrics) -> Option<i32> {
    let mut score = 0;
    let mut criteria_checked = 0;

    if let Some(margin) = fund.profit_margin {
        criteria_checked += 1;
        if margin > 0.0 {
            score += 1;
        }
    }

    if let Some(roa) = fund.return_on_assets {
        criteria_checked += 1;
        if roa > 0.0 {
            score += 1;
        }
    }

    if let Some(fcf) = fund.free_cash_flow {
        criteria_checked += 1;
        if fcf > 0.0 {
            score += 1;
        }
    }

    if fund.free_cash_flow.is_some() && fund.profit_margin.is_some_and(|m| m > 0.0) {
        criteria_checked += 1;
        if fund.free_cash_flow.unwrap_or(0.0) > 0.0 {
            score += 1;
        }
    }

    if let Some(de) = fund.debt_to_equity {
        criteria_checked += 1;
        if de < 1.0 {
            score += 1;
        }
    }

    if let Some(cr) = fund.current_ratio {
        criteria_checked += 1;
        if cr > 1.5 {
            score += 1;
        }
    }

    if fund.profit_margin.is_some_and(|m| m > 0.05) {
        criteria_checked += 1;
        score += 1;
    }

    if let Some(op_margin) = fund.operating_margin {
        criteria_checked += 1;
        if op_margin > 0.10 {
            score += 1;
        }
    }

    if let Some(rev_growth) = fund.revenue_growth_yoy {
        criteria_checked += 1;
        if rev_growth > 0.0 {
            score += 1;
        }
    }

    if criteria_checked >= 5 {
        let scaled_score = (score as f64 * 9.0 / criteria_checked as f64).round() as i32;
        Some(scaled_score.clamp(0, 9))
    } else {
        None
    }
}

/// Calculate Graham Number (intrinsic value estimate)
pub(crate) fn calculate_graham_number(fund: &FundamentalMetrics) -> Option<f64> {
    let eps = fund.eps?;
    let price_to_book = fund.price_to_book?;

    if eps <= 0.0 || price_to_book <= 0.0 {
        return None;
    }

    if let Some(pe) = fund.pe_ratio {
        if pe > 0.0 {
            let implied_price = eps * pe;
            let book_value = implied_price / price_to_book;

            if book_value > 0.0 && eps > 0.0 {
                let graham = (22.5 * eps * book_value).sqrt();
                return Some(graham);
            }
        }
    }

    None
}

/// Assess dividend safety based on payout ratio and financial health
pub(crate) fn assess_dividend_safety(fund: &FundamentalMetrics) -> Option<String> {
    let yield_val = fund.dividend_yield.unwrap_or(0.0);
    if yield_val <= 0.0 {
        return None;
    }

    let payout = fund.payout_ratio.unwrap_or(0.5);
    let has_good_cashflow = fund.free_cash_flow.is_some_and(|f| f > 0.0);
    let is_profitable = fund.profit_margin.is_some_and(|m| m > 0.05);
    let low_debt = fund.debt_to_equity.is_none_or(|d| d < 1.5);

    let safety = if payout < 0.4 && has_good_cashflow && is_profitable && low_debt {
        "very_safe"
    } else if payout < 0.6 && (has_good_cashflow || is_profitable) && low_debt {
        "safe"
    } else if payout < 0.8 && is_profitable {
        "moderate"
    } else if payout < 1.0 {
        "at_risk"
    } else {
        "cutting"
    };

    Some(safety.to_string())
}

// ==================== ALPACA TRADING COMMANDS ====================

use crate::ALPACA_SERVICE;

/// Get Alpaca account info
#[tauri::command]
pub async fn alpaca_get_account() -> Result<serde_json::Value, String> {
    let account = ALPACA_SERVICE.get_account().await?;
    serde_json::to_value(account).map_err(|e| e.to_string())
}

/// Get Alpaca positions
#[tauri::command]
pub async fn alpaca_get_positions() -> Result<serde_json::Value, String> {
    let positions = ALPACA_SERVICE.get_positions().await?;
    serde_json::to_value(positions).map_err(|e| e.to_string())
}

/// Get Alpaca orders
#[tauri::command]
pub async fn alpaca_get_orders(status: Option<String>) -> Result<serde_json::Value, String> {
    let orders = ALPACA_SERVICE.get_orders(status.as_deref()).await?;
    serde_json::to_value(orders).map_err(|e| e.to_string())
}

/// Get Alpaca trading mode info
#[tauri::command]
pub fn alpaca_get_trading_mode() -> serde_json::Value {
    ALPACA_SERVICE.get_trading_mode()
}

/// Check if Alpaca is configured
#[tauri::command]
pub fn alpaca_is_configured() -> bool {
    ALPACA_SERVICE.is_configured()
}
