use once_cell::sync::Lazy;
use regex::Regex;

static SYMBOL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[A-Z0-9.\-]{1,10}$").expect("invalid regex"));

/// Validate a ticker symbol. Allows uppercase letters, digits, dots, hyphens. 1-10 chars.
pub fn validate_symbol(symbol: &str) -> Result<(), String> {
    let symbol = symbol.trim();
    if symbol.is_empty() {
        return Err("Symbol cannot be empty".to_string());
    }
    if !SYMBOL_RE.is_match(symbol) {
        return Err(format!(
            "Invalid symbol '{}': must be 1-10 uppercase alphanumeric characters (dots and hyphens allowed)",
            symbol
        ));
    }
    Ok(())
}

pub fn validate_symbols(symbols: &[String]) -> Result<(), String> {
    for s in symbols {
        validate_symbol(s)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_symbols() {
        assert!(validate_symbol("AAPL").is_ok());
        assert!(validate_symbol("BRK.B").is_ok());
        assert!(validate_symbol("SPY").is_ok());
        assert!(validate_symbol("X").is_ok());
        assert!(validate_symbol("BF-B").is_ok());
    }

    #[test]
    fn test_invalid_symbols() {
        assert!(validate_symbol("").is_err());
        assert!(validate_symbol("aapl").is_err());
        assert!(validate_symbol("TOOLONGSYMBOL").is_err());
        assert!(validate_symbol("AAPL/../hack").is_err());
        assert!(validate_symbol("A%00B").is_err());
        assert!(validate_symbol("AAPL MSFT").is_err());
    }

    #[test]
    fn test_validate_symbols_vec() {
        assert!(validate_symbols(&["AAPL".to_string(), "MSFT".to_string()]).is_ok());
        assert!(validate_symbols(&["AAPL".to_string(), "bad".to_string()]).is_err());
    }
}
