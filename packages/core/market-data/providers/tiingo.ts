import type { HistoricalPrice, MarketDataResult, ProviderQuote } from "../types.ts";
import { parseOptionalF64, parseOptionalI64, parseRequiredF64, ParseFailure } from "../parse-helpers.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseTiingoQuote(json: unknown): ProviderQuote {
  const first = Array.isArray(json) ? json[0] : undefined;
  if (!first) {
    throw new ParseFailure({ kind: "empty_response", provider: "tiingo" });
  }
  const ticker = (first as Record<string, unknown>).ticker;
  if (typeof ticker !== "string") {
    throw new ParseFailure({ kind: "missing_field", provider: "tiingo", field: "ticker" });
  }
  const price = parseRequiredF64(first, "last", "tiingo");
  const volume = parseOptionalI64(first, "volume", "tiingo");
  const bid = parseOptionalF64(first, "bidPrice", "tiingo");
  const ask = parseOptionalF64(first, "askPrice", "tiingo");
  return { symbol: ticker, price, bid, ask, volume };
}

export function parseTiingoHistorical(json: unknown): HistoricalPrice[] {
  if (!Array.isArray(json)) {
    throw new ParseFailure({
      kind: "invalid_type",
      provider: "tiingo",
      field: "(root)",
      expected: "array",
      got: JSON.stringify(json),
    });
  }
  const out: HistoricalPrice[] = [];
  json.forEach((bar) => {
    let close: number;
    try {
      close = parseRequiredF64(bar, "close", "tiingo");
    } catch {
      return;
    }
    const b = bar as Record<string, unknown>;
    const open = (b.open as number) ?? close;
    const high = (b.high as number) ?? close;
    const low = (b.low as number) ?? close;
    const volume = (b.volume as number) ?? 0;
    const date = typeof b.date === "string" ? b.date.slice(0, 10) : "";
    out.push({ date, open, high, low, close, volume });
  });
  if (out.length === 0) {
    throw new ParseFailure({ kind: "empty_response", provider: "tiingo" });
  }
  return out;
}

export async function fetchFromTiingo(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("tiingo", 7)) {
    throw new RateLimitedError("tiingo");
  }

  let quote = null;
  try {
    const quoteRes = await fetchImpl(`https://api.tiingo.com/iex/${symbol}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const pq = parseTiingoQuote(await quoteRes.json());
    quote = {
      symbol: pq.symbol,
      price: pq.price,
      change: 0,
      changePercent: 0,
      volume: pq.volume ?? 0,
      timestamp: new Date().toISOString(),
      source: "tiingo",
    };
  } catch {
    // soft-fail to null quote
  }

  let historical: HistoricalPrice[] = [];
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const histRes = await fetchImpl(
      `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Token ${apiKey}` } },
    );
    historical = parseTiingoHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return { quote, historical, source: "tiingo", cached: false };
}
