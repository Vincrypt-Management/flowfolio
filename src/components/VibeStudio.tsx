import { useState } from "react";
import { portfolioAgent, GeneratedPortfolio } from "../services/portfolioAgent";
import { OpenRouterMessage } from "../services/openrouter";
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

  return (
    <div className="vibe-studio">
      <div className="studio-header">
        <div className="header-content">
          <h2>✨ Vibe Studio - AI Portfolio Generator</h2>
          <p className="subtitle">Describe your investment goals - AI creates a personalized portfolio with real market data</p>
        </div>
        {generatedPortfolio && (
          <button className="btn-reset" onClick={handleReset}>
            ✏️ Create New Portfolio
          </button>
        )}
      </div>

      {!generatedPortfolio && !error ? (
        <div className="welcome-section">
          <div className="welcome-card">
            <h3>🎯 How it works</h3>
            <ol className="steps-list">
              <li>Describe your investment goals and risk tolerance</li>
              <li>AI analyzes your requirements and generates a custom portfolio</li>
              <li>Real-time market data is fetched for each recommended asset</li>
              <li>Review allocations, rationale, and current prices</li>
              <li>Chat with AI to refine or ask questions about the portfolio</li>
            </ol>
          </div>

          <div className="examples-section">
            <h3>💡 Try these examples:</h3>
            <div className="examples-grid">
              {examplePrompts.map((example, idx) => (
                <button
                  key={idx}
                  className="example-card"
                  onClick={() => handleExampleClick(example)}
                >
                  <span className="example-icon">→</span>
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
            <h3>❌ Error</h3>
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
              <h2>📊 {generatedPortfolio.title}</h2>
              <p className="plan-description">{generatedPortfolio.description}</p>
              <div className="meta-info">
                <span className="meta-badge">Risk: {generatedPortfolio.riskLevel}</span>
                <span className="meta-badge">Horizon: {generatedPortfolio.timeHorizon}</span>
                <span className="meta-badge">Rebalance: {generatedPortfolio.rebalanceFrequency}</span>
              </div>
            </div>
            <div className="header-actions">
              <button className="btn-save" onClick={handleSavePlan}>
                💾 Save as JSON
              </button>
              <button className="btn-chat" onClick={() => setChatMode(!chatMode)}>
                💬 {chatMode ? 'Hide' : 'Ask AI'}
              </button>
            </div>
          </div>

          <div className="plan-details">
            <div className="detail-card">
              <h3>🎯 Strategy</h3>
              <div className="detail-content">
                <p>{generatedPortfolio.strategy}</p>
              </div>
            </div>

            <div className="detail-card">
              <h3>📈 Expected Performance</h3>
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

            <div className="detail-card full-width">
              <h3>💼 Portfolio Allocation ({generatedPortfolio.assets.length} Assets)</h3>
              <div className="detail-content">
                <div className="assets-table">
                  <div className="table-header">
                    <div className="th">Symbol</div>
                    <div className="th">Name</div>
                    <div className="th">Sector</div>
                    <div className="th">Allocation</div>
                    <div className="th">Current Price</div>
                    <div className="th">Rationale</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    <div key={i} className="table-row">
                      <div className="td symbol">{asset.symbol}</div>
                      <div className="td name">{asset.name}</div>
                      <div className="td sector">{asset.sector || 'N/A'}</div>
                      <div className="td allocation">
                        <div className="allocation-bar-wrapper">
                          <div className="allocation-bar" style={{ width: `${asset.allocation}%` }}></div>
                          <span className="allocation-text">{asset.allocation.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="td price">
                        {asset.currentPrice ? `$${asset.currentPrice.toFixed(2)}` : 'Loading...'}
                      </div>
                      <div className="td rationale">{asset.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="detail-card full-width">
              <h3>💡 AI Reasoning</h3>
              <div className="detail-content">
                <p>{generatedPortfolio.reasoning}</p>
              </div>
            </div>
          </div>

          {chatMode && (
            <div className="chat-section">
              <h3>💬 Chat with AI about this portfolio</h3>
              <div className="chat-messages">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-message ${msg.role}`}>
                    <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong>
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
                  {isChatting ? '...' : 'Send'}
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
            rows={3}
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
                Generating Portfolio...
              </>
            ) : (
              <>Generate Portfolio ✨</>
            )}
          </button>
        </div>
        <div className="input-hint">
          💡 Be specific about your risk tolerance, investment goals, preferred sectors, and time horizon
        </div>
      </div>
    </div>
  );
}
