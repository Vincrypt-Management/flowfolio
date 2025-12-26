// Integrated Market Data Service - Alpha Vantage, Polygon, and Alpaca

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
  source: 'alpaca' | 'polygon' | 'alphavantage';
}

class MarketDataService {
  private alphaVantageKey = import.meta.env.VITE_ALPHAVANTAGE_API_KEY;
  private polygonKey = import.meta.env.VITE_POLYGON_API_KEY;
  private alpacaKey = import.meta.env.VITE_ALPACA_API_KEY;
  private alpacaSecret = import.meta.env.VITE_ALPACA_API_SECRET;
  private alpacaPaper = import.meta.env.VITE_ALPACA_PAPER_TRADING === 'true';

  private getAlpacaBaseUrl(): string {
    return this.alpacaPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
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
      const quoteData = await quoteResponse.json();

      // Get historical bars (daily, last 100 days)
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const barsUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${from}&end=${to}&limit=100`;
      const barsResponse = await fetch(barsUrl, { headers });
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
      const quoteData = await quoteResponse.json();

      // Get historical data (daily aggregates)
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${this.polygonKey}`;
      const barsResponse = await fetch(barsUrl);
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
      const quoteData = await quoteResponse.json();

      // Get daily time series
      const timeSeriesUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${this.alphaVantageKey}`;
      const timeSeriesResponse = await fetch(timeSeriesUrl);
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

  // Main method with fallback cascade
  async getMarketData(symbol: string): Promise<MarketDataResponse> {
    const providers: Array<() => Promise<MarketDataResponse>> = [
      () => this.fetchFromAlpaca(symbol),
      () => this.fetchFromPolygon(symbol),
      () => this.fetchFromAlphaVantage(symbol),
    ];

    for (const provider of providers) {
      try {
        const data = await provider();
        if (data.quote && data.quote.price > 0) {
          return data;
        }
      } catch (error) {
        console.warn(`Provider failed, trying next...`, error);
        continue;
      }
    }

    throw new Error(`Failed to fetch market data for ${symbol} from all providers`);
  }

  // Batch fetch multiple symbols
  async getBatchMarketData(symbols: string[]): Promise<Record<string, MarketDataResponse>> {
    const results: Record<string, MarketDataResponse> = {};
    
    await Promise.allSettled(
      symbols.map(async (symbol) => {
        try {
          results[symbol] = await this.getMarketData(symbol);
        } catch (error) {
          console.error(`Failed to fetch ${symbol}:`, error);
        }
      })
    );

    return results;
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
