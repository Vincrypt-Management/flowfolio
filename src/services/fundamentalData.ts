// Fundamental Analysis Service
// Fetches company financials, earnings, and fundamental metrics
// ALL API calls are proxied through the Tauri backend for security

import { invoke } from '@tauri-apps/api/core';
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

// Backend response type (snake_case)
interface BackendFundamentals {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  market_cap: number;
  pe_ratio: number | null;
  forward_pe: number | null;
  peg_ratio: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  ev_to_ebitda: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  return_on_assets: number | null;
  return_on_equity: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  free_cash_flow: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
  eps: number | null;
  beta: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  source: string;
  last_updated: string;
}

class FundamentalDataService {
  private cache: Map<string, CacheEntry<FundamentalMetrics>> = new Map();
  private readonly CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours - fundamentals rarely change
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

  // Convert backend response to frontend format
  private convertToFrontendFormat(backend: BackendFundamentals): FundamentalMetrics {
    return {
      symbol: backend.symbol,
      companyName: backend.company_name,
      sector: backend.sector,
      industry: backend.industry,
      marketCap: backend.market_cap,
      peRatio: backend.pe_ratio,
      forwardPE: backend.forward_pe,
      pegRatio: backend.peg_ratio,
      priceToBook: backend.price_to_book,
      priceToSales: backend.price_to_sales,
      evToEbitda: backend.ev_to_ebitda,
      profitMargin: backend.profit_margin,
      operatingMargin: backend.operating_margin,
      returnOnAssets: backend.return_on_assets,
      returnOnEquity: backend.return_on_equity,
      revenueGrowthYoY: backend.revenue_growth_yoy,
      earningsGrowthYoY: backend.earnings_growth_yoy,
      revenueGrowthQoQ: null,
      debtToEquity: backend.debt_to_equity,
      currentRatio: backend.current_ratio,
      quickRatio: backend.quick_ratio,
      freeCashFlow: backend.free_cash_flow,
      dividendYield: backend.dividend_yield,
      payoutRatio: backend.payout_ratio,
      eps: backend.eps,
      beta: backend.beta,
      fiftyTwoWeekHigh: backend.fifty_two_week_high,
      fiftyTwoWeekLow: backend.fifty_two_week_low,
      source: backend.source as 'yahoo' | 'alphavantage' | 'polygon' | 'finnhub',
      lastUpdated: backend.last_updated,
    };
  }

  // Main method - fetches from backend
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
    
    // 3. Fetch from backend (which handles all API calls securely)
    console.log(`🔄 Fetching fundamentals for ${symbol} from backend...`);
    
    try {
      const backendData = await invoke<BackendFundamentals>('get_fundamentals', { symbol });
      const data = this.convertToFrontendFormat(backendData);
      
      // Cache the result
      this.setCachedData(symbol, data);
      
      // Also cache in IndexedDB for persistence
      localCacheService.setFundamentals(symbol, data).catch(e => {
        console.warn('Failed to cache in IndexedDB:', e);
      });
      
      console.log(`✅ Successfully fetched ${symbol} fundamentals from ${data.source}`);
      return data;
    } catch (error) {
      console.error(`Failed to fetch fundamentals for ${symbol}:`, error);
      throw error;
    }
  }

  // Batch fetch with concurrency control
  async getBatchFundamentals(symbols: string[]): Promise<Record<string, FundamentalMetrics>> {
    console.log(`🔄 Fetching fundamentals for ${symbols.length} symbols...`);
    
    try {
      const backendData = await invoke<Record<string, BackendFundamentals>>('get_fundamentals_batch', { symbols });
      const results: Record<string, FundamentalMetrics> = {};
      
      for (const [symbol, data] of Object.entries(backendData)) {
        const converted = this.convertToFrontendFormat(data);
        results[symbol] = converted;
        this.setCachedData(symbol, converted);
      }
      
      console.log(`✅ Fetched fundamentals for ${Object.keys(results).length}/${symbols.length} symbols`);
      return results;
    } catch (error) {
      console.error('Failed to fetch batch fundamentals:', error);
      return {};
    }
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
