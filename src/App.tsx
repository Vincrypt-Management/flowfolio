import { useState, useEffect } from "react";
import { invoke } from "./services/tauri";
import VibeStudio from "./components/VibeStudio";
import { PortfolioTab } from "./PortfolioTab";
import { BacktestTab } from "./BacktestTab";
import { JournalTab } from "./JournalTab";
import { 
  LayoutDashboard, 
  Sparkles, 
  FileText, 
  Database, 
  Activity, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  PieChart,
  Calendar,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FlaskConical,
  BookOpen,
  Globe,
  Download,
  Upload,
  Save,
  Trash2,
  Plus
} from "lucide-react";
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

interface Universe {
  id: string;
  name: string;
  description: string;
  symbols: string[];
  tags: Record<string, string[]>;
  exclude_list: string[];
  created_at: string;
  updated_at: string;
}

function App() {
  const [status, setStatus] = useState("Initializing...");
  const [plan, setPlan] = useState<VibePlan | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Rankings state
  const [rankingsSymbols, setRankingsSymbols] = useState<string>("AAPL,MSFT,GOOGL,AMZN,META");
  const [scores, setScores] = useState<SymbolScore[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [selectedScore, setSelectedScore] = useState<SymbolScore | null>(null);
  
  // Data sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [cachedSymbolsCount, setCachedSymbolsCount] = useState(0);
  
  // Universe state
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverse, setSelectedUniverse] = useState<Universe | null>(null);
  const [newUniverseName, setNewUniverseName] = useState("");
  const [newUniverseSymbols, setNewUniverseSymbols] = useState("");
  
  // Saved plans state
  const [savedPlans, setSavedPlans] = useState<string[]>([]);
  
  // Market overview state
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);

  useEffect(() => {
    checkHealth();
    loadTemplates();
    loadDefaultPlan();
    loadCacheStats();
    loadUniverses();
    loadSavedPlans();
    loadMarketOverview();
  }, []);

  async function checkHealth() {
    try {
      const health = await invoke<string>("health_check");
      setStatus(health);
    } catch (error) {
      setStatus("Error: " + error);
    }
  }

  async function loadTemplates() {
    try {
      const templateList = await invoke<string[]>("list_templates");
      setTemplates(templateList);
    } catch (error) {
      console.error("Failed to load templates:", error);
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

  async function loadCacheStats() {
    try {
      const stats = await invoke<{ memory_prices: number; memory_quant: number }>("get_cache_stats");
      setCachedSymbolsCount(stats.memory_prices + stats.memory_quant);
    } catch (error) {
      console.error("Failed to load cache stats:", error);
    }
  }

  async function loadUniverses() {
    try {
      const universeList = await invoke<Universe[]>("list_universes");
      setUniverses(universeList);
    } catch (error) {
      console.error("Failed to load universes:", error);
    }
  }

  async function loadSavedPlans() {
    try {
      const plans = await invoke<string[]>("list_saved_plans");
      setSavedPlans(plans);
    } catch (error) {
      console.error("Failed to load saved plans:", error);
    }
  }

  async function loadMarketOverview() {
    setIsLoadingMarket(true);
    try {
      const symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"];
      const prices = await invoke<Record<string, number>>("get_current_prices_batch", { symbols });
      setMarketPrices(prices);
    } catch (error) {
      console.error("Failed to load market prices:", error);
    } finally {
      setIsLoadingMarket(false);
    }
  }

  async function createUniverse() {
    if (!newUniverseName.trim()) {
      alert("Please enter a universe name");
      return;
    }
    
    try {
      const symbols = newUniverseSymbols.split(",").map(s => s.trim().toUpperCase()).filter(s => s);
      const universe = await invoke<Universe>("create_universe", {
        name: newUniverseName,
        description: `Universe created on ${new Date().toLocaleDateString()}`,
        symbols
      });
      setUniverses([...universes, universe]);
      setNewUniverseName("");
      setNewUniverseSymbols("");
    } catch (error) {
      alert("Error creating universe: " + error);
    }
  }

  async function deleteUniverse(id: string) {
    try {
      await invoke("delete_universe", { id });
      setUniverses(universes.filter(u => u.id !== id));
      if (selectedUniverse?.id === id) {
        setSelectedUniverse(null);
      }
    } catch (error) {
      alert("Error deleting universe: " + error);
    }
  }

  async function savePlan() {
    if (!plan) {
      alert("No plan to save");
      return;
    }
    
    try {
      await invoke("save_plan", { plan });
      await loadSavedPlans();
      alert("Plan saved successfully!");
    } catch (error) {
      alert("Error saving plan: " + error);
    }
  }

  async function exportData() {
    try {
      const bundleJson = await invoke<string>("export_data_bundle", {
        plan,
        journalEntries: []
      });
      
      // Download as file
      const blob = new Blob([bundleJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowfolio-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Error exporting data: " + error);
    }
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const result = await invoke<{ success: boolean }>("import_data_bundle", { bundleJson: text });
      if (result.success) {
        alert("Data imported successfully!");
        await loadUniverses();
        await loadSavedPlans();
      }
    } catch (error) {
      alert("Error importing data: " + error);
    }
  }

  async function loadTemplate(templateName: string) {
    try {
      const template = await invoke<VibePlan>("get_template", { name: templateName });
      setPlan(template);
      setSelectedTemplate(templateName);
    } catch (error) {
      alert("Error loading template: " + error);
    }
  }

  async function testConnection() {
    setIsTestingConnection(true);
    setConnectionStatus("Testing connection...");
    
    try {
      const result = await invoke<string>("test_data_connection");
      setConnectionStatus("✅ " + result);
    } catch (error) {
      setConnectionStatus("❌ " + error);
    } finally {
      setIsTestingConnection(false);
    }
  }

  async function syncData() {
    setIsSyncing(true);
    try {
      // Prefetch symbols from the current plan or default list
      const symbolsToSync = plan?.universe?.exchanges?.length 
        ? ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "JNJ"]
        : ["AAPL", "MSFT", "GOOGL", "AMZN", "META"];
      
      await invoke("prefetch_symbols", { symbols: symbolsToSync });
      setLastSyncTime(new Date().toISOString());
      await loadCacheStats();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
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
      const config = await invoke<{ factor_weights: Record<string, number> }>("get_scoring_config", { plan });
      
      // Score symbols using quant metrics
      const metrics = await invoke<Array<{
        symbol: string;
        rsi: number;
        macd_signal: string;
        trend: string;
        volatility: number;
        signal: string;
      }>>("get_quant_metrics_batch", { symbols: symbolsList });
      
      // Convert metrics to scores
      const results: SymbolScore[] = metrics.map(m => {
        const factors = [
          {
            name: "momentum",
            raw_value: m.rsi,
            normalized_value: Math.min(100, Math.max(0, 100 - Math.abs(50 - m.rsi) * 2)),
            weight: config.factor_weights["momentum"] || 0.25,
            contribution: 0,
          },
          {
            name: "trend",
            raw_value: m.trend === "bullish" ? 80 : m.trend === "bearish" ? 20 : 50,
            normalized_value: m.trend === "bullish" ? 80 : m.trend === "bearish" ? 20 : 50,
            weight: config.factor_weights["quality"] || 0.25,
            contribution: 0,
          },
          {
            name: "volatility",
            raw_value: m.volatility,
            normalized_value: Math.max(0, 100 - m.volatility * 2),
            weight: config.factor_weights["value"] || 0.25,
            contribution: 0,
          },
        ];
        
        // Calculate contributions
        factors.forEach(f => {
          f.contribution = f.normalized_value * f.weight;
        });
        
        const total_score = factors.reduce((sum, f) => sum + f.contribution, 0);
        
        return {
          symbol: m.symbol,
          total_score,
          factors,
          explanation: `${m.symbol}: RSI=${m.rsi.toFixed(1)}, Trend=${m.trend}, Signal=${m.signal}, Volatility=${m.volatility.toFixed(2)}%`,
        };
      });
      
      // Sort by score descending
      results.sort((a, b) => b.total_score - a.total_score);
      setScores(results);
    } catch (error) {
      alert("Error scoring symbols: " + error);
    } finally {
      setIsScoring(false);
    }
  }

  const renderSidebar = () => (
    <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon-wrapper">
            <BarChart3 className="logo-icon" size={24} />
          </div>
          {!isSidebarCollapsed && <span className="logo-text">FlowFolio</span>}
        </div>
        <button 
          className="sidebar-toggle" 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      
      <nav className="nav-menu">
        <button 
          className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
          title={isSidebarCollapsed ? "Dashboard" : ""}
        >
          <LayoutDashboard className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Dashboard</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "vibe-studio" ? "active" : ""}`}
          onClick={() => setActiveTab("vibe-studio")}
          title={isSidebarCollapsed ? "Vibe Studio" : ""}
        >
          <Sparkles className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Vibe Studio</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
          title={isSidebarCollapsed ? "Templates" : ""}
        >
          <FileText className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Templates</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "rankings" ? "active" : ""}`}
          onClick={() => setActiveTab("rankings")}
          title={isSidebarCollapsed ? "Rankings" : ""}
        >
          <TrendingUp className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Rankings</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "portfolio" ? "active" : ""}`}
          onClick={() => setActiveTab("portfolio")}
          title={isSidebarCollapsed ? "Portfolio" : ""}
        >
          <PieChart className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Portfolio</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "backtest" ? "active" : ""}`}
          onClick={() => setActiveTab("backtest")}
          title={isSidebarCollapsed ? "Backtest" : ""}
        >
          <FlaskConical className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Backtest</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "journal" ? "active" : ""}`}
          onClick={() => setActiveTab("journal")}
          title={isSidebarCollapsed ? "Journal" : ""}
        >
          <BookOpen className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Journal</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "universe" ? "active" : ""}`}
          onClick={() => setActiveTab("universe")}
          title={isSidebarCollapsed ? "Universe" : ""}
        >
          <Globe className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Universe</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
          title={isSidebarCollapsed ? "Data Sources" : ""}
        >
          <Database className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Data Sources</span>}
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className={`status-badge ${isSidebarCollapsed ? "collapsed" : ""}`}>
          <div className={`status-dot ${status.includes("running") || status === "Healthy" ? "online" : "offline"}`}></div>
          {!isSidebarCollapsed && <span>{status.includes("running") || status === "Healthy" ? "System Online" : status}</span>}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-container">
      {renderSidebar()}

      <main className="main-content">
        {activeTab === "dashboard" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <h1 className="page-title">Dashboard</h1>
                  <p className="page-subtitle">Overview of your investment strategy</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn-secondary" onClick={savePlan} disabled={!plan}>
                    <Save size={16} /> Save Plan
                  </button>
                  <button className="btn-secondary" onClick={exportData}>
                    <Download size={16} /> Export
                  </button>
                </div>
              </div>
            </header>

            <div className="dashboard-grid">
              <div className="card">
                <h3><PieChart size={20} /> Current Plan</h3>
                {plan ? (
                  <div className="plan-summary">
                    <div className="stat-row">
                      <span className="stat-label">Name</span>
                      <span className="stat-value">{plan.name}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Regions</span>
                      <span className="stat-value">{plan.universe.regions.join(", ")}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Sectors</span>
                      <span className="stat-value">{plan.universe.sectors.length > 0 ? plan.universe.sectors.join(", ") : "All"}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Rebalance</span>
                      <span className="stat-value">{plan.cadence.quarterly_rebalance ? "Quarterly" : "Manual"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted">No plan loaded</p>
                )}
              </div>

              <div className="card">
                <h3><Activity size={20} /> Ranking Factors</h3>
                {plan && (
                  <div className="plan-summary">
                    {plan.ranking.factors.map((factor, i) => (
                      <div key={i} className="stat-row">
                        <span className="stat-label">{factor.name}</span>
                        <span className="stat-value">{(factor.weight * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <h3><Calendar size={20} /> Next Actions</h3>
                <div className="plan-summary">
                  <div className="stat-row clickable" onClick={() => setActiveTab("portfolio")}>
                    <span className="stat-label">Monthly Buy List</span>
                    <span className="stat-value action-link">Generate →</span>
                  </div>
                  <div className="stat-row clickable" onClick={() => setActiveTab("portfolio")}>
                    <span className="stat-label">Quarterly Rebalance</span>
                    <span className="stat-value action-link">Check →</span>
                  </div>
                  <div className="stat-row clickable" onClick={() => setActiveTab("journal")}>
                    <span className="stat-label">Yearly Review</span>
                    <span className="stat-value action-link">Start →</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Overview */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3><TrendingUp size={20} /> Market Overview</h3>
                <button 
                  className="btn-small" 
                  onClick={loadMarketOverview} 
                  disabled={isLoadingMarket}
                >
                  {isLoadingMarket ? "Loading..." : "Refresh"}
                </button>
              </div>
              <div className="market-overview">
                {Object.entries(marketPrices).length > 0 ? (
                  Object.entries(marketPrices).map(([symbol, price]) => (
                    <div key={symbol} className="market-card">
                      <div className="market-card-symbol">{symbol}</div>
                      <div className="market-card-price">${price.toFixed(2)}</div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center' }}>
                    {isLoadingMarket ? "Loading prices..." : "No market data loaded"}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "vibe-studio" && (
          <div className="animate-fade-in">
            <VibeStudio />
          </div>
        )}

        {activeTab === "templates" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Templates</h1>
              <p className="page-subtitle">Start with a pre-configured strategy</p>
            </header>

            <div className="template-grid">
              {templates.map((template) => (
                <div
                  key={template}
                  className={`template-card ${selectedTemplate === template ? "selected" : ""}`}
                  onClick={() => loadTemplate(template)}
                >
                  <h3>{template}</h3>
                  <p>Click to load this template configuration</p>
                </div>
              ))}
            </div>

            {plan && selectedTemplate && (
              <div className="card" style={{ marginTop: '2rem' }}>
                <h3>Selected: {plan.name}</h3>
                <div className="plan-summary">
                  <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}><strong>Strategy Focus:</strong></p>
                  <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-main)' }}>
                    {plan.ranking.factors.map((factor, i) => (
                      <li key={i} style={{ marginBottom: '0.5rem' }}>
                        {factor.name.charAt(0).toUpperCase() + factor.name.slice(1)}: {(factor.weight * 100).toFixed(0)}% weight
                      </li>
                    ))}
                  </ul>
                  <button className="btn-primary" onClick={() => setActiveTab("dashboard")}>
                    Use This Plan <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "data" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Data Sources</h1>
              <p className="page-subtitle">Manage your market data connections</p>
            </header>

            <div className="dashboard-grid">
              <div className="card">
                <h3>Alpha Vantage</h3>
                <div className="stat-row">
                  <span className="stat-label">Provider</span>
                  <span className="stat-value">Alpha Vantage (Free Tier)</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Quota</span>
                  <span className="stat-value">25 requests/day</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Status</span>
                  <span className="stat-value">Ready</span>
                </div>
                
                <div style={{ marginTop: '1.5rem' }}>
                  <button 
                    className="btn-primary" 
                    onClick={testConnection}
                    disabled={isTestingConnection}
                  >
                    {isTestingConnection ? "Testing..." : "Test Connection"}
                  </button>
                </div>
                
                {connectionStatus && (
                  <div className={`connection-status ${connectionStatus.startsWith("✅") ? "success" : "error"}`}>
                    {connectionStatus.startsWith("✅") ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    {connectionStatus.replace(/^[✅❌]\s*/, "")}
                  </div>
                )}
              </div>

              <div className="card">
                <h3>Data Sync Status</h3>
                <div className="stat-row">
                  <span className="stat-label">Last sync</span>
                  <span className="stat-value">{lastSyncTime ? new Date(lastSyncTime).toLocaleString() : "Never"}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Cached symbols</span>
                  <span className="stat-value">{cachedSymbolsCount}</span>
                </div>
                <div style={{ marginTop: '1.5rem' }}>
                  <button 
                    className="btn-primary" 
                    onClick={syncData}
                    disabled={isSyncing}
                  >
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "rankings" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Stock Rankings</h1>
              <p className="page-subtitle">Score and rank symbols based on your plan's factors</p>
            </header>

            <div className="card">
              <h3>Score Symbols</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Current Plan: <strong>{plan?.name || "None"}</strong>
              </p>
              
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label>Enter symbol tickers (comma-separated):</label>
                <input
                  type="text"
                  value={rankingsSymbols}
                  onChange={(e) => setRankingsSymbols(e.target.value)}
                  placeholder="e.g., AAPL,MSFT,GOOGL"
                  className="symbol-input"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                />
              </div>
              
              <button 
                className="btn-primary" 
                onClick={scoreSymbols}
                disabled={isScoring || !plan}
              >
                {isScoring ? "Scoring..." : "Score Symbols"}
              </button>
              
              {!plan && <p className="note" style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Please select a plan from Templates first</p>}
            </div>

            {scores.length > 0 && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3>Results ({scores.length} symbols ranked)</h3>
                <div className="scores-table" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Rank</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Symbol</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Total Score</th>
                        {scores[0]?.factors.map((f, i) => (
                          <th key={i} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>{f.name.toUpperCase()}</th>
                        ))}
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((score, idx) => (
                        <tr key={score.symbol} style={{ background: idx < 3 ? 'var(--bg-highlight)' : 'transparent' }}>
                          <td style={{ padding: '0.75rem' }}>{idx + 1}</td>
                          <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{score.symbol}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '60px', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${score.total_score}%`, height: '100%', background: 'var(--accent-primary)' }}></div>
                              </div>
                              <span>{score.total_score.toFixed(1)}</span>
                            </div>
                          </td>
                          {score.factors.map((f, i) => (
                            <td key={i} style={{ padding: '0.75rem' }}>{f.normalized_value.toFixed(0)}</td>
                          ))}
                          <td style={{ padding: '0.75rem' }}>
                            <button 
                              className="btn-small"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
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
              <div className="card score-detail" style={{ marginTop: '1.5rem', position: 'relative' }}>
                <h3>Detailed Analysis: {selectedScore.symbol}</h3>
                <button 
                  className="close-btn"
                  onClick={() => setSelectedScore(null)}
                  style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  ✕
                </button>
                
                <div className="score-explanation" style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selectedScore.explanation}</pre>
                </div>

                <h4>Factor Contributions</h4>
                <div className="factor-breakdown">
                  {selectedScore.factors.map((factor, i) => (
                    <div key={i} className="factor-item" style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 'bold' }}>{factor.name.toUpperCase()}</span>
                        <span>{factor.normalized_value.toFixed(1)}/100</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.25rem' }}>
                        <div style={{ width: `${factor.normalized_value}%`, height: '100%', background: 'var(--accent-primary)' }}></div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Weight: {(factor.weight * 100).toFixed(0)}% • Contributes {factor.contribution.toFixed(1)} points
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="animate-fade-in">
            <PortfolioTab />
          </div>
        )}

        {activeTab === "backtest" && (
          <div className="animate-fade-in">
            <BacktestTab />
          </div>
        )}

        {activeTab === "journal" && (
          <div className="animate-fade-in">
            <JournalTab />
          </div>
        )}

        {activeTab === "universe" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Universe & Watchlists</h1>
              <p className="page-subtitle">Manage your symbol universes and watchlists</p>
            </header>

            <div className="dashboard-grid">
              <div className="card">
                <h3><Plus size={20} /> Create New Universe</h3>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Universe Name</label>
                  <input
                    type="text"
                    value={newUniverseName}
                    onChange={(e) => setNewUniverseName(e.target.value)}
                    placeholder="e.g., Tech Leaders"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Symbols (comma-separated)</label>
                  <input
                    type="text"
                    value={newUniverseSymbols}
                    onChange={(e) => setNewUniverseSymbols(e.target.value)}
                    placeholder="e.g., AAPL, MSFT, GOOGL"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                  />
                </div>
                <button className="btn-primary" onClick={createUniverse}>
                  <Plus size={16} /> Create Universe
                </button>
              </div>

              <div className="card">
                <h3><Download size={20} /> Export / Import</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Export all your data or import from a backup
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={exportData}>
                    <Download size={16} /> Export Data
                  </button>
                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Upload size={16} /> Import Data
                    <input
                      type="file"
                      accept=".json"
                      onChange={importData}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {universes.length > 0 && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3><Globe size={20} /> Your Universes ({universes.length})</h3>
                <div className="universe-list">
                  {universes.map((universe) => (
                    <div key={universe.id} className="universe-item" style={{ 
                      padding: '1rem', 
                      marginBottom: '1rem', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: '8px',
                      border: selectedUniverse?.id === universe.id ? '2px solid var(--primary)' : '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>{universe.name}</h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.25rem 0' }}>
                            {universe.symbols.length} symbols
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn-small"
                            onClick={() => {
                              setSelectedUniverse(universe);
                              setRankingsSymbols(universe.symbols.join(", "));
                            }}
                          >
                            Use in Rankings
                          </button>
                          <button 
                            className="btn-small"
                            onClick={() => deleteUniverse(universe.id)}
                            style={{ color: 'var(--error)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {universe.symbols.slice(0, 10).map((symbol) => (
                          <span key={symbol} className="tag">{symbol}</span>
                        ))}
                        {universe.symbols.length > 10 && (
                          <span className="tag">+{universe.symbols.length - 10} more</span>
                        )}
                      </div>
                      {universe.exclude_list.length > 0 && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          Excluded: {universe.exclude_list.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedPlans.length > 0 && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3><Save size={20} /> Saved Plans ({savedPlans.length})</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  {savedPlans.map((planName) => (
                    <div key={planName} style={{ 
                      padding: '1rem', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      minWidth: '200px'
                    }}>
                      <h4 style={{ margin: '0 0 0.5rem 0' }}>{planName}</h4>
                      <button 
                        className="btn-small"
                        onClick={async () => {
                          try {
                            const loadedPlan = await invoke<VibePlan>("load_plan", { name: planName });
                            setPlan(loadedPlan);
                            alert("Plan loaded successfully!");
                          } catch (error) {
                            alert("Error loading plan: " + error);
                          }
                        }}
                      >
                        Load Plan
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3><Save size={20} /> Current Plan: {plan.name}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Save your current plan configuration for later use
                </p>
                <button className="btn-primary" onClick={savePlan}>
                  <Save size={16} /> Save Current Plan
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
