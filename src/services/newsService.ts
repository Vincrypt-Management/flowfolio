// News and Sentiment Analysis Service
// Fetches news articles and sentiment for stocks

import { globalRateLimiter } from './rateLimiter';
import { localCacheService } from './localCache';

export interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevanceScore: number;
}

export interface SentimentAnalysis {
  symbol: string;
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 to 100
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topNews: NewsArticle[];
  buzzScore: number; // 0-100, how much the stock is being discussed
  lastUpdated: string;
}

export interface AnalystRating {
  symbol: string;
  consensusRating: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
  targetPriceHigh: number | null;
  targetPriceLow: number | null;
  targetPriceMean: number | null;
  targetPriceMedian: number | null;
  numberOfAnalysts: number;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  lastUpdated: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class NewsService {
  private cache: Map<string, CacheEntry<SentimentAnalysis>> = new Map();
  private analystCache: Map<string, CacheEntry<AnalystRating>> = new Map();
  private readonly CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
  private readonly PERSISTENT_CACHE_KEY = 'flowfolio_news_cache';

  private getCachedSentiment(symbol: string): SentimentAnalysis | null {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const stored = localStorage.getItem(`${this.PERSISTENT_CACHE_KEY}_sentiment_${symbol}`);
      if (stored) {
        const parsed: CacheEntry<SentimentAnalysis> = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < this.CACHE_TTL) {
          this.cache.set(symbol, parsed);
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn('Error reading sentiment cache:', error);
    }
    
    return null;
  }

  private setCachedSentiment(symbol: string, data: SentimentAnalysis): void {
    const entry: CacheEntry<SentimentAnalysis> = { data, timestamp: Date.now() };
    this.cache.set(symbol, entry);
    
    try {
      localStorage.setItem(`${this.PERSISTENT_CACHE_KEY}_sentiment_${symbol}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('Error writing to sentiment cache:', error);
    }
  }

  // Fetch news and sentiment from Yahoo Finance
  async getSentiment(symbol: string): Promise<SentimentAnalysis> {
    // 1. Check IndexedDB cache first (persistent)
    try {
      const indexedDBCached = await localCacheService.getSentiment(symbol);
      if (indexedDBCached) {
        console.log(`IndexedDB sentiment cache hit for ${symbol}`);
        return indexedDBCached as SentimentAnalysis;
      }
    } catch (e) {
      console.warn('IndexedDB read error:', e);
    }

    // 2. Check in-memory/localStorage cache
    const cached = this.getCachedSentiment(symbol);
    if (cached) {
      console.log(`Sentiment cache hit for ${symbol}`);
      return cached;
    }

    // 3. Fetch from network
    // Use global rate limiter
    await globalRateLimiter.waitForSlot();
    console.log(`📰 Fetching news for ${symbol}...`);

    try {
      // Use Yahoo Finance news endpoint
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=10`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const news = data.news || [];

      // Analyze sentiment based on headlines
      const analyzedNews: NewsArticle[] = news.slice(0, 5).map((article: any) => {
        const title = article.title || '';
        const sentiment = this.analyzeSentiment(title);
        
        return {
          title: title,
          summary: article.publisher || '',
          source: article.publisher || 'Unknown',
          url: article.link || '',
          publishedAt: new Date(article.providerPublishTime * 1000).toISOString(),
          sentiment,
          relevanceScore: 0.8
        };
      });

      // Calculate overall sentiment
      const positiveCount = analyzedNews.filter(n => n.sentiment === 'positive').length;
      const negativeCount = analyzedNews.filter(n => n.sentiment === 'negative').length;
      const neutralCount = analyzedNews.filter(n => n.sentiment === 'neutral').length;
      
      const sentimentScore = ((positiveCount - negativeCount) / Math.max(analyzedNews.length, 1)) * 100;
      
      let overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (sentimentScore > 20) overallSentiment = 'bullish';
      else if (sentimentScore < -20) overallSentiment = 'bearish';

      const result: SentimentAnalysis = {
        symbol,
        overallSentiment,
        sentimentScore: Math.round(sentimentScore),
        newsCount: analyzedNews.length,
        positiveCount,
        negativeCount,
        neutralCount,
        topNews: analyzedNews,
        buzzScore: Math.min(100, analyzedNews.length * 20),
        lastUpdated: new Date().toISOString()
      };

      // Cache in memory/localStorage
      this.setCachedSentiment(symbol, result);
      
      // Also cache in IndexedDB for persistence
      localCacheService.setSentiment(symbol, result).catch(e => {
        console.warn('Failed to cache sentiment in IndexedDB:', e);
      });
      
      console.log(`Sentiment analysis complete for ${symbol}: ${overallSentiment}`);
      
      return result;
    } catch (error) {
      console.error(`Failed to fetch news for ${symbol}:`, error);
      
      // Return neutral sentiment on error
      return {
        symbol,
        overallSentiment: 'neutral',
        sentimentScore: 0,
        newsCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        topNews: [],
        buzzScore: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Simple keyword-based sentiment analysis
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();
    
    const positiveWords = [
      'surge', 'soar', 'jump', 'gain', 'rise', 'rally', 'bull', 'up', 'high',
      'growth', 'profit', 'beat', 'exceed', 'strong', 'record', 'boost', 'upgrade',
      'buy', 'outperform', 'success', 'win', 'best', 'top', 'innovation'
    ];
    
    const negativeWords = [
      'drop', 'fall', 'plunge', 'sink', 'crash', 'bear', 'down', 'low',
      'loss', 'miss', 'decline', 'weak', 'cut', 'downgrade', 'sell',
      'underperform', 'fail', 'worst', 'concern', 'risk', 'warning', 'layoff'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveScore++;
    });

    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeScore++;
    });

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  // Fetch analyst ratings from Yahoo Finance
  async getAnalystRatings(symbol: string): Promise<AnalystRating> {
    // 1. Check IndexedDB cache first (persistent)
    try {
      const indexedDBCached = await localCacheService.getAnalyst(symbol);
      if (indexedDBCached) {
        console.log(`IndexedDB analyst cache hit for ${symbol}`);
        return indexedDBCached as AnalystRating;
      }
    } catch (e) {
      console.warn('IndexedDB read error:', e);
    }

    // 2. Check in-memory cache
    const cached = this.analystCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`Analyst ratings cache hit for ${symbol}`);
      return cached.data;
    }

    // 3. Fetch from network
    // Use global rate limiter
    await globalRateLimiter.waitForSlot();
    console.log(`Fetching analyst ratings for ${symbol}...`);

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=recommendationTrend,financialData`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.quoteSummary?.result?.[0];
      
      if (!result) {
        throw new Error('No analyst data available');
      }

      const trend = result.recommendationTrend?.trend?.[0] || {};
      const financialData = result.financialData || {};

      // Calculate consensus rating
      const strongBuy = trend.strongBuy || 0;
      const buy = trend.buy || 0;
      const hold = trend.hold || 0;
      const sell = trend.sell || 0;
      const strongSell = trend.strongSell || 0;
      const total = strongBuy + buy + hold + sell + strongSell;

      let consensusRating: AnalystRating['consensusRating'] = 'Hold';
      if (total > 0) {
        const score = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / total;
        if (score >= 4.5) consensusRating = 'Strong Buy';
        else if (score >= 3.5) consensusRating = 'Buy';
        else if (score >= 2.5) consensusRating = 'Hold';
        else if (score >= 1.5) consensusRating = 'Sell';
        else consensusRating = 'Strong Sell';
      }

      const rating: AnalystRating = {
        symbol,
        consensusRating,
        targetPriceHigh: financialData.targetHighPrice?.raw || null,
        targetPriceLow: financialData.targetLowPrice?.raw || null,
        targetPriceMean: financialData.targetMeanPrice?.raw || null,
        targetPriceMedian: financialData.targetMedianPrice?.raw || null,
        numberOfAnalysts: financialData.numberOfAnalystOpinions?.raw || total,
        strongBuy,
        buy,
        hold,
        sell,
        strongSell,
        lastUpdated: new Date().toISOString()
      };

      // Cache in memory
      const entry: CacheEntry<AnalystRating> = { data: rating, timestamp: Date.now() };
      this.analystCache.set(symbol, entry);

      // Also cache in IndexedDB for persistence
      localCacheService.setAnalyst(symbol, rating).catch(e => {
        console.warn('Failed to cache analyst in IndexedDB:', e);
      });

      console.log(`Analyst ratings complete for ${symbol}: ${consensusRating}`);
      return rating;
    } catch (error) {
      console.error(`Failed to fetch analyst ratings for ${symbol}:`, error);
      
      return {
        symbol,
        consensusRating: 'Hold',
        targetPriceHigh: null,
        targetPriceLow: null,
        targetPriceMean: null,
        targetPriceMedian: null,
        numberOfAnalysts: 0,
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Batch fetch for multiple symbols
  async getBatchSentiment(symbols: string[]): Promise<Record<string, SentimentAnalysis>> {
    const results: Record<string, SentimentAnalysis> = {};
    
    console.log(`📰 Fetching sentiment for ${symbols.length} symbols...`);
    
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getSentiment(symbol);
      } catch (error) {
        console.error(`Failed to fetch sentiment for ${symbol}:`, error);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }

  async getBatchAnalystRatings(symbols: string[]): Promise<Record<string, AnalystRating>> {
    const results: Record<string, AnalystRating> = {};
    
    console.log(`Fetching analyst ratings for ${symbols.length} symbols...`);
    
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getAnalystRatings(symbol);
      } catch (error) {
        console.error(`Failed to fetch analyst ratings for ${symbol}:`, error);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }
}

export const newsService = new NewsService();
