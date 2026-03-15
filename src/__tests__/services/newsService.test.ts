import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/tauri', () => ({ invoke: vi.fn() }));
vi.mock('../../services/localCache', () => ({
  localCacheService: {
    getSentiment: vi.fn().mockResolvedValue(null),
    setSentiment: vi.fn().mockResolvedValue(undefined),
    getAnalyst: vi.fn().mockResolvedValue(null),
    setAnalyst: vi.fn().mockResolvedValue(undefined),
  }
}));
vi.mock('../../services/rateLimiter', () => ({
  globalRateLimiter: { waitForSlot: vi.fn().mockResolvedValue(undefined) }
}));

import { newsService } from '../../services/newsService';

describe('analyzeSentiment', () => {
  it('returns positive for text with more positive keywords', () => {
    const result = (newsService as any).analyzeSentiment('Apple stock surge on record profit beat');
    expect(result).toBe('positive');
  });

  it('returns negative for text with more negative keywords', () => {
    const result = (newsService as any).analyzeSentiment('Stock crash and plunge after major loss and decline warning');
    expect(result).toBe('negative');
  });

  it('returns neutral for text with equal positive/negative keywords', () => {
    // one positive: 'gain', one negative: 'loss'
    const result = (newsService as any).analyzeSentiment('The company reported a gain but also a loss');
    expect(result).toBe('neutral');
  });

  it('returns neutral for text with no keywords', () => {
    const result = (newsService as any).analyzeSentiment('The company announced its quarterly results today');
    expect(result).toBe('neutral');
  });

  it('is case-insensitive', () => {
    const result = (newsService as any).analyzeSentiment('SURGE in PROFIT with RECORD GROWTH');
    expect(result).toBe('positive');
  });

  it('counts multiple positive words correctly', () => {
    // surge, soar, gain, rise, rally — five positive words, zero negative
    const result = (newsService as any).analyzeSentiment('surge soar gain rise rally');
    expect(result).toBe('positive');
  });
});

describe('CACHE_TTL', () => {
  it('is 4 hours (14400000 ms)', () => {
    const ttl = (newsService as any).CACHE_TTL;
    expect(ttl).toBe(4 * 60 * 60 * 1000);
    expect(ttl).toBe(14400000);
  });
});

describe('setCachedSentiment / getCachedSentiment', () => {
  const makeSentiment = (overallSentiment: 'bullish' | 'bearish' | 'neutral' = 'bullish') => ({
    symbol: 'AAPL',
    overallSentiment,
    sentimentScore: 80,
    newsCount: 5,
    positiveCount: 4,
    negativeCount: 1,
    neutralCount: 0,
    topNews: [],
    buzzScore: 100,
    lastUpdated: new Date().toISOString(),
  });

  beforeEach(() => {
    localStorage.clear();
    (newsService as any).cache.clear();
  });

  it('stores sentiment in memory cache', () => {
    const data = makeSentiment();
    (newsService as any).setCachedSentiment('AAPL', data);
    const inMemory = (newsService as any).cache.get('AAPL');
    expect(inMemory).not.toBeUndefined();
    expect(inMemory.data).toEqual(data);
  });

  it('retrieves from memory cache within TTL', () => {
    const data = makeSentiment();
    (newsService as any).setCachedSentiment('AAPL', data);
    const result = (newsService as any).getCachedSentiment('AAPL');
    expect(result).not.toBeNull();
    expect(result).toEqual(data);
  });

  it('stores to localStorage', () => {
    const data = makeSentiment();
    (newsService as any).setCachedSentiment('AAPL', data);
    const raw = localStorage.getItem('flowfolio_news_cache_sentiment_AAPL');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.data).toEqual(data);
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('retrieves from localStorage when not in memory', () => {
    const data = makeSentiment('bearish');
    (newsService as any).setCachedSentiment('AAPL', data);
    // Clear in-memory cache to force localStorage lookup
    (newsService as any).cache.clear();
    const result = (newsService as any).getCachedSentiment('AAPL');
    expect(result).not.toBeNull();
    expect(result!.overallSentiment).toBe('bearish');
  });

  it('returns null for expired localStorage cache', () => {
    const expiredEntry = {
      data: {
        symbol: 'AAPL',
        overallSentiment: 'neutral',
        sentimentScore: 0,
        newsCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        topNews: [],
        buzzScore: 0,
        lastUpdated: '',
      },
      timestamp: Date.now() - (5 * 60 * 60 * 1000), // 5 hours ago (past 4h TTL)
    };
    localStorage.setItem('flowfolio_news_cache_sentiment_AAPL', JSON.stringify(expiredEntry));
    // Ensure in-memory cache is also clear
    (newsService as any).cache.clear();
    const result = (newsService as any).getCachedSentiment('AAPL');
    expect(result).toBeNull();
  });
});
