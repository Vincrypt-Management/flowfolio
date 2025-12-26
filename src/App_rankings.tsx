import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface VibePlan {
  name: string;
  universe: {
    exchanges: string[];
    regions: string[];
    sectors: string[];
    exclude_list: string[];
  };
  filters: any[];
  ranking: {
    factors: Array<{ name: string; weight: number }>;
  };
  portfolio: any;
  cadence: any;
  risk: any;
}

interface SymbolScore {
  symbol: string;
  total_score: number;
  factors: Array<{
    name: string;
    raw_value: number | null;
    normalized_value: number;
    weight: number;
    contribution: number;
  }>;
  explanation: string;
}

function App() {
  const [status, setStatus] = useState("Initializing...");
  const [plan, setPlan] = useState<VibePlan | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Rankings state
  const [rankingsSymbols, setRankingsSymbols] = useState<string>("AAPL,MSFT,GOOGL,AMZN,META");
  const [scores, setScores] = useState<SymbolScore[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [selectedScore, setSelectedScore] = useState<SymbolScore | null>(null);

  useEffect(() => {
    checkHealth();
    loadDefaultPlan();
  }, []);

  async function checkHealth() {
    try {
      const health = await invoke<string>("health_check");
      setStatus(health);
    } catch (error) {
      setStatus("Error: " + error);
    }
  }

  async function loadDefaultPlan() {
    try {
      const defaultPlan = await invoke<VibePlan>("get_default_plan");
      setPlan(defaultPlan);
    } catch (error) {
      console.error("Failed to load default plan:", error);
    }
  }

  async function scoreSymbols() {
    if (!plan) {
      alert("Please select a plan first");
      return;
    }

    setIsScoring(true);
    setScores([]);
    
    try {
      const symbolsList = rankingsSymbols.split(",").map(s => s.trim()).filter(s => s);
      
      // Get scoring config from plan
      const config = await invoke<any>("get_scoring_config", { plan });
      
      // Score symbols
      const results = await invoke<SymbolScore[]>("score_symbols_batch", { 
        symbols: symbolsList, 
        config 
      });
      
      setScores(results);
    } catch (error) {
      alert("Error scoring symbols: " + error);
    } finally {
      setIsScoring(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>📊 FlowFolio</h1>
        <p className="tagline">Vibe-investing, compose your plan locally</p>
        <div className="status">{status}</div>
      </header>

      <nav className="nav-tabs">
        <button
          className={activeTab === "dashboard" ? "active" : ""}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={activeTab === "vibe-studio" ? "active" : ""}
          onClick={() => setActiveTab("vibe-studio")}
        >
          Vibe Studio
        </button>
        <button
          className={activeTab === "templates" ? "active" : ""}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
        <button
          className={activeTab === "rankings" ? "active" : ""}
          onClick={() => setActiveTab("rankings")}
        >
          Rankings
        </button>
        <button
          className={activeTab === "data" ? "active" : ""}
          onClick={() => setActiveTab("data")}
        >
          Data Sources
        </button>
      </nav>

      <main className="main-content">
        {activeTab === "dashboard" && (
          <div className="dashboard">
            {/* Dashboard content - same as before */}
            <h2>Dashboard</h2>
            <div className="card">
              <h3>Current Plan: {plan?.name || "No plan loaded"}</h3>
              {plan && (
                <div className="plan-summary">
                  <p><strong>Universe:</strong></p>
                  <ul>
                    <li>Exchanges: {plan.universe.exchanges.join(", ")}</li>
                    <li>Regions: {plan.universe.regions.join(", ")}</li>
                    {plan.universe.sectors.length > 0 && (
                      <li>Sectors: {plan.universe.sectors.join(", ")}</li>
                    )}
                  </ul>
                  
                  {plan.filters.length > 0 && (
                    <>
                      <p><strong>Filters:</strong></p>
                      <ul>
                        {plan.filters.map((filter, i) => (
                          <li key={i}>{filter.name}: {filter.operator} {JSON.stringify(filter.value)}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <p><strong>Ranking Factors:</strong></p>
                  <ul>
                    {plan.ranking.factors.map((factor, i) => (
                      <li key={i}>
                        {factor.name}: {(factor.weight * 100).toFixed(0)}%
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "rankings" && (
          <div className="rankings">
            <h2>Stock Rankings & Scoring</h2>
            
            <div className="card">
              <h3>Score Symbols</h3>
              <p>Current Plan: <strong>{plan?.name || "None"}</strong></p>
              
              <div className="input-group">
                <label>Enter symbol tickers (comma-separated):</label>
                <input
                  type="text"
                  value={rankingsSymbols}
                  onChange={(e) => setRankingsSymbols(e.target.value)}
                  placeholder="e.g., AAPL,MSFT,GOOGL"
                  className="symbol-input"
                />
              </div>
              
              <button 
                className="btn-primary" 
                onClick={scoreSymbols}
                disabled={isScoring || !plan}
              >
                {isScoring ? "Scoring..." : "Score Symbols"}
              </button>
              
              {!plan && <p className="note">Please select a plan from Templates first</p>}
            </div>

            {scores.length > 0 && (
              <div className="card">
                <h3>Results ({scores.length} symbols ranked)</h3>
                <div className="scores-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Symbol</th>
                        <th>Total Score</th>
                        {scores[0].factors.map((f, i) => (
                          <th key={i}>{f.name.toUpperCase()}</th>
                        ))}
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((score, idx) => (
                        <tr key={score.symbol} className={idx < 3 ? "top-rank" : ""}>
                          <td>{idx + 1}</td>
                          <td><strong>{score.symbol}</strong></td>
                          <td className="score-cell">
                            <div className="score-bar">
                              <div 
                                className="score-fill" 
                                style={{width: `${score.total_score}%`}}
                              ></div>
                              <span className="score-text">{score.total_score.toFixed(1)}</span>
                            </div>
                          </td>
                          {score.factors.map((f, i) => (
                            <td key={i} className="factor-cell">
                              {f.normalized_value.toFixed(0)}
                            </td>
                          ))}
                          <td>
                            <button 
                              className="btn-small"
                              onClick={() => setSelectedScore(score)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedScore && (
              <div className="card score-detail">
                <h3>Detailed Analysis: {selectedScore.symbol}</h3>
                <button 
                  className="close-btn"
                  onClick={() => setSelectedScore(null)}
                >
                  ✕
                </button>
                
                <div className="score-explanation">
                  <pre>{selectedScore.explanation}</pre>
                </div>

                <h4>Factor Contributions</h4>
                <div className="factor-breakdown">
                  {selectedScore.factors.map((factor, i) => (
                    <div key={i} className="factor-item">
                      <div className="factor-header">
                        <span className="factor-name">{factor.name.toUpperCase()}</span>
                        <span className="factor-score">{factor.normalized_value.toFixed(1)}/100</span>
                      </div>
                      <div className="factor-bar">
                        <div 
                          className="factor-bar-fill"
                          style={{width: `${factor.normalized_value}%`}}
                        ></div>
                      </div>
                      <div className="factor-meta">
                        Weight: {(factor.weight * 100).toFixed(0)}% • Contributes {factor.contribution.toFixed(1)} points
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Other tabs remain the same - vibe-studio, templates, data */}
        {/* ... (keeping existing code) ... */}
      </main>
    </div>
  );
}

export default App;
