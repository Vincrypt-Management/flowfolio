import { useState, useEffect, useCallback, useRef } from 'react';
import { newsService, SentimentAnalysis } from '../services/newsService';
import { createLogger } from '../core/logger';
import './NewsFeed.css';

const log = createLogger('news-feed');

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface NewsFeedProps {
  symbol?: string;
  compact?: boolean;
  onLogToJournal?: (title: string, content: string) => void;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

function NewsFeed({ symbol: initialSymbol, compact = false, onLogToJournal }: NewsFeedProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [inputSymbol, setInputSymbol] = useState(initialSymbol ?? '');
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol ?? '');
  const [sentiment, setSentiment] = useState<SentimentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSentiment = useCallback(async (sym: string) => {
    if (!sym.trim()) return;
    const normalized = sym.trim().toUpperCase();
    try {
      setLoading(true);
      const result = await newsService.getSentiment(normalized);
      setSentiment(result);
      setActiveSymbol(normalized);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      log.error(`Failed to fetch sentiment for ${normalized}`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on initial symbol change
  useEffect(() => {
    if (initialSymbol) {
      setInputSymbol(initialSymbol);
      setActiveSymbol(initialSymbol);
      fetchSentiment(initialSymbol);
    }
  }, [initialSymbol, fetchSentiment]);

  // Auto-refresh
  useEffect(() => {
    if (!activeSymbol) return;

    refreshTimerRef.current = setInterval(() => {
      fetchSentiment(activeSymbol);
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [activeSymbol, fetchSentiment]);

  const handleSubmit = useCallback(() => {
    if (inputSymbol.trim()) {
      fetchSentiment(inputSymbol);
    }
  }, [inputSymbol, fetchSentiment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit();
    },
    [handleSubmit],
  );

  const handleArticleClick = useCallback((url: string) => {
    if (url) window.open(url, '_blank', 'noopener');
  }, []);

  const handleLogToJournal = useCallback(
    (title: string, source: string) => {
      if (!onLogToJournal) return;
      const content = `News: "${title}" (Source: ${source}) - Symbol: ${activeSymbol}`;
      onLogToJournal(title, content);
    },
    [onLogToJournal, activeSymbol],
  );

  // Sentiment score bar positioning
  const scoreBarStyle = () => {
    if (!sentiment) return {};
    const score = sentiment.sentimentScore; // -100 to 100
    if (score >= 0) {
      return {
        left: '50%',
        width: `${(score / 100) * 50}%`,
      };
    }
    const absWidth = (Math.abs(score) / 100) * 50;
    return {
      left: `${50 - absWidth}%`,
      width: `${absWidth}%`,
    };
  };

  return (
    <div
      className={`newsfeed${compact ? ' newsfeed-compact' : ''}${collapsed ? ' newsfeed-collapsed' : ''}`}
    >
      {/* Header */}
      <div className="newsfeed-header">
        <span className="newsfeed-title">
          {collapsed ? 'News' : `News${activeSymbol ? ` - ${activeSymbol}` : ''}`}
        </span>
        <button
          className="newsfeed-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B6' : '\u25C0'}
        </button>
      </div>

      {/* Body (hidden when collapsed) */}
      <div className="newsfeed-body">
        {/* Symbol Input */}
        <div className="newsfeed-symbol-bar">
          <input
            className="newsfeed-symbol-input"
            type="text"
            placeholder="Enter symbol..."
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={10}
          />
          <button
            className="newsfeed-fetch-btn"
            onClick={handleSubmit}
            disabled={loading || !inputSymbol.trim()}
          >
            {loading ? '...' : 'Go'}
          </button>
        </div>

        {/* Loading */}
        {loading && !sentiment && (
          <div className="newsfeed-loading">
            <div className="newsfeed-spinner" />
            Fetching news...
          </div>
        )}

        {/* No symbol selected */}
        {!loading && !sentiment && !activeSymbol && (
          <div className="newsfeed-empty">
            <span>Enter a stock symbol</span>
            <span className="newsfeed-empty-hint">e.g., AAPL, MSFT, TSLA</span>
          </div>
        )}

        {/* Sentiment summary */}
        {sentiment && (
          <>
            <div className="newsfeed-sentiment">
              <div className="newsfeed-sentiment-top">
                <span
                  className={`newsfeed-sentiment-badge sentiment-${sentiment.overallSentiment}`}
                >
                  {sentiment.overallSentiment}
                </span>
                <div className="newsfeed-buzz">
                  <span>Buzz</span>
                  <div className="newsfeed-buzz-bar">
                    <div
                      className="newsfeed-buzz-fill"
                      style={{ width: `${sentiment.buzzScore}%` }}
                    />
                  </div>
                  <span>{sentiment.buzzScore}</span>
                </div>
              </div>

              {/* Score bar */}
              <div className="newsfeed-score-bar-wrapper">
                <span className="newsfeed-score-label">-100</span>
                <div className="newsfeed-score-bar">
                  <div className="newsfeed-score-center" />
                  <div
                    className={`newsfeed-score-fill ${sentiment.sentimentScore >= 0 ? 'score-positive' : 'score-negative'}`}
                    style={scoreBarStyle()}
                  />
                </div>
                <span className="newsfeed-score-label">+100</span>
              </div>

              {/* Article counts */}
              <div className="newsfeed-sentiment-counts">
                <div className="newsfeed-count">
                  <span className="newsfeed-count-dot dot-positive" />
                  <span className="newsfeed-count-val">{sentiment.positiveCount}</span>
                </div>
                <div className="newsfeed-count">
                  <span className="newsfeed-count-dot dot-negative" />
                  <span className="newsfeed-count-val">{sentiment.negativeCount}</span>
                </div>
                <div className="newsfeed-count">
                  <span className="newsfeed-count-dot dot-neutral" />
                  <span className="newsfeed-count-val">{sentiment.neutralCount}</span>
                </div>
              </div>
            </div>

            {/* Articles */}
            <div className="newsfeed-articles">
              {sentiment.topNews.length === 0 ? (
                <div className="newsfeed-empty">No articles found</div>
              ) : (
                sentiment.topNews.map((article, idx) => (
                  <div
                    key={`${article.url}-${idx}`}
                    className="newsfeed-article"
                    onClick={() => handleArticleClick(article.url)}
                  >
                    <div className="newsfeed-article-top">
                      <span
                        className={`newsfeed-article-sentiment article-${article.sentiment}`}
                      >
                        {article.sentiment}
                      </span>
                      <span className="newsfeed-article-relevance">
                        {Math.round(article.relevanceScore * 100)}%
                      </span>
                    </div>
                    <div className="newsfeed-article-title">{article.title}</div>
                    <div className="newsfeed-article-meta">
                      <span className="newsfeed-article-source">{article.source}</span>
                      <span className="newsfeed-article-time">
                        {formatTimeAgo(article.publishedAt)}
                      </span>
                    </div>
                    {onLogToJournal && (
                      <div className="newsfeed-article-actions">
                        <button
                          className="newsfeed-log-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLogToJournal(article.title, article.source);
                          }}
                        >
                          Log to Journal
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Refresh note */}
            {lastUpdated && (
              <div className="newsfeed-refresh-note">
                Updated {lastUpdated} -- auto-refreshes every 5 min
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { NewsFeed };
