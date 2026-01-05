// MCP (Model Context Protocol) Web Search Service
// Provides internet search capabilities for the AI agent to find real-time information

import { globalRateLimiter } from './rateLimiter';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
  relevanceScore?: number;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  provider: string;
}

export interface NewsSearchResult extends SearchResult {
  imageUrl?: string;
  author?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// Search provider configuration
const SEARCH_CONFIG = {
  // Brave Search API (primary)
  brave: {
    baseUrl: 'https://api.search.brave.com/res/v1',
    apiKeyEnv: 'VITE_BRAVE_SEARCH_API_KEY'
  },
  // SerpAPI (fallback)
  serp: {
    baseUrl: 'https://serpapi.com/search',
    apiKeyEnv: 'VITE_SERP_API_KEY'
  },
  // Tavily (AI-optimized search)
  tavily: {
    baseUrl: 'https://api.tavily.com/search',
    apiKeyEnv: 'VITE_TAVILY_API_KEY'
  }
};

// Financial news sources to prioritize
const FINANCIAL_SOURCES = [
  'reuters.com', 'bloomberg.com', 'wsj.com', 'cnbc.com', 'marketwatch.com',
  'seekingalpha.com', 'finance.yahoo.com', 'fool.com', 'barrons.com', 'ft.com',
  'investing.com', 'benzinga.com', 'thestreet.com', 'zacks.com'
];

class MCPWebSearchService {
  private cache: Map<string, { data: WebSearchResponse; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Perform a web search using available providers
   */
  async search(
    query: string, 
    type: 'news' | 'general' | 'finance' = 'general',
    count: number = 5
  ): Promise<WebSearchResponse> {
    const cacheKey = `${type}:${query}:${count}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[MCP] Cache hit for: ${query}`);
      return cached.data;
    }

    await globalRateLimiter.waitForSlot();
    const startTime = Date.now();
    
    console.log(`[MCP] Searching: "${query}" (type: ${type})`);

    // Try providers in order of preference
    let response: WebSearchResponse | null = null;

    // Try Tavily first (AI-optimized)
    const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY;
    if (tavilyKey) {
      response = await this.searchWithTavily(query, type, count, tavilyKey);
    }

    // Try Brave Search
    if (!response) {
      const braveKey = import.meta.env.VITE_BRAVE_SEARCH_API_KEY;
      if (braveKey) {
        response = await this.searchWithBrave(query, type, count, braveKey);
      }
    }

    // Fallback to DuckDuckGo (no API key needed)
    if (!response) {
      response = await this.searchWithDuckDuckGo(query, type, count);
    }

    // Final fallback - return empty results
    if (!response) {
      response = {
        query,
        results: [],
        totalResults: 0,
        searchTime: Date.now() - startTime,
        provider: 'none'
      };
    }

    // Cache results
    this.cache.set(cacheKey, { data: response, timestamp: Date.now() });
    
    return response;
  }

