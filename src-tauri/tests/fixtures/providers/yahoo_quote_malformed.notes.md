# yahoo_quote_malformed.json

- Captured: 2026-05-26
- Endpoint: `https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL`
- No API keys required; representative shape from Yahoo Finance public docs.
- `regularMarketPrice` intentionally removed to test that parser returns Err
  rather than silently emitting a quote with price=0.0 (Bug #1 regression guard).
