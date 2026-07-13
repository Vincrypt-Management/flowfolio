import type { DatabaseSync } from "node:sqlite";
import { assertEquals } from "jsr:@std/assert";
import { closeDatabase, openDatabase } from "../db/connection.ts";
import { CACHE_TTL_HOURS, SqliteCache } from "./sqlite.ts";
import type { DailyPrice } from "./sqlite.ts";

function withCache(fn: (cache: SqliteCache, db: DatabaseSync) => void) {
  const path = `${Deno.makeTempDirSync()}/test.db`;
  const db = openDatabase(path);
  try {
    fn(new SqliteCache(db), db);
  } finally {
    closeDatabase(db);
  }
}

// Formats a Date the same way sqlite.ts's internal `nowTimestamp()` does,
// so directly-inserted rows use a timestamp `isCacheValid()` can parse.
function formatTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// Computes an `updated_at` value older than the given TTL, for inserting
// stale rows directly (bypassing the setters, which always stamp "now").
function staleTimestamp(ttlHours: number): string {
  const staleMs = Date.now() - (ttlHours + 1) * 60 * 60 * 1000;
  return formatTimestamp(new Date(staleMs));
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

Deno.test("price cache: stale row past TTL returns undefined, not the stale value", () => {
  withCache((cache, db) => {
    db.prepare(
      "INSERT INTO price_cache (symbol, current_price, updated_at) VALUES (?, ?, ?)",
    ).run("AAPL", 999, staleTimestamp(CACHE_TTL_HOURS.price));

    assertEquals(cache.getCachedPrice("AAPL"), undefined);
  });
});

Deno.test("quant metrics cache: stale row past TTL returns undefined, not the stale value", () => {
  withCache((cache, db) => {
    db.prepare(
      `INSERT INTO quant_metrics_cache
         (symbol, sharpe_ratio, annualized_return, volatility, max_drawdown, rsi, signal, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("AAPL", 1.2, 0.15, 0.2, -0.1, 55, "BUY", 0.8, staleTimestamp(CACHE_TTL_HOURS.quant));

    assertEquals(cache.getCachedQuantMetrics("AAPL"), undefined);
  });
});

Deno.test("historical prices: miss returns undefined for an unknown symbol", () => {
  withCache((cache) => {
    assertEquals(cache.getCachedHistoricalPrices("AAPL"), undefined);
  });
});

Deno.test("historical prices: set then get round-trips, newest first", () => {
  withCache((cache) => {
    const prices: DailyPrice[] = [
      { date: todayMinusDays(1), open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
      { date: todayMinusDays(0), open: 10.5, high: 12, low: 10, close: 11.5, volume: 1500 },
    ];
    cache.setCachedHistoricalPrices("AAPL", prices);
    const cached = cache.getCachedHistoricalPrices("AAPL");
    assertEquals(cached?.length, 2);
    assertEquals(cached?.[0].date, todayMinusDays(0));
  });
});

Deno.test("historical prices: stale data (>2 days old) is treated as a miss", () => {
  withCache((cache) => {
    cache.setCachedHistoricalPrices("AAPL", [
      { date: todayMinusDays(5), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);
    assertEquals(cache.getCachedHistoricalPrices("AAPL"), undefined);
  });
});

function todayMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
