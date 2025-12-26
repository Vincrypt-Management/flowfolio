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

function App() {
  const [status, setStatus] = useState("Initializing...");
  const [plan, setPlan] = useState<VibePlan | null>(null);
  const [prompt, setPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

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

  async function compilePlan() {
    try {
      const compiledPlan = await invoke<VibePlan>("compile_plan", { prompt });
      setPlan(compiledPlan);
      setPrompt("");
    } catch (error) {
      alert("Error compiling plan: " + error);
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
          className={activeTab === "universe" ? "active" : ""}
          onClick={() => setActiveTab("universe")}
        >
          Universe
        </button>
        <button
          className={activeTab === "rankings" ? "active" : ""}
          onClick={() => setActiveTab("rankings")}
        >
          Rankings
        </button>
      </nav>

      <main className="main-content">
        {activeTab === "dashboard" && (
          <div className="dashboard">
            <h2>Dashboard</h2>
            <div className="card">
              <h3>Current Plan: {plan?.name || "No plan loaded"}</h3>
              {plan && (
                <div className="plan-summary">
                  <p><strong>Exchanges:</strong> {plan.universe.exchanges.join(", ")}</p>
                  <p><strong>Regions:</strong> {plan.universe.regions.join(", ")}</p>
                  <h4>Ranking Factors:</h4>
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
            <div className="card">
              <h3>Next Actions</h3>
              <ul>
                <li>📅 Monthly Buy List - Coming soon</li>
                <li>🔄 Quarterly Rebalance - Coming soon</li>
                <li>📝 Yearly Review - Coming soon</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "vibe-studio" && (
          <div className="vibe-studio">
            <h2>Vibe Studio</h2>
            <div className="card">
              <h3>Create Your Plan</h3>
              <textarea
                className="prompt-input"
                placeholder="Describe your investing strategy in plain English...&#10;&#10;Example: 'I want to invest in quality US tech companies with strong fundamentals, rebalancing quarterly'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
              />
              <button className="btn-primary" onClick={compilePlan}>
                Compile Plan
              </button>
            </div>
            {plan && (
              <div className="card">
                <h3>Compiled Plan</h3>
                <pre className="plan-json">
                  {JSON.stringify(plan, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === "universe" && (
          <div className="universe">
            <h2>Universe & Watchlists</h2>
            <div className="card">
              <p>Symbol browser and data management - Coming soon</p>
            </div>
          </div>
        )}

        {activeTab === "rankings" && (
          <div className="rankings">
            <h2>Rankings & Scoring</h2>
            <div className="card">
              <p>Factor analysis and symbol rankings - Coming soon</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
