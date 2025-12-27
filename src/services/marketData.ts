// Integrated Market Data Service - Alpha Vantage, Polygon, Alpaca, and Yahoo Finance
// With intelligent caching and optimized fetching

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
  source: 'alpaca' | 'polygon' | 'alphavantage' | 'yahoo';
}

interface CacheEntry {
  data: MarketDataResponse;
  timestamp: number;
}

class MarketDataService {
  private alphaVantageKey = import.meta.env.VITE_ALPHAVANTAGE_API_KEY;
  private polygonKey = import.meta.env.VITE_POLYGON_API_KEY;
  private alpacaKey = import.meta.env.VITE_ALPACA_API_KEY;
  private alpacaSecret = import.meta.env.VITE_ALPACA_API_SECRET;
  private alpacaPaper = import.meta.env.VITE_ALPACA_PAPER_TRADING === 'true';

  // In-memory cache with 60-second TTL for real-time data (instant loading with stale-while-revalidate)
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 60 seconds - longer TTL for instant loading
  
  // Rate limiting and deduplication
  private requestQueue: Map<string, Promise<MarketDataResponse>> = new Map();
  
  // Persistent cache in localStorage for longer-term data
  private readonly PERSISTENT_CACHE_KEY = 'flowfolio_market_cache';
  private readonly PERSISTENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes - longer for offline resilience
  
  // Background prefetch system
  private prefetchQueue: Set<string> = new Set();
  private isPrefetching: boolean = false;
  
  // Instant loading with stale-while-revalidate
  private staleCache: Map<string, MarketDataResponse> = new Map();

  private getAlpacaBaseUrl(): string {
    return this.alpacaPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  // Check cache validity with stale-while-revalidate pattern
  private getCachedData(symbol: string, allowStale: boolean = false): MarketDataResponse | null {
    // Check in-memory cache first
    const cached = this.cache.get(symbol);
    if (cached) {
      const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
      if (!isExpired) {
        console.log(`✅ Memory cache hit for ${symbol}`);
        return cached.data;
      }
      
      // If stale data is allowed, return it and trigger background refresh
      if (allowStale) {
        console.log(`⚡ Serving stale data for ${symbol} while revalidating`);
        this.staleCache.set(symbol, cached.data);
        this.prefetchInBackground(symbol);
        return cached.data;
      }
      
      this.cache.delete(symbol);
    }
    
    // Check localStorage for persistent cache
    try {
      const persistentCache = localStorage.getItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      if (persistentCache) {
        const parsed: CacheEntry = JSON.parse(persistentCache);
        const isExpired = Date.now() - parsed.timestamp > this.PERSISTENT_CACHE_TTL;
        if (!isExpired || allowStale) {
          console.log(`✅ Persistent cache hit for ${symbol}${isExpired ? ' (stale)' : ''}`);
          // Restore to memory cache
          this.cache.set(symbol, parsed);
          
          if (isExpired && allowStale) {
            this.prefetchInBackground(symbol);
          }
          
          return parsed.data;
        }
        localStorage.removeItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      }
    } catch (e) {
      console.warn('Error reading persistent cache:', e);
    }
    
    return null;
  }
  
  // Background prefetch for instant loading
  private prefetchInBackground(symbol: string): void {
    if (!this.prefetchQueue.has(symbol)) {
      this.prefetchQueue.add(symbol);
      this.processPrefetchQueue();
    }
  }
  
  private async processPrefetchQueue(): Promise<void> {
    if (this.isPrefetching || this.prefetchQueue.size === 0) return;
    
    this.isPrefetching = true;
    const symbolsToFetch = Array.from(this.prefetchQueue);
    this.prefetchQueue.clear();
    
    // Fetch all in parallel for maximum speed
    await Promise.allSettled(
      symbolsToFetch.map(async (symbol) => {
        try {
          await this.fetchFreshData(symbol);
        } catch (error) {
          console.warn(`Background prefetch failed for ${symbol}:`, error);
        }
      })
    );
    
    this.isPrefetching = false;
    
    // Process any new items added during fetch
    if (this.prefetchQueue.size > 0) {
      this.processPrefetchQueue();
    }
  }

  private setCachedData(symbol: string, data: MarketDataResponse): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now()
    };
    
    // Set in memory cache
    this.cache.set(symbol, entry);
    
