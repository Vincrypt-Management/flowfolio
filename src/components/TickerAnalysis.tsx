/**
 * Detailed Ticker Analysis Component
 * Provides comprehensive quantitative and fundamental analysis for a single ticker
 * Shows AI-generated report directly inline with a clean list-based layout
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
  CheckCircle,
  Clock,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import './TickerAnalysis.css';
import { useAnalysisReport } from '../hooks/useAnalysisReport';
import type { TickerAnalysisData } from '../services/analysisReport';

// UI feedback duration (milliseconds)
const COPY_FEEDBACK_DURATION_MS = 2000;

interface TickerAnalysisProps {
  symbol: string;
  onClose: () => void;
  inline?: boolean;
  availableTickers?: string[];
  onTickerChange?: (ticker: string) => void;
  autoGenerateReport?: boolean;
}

interface TickerData {
  symbol: string;
  timestamp: string;
  currentPrice?: number;
  assetType?: 'stock' | 'etf' | 'bond';
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
    // Basic valuation
    peRatio: number | null;
    forwardPE: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
    evToEbitda: number | null;
    
    // Profitability
    profitMargin: number | null;
    operatingMargin: number | null;
    returnOnAssets: number | null;
    returnOnEquity: number | null;
    
    // Growth
    revenueGrowthYoY: number | null;
    earningsGrowthYoY: number | null;
    
    // Financial Health
    debtToEquity: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    freeCashFlow: number | null;
    
    // Dividend
    dividendYield: number | null;
    payoutRatio: number | null;
    dividendSafety: string | null;
    
    // Company info
    marketCap: number;
    eps: number | null;
    beta: number | null;
    companyName: string | null;
    sector: string | null;
    industry: string | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    
    // Advanced metrics
    altmanZScore: number | null;
    piotroskiFScore: number | null;
    grahamNumber: number | null;
    marginOfSafety: number | null;
    
    // Factor scores
    valueScore: number;
    qualityScore: number;
    growthScore: number;
    
    // Data quality
    dataSource: string | null;
    lastUpdated: string | null;
  };
  etfFundamentals?: {
    aum: number | null;
    expenseRatio: number | null;
    inceptionDate: string | null;
    indexTracked: string | null;
    numberOfHoldings: number | null;
    topHoldings: string[] | null;
    category: string | null;
    strategy: string | null;
    distributionYield: number | null;
    avgDailyVolume: number | null;
    bidAskSpread: number | null;
    premiumDiscount: number | null;
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

export default function TickerAnalysis({ 
  symbol, 
  onClose, 
  inline = false, 
  availableTickers, 
  onTickerChange,
  autoGenerateReport = true 
}: TickerAnalysisProps) {
  const [data, setData] = useState<TickerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isMountedRef = useRef(true);
  const reportGeneratedRef = useRef(false);
  
  const { 
    report, 
    isLoading: isReportLoading, 
    error: reportError,
    progress: reportProgress,
    generateTickerReport,
    exportMarkdown,
    clearReport
  } = useAnalysisReport();

  useEffect(() => {
    isMountedRef.current = true;
    reportGeneratedRef.current = false;
    loadTickerData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [symbol]);

  // Auto-generate report when data is loaded
  useEffect(() => {
    if (data && autoGenerateReport && !reportGeneratedRef.current && !report && !isReportLoading) {
      reportGeneratedRef.current = true;
      handleGenerateReport();
    }
  }, [data, autoGenerateReport, report, isReportLoading]);

  async function loadTickerData() {
    setIsLoading(true);
    setError(null);
    clearReport();
    
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

  async function handleGenerateReport() {
    if (!data || !data.currentPrice) return;
    
    const reportData: TickerAnalysisData = {
      symbol: data.symbol,
      currentPrice: data.currentPrice,
      quantMetrics: data.quantMetrics ? {
        sharpeRatio: data.quantMetrics.sharpeRatio,
        sortinoRatio: data.quantMetrics.sortinoRatio,
        annualizedReturn: data.quantMetrics.annualizedReturn,
        volatility: data.quantMetrics.volatility,
        maxDrawdown: data.quantMetrics.maxDrawdown,
        rsi: data.quantMetrics.rsi,
        signal: data.quantMetrics.signal,
        confidence: data.quantMetrics.confidence,
        beta: data.quantMetrics.beta,
        alpha: data.quantMetrics.alpha,
      } : undefined,
      fundamentals: data.fundamentals ? {
        // Basic valuation
        peRatio: data.fundamentals.peRatio,
        forwardPE: data.fundamentals.forwardPE,
        pegRatio: data.fundamentals.pegRatio,
        priceToBook: data.fundamentals.priceToBook,
        priceToSales: data.fundamentals.priceToSales,
        evToEbitda: data.fundamentals.evToEbitda,
        
        // Profitability
        profitMargin: data.fundamentals.profitMargin,
        operatingMargin: data.fundamentals.operatingMargin,
        returnOnAssets: data.fundamentals.returnOnAssets,
        returnOnEquity: data.fundamentals.returnOnEquity,
        
        // Growth
        revenueGrowthYoY: data.fundamentals.revenueGrowthYoY,
        earningsGrowthYoY: data.fundamentals.earningsGrowthYoY,
        
        // Financial Health
        debtToEquity: data.fundamentals.debtToEquity,
        currentRatio: data.fundamentals.currentRatio,
        quickRatio: data.fundamentals.quickRatio,
        freeCashFlow: data.fundamentals.freeCashFlow,
        
        // Dividend
        dividendYield: data.fundamentals.dividendYield,
        payoutRatio: data.fundamentals.payoutRatio,
        dividendSafety: data.fundamentals.dividendSafety,
        
        // Company info
        marketCap: data.fundamentals.marketCap,
        eps: data.fundamentals.eps,
        companyName: data.fundamentals.companyName,
        sector: data.fundamentals.sector,
        industry: data.fundamentals.industry,
        fiftyTwoWeekHigh: data.fundamentals.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: data.fundamentals.fiftyTwoWeekLow,
        
        // Advanced metrics
        altmanZScore: data.fundamentals.altmanZScore,
        piotroskiFScore: data.fundamentals.piotroskiFScore,
        grahamNumber: data.fundamentals.grahamNumber,
        marginOfSafety: data.fundamentals.marginOfSafety,
        
        // Factor scores
        valueScore: data.fundamentals.valueScore,
        qualityScore: data.fundamentals.qualityScore,
        growthScore: data.fundamentals.growthScore,
      } : undefined,
      sentiment: data.sentiment ? {
        overallSentiment: data.sentiment.overallSentiment,
        sentimentScore: data.sentiment.sentimentScore,
        newsCount: data.sentiment.newsCount,
      } : undefined,
      analystData: data.analystData ? {
        consensusRating: data.analystData.consensusRating,
        targetPriceMean: data.analystData.targetPriceMean,
        numberOfAnalysts: data.analystData.numberOfAnalysts,
        upside: data.analystData.upside,
      } : undefined,
    };
    
    await generateTickerReport(reportData);
  }

  const handleCopyReport = async () => {
    const markdown = exportMarkdown();
    if (markdown) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    }
  };

  const handleDownloadReport = () => {
    const markdown = exportMarkdown();
    if (markdown) {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${symbol}_analysis_${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(2)}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'var(--color-success)';
    if (score >= 50) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  const getSignalClass = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('strong buy') || s.includes('buy')) return 'positive';
    if (s.includes('sell')) return 'negative';
    return 'neutral';
  };

  // Prepare radar chart data
  const radarData = data?.fundamentals ? [
    { metric: 'Value', score: data.fundamentals.valueScore, fullMark: 100 },
    { metric: 'Quality', score: data.fundamentals.qualityScore, fullMark: 100 },
    { metric: 'Growth', score: data.fundamentals.growthScore, fullMark: 100 },
    { metric: 'Momentum', score: data.quantMetrics ? Math.max(0, 50 + data.quantMetrics.momentumScore / 2) : 50, fullMark: 100 },
    { metric: 'Sentiment', score: data.sentiment ? (data.sentiment.sentimentScore + 1) * 50 : 50, fullMark: 100 },
  ] : [];

  const overallScore = radarData.length > 0 
    ? Math.round(radarData.reduce((sum, d) => sum + d.score, 0) / radarData.length)
    : 50;

  return (
    <div className={inline ? "ticker-analysis-inline" : "ticker-analysis-overlay"}>
      <div className={inline ? "ticker-analysis-container" : "ticker-analysis-modal"}>
        {/* Header */}
        <div className="ta-header">
          <div className="ta-header-left">
            {inline && availableTickers && availableTickers.length > 1 ? (
              <select 
                className="ta-ticker-select"
                value={symbol}
                onChange={(e) => onTickerChange?.(e.target.value)}
                aria-label="Select ticker symbol"
              >
                {availableTickers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <h2 className="ta-symbol">{symbol}</h2>
            )}
            {data?.currentPrice && (
              <span className="ta-price">${data.currentPrice.toFixed(2)}</span>
            )}
            {data?.quantMetrics && (
              <span className={`ta-signal ${getSignalClass(data.quantMetrics.signal)}`}>
                {data.quantMetrics.signal}
              </span>
            )}
          </div>
          <div className="ta-header-right">
            {report && (
              <>
                <button className="ta-btn-icon" onClick={handleCopyReport} title="Copy Report" aria-label="Copy report">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
                <button className="ta-btn-icon" onClick={handleDownloadReport} title="Download" aria-label="Download report">
                  <Download size={16} />
                </button>
              </>
            )}
            <button 
              className="ta-btn-icon" 
              onClick={() => {
                reportGeneratedRef.current = false;
                loadTickerData();
              }} 
              disabled={isLoading || isReportLoading}
              title="Refresh"
              aria-label="Refresh data"
            >
              <RefreshCw size={16} className={isLoading || isReportLoading ? 'spinning' : ''} />
            </button>
            {!inline && (
              <button className="ta-btn-close" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {(isLoading || isReportLoading) && (
          <div className="ta-loading">
            <Loader2 size={24} className="spinning" />
            <span>{isLoading ? `Loading ${symbol}...` : reportProgress || 'Generating report...'}</span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="ta-error">
            <AlertTriangle size={20} />
            <span>{error}</span>
            <button onClick={loadTickerData}>Retry</button>
          </div>
        )}

        {reportError && (
          <div className="ta-error">
            <AlertTriangle size={16} />
            <span>{reportError}</span>
            <button onClick={handleGenerateReport}>Retry</button>
          </div>
        )}

        {/* Content */}
        {data && !isLoading && (
          <div className="ta-content">
            {/* Summary Section */}
            <div className="ta-section">
              <div className="ta-section-header">
                <Target size={18} />
                <h3>Summary</h3>
                <span className="ta-score" style={{ color: getScoreColor(overallScore) }}>
                  Score: {overallScore}/100
                </span>
              </div>
              
              <div className="ta-summary-grid">
                <div className="ta-summary-chart">
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Score" dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="ta-summary-stats">
                  {data.quantMetrics && (
                    <>
                      <div className="ta-stat-row">
                        <span className="ta-stat-label">Annual Return</span>
                        <span className={`ta-stat-value ${data.quantMetrics.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                          {data.quantMetrics.annualizedReturn >= 0 ? '+' : ''}{data.quantMetrics.annualizedReturn.toFixed(1)}%
                        </span>
                      </div>
                      <div className="ta-stat-row">
                        <span className="ta-stat-label">Volatility</span>
                        <span className="ta-stat-value">{data.quantMetrics.volatility.toFixed(1)}%</span>
                      </div>
                      <div className="ta-stat-row">
                        <span className="ta-stat-label">Sharpe Ratio</span>
                        <span className={`ta-stat-value ${data.quantMetrics.sharpeRatio >= 1 ? 'positive' : ''}`}>
                          {data.quantMetrics.sharpeRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="ta-stat-row">
                        <span className="ta-stat-label">Max Drawdown</span>
                        <span className="ta-stat-value negative">{data.quantMetrics.maxDrawdown.toFixed(1)}%</span>
                      </div>
                      <div className="ta-stat-row">
                        <span className="ta-stat-label">Confidence</span>
                        <span className="ta-stat-value">{data.quantMetrics.confidence.toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              {report?.executiveSummary && (
                <div className="ta-ai-summary">
                  <p>{report.executiveSummary}</p>
                </div>
              )}
            </div>

            {/* Quantitative Metrics */}
            {data.quantMetrics && (
              <div className="ta-section">
                <div className="ta-section-header">
                  <Activity size={18} />
                  <h3>Quantitative Metrics</h3>
                </div>
                
                <div className="ta-metrics-list">
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Sharpe Ratio</span>
                    <span className={`ta-metric-value ${data.quantMetrics.sharpeRatio >= 1 ? 'positive' : data.quantMetrics.sharpeRatio >= 0.5 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.sharpeRatio.toFixed(2)}
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.sharpeRatio >= 1 ? 'Excellent' : data.quantMetrics.sharpeRatio >= 0.5 ? 'Fair' : 'Poor'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Sortino Ratio</span>
                    <span className={`ta-metric-value ${data.quantMetrics.sortinoRatio >= 1 ? 'positive' : 'neutral'}`}>
                      {data.quantMetrics.sortinoRatio.toFixed(2)}
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.sortinoRatio >= 1 ? 'Good' : 'Moderate'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Annual Return</span>
                    <span className={`ta-metric-value ${data.quantMetrics.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                      {data.quantMetrics.annualizedReturn >= 0 ? '+' : ''}{data.quantMetrics.annualizedReturn.toFixed(2)}%
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.annualizedReturn >= 10 ? 'Strong' : data.quantMetrics.annualizedReturn >= 0 ? 'Positive' : 'Loss'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Volatility</span>
                    <span className={`ta-metric-value ${data.quantMetrics.volatility <= 20 ? 'positive' : data.quantMetrics.volatility <= 35 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.volatility.toFixed(2)}%
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.volatility <= 20 ? 'Low' : data.quantMetrics.volatility <= 35 ? 'Moderate' : 'High'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Max Drawdown</span>
                    <span className={`ta-metric-value ${data.quantMetrics.maxDrawdown >= -15 ? 'positive' : data.quantMetrics.maxDrawdown >= -30 ? 'neutral' : 'negative'}`}>
                      {data.quantMetrics.maxDrawdown.toFixed(2)}%
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.maxDrawdown >= -15 ? 'Contained' : data.quantMetrics.maxDrawdown >= -30 ? 'Moderate' : 'Severe'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Beta</span>
                    <span className="ta-metric-value">{data.quantMetrics.beta.toFixed(2)}</span>
                    <span className="ta-metric-status">{data.quantMetrics.beta <= 0.8 ? 'Defensive' : data.quantMetrics.beta <= 1.2 ? 'Market' : 'Aggressive'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">Alpha</span>
                    <span className={`ta-metric-value ${data.quantMetrics.alpha >= 0 ? 'positive' : 'negative'}`}>
                      {data.quantMetrics.alpha >= 0 ? '+' : ''}{data.quantMetrics.alpha.toFixed(2)}%
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.alpha >= 2 ? 'Outperform' : data.quantMetrics.alpha >= 0 ? 'Neutral' : 'Underperform'}</span>
                  </div>
                  <div className="ta-metric-item">
                    <span className="ta-metric-name">RSI</span>
                    <span className={`ta-metric-value ${data.quantMetrics.rsiSignal === 'oversold' ? 'positive' : data.quantMetrics.rsiSignal === 'overbought' ? 'negative' : 'neutral'}`}>
                      {data.quantMetrics.rsi.toFixed(0)}
                    </span>
                    <span className="ta-metric-status">{data.quantMetrics.rsiSignal}</span>
                  </div>
                </div>

                {/* Risk Metrics */}
                <div className="ta-subsection">
                  <h4><Shield size={16} /> Risk Metrics (per $10,000)</h4>
                  <div className="ta-risk-row">
                    <div className="ta-risk-item">
                      <span className="ta-risk-label">VaR (95%)</span>
                      <span className={`ta-risk-value ${data.quantMetrics.var95 > 2000 ? 'negative' : data.quantMetrics.var95 > 1000 ? 'neutral' : 'positive'}`}>
                        ${data.quantMetrics.var95.toFixed(0)}
                      </span>
                    </div>
                    <div className="ta-risk-item">
                      <span className="ta-risk-label">CVaR (95%)</span>
                      <span className={`ta-risk-value ${data.quantMetrics.cvar95 > 3000 ? 'negative' : data.quantMetrics.cvar95 > 1500 ? 'neutral' : 'positive'}`}>
                        ${data.quantMetrics.cvar95.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fundamentals */}
            {(data.fundamentals || data.etfFundamentals) && (
              <div className="ta-section">
                <div className="ta-section-header">
                  <BarChart3 size={18} />
                  <h3>Fundamentals {data.assetType === 'etf' ? '(ETF)' : ''}</h3>
                </div>
                
                {/* ETF-specific Fundamentals */}
                {data.assetType === 'etf' || data.etfFundamentals ? (
                  <div className="ta-metrics-list">
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">AUM</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.aum ? formatCurrency(data.etfFundamentals.aum) : 
                         data.fundamentals?.marketCap && data.fundamentals.marketCap > 0 ? formatCurrency(data.fundamentals.marketCap) : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Expense Ratio</span>
                      <span className={`ta-metric-value ${data.etfFundamentals?.expenseRatio && data.etfFundamentals.expenseRatio < 0.2 ? 'positive' : data.etfFundamentals?.expenseRatio && data.etfFundamentals.expenseRatio > 0.5 ? 'negative' : ''}`}>
                        {data.etfFundamentals?.expenseRatio ? `${data.etfFundamentals.expenseRatio.toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Distribution Yield</span>
                      <span className={`ta-metric-value ${data.etfFundamentals?.distributionYield && data.etfFundamentals.distributionYield > 2 ? 'positive' : ''}`}>
                        {data.etfFundamentals?.distributionYield ? `${data.etfFundamentals.distributionYield.toFixed(2)}%` :
                         data.fundamentals?.dividendYield ? `${(data.fundamentals.dividendYield * 100).toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Category</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.category || 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Index Tracked</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.indexTracked || 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name"># of Holdings</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.numberOfHoldings || 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Strategy</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.strategy || 'Passive Index'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Inception Date</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.inceptionDate || 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Avg Daily Volume</span>
                      <span className="ta-metric-value">
                        {data.etfFundamentals?.avgDailyVolume ? `${(data.etfFundamentals.avgDailyVolume / 1000000).toFixed(2)}M` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Premium/Discount</span>
                      <span className={`ta-metric-value ${data.etfFundamentals?.premiumDiscount && Math.abs(data.etfFundamentals.premiumDiscount) < 0.1 ? 'positive' : 'negative'}`}>
                        {data.etfFundamentals?.premiumDiscount ? `${data.etfFundamentals.premiumDiscount > 0 ? '+' : ''}${data.etfFundamentals.premiumDiscount.toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Stock Fundamentals - Enhanced with real data
                  <div className="ta-metrics-list">
                    {/* Company Info */}
                    {data.fundamentals?.companyName && (
                      <div className="ta-company-header">
                        <div className="ta-company-name">{data.fundamentals.companyName}</div>
                        <div className="ta-company-meta">
                          {data.fundamentals.sector && <span className="ta-sector-badge">{data.fundamentals.sector}</span>}
                          {data.fundamentals.industry && <span className="ta-industry">{data.fundamentals.industry}</span>}
                        </div>
                      </div>
                    )}
                    
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Market Cap</span>
                      <span className="ta-metric-value">{data.fundamentals?.marketCap && data.fundamentals.marketCap > 0 ? formatCurrency(data.fundamentals.marketCap) : 'N/A'}</span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">P/E Ratio</span>
                      <span className={`ta-metric-value ${data.fundamentals?.peRatio && data.fundamentals.peRatio < 20 ? 'positive' : data.fundamentals?.peRatio && data.fundamentals.peRatio > 35 ? 'negative' : ''}`}>
                        {data.fundamentals?.peRatio?.toFixed(1) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Forward P/E</span>
                      <span className="ta-metric-value">{data.fundamentals?.forwardPE?.toFixed(1) ?? 'N/A'}</span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">PEG Ratio</span>
                      <span className={`ta-metric-value ${data.fundamentals?.pegRatio && data.fundamentals.pegRatio < 1 ? 'positive' : data.fundamentals?.pegRatio && data.fundamentals.pegRatio > 2 ? 'negative' : ''}`}>
                        {data.fundamentals?.pegRatio?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">P/B Ratio</span>
                      <span className="ta-metric-value">{data.fundamentals?.priceToBook?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">P/S Ratio</span>
                      <span className="ta-metric-value">{data.fundamentals?.priceToSales?.toFixed(2) ?? 'N/A'}</span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">EV/EBITDA</span>
                      <span className={`ta-metric-value ${data.fundamentals?.evToEbitda && data.fundamentals.evToEbitda < 12 ? 'positive' : data.fundamentals?.evToEbitda && data.fundamentals.evToEbitda > 20 ? 'negative' : ''}`}>
                        {data.fundamentals?.evToEbitda?.toFixed(1) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">EPS</span>
                      <span className="ta-metric-value">{data.fundamentals?.eps != null ? `$${data.fundamentals.eps.toFixed(2)}` : 'N/A'}</span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">ROE</span>
                      <span className={`ta-metric-value ${data.fundamentals?.returnOnEquity && data.fundamentals.returnOnEquity > 0.15 ? 'positive' : data.fundamentals?.returnOnEquity && data.fundamentals.returnOnEquity < 0 ? 'negative' : ''}`}>
                        {data.fundamentals?.returnOnEquity != null ? `${(data.fundamentals.returnOnEquity * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">ROA</span>
                      <span className={`ta-metric-value ${data.fundamentals?.returnOnAssets && data.fundamentals.returnOnAssets > 0.08 ? 'positive' : ''}`}>
                        {data.fundamentals?.returnOnAssets != null ? `${(data.fundamentals.returnOnAssets * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Profit Margin</span>
                      <span className={`ta-metric-value ${data.fundamentals?.profitMargin && data.fundamentals.profitMargin > 0.15 ? 'positive' : data.fundamentals?.profitMargin && data.fundamentals.profitMargin < 0 ? 'negative' : ''}`}>
                        {data.fundamentals?.profitMargin != null ? `${(data.fundamentals.profitMargin * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Operating Margin</span>
                      <span className={`ta-metric-value ${data.fundamentals?.operatingMargin && data.fundamentals.operatingMargin > 0.15 ? 'positive' : ''}`}>
                        {data.fundamentals?.operatingMargin != null ? `${(data.fundamentals.operatingMargin * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Revenue Growth</span>
                      <span className={`ta-metric-value ${data.fundamentals?.revenueGrowthYoY && data.fundamentals.revenueGrowthYoY > 0 ? 'positive' : data.fundamentals?.revenueGrowthYoY && data.fundamentals.revenueGrowthYoY < 0 ? 'negative' : ''}`}>
                        {data.fundamentals?.revenueGrowthYoY != null ? `${data.fundamentals.revenueGrowthYoY > 0 ? '+' : ''}${(data.fundamentals.revenueGrowthYoY * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Earnings Growth</span>
                      <span className={`ta-metric-value ${data.fundamentals?.earningsGrowthYoY && data.fundamentals.earningsGrowthYoY > 0 ? 'positive' : data.fundamentals?.earningsGrowthYoY && data.fundamentals.earningsGrowthYoY < 0 ? 'negative' : ''}`}>
                        {data.fundamentals?.earningsGrowthYoY != null ? `${data.fundamentals.earningsGrowthYoY > 0 ? '+' : ''}${(data.fundamentals.earningsGrowthYoY * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Debt/Equity</span>
                      <span className={`ta-metric-value ${data.fundamentals?.debtToEquity && data.fundamentals.debtToEquity < 0.5 ? 'positive' : data.fundamentals?.debtToEquity && data.fundamentals.debtToEquity > 1.5 ? 'negative' : ''}`}>
                        {data.fundamentals?.debtToEquity?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Current Ratio</span>
                      <span className={`ta-metric-value ${data.fundamentals?.currentRatio && data.fundamentals.currentRatio > 1.5 ? 'positive' : data.fundamentals?.currentRatio && data.fundamentals.currentRatio < 1 ? 'negative' : ''}`}>
                        {data.fundamentals?.currentRatio?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Quick Ratio</span>
                      <span className={`ta-metric-value ${data.fundamentals?.quickRatio && data.fundamentals.quickRatio > 1 ? 'positive' : data.fundamentals?.quickRatio && data.fundamentals.quickRatio < 0.5 ? 'negative' : ''}`}>
                        {data.fundamentals?.quickRatio?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Free Cash Flow</span>
                      <span className={`ta-metric-value ${data.fundamentals?.freeCashFlow && data.fundamentals.freeCashFlow > 0 ? 'positive' : data.fundamentals?.freeCashFlow && data.fundamentals.freeCashFlow < 0 ? 'negative' : ''}`}>
                        {data.fundamentals?.freeCashFlow != null ? formatCurrency(data.fundamentals.freeCashFlow) : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">Dividend Yield</span>
                      <span className={`ta-metric-value ${data.fundamentals?.dividendYield && data.fundamentals.dividendYield > 0.02 ? 'positive' : ''}`}>
                        {data.fundamentals?.dividendYield != null ? `${(data.fundamentals.dividendYield * 100).toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>
                    {data.fundamentals?.dividendYield != null && data.fundamentals.dividendYield > 0 && (
                      <div className="ta-metric-item">
                        <span className="ta-metric-name">Dividend Safety</span>
                        <span className={`ta-metric-value ${data.fundamentals?.dividendSafety === 'very_safe' || data.fundamentals?.dividendSafety === 'safe' ? 'positive' : data.fundamentals?.dividendSafety === 'at_risk' || data.fundamentals?.dividendSafety === 'cutting' ? 'negative' : ''}`}>
                          {data.fundamentals?.dividendSafety?.replace('_', ' ').toUpperCase() ?? 'N/A'}
                        </span>
                      </div>
                    )}
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">52W High</span>
                      <span className="ta-metric-value">
                        {data.fundamentals?.fiftyTwoWeekHigh != null ? `$${data.fundamentals.fiftyTwoWeekHigh.toFixed(2)}` : 'N/A'}
                      </span>
                    </div>
                    <div className="ta-metric-item">
                      <span className="ta-metric-name">52W Low</span>
                      <span className="ta-metric-value">
                        {data.fundamentals?.fiftyTwoWeekLow != null ? `$${data.fundamentals.fiftyTwoWeekLow.toFixed(2)}` : 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Advanced Metrics Section */}
                {data.fundamentals && (data.fundamentals.altmanZScore || data.fundamentals.piotroskiFScore || data.fundamentals.grahamNumber) && (
                  <div className="ta-subsection">
                    <h4><Shield size={16} /> Advanced Financial Health</h4>
                    <div className="ta-metrics-list">
                      {data.fundamentals.altmanZScore != null && (
                        <div className="ta-metric-item">
                          <span className="ta-metric-name">Altman Z-Score</span>
                          <span className={`ta-metric-value ${data.fundamentals.altmanZScore > 3 ? 'positive' : data.fundamentals.altmanZScore < 1.8 ? 'negative' : ''}`}>
                            {data.fundamentals.altmanZScore.toFixed(2)}
                          </span>
                          <span className="ta-metric-status">
                            {data.fundamentals.altmanZScore > 3 ? 'Safe' : data.fundamentals.altmanZScore > 1.8 ? 'Grey Zone' : 'Distress'}
                          </span>
                        </div>
                      )}
                      {data.fundamentals.piotroskiFScore != null && (
                        <div className="ta-metric-item">
                          <span className="ta-metric-name">Piotroski F-Score</span>
                          <span className={`ta-metric-value ${data.fundamentals.piotroskiFScore >= 7 ? 'positive' : data.fundamentals.piotroskiFScore <= 3 ? 'negative' : ''}`}>
                            {data.fundamentals.piotroskiFScore}/9
                          </span>
                          <span className="ta-metric-status">
                            {data.fundamentals.piotroskiFScore >= 7 ? 'Strong' : data.fundamentals.piotroskiFScore >= 5 ? 'Average' : 'Weak'}
                          </span>
                        </div>
                      )}
                      {data.fundamentals.grahamNumber != null && (
                        <div className="ta-metric-item">
                          <span className="ta-metric-name">Graham Number</span>
                          <span className="ta-metric-value">${data.fundamentals.grahamNumber.toFixed(2)}</span>
                          <span className="ta-metric-status">Intrinsic Value</span>
                        </div>
                      )}
                      {data.fundamentals.marginOfSafety != null && (
                        <div className="ta-metric-item">
                          <span className="ta-metric-name">Margin of Safety</span>
                          <span className={`ta-metric-value ${data.fundamentals.marginOfSafety > 0 ? 'positive' : 'negative'}`}>
                            {data.fundamentals.marginOfSafety > 0 ? '+' : ''}{data.fundamentals.marginOfSafety.toFixed(1)}%
                          </span>
                          <span className="ta-metric-status">
                            {data.fundamentals.marginOfSafety > 25 ? 'Undervalued' : data.fundamentals.marginOfSafety > 0 ? 'Fair Value' : 'Overvalued'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Factor Scores - show for all assets */}
                {data.fundamentals && (
                  <div className="ta-subsection">
                    <h4>Factor Scores</h4>
                    <div className="ta-factor-list">
                      <div className="ta-factor-item">
                        <span className="ta-factor-name">Value</span>
                        <div className="ta-factor-bar">
                          <div className="ta-factor-fill" style={{ width: `${data.fundamentals.valueScore}%`, background: getScoreColor(data.fundamentals.valueScore) }} />
                        </div>
                        <span className="ta-factor-score" style={{ color: getScoreColor(data.fundamentals.valueScore) }}>{data.fundamentals.valueScore.toFixed(0)}</span>
                      </div>
                      <div className="ta-factor-item">
                        <span className="ta-factor-name">Quality</span>
                        <div className="ta-factor-bar">
                          <div className="ta-factor-fill" style={{ width: `${data.fundamentals.qualityScore}%`, background: getScoreColor(data.fundamentals.qualityScore) }} />
                        </div>
                        <span className="ta-factor-score" style={{ color: getScoreColor(data.fundamentals.qualityScore) }}>{data.fundamentals.qualityScore.toFixed(0)}</span>
                      </div>
                      <div className="ta-factor-item">
                        <span className="ta-factor-name">Growth</span>
                        <div className="ta-factor-bar">
                          <div className="ta-factor-fill" style={{ width: `${data.fundamentals.growthScore}%`, background: getScoreColor(data.fundamentals.growthScore) }} />
                        </div>
                        <span className="ta-factor-score" style={{ color: getScoreColor(data.fundamentals.growthScore) }}>{data.fundamentals.growthScore.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sentiment & Analyst */}
            {(data.sentiment || data.analystData) && (
              <div className="ta-section">
                <div className="ta-section-header">
                  <Zap size={18} />
                  <h3>Sentiment & Analyst</h3>
                </div>
                
                <div className="ta-two-col">
                  {data.sentiment && (
                    <div className="ta-col">
                      <h4>Market Sentiment</h4>
                      <div className={`ta-sentiment-badge ${data.sentiment.overallSentiment}`}>
                        {data.sentiment.overallSentiment === 'bullish' ? <TrendingUp size={16} /> : 
                         data.sentiment.overallSentiment === 'bearish' ? <TrendingDown size={16} /> : 
                         <Activity size={16} />}
                        {data.sentiment.overallSentiment}
                      </div>
                      <div className="ta-detail-list">
                        <div className="ta-detail-row">
                          <span>Score</span>
                          <span className={data.sentiment.sentimentScore > 0 ? 'positive' : data.sentiment.sentimentScore < 0 ? 'negative' : ''}>
                            {data.sentiment.sentimentScore.toFixed(2)}
                          </span>
                        </div>
                        <div className="ta-detail-row">
                          <span>News Count</span>
                          <span>{data.sentiment.newsCount}</span>
                        </div>
                        <div className="ta-detail-row">
                          <span>Buzz</span>
                          <span>{data.sentiment.buzzScore.toFixed(1)}</span>
                        </div>
                        <div className="ta-detail-row">
                          <span>Trend</span>
                          <span>{data.sentiment.sentimentTrend}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {data.analystData && (
                    <div className="ta-col">
                      <h4>Analyst Consensus</h4>
                      <div className={`ta-analyst-badge ${data.analystData.consensusRating.toLowerCase().replace(' ', '-')}`}>
                        {data.analystData.consensusRating}
                      </div>
                      <div className="ta-detail-list">
                        <div className="ta-detail-row">
                          <span>Target Price</span>
                          <span>{data.analystData.targetPriceMean ? `$${data.analystData.targetPriceMean.toFixed(2)}` : 'N/A'}</span>
                        </div>
                        <div className="ta-detail-row">
                          <span>Range</span>
                          <span>
                            {data.analystData.targetPriceLow && data.analystData.targetPriceHigh 
                              ? `$${data.analystData.targetPriceLow.toFixed(0)} - $${data.analystData.targetPriceHigh.toFixed(0)}`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="ta-detail-row">
                          <span>Analysts</span>
                          <span>{data.analystData.numberOfAnalysts}</span>
                        </div>
                        {data.analystData.upside !== null && (
                          <div className="ta-detail-row highlight">
                            <span>Upside</span>
                            <span className={data.analystData.upside >= 0 ? 'positive' : 'negative'}>
                              {data.analystData.upside >= 0 ? '+' : ''}{data.analystData.upside.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Recommendations */}
            {report && (report.keyTakeaways?.length > 0 || report.actionItems?.length > 0 || report.riskWarnings?.length > 0) && (
              <div className="ta-section">
                <div className="ta-section-header">
                  <Target size={18} />
                  <h3>Key Takeaways & Recommendations</h3>
                </div>
                
                {report.keyTakeaways && report.keyTakeaways.length > 0 && (
                  <div className="ta-subsection">
                    <h4>Key Takeaways</h4>
                    <ul className="ta-list">
                      {report.keyTakeaways.map((item, idx) => (
                        <li key={idx}>
                          <CheckCircle size={14} className="icon-success" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.actionItems && report.actionItems.length > 0 && (
                  <div className="ta-subsection">
                    <h4>Recommended Actions</h4>
                    <div className="ta-actions">
                      {report.actionItems.map((item, idx) => (
                        <div key={idx} className={`ta-action priority-${item.priority}`}>
                          <span className="ta-action-priority">{item.priority}</span>
                          <div className="ta-action-content">
                            <span className="ta-action-text">{item.action}</span>
                            {item.timeline && (
                              <span className="ta-action-timeline"><Clock size={12} /> {item.timeline}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.riskWarnings && report.riskWarnings.length > 0 && (
                  <div className="ta-subsection">
                    <h4><AlertTriangle size={14} /> Risk Warnings</h4>
                    <ul className="ta-list warnings">
                      {report.riskWarnings.map((item, idx) => (
                        <li key={idx}>
                          <AlertTriangle size={14} className="icon-warning" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {report && (
              <div className="ta-footer">
                <span><Clock size={12} /> {new Date(report.generatedAt).toLocaleString()}</span>
                <span>Confidence: {report.metadata.confidence}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
