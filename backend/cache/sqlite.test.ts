import { assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "../db/connection.ts";
import { SqliteCache } from "./sqlite.ts";

function withCache(fn: (cache: SqliteCache) => void) {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    fn(new SqliteCache(db));
  } finally {
    closeDatabase(db);
  }
}

Deno.test("price cache: miss returns undefined", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedPrice("AAPL"), undefined);
  });
});

Deno.test("price cache: set then get round-trips within TTL", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 123.45);
    const cached = cache.getCachedPrice("AAPL");
    assertEquals(cached?.symbol, "AAPL");
    assertEquals(cached?.currentPrice, 123.45);
  });
});

Deno.test("price cache: set twice upserts rather than duplicating rows", () => {
  withCache((cache) => {
    cache.setCachedPrice("AAPL", 100);
    cache.setCachedPrice("AAPL", 200);
    assertEquals(cache.getCachedPrice("AAPL")?.currentPrice, 200);
  });
});

Deno.test("quant metrics cache: miss returns undefined", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedQuantMetrics("AAPL"), undefined);
  });
});

Deno.test("quant metrics cache: set then get round-trips", () => {
  withCache((cache) => {
    cache.setCachedQuantMetrics({
      symbol: "AAPL",
      sharpeRatio: 1.2,
      annualizedReturn: 0.15,
      volatility: 0.2,
      maxDrawdown: -0.1,
      rsi: 55,
      signal: "BUY",
      confidence: 0.8,
    });
    const cached = cache.getCachedQuantMetrics("AAPL");
    assertEquals(cached?.signal, "BUY");
    assertEquals(cached?.sharpeRatio, 1.2);
  });
});
