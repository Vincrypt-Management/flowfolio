//! Parser integrity tests.
//!
//! Each provider gets:
//!   - happy-path fixture (real captured JSON) → must parse all required fields
//!     without any silent zeros.
//!   - malformed fixture (real shape, one required field removed) → must
//!     return Err or skip the bad row, NEVER silently substitute 0.0.
//!
//! Bug #1 (silent zero corruption) is locked down by these tests becoming
//! green after Tasks 12-16 replace .unwrap_or(0.0) with parse_helpers.

use std::path::PathBuf;

#[allow(dead_code)]  // helpers added by later tasks
fn load_fixture(name: &str) -> String {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("providers");
    path.push(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("missing fixture {}: {}", path.display(), e))
}

#[allow(dead_code)]
fn load_json(name: &str) -> serde_json::Value {
    serde_json::from_str(&load_fixture(name))
        .unwrap_or_else(|e| panic!("fixture {} is not valid JSON: {}", name, e))
}

// Per-provider tests are added in subsequent tasks (12-16).

// Sentinel test so cargo doesn't complain about an empty test target.
#[test]
fn parser_integrity_scaffold_is_loaded() {
    // Verify the fixtures directory exists and the loader function works.
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("providers");
    assert!(path.exists(), "fixtures/providers/ directory missing at {}", path.display());
}

// ── Alpha Vantage (Task 12) ─────────────────────────────────────────────────

use flowfolio_lib::modules::data_provider::AlphaVantageClient;

// ── Yahoo Finance (Task 13) ─────────────────────────────────────────────────

use flowfolio_lib::modules::data_provider::free_sources;

// ── Alpaca + Finnhub (Task 14) ──────────────────────────────────────────────

use flowfolio_lib::modules::data_provider::multi_source_provider;

#[test]
fn alphavantage_ok_fixture_parses_all_fields() {
    let json = load_json("alphavantage_timeseries_ok.json");
    let entries = AlphaVantageClient::parse_time_series(&json).expect("ok fixture must parse");
    assert_eq!(entries.len(), 2, "expected 2 bars");
    let first = entries.iter().find(|e| e.date == "2024-01-15")
        .expect("2024-01-15 bar missing");
    assert!((first.open - 185.92).abs() < 1e-9);
    assert!((first.high - 186.74).abs() < 1e-9);
    assert!((first.low - 184.30).abs() < 1e-9);
    assert!((first.close - 185.92).abs() < 1e-9);
    assert_eq!(first.volume, 47_471_400);
    // CRITICAL: ensure no silent zeros
    assert_ne!(first.open, 0.0, "open must not be silently 0");
    assert_ne!(first.close, 0.0, "close must not be silently 0");
}

#[test]
fn alphavantage_malformed_fixture_errors_not_silent_zero() {
    let json = load_json("alphavantage_timeseries_malformed.json");
    let result = AlphaVantageClient::parse_time_series(&json);
    // Per the parser policy: bars with missing required fields are skipped
    // (logged warn) → resulting empty series returns Err(EmptyResponse).
    // OR: the helper could choose to return Err on first bad bar.
    // Acceptable outcomes: Err, OR Ok([]) (empty vec after skipping all bad bars).
    let bad = match &result {
        Err(_) => true,
        Ok(v) => v.is_empty(),
    };
    assert!(bad, "missing required 'close' must NOT produce entry with close=0.0; got: {result:?}");
}

#[test]
fn yahoo_quote_ok_parses_required_fields() {
    let json = load_json("yahoo_quote_ok.json");
    let quote = free_sources::parse_yahoo_quote(&json).expect("ok fixture must parse");
    assert_eq!(quote.symbol, "AAPL");
    assert!((quote.price - 185.92).abs() < 1e-9);
    assert_ne!(quote.price, 0.0, "price must not be silently 0");
    assert_eq!(quote.volume, Some(47_471_400));
}

#[test]
fn yahoo_quote_malformed_errors_not_silent_zero() {
    let json = load_json("yahoo_quote_malformed.json");
    let result = free_sources::parse_yahoo_quote(&json);
    assert!(result.is_err(),
            "missing regularMarketPrice must NOT parse to quote{{price:0.0}}, got: {result:?}");
}

#[test]
fn yahoo_historical_ok_parses_all_bars() {
    let json = load_json("yahoo_historical_ok.json");
    let bars = free_sources::parse_yahoo_historical(&json).expect("ok fixture must parse");
    assert_eq!(bars.len(), 2);
    for bar in &bars {
        assert_ne!(bar.close, 0.0, "close must not be silently 0");
        assert_ne!(bar.open, 0.0, "open must not be silently 0");
    }
}

#[test]
fn yahoo_historical_malformed_errors_not_silent_zero() {
    let json = load_json("yahoo_historical_malformed.json");
    let result = free_sources::parse_yahoo_historical(&json);
    let bad = match &result {
        Err(_) => true,
        Ok(v) => v.is_empty(),
    };
    assert!(bad, "missing close array must NOT produce bar{{close:0.0}}, got: {result:?}");
}

// ── Alpaca tests (Task 14) ──────────────────────────────────────────────────

