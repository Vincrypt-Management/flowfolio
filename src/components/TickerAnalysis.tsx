/**
 * Detailed Ticker Analysis Component
 * Provides comprehensive quantitative and fundamental analysis for a single ticker
 */

import { useState, useEffect, useRef } from 'react';
import { invoke } from '../services/tauri';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Target,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import './TickerAnalysis.css';

interface TickerAnalysisProps {
  symbol: string;
  onClose: () => void;
  inline?: boolean;
  availableTickers?: string[];
  onTickerChange?: (ticker: string) => void;
}

interface TickerData {
  symbol: string;
  timestamp: string;
  currentPrice?: number;
  quantMetrics?: {
    sharpeRatio: number;
    sortinoRatio: number;
    annualizedReturn: number;
    volatility: number;
    maxDrawdown: number;
    rsi: number;
    signal: string;
    confidence: number;
    beta: number;
    alpha: number;
    var95: number;
    cvar95: number;
    calmarRatio: number;
    informationRatio: number;
    treynorRatio: number;
    rsiSignal: string;
    trendStrength: string;
    momentumScore: number;
  };
  fundamentals?: {
    peRatio: number | null;
    forwardPE: number | null;
    priceToBook: number | null;
    profitMargin: number | null;
    returnOnEquity: number | null;
    revenueGrowthYoY: number | null;
    debtToEquity: number | null;
    dividendYield: number | null;
    marketCap: number;
    eps: number | null;
    beta: number | null;
    valueScore: number;
    qualityScore: number;
    growthScore: number;
  };
  sentiment?: {
    overallSentiment: string;
    sentimentScore: number;
    newsCount: number;
    buzzScore: number;
    sentimentTrend: string;
  };
  analystData?: {
    consensusRating: string;
    targetPriceMean: number | null;
    targetPriceHigh: number | null;
    targetPriceLow: number | null;
    numberOfAnalysts: number;
    upside: number | null;
  };
}

