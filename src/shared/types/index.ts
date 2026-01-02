// Core Types - Shared TypeScript interfaces and types
// This file contains all shared type definitions used across the application

// ============ Market Data Types ============

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

export interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuantMetrics {
  symbol: string;
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  max_drawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
}

export interface MarketDataResponse {
  quote: StockQuote | null;
  historical: HistoricalData[];
  source: DataSource;
}

export type DataSource = 'backend' | 'alpaca' | 'polygon' | 'alphavantage' | 'yahoo' | 'finnhub' | 'tiingo';

// ============ Portfolio Types ============

export interface Portfolio {
  id: string;
  name: string;
  holdings: Holding[];
  cash: number;
  totalValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  symbol: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  value: number;
  gain: number;
  gainPercent: number;
}

export interface AllocationPlan {
  symbol: string;
  targetPercent: number;
  currentPercent: number;
  difference: number;
}

// ============ Vibe Plan Types ============

export interface VibePlan {
  name: string;
  universe: {
    exchanges: string[];
    regions: string[];
    sectors: string[];
    exclude_list: string[];
  };
  filters: Filter[];
  ranking: {
    factors: Factor[];
  };
  portfolio: PortfolioConfig;
  cadence: CadenceConfig;
  risk: RiskConfig;
}

export interface Filter {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
  value: number | [number, number];
}

export interface Factor {
  name: string;
  weight: number;
}

export interface PortfolioConfig {
  maxPositions: number;
  maxPositionSize: number;
  rebalanceThreshold: number;
}

export interface CadenceConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface RiskConfig {
  maxDrawdown: number;
  stopLoss: number;
  takeProfitEnabled: boolean;
}

// ============ Cache Types ============

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  recoverable: boolean;
  retryAfterMs?: number;
}

// ============ Health & Metrics Types ============

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  uptime_seconds: number;
  components: ComponentHealth[];
  metrics: SystemMetrics;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  message?: string;
  last_check: number;
}

export interface SystemMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  cache_hits: number;
  cache_misses: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  p99_response_time_ms: number;
}

export interface ProviderMetrics {
  name: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
  success_rate: number;
  last_success?: number;
  last_failure?: number;
}

// ============ Journal Types ============

export interface JournalEntry {
  id: string;
  eventType: string;
  title: string;
  content: string;
  planVersion?: string;
  tags: string[];
  createdAt: string;
}

export interface JournalFilter {
  eventTypes?: string[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

// ============ Backtest Types ============

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  symbols: string[];
  strategy: string;
}

export interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  trades: Trade[];
}

export interface Trade {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  profit: number;
  profitPercent: number;
}