    // Set in persistent cache (localStorage)
    try {
      localStorage.setItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`, JSON.stringify(entry));
    } catch (e) {
      console.warn('Error writing to persistent cache:', e);
    }
  }

  // Alpaca Data API
  async fetchFromAlpaca(symbol: string): Promise<MarketDataResponse> {
    try {
      const headers = {
        'APCA-API-KEY-ID': this.alpacaKey,
        'APCA-API-SECRET-KEY': this.alpacaSecret,
      };

      // Get latest quote
      const quoteUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`;
      const quoteResponse = await fetch(quoteUrl, { headers });
      
      if (!quoteResponse.ok) throw new Error('Alpaca API error');
      
      const quoteData = await quoteResponse.json();

      // Get historical bars (daily, last 100 days)
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const barsUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${from}&end=${to}&limit=100`;
      const barsResponse = await fetch(barsUrl, { headers });
      
      if (!barsResponse.ok) throw new Error('Alpaca bars API error');
      
      const barsData = await barsResponse.json();

      const quote: StockQuote = {
        symbol,
        price: quoteData.quote?.ap || 0,
        change: 0,
        changePercent: 0,
        volume: quoteData.quote?.as || 0,
        timestamp: quoteData.quote?.t || new Date().toISOString(),
      };

      const historical: HistoricalData[] = (barsData.bars || []).map((bar: any) => ({
        date: bar.t.split('T')[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));

      return { quote, historical, source: 'alpaca' };
    } catch (error) {
      console.error('Alpaca fetch error:', error);
      throw error;
    }
  }

  // Polygon API
  async fetchFromPolygon(symbol: string): Promise<MarketDataResponse> {
    try {
      // Get latest quote
      const quoteUrl = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${this.polygonKey}`;
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) throw new Error('Polygon API error');
      
      const quoteData = await quoteResponse.json();

      // Get historical data (daily aggregates)
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${this.polygonKey}`;
      const barsResponse = await fetch(barsUrl);
      
      if (!barsResponse.ok) throw new Error('Polygon bars API error');
      
      const barsData = await barsResponse.json();

      const quote: StockQuote = {
        symbol,
        price: quoteData.results?.p || 0,
        change: 0,
        changePercent: 0,
        volume: quoteData.results?.s || 0,
        timestamp: new Date(quoteData.results?.t || Date.now()).toISOString(),
      };

      const historical: HistoricalData[] = (barsData.results || []).map((bar: any) => ({
        date: new Date(bar.t).toISOString().split('T')[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }));

      return { quote, historical, source: 'polygon' };
    } catch (error) {
      console.error('Polygon fetch error:', error);
      throw error;
    }
  }

  // Alpha Vantage API
  async fetchFromAlphaVantage(symbol: string): Promise<MarketDataResponse> {
    try {
      // Get quote
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) throw new Error('Alpha Vantage API error');
      
      const quoteData = await quoteResponse.json();

      // Get daily time series
      const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${this.alphaVantageKey}`;
      const timeSeriesResponse = await fetch(timeSeriesUrl);
      
      if (!timeSeriesResponse.ok) throw new Error('Alpha Vantage time series API error');
      
      const timeSeriesData = await timeSeriesResponse.json();

      const globalQuote = quoteData['Global Quote'] || {};
      const quote: StockQuote = {
        symbol,
        price: parseFloat(globalQuote['05. price'] || '0'),
        change: parseFloat(globalQuote['09. change'] || '0'),
        changePercent: parseFloat(globalQuote['10. change percent']?.replace('%', '') || '0'),
        volume: parseInt(globalQuote['06. volume'] || '0'),
        timestamp: globalQuote['07. latest trading day'] || new Date().toISOString(),
      };

      const timeSeries = timeSeriesData['Time Series (Daily)'] || {};
      const historical: HistoricalData[] = Object.entries(timeSeries)
        .slice(0, 100)
        .map(([date, data]: [string, any]) => ({
          date,
          open: parseFloat(data['1. open']),
          high: parseFloat(data['2. high']),
          low: parseFloat(data['3. low']),
          close: parseFloat(data['4. close']),
          volume: parseInt(data['5. volume']),
        }));

