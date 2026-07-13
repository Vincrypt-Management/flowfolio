import type { HistoricalPrice, MarketDataResult } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

export function parseYahooChart(json: unknown, symbol: string): MarketDataResult {
  const result = (json as Record<string, unknown>)?.chart &&
    ((json as Record<string, unknown>).chart as Record<string, unknown>).result;
  const first = Array.isArray(result) ? result[0] as Record<string, unknown> : undefined;
  if (!first) throw new Error("yahoo: missing chart.result[0]");

  const meta = first.meta as Record<string, unknown>;
  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose);
  const change = price - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  const timestamp = typeof meta.regularMarketTime === "number"
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  const timestamps = first.timestamp as number[] | undefined;
  const quoteArr = (first.indicators as Record<string, unknown>)?.quote as
    | Record<string, number[]>[]
    | undefined;
  const q = quoteArr?.[0];

  const historical: HistoricalPrice[] = [];
  if (timestamps && q) {
    timestamps.forEach((t, i) => {
      const close = q.close?.[i];
      if (close === null || close === undefined) return;
      historical.push({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open?.[i] ?? close,
        high: q.high?.[i] ?? close,
        low: q.low?.[i] ?? close,
        close,
        volume: q.volume?.[i] ?? 0,
      });
    });
  }

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      volume: Number(meta.regularMarketVolume) || 0,
      timestamp,
      source: "yahoo",
    },
    historical,
    source: "yahoo",
    cached: false,
  };
}

export async function fetchFromYahoo(
  symbol: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("yahoo", 60)) {
    throw new RateLimitedError("yahoo");
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - 365 * 24 * 60 * 60;
  const path = `/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=1d`;

  let res = await fetchImpl(`https://query1.finance.yahoo.com${path}`, { headers: BROWSER_HEADERS });
  if (res.status === 429) {
    // query1 is rate-limited by a different load balancer than query2 — retry there.
    res = await fetchImpl(`https://query2.finance.yahoo.com${path}`, { headers: BROWSER_HEADERS });
  }
  if (!res.ok) throw new Error(`yahoo: HTTP ${res.status}`);

  return parseYahooChart(await res.json(), symbol);
}
