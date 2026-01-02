// Industrial-Grade Integrated Market Data Service
// Features: Circuit breaker, request deduplication, multi-tier caching, metrics
import { invokeWithResilience, apiClient } from './apiClient';
import { localCacheService } from './localCache';

export interface QuantMetrics {
  symbol: string;
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  max_drawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
  // Extended metrics
  sortino_ratio?: number;
  calmar_ratio?: number;
  beta?: number;
  alpha?: number;
  var_95?: number;
  // Daily returns for correlation analysis
  daily_returns?: number[];
}

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketDataResponse {
  quote: StockQuote | null;
  historical: HistoricalData[];
  source: 'backend' | 'alpaca' | 'polygon' | 'alphavantage' | 'yahoo';
}

interface CacheEntry {
  data: MarketDataResponse;
  timestamp: number;
}

interface CacheStats {
  memory_prices: number;
  memory_quant: number;
  db_stats: [number, number, number, number, number] | null;
  provider_health: Record<string, [number, number]>;
}

interface DataConnectionTestResult {
  status: 'connected' | 'failed';
  test_symbol: string;
  price: number;
  metrics_ok: boolean;
  signal: string;
  cache_stats: {
    memory_prices: number;
    memory_quant: number;
  };
  providers: {
    alpaca: boolean;
    finnhub: boolean;
    fmp: boolean;
    polygon: boolean;
    alphavantage: boolean;
    yahoo: boolean;
  };
}

class MarketDataService {
  // Frontend fallback caching (optimized for reduced API calls)
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes (increased from 5)
  private readonly PERSISTENT_CACHE_KEY = 'flowfolio_market_cache';

  // ================== BACKEND API CALLS (with circuit breaker) ==================

  /**
   * Get current prices for multiple symbols via backend
   * Uses: Local cache -> Backend (with circuit breaker) -> Frontend fallback
   */
  async getCurrentPricesBatch(symbols: string[]): Promise<Record<string, number>> {
    // 1. Check local IndexedDB cache first
    const cached = await localCacheService.getPricesBatch(symbols);
    const cachedSymbols = Object.keys(cached);
    const missingSymbols = symbols.filter(s => !cachedSymbols.includes(s));
    
    if (missingSymbols.length === 0) {
      apiClient.recordCacheHit();
      console.log(`All ${symbols.length} prices from local cache`);
      return cached;
    }
    
    apiClient.recordCacheMiss();
    
    // 2. Fetch missing from backend with resilience
    try {
      const result = await invokeWithResilience<Record<string, number>>(
        'get_current_prices_batch', 
        { symbols: missingSymbols }
      );
      
      if (Object.keys(result).length > 0) {
        // Cache the results
        for (const [symbol, price] of Object.entries(result)) {
          localCacheService.setPrice(symbol, price);
        }
        console.log(`Backend: Got ${Object.keys(result).length}/${missingSymbols.length} prices`);
        return { ...cached, ...result };
      }
      
      // Fallback to frontend fetching
      console.warn('Backend returned no prices, falling back to frontend...');
      const fallback = await this.fetchPricesFrontend(missingSymbols);
      return { ...cached, ...fallback };
    } catch (error) {
      console.error('Backend price fetch failed:', error);
      const fallback = await this.fetchPricesFrontend(missingSymbols);
      return { ...cached, ...fallback };
    }
  }

  /**
   * Get quantitative metrics for multiple symbols via backend
   * Uses circuit breaker pattern for resilience
   */
  async getQuantMetricsBatch(symbols: string[]): Promise<QuantMetrics[]> {
    try {
      return await invokeWithResilience<QuantMetrics[]>('get_quant_metrics_batch', { symbols });
    } catch (error) {
      console.error('Failed to fetch quant metrics batch:', error);
      return symbols.map(symbol => ({
        symbol,
        sharpe_ratio: 0,
        annualized_return: 0,
        volatility: 0,
        max_drawdown: 0,
        rsi: 50,
        signal: 'INSUFFICIENT DATA',
        confidence: 0
      }));
    }
  }

  /**
   * Get single symbol current price via backend
   * Uses circuit breaker pattern for resilience
   */
  async getCurrentPriceSingle(symbol: string): Promise<number> {
    // Check local cache first
    const cached = await localCacheService.getPrice(symbol);
    if (cached !== null) {
      apiClient.recordCacheHit();
      return cached;
    }
    apiClient.recordCacheMiss();
    
    try {
      const price = await invokeWithResilience<number>('get_current_price_single', { symbol });
      localCacheService.setPrice(symbol, price);
      return price;
    } catch (error) {
      console.error(`Failed to fetch current price for ${symbol}:`, error);
      const prices = await this.fetchPricesFrontend([symbol]);
      return prices[symbol] || 0;
    }
  }

  /**
   * Get single symbol quantitative metrics via backend
   */
  async getQuantMetricsSingle(symbol: string): Promise<QuantMetrics> {
    try {
      return await invokeWithResilience<QuantMetrics>('get_quant_metrics_single', { symbol });
    } catch (error) {
      console.error(`Failed to fetch quant metrics for ${symbol}:`, error);
      return {
        symbol,
        sharpe_ratio: 0,
        annualized_return: 0,
        volatility: 0,
        max_drawdown: 0,
        rsi: 50,
        signal: 'INSUFFICIENT DATA',
        confidence: 0
      };
    }
  }

