// Web Search and Financial Intelligence Service
// Provides trusted financial data from web sources for AI agent

import { globalRateLimiter } from './rateLimiter';
// localCacheService will be used in future updates for caching web search results

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
}

export interface FinancialNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface MarketInsight {
  symbol: string;
  headline: string;
  analysis: string;
  source: string;
  confidence: number;
  timestamp: string;
}

export interface EarningsData {
  symbol: string;
  fiscalDateEnding: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
}

export interface SECFiling {
  symbol: string;
  formType: string;
  filedDate: string;
  reportDate: string;
  url: string;
  description: string;
}

// Trusted financial data sources
const TRUSTED_SOURCES = [
  'reuters.com',
  'bloomberg.com',
  'wsj.com',
  'cnbc.com',
  'marketwatch.com',
  'seekingalpha.com',
  'investing.com',
  'finance.yahoo.com',
  'sec.gov',
  'fool.com',
  'barrons.com',
  'ft.com'
];

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class WebSearchService {
  private newsCache: Map<string, CacheEntry<FinancialNewsItem[]>> = new Map();
  
  private readonly NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for news

  // Search financial news for a specific stock
  async searchStockNews(symbol: string, limit: number = 5): Promise<FinancialNewsItem[]> {
    const cacheKey = `news_${symbol}`;
    
    // Check cache
    const cached = this.newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.NEWS_CACHE_TTL) {
      console.log(`News cache hit for ${symbol}`);
      return cached.data;
    }

    await globalRateLimiter.waitForSlot();
    console.log(`[INFO] Searching news for ${symbol}...`);

    try {
      // Use Yahoo Finance search API for news
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=${limit}&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const newsItems = data.news || [];

      const results: FinancialNewsItem[] = newsItems.map((item: any) => ({
        title: item.title || '',
        summary: item.title || '', // Yahoo doesn't provide summary in search
        source: item.publisher || 'Unknown',
        url: item.link || '',
        publishedAt: item.providerPublishTime 
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : new Date().toISOString(),
        symbols: [symbol],
        sentiment: this.analyzeSentiment(item.title || '')
      }));

      // Cache results
      this.newsCache.set(cacheKey, { data: results, timestamp: Date.now() });
      
      console.log(`Found ${results.length} news items for ${symbol}`);
      return results;
    } catch (error) {
      console.error(`Failed to search news for ${symbol}:`, error);
      return [];
    }
  }

  // Get market-wide news
  async getMarketNews(limit: number = 10): Promise<FinancialNewsItem[]> {
    const cacheKey = 'market_news';
    
    // Check cache
    const cached = this.newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.NEWS_CACHE_TTL) {
      console.log(`Market news cache hit`);
      return cached.data;
    }

    await globalRateLimiter.waitForSlot();
    console.log(`[INFO] Fetching market news...`);

    try {
      // Use Yahoo Finance trending tickers for market-wide news
      const url = `https://query1.finance.yahoo.com/v1/finance/trending/US?count=${limit}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const trendingQuotes = data.finance?.result?.[0]?.quotes || [];

      // Fetch news for top trending stocks
      const allNews: FinancialNewsItem[] = [];
      for (const quote of trendingQuotes.slice(0, 3)) {
        if (quote.symbol) {
          const news = await this.searchStockNews(quote.symbol, 3);
          allNews.push(...news);
        }
      }

      // Cache results
      this.newsCache.set(cacheKey, { data: allNews, timestamp: Date.now() });
      
      return allNews;
    } catch (error) {
      console.error('Failed to fetch market news:', error);
      return [];
    }
  }

  // Get earnings calendar/data for a symbol
  async getEarningsData(symbol: string): Promise<EarningsData[]> {
    await globalRateLimiter.waitForSlot();
    console.log(`Fetching earnings data for ${symbol}...`);

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=earnings`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const earningsHistory = data.quoteSummary?.result?.[0]?.earnings?.earningsChart?.quarterly || [];

      return earningsHistory.map((item: any) => ({
        symbol,
        fiscalDateEnding: item.date || '',
        reportedEPS: item.actual?.raw || null,
        estimatedEPS: item.estimate?.raw || null,
        surprise: item.actual?.raw && item.estimate?.raw 
          ? item.actual.raw - item.estimate.raw 
          : null,
        surprisePercentage: item.actual?.raw && item.estimate?.raw && item.estimate.raw !== 0
          ? ((item.actual.raw - item.estimate.raw) / Math.abs(item.estimate.raw)) * 100
          : null
      }));
    } catch (error) {
      console.error(`Failed to fetch earnings for ${symbol}:`, error);
      return [];
    }
  }

  // Get company profile and overview
  async getCompanyProfile(symbol: string): Promise<any> {
    await globalRateLimiter.waitForSlot();
    console.log(`🏢 Fetching company profile for ${symbol}...`);

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile,summaryProfile`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const profile = data.quoteSummary?.result?.[0]?.assetProfile || {};
      const summary = data.quoteSummary?.result?.[0]?.summaryProfile || {};

      return {
        symbol,
        companyName: profile.name || symbol,
        sector: profile.sector || 'Unknown',
        industry: profile.industry || 'Unknown',
        description: profile.longBusinessSummary || '',
        website: profile.website || null,
        employees: profile.fullTimeEmployees || null,
        headquarters: profile.city && profile.country 
          ? `${profile.city}, ${profile.country}` 
          : null,
        ...summary
      };
    } catch (error) {
      console.error(`Failed to fetch profile for ${symbol}:`, error);
      return { symbol, companyName: symbol, sector: 'Unknown', industry: 'Unknown' };
    }
  }

  // Get insider trading activity
  async getInsiderActivity(symbol: string): Promise<any[]> {
    await globalRateLimiter.waitForSlot();
    console.log(`👔 Fetching insider activity for ${symbol}...`);

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=insiderTransactions`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const transactions = data.quoteSummary?.result?.[0]?.insiderTransactions?.transactions || [];

      return transactions.slice(0, 10).map((t: any) => ({
        name: t.filerName || 'Unknown',
        relation: t.filerRelation || 'Unknown',
        transactionType: t.transactionText || 'Unknown',
        shares: t.shares?.raw || 0,
        value: t.value?.raw || 0,
        date: t.startDate?.fmt || ''
      }));
    } catch (error) {
      console.error(`Failed to fetch insider activity for ${symbol}:`, error);
      return [];
    }
  }

  // Get institutional holdings
  async getInstitutionalHoldings(symbol: string): Promise<any> {
    await globalRateLimiter.waitForSlot();
    console.log(`🏛️ Fetching institutional holdings for ${symbol}...`);

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=institutionOwnership,majorHoldersBreakdown`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.quoteSummary?.result?.[0] || {};
      const breakdown = result.majorHoldersBreakdown || {};
      const institutions = result.institutionOwnership?.ownershipList || [];

      return {
        insidersPercentHeld: breakdown.insidersPercentHeld?.raw || 0,
        institutionsPercentHeld: breakdown.institutionsPercentHeld?.raw || 0,
        institutionsFloatPercentHeld: breakdown.institutionsFloatPercentHeld?.raw || 0,
        institutionsCount: breakdown.institutionsCount?.raw || 0,
        topInstitutions: institutions.slice(0, 5).map((i: any) => ({
          name: i.organization || 'Unknown',
          shares: i.position?.raw || 0,
          value: i.value?.raw || 0,
          percentHeld: i.pctHeld?.raw || 0
        }))
      };
    } catch (error) {
      console.error(`Failed to fetch institutional holdings for ${symbol}:`, error);
      return { insidersPercentHeld: 0, institutionsPercentHeld: 0, topInstitutions: [] };
    }
  }

  // Generate market insights for a symbol
  async generateMarketInsights(symbol: string): Promise<MarketInsight[]> {
    const insights: MarketInsight[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Get various data points
      const [news, earnings, _profile, insider, institutional] = await Promise.all([
        this.searchStockNews(symbol, 3),
        this.getEarningsData(symbol),
        this.getCompanyProfile(symbol),
        this.getInsiderActivity(symbol),
        this.getInstitutionalHoldings(symbol)
      ]);

      // News sentiment insight
      if (news.length > 0) {
        const positiveNews = news.filter(n => n.sentiment === 'positive').length;
        const negativeNews = news.filter(n => n.sentiment === 'negative').length;
        
        let sentiment = 'neutral';
        if (positiveNews > negativeNews) sentiment = 'positive';
        else if (negativeNews > positiveNews) sentiment = 'negative';

        insights.push({
          symbol,
          headline: `News Sentiment: ${sentiment.toUpperCase()}`,
          analysis: `Recent news for ${symbol} shows ${positiveNews} positive, ${negativeNews} negative, and ${news.length - positiveNews - negativeNews} neutral articles.`,
          source: 'News Analysis',
          confidence: Math.min(100, news.length * 15),
          timestamp
        });
      }

      // Earnings insight
      if (earnings.length > 0) {
        const latestEarnings = earnings[0];
        if (latestEarnings.surprisePercentage !== null) {
          const beat = latestEarnings.surprisePercentage > 0;
          insights.push({
            symbol,
            headline: beat ? 'Earnings Beat' : 'Earnings Miss',
            analysis: `${symbol} ${beat ? 'beat' : 'missed'} earnings estimates by ${Math.abs(latestEarnings.surprisePercentage).toFixed(1)}% (${latestEarnings.fiscalDateEnding})`,
            source: 'Earnings Data',
            confidence: 90,
            timestamp
          });
        }
      }

      // Institutional ownership insight
      if (institutional.institutionsPercentHeld > 0) {
        const highOwnership = institutional.institutionsPercentHeld > 0.7;
        insights.push({
          symbol,
          headline: highOwnership ? 'Strong Institutional Support' : 'Moderate Institutional Interest',
          analysis: `${(institutional.institutionsPercentHeld * 100).toFixed(1)}% institutional ownership with ${institutional.institutionsCount || 0} institutions holding shares.`,
          source: 'Ownership Data',
          confidence: 85,
          timestamp
        });
      }

      // Insider activity insight
      if (insider.length > 0) {
        const buys = insider.filter((t: any) => t.transactionType?.toLowerCase().includes('buy') || t.shares > 0);
        const sells = insider.filter((t: any) => t.transactionType?.toLowerCase().includes('sale') || t.shares < 0);
        
        if (buys.length > sells.length) {
          insights.push({
            symbol,
            headline: 'Insider Buying Activity',
            analysis: `Recent insider transactions show more buying (${buys.length}) than selling (${sells.length}) activity.`,
            source: 'Insider Transactions',
            confidence: 75,
            timestamp
          });
        } else if (sells.length > buys.length) {
          insights.push({
            symbol,
            headline: 'Insider Selling Activity',
            analysis: `Recent insider transactions show more selling (${sells.length}) than buying (${buys.length}) activity.`,
            source: 'Insider Transactions',
            confidence: 75,
            timestamp
          });
        }
      }

      return insights;
    } catch (error) {
      console.error(`Failed to generate insights for ${symbol}:`, error);
      return [];
    }
  }

  // Simple sentiment analysis based on keywords
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();
    
    const positiveWords = [
      'surge', 'soar', 'jump', 'gain', 'rise', 'rally', 'bull', 'up', 'high',
      'growth', 'profit', 'beat', 'exceed', 'strong', 'record', 'boost', 'upgrade',
      'buy', 'outperform', 'success', 'breakout', 'momentum'
    ];
    
    const negativeWords = [
      'drop', 'fall', 'plunge', 'sink', 'crash', 'bear', 'down', 'low',
      'loss', 'miss', 'decline', 'weak', 'cut', 'downgrade', 'sell',
      'underperform', 'fail', 'warning', 'concern', 'risk', 'layoff'
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

  // Check if source is trusted
  isTrustedSource(url: string): boolean {
    return TRUSTED_SOURCES.some(source => url.includes(source));
  }
}

// Singleton instance
export const webSearchService = new WebSearchService();
