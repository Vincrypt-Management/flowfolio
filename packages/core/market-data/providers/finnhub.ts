import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseFinnhubQuote(json: unknown): ProviderQuote {
  const price = parseRequiredF64(json, "c", "finnhub");
  if (price <= 0) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider: "finnhub",
      field: "c",
      expected: "positive number",
      got: String(price),
    });
  }
  return { symbol: "", price, bid: null, ask: null, volume: null };
}

export function parseFinnhubCandles(json: unknown): HistoricalPrice[] {
  const obj = json as Record<string, unknown>;
  if (obj?.s === "no_data") {
    throw new ParseFailure({ kind: "empty_response", provider: "finnhub" });
  }
  const closes = obj?.c;
  if (!Array.isArray(closes)) {
    throw new ParseFailure({ kind: "missing_field", provider: "finnhub", field: "c" });
  }
  const opens = Array.isArray(obj?.o) ? obj.o as number[] : undefined;
  const highs = Array.isArray(obj?.h) ? obj.h as number[] : undefined;
  const lows = Array.isArray(obj?.l) ? obj.l as number[] : undefined;
  const vols = Array.isArray(obj?.v) ? obj.v as number[] : undefined;
  const timestamps = Array.isArray(obj?.t) ? obj.t as number[] : undefined;

  const out: HistoricalPrice[] = [];
  (closes as number[]).forEach((closeRaw, i) => {
    if (typeof closeRaw !== "number" || closeRaw <= 0) return;
    const close = closeRaw;
    const open = opens?.[i] ?? close;
    const high = highs?.[i] ?? close;
    const low = lows?.[i] ?? close;
    const volume = vols?.[i] ?? 0;
    const ts = timestamps?.[i];
    const date = typeof ts === "number"
      ? new Date(ts * 1000).toISOString().slice(0, 10)
      : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "finnhub" });
  }
  return out;
}

export async function fetchFromFinnhub(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("finnhub", 50)) {
    throw new RateLimitedError("finnhub");
  }
  const quoteRes = await fetchImpl(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}`,
    { headers: { "X-Finnhub-Token": apiKey } },
  );
  if (!quoteRes.ok) throw new Error(`finnhub: HTTP ${quoteRes.status}`);
  const providerQuote = parseFinnhubQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 365 * 24 * 60 * 60;
    const candlesRes = await fetchImpl(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}`,
      { headers: { "X-Finnhub-Token": apiKey } },
    );
    if (candlesRes.ok) {
      historical = parseFinnhubCandles(await candlesRes.json());
    }
  } catch {
    // non-fatal, matching the Rust source
  }

  return {
    quote: {
      symbol,
      price: providerQuote.price,
      change: 0,
      changePercent: 0,
      volume: 0,
      timestamp: new Date().toISOString(),
      source: "finnhub",
    },
    historical,
    source: "finnhub",
    cached: false,
  };
}
