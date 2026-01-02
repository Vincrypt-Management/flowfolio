// Fundamental Analysis Service
// Fetches company financials, earnings, and fundamental metrics

import { globalRateLimiter } from './rateLimiter';
import { localCacheService } from './localCache';

export interface FundamentalMetrics {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  
  // Valuation metrics
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  
  // Profitability metrics
  profitMargin: number | null;
  operatingMargin: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  
  // Growth metrics
  revenueGrowthYoY: number | null;
  earningsGrowthYoY: number | null;
  revenueGrowthQoQ: number | null;
  
  // Financial health
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  freeCashFlow: number | null;
  
  // Dividend metrics
  dividendYield: number | null;
  payoutRatio: number | null;
  
  // Additional info
  eps: number | null;
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  
  // Source and timestamp
  source: 'alphavantage' | 'yahoo' | 'polygon' | 'finnhub';
  lastUpdated: string;
}

export interface CompanyOverview {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  country: string;
  employees: number | null;
  website: string | null;
}

export interface EarningsData {
  symbol: string;
  fiscalDateEnding: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class FundamentalDataService {
  // NOTE: Using Alpha Vantage cautiously (5/min free limit, has paid tiers)
  // Consider alternatives: Yahoo Finance (free), FMP (250/day free)
  private alphaVantageKey = import.meta.env.VITE_ALPHAVANTAGE_API_KEY;
  // private polygonKey = import.meta.env.VITE_POLYGON_API_KEY; // Reserved for future use
  // private finnhubKey = import.meta.env.VITE_FINNHUB_API_KEY; // Reserved for future use
  
  private cache: Map<string, CacheEntry<FundamentalMetrics>> = new Map();
  private readonly CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours (increased from 24) - fundamentals rarely change
  private readonly PERSISTENT_CACHE_KEY = 'flowfolio_fundamentals_cache';

  private getCachedData(symbol: string): FundamentalMetrics | null {
    // Check in-memory cache
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`Fundamental cache hit for ${symbol}`);
      return cached.data;
    }
    
    // Check localStorage
    try {
      const stored = localStorage.getItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      if (stored) {
        const parsed: CacheEntry<FundamentalMetrics> = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < this.CACHE_TTL) {
          console.log(`Persistent fundamental cache hit for ${symbol}`);
          this.cache.set(symbol, parsed);
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Error reading fundamental cache:', error);
    }
    
    return null;
  }

  private setCachedData(symbol: string, data: FundamentalMetrics): void {
    const entry: CacheEntry<FundamentalMetrics> = {
      data,
      timestamp: Date.now()
    };
    
    this.cache.set(symbol, entry);
    
    try {
      localStorage.setItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('Error writing to fundamental cache:', error);
    }
  }

