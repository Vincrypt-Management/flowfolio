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

  // In-memory cache with 5-minute TTL for real-time data
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Rate limiting
  private requestQueue: Map<string, Promise<MarketDataResponse>> = new Map();

  private getAlpacaBaseUrl(): string {
    return this.alpacaPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  // Check cache validity
  private getCachedData(symbol: string): MarketDataResponse | null {
    const cached = this.cache.get(symbol);
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
    if (isExpired) {
      this.cache.delete(symbol);
      return null;
    }
    
    console.log(`✅ Cache hit for ${symbol}`);
    return cached.data;
  }

  private setCachedData(symbol: string, data: MarketDataResponse): void {
    this.cache.set(symbol, {
      data,
      timestamp: Date.now()
    });
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

  // Main method with fallback cascade and caching
  async getMarketData(symbol: string): Promise<MarketDataResponse> {
    // Check cache first
    const cached = this.getCachedData(symbol);
    if (cached) return cached;

    // Check if request is already in progress (deduplication)
    const inProgress = this.requestQueue.get(symbol);
    if (inProgress) {
      console.log(`⏳ Waiting for in-progress request for ${symbol}`);
      return inProgress;
    }

    const providers: Array<() => Promise<MarketDataResponse>> = [
      () => this.fetchFromAlpaca(symbol),
      () => this.fetchFromPolygon(symbol),
      () => this.fetchFromAlphaVantage(symbol),
      () => this.fetchFromYahooFinance(symbol),
    ];

    const requestPromise = (async () => {
      for (const provider of providers) {
        try {
          const data = await provider();
          if (data.quote && data.quote.price > 0) {
            console.log(`✅ Fetched ${symbol} from ${data.source}`);
            this.setCachedData(symbol, data);
            return data;
          }
        } catch (error) {
          console.warn(`Provider failed for ${symbol}, trying next...`);
          continue;
        }
      }

      throw new Error(`Failed to fetch market data for ${symbol} from all providers`);
    })();

    this.requestQueue.set(symbol, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.requestQueue.delete(symbol);
    }
  }

  // Optimized batch fetch with concurrency control and streaming
  async getBatchMarketData(
    symbols: string[], 
    concurrency: number = 10,
    onProgress?: (symbol: string, data: MarketDataResponse) => void
  ): Promise<Record<string, MarketDataResponse>> {
    const results: Record<string, MarketDataResponse> = {};
    
    // Process in batches with higher concurrency
    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (symbol) => {
          try {
            const data = await this.getMarketData(symbol);
            if (onProgress && data) {
              onProgress(symbol, data);
            }
            return { symbol, data };
          } catch (error) {
            console.error(`Failed to fetch ${symbol}:`, error);
            return { symbol, data: null };
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.data) {
          results[result.value.symbol] = result.value.data;
        }
      });

      // Reduced delay between batches
      if (i + concurrency < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  // Clear cache manually
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
      console.log(`🗑️ Cleared cache for ${symbol}`);
    } else {
      this.cache.clear();
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
