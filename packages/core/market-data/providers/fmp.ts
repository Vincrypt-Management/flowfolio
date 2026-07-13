import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseFmpQuote(json: unknown): ProviderQuote {
  const first = Array.isArray(json) ? json[0] : undefined;
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "fmp" });
  }
  const symbol = (first as Record<string, unknown>).symbol;
  if (typeof symbol !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "fmp", field: "symbol" });
  }
  const price = parseRequiredF64(first, "price", "fmp");
  const volume = parseOptionalI64(first, "volume", "fmp");
  return { symbol, price, bid: null, ask: null, volume };
}

export function parseFmpHistorical(json: unknown): HistoricalPrice[] {
  const arr = (json as Record<string, unknown>)?.historical;
  if (!Array.isArray(arr)) {
    throw new ParseFailure({ kind: "missing_field", provider: "fmp", field: "historical" });
  }
  const out: HistoricalPrice[] = [];
  arr.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "fmp");
    } catch {
      return;
    }
    const open = (bar as Record<string, unknown>).open as number ?? close;
    const high = (bar as Record<string, unknown>).high as number ?? close;
    const low = (bar as Record<string, unknown>).low as number ?? close;
    const volume = (bar as Record<string, unknown>).volume as number ?? 0;
    const date = (bar as Record<string, unknown>).date as string ?? "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "fmp" });
  }
  return out;
}

export async function fetchFromFmp(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("fmp", 4)) {
    throw new RateLimitedError("fmp");
  }

  let quote = null;
  try {
    const quoteRes = await fetchImpl(
      `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`,
    );
    const quoteJson = await quoteRes.json();
    const pq = parseFmpQuote(quoteJson);
    // FMP's /quote response carries real change/changesPercentage fields
    // (note the Rust source's exact field name — "changesPercentage", not
    // "changePercentage") on the same array element parseFmpQuote already
    // reads — extracted directly here, matching multi_source_provider.rs:1022-1035.
    const first = (quoteJson as unknown[])[0] as Record<string, unknown>;
    const change = typeof first.change === "number" ? first.change : 0;
    const changePercent = typeof first.changesPercentage === "number" ? first.changesPercentage : 0;
    quote = {
      symbol: pq.symbol,
      price: pq.price,
      change,
      changePercent,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "fmp",
    };
  } catch {
    // soft-fail to null quote, matching the Rust source
  }

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${apiKey}`,
    );
    historical = parseFmpHistorical(await histRes.json()).slice(0, 365);
  } catch {
    // non-fatal
  }

  return { quote, historical, source: "fmp", cached: false };
}
