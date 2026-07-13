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

export interface CachedSentiment {
  symbol: string;
  overallSentiment: string;
  sentimentScore: number;
  newsCount: number;
  buzzScore: number;
  updatedAt: string;
}

export interface CachedAnalystRating {
  symbol: string;
  consensusRating: string;
  targetPriceMean: number | null;
  targetPriceHigh: number | null;
  targetPriceLow: number | null;
  numberOfAnalysts: number;
  updatedAt: string;
}

export interface CacheStats {
  priceCount: number;
  quantCount: number;
  sentimentCount: number;
  analystCount: number;
  historicalSymbolCount: number;
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
      .all(symbolRow.id) as {
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }[];

    const prices: DailyPrice[] = rows.map((row) => ({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));

    return prices.length > 0 ? prices : undefined;
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

  getCachedSentiment(symbol: string): CachedSentiment | undefined {
    const row = this.#db
      .prepare("SELECT * FROM sentiment_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        overall_sentiment: string;
        sentiment_score: number;
        news_count: number;
        buzz_score: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.sentiment)) return undefined;
    return {
      symbol: row.symbol,
      overallSentiment: row.overall_sentiment,
      sentimentScore: row.sentiment_score,
      newsCount: row.news_count,
      buzzScore: row.buzz_score,
      updatedAt: row.updated_at,
    };
  }

  setCachedSentiment(s: Omit<CachedSentiment, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO sentiment_cache (symbol, overall_sentiment, sentiment_score, news_count, buzz_score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           overall_sentiment = excluded.overall_sentiment,
           sentiment_score = excluded.sentiment_score,
           news_count = excluded.news_count,
           buzz_score = excluded.buzz_score,
           updated_at = excluded.updated_at`,
      )
      .run(s.symbol, s.overallSentiment, s.sentimentScore, s.newsCount, s.buzzScore, nowTimestamp());
  }

  getCachedAnalystRating(symbol: string): CachedAnalystRating | undefined {
    const row = this.#db
      .prepare("SELECT * FROM analyst_cache WHERE symbol = ?")
      .get(symbol) as
      | {
        symbol: string;
        consensus_rating: string;
        target_price_mean: number | null;
        target_price_high: number | null;
        target_price_low: number | null;
        number_of_analysts: number;
        updated_at: string;
      }
      | undefined;
    if (!row) return undefined;
    if (!isCacheValid(row.updated_at, CACHE_TTL_HOURS.analyst)) return undefined;
    return {
      symbol: row.symbol,
      consensusRating: row.consensus_rating,
      targetPriceMean: row.target_price_mean,
      targetPriceHigh: row.target_price_high,
      targetPriceLow: row.target_price_low,
      numberOfAnalysts: row.number_of_analysts,
      updatedAt: row.updated_at,
    };
  }

  setCachedAnalystRating(r: Omit<CachedAnalystRating, "updatedAt">): void {
    this.#db
      .prepare(
        `INSERT INTO analyst_cache
           (symbol, consensus_rating, target_price_mean, target_price_high, target_price_low, number_of_analysts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           consensus_rating = excluded.consensus_rating,
           target_price_mean = excluded.target_price_mean,
           target_price_high = excluded.target_price_high,
           target_price_low = excluded.target_price_low,
           number_of_analysts = excluded.number_of_analysts,
           updated_at = excluded.updated_at`,
      )
      .run(
        r.symbol,
        r.consensusRating,
        r.targetPriceMean,
        r.targetPriceHigh,
        r.targetPriceLow,
        r.numberOfAnalysts,
        nowTimestamp(),
      );
  }

  clearExpiredCache(): void {
    const cutoff = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

    this.#db.prepare("DELETE FROM price_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.price));
    this.#db.prepare("DELETE FROM quant_metrics_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.quant));
    this.#db.prepare("DELETE FROM sentiment_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.sentiment));
    this.#db.prepare("DELETE FROM analyst_cache WHERE updated_at < ?").run(cutoff(CACHE_TTL_HOURS.analyst));
  }

  getCacheStats(): CacheStats {
    const count = (sql: string) => (this.#db.prepare(sql).get() as { count: number }).count;
    return {
      priceCount: count("SELECT COUNT(*) as count FROM price_cache"),
      quantCount: count("SELECT COUNT(*) as count FROM quant_metrics_cache"),
      sentimentCount: count("SELECT COUNT(*) as count FROM sentiment_cache"),
      analystCount: count("SELECT COUNT(*) as count FROM analyst_cache"),
      historicalSymbolCount: count("SELECT COUNT(DISTINCT symbol_id) as count FROM prices_daily"),
    };
  }
}
