//! Shared parsing utilities for provider responses.
//!
//! All provider parsers MUST use these helpers instead of inline
//! `.unwrap_or(0.0)` — silent zero substitution is the #1 source of
//! corrupted data in the FlowFolio pipeline.

use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum ParseError {
    #[error("Missing required field '{field}' from provider '{provider}'")]
    MissingField { provider: String, field: String },

    #[error("Invalid type for field '{field}' from provider '{provider}': expected {expected}, got {got}")]
    InvalidType {
        provider: String,
        field: String,
        expected: String,
        got: String,
    },

    #[error("Provider '{provider}' returned no usable data")]
    EmptyResponse { provider: String },
}

/// Parse a required f64 field. Accepts:
/// - JSON number → f64
/// - JSON string that parses to f64 (Alpha Vantage style)
/// Returns Err for missing, null, or unparseable values.
pub fn parse_required_f64(value: &Value, field: &str, provider: &str) -> Result<f64, ParseError> {
    let v = value.get(field).ok_or_else(|| ParseError::MissingField {
        provider: provider.to_string(),
        field: field.to_string(),
    })?;
    parse_f64(v, field, provider)
}

/// Parse an optional f64 field. Returns:
/// - Ok(Some(x)) if present and parseable
/// - Ok(None) if missing or explicitly null
/// - Err if present but unparseable (still a bug worth surfacing)
pub fn parse_optional_f64(value: &Value, field: &str, provider: &str) -> Result<Option<f64>, ParseError> {
    match value.get(field) {
        None => Ok(None),
        Some(v) if v.is_null() => Ok(None),
        Some(v) => parse_f64(v, field, provider).map(Some),
    }
}

/// Parse a required i64 field (e.g., volume).
pub fn parse_required_i64(value: &Value, field: &str, provider: &str) -> Result<i64, ParseError> {
    let v = value.get(field).ok_or_else(|| ParseError::MissingField {
        provider: provider.to_string(),
        field: field.to_string(),
    })?;
    parse_i64(v, field, provider)
}

/// Parse an optional i64 field.
pub fn parse_optional_i64(value: &Value, field: &str, provider: &str) -> Result<Option<i64>, ParseError> {
    match value.get(field) {
        None => Ok(None),
        Some(v) if v.is_null() => Ok(None),
        Some(v) => parse_i64(v, field, provider).map(Some),
    }
}

fn parse_f64(v: &Value, field: &str, provider: &str) -> Result<f64, ParseError> {
    if let Some(n) = v.as_f64() {
        return Ok(n);
    }
    if let Some(s) = v.as_str() {
        if let Ok(n) = s.parse::<f64>() {
            return Ok(n);
        }
    }
    Err(ParseError::InvalidType {
        provider: provider.to_string(),
        field: field.to_string(),
        expected: "number or numeric string".to_string(),
        got: format!("{v}"),
    })
}

fn parse_i64(v: &Value, field: &str, provider: &str) -> Result<i64, ParseError> {
    if let Some(n) = v.as_i64() {
        return Ok(n);
    }
    if let Some(f) = v.as_f64() {
        return Ok(f as i64);
    }
    if let Some(s) = v.as_str() {
        if let Ok(n) = s.parse::<i64>() {
            return Ok(n);
        }
        if let Ok(f) = s.parse::<f64>() {
            return Ok(f as i64);
        }
    }
    Err(ParseError::InvalidType {
        provider: provider.to_string(),
        field: field.to_string(),
        expected: "integer or numeric string".to_string(),
        got: format!("{v}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_required_f64_accepts_number() {
        let v = json!({"price": 123.45});
        assert_eq!(parse_required_f64(&v, "price", "test").unwrap(), 123.45);
    }

    #[test]
    fn parse_required_f64_accepts_numeric_string() {
        let v = json!({"price": "123.45"});
        assert_eq!(parse_required_f64(&v, "price", "test").unwrap(), 123.45);
    }

    #[test]
    fn parse_required_f64_rejects_missing_field() {
        let v = json!({});
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::MissingField { .. }));
    }

    #[test]
    fn parse_required_f64_rejects_null() {
        let v = json!({"price": null});
        // null counts as "present" — fails on type conversion
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::InvalidType { .. }));
    }

    #[test]
    fn parse_required_f64_rejects_non_numeric_string() {
        let v = json!({"price": "N/A"});
        let err = parse_required_f64(&v, "price", "test").unwrap_err();
        assert!(matches!(err, ParseError::InvalidType { .. }));
    }

    #[test]
    fn parse_optional_f64_returns_none_for_missing() {
        let v = json!({});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), None);
    }

    #[test]
    fn parse_optional_f64_returns_none_for_null() {
        let v = json!({"bid": null});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), None);
    }

    #[test]
    fn parse_optional_f64_returns_some_for_value() {
        let v = json!({"bid": 99.5});
        assert_eq!(parse_optional_f64(&v, "bid", "test").unwrap(), Some(99.5));
    }

    #[test]
    fn parse_required_i64_accepts_volume() {
        let v = json!({"volume": 1234567});
        assert_eq!(parse_required_i64(&v, "volume", "test").unwrap(), 1234567);
    }

    #[test]
    fn parse_required_i64_accepts_string_volume() {
        let v = json!({"volume": "1234567"});
        assert_eq!(parse_required_i64(&v, "volume", "test").unwrap(), 1234567);
    }
}
