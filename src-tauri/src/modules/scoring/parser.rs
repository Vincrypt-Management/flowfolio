use crate::modules::{
    scoring::factors::{FinancialMetrics, MomentumMetrics},
    data_provider::CompanyOverview,
    store::models::PriceDaily,
};
use anyhow::Result;

/// Parse Alpha Vantage company overview into FinancialMetrics
pub fn parse_financial_metrics(overview: &CompanyOverview) -> FinancialMetrics {
    FinancialMetrics {
        market_cap: parse_optional_float(&overview.market_cap),
        pe_ratio: parse_optional_float(&overview.pe_ratio),
        pb_ratio: None, // Not directly in overview
        ps_ratio: None,
        price_to_book: None,
        roe: parse_optional_percentage(&overview.roe),
        roa: None,
        roic: parse_optional_percentage(&overview.roic),
        gross_margin: None,
        operating_margin: None,
        net_margin: None,
        revenue_growth_yoy: None,
        earnings_growth_yoy: None,
        revenue_growth_3y: None,
        eps_growth_3y: None,
        dividend_yield: parse_optional_percentage(&overview.dividend_yield),
        payout_ratio: None,
        debt_to_equity: None,
        current_ratio: None,
        quick_ratio: None,
        revenue: None,
        earnings: None,
    }
}

/// Calculate momentum metrics from price history
pub fn calculate_momentum_metrics(prices: &[PriceDaily]) -> Result<MomentumMetrics> {
    if prices.is_empty() {
        return Ok(MomentumMetrics {
            return_1m: None,
            return_3m: None,
            return_6m: None,
            return_12m: None,
            volatility_30d: None,
            avg_volume_30d: None,
        });
    }
    
    // Prices should be sorted by date descending (most recent first)
    let latest = prices.first().unwrap();
    let latest_price = latest.close;
    
    // Calculate returns
    let return_1m = calculate_return(prices, 21, latest_price); // ~1 month trading days
    let return_3m = calculate_return(prices, 63, latest_price); // ~3 months
    let return_6m = calculate_return(prices, 126, latest_price); // ~6 months
    let return_12m = calculate_return(prices, 252, latest_price); // ~12 months
    
    // Calculate 30-day volatility
    let volatility_30d = calculate_volatility(prices, 30);
    
    // Calculate average volume
    let avg_volume_30d = calculate_avg_volume(prices, 30);
    
    Ok(MomentumMetrics {
        return_1m,
        return_3m,
        return_6m,
        return_12m,
        volatility_30d,
        avg_volume_30d,
    })
}

fn calculate_return(prices: &[PriceDaily], lookback_days: usize, current_price: f64) -> Option<f64> {
    if prices.len() <= lookback_days {
        return None;
    }
    
    let past_price = prices.get(lookback_days)?.close;
    if past_price == 0.0 {
        return None;
    }
    
    Some((current_price - past_price) / past_price)
}

fn calculate_volatility(prices: &[PriceDaily], window: usize) -> Option<f64> {
    if prices.len() < window {
        return None;
    }
    
    let recent_prices: Vec<f64> = prices.iter()
        .take(window)
        .map(|p| p.close)
        .collect();
    
    // Calculate daily returns
    let mut returns = Vec::new();
    for i in 1..recent_prices.len() {
        if recent_prices[i - 1] != 0.0 {
            let ret = (recent_prices[i - 1] - recent_prices[i]) / recent_prices[i];
            returns.push(ret);
        }
    }
    
    if returns.is_empty() {
        return None;
    }
    
    // Calculate standard deviation of returns
    let mean: f64 = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance: f64 = returns.iter()
        .map(|r| (r - mean).powi(2))
        .sum::<f64>() / returns.len() as f64;
    
    Some(variance.sqrt())
}

fn calculate_avg_volume(prices: &[PriceDaily], window: usize) -> Option<f64> {
    if prices.len() < window {
        return None;
    }
    
    let total_volume: i64 = prices.iter()
        .take(window)
        .map(|p| p.volume)
        .sum();
    
    Some(total_volume as f64 / window as f64)
}

