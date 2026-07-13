// packages/core/market-data/providers/nasdaq.ts
import type { MarketDataResult } from "../types.ts";
import { RateLimitedError, type SlidingWindowRateLimiter } from "../rate-limiter.ts";

export function parseNasdaqQuote(
  json: unknown,
): { price: number; change: number; changePercent: number } {
  const primary =
    ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.primaryData as
      | Record<string, unknown>
      | undefined;
  if (!primary) throw new Error("nasdaq: missing data.primaryData");

  const priceStr = String(primary.lastSalePrice ?? "").replace(/[$,]/g, "");
  const price = Number(priceStr);
  if (!price || price === 0) {
    throw new Error(`nasdaq: zero or unparseable price '${primary.lastSalePrice}'`);
  }
  const change = Number(String(primary.netChange ?? "0").replace(/,/g, ""));
  const changePercent = Number(String(primary.percentageChange ?? "0").replace(/[%,]/g, ""));

  return { price, change, changePercent };
}

export async function fetchFromNasdaq(
  symbol: string,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataResult> {
  if (!rateLimiter.checkAndConsume("nasdaq", 30)) {
    throw new RateLimitedError("nasdaq");
  }

  const res = await fetchImpl(
    `https://api.nasdaq.com/api/quote/${symbol.toUpperCase()}/info?assetclass=stocks`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    },
  );
  if (!res.ok) throw new Error(`nasdaq: HTTP ${res.status}`);

  const { price, change, changePercent } = parseNasdaqQuote(await res.json());

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      volume: 0,
      timestamp: new Date().toISOString(),
      source: "nasdaq",
    },
    historical: [], // real-time-only by design — matches the Rust source exactly
    source: "nasdaq",
    cached: false,
  };
}
