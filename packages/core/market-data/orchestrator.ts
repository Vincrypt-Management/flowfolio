// packages/core/market-data/orchestrator.ts
import type { MarketDataResult } from "./types.ts";
import { HealthTracker } from "./health-tracker.ts";
import { SlidingWindowRateLimiter } from "./rate-limiter.ts";
import { fetchFromAlpaca } from "./providers/alpaca.ts";
import { fetchFromYahoo } from "./providers/yahoo.ts";
import { fetchFromNasdaq } from "./providers/nasdaq.ts";
import { fetchFromTiingo } from "./providers/tiingo.ts";
import { fetchFromFinnhub } from "./providers/finnhub.ts";
import { fetchFromTwelveData } from "./providers/twelve-data.ts";
import { fetchFromFmp } from "./providers/fmp.ts";
import { fetchFromAlphaVantage } from "./providers/alpha-vantage.ts";
import { fetchFromPolygon } from "./providers/polygon.ts";

export interface ProviderKeys {
  alpacaKey?: string;
  alpacaSecret?: string;
  finnhubKey?: string;
  fmpKey?: string;
  tiingoKey?: string;
  twelveDataKey?: string;
  polygonKey?: string;
  alphaVantageKey?: string;
}

type Fetcher = (
  symbol: string,
  keys: ProviderKeys,
  rateLimiter: SlidingWindowRateLimiter,
  fetchImpl: typeof fetch,
) => Promise<MarketDataResult>;

const PROVIDERS: Record<string, { requiresKeys: (keyof ProviderKeys)[]; fetch: Fetcher }> = {
  alpaca: {
    requiresKeys: ["alpacaKey", "alpacaSecret"],
    fetch: (s, k, rl, f) => fetchFromAlpaca(s, k.alpacaKey!, k.alpacaSecret!, rl, f),
  },
  yahoo: { requiresKeys: [], fetch: (s, _k, rl, f) => fetchFromYahoo(s, rl, f) },
  nasdaq: { requiresKeys: [], fetch: (s, _k, rl, f) => fetchFromNasdaq(s, rl, f) },
  tiingo: {
    requiresKeys: ["tiingoKey"],
    fetch: (s, k, rl, f) => fetchFromTiingo(s, k.tiingoKey!, rl, f),
  },
  finnhub: {
    requiresKeys: ["finnhubKey"],
    fetch: (s, k, rl, f) => fetchFromFinnhub(s, k.finnhubKey!, rl, f),
  },
  twelve_data: {
    requiresKeys: ["twelveDataKey"],
    fetch: (s, k, rl, f) => fetchFromTwelveData(s, k.twelveDataKey!, rl, f),
  },
  fmp: { requiresKeys: ["fmpKey"], fetch: (s, k, rl, f) => fetchFromFmp(s, k.fmpKey!, rl, f) },
  alphavantage: {
    requiresKeys: ["alphaVantageKey"],
    fetch: (s, k, rl, f) => fetchFromAlphaVantage(s, k.alphaVantageKey!, rl, f),
  },
  polygon: {
    requiresKeys: ["polygonKey"],
    fetch: (s, k, rl, f) => fetchFromPolygon(s, k.polygonKey!, rl, f),
  },
};

function isConfigured(name: string, keys: ProviderKeys): boolean {
  return PROVIDERS[name].requiresKeys.every((k) => Boolean(keys[k]));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export class MarketDataOrchestrator {
  #health: HealthTracker;
  #rateLimiter: SlidingWindowRateLimiter;

  constructor(healthTracker = new HealthTracker(), rateLimiter = new SlidingWindowRateLimiter()) {
    this.#health = healthTracker;
    this.#rateLimiter = rateLimiter;
  }

  async getMarketData(
    symbol: string,
    keys: ProviderKeys,
    fetchImpl: typeof fetch = fetch,
  ): Promise<MarketDataResult> {
    const upper = symbol.toUpperCase();
    const available = Object.keys(PROVIDERS).filter((name) => isConfigured(name, keys));
    const order = this.#health.getProviderOrder(available);

    const errors: string[] = [];
    for (const name of order) {
      try {
        const result = await PROVIDERS[name].fetch(upper, keys, this.#rateLimiter, fetchImpl);
        this.#health.trackSuccess(name);
        return result;
      } catch (e) {
        this.#health.trackFailure(name);
        errors.push(`  - ${name}: ${(e as Error).message}`);
      }
    }
    throw new Error(`All providers failed for ${upper}:\n${errors.join("\n")}`);
  }

  async getBatchMarketData(
    symbols: string[],
    keys: ProviderKeys,
    fetchImpl: typeof fetch = fetch,
  ): Promise<Map<string, MarketDataResult>> {
    const out = new Map<string, MarketDataResult>();
    const results = await mapWithConcurrency(symbols, 5, async (symbol) => {
      try {
        return [symbol, await this.getMarketData(symbol, keys, fetchImpl)] as const;
      } catch {
        return null;
      }
    });
    for (const r of results) {
      if (r) out.set(r[0], r[1]);
    }
    return out;
  }

  getHealthStats(): Record<string, { successes: number; failures: number }> {
    return this.#health.snapshot();
  }
}
