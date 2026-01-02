// Market Data Service
// Unified API for fetching market data with multi-tier caching

import { apiClient, invokeCommand } from '../../core/api';
import { cacheService } from '../../core/cache';
import { handleError } from '../../core/errors';
import type { 
  QuantMetrics, 
  HistoricalData, 
  ProviderMetrics 
} from '../../shared/types';

// ============ Service Class ============

class MarketDataService {
  // In-memory cache for ultra-fast access
  private memoryCache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly MEMORY_TTL = 60 * 1000; // 1 minute

  // ============ Price APIs ============

  /**
   * Get current prices for multiple symbols
   * Cache hierarchy: Memory → IndexedDB → Backend
   */
  async getPricesBatch(symbols: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const missingSymbols: string[] = [];

    // 1. Check memory cache
    for (const symbol of symbols) {
      const cached = this.getFromMemory<number>(`price:${symbol}`);
      if (cached !== null) {
        results[symbol] = cached;
      } else {
        missingSymbols.push(symbol);
      }
    }

    if (missingSymbols.length === 0) {
      apiClient.recordCacheHit();
      return results;
    }

    // 2. Check IndexedDB cache
    const dbCached = await cacheService.getBatch<number>('prices', missingSymbols);
    const stillMissing: string[] = [];

    for (const symbol of missingSymbols) {
      if (dbCached[symbol] !== undefined) {
        results[symbol] = dbCached[symbol];
        this.setInMemory(`price:${symbol}`, dbCached[symbol]);
      } else {
        stillMissing.push(symbol);
      }
    }

    if (stillMissing.length === 0) {
      apiClient.recordCacheHit();
      return results;
    }

    apiClient.recordCacheMiss();

    // 3. Fetch from backend
    try {
      const backendPrices = await invokeCommand<Record<string, number>>(
        'get_current_prices_batch',
        { symbols: stillMissing }
      );

      // Update caches
      for (const [symbol, price] of Object.entries(backendPrices)) {
        results[symbol] = price;
        this.setInMemory(`price:${symbol}`, price);
        cacheService.set('prices', symbol, price);
      }

      return results;
    } catch (error) {
      handleError(error);
      // Return partial results even on error
      return results;
    }
  }

  /**
   * Get current price for a single symbol
   */
  async getPrice(symbol: string): Promise<number> {
    const prices = await this.getPricesBatch([symbol]);
    return prices[symbol] ?? 0;
  }

  // ============ Quant Metrics APIs ============

  /**
   * Get quantitative metrics for multiple symbols
   */
  async getQuantMetricsBatch(symbols: string[]): Promise<QuantMetrics[]> {
    const results: QuantMetrics[] = [];
    const missingSymbols: string[] = [];

    // Check IndexedDB cache
    for (const symbol of symbols) {
      const cached = await cacheService.get<QuantMetrics>('quant', symbol);
      if (cached) {
        results.push(cached);
      } else {
        missingSymbols.push(symbol);
      }
    }

    if (missingSymbols.length === 0) {
      apiClient.recordCacheHit();
      return results;
    }

    apiClient.recordCacheMiss();

    // Fetch from backend
    try {
      const backendMetrics = await invokeCommand<QuantMetrics[]>(
        'get_quant_metrics_batch',
        { symbols: missingSymbols }
      );

      // Cache results
      for (const metrics of backendMetrics) {
        results.push(metrics);
        cacheService.set('quant', metrics.symbol, metrics);
      }

      return results;
    } catch (error) {
      handleError(error);
      // Return default metrics for missing symbols
      return [
        ...results,
        ...missingSymbols.map(symbol => this.getDefaultQuantMetrics(symbol)),
      ];
    }
  }

  /**
   * Get quantitative metrics for a single symbol
   */
  async getQuantMetrics(symbol: string): Promise<QuantMetrics> {
    const metrics = await this.getQuantMetricsBatch([symbol]);
    return metrics[0] ?? this.getDefaultQuantMetrics(symbol);
  }

  // ============ Historical Data APIs ============

  /**
   * Get historical price data for a symbol
   */
  async getHistoricalData(symbol: string): Promise<HistoricalData[]> {
    // Check cache
    const cached = await cacheService.get<HistoricalData[]>('historical', symbol);
    if (cached) {
      apiClient.recordCacheHit();
      return cached;
    }

    apiClient.recordCacheMiss();

    try {
      const data = await invokeCommand<HistoricalData[]>(
        'get_historical_data',
        { symbol }
      );

      // Cache result
      cacheService.set('historical', symbol, data);
      return data;
    } catch (error) {
      handleError(error);
      return [];
    }
  }

  // ============ Prefetch & Cache Management ============

  /**
   * Prefetch symbols into cache
   */
  async prefetch(symbols: string[]): Promise<void> {
    try {
      await invokeCommand('prefetch_symbols', { symbols });
      console.log(`✅ Prefetched ${symbols.length} symbols`);
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Clear all market data caches
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await cacheService.clear('prices');
    await cacheService.clear('quant');
    await cacheService.clear('historical');
    console.log('[INFO] Market data cache cleared');
  }

  // ============ Health & Metrics ============

  /**
   * Test backend data connection
   */
  async testConnection(): Promise<{
    status: 'connected' | 'failed';
    testSymbol: string;
    price: number;
    providers: Record<string, boolean>;
  }> {
    try {
      const result = await invokeCommand<{
        status: string;
        test_symbol: string;
        price: number;
        providers: Record<string, boolean>;
      }>('test_data_connection', {});

      return {
        status: result.status === 'connected' ? 'connected' : 'failed',
        testSymbol: result.test_symbol,
        price: result.price,
        providers: result.providers,
      };
    } catch (error) {
      handleError(error);
      return {
        status: 'failed',
        testSymbol: 'AAPL',
        price: 0,
        providers: {},
      };
    }
  }

  /**
   * Get provider metrics
   */
  async getProviderMetrics(): Promise<ProviderMetrics[]> {
    try {
      return await invokeCommand<ProviderMetrics[]>('get_provider_metrics', {});
    } catch (error) {
      handleError(error);
      return [];
    }
  }

  // ============ Private Methods ============

  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (entry && Date.now() - entry.timestamp < this.MEMORY_TTL) {
      return entry.data as T;
    }
    this.memoryCache.delete(key);
    return null;
  }

  private setInMemory(key: string, data: unknown): void {
    // Limit memory cache size
    if (this.memoryCache.size > 500) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, { data, timestamp: Date.now() });
  }

  private getDefaultQuantMetrics(symbol: string): QuantMetrics {
    return {
      symbol,
      sharpe_ratio: 0,
      annualized_return: 0,
      volatility: 0,
      max_drawdown: 0,
      rsi: 50,
      signal: 'INSUFFICIENT DATA',
      confidence: 0,
    };
  }
}

// ============ Singleton Export ============

export const marketDataService = new MarketDataService();