  /**
   * Prefetch symbols in backend for faster access
   */
  async prefetchSymbols(symbols: string[]): Promise<void> {
    try {
      await invokeWithResilience('prefetch_symbols', { symbols });
      console.log(`Prefetched ${symbols.length} symbols`);
    } catch (error) {
      console.warn('Prefetch failed:', error);
    }
  }

  /**
   * Get backend cache statistics
   */
  async getCacheStats(): Promise<CacheStats | null> {
    try {
      return await invokeWithResilience<CacheStats>('get_cache_stats');
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  /**
   * Clear all backend caches
   */
  async clearAllCaches(): Promise<void> {
    try {
      await invokeWithResilience('clear_all_caches', {});
      this.cache.clear();
      await localCacheService.clearAll();
      console.log('[INFO] All caches cleared');
    } catch (error) {
      console.error('Failed to clear caches:', error);
    }
  }

  /**
   * Test data connection - verifies backend can fetch market data
   */
  async testDataConnection(): Promise<DataConnectionTestResult | null> {
    try {
      return await invokeWithResilience<DataConnectionTestResult>('test_data_connection', {});
    } catch (error) {
      console.error('Failed to test data connection:', error);
      return null;
    }
  }

  /**
   * Get client metrics for observability
   */
  getClientMetrics() {
    return apiClient.getMetrics();
  }

  // ================== FRONTEND FALLBACK ==================

  /**
   * Frontend fallback for fetching prices (when backend unavailable)
   */
  private async fetchPricesFrontend(symbols: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    
    // Check localStorage cache first
    for (const symbol of symbols) {
      const cacheKey = `price_cache_${symbol}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { price, timestamp } = JSON.parse(cached);
          // Use cache if less than 1 hour old
          if (Date.now() - timestamp < 60 * 60 * 1000) {
            results[symbol] = price;
            continue;
          }
        } catch {}
      }
    }

    // Fetch remaining from Yahoo Finance
    const symbolsToFetch = symbols.filter(s => !results[s]);
    
    for (let i = 0; i < symbolsToFetch.length; i += 5) {
      const batch = symbolsToFetch.slice(i, i + 5);
      
      await Promise.all(batch.map(async (symbol) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
          });

          if (response.ok) {
            const data = await response.json();
            const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) {
              results[symbol] = price;
              localStorage.setItem(`price_cache_${symbol}`, JSON.stringify({ 
                price, 
                timestamp: Date.now() 
              }));
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch price for ${symbol}:`, e);
        }
      }));

      // Rate limiting delay
      if (i + 5 < symbolsToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // ================== LEGACY API (for backwards compatibility) ==================

  /**
   * Get market data (quote + historical) - uses backend primarily
   */
  async getMarketData(symbol: string): Promise<MarketDataResponse> {
    // Check frontend cache first for instant response
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Get price from backend
      const price = await this.getCurrentPriceSingle(symbol);
      
      const response: MarketDataResponse = {
        quote: {
          symbol,
          price,
          change: 0,
          changePercent: 0,
          volume: 0,
          timestamp: new Date().toISOString(),
        },
        historical: [],
        source: 'backend'
      };

      // Cache the result
      this.cache.set(symbol, { data: response, timestamp: Date.now() });
      
      return response;
    } catch (error) {
      console.error(`Failed to get market data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Batch fetch market data
   */
  async getBatchMarketData(
    symbols: string[],
    _concurrency: number = 5,
    onProgress?: (symbol: string, data: MarketDataResponse) => void,
  ): Promise<Record<string, MarketDataResponse>> {
    const results: Record<string, MarketDataResponse> = {};
    
    // Get prices from backend
    const prices = await this.getCurrentPricesBatch(symbols);
    
    for (const [symbol, price] of Object.entries(prices)) {
      const data: MarketDataResponse = {
        quote: {
          symbol,
          price,
          change: 0,
          changePercent: 0,
          volume: 0,
          timestamp: new Date().toISOString(),
        },
        historical: [],
        source: 'backend'
      };
      
      results[symbol] = data;
      
      if (onProgress) {
        onProgress(symbol, data);
      }
    }
    
    return results;
  }

  /**
   * Preload symbols for instant access
   */
  async preloadSymbols(symbols: string[]): Promise<void> {
    await this.prefetchSymbols(symbols);
  }

  /**
   * Clear frontend cache
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
      localStorage.removeItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      localStorage.removeItem(`price_cache_${symbol}`);
    } else {
      this.cache.clear();
      // Clear all persistent cache entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PERSISTENT_CACHE_KEY) || key?.startsWith('price_cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }

  // Alpaca account methods (if still needed directly)
  async getAlpacaAccount() {
    const alpacaKey = import.meta.env.VITE_ALPACA_API_KEY;
    const alpacaSecret = import.meta.env.VITE_ALPACA_API_SECRET;
    const isPaper = import.meta.env.VITE_ALPACA_PAPER_TRADING === 'true';
    
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    
    const response = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret,
      },
    });
    return await response.json();
  }

  async getAlpacaPositions() {
    const alpacaKey = import.meta.env.VITE_ALPACA_API_KEY;
    const alpacaSecret = import.meta.env.VITE_ALPACA_API_SECRET;
    const isPaper = import.meta.env.VITE_ALPACA_PAPER_TRADING === 'true';
    
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    
    const response = await fetch(`${baseUrl}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': alpacaKey,
        'APCA-API-SECRET-KEY': alpacaSecret,
      },
    });
    return await response.json();
  }
}

export const marketDataService = new MarketDataService();
export type { StockQuote, HistoricalData, MarketDataResponse, CacheStats, DataConnectionTestResult };
