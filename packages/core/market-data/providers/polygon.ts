import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, parseRequiredI64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parsePolygonQuote(json: unknown): ProviderQuote {
  const obj = json as Record<string, unknown>;
  const symbol = obj?.ticker;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "ticker" });
  }
  const results = obj?.results;
  if (!Array.isArray(results)) {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "results" });
  }
  const first = results[0];
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "polygon" });
  }
  const price = parseRequiredF64(first, "c", "polygon");
  const volume = parseOptionalI64(first, "v", "polygon");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parsePolygonHistorical(json: unknown): HistoricalPrice[] {
  const results = (json as Record<string, unknown>)?.results;
  if (!Array.isArray(results)) {
    throw new ParseFailure({ kind: "missing_field", provider: "polygon", field: "results" });
  }
  const out: HistoricalPrice[] = [];
  results.forEach((bar, i) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "c", "polygon");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = (b.o as number) ?? close;
    const high = (b.h as number) ?? close;
    const low = (b.l as number) ?? close;
    let volume = 0;
    try {
      volume = parseRequiredI64(bar, "v", "polygon");
    } catch {
      // 0
    }
    const t = b.t;
    const date = typeof t === "number"
      ? new Date(t).toISOString().slice(0, 10)
      : `idx:${i}`;
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "polygon" });
  }
  return out;
}

export async function fetchFromPolygon(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("polygon", 4)) {
    throw new RateLimitedError("polygon");
  }

  const quoteRes = await fetchImpl(
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`,
  );
  if (!quoteRes.ok) throw new Error(`polygon: HTTP ${quoteRes.status}`);
  const pq = parsePolygonQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const histRes = await fetchImpl(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}` +
        `?adjusted=true&sort=asc&limit=365&apiKey=${apiKey}`,
    );
    historical = parsePolygonHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "polygon",
    },
    historical,
    source: "polygon",
    cached: false,
  };
}
