import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { invoke } from "./services/tauri";
import VibeStudio from "./components/VibeStudio";
import { ThemeToggle } from "./components/ThemeToggle";
import { useToast } from "./components/Toast";
import { logger } from "./core/logger";
import { VibePlan } from "./shared/types";
import { GeneratedPortfolio } from "./services/portfolioAgent";
import { DEFAULT_SYMBOLS } from "./shared/constants";
import { saveFile } from "./shared/utils/fileSystem";
import { 
  LayoutDashboard, 
  Sparkles, 
  FileText, 
  Database, 
  Activity, 
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
  Plus,
  ClipboardCheck,
  Menu,
  X
} from "lucide-react";
import "./App.css";
import "./styles/optimizer.css";
import "./styles/liveProgress.css";

// Lazy-loaded tab components
const PortfolioTab = lazy(() => import("./PortfolioTab").then(m => ({ default: m.PortfolioTab })));
const BacktestTab = lazy(() => import("./BacktestTab").then(m => ({ default: m.BacktestTab })));
const JournalTab = lazy(() => import("./JournalTab").then(m => ({ default: m.JournalTab })));
const YearlyReviewComponent = lazy(() => import("./components/YearlyReview").then(m => ({ default: m.YearlyReviewComponent })));
const SavedPortfoliosTab = lazy(() => import("./components/SavedPortfoliosTab").then(m => ({ default: m.SavedPortfoliosTab })));
const DataSourcesPage = lazy(() => import("./components/DataSourcesPage").then(m => ({ default: m.DataSourcesPage })));

