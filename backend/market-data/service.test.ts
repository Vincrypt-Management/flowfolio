// backend/market-data/service.test.ts
import { assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "../db/connection.ts";
import { SqliteCache } from "../cache/sqlite.ts";
import { MarketDataService } from "./service.ts";
import type { SecretStore } from "../../packages/core/persistence/secret-store.ts";
import type { MarketDataResult } from "../../packages/core/market-data/types.ts";

function fakeSecretStore(secrets: Record<string, string>): SecretStore {
  return {
    setSecret: async () => {},
    getSecret: async (account) => secrets[account] ?? null,
    deleteSecret: async () => {},
  };
}

Deno.test("getCurrentPrice returns the orchestrator's price and populates both cache tiers", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: 213.4,
                    chartPreviousClose: 211.9,
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        )) as typeof fetch,
    });

    const price = await service.getCurrentPrice("AAPL");
    assertEquals(price, 213.4);
    assertEquals(sqliteCache.getCachedPrice("AAPL")?.currentPrice, 213.4);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getCurrentPrice serves from the in-memory cache on a second call without refetching", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    let fetchCount = 0;
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() => {
        fetchCount += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: 100,
                    chartPreviousClose: 99,
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        );
      }) as typeof fetch,
    });

    await service.getCurrentPrice("AAPL");
    await service.getCurrentPrice("AAPL");
    assertEquals(fetchCount, 1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getCacheStats reports the in-memory cache size", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: { regularMarketPrice: 1, chartPreviousClose: 1, regularMarketVolume: 1, regularMarketTime: 1 },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        )) as typeof fetch,
    });
    await service.getCurrentPrice("AAPL");
    assertEquals(service.getCacheStats().memoryCacheSize, 1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getBatchPrices returns a price per successful symbol, using per-symbol caching", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const responses: Record<string, number> = { AAPL: 213.4, MSFT: 420.1 };
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: ((input: RequestInfo | URL) => {
        const url = String(input);
        const symbol = Object.keys(responses).find((s) => url.includes(`/${s}?`)) ?? "AAPL";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: responses[symbol],
                    chartPreviousClose: responses[symbol],
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        );
      }) as typeof fetch,
    });

    const prices = await service.getBatchPrices(["AAPL", "MSFT"]);
    assertEquals(prices.get("AAPL"), 213.4);
    assertEquals(prices.get("MSFT"), 420.1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getMarketData swallows a SQLite cache write failure and still returns the fresh result", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    sqliteCache.setCachedPrice = () => {
      throw new Error("disk full");
    };
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              chart: {
                result: [{
                  meta: {
                    regularMarketPrice: 150,
                    chartPreviousClose: 149,
                    regularMarketVolume: 1,
                    regularMarketTime: 1,
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                }],
              },
            }),
          ),
        )) as typeof fetch,
    });

    const price = await service.getCurrentPrice("AAPL");
    assertEquals(price, 150);
    assertEquals(service.getCacheStats().memoryCacheSize, 1);
  } finally {
    closeDatabase(db);
  }
});

Deno.test("getBatchQuotes drops symbols whose fetch failed", async () => {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    const sqliteCache = new SqliteCache(db);
    const service = new MarketDataService(sqliteCache, fakeSecretStore({}), {
      fetchImpl: (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch,
    });
    const quotes = await service.getBatchQuotes(["AAPL"]);
    assertEquals(quotes.size, 0);
  } finally {
    closeDatabase(db);
  }
});