fn parse_optional_float(value: &Option<String>) -> Option<f64> {
    value.as_ref().and_then(|s| s.parse().ok())
}

fn parse_optional_percentage(value: &Option<String>) -> Option<f64> {
    value.as_ref().and_then(|s| {
        // Handle both "0.15" and "15%" formats
        let cleaned = s.trim_end_matches('%');
        cleaned.parse::<f64>().ok().map(|v| {
            if s.contains('%') {
                v / 100.0 // Convert percentage to decimal
            } else {
                v
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    
    #[test]
    fn test_calculate_return() {
        let prices = vec![
            PriceDaily {
                id: 1,
                symbol_id: 1,
                date: NaiveDate::from_ymd_opt(2024, 1, 30).unwrap(),
                open: 100.0,
                high: 105.0,
                low: 99.0,
                close: 110.0,
                adj_close: Some(110.0),
                volume: 1000000,
            },
            PriceDaily {
                id: 2,
                symbol_id: 1,
                date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
                open: 90.0,
                high: 95.0,
                low: 89.0,
                close: 100.0,
                adj_close: Some(100.0),
                volume: 1000000,
            },
        ];
        
        let ret = calculate_return(&prices, 1, 110.0);
        assert!(ret.is_some());
        assert!((ret.unwrap() - 0.10).abs() < 0.01); // 10% return
    }
    
    #[test]
    fn test_parse_percentage() {
        assert_eq!(parse_optional_percentage(&Some("15%".to_string())), Some(0.15));
        assert_eq!(parse_optional_percentage(&Some("0.15".to_string())), Some(0.15));
        assert_eq!(parse_optional_percentage(&None), None);
    }

    // ===== calculate_return tests =====

    fn make_price(date_str: &str, close: f64, volume: i64) -> PriceDaily {
        PriceDaily {
            id: 0,
            symbol_id: 1,
            date: NaiveDate::parse_from_str(date_str, "%Y-%m-%d").unwrap(),
            open: close,
            high: close,
            low: close,
            close,
            adj_close: Some(close),
            volume,
        }
    }

    #[test]
    fn test_calculate_return_insufficient_data() {
        let prices = vec![make_price("2024-01-01", 100.0, 1000)];
        let result = calculate_return(&prices, 1, 110.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_calculate_return_zero_past_price() {
        let prices = vec![
            make_price("2024-01-30", 110.0, 1000),
            make_price("2024-01-01", 0.0, 1000),
        ];
        let result = calculate_return(&prices, 1, 110.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_calculate_return_negative() {
        let prices = vec![
            make_price("2024-01-30", 90.0, 1000),
            make_price("2024-01-01", 100.0, 1000),
        ];
        let result = calculate_return(&prices, 1, 90.0);
        assert!(result.is_some());
        assert!((result.unwrap() - (-0.10)).abs() < 1e-6);
    }

    // ===== calculate_volatility tests =====

    #[test]
    fn test_volatility_insufficient_data() {
        let prices = vec![make_price("2024-01-01", 100.0, 1000)];
        let result = calculate_volatility(&prices, 30);
        assert!(result.is_none());
    }

    #[test]
    fn test_volatility_constant_prices() {
        let prices: Vec<PriceDaily> = (0..30).map(|i| {
            make_price(&format!("2024-01-{:02}", (i % 28) + 1), 100.0, 1000)
        }).collect();
        let result = calculate_volatility(&prices, 30);
        assert!(result.is_some());
        assert!((result.unwrap() - 0.0).abs() < 1e-10, "Constant prices -> zero volatility");
    }

    #[test]
    fn test_volatility_varying_prices() {
        let prices: Vec<PriceDaily> = (0..30).map(|i| {
            let close = 100.0 + (i as f64 * 2.0);
            make_price(&format!("2024-01-{:02}", (i % 28) + 1), close, 1000)
        }).collect();
        let result = calculate_volatility(&prices, 30);
        assert!(result.is_some());
        assert!(result.unwrap() > 0.0, "Varying prices should have positive volatility");
    }

    // ===== calculate_avg_volume tests =====

    #[test]
    fn test_avg_volume_insufficient() {
        let prices = vec![make_price("2024-01-01", 100.0, 5000)];
        let result = calculate_avg_volume(&prices, 30);
        assert!(result.is_none());
    }

    #[test]
    fn test_avg_volume_basic() {
        let prices: Vec<PriceDaily> = (0..30).map(|i| {
            make_price(&format!("2024-01-{:02}", (i % 28) + 1), 100.0, (i + 1) as i64 * 1000)
        }).collect();
        let result = calculate_avg_volume(&prices, 30);
        assert!(result.is_some());
        // Average of 1000, 2000, ..., 30000 = 15500
        let expected = (1..=30).sum::<i64>() as f64 * 1000.0 / 30.0;
        assert!((result.unwrap() - expected).abs() < 1e-6);
    }

    #[test]
    fn test_avg_volume_window_smaller_than_data() {
        let prices: Vec<PriceDaily> = (0..50).map(|i| {
            make_price(&format!("2024-{:02}-{:02}", (i / 28) + 1, (i % 28) + 1), 100.0, 1000)
        }).collect();
        let result = calculate_avg_volume(&prices, 30);
        assert!(result.is_some());
        assert!((result.unwrap() - 1000.0).abs() < 1e-6);
    }

    // ===== parse_optional_float tests =====

    #[test]
    fn test_parse_optional_float_valid() {
        assert_eq!(parse_optional_float(&Some("42.5".to_string())), Some(42.5));
    }

    #[test]
    fn test_parse_optional_float_invalid() {
        assert_eq!(parse_optional_float(&Some("not_a_number".to_string())), None);
    }

    #[test]
    fn test_parse_optional_float_none() {
        assert_eq!(parse_optional_float(&None), None);
    }

    #[test]
    fn test_parse_optional_float_integer() {
        assert_eq!(parse_optional_float(&Some("100".to_string())), Some(100.0));
    }

    #[test]
    fn test_parse_optional_float_negative() {
        assert_eq!(parse_optional_float(&Some("-5.5".to_string())), Some(-5.5));
    }

    // ===== parse_optional_percentage extended tests =====

    #[test]
    fn test_parse_percentage_zero() {
        assert_eq!(parse_optional_percentage(&Some("0%".to_string())), Some(0.0));
    }

    #[test]
    fn test_parse_percentage_invalid() {
        assert_eq!(parse_optional_percentage(&Some("abc%".to_string())), None);
    }

    #[test]
    fn test_parse_percentage_large() {
        let result = parse_optional_percentage(&Some("100%".to_string()));
        assert_eq!(result, Some(1.0));
    }

    #[test]
    fn test_parse_percentage_decimal_format() {
        let result = parse_optional_percentage(&Some("0.05".to_string()));
        assert_eq!(result, Some(0.05));
    }

    // ===== calculate_momentum_metrics test =====

    #[test]
    fn test_momentum_metrics_empty() {
        let result = calculate_momentum_metrics(&[]).unwrap();
        assert!(result.return_1m.is_none());
        assert!(result.return_3m.is_none());
        assert!(result.volatility_30d.is_none());
        assert!(result.avg_volume_30d.is_none());
    }

    #[test]
    fn test_momentum_metrics_with_data() {
        // Create enough prices for at least 1m return (21+ days)
        let prices: Vec<PriceDaily> = (0..30).map(|i| {
            make_price(
                &format!("2024-01-{:02}", (i % 28) + 1),
                100.0 + i as f64,
                10000,
            )
        }).collect();
        let result = calculate_momentum_metrics(&prices).unwrap();
        assert!(result.return_1m.is_some());
        assert!(result.volatility_30d.is_some());
        assert!(result.avg_volume_30d.is_some());
    }
}
