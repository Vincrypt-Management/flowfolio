import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useAuth } from './contexts/AuthContext';
import { invoke } from "./services/tauri";
import { invokeWithResilience } from './services/apiClient';
import VibeStudio from "./components/VibeStudio";
import { ThemeToggle } from "./components/ThemeToggle";
import { useToast } from "./components/Toast";
import { logger } from "./core/logger";
import { VibePlan } from "./shared/types";
import { GeneratedPortfolio } from "./services/portfolioAgent";
import { DEFAULT_SYMBOLS } from "./shared/constants";
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { useSidebarTooltips, SidebarTooltip } from './features/onboarding/SidebarTooltips';
import { TemplatesTab } from './features/templates/TemplatesTab';
import { RankingsTab } from './features/rankings/RankingsTab';
import { UniverseTab } from './features/universe/UniverseTab';
import { saveFile } from "./shared/utils/fileSystem";
import { useUserMode } from "./contexts/UserModeContext";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  Database,
  PieChart,
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
  X,
  ToggleLeft,
  ToggleRight,
  Settings,
  Eye,
  Bell,
  Shield,
  GitCompare,
  Clock,
  Newspaper
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
const SettingsPage = lazy(() => import("./components/SettingsPage").then(m => ({ default: m.SettingsPage })));
const WatchlistTab = lazy(() => import("./components/WatchlistTab").then(m => ({ default: m.WatchlistTab })));
const AlertsPanel = lazy(() => import("./components/AlertsPanel").then(m => ({ default: m.AlertsPanel })));
const RiskDashboard = lazy(() => import("./components/RiskDashboard").then(m => ({ default: m.RiskDashboard })));
const ComparisonMode = lazy(() => import("./components/ComparisonMode").then(m => ({ default: m.ComparisonMode })));
const RebalanceScheduler = lazy(() => import("./components/RebalanceScheduler").then(m => ({ default: m.RebalanceScheduler })));
const NewsFeed = lazy(() => import("./components/NewsFeed").then(m => ({ default: m.NewsFeed })));
const TickerAnalysis = lazy(() => import('./components/TickerAnalysis'));

import Dashboard from "./components/Dashboard";
import { UserProfileCard } from "./components/UserProfileCard";

