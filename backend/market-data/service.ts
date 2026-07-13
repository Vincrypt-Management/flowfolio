// backend/market-data/service.ts
import type { MarketDataResult } from "../../packages/core/market-data/types.ts";
import type { ProviderKeys } from "../../packages/core/market-data/orchestrator.ts";
import { MarketDataOrchestrator } from "../../packages/core/market-data/orchestrator.ts";
import { TtlCache } from "../../packages/core/cache/memory.ts";
import { CircuitBreakerManager } from "../../packages/core/resilience/circuit_breaker.ts";
import type { SecretStore } from "../../packages/core/persistence/secret-store.ts";
import type { SqliteCache } from "../cache/sqlite.ts";

const MEMORY_CACHE_TTL_MS = 120_000; // matches the Rust source's quote_cache_ttl

// Bounds fan-out concurrency (e.g. for getBatchQuotes) so a large symbol batch
// doesn't burst through a shared provider's sliding-window rate limit.
// Mirrors orchestrator.ts's own (unexported) mapWithConcurrency helper.
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

export interface MarketDataServiceOptions {
  fetchImpl?: typeof fetch;
}

export class MarketDataService {
  #sqliteCache: SqliteCache;
  #secretStore: SecretStore;
  #memoryCache = new TtlCache<MarketDataResult>(MEMORY_CACHE_TTL_MS);
  #circuitBreakers = new CircuitBreakerManager();
  #orchestrator = new MarketDataOrchestrator();
  #fetchImpl?: typeof fetch;
  #keysCache: ProviderKeys | null = null;

  constructor(sqliteCache: SqliteCache, secretStore: SecretStore, options: MarketDataServiceOptions = {}) {
    this.#sqliteCache = sqliteCache;
    this.#secretStore = secretStore;
    this.#fetchImpl = options.fetchImpl;
  }

  async #loadKeys(): Promise<ProviderKeys> {
    if (this.#keysCache) return this.#keysCache;
    const [alpacaKey, alpacaSecret, finnhubKey, fmpKey, tiingoKey, twelveDataKey, polygonKey, alphaVantageKey] =
      await Promise.all([
        this.#secretStore.getSecret("ALPACA_API_KEY"),
        this.#secretStore.getSecret("ALPACA_SECRET_KEY"),
        this.#secretStore.getSecret("FINNHUB_API_KEY"),
        this.#secretStore.getSecret("FMP_API_KEY"),
        this.#secretStore.getSecret("TIINGO_API_KEY"),
        this.#secretStore.getSecret("TWELVE_DATA_API_KEY"),
        this.#secretStore.getSecret("POLYGON_API_KEY"),
        this.#secretStore.getSecret("ALPHA_VANTAGE_API_KEY"),
      ]);
    this.#keysCache = {
      alpacaKey: alpacaKey ?? undefined,
      alpacaSecret: alpacaSecret ?? undefined,
      finnhubKey: finnhubKey ?? undefined,
      fmpKey: fmpKey ?? undefined,
      tiingoKey: tiingoKey ?? undefined,
      twelveDataKey: twelveDataKey ?? undefined,
      polygonKey: polygonKey ?? undefined,
      alphaVantageKey: alphaVantageKey ?? undefined,
    };
    return this.#keysCache;
  }

  async getMarketData(symbol: string): Promise<MarketDataResult> {
    const upper = symbol.toUpperCase();

    const memHit = this.#memoryCache.get(upper);
    if (memHit) return { ...memHit, cached: true };

    const cachedPrice = this.#sqliteCache.getCachedPrice(upper);
    if (cachedPrice) {
      const result: MarketDataResult = {
        quote: {
          symbol: upper,
          price: cachedPrice.currentPrice,
          change: 0,
          changePercent: 0,
          volume: 0,
          timestamp: cachedPrice.updatedAt,
          source: "cache",
        },
        historical: [],
        source: "cache",
        cached: true,
      };
      this.#memoryCache.set(upper, result);
      return result;
    }

    const keys = await this.#loadKeys();
    const result = await this.#circuitBreakers.execute(
      "market_data",
      () => this.#orchestrator.getMarketData(upper, keys, this.#fetchImpl),
    );

    this.#memoryCache.set(upper, result);
    if (result.quote) {
      try {
        this.#sqliteCache.setCachedPrice(upper, result.quote.price);
      } catch {
        // A persistence-layer failure (e.g. disk-full, locked database) shouldn't
        // discard an otherwise-successful fetch — the in-memory cache already has
        // the value, and losing one SQLite write is not fatal.
      }
    }
    return result;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const result = await this.getMarketData(symbol);
    if (!result.quote) {
      throw new Error(`No quote available for ${symbol}`);
    }
    return result.quote.price;
  }

  getCacheStats(): { memoryCacheSize: number } {
    return { memoryCacheSize: this.#memoryCache.size() };
  }

  async getBatchQuotes(symbols: string[]): Promise<Map<string, MarketDataResult>> {
    const out = new Map<string, MarketDataResult>();
    await mapWithConcurrency(symbols, 5, async (symbol) => {
      try {
        out.set(symbol.toUpperCase(), await this.getMarketData(symbol));
      } catch {
        // dropped, matching the orchestrator's own batch behavior
      }
    });
    return out;
  }

  async getBatchPrices(symbols: string[]): Promise<Map<string, number>> {
    const quotes = await this.getBatchQuotes(symbols);
    const out = new Map<string, number>();
    for (const [symbol, result] of quotes) {
      if (result.quote) out.set(symbol, result.quote.price);
    }
    return out;
  }
}
