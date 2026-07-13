import type { HistoricalPrice, MarketDataResult } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export interface AlphaVantageQuote {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

function num(s: unknown): number {
  const n = Number(String(s).replace("%", ""));
  if (Number.isNaN(n)) throw new Error(`alphavantage: unparseable number '${s}'`);
  return n;
}

export function parseAlphaVantageQuote(json: unknown): AlphaVantageQuote {
  const obj = json as Record<string, unknown>;
  if (obj?.Note) throw new Error(`alphavantage: rate limit (Note: ${obj.Note})`);
  if (obj?.Information) throw new Error(`alphavantage: rate limit (Information: ${obj.Information})`);
  const q = obj?.["Global Quote"] as Record<string, unknown> | undefined;
  if (!q) throw new Error("alphavantage: missing 'Global Quote'");
  return {
    price: num(q["05. price"]),
    change: num(q["09. change"]),
    changePercent: num(q["10. change percent"]),
    volume: num(q["06. volume"]),
    timestamp: typeof q["07. latest trading day"] === "string" ? q["07. latest trading day"] as string : "",
  };
}

export function parseAlphaVantageHistorical(json: unknown): HistoricalPrice[] {
  const series = (json as Record<string, unknown>)?.["Time Series (Daily)"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!series) throw new Error("alphavantage: missing 'Time Series (Daily)'");

  const out: HistoricalPrice[] = Object.entries(series).map(([date, bar]) => ({
    date,
    open: num(bar["1. open"]),
    high: num(bar["2. high"]),
    low: num(bar["3. low"]),
    close: num(bar["5. adjusted close"]),
    volume: num(bar["6. volume"]),
  }));

  // Deliberate fix over the Rust source: sort by date descending BEFORE truncating,
  // so the 365-day cap actually captures the most recent year (see task notes).
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, 365);
}

export async function fetchFromAlphaVantage(
  symbol: string,
  apiKey: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("alphavantage", 4)) {
    throw new RateLimitedError("alphavantage");
  }

  const quoteRes = await fetchImpl(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`,
  );
  const pq = parseAlphaVantageQuote(await quoteRes.json());

  let historical: HistoricalPrice[] = [];
  try {
    const histRes = await fetchImpl(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&apikey=${apiKey}`,
    );
    historical = parseAlphaVantageHistorical(await histRes.json());
  } catch {
    // non-fatal
  }

  return {
    quote: {
      symbol,
      price: pq.price,
      change: pq.change,
      changePercent: pq.changePercent,
      volume: pq.volume,
      timestamp: pq.timestamp || new Date().toISOString(),
      source: "alphavantage",
    },
    historical,
    source: "alphavantage",
    cached: false,
  };
}