function TabLoading() {
  return (
    <div className="tab-loading" role="status" aria-label="Loading content">
      <div className="tab-loading-spinner" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface ScoringConfig {
  factor_weights: Record<string, number>;
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
  const { isAdvanced, toggleMode } = useUserMode();
  const { handleOAuthCallback } = useAuth();
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

  // Analysis tab symbol
  const [analysisSymbol, setAnalysisSymbol] = useState<string>('');

  // Real holdings lifted from PortfolioTab for RiskDashboard
  const [portfolioHoldings, setPortfolioHoldings] = useState<Array<{
    symbol: string; shares: number; currentPrice: number;
    value: number; weight: number;
  }>>([]);
  const [portfolioValue, setPortfolioValue] = useState<number>(0);

  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  const { isShown: isTooltipShown, dismiss: dismissTooltip, getContent: getTooltipContent } =
    useSidebarTooltips(!!onboardingComplete);

  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: 'onboarding_complete' })
      .then(val => setOnboardingComplete(val === 'true'))
      .catch(() => setOnboardingComplete(true));
  }, []);

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
        setStatus("Error: " + (error instanceof Error ? error.message : String(error)));
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

  const loadMarketOverview = useCallback(async () => {
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
  }, []);

  const createUniverse = useCallback(async () => {
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
        addToast("Error creating universe: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [newUniverseName, newUniverseSymbols, universes, addToast]);

  const deleteUniverse = useCallback(async (id: string) => {
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
        addToast("Error deleting universe: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [universes, selectedUniverse, addToast]);

  const savePlan = useCallback(async () => {
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
        addToast("Error saving plan: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [plan, addToast]);

  const exportData = useCallback(async () => {
    try {
      const bundleJson = await invoke<string>("export_data_bundle", {
        plan,
        journalEntries: []
      });
      
      const filename = `flowfolio-export-${new Date().toISOString().split("T")[0]}.json`;
      await saveFile(bundleJson, filename, "application/json");
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error exporting data: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [plan, addToast]);

  const importData = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
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
        addToast("Error importing data: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [addToast]);

  const loadTemplate = useCallback(async (templateName: string) => {
    try {
      const template = await invoke<VibePlan>("get_template", { name: templateName });
      if (isMountedRef.current) {
        setPlan(template);
        setSelectedTemplate(templateName);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error loading template: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [addToast]);

  const scoreSymbols = useCallback(async () => {
    if (!plan) {
      addToast('Please select a plan first', 'warning');
      return;
    }

    setIsScoring(true);
    setScores([]);

    try {
      const symbolsList = rankingsSymbols.split(',').map(s => s.trim()).filter(s => s);

      const config = await invokeWithResilience<ScoringConfig>('get_scoring_config', { plan });
      const results = await invokeWithResilience<SymbolScore[]>('score_symbols_batch', {
        symbols: symbolsList,
        config,
      });

      results.sort((a, b) => b.total_score - a.total_score);
      if (isMountedRef.current) {
        setScores(results);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast('Error scoring symbols: ' + (error instanceof Error ? error.message : String(error)), 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsScoring(false);
      }
    }
  }, [plan, rankingsSymbols, addToast]);

  const loadPlan = useCallback(async (planName: string) => {
    try {
      const loadedPlan = await invoke<VibePlan>("load_plan", { name: planName });
      if (isMountedRef.current) {
        setPlan(loadedPlan);
        addToast("Plan loaded successfully!", "success");
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error loading plan: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [addToast]);

  const useUniverseInRankings = useCallback((universe: { id: string; symbols: string[] }) => {
    setSelectedUniverse(universe as Universe);
    setRankingsSymbols(universe.symbols.join(", "));
  }, []);

  const handleNavClick = useCallback((tab: string, data?: Record<string, unknown>) => {
    // WatchlistTab calls onNavigate('ticker-analysis', { symbol }) — map to our tab key
    const resolvedTab = tab === 'ticker-analysis' ? 'analysis' : tab;
    if (resolvedTab === 'analysis' && typeof data?.symbol === 'string') {
      setAnalysisSymbol(data.symbol);
    }
    setActiveTab(resolvedTab);
    setIsMobileMenuOpen(false);
  }, []);

  // Handle deep-link OAuth callback (flowfolio://auth/callback?access_token=...&refresh_token=...)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onOpenUrl(async (urls) => {
      for (const url of urls) {
        if (url.startsWith('flowfolio://auth/callback')) {
          await handleOAuthCallback(url);
          addToast('Logged in successfully!', 'success');
        }
      }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [handleOAuthCallback, addToast]);

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
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="dashboard"
            isShown={isTooltipShown('dashboard')}
            content={getTooltipContent('dashboard')}
            onDismiss={dismissTooltip}
          />
        </div>
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="vibe_studio"
            isShown={isTooltipShown('vibe_studio')}
            content={getTooltipContent('vibe_studio')}
            onDismiss={dismissTooltip}
          />
        </div>
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
        {isAdvanced && (
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="templates"
            isShown={isTooltipShown('templates')}
            content={getTooltipContent('templates')}
            onDismiss={dismissTooltip}
          />
        </div>
        )}
        {isAdvanced && (
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="rankings"
            isShown={isTooltipShown('rankings')}
            content={getTooltipContent('rankings')}
            onDismiss={dismissTooltip}
          />
        </div>
        )}
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="portfolio"
            isShown={isTooltipShown('portfolio')}
            content={getTooltipContent('portfolio')}
            onDismiss={dismissTooltip}
          />
        </div>
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="backtest"
            isShown={isTooltipShown('backtest')}
            content={getTooltipContent('backtest')}
            onDismiss={dismissTooltip}
          />
        </div>
        <div style={{ position: 'relative' }}>
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
          <SidebarTooltip
            tab="journal"
            isShown={isTooltipShown('journal')}
            content={getTooltipContent('journal')}
            onDismiss={dismissTooltip}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className={`nav-item ${activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => handleNavClick("watchlist")}
            title={isSidebarCollapsed ? "Watchlist" : ""}
            role="menuitem"
            aria-current={activeTab === "watchlist" ? "page" : undefined}
          >
            <Eye className="nav-icon" size={20} />
            {!isSidebarCollapsed && <span>Watchlist</span>}
          </button>
          <SidebarTooltip
            tab="watchlist"
            isShown={isTooltipShown('watchlist')}
            content={getTooltipContent('watchlist')}
            onDismiss={dismissTooltip}
          />
        </div>
        <button
          className={`nav-item ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => handleNavClick("analysis")}
          title={isSidebarCollapsed ? "Analysis" : ""}
          role="menuitem"
          aria-current={activeTab === "analysis" ? "page" : undefined}
        >
          <TrendingUp className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Analysis</span>}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={`nav-item ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => handleNavClick("alerts")}
            title={isSidebarCollapsed ? "Alerts" : ""}
            role="menuitem"
            aria-current={activeTab === "alerts" ? "page" : undefined}
          >
            <Bell className="nav-icon" size={20} />
            {!isSidebarCollapsed && <span>Alerts</span>}
          </button>
          <SidebarTooltip
            tab="alerts"
            isShown={isTooltipShown('alerts')}
            content={getTooltipContent('alerts')}
            onDismiss={dismissTooltip}
          />
        </div>
        {isAdvanced && (
        <button
          className={`nav-item ${activeTab === "comparison" ? "active" : ""}`}
          onClick={() => handleNavClick("comparison")}
          title={isSidebarCollapsed ? "Compare" : ""}
          role="menuitem"
          aria-current={activeTab === "comparison" ? "page" : undefined}
        >
          <GitCompare className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Compare</span>}
        </button>
        )}
        {isAdvanced && (
        <button
          className={`nav-item ${activeTab === "risk" ? "active" : ""}`}
          onClick={() => handleNavClick("risk")}
          title={isSidebarCollapsed ? "Risk" : ""}
          role="menuitem"
          aria-current={activeTab === "risk" ? "page" : undefined}
        >
          <Shield className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Risk</span>}
        </button>
        )}
        {isAdvanced && (
        <button
          className={`nav-item ${activeTab === "scheduler" ? "active" : ""}`}
          onClick={() => handleNavClick("scheduler")}
          title={isSidebarCollapsed ? "Scheduler" : ""}
          role="menuitem"
          aria-current={activeTab === "scheduler" ? "page" : undefined}
        >
          <Clock className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Scheduler</span>}
        </button>
        )}
        <button
          className={`nav-item ${activeTab === "news" ? "active" : ""}`}
          onClick={() => handleNavClick("news")}
          title={isSidebarCollapsed ? "News" : ""}
          role="menuitem"
          aria-current={activeTab === "news" ? "page" : undefined}
        >
          <Newspaper className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>News</span>}
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
        {isAdvanced && (
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
        )}
        {isAdvanced && (
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
        )}
        <button
          className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => handleNavClick("settings")}
          title={isSidebarCollapsed ? "Settings" : ""}
          role="menuitem"
          aria-current={activeTab === "settings" ? "page" : undefined}
        >
          <Settings className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Settings</span>}
        </button>
      </nav>

      <div className="sidebar-footer">
        <UserProfileCard
          collapsed={isSidebarCollapsed}
          onSettingsClick={() => handleNavClick("settings")}
        />
        <button 
          className={`mode-toggle ${isSidebarCollapsed ? "collapsed" : ""}`}
          onClick={toggleMode}
          aria-label={isAdvanced ? "Switch to Simple mode" : "Switch to Advanced mode"}
          title={isSidebarCollapsed ? (isAdvanced ? "Advanced Mode" : "Simple Mode") : ""}
        >
          {isAdvanced ? <ToggleRight className="mode-toggle-icon active" size={20} /> : <ToggleLeft className="mode-toggle-icon" size={20} />}
          {!isSidebarCollapsed && (
            <span className="mode-toggle-label">
              {isAdvanced ? "Advanced" : "Simple"}
            </span>
          )}
        </button>
        <ThemeToggle compact={isSidebarCollapsed} />
        <div className={`status-badge ${isSidebarCollapsed ? "collapsed" : ""}`}>
          <div className={`status-dot ${status.includes("running") || status === "Healthy" ? "online" : "offline"}`}></div>
          {!isSidebarCollapsed && <span>{status.includes("running") || status === "Healthy" ? "System Online" : status}</span>}
        </div>
      </div>
    </aside>
  );


  const handleHoldingsChange = useCallback((
    h: Array<{ symbol: string; shares: number; currentPrice: number; value: number; weight: number }>,
    v: number
  ) => {
    setPortfolioHoldings(h);
    setPortfolioValue(v);
  }, []);

  if (onboardingComplete === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="tab-loading-spinner" />
    </div>;
  }

  if (!onboardingComplete) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />;
  }

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
            <Dashboard
              plan={plan}
              onNavigate={handleNavClick}
              marketPrices={marketPrices}
              onRefreshMarket={loadMarketOverview}
              isLoadingMarket={isLoadingMarket}
            />
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
          <TemplatesTab
            templates={templates}
            selectedTemplate={selectedTemplate}
            plan={plan}
            onLoadTemplate={loadTemplate}
            onNavigateToDashboard={() => setActiveTab("dashboard")}
          />
        )}

        {activeTab === "data" && (
          <Suspense fallback={<TabLoading />}>
            <DataSourcesPage />
          </Suspense>
        )}

        {activeTab === "rankings" && (
          <RankingsTab
            plan={plan}
            rankingsSymbols={rankingsSymbols}
            onSymbolsChange={setRankingsSymbols}
            scores={scores}
            isScoring={isScoring}
            selectedScore={selectedScore}
            onSelectScore={setSelectedScore}
            onScoreSymbols={scoreSymbols}
          />
        )}

        {activeTab === "portfolio" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <PortfolioTab
                onHoldingsChange={handleHoldingsChange}
                onAnalyze={(symbol) => {
                  setAnalysisSymbol(symbol);
                  handleNavClick('analysis');
                }}
              />
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
          <UniverseTab
            universes={universes}
            newUniverseName={newUniverseName}
            onNewUniverseNameChange={setNewUniverseName}
            newUniverseSymbols={newUniverseSymbols}
            onNewUniverseSymbolsChange={setNewUniverseSymbols}
            onCreateUniverse={createUniverse}
            onDeleteUniverse={deleteUniverse}
            selectedUniverse={selectedUniverse}
            onSelectUniverse={setSelectedUniverse}
            onUseInRankings={useUniverseInRankings}
            savedPlans={savedPlans}
            plan={plan}
            onSavePlan={savePlan}
            onExportData={exportData}
            onImportData={importData}
            onLoadPlan={loadPlan}
            onAddToast={addToast}
          />
        )}

        {activeTab === "watchlist" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <WatchlistTab onNavigate={handleNavClick} />
            </Suspense>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Ticker Analysis</h1>
              <p className="page-subtitle">Deep-dive analysis for any symbol</p>
            </header>
            <Suspense fallback={<TabLoading />}>
              <TickerAnalysis
                symbol={analysisSymbol}
                onClose={() => {}}
                inline={true}
                onTickerChange={setAnalysisSymbol}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Price Alerts</h1>
              <p className="page-subtitle">Monitor price thresholds and get notified</p>
            </header>
            <Suspense fallback={<TabLoading />}>
              <AlertsPanel
                onAlertTriggered={(alert) => {
                  addToast(`Alert triggered: ${alert.symbol} ${alert.condition} ${alert.threshold}`, "warning");
                }}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "comparison" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <ComparisonMode />
            </Suspense>
          </div>
        )}

        {activeTab === "risk" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <RiskDashboard
                holdings={portfolioHoldings}
                portfolioValue={portfolioValue}
                marketPrices={marketPrices}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "scheduler" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <RebalanceScheduler
                onRunRebalance={(planName) => {
                  addToast(`Running rebalance for "${planName}"...`, "info");
                  handleNavClick("portfolio");
                }}
                onNavigate={handleNavClick}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "news" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">News & Sentiment</h1>
              <p className="page-subtitle">Market news and sentiment analysis</p>
            </header>
            <Suspense fallback={<TabLoading />}>
              <NewsFeed
                onLogToJournal={async (title, content) => {
                  try {
                    await invokeWithResilience('create_journal_entry', {
                      event_type: 'observation',
                      title,
                      content,
                      plan_version: null,
                      tags: ['news'],
                    });
                    addToast(`Logged "${title}" to journal`, 'success');
                  } catch {
                    addToast('Failed to log to journal', 'error');
                  }
                }}
              />
            </Suspense>
          </div>
        )}


        {activeTab === "settings" && (
          <div className="animate-fade-in">
            <Suspense fallback={<TabLoading />}>
              <SettingsPage />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
