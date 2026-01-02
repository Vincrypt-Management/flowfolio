# FlowFolio Data Sources

Complete guide to all market data sources - both free (no API key) and freemium (API key required).

---

## 🆓 COMPLETELY FREE (No API Key Required)

These sources work immediately without any registration.

### 1. Yahoo Finance ⭐⭐⭐ BEST FREE SOURCE
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | ~100 requests/minute |
| **Data Available** | Real-time quotes, Historical (20+ years), Fundamentals, Search |
| **Reliability** | ⭐⭐⭐⭐⭐ Excellent |
| **Coverage** | Global stocks, ETFs, Mutual Funds, Crypto, Forex |

**Endpoints Used:**
- `/v8/finance/chart/{symbol}` - Quotes + Historical
- `/v10/finance/quoteSummary/{symbol}` - Fundamentals
- `/v1/finance/search` - Symbol search

---

### 2. Nasdaq Official
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | ~30 requests/minute |
| **Data Available** | Real-time quotes, Historical, Company info |
| **Reliability** | ⭐⭐⭐⭐ Very Good |
| **Coverage** | Nasdaq-listed stocks |

**Endpoints Used:**
- `/api/quote/{symbol}/info` - Quote data
- `/api/quote/{symbol}/historical` - Historical prices

---

### 3. Stooq
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | Generous |
| **Data Available** | Historical prices (CSV format) |
| **Reliability** | ⭐⭐⭐⭐ Very Good |
| **Coverage** | US stocks, International markets |

**Endpoints Used:**
- `/q/d/l/?s={symbol}.us` - Historical CSV

---

### 4. CNBC Quote API
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | ~60 requests/minute |
| **Data Available** | Real-time quotes |
| **Reliability** | ⭐⭐⭐ Good |
| **Coverage** | US stocks |

---

### 5. SEC EDGAR (Official US Government)
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | 10 requests/second |
| **Data Available** | Company filings, Fundamentals, Insider trading |
| **Reliability** | ⭐⭐⭐⭐⭐ Official Source |
| **Coverage** | All US public companies |

**Endpoints Used:**
- `/files/company_tickers.json` - CIK lookup
- `/api/xbrl/companyfacts/CIK{cik}.json` - Company facts

---

### 6. Federal Reserve (FRED)
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required (limited) |
| **Rate Limit** | Generous |
| **Data Available** | Economic indicators (GDP, CPI, Unemployment, etc.) |
| **Reliability** | ⭐⭐⭐⭐⭐ Official Source |
| **Coverage** | US economic data |

**Available Indicators:**
- `GDP` - Gross Domestic Product
- `UNRATE` - Unemployment Rate
- `CPIAUCSL` - Consumer Price Index
- `FEDFUNDS` - Federal Funds Rate
- `DGS10` - 10-Year Treasury Rate

---

### 7. Investing.com
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | ~30 requests/minute |
| **Data Available** | Real-time quotes, News |
| **Reliability** | ⭐⭐⭐ Good |
| **Coverage** | Global markets |

---

### 8. MarketWatch
| Feature | Details |
|---------|---------|
| **API Key** | ❌ Not Required |
| **Rate Limit** | Unknown |
| **Data Available** | Real-time quotes |
| **Reliability** | ⭐⭐⭐ Good |
| **Coverage** | US stocks |

---

## 🔑 FREEMIUM SOURCES (API Key Required - Free Tier Available)

These require free registration but offer generous free limits.

### Tier 1: Excellent Free Limits ⭐⭐⭐

#### Alpaca Markets
| Feature | Details |
|---------|---------|
| **Free Tier** | Unlimited basic data |
| **Rate Limit** | 200 requests/minute |
| **Sign Up** | https://alpaca.markets/ |
| **Time** | ~5 minutes |

```env
VITE_ALPACA_API_KEY=your_key
VITE_ALPACA_API_SECRET=your_secret
```

---

#### Tiingo
| Feature | Details |
|---------|---------|
| **Free Tier** | 500 requests/hour |
| **Rate Limit** | ~8/minute |
| **Sign Up** | https://www.tiingo.com/ |
| **Time** | ~2 minutes |

```env
VITE_TIINGO_API_KEY=your_key
```

---

#### Finnhub
| Feature | Details |
|---------|---------|
| **Free Tier** | 60 requests/minute |
| **Rate Limit** | 60/minute |
| **Sign Up** | https://finnhub.io/ |
| **Time** | ~2 minutes |

```env
VITE_FINNHUB_API_KEY=your_key
```

---

### Tier 2: Good Free Limits ⭐⭐

#### Twelve Data
| Feature | Details |
|---------|---------|
| **Free Tier** | 800 requests/day |
| **Rate Limit** | ~1/minute recommended |
| **Sign Up** | https://twelvedata.com/ |
| **Time** | ~2 minutes |

```env
VITE_TWELVE_DATA_API_KEY=your_key
```

---

#### Financial Modeling Prep (FMP)
| Feature | Details |
|---------|---------|
| **Free Tier** | 250 requests/day |
| **Rate Limit** | ~4/minute |
| **Sign Up** | https://financialmodelingprep.com/ |
| **Time** | ~2 minutes |

```env
VITE_FMP_API_KEY=your_key
```

---

### Tier 3: Limited Free (Use Sparingly) ⭐