function TabLoading() {
  return (
    <div className="tab-loading" role="status" aria-label="Loading content">
      <div className="tab-loading-spinner" />
      <span className="sr-only">Loading…</span>
    </div>
  );
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
  const { addToast } = useToast();
  const [status, setStatus] = useState("Initializing...");
  const [plan, setPlan] = useState<VibePlan | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Rankings state
  const [rankingsSymbols, setRankingsSymbols] = useState<string>(DEFAULT_SYMBOLS.join(","));
  const [scores, setScores] = useState<SymbolScore[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [selectedScore, setSelectedScore] = useState<SymbolScore | null>(null);
  
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
  
  // Portfolio to load into VibeStudio (from SavedPortfoliosTab)
  const [portfolioToLoad, setPortfolioToLoad] = useState<GeneratedPortfolio | null>(null);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    checkHealth();
    loadTemplates();
    loadDefaultPlan();
    loadCacheStats();
    loadUniverses();
    loadSavedPlans();
    loadMarketOverview();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function checkHealth() {
    try {
      const health = await invoke<string>("health_check");
      if (isMountedRef.current) {
        setStatus(health);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setStatus("Error: " + error);
      }
    }
  }

  async function loadTemplates() {
    try {
      const templateList = await invoke<string[]>("list_templates");
      if (isMountedRef.current) {
        setTemplates(templateList);
      }
    } catch (error) {
      logger.error("Failed to load templates:", error);
    }
  }

  async function loadDefaultPlan() {
    try {
      const defaultPlan = await invoke<VibePlan>("get_default_plan");
      if (isMountedRef.current) {
        setPlan(defaultPlan);
      }
    } catch (error) {
      logger.error("Failed to load default plan:", error);
    }
  }

  async function loadCacheStats() {
    // Cache stats are now loaded directly by the DataSourcesPage component
    // This function is kept for backwards compatibility
  }

  async function loadUniverses() {
    try {
      const universeList = await invoke<Universe[]>("list_universes");
      if (isMountedRef.current) {
        setUniverses(universeList);
      }
    } catch (error) {
      logger.error("Failed to load universes:", error);
    }
  }

  async function loadSavedPlans() {
    try {
      const plans = await invoke<string[]>("list_saved_plans");
      if (isMountedRef.current) {
        setSavedPlans(plans);
      }
    } catch (error) {
      logger.error("Failed to load saved plans:", error);
    }
  }

  async function loadMarketOverview() {
    if (isMountedRef.current) {
      setIsLoadingMarket(true);
    }
    try {
      const prices = await invoke<Record<string, number>>("get_current_prices_batch", { symbols: DEFAULT_SYMBOLS });
      if (isMountedRef.current) {
        setMarketPrices(prices);
      }
    } catch (error) {
      logger.error("Failed to load market prices:", error);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMarket(false);
      }
    }
  }

  async function createUniverse() {
    if (!newUniverseName.trim()) {
      addToast("Please enter a universe name", "warning");
      return;
    }
    
    try {
      const symbols = newUniverseSymbols.split(",").map(s => s.trim().toUpperCase()).filter(s => s);
      const universe = await invoke<Universe>("create_universe", {
        name: newUniverseName,
        description: `Universe created on ${new Date().toLocaleDateString()}`,
        symbols
      });
      if (isMountedRef.current) {
        setUniverses([...universes, universe]);
        setNewUniverseName("");
        setNewUniverseSymbols("");
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error creating universe: " + error, "error");
      }
    }
  }

  async function deleteUniverse(id: string) {
    try {
      await invoke("delete_universe", { id });
      if (isMountedRef.current) {
        setUniverses(universes.filter(u => u.id !== id));
        if (selectedUniverse?.id === id) {
          setSelectedUniverse(null);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error deleting universe: " + error, "error");
      }
    }
  }

  async function savePlan() {
    if (!plan) {
      addToast("No plan to save", "warning");
      return;
    }
    
    try {
      await invoke("save_plan", { plan });
      await loadSavedPlans();
      if (isMountedRef.current) {
        addToast("Plan saved successfully!", "success");
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error saving plan: " + error, "error");
      }
    }
  }

  async function exportData() {
    try {
      const bundleJson = await invoke<string>("export_data_bundle", {
        plan,
        journalEntries: []
      });
      
      const filename = `flowfolio-export-${new Date().toISOString().split("T")[0]}.json`;
      await saveFile(bundleJson, filename, "application/json");
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error exporting data: " + error, "error");
      }
    }
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const result = await invoke<{ success: boolean }>("import_data_bundle", { bundleJson: text });
      if (result.success && isMountedRef.current) {
        addToast("Data imported successfully!", "success");
        await loadUniverses();
        await loadSavedPlans();
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error importing data: " + error, "error");
      }
    }
  }

  async function loadTemplate(templateName: string) {
    try {
      const template = await invoke<VibePlan>("get_template", { name: templateName });
      if (isMountedRef.current) {
        setPlan(template);
        setSelectedTemplate(templateName);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error loading template: " + error, "error");
      }
    }
  }

  async function scoreSymbols() {
    if (!plan) {
      addToast("Please select a plan first", "warning");
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
      if (isMountedRef.current) {
        setScores(results);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error scoring symbols: " + error, "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsScoring(false);
      }
    }
  }

  const handleNavClick = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const renderSidebar = () => (
    <aside 
      className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon-wrapper">
            <img src="/logo.png" alt="FlowFolio" className="logo-image" />
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
      
      <nav className="nav-menu" role="menubar" aria-label="Application sections">
        <button 
          className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => handleNavClick("dashboard")}
          title={isSidebarCollapsed ? "Dashboard" : ""}
          role="menuitem"
          aria-current={activeTab === "dashboard" ? "page" : undefined}
        >
          <LayoutDashboard className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Dashboard</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "vibe-studio" ? "active" : ""}`}
          onClick={() => handleNavClick("vibe-studio")}
          title={isSidebarCollapsed ? "Vibe Studio" : ""}
          role="menuitem"
          aria-current={activeTab === "vibe-studio" ? "page" : undefined}
        >
          <Sparkles className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Vibe Studio</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "saved-portfolios" ? "active" : ""}`}
          onClick={() => handleNavClick("saved-portfolios")}
          title={isSidebarCollapsed ? "Saved Portfolios" : ""}
          role="menuitem"
          aria-current={activeTab === "saved-portfolios" ? "page" : undefined}
        >
          <Save className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Saved Portfolios</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => handleNavClick("templates")}
          title={isSidebarCollapsed ? "Templates" : ""}
          role="menuitem"
          aria-current={activeTab === "templates" ? "page" : undefined}
        >
          <FileText className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Templates</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "rankings" ? "active" : ""}`}
          onClick={() => handleNavClick("rankings")}
          title={isSidebarCollapsed ? "Rankings" : ""}
          role="menuitem"
          aria-current={activeTab === "rankings" ? "page" : undefined}
        >
          <TrendingUp className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Rankings</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "portfolio" ? "active" : ""}`}
          onClick={() => handleNavClick("portfolio")}
          title={isSidebarCollapsed ? "Portfolio" : ""}
          role="menuitem"
          aria-current={activeTab === "portfolio" ? "page" : undefined}
        >
          <PieChart className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Portfolio</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "backtest" ? "active" : ""}`}
          onClick={() => handleNavClick("backtest")}
          title={isSidebarCollapsed ? "Backtest" : ""}
          role="menuitem"
          aria-current={activeTab === "backtest" ? "page" : undefined}
        >
          <FlaskConical className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Backtest</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "journal" ? "active" : ""}`}
          onClick={() => handleNavClick("journal")}
          title={isSidebarCollapsed ? "Journal" : ""}
          role="menuitem"
          aria-current={activeTab === "journal" ? "page" : undefined}
        >
          <BookOpen className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Journal</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "yearly-review" ? "active" : ""}`}
          onClick={() => handleNavClick("yearly-review")}
          title={isSidebarCollapsed ? "Yearly Review" : ""}
          role="menuitem"
          aria-current={activeTab === "yearly-review" ? "page" : undefined}
        >
          <ClipboardCheck className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Yearly Review</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "universe" ? "active" : ""}`}
          onClick={() => handleNavClick("universe")}
          title={isSidebarCollapsed ? "Universe" : ""}
          role="menuitem"
          aria-current={activeTab === "universe" ? "page" : undefined}
        >
          <Globe className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Universe</span>}
        </button>
        <button 
          className={`nav-item ${activeTab === "data" ? "active" : ""}`}
          onClick={() => handleNavClick("data")}
          title={isSidebarCollapsed ? "Data Sources" : ""}
          role="menuitem"
          aria-current={activeTab === "data" ? "page" : undefined}
        >
          <Database className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Data Sources</span>}
        </button>
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle compact={isSidebarCollapsed} />
        <div className={`status-badge ${isSidebarCollapsed ? "collapsed" : ""}`}>
          <div className={`status-dot ${status.includes("running") || status === "Healthy" ? "online" : "offline"}`}></div>
          {!isSidebarCollapsed && <span>{status.includes("running") || status === "Healthy" ? "System Online" : status}</span>}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      
      <button
        className="mobile-menu-btn"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      
      <div
        className={`sidebar-overlay ${isMobileMenuOpen ? "visible" : ""}`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />
      
      {renderSidebar()}

      <main id="main-content" className="main-content" role="main">
        {activeTab === "dashboard" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <div className="page-header-row">
                <div>
                  <h1 className="page-title">Dashboard</h1>
                  <p className="page-subtitle">Overview of your investment strategy</p>
                </div>
                <div className="page-header-actions">
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
                      <span className="stat-value">{plan.cadence.frequency === 'quarterly' ? "Quarterly" : "Manual"}</span>
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
                  <div className="stat-row clickable" onClick={() => setActiveTab("yearly-review")}>
                    <span className="stat-label">Yearly Review</span>
                    <span className="stat-value action-link">Start →</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Overview */}
            <div className="card mt-lg">
              <div className="card-header">
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
                  <p className="text-muted text-center w-full">
                    {isLoadingMarket ? "Loading prices..." : "No market data loaded"}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "vibe-studio" && (
          <div className="animate-fade-in">
            <VibeStudio 
              initialPortfolio={portfolioToLoad}
              onPortfolioLoaded={() => setPortfolioToLoad(null)}
            />
          </div>
        )}

        {activeTab === "saved-portfolios" && (
          <Suspense fallback={<TabLoading />}>
            <SavedPortfoliosTab onLoadPortfolio={(portfolio) => {
              setPortfolioToLoad(portfolio);
              setActiveTab("vibe-studio");
            }} />
          </Suspense>
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
              <div className="card mt-xl">
                <h3>Selected: {plan.name}</h3>
                <div className="plan-summary">
                  <p className="text-muted mb-md"><strong>Strategy Focus:</strong></p>
                  <ul className="text-main mb-lg" style={{ paddingLeft: '1.5rem' }}>
                    {plan.ranking.factors.map((factor, i) => (
                      <li key={i} className="mb-sm">
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
          <Suspense fallback={<TabLoading />}>
            <DataSourcesPage />
          </Suspense>
        )}

        {activeTab === "rankings" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Stock Rankings</h1>
              <p className="page-subtitle">Score and rank symbols based on your plan's factors</p>
            </header>

            <div className="card">
              <h3>Score Symbols</h3>
              <p className="text-muted mb-md">
                Current Plan: <strong>{plan?.name || "None"}</strong>
              </p>
              
              <div className="form-group">
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
              <div className="card mt-lg">
                <h3>Results ({scores.length} symbols ranked)</h3>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Symbol</th>
                        <th>Total Score</th>
                        {scores[0]?.factors.map((f, i) => (
                          <th key={i}>{f.name.toUpperCase()}</th>
                        ))}
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((score, idx) => (
                        <tr key={score.symbol} className={idx < 3 ? 'highlight-row' : ''}>
                          <td>{idx + 1}</td>
                          <td className="font-bold">{score.symbol}</td>
                          <td>
                            <div className="score-display">
                              <div className="score-bar">
                                <div className="score-bar-fill" style={{ width: `${score.total_score}%` }}></div>
                              </div>
                              <span className="score-value">{score.total_score.toFixed(1)}</span>
                            </div>
                          </td>
                          {score.factors.map((f, i) => (
                            <td key={i} className="font-mono">{f.normalized_value.toFixed(0)}</td>
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
              <div className="card mt-lg relative">
                <h3>Detailed Analysis: {selectedScore.symbol}</h3>
                <button 
                  className="btn-close"
                  onClick={() => setSelectedScore(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
                
                <div className="explanation-box">
                  <pre>{selectedScore.explanation}</pre>
                </div>

                <h4>Factor Contributions</h4>
                <div className="factor-breakdown">
                  {selectedScore.factors.map((factor, i) => (
                    <div key={i} className="factor-item">
                      <div className="factor-header">
                        <span className="factor-name">{factor.name.toUpperCase()}</span>
                        <span className="font-mono">{factor.normalized_value.toFixed(1)}/100</span>
                      </div>
                      <div className="factor-bar">
                        <div className="factor-bar-fill" style={{ width: `${factor.normalized_value}%` }}></div>
                      </div>
                      <div className="factor-details">
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
            <Suspense fallback={<TabLoading />}>
              <PortfolioTab />
            </Suspense>
          </div>
        )}

        {activeTab === "backtest" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <BacktestTab />
            </Suspense>
          </div>
        )}

        {activeTab === "journal" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <JournalTab />
            </Suspense>
          </div>
        )}

        {activeTab === "yearly-review" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Yearly Review</h1>
              <p className="page-subtitle">Comprehensive annual strategy and portfolio review checklist</p>
            </header>
            <Suspense fallback={<TabLoading />}>
              <YearlyReviewComponent portfolioName={plan?.name || "My Portfolio"} />
            </Suspense>
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
                <div className="form-group">
                  <label>Universe Name</label>
                  <input
                    type="text"
                    value={newUniverseName}
                    onChange={(e) => setNewUniverseName(e.target.value)}
                    placeholder="e.g., Tech Leaders"
                  />
                </div>
                <div className="form-group">
                  <label>Symbols (comma-separated)</label>
                  <input
                    type="text"
                    value={newUniverseSymbols}
                    onChange={(e) => setNewUniverseSymbols(e.target.value)}
                    placeholder="e.g., AAPL, MSFT, GOOGL"
                  />
                </div>
                <button className="btn-primary" onClick={createUniverse}>
                  <Plus size={16} /> Create Universe
                </button>
              </div>

              <div className="card">
                <h3><Download size={20} /> Export / Import</h3>
                <p className="text-muted mb-md">
                  Export all your data or import from a backup
                </p>
                <div className="flex gap-md flex-wrap">
                  <button className="btn-primary" onClick={exportData}>
                    <Download size={16} /> Export Data
                  </button>
                  <label className="btn-secondary cursor-pointer flex items-center gap-sm">
                    <Upload size={16} /> Import Data
                    <input
                      type="file"
                      accept=".json"
                      onChange={importData}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {universes.length > 0 && (
              <div className="card mt-lg">
                <h3><Globe size={20} /> Your Universes ({universes.length})</h3>
                <div className="universe-list">
                  {universes.map((universe) => (
                    <div 
                      key={universe.id} 
                      className={`universe-item p-md mb-md bg-hover rounded ${selectedUniverse?.id === universe.id ? 'border-primary' : 'border'}`}
                    >
                      <div className="flex justify-between items-start mb-sm">
                        <div>
                          <h4 className="mt-0 mb-0">{universe.name}</h4>
                          <p className="text-muted text-sm mt-0 mb-0">
                            {universe.symbols.length} symbols
                          </p>
                        </div>
                        <div className="flex gap-sm">
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
                            className="btn-small text-error"
                            onClick={() => deleteUniverse(universe.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-sm">
                        {universe.symbols.slice(0, 10).map((symbol) => (
                          <span key={symbol} className="tag">{symbol}</span>
                        ))}
                        {universe.symbols.length > 10 && (
                          <span className="tag">+{universe.symbols.length - 10} more</span>
                        )}
                      </div>
                      {universe.exclude_list.length > 0 && (
                        <p className="text-muted text-sm mt-sm mb-0">
                          Excluded: {universe.exclude_list.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {savedPlans.length > 0 && (
              <div className="card mt-lg">
                <h3><Save size={20} /> Saved Plans ({savedPlans.length})</h3>
                <div className="flex flex-wrap gap-md">
                  {savedPlans.map((planName) => (
                    <div key={planName} className="saved-plan-card">
                      <h4 className="saved-plan-name">{planName}</h4>
                      <button 
                        className="btn-small"
                        onClick={async () => {
                          try {
                            const loadedPlan = await invoke<VibePlan>("load_plan", { name: planName });
                            setPlan(loadedPlan);
                            addToast("Plan loaded successfully!", "success");
                          } catch (error) {
                            addToast("Error loading plan: " + error, "error");
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
              <div className="card mt-lg">
                <h3><Save size={20} /> Current Plan: {plan.name}</h3>
                <p className="text-muted mb-md">
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