  /**
   * Search using Tavily API (AI-optimized search)
   */
  private async searchWithTavily(
    query: string, 
    type: string, 
    count: number, 
    apiKey: string
  ): Promise<WebSearchResponse | null> {
    try {
      const searchDepth = type === 'news' ? 'basic' : 'advanced';
      const includeImages = false;
      
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: type === 'finance' ? `${query} stock market finance` : query,
          search_depth: searchDepth,
          include_images: includeImages,
          include_answer: true,
          max_results: count
        })
      });

      if (!response.ok) {
        console.warn(`[MCP] Tavily error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.content || r.snippet || '',
        source: this.extractDomain(r.url),
        publishedDate: r.published_date,
        relevanceScore: r.score
      }));

      return {
        query,
        results,
        totalResults: results.length,
        searchTime: 0,
        provider: 'tavily'
      };
    } catch (error) {
      console.error('[MCP] Tavily search failed:', error);
      return null;
    }
  }

  /**
   * Search using Brave Search API
   */
  private async searchWithBrave(
    query: string, 
    type: string, 
    count: number, 
    apiKey: string
  ): Promise<WebSearchResponse | null> {
    try {
      const endpoint = type === 'news' ? 'news/search' : 'web/search';
      const url = new URL(`${SEARCH_CONFIG.brave.baseUrl}/${endpoint}`);
      url.searchParams.set('q', type === 'finance' ? `${query} stock finance` : query);
      url.searchParams.set('count', String(Math.min(count, 20)));
      
      if (type === 'news') {
        url.searchParams.set('freshness', 'pw'); // Past week
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      });

      if (!response.ok) {
        console.warn(`[MCP] Brave error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const rawResults = type === 'news' ? data.results : data.web?.results || [];
      
      const results: SearchResult[] = rawResults.map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.description || r.snippet || '',
        source: this.extractDomain(r.url),
        publishedDate: r.age || r.published_time
      }));

      return {
        query,
        results,
        totalResults: data.query?.total || results.length,
        searchTime: 0,
        provider: 'brave'
      };
    } catch (error) {
      console.error('[MCP] Brave search failed:', error);
      return null;
    }
  }

  /**
   * Search using DuckDuckGo Instant Answer API (free, no key required)
   */
  private async searchWithDuckDuckGo(
    query: string, 
    type: string, 
    count: number
  ): Promise<WebSearchResponse | null> {
    try {
      // DuckDuckGo instant answer API
      const url = new URL('https://api.duckduckgo.com/');
      url.searchParams.set('q', type === 'finance' ? `${query} stock market` : query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('no_redirect', '1');
      url.searchParams.set('skip_disambig', '1');

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        console.warn(`[MCP] DuckDuckGo error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      // Abstract
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || '',
          snippet: data.Abstract,
          source: data.AbstractSource || 'DuckDuckGo'
        });
      }

      // Related topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, count - results.length)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text,
              url: topic.FirstURL,
              snippet: topic.Text,
              source: this.extractDomain(topic.FirstURL)
            });
          }
        }
      }

      // If we have very few results, also try to get news from Yahoo Finance
      if (results.length < 2 && type === 'news') {
        const yahooNews = await this.getYahooFinanceNews(query, count);
        results.push(...yahooNews);
      }

      return {
        query,
        results: results.slice(0, count),
        totalResults: results.length,
        searchTime: 0,
        provider: 'duckduckgo'
      };
    } catch (error) {
      console.error('[MCP] DuckDuckGo search failed:', error);
      return null;
    }
  }

  /**
   * Get news from Yahoo Finance (fallback for stock news)
   */
  private async getYahooFinanceNews(query: string, count: number): Promise<SearchResult[]> {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.ok) return [];

      const data = await response.json();
      const newsItems = data.news || [];

      return newsItems.map((item: any) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.title || '',
        source: item.publisher || 'Yahoo Finance',
        publishedDate: item.providerPublishTime 
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : undefined
      }));
    } catch (error) {
      console.error('[MCP] Yahoo Finance news failed:', error);
      return [];
    }
  }

  /**
   * Search specifically for stock news
   */
  async searchStockNews(
    symbol: string, 
    additionalQuery?: string, 
    _days: number = 7
  ): Promise<NewsSearchResult[]> {
    const query = additionalQuery 
      ? `${symbol} stock ${additionalQuery}`
      : `${symbol} stock news analysis`;

    const response = await this.search(query, 'news', 10);
    
    return response.results.map(r => ({
      ...r,
      sentiment: this.analyzeSentiment(r.title + ' ' + r.snippet)
    }));
  }

  /**
   * Search for market trends and analysis
   */
  async searchMarketTrends(
    topic: string, 
    timeframe: 'today' | 'week' | 'month' = 'week'
  ): Promise<WebSearchResponse> {
    const timeframeQuery = {
      today: 'today latest',
      week: 'this week recent',
      month: 'this month'
    };

    const query = `${topic} market ${timeframeQuery[timeframe]} analysis outlook`;
    return this.search(query, 'finance', 8);
  }

  /**
   * Get financial research and analysis
   */
  async searchFinancialResearch(
    query: string, 
    sources?: string[]
  ): Promise<WebSearchResponse> {
    const sourcesQuery = sources?.length 
      ? `site:${sources.join(' OR site:')}` 
      : '';
    
    const fullQuery = sourcesQuery 
      ? `${query} ${sourcesQuery}`
      : `${query} analysis research`;

    return this.search(fullQuery, 'finance', 10);
  }

  /**
   * Simple sentiment analysis
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();
    
    const positiveWords = [
      'surge', 'soar', 'jump', 'gain', 'rise', 'rally', 'bull', 'up', 'high',
      'growth', 'profit', 'beat', 'exceed', 'strong', 'record', 'boost', 'upgrade',
      'buy', 'outperform', 'success', 'breakout', 'momentum', 'bullish'
    ];
    
    const negativeWords = [
      'drop', 'fall', 'plunge', 'sink', 'crash', 'bear', 'down', 'low',
      'loss', 'miss', 'decline', 'weak', 'cut', 'downgrade', 'sell',
      'underperform', 'fail', 'warning', 'concern', 'risk', 'layoff', 'bearish'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveScore++;
    });

    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeScore++;
    });

    if (positiveScore > negativeScore + 1) return 'positive';
    if (negativeScore > positiveScore + 1) return 'negative';
    return 'neutral';
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Check if source is a trusted financial source
   */
  isTrustedFinancialSource(url: string): boolean {
    const domain = this.extractDomain(url);
    return FINANCIAL_SOURCES.some(source => domain.includes(source));
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[MCP] Search cache cleared');
  }
}

// Singleton instance
export const mcpWebSearch = new MCPWebSearchService();