#### Alpha Vantage
| Feature | Details |
|---------|---------|
| **Free Tier** | 25 requests/day |
| **Rate Limit** | 5/minute |
| **Sign Up** | https://www.alphavantage.co/ |
| **Note** | ⚠️ Very limited, save for fallback |

```env
VITE_ALPHAVANTAGE_API_KEY=your_key
```

---

#### Polygon.io
| Feature | Details |
|---------|---------|
| **Free Tier** | 5 requests/minute |
| **Rate Limit** | 5/minute |
| **Sign Up** | https://polygon.io/ |
| **Note** | ⚠️ Limited free tier |

```env
VITE_POLYGON_API_KEY=your_key
```

---

## 📊 Provider Priority Order

FlowFolio tries providers in this order (optimized for free usage):

| Priority | Provider | Type | Reason |
|----------|----------|------|--------|
| 1 | Yahoo Finance | Free | Best free source, most reliable |
| 2 | Alpaca | API Key | Unlimited if you have key |
| 3 | Nasdaq | Free | Official, good for Nasdaq stocks |
| 4 | Tiingo | API Key | 500/hour free |
| 5 | Finnhub | API Key | 60/min free |
| 6 | CNBC | Free | Good for quotes |
| 7 | Stooq | Free | Good for historical |
| 8 | Twelve Data | API Key | 800/day |
| 9 | FMP | API Key | 250/day |
| 10 | Alpha Vantage | API Key | Last resort |
| 11 | Polygon | API Key | Last resort |

---

## 🚀 Quick Start

### Zero Configuration (Works Immediately)
```bash
# Just run - Yahoo Finance works without any setup
npm run tauri dev
```

### Recommended Setup (5 minutes)
Register for these free APIs for best experience:

1. **Alpaca** (Unlimited): https://alpaca.markets/
2. **Finnhub** (60/min): https://finnhub.io/
3. **Tiingo** (500/hr): https://www.tiingo.com/

Create `.env` file:
```env
VITE_ALPACA_API_KEY=your_alpaca_key
VITE_ALPACA_API_SECRET=your_alpaca_secret
VITE_FINNHUB_API_KEY=your_finnhub_key
VITE_TIINGO_API_KEY=your_tiingo_key
```

---

## 🔧 Full Environment Variables

```bash
# ========================================
# COMPLETELY FREE (NO KEY NEEDED)
# ========================================
# Yahoo Finance    - Works automatically
# Nasdaq           - Works automatically
# Stooq            - Works automatically
# CNBC             - Works automatically
# SEC EDGAR        - Works automatically
# FRED             - Works automatically

# ========================================
# TIER 1: EXCELLENT FREE LIMITS
# ========================================
VITE_ALPACA_API_KEY=       # Unlimited
VITE_ALPACA_API_SECRET=    # Unlimited
VITE_TIINGO_API_KEY=       # 500/hour
VITE_FINNHUB_API_KEY=      # 60/minute

# ========================================
# TIER 2: GOOD FREE LIMITS
# ========================================
VITE_TWELVE_DATA_API_KEY=  # 800/day
VITE_FMP_API_KEY=          # 250/day

# ========================================
# TIER 3: LIMITED (FALLBACK ONLY)
# ========================================
VITE_ALPHAVANTAGE_API_KEY= # 25/day
VITE_POLYGON_API_KEY=      # 5/minute
```

---

## ✅ Verification

Run the app and check console output:

```
🔑 Data Sources Status:
   ✅ Yahoo Finance (no key required)
   ✅ Nasdaq (no key required)
   ✅ Stooq (no key required)
   ✅ CNBC (no key required)
   ✅ SEC EDGAR (no key required)
   ✅ FRED (no key required)
   ✅ Alpaca (key configured)
   ❌ Tiingo (key not set)
   ❌ Finnhub (key not set)
   ...
```

---

## 📈 Data Coverage Summary

| Data Type | Best Free Source | Backup Sources |
|-----------|-----------------|----------------|
| Real-time Quotes | Yahoo Finance | Nasdaq, CNBC |
| Historical Prices | Yahoo Finance | Stooq, Nasdaq |
| Fundamentals | Yahoo Finance | SEC EDGAR |
| Company Info | SEC EDGAR | Yahoo Finance |
| Economic Data | FRED | - |
| Symbol Search | Yahoo Finance | Investing.com |

---

## 🌐 International Markets

| Market | Best Source |
|--------|-------------|
| US Stocks | Yahoo, Nasdaq, Alpaca |
| European | Yahoo, Stooq |
| Asian | Yahoo |
| Crypto | Yahoo |
| Forex | Yahoo, Stooq |
| ETFs | Yahoo |

---

## ⚠️ Rate Limit Guidelines

To avoid hitting rate limits:

1. **Enable caching** - Data is cached for 2 minutes (quotes) and 2 hours (historical)
2. **Batch requests** - Fetch multiple symbols in one call when possible
3. **Use free sources first** - Yahoo, Nasdaq, Stooq have generous limits
4. **Spread API key sources** - Don't rely on just one provider

---

## 📝 Notes

- **Yahoo Finance** is the most reliable free source and should handle 90% of use cases
- **SEC EDGAR** is the official source for US company fundamentals
- **FRED** is the official source for US economic indicators
- **Alpaca** is recommended if you need high-frequency data
- All data is for informational purposes only - verify with official sources for trading decisions