  // Fetch from Yahoo Finance with global rate limiting
  private async fetchFromYahoo(symbol: string): Promise<FundamentalMetrics> {
    // Wait for rate limiter slot
    await globalRateLimiter.waitForSlot();
    
    console.log(`Fetching fundamentals for ${symbol} from Yahoo Finance...`);
    
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail,price`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.quoteSummary?.result?.[0]) {
      throw new Error('Invalid Yahoo Finance response');
    }
    
    const result = data.quoteSummary.result[0];
    const keyStats = result.defaultKeyStatistics || {};
    const financialData = result.financialData || {};
    const summaryDetail = result.summaryDetail || {};
    const priceData = result.price || {};
    
    const fundamentals: FundamentalMetrics = {
      symbol,
      companyName: priceData.longName || priceData.shortName || symbol,
      sector: priceData.sector || 'Unknown',
      industry: priceData.industry || 'Unknown',
      marketCap: priceData.marketCap?.raw || 0,
      
      // Valuation
      peRatio: summaryDetail.trailingPE?.raw || null,
      forwardPE: summaryDetail.forwardPE?.raw || null,
      pegRatio: keyStats.pegRatio?.raw || null,
      priceToBook: keyStats.priceToBook?.raw || null,
      priceToSales: summaryDetail.priceToSalesTrailing12Months?.raw || null,
      evToEbitda: keyStats.enterpriseToEbitda?.raw || null,
      
      // Profitability
      profitMargin: financialData.profitMargins?.raw || null,
      operatingMargin: financialData.operatingMargins?.raw || null,
      returnOnAssets: financialData.returnOnAssets?.raw || null,
      returnOnEquity: financialData.returnOnEquity?.raw || null,
      
      // Growth
      revenueGrowthYoY: financialData.revenueGrowth?.raw || null,
      earningsGrowthYoY: financialData.earningsGrowth?.raw || null,
      revenueGrowthQoQ: null, // Not available in this endpoint
      
      // Financial health
      debtToEquity: financialData.debtToEquity?.raw || null,
      currentRatio: financialData.currentRatio?.raw || null,
      quickRatio: financialData.quickRatio?.raw || null,
      freeCashFlow: financialData.freeCashflow?.raw || null,
      
      // Dividends
      dividendYield: summaryDetail.dividendYield?.raw || null,
      payoutRatio: summaryDetail.payoutRatio?.raw || null,
      
      // Additional
      eps: keyStats.trailingEps?.raw || null,
      beta: keyStats.beta?.raw || null,
      fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh?.raw || null,
      fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow?.raw || null,
      
      source: 'yahoo',
      lastUpdated: new Date().toISOString()
    };
    
    return fundamentals;
  }

  // Fetch from Alpha Vantage (backup only - 5/min free limit, has paid tiers)
  // CAUTION: This service has paid tiers - use Yahoo Finance as primary
  private async fetchFromAlphaVantage(symbol: string): Promise<FundamentalMetrics> {
    if (!this.alphaVantageKey) {
      throw new Error('Alpha Vantage API key not configured');
    }
    
    console.log(`Fetching fundamentals for ${symbol} from Alpha Vantage (rate limited)...`);
    
    // Use global rate limiter to respect free tier limits
    await globalRateLimiter.waitForSlot();
    
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.Note || data['Error Message']) {
      throw new Error(data.Note || data['Error Message']);
    }
    
    const fundamentals: FundamentalMetrics = {
      symbol,
      companyName: data.Name || symbol,
      sector: data.Sector || 'Unknown',
      industry: data.Industry || 'Unknown',
      marketCap: parseFloat(data.MarketCapitalization) || 0,
      
      // Valuation
      peRatio: parseFloat(data.PERatio) || null,
      forwardPE: parseFloat(data.ForwardPE) || null,
      pegRatio: parseFloat(data.PEGRatio) || null,
      priceToBook: parseFloat(data.PriceToBookRatio) || null,
      priceToSales: parseFloat(data.PriceToSalesRatioTTM) || null,
      evToEbitda: parseFloat(data.EVToEBITDA) || null,
      
      // Profitability
      profitMargin: parseFloat(data.ProfitMargin) || null,
      operatingMargin: parseFloat(data.OperatingMarginTTM) || null,
      returnOnAssets: parseFloat(data.ReturnOnAssetsTTM) || null,
      returnOnEquity: parseFloat(data.ReturnOnEquityTTM) || null,
      
      // Growth
      revenueGrowthYoY: parseFloat(data.QuarterlyRevenueGrowthYOY) || null,
      earningsGrowthYoY: parseFloat(data.QuarterlyEarningsGrowthYOY) || null,
      revenueGrowthQoQ: null,
      
      // Financial health
      debtToEquity: parseFloat(data.DebtToEquity) || null,
      currentRatio: parseFloat(data.CurrentRatio) || null,
      quickRatio: parseFloat(data.QuickRatio) || null,
      freeCashFlow: null,
      
      // Dividends
      dividendYield: parseFloat(data.DividendYield) || null,
      payoutRatio: parseFloat(data.PayoutRatio) || null,
      
      // Additional
      eps: parseFloat(data.EPS) || null,
      beta: parseFloat(data.Beta) || null,
      fiftyTwoWeekHigh: parseFloat(data['52WeekHigh']) || null,
      fiftyTwoWeekLow: parseFloat(data['52WeekLow']) || null,
      
      source: 'alphavantage',
      lastUpdated: new Date().toISOString()
    };
    
    return fundamentals;
  }

  // Main method with fallback chain
  async getFundamentals(symbol: string): Promise<FundamentalMetrics> {
    // 1. Check IndexedDB cache first (persistent across sessions)
    try {
      const indexedDBCached = await localCacheService.getFundamentals(symbol);
      if (indexedDBCached) {
        console.log(`IndexedDB cache hit for ${symbol} fundamentals`);
        return indexedDBCached as FundamentalMetrics;
      }
    } catch (e) {
      console.warn('IndexedDB read error:', e);
    }

    // 2. Check in-memory/localStorage cache
    const cached = this.getCachedData(symbol);
    if (cached) return cached;
    
    // 3. Fetch from network with prioritized free sources
    const providers = [
      { name: 'yahoo', fetcher: () => this.fetchFromYahoo(symbol) }, // Free, no limits
      { name: 'alphavantage', fetcher: () => this.fetchFromAlphaVantage(symbol) } // 5/min free (use sparingly)
    ];
    
    let lastError: Error | null = null;
    
    for (const provider of providers) {
      try {
        console.log(`🔄 Trying ${provider.name} for ${symbol} fundamentals...`);
        const data = await provider.fetcher();
        
        // Cache successful result in memory/localStorage
        this.setCachedData(symbol, data);
        
        // Also cache in IndexedDB for persistence
        localCacheService.setFundamentals(symbol, data).catch(e => {
          console.warn('Failed to cache in IndexedDB:', e);
        });
        
        console.log(`Successfully fetched ${symbol} fundamentals from ${provider.name}`);
        
        return data;
      } catch (error: any) {
        lastError = error;
        console.warn(`${provider.name} failed for ${symbol}:`, error.message);
        
        // Wait before trying next provider
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw lastError || new Error(`Failed to fetch fundamentals for ${symbol}`);
  }

  // Batch fetch with concurrency control
  async getBatchFundamentals(symbols: string[]): Promise<Record<string, FundamentalMetrics>> {
    const results: Record<string, FundamentalMetrics> = {};
    const concurrency = 2; // Conservative to avoid rate limits
    
    console.log(`🔄 Fetching fundamentals for ${symbols.length} symbols...`);
    
    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      
      const promises = batch.map(async (symbol) => {
        try {
          const data = await this.getFundamentals(symbol);
          results[symbol] = data;
          return { symbol, success: true };
        } catch (error) {
          console.error(`Failed to fetch fundamentals for ${symbol}:`, error);
          return { symbol, success: false };
        }
      });
      
      await Promise.allSettled(promises);
      
      // Delay between batches
      if (i + concurrency < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`Fetched fundamentals for ${Object.keys(results).length}/${symbols.length} symbols`);
    
    return results;
  }

  // Clear cache
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
      try {
        localStorage.removeItem(`${this.PERSISTENT_CACHE_KEY}_${symbol}`);
      } catch (e) {
        console.warn('Error clearing cache:', e);
      }
    } else {
      this.cache.clear();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(this.PERSISTENT_CACHE_KEY)) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.warn('Error clearing cache:', e);
      }
    }
  }
}

export const fundamentalDataService = new FundamentalDataService();
export type { FundamentalMetrics as FundamentalData };