#[test]
fn alpaca_quote_ok_parses() {
    let json = load_json("alpaca_quote_ok.json");
    let q = multi_source_provider::parse_alpaca_quote(&json)
        .expect("ok fixture must parse");
    assert_eq!(q.symbol, "AAPL");
    assert!(q.price > 0.0, "price must not be 0; got {}", q.price);
    // Midpoint of bp=185.91 and ap=185.93 = 185.92
    assert!((q.price - 185.92).abs() < 1e-6);
}

#[test]
fn alpaca_quote_malformed_errors() {
    let json = load_json("alpaca_quote_malformed.json");
    let result = multi_source_provider::parse_alpaca_quote(&json);
    assert!(result.is_err(), "missing prices must Err, got: {result:?}");
}

#[test]
fn alpaca_bars_ok_parses() {
    let json = load_json("alpaca_bars_ok.json");
    let bars = multi_source_provider::parse_alpaca_bars(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 1);
    assert!(bars[0].close > 0.0, "close must not be 0");
}

#[test]
fn alpaca_bars_malformed_errors_or_skips() {
    let json = load_json("alpaca_bars_malformed.json");
    let result = multi_source_provider::parse_alpaca_bars(&json);
    let bad = match &result { Err(_) => true, Ok(v) => v.is_empty() };
    assert!(bad, "missing close must Err or skip, got: {result:?}");
}

// ── Finnhub tests (Task 14) ─────────────────────────────────────────────────

#[test]
fn finnhub_quote_ok_parses() {
    let json = load_json("finnhub_quote_ok.json");
    let q = multi_source_provider::parse_finnhub_quote(&json)
        .expect("ok fixture must parse");
    assert!((q.price - 185.92).abs() < 1e-6);
    assert_ne!(q.price, 0.0);
}

#[test]
fn finnhub_quote_malformed_errors() {
    let json = load_json("finnhub_quote_malformed.json");
    let result = multi_source_provider::parse_finnhub_quote(&json);
    assert!(result.is_err(), "missing c must Err, got: {result:?}");
}

#[test]
fn finnhub_candles_ok_parses() {
    let json = load_json("finnhub_candles_ok.json");
    let bars = multi_source_provider::parse_finnhub_candles(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 2);
    for bar in &bars { assert!(bar.close > 0.0); }
}

#[test]
fn finnhub_candles_malformed_errors() {
    let json = load_json("finnhub_candles_malformed.json");
    let result = multi_source_provider::parse_finnhub_candles(&json);
    let bad = match &result { Err(_) => true, Ok(v) => v.is_empty() };
    assert!(bad);
}

// ── FMP tests (Task 15) ─────────────────────────────────────────────────────

#[test]
fn fmp_quote_ok_parses() {
    let json = load_json("fmp_quote_ok.json");
    let q = flowfolio_lib::modules::data_provider::multi_source_provider::parse_fmp_quote(&json)
        .expect("ok fixture must parse");
    assert_eq!(q.symbol, "AAPL");
    assert!((q.price - 185.92).abs() < 1e-6);
    assert_ne!(q.price, 0.0);
}

#[test]
fn fmp_quote_malformed_errors() {
    let json = load_json("fmp_quote_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_fmp_quote(&json);
    assert!(result.is_err(), "missing price must Err, got: {result:?}");
}

#[test]
fn fmp_historical_ok_parses() {
    let json = load_json("fmp_historical_ok.json");
    let bars = flowfolio_lib::modules::data_provider::multi_source_provider::parse_fmp_historical(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 1);
    assert!((bars[0].close - 185.92).abs() < 1e-9);
    assert_ne!(bars[0].close, 0.0);
}

#[test]
fn fmp_historical_malformed_errors() {
    let json = load_json("fmp_historical_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_fmp_historical(&json);
    let bad = match &result { Err(_) => true, Ok(v) => v.is_empty() };
    assert!(bad, "missing close must Err or skip, got: {result:?}");
}

// ── Tiingo tests (Task 15) ───────────────────────────────────────────────────

#[test]
fn tiingo_quote_ok_parses() {
    let json = load_json("tiingo_quote_ok.json");
    let q = flowfolio_lib::modules::data_provider::multi_source_provider::parse_tiingo_quote(&json)
        .expect("ok fixture must parse");
    assert_eq!(q.symbol, "AAPL");
    assert!((q.price - 185.92).abs() < 1e-6);
    assert_ne!(q.price, 0.0);
}

#[test]
fn tiingo_quote_malformed_errors() {
    let json = load_json("tiingo_quote_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_tiingo_quote(&json);
    assert!(result.is_err(), "missing last must Err, got: {result:?}");
}

#[test]
fn tiingo_historical_ok_parses() {
    let json = load_json("tiingo_historical_ok.json");
    let bars = flowfolio_lib::modules::data_provider::multi_source_provider::parse_tiingo_historical(&json)
        .expect("ok fixture must parse");
    assert_eq!(bars.len(), 1);
    assert_ne!(bars[0].close, 0.0);
}

#[test]
fn tiingo_historical_malformed_errors() {
    let json = load_json("tiingo_historical_malformed.json");
    let result = flowfolio_lib::modules::data_provider::multi_source_provider::parse_tiingo_historical(&json);
    let bad = match &result { Err(_) => true, Ok(v) => v.is_empty() };
    assert!(bad);
}
