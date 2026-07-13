// packages/core/market-data/types.ts

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  source: string;
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataResult {
  quote: StockQuote | null;
  historical: HistoricalPrice[];
  source: string;
  cached: boolean;
}

/** Intermediate quote returned by pure parser functions; callers map this into StockQuote. */
export interface ProviderQuote {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
}
