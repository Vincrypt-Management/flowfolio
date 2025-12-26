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
  Activity
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
import "./VibeStudio.css";

export default function VibeStudio() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPortfolio, setGeneratedPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState(false);
  const [chatHistory, setChatHistory] = useState<OpenRouterMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  const CHART_COLORS = ['#00e599', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const examplePrompts = [
    "Create a growth-focused tech portfolio with quarterly rebalancing",
    "Build a conservative dividend portfolio with blue-chip stocks",
    "Design an ESG-focused portfolio with renewable energy exposure",
    "Create a balanced portfolio mixing growth and value stocks"
  ];

  const handleGeneratePlan = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedPortfolio(null);
    setChatMode(false);
    setChatHistory([]);

    try {
      console.log('🚀 Generating portfolio for:', prompt);
      const portfolio = await portfolioAgent.generatePortfolio(prompt);
      console.log('✅ Generated portfolio:', portfolio);
      setGeneratedPortfolio(portfolio);
      setError(null);
    } catch (error) {
      console.error("Portfolio Generation Error:", error);
      setError(error instanceof Error ? error.message : "Failed to generate portfolio");
    } finally {
      setIsGenerating(false);
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

      {!generatedPortfolio && !error ? (
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

      {error && (
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
                    <div className="th">Sector</div>
                    <div className="th">Allocation</div>
                    <div className="th">Current Price</div>
                    <div className="th">Technical</div>
                    <div className="th">Rationale</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    <div key={i} className="table-row">
                      <div className="td symbol">{asset.symbol}</div>
                      <div className="td name">{asset.name}</div>
                      <div className="td sector">{asset.sector || 'N/A'}</div>
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
                        {asset.currentPrice ? `$${asset.currentPrice.toFixed(2)}` : 'Loading...'}
                      </div>
                      <div className="td technical">
                        {asset.technicalSignal ? (
                          <span className={`technical-badge ${asset.technicalSignal.includes('bullish') ? 'bullish' : asset.technicalSignal.includes('bearish') ? 'bearish' : 'neutral'}`}>
                            {asset.technicalSignal}
                          </span>
                        ) : 'N/A'}
                      </div>
                      <div className="td rationale">{asset.rationale}</div>
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
