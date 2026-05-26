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
