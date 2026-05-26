# yahoo_historical_malformed.json

- Captured: 2026-05-26
- Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=...&period2=...&interval=1d`
- No API keys required; representative shape from Yahoo Finance public docs.
- `close` array intentionally removed from the quote indicator to test that
  the parser returns Err or empty vec rather than silently emitting bars
  with close=0.0 (Bug #1 regression guard).
