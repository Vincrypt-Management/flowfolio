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

export interface CacheStore {
  getCachedPrice(symbol: string): CachedPrice | undefined;
  setCachedPrice(symbol: string, price: number): void;
  getCachedQuantMetrics(symbol: string): CachedQuantMetrics | undefined;
  setCachedQuantMetrics(m: Omit<CachedQuantMetrics, "updatedAt">): void;
  getCachedHistoricalPrices(symbol: string): DailyPrice[] | undefined;
  setCachedHistoricalPrices(symbol: string, prices: DailyPrice[]): void;
  getCachedSentiment(symbol: string): CachedSentiment | undefined;
  setCachedSentiment(s: Omit<CachedSentiment, "updatedAt">): void;
  getCachedAnalystRating(symbol: string): CachedAnalystRating | undefined;
  setCachedAnalystRating(r: Omit<CachedAnalystRating, "updatedAt">): void;
  clearExpiredCache(): void;
  getCacheStats(): CacheStats;
}