      return { quote, historical, source: 'alphavantage' };
    } catch (error) {
      console.error('Alpha Vantage fetch error:', error);
      throw error;
    }
  }

  // Yahoo Finance API (Fallback)
  async fetchFromYahooFinance(symbol: string): Promise<MarketDataResponse> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Yahoo Finance API error');
      
      const data = await response.json();

      if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error('Invalid Yahoo Finance response');
      }

      const result = data.chart.result[0];
      const meta = result.meta;
      const quote: StockQuote = {
        symbol,
        price: meta.regularMarketPrice,
        change: meta.regularMarketPrice - meta.previousClose,
        changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
        volume: meta.regularMarketVolume || 0,
        timestamp: new Date(meta.regularMarketTime * 1000).toISOString(),
      };

      const timestamps = result.timestamp || [];
      const quotes = result.indicators.quote[0];
      
      const historical: HistoricalData[] = timestamps.map((t: number, i: number) => ({
        date: new Date(t * 1000).toISOString().split('T')[0],
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i],
      })).filter((h: any) => h.close !== null && h.open !== null);

      return { quote, historical, source: 'yahoo' };
    } catch (error) {
      console.error('Yahoo Finance fetch error:', error);
      throw error;
    }
  }

  // Fetch fresh data from providers with timeout protection
  private async fetchFreshData(symbol: string): Promise<MarketDataResponse> {
    const providers: Array<() => Promise<MarketDataResponse>> = [
      () => this.fetchFromAlpaca(symbol),
      () => this.fetchFromPolygon(symbol),
      () => this.fetchFromAlphaVantage(symbol),
      () => this.fetchFromYahooFinance(symbol),
    ];

    for (const provider of providers) {
      try {
        // Add 5-second timeout per provider
        const data = await Promise.race([
          provider(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Provider timeout')), 5000)
          )
        ]);
        
        if (data.quote && data.quote.price > 0) {
          this.setCachedData(symbol, data);
          return data;
        }
      } catch (error) {
        console.warn(`Provider failed for ${symbol}, trying next...`);
        continue;
      }
    }

    throw new Error(`Failed to fetch market data for ${symbol} from all providers`);
  }

  // Main method with instant loading (stale-while-revalidate)
  async getMarketData(symbol: string, instant: boolean = true): Promise<MarketDataResponse> {
    // Try to get cached data first (allow stale if instant mode)
    const cached = this.getCachedData(symbol, instant);
    if (cached) return cached;

    // Check if request is already in progress (deduplication)
    const inProgress = this.requestQueue.get(symbol);
    if (inProgress) {
      console.log(`⏳ Waiting for in-progress request for ${symbol}`);
      return inProgress;
    }

    const requestPromise = this.fetchFreshData(symbol);
    this.requestQueue.set(symbol, requestPromise);

    try {
      const result = await requestPromise;
      console.log(`✅ Fetched ${symbol} from ${result.source}`);
      return result;
    } finally {
      this.requestQueue.delete(symbol);
    }
  }

  // Optimized batch fetch with instant loading and maximum concurrency
  async getBatchMarketData(
    symbols: string[], 
    _concurrency: number = 50, // Underscore prefix to indicate intentionally unused (for API compatibility)
    onProgress?: (symbol: string, data: MarketDataResponse) => void,
    instant: boolean = true // Enable instant loading by default
  ): Promise<Record<string, MarketDataResponse>> {
    const results: Record<string, MarketDataResponse> = {};
    
    // First pass: return all cached data instantly
    if (instant) {
      symbols.forEach(symbol => {
        const cached = this.getCachedData(symbol, true);
        if (cached) {
          results[symbol] = cached;
          if (onProgress) {
            onProgress(symbol, cached);
          }
        }
      });
    }
    
    // Get symbols that need fresh data
    const symbolsToFetch = symbols.filter(s => !results[s] || this.shouldRefresh(s));
    
    if (symbolsToFetch.length === 0) {
      return results;
    }
    
    // Fetch fresh data with maximum concurrency
    const fetchPromises = symbolsToFetch.map(async (symbol) => {
      try {
        const data = await this.getMarketData(symbol, instant);
        if (data) {
          results[symbol] = data;
          if (onProgress) {
            onProgress(symbol, data);
          }
        }
        return { symbol, data };
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
        return { symbol, data: null };
      }
    });
    
    // Process all at once with maximum parallelism
    await Promise.allSettled(fetchPromises);
    
    return results;
  }
  
  // Check if symbol data should be refreshed
  private shouldRefresh(symbol: string): boolean {
    const cached = this.cache.get(symbol);
    if (!cached) return true;
    
    const age = Date.now() - cached.timestamp;
    return age > this.CACHE_TTL;
  }
  
  // Preload symbols for instant access
  async preloadSymbols(symbols: string[]): Promise<void> {
    console.log(`🚀 Preloading ${symbols.length} symbols...`);
    await this.getBatchMarketData(symbols, 50, undefined, false);
    console.log(`✅ Preloaded ${symbols.length} symbols`);
  }

  // Clear cache manually
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
      try {
        localStorage.removeItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      } catch (e) {
        console.warn('Error clearing persistent cache:', e);
      }
      console.log(`🗑️ Cleared cache for ${symbol}`);
    } else {
      this.cache.clear();
      try {
        // Clear all persistent cache entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(this.PERSISTENT_CACHE_KEY)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (e) {
        console.warn('Error clearing persistent cache:', e);
      }
      console.log(`🗑️ Cleared entire cache`);
    }
  }

  // Get account info from Alpaca
  async getAlpacaAccount() {
    try {
      const url = `${this.getAlpacaBaseUrl()}/v2/account`;
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.alpacaKey,
          'APCA-API-SECRET-KEY': this.alpacaSecret,
        },
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch Alpaca account:', error);
      throw error;
    }
  }

  // Get positions from Alpaca
  async getAlpacaPositions() {
    try {
      const url = `${this.getAlpacaBaseUrl()}/v2/positions`;
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.alpacaKey,
          'APCA-API-SECRET-KEY': this.alpacaSecret,
        },
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch Alpaca positions:', error);
      throw error;
    }
  }
}

export const marketDataService = new MarketDataService();
export type { StockQuote, HistoricalData, MarketDataResponse };
