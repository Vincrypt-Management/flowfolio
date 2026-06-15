// FlowFolio - Industrial Grade Investment Management
//
// Architecture:
// - core/     : Configuration, errors, logging
// - infrastructure/: HTTP, cache, database, resilience
// - api/      : Tauri command handlers
// - modules/  : Feature modules (data_provider, scoring, backtest, portfolio, etc.)
// - services/ : Service layer

pub mod api;
pub mod core;
pub mod infrastructure;
pub mod modules;
mod services;
mod shared_types;

use api::commands::*;

pub use shared_types::*;

use modules::plan_compiler::VibePlanScript;
use parking_lot::RwLock;
use services::{
    AlpacaService, EnhancedMarketDataService, FundamentalDataService, OpenRouterService,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

// ==================== GLOBAL STATE ====================

use once_cell::sync::Lazy;

pub(crate) static ENHANCED_MARKET_SERVICE: Lazy<Arc<EnhancedMarketDataService>> =
    Lazy::new(|| Arc::new(EnhancedMarketDataService::new_without_db()));

pub(crate) static OPENROUTER_SERVICE: Lazy<Arc<OpenRouterService>> =
    Lazy::new(|| Arc::new(OpenRouterService::new()));

pub(crate) static ALPACA_SERVICE: Lazy<Arc<AlpacaService>> =
    Lazy::new(|| Arc::new(AlpacaService::new()));

pub(crate) static FUNDAMENTAL_SERVICE: Lazy<Arc<FundamentalDataService>> =
    Lazy::new(|| Arc::new(FundamentalDataService::new()));

/// Runtime-mutable API key store. Keys saved via SettingsPage are written here
/// and take priority over environment variables. Updated at startup and on save.
pub(crate) static RUNTIME_KEYS: Lazy<Arc<RwLock<HashMap<String, String>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

pub(crate) static DB_INITIALIZED: Lazy<Arc<std::sync::atomic::AtomicBool>> =
    Lazy::new(|| Arc::new(std::sync::atomic::AtomicBool::new(false)));

pub(crate) static DB_POOL: Lazy<Arc<Mutex<Option<sqlx::Pool<sqlx::Sqlite>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

// In-memory plan storage
pub(crate) static SAVED_PLANS: Lazy<Arc<Mutex<HashMap<String, VibePlanScript>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Shared HTTP client — clone is cheap (shares the connection pool).
/// Note: SSE streaming uses its own client with gzip/brotli disabled because
/// reqwest's decompressors fail on partial body chunks. Regular JSON calls
/// keep gzip enabled for efficient payloads.
pub(crate) static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("Failed to create shared HTTP client")
});

/// Whether the Stronghold vault is currently unlocked.
pub(crate) static VAULT_UNLOCKED: AtomicBool = AtomicBool::new(false);

/// Name of the Stronghold vault file stored in the app data directory.
pub(crate) const STRONGHOLD_VAULT: &str = "flowfolio-vault.hold";

pub(crate) const API_KEYS_STORE: &str = "api-keys.json";
pub(crate) const API_KEY_NAMES: &[&str] = &[
    "alpaca_key",
    "alpaca_secret",
    "finnhub_key",
    "fmp_key",
    "tiingo_key",
    "twelve_data_key",
    "polygon_key",
    "alpha_vantage_key",
    "openrouter_key",
];

// ==================== HELPER FUNCTIONS ====================

/// Get an API key, checking RUNTIME_KEYS first, then falling back to get_env_var().
/// Use this everywhere instead of get_env_var() for user-configurable API keys.
pub(crate) fn get_api_key(key: &str) -> Option<String> {
    {
        let guard = RUNTIME_KEYS.read();
        if let Some(val) = guard.get(key) {
            if !val.is_empty() {
                return Some(val.clone());
            }
        }
    }
    crate::core::encrypted_env::get_env_var(key)
}

pub(crate) async fn get_pool() -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    let pool = DB_POOL.lock().await;
    pool.clone()
        .ok_or_else(|| "Database not initialized".to_string())
}

pub(crate) async fn get_user_tier() -> String {
    if let Some(pool) = DB_POOL.lock().await.as_ref() {
        if let Ok(Some(row)) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM user_settings WHERE key = 'subscription_tier'",
        )
        .fetch_optional(pool)
        .await
        {
            return row;
        }
    }
    "pro".to_string()
}

// ==================== DATABASE INITIALIZATION ====================

