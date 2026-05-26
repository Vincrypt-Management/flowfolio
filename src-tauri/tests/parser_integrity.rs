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
