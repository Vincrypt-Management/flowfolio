// packages/core/market-data/providers/alpaca.ts
import type { HistoricalPrice, MarketDataResult, StockQuote } from "../types.ts";
import { parseRequiredF64, parseRequiredI64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseAlpacaBars(json: unknown): HistoricalPrice[] {
  const bars = (json as Record<string, unknown>)?.bars;
  if (!Array.isArray(bars)) {
    throw new ParseFailure({ kind: "missing_field", provider: "alpaca", field: "bars" });
  }
  const out: HistoricalPrice[] = [];
  bars.forEach((bar, i) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "c", "alpaca");
    } catch {
      return; // skip bar with missing/bad close, matching the Rust source
    }
    let open: number, high: number, low: number, volume: number;
    try {
      open = parseRequiredF64(bar, "o", "alpaca");
    } catch {
      open = close;
    }
    try {
      high = parseRequiredF64(bar, "h", "alpaca");
    } catch {
      high = close;
    }
    try {
      low = parseRequiredF64(bar, "l", "alpaca");
    } catch {
      low = close;
    }
    try {
      volume = parseRequiredI64(bar, "v", "alpaca");
    } catch {
      volume = 0;
    }
    const t = (bar as Record<string, unknown>)?.t;
    const date = typeof t === "string" ? t.slice(0, 10) : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "alpaca" });
  }
  return out;
}

export function deriveAlpacaQuote(bars: HistoricalPrice[], symbol: string): StockQuote {
  const latest = bars[bars.length - 1];
  const prior = bars.length > 1 ? bars[bars.length - 2] : undefined;
  const change = prior ? latest.close - prior.close : 0;
  const changePercent = prior && prior.close !== 0 ? (change / prior.close) * 100 : 0;
  return {
    symbol,
    price: latest.close,
    change,
    changePercent,
    volume: latest.volume,
    timestamp: latest.date,
    source: "alpaca",
  };
}

export async function fetchFromAlpaca(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("alpaca", 200)) {
    throw new RateLimitedError("alpaca");
  }
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars` +
    `?timeframe=1Day&start=${start.toISOString()}&end=${end.toISOString()}&limit=365&adjustment=split&feed=iex`;
  const res = await fetchImpl(url, {
    headers: {
      "APCA-API-KEY-ID": apiKey.trim(),
      "APCA-API-SECRET-KEY": apiSecret.trim(),
    },
  });
  if (!res.ok) {
    throw new Error(`alpaca: HTTP ${res.status}`);
  }
  const json = await res.json();
  const bars = parseAlpacaBars(json);
  const quote = deriveAlpacaQuote(bars, symbol);
  return { quote, historical: bars, source: "alpaca", cached: false };
}