/// Initialize local SQLite database for caching
async fn init_local_database(app_data_dir: PathBuf) -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let db_path = app_data_dir.join("flowfolio_cache.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    tracing::info!(path = %db_path.display(), "Initializing local cache database");

    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| format!("Invalid database URL: {}", e))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Run versioned migrations
    crate::infrastructure::database::migrations::run_migrations(&pool).await?;

    tracing::info!("Local cache database initialized successfully");

    Ok(pool)
}

/// Initialize the enhanced market service with database
async fn init_market_service_with_db(pool: sqlx::Pool<sqlx::Sqlite>) {
    ENHANCED_MARKET_SERVICE.set_db_pool(pool.clone()).await;
    OPENROUTER_SERVICE.set_db_pool(pool.clone()).await;
    let mut db = DB_POOL.lock().await;
    *db = Some(pool);
    DB_INITIALIZED.store(true, std::sync::atomic::Ordering::Release);
    tracing::info!("Enhanced market service + OpenRouter cache initialized with database");
}

// ==================== APP ENTRY POINT ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("flowfolio=info,warn")),
        )
        .with_target(true)
        .try_init();

    #[cfg(debug_assertions)]
    {
        tracing::info!(target: "app", "FlowFolio starting in DEBUG mode");
        tracing::info!(target: "app", "Industrial-grade features enabled:");
        tracing::info!(target: "app", "  - Circuit breaker pattern");
        tracing::info!(target: "app", "  - Retry with exponential backoff");
        tracing::info!(target: "app", "  - Health monitoring and metrics");
        tracing::info!(target: "app", "  - Multi-tier caching");
        tracing::info!(target: "app", "  - Live progress streaming");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_default_plan,
            list_templates,
            get_template,
            compile_plan,
            validate_plan,
            get_provider_status,
            get_scoring_config,
            score_symbols_batch,
            create_equal_weight_allocation,
            create_score_weighted_allocation,
            generate_monthly_buy_list,
            check_portfolio_rebalance,
            generate_yearly_review,
            generate_optimization_report,
            generate_optimization_report_live,
            run_backtest_simulation,
            create_journal_entry,
            log_strategy_change,
            log_trade_decision,
            log_rebalance_event,
            log_review_event,
            compare_plan_versions,
            filter_journal_entries,
            calculate_journal_stats,
            export_journal_markdown,
            get_quant_metrics_batch,
            get_dashboard_data,
            get_current_prices_batch,
            get_current_quotes_batch,
            get_quant_metrics_single,
            get_current_price_single,
            get_cache_stats,
            clear_all_caches,
            prefetch_symbols,
            test_data_connection,
            get_health_report,
            get_provider_metrics,
            // Universe & Watchlist
            create_universe,
            list_universes,
            get_universe,
            update_universe_symbols,
            add_to_exclude_list,
            delete_universe,
            // Export / Import
            export_data_bundle,
            import_data_bundle,
            // Plan Management
            save_plan,
            load_plan,
            list_saved_plans,
            delete_plan,
            // Portfolio Management (Vibe Studio)
            save_generated_portfolio,
            load_generated_portfolio,
            list_saved_portfolios,
            delete_saved_portfolio,
            get_detailed_ticker_analysis,
            // Historical Data
            get_historical_prices,
            // Database status
            get_database_status,
            // AI / OpenRouter (backend-proxied)
            ai_chat,
            ai_generate_portfolio_insight,
            ai_chat_assistant,
            ai_is_configured,
            ai_local_is_ready,
            ai_clear_cache,
            ai_cache_stats,
            // Alpaca Trading (backend-proxied)
            alpaca_get_account,
            alpaca_get_positions,
            alpaca_get_orders,
            alpaca_get_trading_mode,
            alpaca_is_configured,
            // Fundamental Data (backend-proxied)
            get_fundamentals,
            get_fundamentals_batch,
            clear_fundamentals_cache,
            get_api_key_statuses,
            save_api_keys,
            load_keys_from_store,
            // Stronghold Vault
            vault_exists,
            vault_is_unlocked,
            vault_get_path,
            vault_set_unlocked,
            vault_set_locked,
            vault_migrate_keys,
            // Price alert desktop notifications
            send_price_alert_notification,
            // Price alerts SQLite
            create_alert,
            list_alerts,
            update_alert,
            delete_alert,
            // Rebalance schedules SQLite
            save_schedule,
            list_schedules,
            delete_schedule,
            // User settings SQLite
            save_setting,
            load_setting,
            // Rebalance transactions SQLite
            record_rebalance,
            list_rebalance_history,
            // AI Streaming
            ai_chat_stream,
            // Transaction History
            record_transaction,
            list_transactions,
            delete_transaction,
            // Portfolio Snapshots
            save_portfolio_snapshot,
            get_portfolio_snapshots,
            // Dividend Tracking
            record_dividend,
            list_dividends,
            get_dividend_summary,
            crate::api::commands::dividend_calendar::get_upcoming_dividends,
            crate::api::commands::dividend_calendar::get_projected_annual_income,
            // Multi-Currency
            get_exchange_rate,
            // Tax Lot Tracking
            create_tax_lot,
            list_tax_lots,
            record_wash_sale_event,
            check_wash_sale_window,
            get_tax_loss_harvest_opportunities,
            // Options Tracking (CC / CSP)
            crate::api::commands::options::create_option_position,
            crate::api::commands::options::update_option_position,
            crate::api::commands::options::list_option_positions,
            crate::api::commands::options::delete_option_position,
            crate::api::commands::options::get_options_summary,
        ])
        .setup(|app| {
            let salt_path = match app.path().app_local_data_dir() {
                Ok(dir) => dir.join("stronghold-salt.txt"),
                Err(e) => {
                    tracing::warn!(error = %e, "Could not resolve app local data path");
                    return Ok(());
                }
            };
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let data_dir = app_handle
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| {
                        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                    })
                    .join("data");

                tracing::info!(path = %data_dir.display(), "Using data directory");

                match init_local_database(data_dir.clone()).await {
                    Ok(pool) => {
                        init_market_service_with_db(pool).await;
                        tracing::info!("Local database caching enabled");
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to initialize database cache");
                        tracing::warn!("Continuing with in-memory cache only");
                    }
                }
            });

            // Load user-configured API keys from store into runtime so data providers can use them immediately
            let app_handle_for_keys = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    crate::api::commands::settings::load_keys_from_store(app_handle_for_keys).await
                {
                    tracing::warn!("Failed to load API keys from store at startup: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ==================== TESTS ====================

#[cfg(test)]
mod runtime_keys_tests {
    use super::*;

    #[test]
    fn test_get_api_key_runtime_takes_priority_over_env() {
        // Pre-cleanup in case a prior run leaked state
        RUNTIME_KEYS.write().remove("TEST_FLOWFOLIO_PRIO");
        std::env::remove_var("TEST_FLOWFOLIO_PRIO");
        std::env::set_var("TEST_FLOWFOLIO_PRIO", "from_env");
        RUNTIME_KEYS.write().insert(
            "TEST_FLOWFOLIO_PRIO".to_string(),
            "from_runtime".to_string(),
        );
        assert_eq!(
            get_api_key("TEST_FLOWFOLIO_PRIO"),
            Some("from_runtime".to_string())
        );
        RUNTIME_KEYS.write().remove("TEST_FLOWFOLIO_PRIO");
        std::env::remove_var("TEST_FLOWFOLIO_PRIO");
    }

    #[test]
    fn test_get_api_key_falls_back_to_env() {
        std::env::set_var("TEST_FLOWFOLIO_FALLBACK", "env_value");
        assert_eq!(
            get_api_key("TEST_FLOWFOLIO_FALLBACK"),
            Some("env_value".to_string())
        );
        std::env::remove_var("TEST_FLOWFOLIO_FALLBACK");
    }

    #[test]
    fn test_get_api_key_returns_none_when_absent() {
        assert_eq!(get_api_key("TEST_FLOWFOLIO_MISSING_XYZ"), None);
    }
}

#[cfg(test)]
mod tests {
    use super::api::commands::market::*;
    use super::api::commands::portfolio::*;
    use super::api::commands::vibe::*;
    use crate::modules::quant_analysis::QuantMetrics;
    use crate::services::FundamentalMetrics;

    // ===== Helper builders =====

    fn make_quant_metrics(
        sharpe: f64,
        annual_return: f64,
        volatility: f64,
        max_dd: f64,
        rsi: f64,
        signal: &str,
    ) -> QuantMetrics {
        QuantMetrics {
            symbol: "TEST".to_string(),
            sharpe_ratio: sharpe,
            annualized_return: annual_return,
            volatility,
            max_drawdown: max_dd,
            rsi,
            signal: signal.to_string(),
            confidence: 75.0,
            sortino_ratio: None,
            calmar_ratio: None,
            beta: None,
            alpha: None,
            var_95: None,
            omega_ratio: None,
            tail_ratio: None,
            skewness: None,
            kurtosis: None,
            ulcer_index: None,
            gain_to_loss_ratio: None,
            win_rate: None,
            daily_returns: None,
        }
    }

    fn make_fund(
        profit_margin: Option<f64>,
        roa: Option<f64>,
        fcf: Option<f64>,
        de: Option<f64>,
        current_ratio: Option<f64>,
        op_margin: Option<f64>,
        rev_growth: Option<f64>,
        eps: Option<f64>,
        pb: Option<f64>,
        pe: Option<f64>,
        div_yield: Option<f64>,
        payout: Option<f64>,
    ) -> FundamentalMetrics {
        FundamentalMetrics {
            symbol: "TEST".to_string(),
            company_name: "Test Co".to_string(),
            sector: "Technology".to_string(),
            industry: "Software".to_string(),
            market_cap: 1_000_000_000.0,
            pe_ratio: pe,
            forward_pe: None,
            peg_ratio: None,
            price_to_book: pb,
            price_to_sales: None,
            ev_to_ebitda: None,
            profit_margin,
            operating_margin: op_margin,
            return_on_assets: roa,
            return_on_equity: None,
            revenue_growth_yoy: rev_growth,
            earnings_growth_yoy: None,
            debt_to_equity: de,
            current_ratio,
            quick_ratio: None,
            free_cash_flow: fcf,
            dividend_yield: div_yield,
            payout_ratio: payout,
            eps,
            beta: None,
            fifty_two_week_high: None,
            fifty_two_week_low: None,
            source: "test".to_string(),
            last_updated: "2024-01-01".to_string(),
        }
    }

    // ===== momentum_score_from_rsi tests =====

    #[test]
    fn test_momentum_rsi_oversold() {
        let score = momentum_score_from_rsi(20.0, "BUY");
        assert!((score - 100.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_rsi_overbought() {
        let score = momentum_score_from_rsi(80.0, "SELL");
        assert!((score - 30.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_rsi_neutral_hold() {
        let score = momentum_score_from_rsi(50.0, "HOLD");
        assert!((score - 50.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_strong_buy_signal() {
        let score = momentum_score_from_rsi(50.0, "STRONG BUY");
        assert!((score - 65.0).abs() < 1.0);
    }

    #[test]
    fn test_momentum_strong_sell_clamps_to_zero() {
        let score = momentum_score_from_rsi(75.0, "STRONG SELL");
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    #[test]
    fn test_momentum_unknown_signal() {
        let score = momentum_score_from_rsi(50.0, "UNKNOWN");
        assert!((score - 50.0).abs() < 1.0);
    }

    // ===== quality_score_from_sharpe tests =====

    #[test]
    fn test_quality_high_sharpe_low_vol() {
        let score = quality_score_from_sharpe(2.5, 10.0);
        assert!((score - 100.0).abs() < 1.0);
    }

    #[test]
    fn test_quality_negative_sharpe_high_vol() {
        let score = quality_score_from_sharpe(-1.0, 50.0);
        assert!((score - 30.0).abs() < 1.0);
    }

    #[test]
    fn test_quality_clamped_to_0_100() {
        let score = quality_score_from_sharpe(-10.0, 100.0);
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    #[test]
    fn test_quality_moderate_sharpe() {
        let score = quality_score_from_sharpe(1.2, 20.0);
        assert!((score - 75.0).abs() < 1.0);
    }

    // ===== value_score_from_vol tests =====

    #[test]
    fn test_value_low_vol_low_dd() {
        let score = value_score_from_vol(10.0, 5.0);
        assert!((score - 95.0).abs() < 1.0);
    }

    #[test]
    fn test_value_high_vol_high_dd() {
        let score = value_score_from_vol(60.0, 40.0);
        assert!((score - 5.0).abs() < 1.0);
    }

    #[test]
    fn test_value_clamped() {
        let score = value_score_from_vol(100.0, 100.0);
        assert!(score >= 0.0);
        assert!(score <= 100.0);
    }

    // ===== growth_score_from_return tests =====

    #[test]
    fn test_growth_high_return() {
        assert!((growth_score_from_return(35.0) - 95.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_moderate_return() {
        assert!((growth_score_from_return(15.0) - 70.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_negative_return() {
        assert!((growth_score_from_return(-15.0) - 20.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_zero_return() {
        let score = growth_score_from_return(0.0);
        assert!((score - 35.0).abs() < 1.0);
    }

    #[test]
    fn test_growth_small_positive() {
        let score = growth_score_from_return(3.0);
        assert!((score - 50.0).abs() < 1.0);
    }

    // ===== calculate_quick_score tests =====

    #[test]
    fn test_quick_score_strong_buy_good_metrics() {
        let m = make_quant_metrics(2.0, 25.0, 20.0, 15.0, 60.0, "STRONG BUY");
        let score = calculate_quick_score(&m);
        assert!(score > 50.0, "Expected score > 50, got {}", score);
    }

    #[test]
    fn test_quick_score_bad_metrics() {
        let m = make_quant_metrics(-1.0, 0.0, 80.0, 60.0, 50.0, "SELL");
        let score = calculate_quick_score(&m);
        assert!(score >= 0.0);
    }

    #[test]
    fn test_quick_score_hold_signal() {
        let m = make_quant_metrics(1.0, 10.0, 25.0, 20.0, 50.0, "HOLD");
        let score = calculate_quick_score(&m);
        assert!(score > 0.0);
    }

    // ===== is_etf_symbol tests =====

    #[test]
    fn test_is_etf_spy() {
        assert!(is_etf_symbol("SPY"));
    }

    #[test]
    fn test_is_etf_qqq() {
        assert!(is_etf_symbol("QQQ"));
    }

    #[test]
    fn test_is_etf_not_stock() {
        assert!(!is_etf_symbol("AAPL"));
    }

    #[test]
    fn test_is_etf_suffix() {
        assert!(is_etf_symbol("MYETF"));
    }

    #[test]
    fn test_is_etf_treasury_keyword() {
        assert!(is_etf_symbol("US_TREASURY_FUND"));
    }

    #[test]
    fn test_is_etf_case_insensitive() {
        assert!(is_etf_symbol("spy"));
    }

    // ===== is_bond_etf_symbol tests =====

    #[test]
    fn test_is_bond_etf_bnd() {
        assert!(is_bond_etf_symbol("BND"));
    }

    #[test]
    fn test_is_bond_etf_tlt() {
        assert!(is_bond_etf_symbol("TLT"));
    }

    #[test]
    fn test_is_bond_etf_not_equity() {
        assert!(!is_bond_etf_symbol("SPY"));
    }

    #[test]
    fn test_is_bond_etf_bond_keyword() {
        assert!(is_bond_etf_symbol("MYBONDFUND"));
    }

    // ===== get_etf_info tests =====

    #[test]
    fn test_get_etf_info_spy() {
        let (cat, strategy, index) = get_etf_info("SPY", false);
        assert_eq!(cat, "U.S. Large Cap");
        assert_eq!(strategy, "Passive Index");
        assert_eq!(index.as_deref(), Some("S&P 500"));
    }

    #[test]
    fn test_get_etf_info_tlt_bond() {
        let (cat, strategy, _) = get_etf_info("TLT", true);
        assert_eq!(cat, "Long-Term Treasury");
        assert_eq!(strategy, "Passive Index");
    }

    #[test]
    fn test_get_etf_info_qqq() {
        let (cat, _, index) = get_etf_info("QQQ", false);
        assert_eq!(cat, "U.S. Large Cap Growth");
        assert_eq!(index.as_deref(), Some("NASDAQ-100"));
    }

    #[test]
    fn test_get_etf_info_sector_xl() {
        let (cat, _, _) = get_etf_info("XLK", false);
        assert_eq!(cat, "U.S. Sector");
    }

    #[test]
    fn test_get_etf_info_ark() {
        let (cat, _, _) = get_etf_info("ARKK", false);
        assert_eq!(cat, "Thematic Growth");
    }

    // ===== get_estimated_expense_ratio tests =====

    #[test]
    fn test_expense_ratio_vanguard() {
        let er = get_estimated_expense_ratio("VOO");
        assert_eq!(er, Some(0.03));
    }

    #[test]
    fn test_expense_ratio_spy() {
        let er = get_estimated_expense_ratio("SPY");
        assert_eq!(er, Some(0.09));
    }

    #[test]
    fn test_expense_ratio_ark() {
        let er = get_estimated_expense_ratio("ARKK");
        assert_eq!(er, Some(0.75));
    }

    #[test]
    fn test_expense_ratio_sector() {
        let er = get_estimated_expense_ratio("XLK");
        assert_eq!(er, Some(0.09));
    }

    #[test]
    fn test_expense_ratio_default() {
        let er = get_estimated_expense_ratio("SOMEUNKNOWN");
        assert_eq!(er, Some(0.20));
    }

    // ===== calculate_altman_z_estimate tests =====

    #[test]
    fn test_altman_z_insufficient_components() {
        let fund = make_fund(
            None,
            Some(0.1),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(calculate_altman_z_estimate(&fund).is_none());
    }

    #[test]
    fn test_altman_z_enough_components() {
        let fund = make_fund(
            Some(0.15),
            Some(0.10),
            None,
            Some(0.5),
            Some(2.0),
            Some(0.20),
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let z = calculate_altman_z_estimate(&fund);
        assert!(z.is_some());
        let val = z.unwrap();
        assert!(val >= 0.0 && val <= 5.0);
    }

    #[test]
    fn test_altman_z_safe_zone() {
        let fund = make_fund(
            Some(0.20),
            Some(0.15),
            None,
            Some(0.3),
            Some(2.5),
            Some(0.25),
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let z = calculate_altman_z_estimate(&fund);
        assert!(z.is_some());
    }

    // ===== calculate_piotroski_estimate tests =====

    #[test]
    fn test_piotroski_insufficient_criteria() {
        let fund = make_fund(
            Some(0.1),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(calculate_piotroski_estimate(&fund).is_none());
    }

    #[test]
    fn test_piotroski_strong_company() {
        let fund = make_fund(
            Some(0.15),
            Some(0.10),
            Some(1_000_000.0),
            Some(0.5),
            Some(2.0),
            Some(0.15),
            Some(0.10),
            None,
            None,
            None,
            None,
            None,
        );
        let score = calculate_piotroski_estimate(&fund);
        assert!(score.is_some());
        let val = score.unwrap();
        assert!(val >= 0 && val <= 9);
    }

    #[test]
    fn test_piotroski_weak_company() {
        let fund = make_fund(
            Some(-0.10),
            Some(-0.05),
            Some(-500_000.0),
            Some(3.0),
            Some(0.8),
            Some(-0.05),
            Some(-0.10),
            None,
            None,
            None,
            None,
            None,
        );
        let score = calculate_piotroski_estimate(&fund);
        assert!(score.is_some());
        let val = score.unwrap();
        assert!(val >= 0 && val <= 9);
    }

    // ===== calculate_graham_number tests =====

    #[test]
    fn test_graham_number_no_eps() {
        let fund = make_fund(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(2.0),
            Some(20.0),
            None,
            None,
        );
        assert!(calculate_graham_number(&fund).is_none());
    }

    #[test]
    fn test_graham_number_negative_eps() {
        let fund = make_fund(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(-1.0),
            Some(2.0),
            Some(20.0),
            None,
            None,
        );
        assert!(calculate_graham_number(&fund).is_none());
    }

    #[test]
    fn test_graham_number_valid() {
        let fund = make_fund(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(5.0),
            Some(2.0),
            Some(20.0),
            None,
            None,
        );
        let g = calculate_graham_number(&fund);
        assert!(g.is_some());
        assert!((g.unwrap() - 75.0).abs() < 1.0);
    }

    #[test]
    fn test_graham_number_no_pe() {
        let fund = make_fund(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(5.0),
            Some(2.0),
            None,
            None,
            None,
        );
        assert!(calculate_graham_number(&fund).is_none());
    }

    // ===== assess_dividend_safety tests =====

    #[test]
    fn test_dividend_safety_no_yield() {
        let fund = make_fund(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.0),
            None,
        );
        assert!(assess_dividend_safety(&fund).is_none());
    }

    #[test]
    fn test_dividend_safety_very_safe() {
        let fund = make_fund(
            Some(0.15),
            None,
            Some(1_000_000.0),
            Some(0.5),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.03),
            Some(0.30),
        );
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("very_safe"));
    }

    #[test]
    fn test_dividend_safety_at_risk() {
        let fund = make_fund(
            Some(-0.05),
            None,
            Some(-1.0),
            Some(2.0),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.05),
            Some(0.90),
        );
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("at_risk"));
    }

    #[test]
    fn test_dividend_safety_cutting() {
        let fund = make_fund(
            Some(-0.10),
            None,
            Some(-1.0),
            Some(3.0),
            None,
            None,
            None,
            None,
            None,
            None,
            Some(0.08),
            Some(1.20),
        );
        let safety = assess_dividend_safety(&fund);
        assert_eq!(safety.as_deref(), Some("cutting"));
    }
}
