import type { DatabaseSync } from "node:sqlite";

export const CACHE_TTL_HOURS = {
  price: 1,
  quant: 6,
  fundamentals: 24,
  sentiment: 4,
  analyst: 24,
} as const;

export interface CachedPrice {
  symbol: string;
  currentPrice: number;
  updatedAt: string;
}

export interface DailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CachedQuantMetrics {
  symbol: string;
  sharpeRatio: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
  updatedAt: string;
}

function isCacheValid(updatedAt: string, ttlHours: number): boolean {
  const cachedTime = new Date(updatedAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(cachedTime)) return false;
  const ageMs = Date.now() - cachedTime;
  return ageMs < ttlHours * 60 * 60 * 1000;
}

function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export class SqliteCache {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  getCachedPrice(symbol: string): CachedPrice | undefined {
    const row = this.#db
      .prepare("SELECT symbol, current_price, updated_at FROM price_cache WHERE symbol = ?")
      .get(symbol) as { symbol: string; current_price: number; updated_at: string } | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.price)) return undefined;
    return { symbol: row.symbol, currentPrice: row.current_price, updatedAt: row.updated_at };
  }

  setCachedPrice(symbol: string, price: number): void {
    this.#db
      .prepare(
        `INSERT INTO price_cache (symbol, current_price, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           current_price = excluded.current_price,
           updated_at = excluded.updated_at`,
      )
      .run(symbol, price, nowTimestamp());
  }

  getCachedQuantMetrics(symbol: string): CachedQuantMetrics | undefined {
    const row = this.#db
      .prepare("SELECT * FROM quant_metrics_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        sharpe_ratio: number;
        annualized_return: number;
        volatility: number;
        max_drawdown: number;
        rsi: number;
        signal: string;
        confidence: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.quant)) return undefined;
    return {
      symbol: row.symbol,
      sharpeRatio: row.sharpe_ratio,
      annualizedReturn: row.annualized_return,
      volatility: row.volatility,
      maxDrawdown: row.max_drawdown,
      rsi: row.rsi,
      signal: row.signal,
      confidence: row.confidence,
      updatedAt: row.updated_at,
    };
  }

  setCachedQuantMetrics(m: Omit<CachedQuantMetrics, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO quant_metrics_cache
           (symbol, sharpe_ratio, annualized_return, volatility, max_drawdown, rsi, signal, confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           sharpe_ratio = excluded.sharpe_ratio,
           annualized_return = excluded.annualized_return,
           volatility = excluded.volatility,
           max_drawdown = excluded.max_drawdown,
           rsi = excluded.rsi,
           signal = excluded.signal,
           confidence = excluded.confidence,
           updated_at = excluded.updated_at`,
      )
      .run(
        m.symbol,
        m.sharpeRatio,
        m.annualizedReturn,
        m.volatility,
        m.maxDrawdown,
        m.rsi,
        m.signal,
        m.confidence,
        nowTimestamp(),
      );
  }

  getCachedHistoricalPrices(symbol: string): DailyPrice[] | undefined {
    const symbolRow = this.#db
      .prepare("SELECT id FROM symbols WHERE ticker = ?")
      .get(symbol) as { id: number } | undefined;
    if (!symbolRow) return undefined;

    const latest = this.#db
      .prepare("SELECT date FROM prices_daily WHERE symbol_id = ? ORDER BY date DESC LIMIT 1")
      .get(symbolRow.id) as { date: string } | undefined;
    if (!latest) return undefined;

    const latestDate = new Date(latest.date + "T00:00:00Z").getTime();
    const daysOld = Math.floor((Date.now() - latestDate) / (24 * 60 * 60 * 1000));
    if (daysOld > 2) return undefined;

    const rows = this.#db
      .prepare(
        `SELECT date, open, high, low, close, volume
         FROM prices_daily
         WHERE symbol_id = ?
         ORDER BY date DESC
         LIMIT 365`,
      )
      .all(symbolRow.id) as unknown as DailyPrice[];

    return rows.length > 0 ? rows : undefined;
  }

  setCachedHistoricalPrices(symbol: string, prices: DailyPrice[]): void {
    this.#db
      .prepare("INSERT INTO symbols (ticker, status) VALUES (?, 'active') ON CONFLICT(ticker) DO NOTHING")
      .run(symbol);

    const symbolRow = this.#db
      .prepare("SELECT id FROM symbols WHERE ticker = ?")
      .get(symbol) as { id: number };

    const upsert = this.#db.prepare(
      `INSERT INTO prices_daily (symbol_id, date, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol_id, date) DO UPDATE SET
         open = excluded.open,
         high = excluded.high,
         low = excluded.low,
         close = excluded.close,
         volume = excluded.volume`,
    );

    for (const p of prices) {
      upsert.run(symbolRow.id, p.date, p.open, p.high, p.low, p.close, p.volume);
    }
  }
}
