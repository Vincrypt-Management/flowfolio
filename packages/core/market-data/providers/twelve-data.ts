// packages/core/market-data/providers/twelve-data.ts
import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseTwelveDataQuote(json: unknown): ProviderQuote {
  const obj = json as Record<string, unknown>;
  const symbol = obj?.symbol;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "twelve_data", field: "symbol" });
  }
  const price = parseRequiredF64(json, "close", "twelve_data");
  const volume = parseOptionalI64(json, "volume", "twelve_data");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parseTwelveDataHistorical(json: unknown): HistoricalPrice[] {
  const values = (json as Record<string, unknown>)?.values;
  if (!Array.isArray(values)) {
    throw new ParseFailure({ kind: "missing_field", provider: "twelve_data", field: "values" });
  }
  const out: HistoricalPrice[] = [];
  values.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "twelve_data");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = Number(b.open) || close;
    const high = Number(b.high) || close;
    const low = Number(b.low) || close;
    const volume = Number(b.volume) || 0;
    const date = typeof b.datetime === "string" ? b.datetime : "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "twelve_data" });
  }
  return out;
}

export async function fetchFromTwelveData(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("twelve_data", 1)) {
    throw new RateLimitedError("twelve_data");
  }

  const quoteRes = await fetchImpl(
    `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${apiKey}`,
  );
  const quoteJson = await quoteRes.json();
  if ((quoteJson as Record<string, unknown>)?.code) {
    throw new Error(`twelve_data: ${(quoteJson as Record<string, unknown>).message ?? "error"}`);
  }
  const pq = parseTwelveDataQuote(quoteJson);
  // Twelve Data's /quote response carries real string-encoded change/percent_change
  // fields, plus a real "datetime" timestamp — extracted directly here, matching
  // multi_source_provider.rs:1231-1244 (which reads these outside parse_twelve_data_quote).
  const rawQuote = quoteJson as Record<string, unknown>;
  const change = Number(rawQuote.change) || 0;
  const changePercent = Number(rawQuote.percent_change) || 0;
  const timestamp = typeof rawQuote.datetime === "string" ? rawQuote.datetime : new Date().toISOString();

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=365&apikey=${apiKey}`,
    );
    historical = parseTwelveDataHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol: pq.symbol,
      price: pq.price,
      change,
      changePercent,
      volume: pq.volume ?? 0,
      timestamp,
      source: "twelve_data",
    },
    historical,
    source: "twelve_data",
    cached: false,
  };
}
