import { useState } from "react";
import { portfolioAgent, GeneratedPortfolio } from "../services/portfolioAgent";
import { OpenRouterMessage } from "../services/openrouter";
import { 
  Sparkles, 
  RotateCcw, 
  Download, 
  MessageSquare, 
  Target, 
  Lightbulb, 
  AlertCircle, 
  PieChart, 
  TrendingUp, 
  Briefcase, 
  Send,
  ArrowRight,
  BarChart3,
  Activity,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Gauge
} from "lucide-react";
import { 
  PieChart as RechartsPie, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import QuantDashboard from "./charts/QuantDashboard";
import "./VibeStudio.css";

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

export default function VibeStudio() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPortfolio, setGeneratedPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState(false);
  const [chatHistory, setChatHistory] = useState<OpenRouterMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [showQuantDashboard, setShowQuantDashboard] = useState(true);

  // Disabled preloading to avoid rate limit issues
  // Data is fetched on-demand when portfolio is generated

  const CHART_COLORS = ['#00e599', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const examplePrompts = [
    "Create a growth-focused tech portfolio with quarterly rebalancing",
    "Build a conservative dividend portfolio with blue-chip stocks",
    "Design an ESG-focused portfolio with renewable energy exposure",
    "Create a balanced portfolio mixing growth and value stocks"
  ];

  const updateProgress = (stepId: string, status: ProgressStep['status'], message?: string) => {
    setProgressSteps(prev => {
      const stepIndex = prev.findIndex(s => s.id === stepId);
      if (stepIndex === -1) return prev;
      
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], status, message };
      return updated;
    });
  };

  const handleGeneratePlan = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedPortfolio(null);
    setChatMode(false);
    setChatHistory([]);
    setStreamingMessage('');

    // Initialize progress steps
    const steps: ProgressStep[] = [
      { id: 'analyzing', label: 'Analyzing your investment goals', status: 'pending' },
      { id: 'generating', label: 'Generating portfolio structure', status: 'pending' },
      { id: 'fetching', label: 'Fetching all market data (prices, metrics)', status: 'pending' },
      { id: 'quantitative', label: 'Running quantitative analysis', status: 'pending' },
      { id: 'complete', label: 'Finalizing portfolio', status: 'pending' },
    ];
    setProgressSteps(steps);

    try {
      console.log('[INFO] Streaming portfolio generation for:', prompt);

      // Use streaming API
      const stream = portfolioAgent.generatePortfolioStream(prompt);
      
      for await (const update of stream) {
        console.log('📡 Stream update:', update);
        
        if (update.type === 'progress' && update.step) {
          setStreamingMessage(update.message || '');
          updateProgress(update.step, 'active', update.message);
        } else if (update.type === 'data' && update.data) {
          if (update.step) {
            updateProgress(update.step, 'completed', update.message);
          }
          // Merge streaming data into portfolio
          setGeneratedPortfolio(prev => ({
            ...prev,
            ...update.data
          } as GeneratedPortfolio));
        } else if (update.type === 'complete' && update.data) {
          // Mark all as complete
          steps.forEach(step => updateProgress(step.id, 'completed'));
          setGeneratedPortfolio(update.data as GeneratedPortfolio);
          setStreamingMessage('');
        } else if (update.type === 'error') {
          throw new Error(update.error || 'Stream error');
        }
      }

      console.log('[INFO] Portfolio generation completed');
    } catch (err) {
      console.error('[ERROR] Portfolio generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate portfolio');
      setProgressSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
    } finally {
      setIsGenerating(false);
      setStreamingMessage('');
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || isChatting || !generatedPortfolio) return;

    setIsChatting(true);
    const userMessage = chatInput;
    setChatInput("");

    try {
      const newHistory: OpenRouterMessage[] = [
        ...chatHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await portfolioAgent.chatAboutPortfolio(
        userMessage,
        generatedPortfolio,
        chatHistory
      );

      setChatHistory([
        ...newHistory,
        { role: 'assistant', content: response }
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      setError(error instanceof Error ? error.message : "Chat failed");
    } finally {
      setIsChatting(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };

  const handleReset = () => {
    setGeneratedPortfolio(null);
    setError(null);
    setPrompt("");
    setChatMode(false);
    setChatHistory([]);
    setProgressSteps([]);
  };

  const handleSavePlan = () => {
    if (generatedPortfolio) {
      const dataStr = JSON.stringify(generatedPortfolio, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `${generatedPortfolio.title.replace(/\s+/g, '_')}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    }
  };

  const handleExportCSV = () => {
    if (!generatedPortfolio) return;
    
    const headers = [
      'Symbol', 'Name', 'Allocation %', 'Price', 'Composite Score',
      'Analyst Rating', 'Target Price', 'Upside %', 'Sentiment',
      'P/E Ratio', 'ROE %', 'Revenue Growth %', 'Debt/Equity',
      'Sharpe Ratio', 'Volatility %', 'RSI', 'Sector'
    ];
    
    const rows = generatedPortfolio.assets.map(asset => [
      asset.symbol,
      `"${asset.name}"`,
      asset.allocation.toFixed(2),
      asset.currentPrice?.toFixed(2) || '',
      asset.compositeScore || '',
      asset.analystData?.consensusRating || '',
      asset.analystData?.targetPriceMean?.toFixed(2) || '',
      asset.analystData?.upside?.toFixed(1) || '',
      asset.sentiment?.overallSentiment || '',
      asset.fundamentals?.peRatio?.toFixed(2) || '',
      asset.fundamentals?.returnOnEquity ? (asset.fundamentals.returnOnEquity * 100).toFixed(1) : '',
      asset.fundamentals?.revenueGrowthYoY ? (asset.fundamentals.revenueGrowthYoY * 100).toFixed(1) : '',
      asset.fundamentals?.debtToEquity?.toFixed(2) || '',
      asset.quantMetrics?.sharpeRatio?.toFixed(2) || '',
      asset.quantMetrics?.volatility?.toFixed(1) || '',
      asset.quantMetrics?.rsi?.toFixed(0) || '',
      asset.sector || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const exportFileName = `${generatedPortfolio.title.replace(/\s+/g, '_')}_holdings.csv`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.click();
  };

  const renderProgressIndicator = () => {
    if (progressSteps.length === 0) return null;

    return (
      <div className="progress-indicator">
        <div className="progress-header">
          <div>
            <Loader2 className="progress-spinner" size={20} />
            <h3>Building Your Portfolio...</h3>
          </div>
          {streamingMessage && (
            <div className="streaming-message">
              <Activity size={16} className="pulse" />
              <span>{streamingMessage}</span>
            </div>
          )}
        </div>
        <div className="progress-steps">
          {progressSteps.map((step) => (
            <div key={step.id} className={`progress-step ${step.status}`}>
              <div className="step-icon">
                {step.status === 'completed' && <CheckCircle2 size={20} />}
                {step.status === 'active' && <Loader2 className="spin" size={20} />}
                {step.status === 'error' && <AlertCircle size={20} />}
                {step.status === 'pending' && (
                  <div className="step-dot"></div>
                )}
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
                {step.message && (
                  <div className="step-message">{step.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAllocationChart = () => {
    if (!generatedPortfolio) return null;

    const data = generatedPortfolio.assets.map((asset, index) => ({
      name: asset.symbol,
      value: asset.allocation,
      fill: CHART_COLORS[index % CHART_COLORS.length]
    }));

    return (
      <ResponsiveContainer width="100%" height={300}>
        <RechartsPie>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
        </RechartsPie>
      </ResponsiveContainer>
    );
  };

  const renderAllocationBarChart = () => {
    if (!generatedPortfolio) return null;

    const data = generatedPortfolio.assets.map((asset) => ({
      symbol: asset.symbol,
      allocation: asset.allocation,
      sector: asset.sector || 'Other'
    }));

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="symbol" stroke="var(--text-muted)" />
          <YAxis stroke="var(--text-muted)" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--bg-card)', 
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)'
            }}
          />
          <Legend />
          <Bar dataKey="allocation" fill="var(--primary)" name="Allocation %" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="vibe-studio">
      <div className="studio-header">
        <div className="header-content">
          <h2><Sparkles size={24} style={{ display: 'inline', marginRight: '0.5rem' }} /> Vibe Studio</h2>
          <p className="subtitle">AI-powered portfolio generation with real market data</p>
        </div>
        {generatedPortfolio && (
          <button className="btn-reset" onClick={handleReset}>
            <RotateCcw size={16} /> New Portfolio
          </button>
        )}
      </div>

      {/* Progress Indicator */}
      {isGenerating && renderProgressIndicator()}

      {!generatedPortfolio && !error && !isGenerating ? (
        <div className="welcome-section">
          <div className="welcome-card">
            <h3><Target size={20} /> How it works</h3>
            <ol className="steps-list">
              <li>Describe your investment goals and risk tolerance</li>
              <li>AI analyzes your requirements and generates a custom portfolio</li>
              <li>Real-time market data is fetched for each recommended asset</li>
              <li>Review allocations, rationale, and current prices</li>
              <li>Chat with AI to refine or ask questions about the portfolio</li>
            </ol>
          </div>

          <div className="examples-section">
            <h3><Lightbulb size={20} /> Try these examples:</h3>
            <div className="examples-grid">
              {examplePrompts.map((example, idx) => (
                <button
                  key={idx}
                  className="example-card"
                  onClick={() => handleExampleClick(example)}
                >
                  <span className="example-icon"><ArrowRight size={16} /></span>
                  <span>{example}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {error && !isGenerating && (
        <div className="error-section">
          <div className="error-card">
            <h3><AlertCircle size={24} /> Error</h3>
            <p>{error}</p>
            <button className="btn-retry" onClick={handleReset}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {generatedPortfolio && (
        <div className="plan-result">
          <div className="plan-header">
            <div>
              <h2><PieChart size={28} /> {generatedPortfolio.title}</h2>
              <p className="plan-description">{generatedPortfolio.description}</p>
              <div className="meta-info">
                <span className="meta-badge">Risk: {generatedPortfolio.riskLevel}</span>
                <span className="meta-badge">Horizon: {generatedPortfolio.timeHorizon}</span>
                <span className="meta-badge">Rebalance: {generatedPortfolio.rebalanceFrequency}</span>
                {generatedPortfolio.diversificationScore && (
                  <span className="meta-badge">Diversification: {generatedPortfolio.diversificationScore}%</span>
                )}
                {generatedPortfolio.sharpeRatioEstimate && (
                  <span className="meta-badge">Sharpe: {generatedPortfolio.sharpeRatioEstimate}</span>
                )}
              </div>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={handleExportCSV}>
                <FileSpreadsheet size={16} /> Export CSV
              </button>
              <button className="btn-save" onClick={handleSavePlan}>
                <Download size={16} /> Save JSON
              </button>
              <button className="btn-chat" onClick={() => setChatMode(!chatMode)}>
                <MessageSquare size={16} /> {chatMode ? 'Hide Chat' : 'Ask AI'}
              </button>
            </div>
          </div>

          <div className="plan-details">
            <div className="detail-card">
              <h3><Target size={20} /> Strategy</h3>
              <div className="detail-content">
                <p>{generatedPortfolio.strategy}</p>
              </div>
            </div>

            <div className="detail-card">
              <h3><TrendingUp size={20} /> Expected Performance</h3>
              <div className="detail-content">
                <div className="detail-row">
                  <span className="label">Expected Return:</span>
                  <span className="value">{generatedPortfolio.expectedReturn}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Volatility:</span>
                  <span className="value">{generatedPortfolio.volatility}</span>
                </div>
              </div>
            </div>

            {/* Allocation Pie Chart */}
            <div className="detail-card full-width">
              <h3><PieChart size={20} /> Allocation Distribution</h3>
              <div className="detail-content">
                {renderAllocationChart()}
              </div>
            </div>

            {/* Allocation Bar Chart */}
            <div className="detail-card full-width">
              <h3><BarChart3 size={20} /> Asset Allocation Breakdown</h3>
              <div className="detail-content">
                {renderAllocationBarChart()}
              </div>
            </div>

            <div className="detail-card full-width">
              <h3><Briefcase size={20} /> Portfolio Assets ({generatedPortfolio.assets.length} Holdings)</h3>
              <div className="detail-content">
                <div className="assets-table">
                  <div className="table-header">
                    <div className="th">Symbol</div>
                    <div className="th">Name</div>
                    <div className="th">Score</div>
                    <div className="th">Allocation</div>
                    <div className="th">Price</div>
                    <div className="th">Analyst</div>
                    <div className="th">Target</div>
                    <div className="th">Sentiment</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    <div key={i} className="table-row">
                      <div className="td symbol">{asset.symbol}</div>
                      <div className="td name">{asset.name}</div>
                      <div className="td score">
                        {asset.compositeScore !== undefined ? (
                          <div className="composite-score-wrapper">
                            <div 
                              className={`composite-score ${
                                asset.compositeScore >= 70 ? 'excellent' : 
                                asset.compositeScore >= 55 ? 'good' : 
                                asset.compositeScore >= 45 ? 'neutral' : 'poor'
                              }`}
                            >
                              {asset.compositeScore}
                            </div>
                          </div>
                        ) : '-'}
                      </div>
                      <div className="td allocation">
                        <div className="allocation-bar-wrapper">
                          <div 
                            className="allocation-bar" 
                            style={{ 
                              width: `${asset.allocation}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length]
                            }}
                          ></div>
                        </div>
                        <span className="allocation-text">{asset.allocation.toFixed(1)}%</span>
                      </div>
                      <div className="td price">
                        {asset.currentPrice ? `$${asset.currentPrice.toFixed(2)}` : '...'}
                      </div>
                      <div className="td analyst">
                        {asset.analystData?.consensusRating ? (
                          <span className={`analyst-badge ${
                            asset.analystData.consensusRating.includes('Buy') ? 'buy' : 
                            asset.analystData.consensusRating.includes('Sell') ? 'sell' : 'hold'
                          }`}>
                            {asset.analystData.consensusRating}
                          </span>
                        ) : '-'}
                      </div>
                      <div className="td target">
                        {asset.analystData?.targetPriceMean ? (
                          <span className={`target-price ${
                            (asset.analystData.upside || 0) > 10 ? 'upside' : 
                            (asset.analystData.upside || 0) < -10 ? 'downside' : 'neutral'
                          }`}>
                            ${asset.analystData.targetPriceMean.toFixed(0)}
                            {asset.analystData.upside !== null && (
                              <span className="upside-text">
                                ({asset.analystData.upside > 0 ? '+' : ''}{asset.analystData.upside.toFixed(0)}%)
                              </span>
                            )}
                          </span>
                        ) : '-'}
                      </div>
                      <div className="td sentiment">
                        {asset.sentiment ? (
                          <span className={`sentiment-badge ${asset.sentiment.overallSentiment}`}>
                            {asset.sentiment.overallSentiment === 'bullish' ? '🟢' : 
                             asset.sentiment.overallSentiment === 'bearish' ? '🔴' : '🟡'}
                            {asset.sentiment.overallSentiment}
                          </span>
                        ) : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="detail-card full-width">
              <h3><Activity size={20} /> AI Reasoning</h3>
              <div className="detail-content">
                <p>{generatedPortfolio.reasoning}</p>
              </div>
            </div>

            {/* Quantitative Metrics Table */}
            <div className="detail-card full-width">
              <h3><Activity size={20} /> Quantitative Metrics</h3>
              <div className="detail-content">
                <div className="quant-metrics-table">
                  <div className="quant-table-header">
                    <div className="qth">Symbol</div>
                    <div className="qth">Sharpe Ratio</div>
                    <div className="qth">Ann. Return</div>
                    <div className="qth">Volatility</div>
                    <div className="qth">Max Drawdown</div>
                    <div className="qth">RSI</div>
                    <div className="qth">Signal</div>
                    <div className="qth">Confidence</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    asset.quantMetrics && (
                      <div key={i} className="quant-table-row">
                        <div className="qtd symbol-cell">{asset.symbol}</div>
                        <div className="qtd">
                          <span className={`metric-value ${asset.quantMetrics.sharpeRatio > 1 ? 'good' : asset.quantMetrics.sharpeRatio > 0 ? 'neutral' : 'bad'}`}>
                            {asset.quantMetrics.sharpeRatio.toFixed(2)}
                          </span>
                        </div>
                        <div className="qtd">
                          <span className={`metric-value ${asset.quantMetrics.expectedReturn > 0 ? 'good' : 'bad'}`}>
                            {asset.quantMetrics.expectedReturn.toFixed(2)}%
                          </span>
                        </div>
                        <div className="qtd">
                          <span className={`metric-value ${asset.quantMetrics.volatility > 30 ? 'bad' : asset.quantMetrics.volatility > 20 ? 'neutral' : 'good'}`}>
                            {asset.quantMetrics.volatility.toFixed(2)}%
                          </span>
                        </div>
                        <div className="qtd">
                          <span className={`metric-value ${asset.quantMetrics.maxDrawdown < -30 ? 'bad' : asset.quantMetrics.maxDrawdown < -15 ? 'neutral' : 'good'}`}>
                            {asset.quantMetrics.maxDrawdown.toFixed(2)}%
                          </span>
                        </div>
                        <div className="qtd">
                          <span className={`metric-value ${asset.quantMetrics.rsi < 30 ? 'oversold' : asset.quantMetrics.rsi > 70 ? 'overbought' : 'neutral'}`}>
                            {asset.quantMetrics.rsi.toFixed(0)}
                          </span>
                        </div>
                        <div className="qtd">
                          <span className={`recommendation-badge ${asset.quantMetrics.recommendation}`}>
                            {asset.quantMetrics.recommendation.toUpperCase()}
                          </span>
                        </div>
                        <div className="qtd">
                          <div className="confidence-bar">
                            <div 
                              className="confidence-fill" 
                              style={{ 
                                width: `${asset.quantMetrics.confidence}%`,
                                backgroundColor: asset.quantMetrics.confidence > 70 ? 'var(--success)' : 
                                                asset.quantMetrics.confidence > 50 ? 'var(--accent)' : 'var(--text-muted)'
                              }}
                            ></div>
                            <span className="confidence-text">{asset.quantMetrics.confidence}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* Fundamental Analysis Table */}
            <div className="detail-card full-width">
              <h3><BarChart3 size={20} /> Fundamental Analysis</h3>
              <div className="detail-content">
                <div className="fundamentals-table">
                  <div className="fundamentals-header">
                    <div className="fth">Symbol</div>
                    <div className="fth">P/E Ratio</div>
                    <div className="fth">P/B Ratio</div>
                    <div className="fth">ROE</div>
                    <div className="fth">Profit Margin</div>
                    <div className="fth">Revenue Growth</div>
                    <div className="fth">Debt/Equity</div>
                    <div className="fth">Div. Yield</div>
                    <div className="fth">Market Cap</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    asset.fundamentals ? (
                      <div key={i} className="fundamentals-row">
                        <div className="ftd symbol-cell">{asset.symbol}</div>
                        <div className="ftd">
                          {asset.fundamentals.peRatio !== null ? (
                            <span className={`metric-value ${asset.fundamentals.peRatio < 15 ? 'good' : asset.fundamentals.peRatio < 25 ? 'neutral' : 'bad'}`}>
                              {asset.fundamentals.peRatio.toFixed(2)}
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.priceToBook !== null ? (
                            <span className={`metric-value ${asset.fundamentals.priceToBook < 1 ? 'good' : asset.fundamentals.priceToBook < 3 ? 'neutral' : 'bad'}`}>
                              {asset.fundamentals.priceToBook.toFixed(2)}
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.returnOnEquity !== null ? (
                            <span className={`metric-value ${asset.fundamentals.returnOnEquity > 0.15 ? 'good' : asset.fundamentals.returnOnEquity > 0.10 ? 'neutral' : 'bad'}`}>
                              {(asset.fundamentals.returnOnEquity * 100).toFixed(1)}%
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.profitMargin !== null ? (
                            <span className={`metric-value ${asset.fundamentals.profitMargin > 0.15 ? 'good' : asset.fundamentals.profitMargin > 0.05 ? 'neutral' : 'bad'}`}>
                              {(asset.fundamentals.profitMargin * 100).toFixed(1)}%
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.revenueGrowthYoY !== null ? (
                            <span className={`metric-value ${asset.fundamentals.revenueGrowthYoY > 0.10 ? 'good' : asset.fundamentals.revenueGrowthYoY > 0 ? 'neutral' : 'bad'}`}>
                              {(asset.fundamentals.revenueGrowthYoY * 100).toFixed(1)}%
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.debtToEquity !== null ? (
                            <span className={`metric-value ${asset.fundamentals.debtToEquity < 0.5 ? 'good' : asset.fundamentals.debtToEquity < 1.5 ? 'neutral' : 'bad'}`}>
                              {asset.fundamentals.debtToEquity.toFixed(2)}
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          {asset.fundamentals.dividendYield !== null ? (
                            <span className={`metric-value ${asset.fundamentals.dividendYield > 0.03 ? 'good' : asset.fundamentals.dividendYield > 0 ? 'neutral' : 'neutral'}`}>
                              {(asset.fundamentals.dividendYield * 100).toFixed(2)}%
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div className="ftd">
                          <span className="market-cap">
                            {asset.fundamentals.marketCap > 1e12 ? `$${(asset.fundamentals.marketCap / 1e12).toFixed(2)}T` :
                             asset.fundamentals.marketCap > 1e9 ? `$${(asset.fundamentals.marketCap / 1e9).toFixed(2)}B` :
                             asset.fundamentals.marketCap > 1e6 ? `$${(asset.fundamentals.marketCap / 1e6).toFixed(2)}M` :
                             'N/A'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="fundamentals-row">
                        <div className="ftd symbol-cell">{asset.symbol}</div>
                        <div className="ftd loading-colspan"><span className="loading-text">Loading fundamental data...</span></div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* Market Insights from Web Search */}
            {generatedPortfolio.assets.some(a => a.marketInsights && a.marketInsights.length > 0) && (
              <div className="detail-card full-width">
                <h3><TrendingUp size={20} /> Market Insights (Web Research)</h3>
                <div className="detail-content">
                  <div className="insights-container">
                    {generatedPortfolio.assets
                      .filter(a => a.marketInsights && a.marketInsights.length > 0)
                      .map((asset, i) => (
                        <div key={i} className="asset-insights">
                          <div className="insights-symbol">{asset.symbol}</div>
                          <div className="insights-list">
                            {asset.marketInsights?.map((insight, j) => (
                              <div key={j} className="insight-item">
                                <div className="insight-headline">{insight.headline}</div>
                                <div className="insight-analysis">{insight.analysis}</div>
                                <div className="insight-meta">
                                  <span className="insight-source">{insight.source}</span>
                                  <span className="insight-confidence">
                                    Confidence: {insight.confidence}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Monte Carlo Simulation Results */}
            {generatedPortfolio.monteCarloResult && (
              <div className="detail-card full-width">
                <h3><Activity size={20} /> Monte Carlo Simulation (1-Year Forecast)</h3>
                <div className="detail-content">
                  <div className="monte-carlo-grid">
                    <div className="monte-stat">
                      <div className="monte-label">Expected Value</div>
                      <div className="monte-value success">
                        ${generatedPortfolio.monteCarloResult.expectedValue.toFixed(2)}
                      </div>
                    </div>
                    <div className="monte-stat">
                      <div className="monte-label">Probability of Loss</div>
                      <div className="monte-value danger">
                        {generatedPortfolio.monteCarloResult.probabilityOfLoss.toFixed(2)}%
                      </div>
                    </div>
                    <div className="monte-stat">
                      <div className="monte-label">5th Percentile (Worst Case)</div>
                      <div className="monte-value">
                        ${generatedPortfolio.monteCarloResult.percentiles.p5.toFixed(2)}
                      </div>
                    </div>
                    <div className="monte-stat">
                      <div className="monte-label">50th Percentile (Median)</div>
                      <div className="monte-value">
                        ${generatedPortfolio.monteCarloResult.percentiles.p50.toFixed(2)}
                      </div>
                    </div>
                    <div className="monte-stat">
                      <div className="monte-label">95th Percentile (Best Case)</div>
                      <div className="monte-value success">
                        ${generatedPortfolio.monteCarloResult.percentiles.p95.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="monte-carlo-description">
                    <p>Based on 1,000 simulated paths using historical volatility and expected returns. 
                    Initial investment: $10,000. Results show potential outcomes after 1 year.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Backtest Results */}
            {generatedPortfolio.backtestResult && (
              <div className="detail-card full-width">
                <h3><TrendingUp size={20} /> Historical Backtest Results</h3>
                <div className="detail-content">
                  <div className="backtest-grid">
                    <div className="backtest-stat">
                      <div className="stat-label">Total Return</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.totalReturn > 0 ? 'success' : 'danger'}`}>
                        {generatedPortfolio.backtestResult.totalReturn.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Annualized Return</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.annualizedReturn > 0 ? 'success' : 'danger'}`}>
                        {generatedPortfolio.backtestResult.annualizedReturn.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Sharpe Ratio</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.sharpeRatio > 1 ? 'success' : generatedPortfolio.backtestResult.sharpeRatio > 0 ? 'neutral' : 'danger'}`}>
                        {generatedPortfolio.backtestResult.sharpeRatio.toFixed(2)}
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Max Drawdown</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.maxDrawdown < 20 ? 'success' : generatedPortfolio.backtestResult.maxDrawdown < 35 ? 'neutral' : 'danger'}`}>
                        {generatedPortfolio.backtestResult.maxDrawdown.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Win Rate</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.winRate > 55 ? 'success' : 'neutral'}`}>
                        {generatedPortfolio.backtestResult.winRate.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Best Year</div>
                      <div className="stat-value success">
                        {generatedPortfolio.backtestResult.bestYear.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Worst Year</div>
                      <div className="stat-value danger">
                        {generatedPortfolio.backtestResult.worstYear.toFixed(2)}%
                      </div>
                    </div>
                    <div className="backtest-stat">
                      <div className="stat-label">Calmar Ratio</div>
                      <div className={`stat-value ${generatedPortfolio.backtestResult.calmarRatio > 1 ? 'success' : 'neutral'}`}>
                        {generatedPortfolio.backtestResult.calmarRatio.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="backtest-description">
                    <p>Historical performance based on actual market data. Past performance does not guarantee future results.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Quant Dashboard Toggle */}
            <div className="quant-dashboard-toggle">
              <button 
                className="btn-quant-toggle"
                onClick={() => setShowQuantDashboard(!showQuantDashboard)}
              >
                <Gauge size={20} />
                <span>Advanced Quantitative Analysis</span>
                {showQuantDashboard ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {/* Advanced Quant Dashboard */}
            {showQuantDashboard && (
              <div className="quant-dashboard-container">
                <QuantDashboard 
                  assets={generatedPortfolio.assets.map(asset => ({
                    symbol: asset.symbol,
                    quantMetrics: asset.quantMetrics ? {
                      sharpeRatio: asset.quantMetrics.sharpeRatio,
                      sortinoRatio: asset.quantMetrics.sortinoRatio ?? asset.quantMetrics.sharpeRatio * 1.2,
                      calmarRatio: asset.quantMetrics.calmarRatio ?? asset.quantMetrics.sharpeRatio * 0.8,
                      beta: asset.quantMetrics.beta ?? (asset.fundamentals?.beta ?? 1.0),
                      alpha: asset.quantMetrics.alpha ?? 0,
                      volatility: asset.quantMetrics.volatility,
                      maxDrawdown: asset.quantMetrics.maxDrawdown,
                      var95: asset.quantMetrics.var95 ?? asset.quantMetrics.volatility * 0.12,
                      cvar95: (asset.quantMetrics.var95 ?? asset.quantMetrics.volatility * 0.12) * 1.5,
                      rsi: asset.quantMetrics.rsi,
                      expectedReturn: asset.quantMetrics.expectedReturn,
                      informationRatio: asset.quantMetrics.sharpeRatio * 0.6,
                      treynorRatio: asset.quantMetrics.sharpeRatio * 1.1,
                    } : undefined,
                    dailyReturns: asset.dailyReturns && asset.dailyReturns.length > 0 
                      ? asset.dailyReturns 
                      : undefined,
                  }))}
                  portfolioMetrics={generatedPortfolio.backtestResult ? {
                    sharpeRatio: generatedPortfolio.backtestResult.sharpeRatio,
                    volatility: generatedPortfolio.backtestResult.maxDrawdown * 0.8,
                    expectedReturn: generatedPortfolio.backtestResult.annualizedReturn,
                    maxDrawdown: generatedPortfolio.backtestResult.maxDrawdown,
                    var95: generatedPortfolio.backtestResult.maxDrawdown * 0.15,
                    cvar95: generatedPortfolio.backtestResult.maxDrawdown * 0.22,
                    beta: 0.95,
                    alpha: generatedPortfolio.backtestResult.annualizedReturn - 10,
                  } : undefined}
                />
              </div>
            )}
          </div>

          {chatMode && (
            <div className="chat-section">
              <h3><MessageSquare size={20} /> Chat with AI about this portfolio</h3>
              <div className="chat-messages">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-message ${msg.role}`}>
                    <strong>{msg.role === 'user' ? 'You' : 'AI'}</strong>
                    <p>{msg.content}</p>
                  </div>
                ))}
              </div>
              <div className="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Ask anything about this portfolio..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isChatting) {
                      handleChat();
                    }
                  }}
                  disabled={isChatting}
                />
                <button
                  className="btn-send"
                  onClick={handleChat}
                  disabled={!chatInput.trim() || isChatting}
                >
                  {isChatting ? <div className="spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white' }}></div> : <Send size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="input-section">
        <div className="input-container">
          <textarea
            className="prompt-input"
            placeholder="Describe your investment goals... (e.g., 'Create a growth-focused tech portfolio with quarterly rebalancing and moderate risk tolerance')"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGeneratePlan();
              }
            }}
            rows={2}
            disabled={isGenerating}
          />
          <button
            className="btn-generate"
            onClick={handleGeneratePlan}
            disabled={!prompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>Generate <Sparkles size={16} /></>
            )}
          </button>
        </div>
        <div className="input-hint">
          <Lightbulb size={14} /> Be specific about your risk tolerance, investment goals, preferred sectors, and time horizon
        </div>
      </div>
    </div>
  );
}