export default function TickerAnalysis({ symbol, onClose, inline = false, availableTickers, onTickerChange }: TickerAnalysisProps) {
  const [data, setData] = useState<TickerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadTickerData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [symbol]);

  async function loadTickerData() {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await invoke<TickerData>('get_detailed_ticker_analysis', { symbol });
      if (isMountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load ticker data');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  const formatCurrency = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(2)}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  // Prepare radar chart data for composite scores
  const radarData = data?.fundamentals ? [
    { metric: 'Value', score: data.fundamentals.valueScore, fullMark: 100 },
    { metric: 'Quality', score: data.fundamentals.qualityScore, fullMark: 100 },
    { metric: 'Growth', score: data.fundamentals.growthScore, fullMark: 100 },
    { metric: 'Momentum', score: data.quantMetrics ? Math.max(0, 50 + data.quantMetrics.momentumScore / 2) : 50, fullMark: 100 },
    { metric: 'Sentiment', score: data.sentiment ? (data.sentiment.sentimentScore + 1) * 50 : 50, fullMark: 100 },
  ] : [];

  return (
    <div className={inline ? "ticker-analysis-inline" : "ticker-analysis-overlay"}>
      <div className={inline ? "ticker-analysis-card" : "ticker-analysis-modal"}>
        <div className="ticker-analysis-header">
          <div className="header-left">
            {inline && availableTickers && availableTickers.length > 1 ? (
              <select 
                className="ticker-selector"
                value={symbol}
                onChange={(e) => onTickerChange?.(e.target.value)}
              >
                {availableTickers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <h2>{symbol}</h2>
            )}
            {data?.currentPrice && (
              <span className="current-price">${data.currentPrice.toFixed(2)}</span>
            )}
            {data?.quantMetrics && (
              <span className={`signal-badge ${data.quantMetrics.signal.toLowerCase().replace(' ', '-')}`}>
                {data.quantMetrics.signal}
              </span>
            )}
          </div>
          <div className="header-actions">
            <button className="btn-refresh" onClick={loadTickerData} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
            </button>
            {!inline && (
              <button className="btn-close" onClick={onClose}>
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="loading-state">
            <Loader2 size={32} className="spinning" />
            <span>Analyzing {symbol}...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            <AlertTriangle size={32} />
            <span>{error}</span>
            <button onClick={loadTickerData}>Retry</button>
          </div>
        )}

        {data && !isLoading && (
          <div className="ticker-analysis-content">
            {/* Composite Score Radar */}
            <div className="analysis-section">
              <h3><Target size={18} /> Composite Analysis</h3>
              <div className="radar-container">
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="var(--accent)"
                      fill="var(--accent)"
                      fillOpacity={0.3}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quantitative Metrics */}
            {data.quantMetrics && (
              <div className="analysis-section">
                <h3><Activity size={18} /> Quantitative Metrics</h3>
                <div className="metrics-grid">
                  <div className="metric-card">
                    <span className="metric-label">Sharpe Ratio</span>
                    <span className={`metric-value ${data.quantMetrics.sharpeRatio >= 1 ? 'positive' : data.quantMetrics.sharpeRatio >= 0 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.sharpeRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Sortino Ratio</span>
                    <span className={`metric-value ${data.quantMetrics.sortinoRatio >= 1 ? 'positive' : 'neutral'}`}>
                      {data.quantMetrics.sortinoRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Ann. Return</span>
                    <span className={`metric-value ${data.quantMetrics.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                      {data.quantMetrics.annualizedReturn >= 0 ? '+' : ''}{data.quantMetrics.annualizedReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Volatility</span>
                    <span className={`metric-value ${data.quantMetrics.volatility <= 20 ? 'positive' : data.quantMetrics.volatility <= 35 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.volatility.toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Max Drawdown</span>
                    <span className={`metric-value ${data.quantMetrics.maxDrawdown >= -15 ? 'positive' : data.quantMetrics.maxDrawdown >= -30 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.maxDrawdown.toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">RSI</span>
                    <span className={`metric-value ${data.quantMetrics.rsiSignal === 'oversold' ? 'positive' : data.quantMetrics.rsiSignal === 'overbought' ? 'negative' : 'neutral'}`}>
                      {data.quantMetrics.rsi.toFixed(0)}
                      <small> ({data.quantMetrics.rsiSignal})</small>
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Beta</span>
                    <span className="metric-value">{data.quantMetrics.beta.toFixed(2)}</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Alpha</span>
                    <span className={`metric-value ${data.quantMetrics.alpha >= 0 ? 'positive' : 'negative'}`}>
                      {data.quantMetrics.alpha >= 0 ? '+' : ''}{data.quantMetrics.alpha.toFixed(2)}%
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Calmar Ratio</span>
                    <span className={`metric-value ${data.quantMetrics.calmarRatio >= 1 ? 'positive' : 'neutral'}`}>
                      {data.quantMetrics.calmarRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Confidence</span>
                    <span className="metric-value">{data.quantMetrics.confidence.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Risk Metrics */}
                <div className="risk-section">
                  <h4><Shield size={16} /> Risk Metrics</h4>
                  <div className="risk-bars">
                    <div className="risk-item">
                      <span className="risk-label">VaR (95%)</span>
                      <div className="risk-bar">
                        <div 
                          className="risk-fill" 
                          style={{ 
                            width: `${Math.min(100, (data.quantMetrics.var95 / 5000) * 100)}%`,
                            background: data.quantMetrics.var95 > 2000 ? '#ef4444' : data.quantMetrics.var95 > 1000 ? '#f59e0b' : '#22c55e'
                          }} 
                        />
                      </div>
                      <span className="risk-value">${data.quantMetrics.var95.toFixed(0)}</span>
                    </div>
                    <div className="risk-item">
                      <span className="risk-label">CVaR (95%)</span>
                      <div className="risk-bar">
                        <div 
                          className="risk-fill" 
                          style={{ 
                            width: `${Math.min(100, (data.quantMetrics.cvar95 / 7500) * 100)}%`,
                            background: data.quantMetrics.cvar95 > 3000 ? '#ef4444' : data.quantMetrics.cvar95 > 1500 ? '#f59e0b' : '#22c55e'
                          }} 
                        />
                      </div>
                      <span className="risk-value">${data.quantMetrics.cvar95.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fundamental Analysis */}
            {data.fundamentals && (
              <div className="analysis-section">
                <h3><BarChart3 size={18} /> Fundamental Analysis</h3>
                <div className="fundamentals-grid">
                  <div className="fundamental-item">
                    <span className="fund-label">Market Cap</span>
                    <span className="fund-value">{formatCurrency(data.fundamentals.marketCap)}</span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">P/E Ratio</span>
                    <span className={`fund-value ${data.fundamentals.peRatio && data.fundamentals.peRatio < 20 ? 'positive' : data.fundamentals.peRatio && data.fundamentals.peRatio < 35 ? 'neutral' : 'negative'}`}>
                      {data.fundamentals.peRatio?.toFixed(2) ?? 'N/A'}
                    </span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">Forward P/E</span>
                    <span className="fund-value">{data.fundamentals.forwardPE?.toFixed(2) ?? 'N/A'}</span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">P/B Ratio</span>
                    <span className="fund-value">{data.fundamentals.priceToBook?.toFixed(2) ?? 'N/A'}</span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">EPS</span>
                    <span className="fund-value">${data.fundamentals.eps?.toFixed(2) ?? 'N/A'}</span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">ROE</span>
                    <span className={`fund-value ${data.fundamentals.returnOnEquity && data.fundamentals.returnOnEquity > 0.15 ? 'positive' : 'neutral'}`}>
                      {data.fundamentals.returnOnEquity ? `${(data.fundamentals.returnOnEquity * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">Profit Margin</span>
                    <span className="fund-value">
                      {data.fundamentals.profitMargin ? `${(data.fundamentals.profitMargin * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">Revenue Growth</span>
                    <span className={`fund-value ${data.fundamentals.revenueGrowthYoY && data.fundamentals.revenueGrowthYoY > 0 ? 'positive' : 'negative'}`}>
                      {data.fundamentals.revenueGrowthYoY ? `${(data.fundamentals.revenueGrowthYoY * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">Debt/Equity</span>
                    <span className={`fund-value ${data.fundamentals.debtToEquity && data.fundamentals.debtToEquity < 0.5 ? 'positive' : data.fundamentals.debtToEquity && data.fundamentals.debtToEquity < 1.5 ? 'neutral' : 'negative'}`}>
                      {data.fundamentals.debtToEquity?.toFixed(2) ?? 'N/A'}
                    </span>
                  </div>
                  <div className="fundamental-item">
                    <span className="fund-label">Div. Yield</span>
                    <span className="fund-value">
                      {data.fundamentals.dividendYield ? `${(data.fundamentals.dividendYield * 100).toFixed(2)}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Score Summary */}
                <div className="score-summary">
                  <div className="score-item">
                    <div className="score-circle" style={{ borderColor: getScoreColor(data.fundamentals.valueScore) }}>
                      <span>{data.fundamentals.valueScore.toFixed(0)}</span>
                    </div>
                    <span className="score-label">Value</span>
                  </div>
                  <div className="score-item">
                    <div className="score-circle" style={{ borderColor: getScoreColor(data.fundamentals.qualityScore) }}>
                      <span>{data.fundamentals.qualityScore.toFixed(0)}</span>
                    </div>
                    <span className="score-label">Quality</span>
                  </div>
                  <div className="score-item">
                    <div className="score-circle" style={{ borderColor: getScoreColor(data.fundamentals.growthScore) }}>
                      <span>{data.fundamentals.growthScore.toFixed(0)}</span>
                    </div>
                    <span className="score-label">Growth</span>
                  </div>
                </div>
              </div>
            )}

            {/* Sentiment & Analyst */}
            <div className="analysis-section dual">
              {data.sentiment && (
                <div className="sub-section">
                  <h4><Zap size={16} /> Market Sentiment</h4>
                  <div className="sentiment-display">
                    <div className={`sentiment-badge ${data.sentiment.overallSentiment}`}>
                      {data.sentiment.overallSentiment === 'bullish' ? <TrendingUp size={20} /> : 
                       data.sentiment.overallSentiment === 'bearish' ? <TrendingDown size={20} /> : 
                       <Activity size={20} />}
                      <span>{data.sentiment.overallSentiment}</span>
                    </div>
                    <div className="sentiment-metrics">
                      <div><span>Score:</span> {data.sentiment.sentimentScore.toFixed(2)}</div>
                      <div><span>News Count:</span> {data.sentiment.newsCount}</div>
                      <div><span>Buzz:</span> {data.sentiment.buzzScore.toFixed(2)}</div>
                      <div><span>Trend:</span> {data.sentiment.sentimentTrend}</div>
                    </div>
                  </div>
                </div>
              )}

              {data.analystData && (
                <div className="sub-section">
                  <h4><Target size={16} /> Analyst Ratings</h4>
                  <div className="analyst-display">
                    <div className={`analyst-badge ${data.analystData.consensusRating.toLowerCase().replace(' ', '-')}`}>
                      {data.analystData.consensusRating}
                    </div>
                    <div className="analyst-metrics">
                      <div>
                        <span>Target (Avg):</span> 
                        {data.analystData.targetPriceMean ? `$${data.analystData.targetPriceMean.toFixed(2)}` : 'N/A'}
                      </div>
                      <div>
                        <span>Target Range:</span>
                        {data.analystData.targetPriceLow && data.analystData.targetPriceHigh 
                          ? `$${data.analystData.targetPriceLow.toFixed(0)} - $${data.analystData.targetPriceHigh.toFixed(0)}`
                          : 'N/A'}
                      </div>
                      <div>
                        <span>Analysts:</span> {data.analystData.numberOfAnalysts}
                      </div>
                      {data.analystData.upside !== null && (
                        <div className={`upside ${data.analystData.upside >= 0 ? 'positive' : 'negative'}`}>
                          <span>Upside:</span> {data.analystData.upside >= 0 ? '+' : ''}{data.analystData.upside.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
