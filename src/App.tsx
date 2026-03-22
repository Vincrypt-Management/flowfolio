import { useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useIsMounted } from './hooks/useIsMounted';
import { isTauriContext } from './services/tauri';
import { useAuth } from './contexts/AuthContext';
import { invokeWithResilience } from './services/apiClient';
import VibeStudio from "./components/VibeStudio";
import { ThemeToggle } from "./components/ThemeToggle";
import { useToast } from "./components/Toast";
import { logger } from "./core/logger";
import { VibePlan } from "./shared/types";
import { DEFAULT_SYMBOLS } from "./shared/constants";
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { useSidebarTooltips, SidebarTooltip } from './features/onboarding/SidebarTooltips';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import type { Command } from './components/CommandPalette';
import { TemplatesTab } from './features/templates/TemplatesTab';
import { RankingsTab } from './features/rankings/RankingsTab';
import { UniverseTab } from './features/universe/UniverseTab';
import { saveFile } from "./shared/utils/fileSystem";
import { useUserMode } from "./contexts/UserModeContext";
import { useAppState, actions } from "./hooks/useAppState";
import type { Universe, SymbolScore, ScoringConfig } from "./hooks/useAppState";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  Database,
  PieChart,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FlaskConical,
  BookOpen,
  Globe,
  Save,
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
import { RateLimitBanner } from "./components/RateLimitBanner";
import { TabErrorBoundary } from "./components/TabErrorBoundary";

function TabLoading() {
  return (
    <div className="tab-loading" role="status" aria-label="Loading content">
      <div className="tab-loading-spinner" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function App() {
  const { addToast } = useToast();
  const { isAdvanced, toggleMode } = useUserMode();
  const { handleOAuthCallback } = useAuth();
  const { state, dispatch } = useAppState();

  const { isShown: isTooltipShown, dismiss: dismissTooltip, getContent: getTooltipContent } =
    useSidebarTooltips(!!state.onboardingComplete);

  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: 'onboarding_complete' })
      .then(val => dispatch(actions.setOnboardingComplete(val === 'true')))
      .catch(() => dispatch(actions.setOnboardingComplete(true)));
  }, [dispatch]);

  const isMountedRef = useIsMounted();

  // Hidden file input for "Import Data" command palette action
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkHealth();
    loadTemplates();
    loadDefaultPlan();
    loadUniverses();
    loadSavedPlans();
    loadMarketOverview();
  }, []);

  async function checkHealth() {
    try {
      const health = await invokeWithResilience<string>("health_check");
      if (isMountedRef.current) {
        dispatch(actions.setStatus(health));
      }
    } catch (error) {
      if (isMountedRef.current) {
        dispatch(actions.setStatus("Error: " + (error instanceof Error ? error.message : String(error))));
      }
    }
  }

  async function loadTemplates() {
    try {
      const templateList = await invokeWithResilience<string[]>("list_templates");
      if (isMountedRef.current) {
        dispatch(actions.setTemplates(templateList));
      }
    } catch (error) {
      logger.error("Failed to load templates:", error);
    }
  }

  async function loadDefaultPlan() {
    try {
      const defaultPlan = await invokeWithResilience<VibePlan>("get_default_plan");
      if (isMountedRef.current) {
        dispatch(actions.setPlan(defaultPlan));
      }
    } catch (error) {
      logger.error("Failed to load default plan:", error);
    }
  }

  async function loadUniverses() {
    try {
      const universeList = await invokeWithResilience<Universe[]>("list_universes");
      if (isMountedRef.current) {
        dispatch(actions.setUniverses(universeList));
      }
    } catch (error) {
      logger.error("Failed to load universes:", error);
    }
  }

  async function loadSavedPlans() {
    try {
      const plans = await invokeWithResilience<string[]>("list_saved_plans");
      if (isMountedRef.current) {
        dispatch(actions.setSavedPlans(plans));
      }
    } catch (error) {
      logger.error("Failed to load saved plans:", error);
    }
  }

  const loadMarketOverview = useCallback(async () => {
    if (isMountedRef.current) {
      dispatch(actions.setIsLoadingMarket(true));
    }
    try {
      const prices = await invokeWithResilience<Record<string, number>>("get_current_prices_batch", { symbols: DEFAULT_SYMBOLS });
      if (isMountedRef.current) {
        dispatch(actions.setMarketPrices(prices));
      }
    } catch (error) {
      logger.error("Failed to load market prices:", error);
    } finally {
      if (isMountedRef.current) {
        dispatch(actions.setIsLoadingMarket(false));
      }
    }
  }, [dispatch]);

  const createUniverse = useCallback(async () => {
    if (!state.newUniverseName.trim()) {
      addToast("Please enter a universe name", "warning");
      return;
    }

    try {
      const symbols = state.newUniverseSymbols.split(",").map(s => s.trim().toUpperCase()).filter(s => s);
      const universe = await invokeWithResilience<Universe>("create_universe", {
        name: state.newUniverseName,
        description: `Universe created on ${new Date().toLocaleDateString()}`,
        symbols
      });
      if (isMountedRef.current) {
        dispatch(actions.universeCreated(universe));
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error creating universe: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [state.newUniverseName, state.newUniverseSymbols, dispatch, addToast]);

  const deleteUniverse = useCallback(async (id: string) => {
    try {
      await invokeWithResilience("delete_universe", { id });
      if (isMountedRef.current) {
        dispatch(actions.universeDeleted(id));
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error deleting universe: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [dispatch, addToast]);

  const savePlan = useCallback(async () => {
    if (!state.plan) {
      addToast("No plan to save", "warning");
      return;
    }

    try {
      await invokeWithResilience("save_plan", { plan: state.plan });
      await loadSavedPlans();
      if (isMountedRef.current) {
        addToast("Plan saved successfully!", "success");
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error saving plan: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [state.plan, addToast]);

  const exportData = useCallback(async () => {
    try {
      const bundleJson = await invokeWithResilience<string>("export_data_bundle", {
        plan: state.plan,
        journalEntries: []
      });

      const filename = `flowfolio-export-${new Date().toISOString().split("T")[0]}.json`;
      await saveFile(bundleJson, filename, "application/json");
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error exporting data: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [state.plan, addToast]);

  const importData = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await invokeWithResilience<{ success: boolean }>("import_data_bundle", { bundleJson: text });
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
      const template = await invokeWithResilience<VibePlan>("get_template", { name: templateName });
      if (isMountedRef.current) {
        dispatch(actions.setPlan(template));
        dispatch(actions.setSelectedTemplate(templateName));
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error loading template: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [dispatch, addToast]);

  const scoreSymbols = useCallback(async () => {
    if (!state.plan) {
      addToast('Please select a plan first', 'warning');
      return;
    }

    dispatch(actions.setIsScoring(true));
    dispatch(actions.setScores([]));

    try {
      const symbolsList = state.rankingsSymbols.split(',').map(s => s.trim()).filter(s => s);

      const config = await invokeWithResilience<ScoringConfig>('get_scoring_config', { plan: state.plan });
      const results = await invokeWithResilience<SymbolScore[]>('score_symbols_batch', {
        symbols: symbolsList,
        config,
      });

      results.sort((a, b) => b.total_score - a.total_score);
      if (isMountedRef.current) {
        dispatch(actions.scoresReady(results));
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast('Error scoring symbols: ' + (error instanceof Error ? error.message : String(error)), 'error');
      }
    } finally {
      if (isMountedRef.current) {
        dispatch(actions.setIsScoring(false));
      }
    }
  }, [state.plan, state.rankingsSymbols, dispatch, addToast]);

  const loadPlan = useCallback(async (planName: string) => {
    try {
      const loadedPlan = await invokeWithResilience<VibePlan>("load_plan", { name: planName });
      if (isMountedRef.current) {
        dispatch(actions.setPlan(loadedPlan));
        addToast("Plan loaded successfully!", "success");
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error loading plan: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    }
  }, [dispatch, addToast]);

  const useUniverseInRankings = useCallback((universe: { id: string; symbols: string[] }) => {
    dispatch(actions.setSelectedUniverse(universe as Universe));
    dispatch(actions.setRankingsSymbols(universe.symbols.join(", ")));
  }, [dispatch]);

  const handleNavClick = useCallback((tab: string, data?: Record<string, unknown>) => {
    // WatchlistTab calls onNavigate('ticker-analysis', { symbol }) — map to our tab key
    const resolvedTab = tab === 'ticker-analysis' ? 'analysis' : tab;
    if (resolvedTab === 'analysis' && typeof data?.symbol === 'string') {
      dispatch(actions.setAnalysisSymbol(data.symbol));
    }
    dispatch(actions.setActiveTab(resolvedTab));
    dispatch(actions.setMobileMenuOpen(false));
  }, [dispatch]);

  const commandPaletteCommands: Command[] = useMemo<Command[]>(() => [
    // Navigation commands
    { id: 'nav-dashboard',        label: 'Go to Dashboard',        category: 'navigation', shortcut: 'Cmd+1', action: () => handleNavClick('dashboard') },
    { id: 'nav-vibe-studio',      label: 'Go to Vibe Studio',      category: 'navigation', shortcut: 'Cmd+2', action: () => handleNavClick('vibe-studio') },
    { id: 'nav-portfolio',        label: 'Go to Portfolio',         category: 'navigation', shortcut: 'Cmd+3', action: () => handleNavClick('portfolio') },
    { id: 'nav-backtest',         label: 'Go to Backtest',          category: 'navigation', shortcut: 'Cmd+4', action: () => handleNavClick('backtest') },
    { id: 'nav-journal',          label: 'Go to Journal',           category: 'navigation', shortcut: 'Cmd+5', action: () => handleNavClick('journal') },
    { id: 'nav-watchlist',        label: 'Go to Watchlist',         category: 'navigation', shortcut: 'Cmd+6', action: () => handleNavClick('watchlist') },
    { id: 'nav-settings',         label: 'Go to Settings',          category: 'navigation', shortcut: 'Cmd+7', action: () => handleNavClick('settings') },
    { id: 'nav-saved-portfolios', label: 'Go to Saved Portfolios',  category: 'navigation', action: () => handleNavClick('saved-portfolios') },
    { id: 'nav-templates',        label: 'Go to Templates',         category: 'navigation', action: () => handleNavClick('templates') },
    { id: 'nav-rankings',         label: 'Go to Rankings',          category: 'navigation', action: () => handleNavClick('rankings') },
    { id: 'nav-yearly-review',    label: 'Go to Yearly Review',     category: 'navigation', action: () => handleNavClick('yearly-review') },
    { id: 'nav-universe',         label: 'Go to Universe',          category: 'navigation', action: () => handleNavClick('universe') },
    { id: 'nav-analysis',         label: 'Go to Analysis',          category: 'navigation', action: () => handleNavClick('analysis') },
    { id: 'nav-alerts',           label: 'Go to Alerts',            category: 'navigation', action: () => handleNavClick('alerts') },
    { id: 'nav-comparison',       label: 'Go to Comparison',        category: 'navigation', action: () => handleNavClick('comparison') },
    { id: 'nav-risk',             label: 'Go to Risk Dashboard',    category: 'navigation', action: () => handleNavClick('risk') },
    { id: 'nav-scheduler',        label: 'Go to Scheduler',         category: 'navigation', action: () => handleNavClick('scheduler') },
    { id: 'nav-news',             label: 'Go to News',              category: 'navigation', action: () => handleNavClick('news') },
    { id: 'nav-data',             label: 'Go to Data Sources',      category: 'navigation', action: () => handleNavClick('data') },
    // Action commands
    { id: 'action-export',        label: 'Export Data',             category: 'action', action: () => { exportData(); } },
    { id: 'action-import',        label: 'Import Data',             category: 'action', action: () => { importFileRef.current?.click(); } },
  ], [handleNavClick, exportData]);

  useKeyboardShortcuts({
    'mod+k': () => dispatch(actions.setShowCommandPalette(true)),
    'mod+1': () => handleNavClick('dashboard'),
    'mod+2': () => handleNavClick('vibe-studio'),
    'mod+3': () => handleNavClick('portfolio'),
    'mod+4': () => handleNavClick('backtest'),
    'mod+5': () => handleNavClick('journal'),
    'mod+6': () => handleNavClick('watchlist'),
    'mod+7': () => handleNavClick('settings'),
    'escape': () => dispatch(actions.setShowCommandPalette(false)),
  });

  // Handle deep-link OAuth callback (flowfolio://auth/callback?access_token=...&refresh_token=...)
  useEffect(() => {
    if (!isTauriContext()) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;
    import('@tauri-apps/plugin-deep-link').then(({ onOpenUrl }) => {
      onOpenUrl(async (urls) => {
        for (const url of urls) {
          if (url.startsWith('flowfolio://auth/callback')) {
            await handleOAuthCallback(url);
            addToast('Logged in successfully!', 'success');
          }
        }
      }).then(fn => {
        if (mounted) unlisten = fn;
        else fn();
      });
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [handleOAuthCallback, addToast]);

  const renderSidebar = () => (
    <aside
      className={`sidebar ${state.isSidebarCollapsed ? "collapsed" : ""} ${state.isMobileMenuOpen ? "mobile-open" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon-wrapper">
            <img src="/logo.png" alt="FlowFolio" className="logo-image" />
          </div>
          {!state.isSidebarCollapsed && <span className="logo-text">FlowFolio</span>}
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => dispatch(actions.setSidebarCollapsed(!state.isSidebarCollapsed))}
          aria-label={state.isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {state.isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="nav-menu" role="menubar" aria-label="Application sections">
        <div style={{ position: 'relative' }}>
          <button
            className={`nav-item ${state.activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => handleNavClick("dashboard")}
            title={state.isSidebarCollapsed ? "Dashboard" : ""}
            role="menuitem"
            aria-current={state.activeTab === "dashboard" ? "page" : undefined}
          >
            <LayoutDashboard className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Dashboard</span>}
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
            className={`nav-item ${state.activeTab === "vibe-studio" ? "active" : ""}`}
            onClick={() => handleNavClick("vibe-studio")}
            title={state.isSidebarCollapsed ? "Vibe Studio" : ""}
            role="menuitem"
            aria-current={state.activeTab === "vibe-studio" ? "page" : undefined}
          >
            <Sparkles className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Vibe Studio</span>}
          </button>
          <SidebarTooltip
            tab="vibe_studio"
            isShown={isTooltipShown('vibe_studio')}
            content={getTooltipContent('vibe_studio')}
            onDismiss={dismissTooltip}
          />
        </div>
        <button
          className={`nav-item ${state.activeTab === "saved-portfolios" ? "active" : ""}`}
          onClick={() => handleNavClick("saved-portfolios")}
          title={state.isSidebarCollapsed ? "Saved Portfolios" : ""}
          role="menuitem"
          aria-current={state.activeTab === "saved-portfolios" ? "page" : undefined}
        >
          <Save className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Saved Portfolios</span>}
        </button>
        {isAdvanced && (
        <div style={{ position: 'relative' }}>
          <button
            className={`nav-item ${state.activeTab === "templates" ? "active" : ""}`}
            onClick={() => handleNavClick("templates")}
            title={state.isSidebarCollapsed ? "Templates" : ""}
            role="menuitem"
            aria-current={state.activeTab === "templates" ? "page" : undefined}
          >
            <FileText className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Templates</span>}
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
            className={`nav-item ${state.activeTab === "rankings" ? "active" : ""}`}
            onClick={() => handleNavClick("rankings")}
            title={state.isSidebarCollapsed ? "Rankings" : ""}
            role="menuitem"
            aria-current={state.activeTab === "rankings" ? "page" : undefined}
          >
            <TrendingUp className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Rankings</span>}
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
            className={`nav-item ${state.activeTab === "portfolio" ? "active" : ""}`}
            onClick={() => handleNavClick("portfolio")}
            title={state.isSidebarCollapsed ? "Portfolio" : ""}
            role="menuitem"
            aria-current={state.activeTab === "portfolio" ? "page" : undefined}
          >
            <PieChart className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Portfolio</span>}
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
            className={`nav-item ${state.activeTab === "backtest" ? "active" : ""}`}
            onClick={() => handleNavClick("backtest")}
            title={state.isSidebarCollapsed ? "Backtest" : ""}
            role="menuitem"
            aria-current={state.activeTab === "backtest" ? "page" : undefined}
          >
            <FlaskConical className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Backtest</span>}
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
            className={`nav-item ${state.activeTab === "journal" ? "active" : ""}`}
            onClick={() => handleNavClick("journal")}
            title={state.isSidebarCollapsed ? "Journal" : ""}
            role="menuitem"
            aria-current={state.activeTab === "journal" ? "page" : undefined}
          >
            <BookOpen className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Journal</span>}
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
            className={`nav-item ${state.activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => handleNavClick("watchlist")}
            title={state.isSidebarCollapsed ? "Watchlist" : ""}
            role="menuitem"
            aria-current={state.activeTab === "watchlist" ? "page" : undefined}
          >
            <Eye className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Watchlist</span>}
          </button>
          <SidebarTooltip
            tab="watchlist"
            isShown={isTooltipShown('watchlist')}
            content={getTooltipContent('watchlist')}
            onDismiss={dismissTooltip}
          />
        </div>
        <button
          className={`nav-item ${state.activeTab === "analysis" ? "active" : ""}`}
          onClick={() => handleNavClick("analysis")}
          title={state.isSidebarCollapsed ? "Analysis" : ""}
          role="menuitem"
          aria-current={state.activeTab === "analysis" ? "page" : undefined}
        >
          <TrendingUp className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Analysis</span>}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={`nav-item ${state.activeTab === "alerts" ? "active" : ""}`}
            onClick={() => handleNavClick("alerts")}
            title={state.isSidebarCollapsed ? "Alerts" : ""}
            role="menuitem"
            aria-current={state.activeTab === "alerts" ? "page" : undefined}
          >
            <Bell className="nav-icon" size={20} />
            {!state.isSidebarCollapsed && <span>Alerts</span>}
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
          className={`nav-item ${state.activeTab === "comparison" ? "active" : ""}`}
          onClick={() => handleNavClick("comparison")}
          title={state.isSidebarCollapsed ? "Compare" : ""}
          role="menuitem"
          aria-current={state.activeTab === "comparison" ? "page" : undefined}
        >
          <GitCompare className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Compare</span>}
        </button>
        )}
        {isAdvanced && (
        <button
          className={`nav-item ${state.activeTab === "risk" ? "active" : ""}`}
          onClick={() => handleNavClick("risk")}
          title={state.isSidebarCollapsed ? "Risk" : ""}
          role="menuitem"
          aria-current={state.activeTab === "risk" ? "page" : undefined}
        >
          <Shield className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Risk</span>}
        </button>
        )}
        {isAdvanced && (
        <button
          className={`nav-item ${state.activeTab === "scheduler" ? "active" : ""}`}
          onClick={() => handleNavClick("scheduler")}
          title={state.isSidebarCollapsed ? "Scheduler" : ""}
          role="menuitem"
          aria-current={state.activeTab === "scheduler" ? "page" : undefined}
        >
          <Clock className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Scheduler</span>}
        </button>
        )}
        <button
          className={`nav-item ${state.activeTab === "news" ? "active" : ""}`}
          onClick={() => handleNavClick("news")}
          title={state.isSidebarCollapsed ? "News" : ""}
          role="menuitem"
          aria-current={state.activeTab === "news" ? "page" : undefined}
        >
          <Newspaper className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>News</span>}
        </button>
        <button
          className={`nav-item ${state.activeTab === "yearly-review" ? "active" : ""}`}
          onClick={() => handleNavClick("yearly-review")}
          title={state.isSidebarCollapsed ? "Yearly Review" : ""}
          role="menuitem"
          aria-current={state.activeTab === "yearly-review" ? "page" : undefined}
        >
          <ClipboardCheck className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Yearly Review</span>}
        </button>
        {isAdvanced && (
        <button
          className={`nav-item ${state.activeTab === "universe" ? "active" : ""}`}
          onClick={() => handleNavClick("universe")}
          title={state.isSidebarCollapsed ? "Universe" : ""}
          role="menuitem"
          aria-current={state.activeTab === "universe" ? "page" : undefined}
        >
          <Globe className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Universe</span>}
        </button>
        )}
        {isAdvanced && (
        <button
          className={`nav-item ${state.activeTab === "data" ? "active" : ""}`}
          onClick={() => handleNavClick("data")}
          title={state.isSidebarCollapsed ? "Data Sources" : ""}
          role="menuitem"
          aria-current={state.activeTab === "data" ? "page" : undefined}
        >
          <Database className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Data Sources</span>}
        </button>
        )}
        <button
          className={`nav-item ${state.activeTab === "settings" ? "active" : ""}`}
          onClick={() => handleNavClick("settings")}
          title={state.isSidebarCollapsed ? "Settings" : ""}
          role="menuitem"
          aria-current={state.activeTab === "settings" ? "page" : undefined}
        >
          <Settings className="nav-icon" size={20} />
          {!state.isSidebarCollapsed && <span>Settings</span>}
        </button>
      </nav>

      <div className="sidebar-footer">
        <UserProfileCard
          collapsed={state.isSidebarCollapsed}
          onSettingsClick={() => handleNavClick("settings")}
        />
        <button
          className={`mode-toggle ${state.isSidebarCollapsed ? "collapsed" : ""}`}
          onClick={toggleMode}
          aria-label={isAdvanced ? "Switch to Simple mode" : "Switch to Advanced mode"}
          title={state.isSidebarCollapsed ? (isAdvanced ? "Advanced Mode" : "Simple Mode") : ""}
        >
          {isAdvanced ? <ToggleRight className="mode-toggle-icon active" size={20} /> : <ToggleLeft className="mode-toggle-icon" size={20} />}
          {!state.isSidebarCollapsed && (
            <span className="mode-toggle-label">
              {isAdvanced ? "Advanced" : "Simple"}
            </span>
          )}
        </button>
        <ThemeToggle compact={state.isSidebarCollapsed} />
        <div className={`status-badge ${state.isSidebarCollapsed ? "collapsed" : ""}`}>
          <div className={`status-dot ${state.status.includes("running") || state.status === "Healthy" ? "online" : "offline"}`}></div>
          {!state.isSidebarCollapsed && <span>{state.status.includes("running") || state.status === "Healthy" ? "System Online" : state.status}</span>}
        </div>
      </div>
    </aside>
  );


  const handleHoldingsChange = useCallback((
    h: Array<{ symbol: string; shares: number; currentPrice: number; value: number; weight: number }>,
    v: number
  ) => {
    dispatch(actions.setPortfolioHoldingsAndValue(h, v));
  }, [dispatch]);

  const handlePortfolioChange = useCallback((
    holdings: Array<{
      symbol: string; shares: number; cost_basis: number; current_price: number;
      market_value: number; target_pct: number; current_pct: number; drift_pct: number;
    }>,
    cash: number
  ) => {
    dispatch(actions.setPersistedHoldings(holdings));
    dispatch(actions.setPortfolioCash(cash));
  }, [dispatch]);

  const handlePortfolioNameChange = useCallback((name: string) => {
    dispatch(actions.setPortfolioName(name));
  }, [dispatch]);

  if (state.onboardingComplete === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="tab-loading-spinner" />
    </div>;
  }

  if (!state.onboardingComplete) {
    return <OnboardingWizard onComplete={() => dispatch(actions.setOnboardingComplete(true))} />;
  }

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-nav">Skip to main content</a>

      <button
        className="mobile-menu-btn"
        onClick={() => dispatch(actions.setMobileMenuOpen(!state.isMobileMenuOpen))}
        aria-label={state.isMobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={state.isMobileMenuOpen}
      >
        {state.isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div
        className={`sidebar-overlay ${state.isMobileMenuOpen ? "visible" : ""}`}
        onClick={() => dispatch(actions.setMobileMenuOpen(false))}
        aria-hidden="true"
      />

      <CommandPalette
        isOpen={state.showCommandPalette}
        onClose={() => dispatch(actions.setShowCommandPalette(false))}
        commands={commandPaletteCommands}
      />

      {/* Hidden file input for Import Data command palette action */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={importData}
        aria-hidden="true"
      />

      {renderSidebar()}

      <main id="main-content" className="main-content" role="main">
        <RateLimitBanner />
        {state.activeTab === "dashboard" && (
          <TabErrorBoundary tabName="Dashboard">
            <div className="animate-fade-in">
              <Dashboard
                plan={state.plan}
                onNavigate={handleNavClick}
                marketPrices={state.marketPrices}
                onRefreshMarket={loadMarketOverview}
                isLoadingMarket={state.isLoadingMarket}
              />
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "vibe-studio" && (
          <TabErrorBoundary tabName="Vibe Studio">
            <div className="animate-fade-in">
              <VibeStudio
                initialPortfolio={state.portfolioToLoad}
                onPortfolioLoaded={() => dispatch(actions.setPortfolioToLoad(null))}
              />
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "saved-portfolios" && (
          <TabErrorBoundary tabName="Saved Portfolios">
            <Suspense fallback={<TabLoading />}>
              <SavedPortfoliosTab onLoadPortfolio={(portfolio) => {
                dispatch(actions.setPortfolioToLoad(portfolio));
                dispatch(actions.setActiveTab("vibe-studio"));
              }} />
            </Suspense>
          </TabErrorBoundary>
        )}

        {state.activeTab === "templates" && (
          <TabErrorBoundary tabName="Templates">
            <TemplatesTab
              templates={state.templates}
              selectedTemplate={state.selectedTemplate}
              plan={state.plan}
              onLoadTemplate={loadTemplate}
              onNavigateToDashboard={() => dispatch(actions.setActiveTab("dashboard"))}
            />
          </TabErrorBoundary>
        )}

        {state.activeTab === "data" && (
          <TabErrorBoundary tabName="Data Sources">
            <Suspense fallback={<TabLoading />}>
              <DataSourcesPage />
            </Suspense>
          </TabErrorBoundary>
        )}

        {state.activeTab === "rankings" && (
          <TabErrorBoundary tabName="Rankings">
            <RankingsTab
              plan={state.plan}
              rankingsSymbols={state.rankingsSymbols}
              onSymbolsChange={(v) => dispatch(actions.setRankingsSymbols(v))}
              scores={state.scores}
              isScoring={state.isScoring}
              selectedScore={state.selectedScore}
              onSelectScore={(v) => dispatch(actions.setSelectedScore(v))}
              onScoreSymbols={scoreSymbols}
            />
          </TabErrorBoundary>
        )}

        {state.activeTab === "portfolio" && (
          <TabErrorBoundary tabName="Portfolio">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <PortfolioTab
                  onHoldingsChange={handleHoldingsChange}
                  onPortfolioChange={handlePortfolioChange}
                  onPortfolioNameChange={handlePortfolioNameChange}
                  initialPortfolioName={state.portfolioName}
                  initialHoldings={state.persistedHoldings}
                  initialCash={state.portfolioCash}
                  onAnalyze={(symbol) => {
                    dispatch(actions.setAnalysisSymbol(symbol));
                    handleNavClick('analysis');
                  }}
                />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "backtest" && (
          <TabErrorBoundary tabName="Backtest">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <BacktestTab />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "journal" && (
          <TabErrorBoundary tabName="Journal">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <JournalTab />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "yearly-review" && (
          <TabErrorBoundary tabName="Yearly Review">
            <div className="animate-fade-in">
              <header className="page-header">
                <h1 className="page-title">Yearly Review</h1>
                <p className="page-subtitle">Comprehensive annual strategy and portfolio review checklist</p>
              </header>
              <Suspense fallback={<TabLoading />}>
                <YearlyReviewComponent portfolioName={state.plan?.name || "My Portfolio"} />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "universe" && (
          <TabErrorBoundary tabName="Universe">
            <UniverseTab
              universes={state.universes}
              newUniverseName={state.newUniverseName}
              onNewUniverseNameChange={(v) => dispatch(actions.setNewUniverseName(v))}
              newUniverseSymbols={state.newUniverseSymbols}
              onNewUniverseSymbolsChange={(v) => dispatch(actions.setNewUniverseSymbols(v))}
              onCreateUniverse={createUniverse}
              onDeleteUniverse={deleteUniverse}
              selectedUniverse={state.selectedUniverse}
              onSelectUniverse={(v) => dispatch(actions.setSelectedUniverse(v))}
              onUseInRankings={useUniverseInRankings}
              savedPlans={state.savedPlans}
              plan={state.plan}
              onSavePlan={savePlan}
              onExportData={exportData}
              onImportData={importData}
              onLoadPlan={loadPlan}
              onAddToast={addToast}
            />
          </TabErrorBoundary>
        )}

        {state.activeTab === "watchlist" && (
          <TabErrorBoundary tabName="Watchlist">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <WatchlistTab onNavigate={handleNavClick} />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === 'analysis' && (
          <TabErrorBoundary tabName="Analysis">
            <div className="animate-fade-in">
              <header className="page-header">
                <h1 className="page-title">Ticker Analysis</h1>
                <p className="page-subtitle">Deep-dive analysis for any symbol</p>
              </header>
              <Suspense fallback={<TabLoading />}>
                <TickerAnalysis
                  symbol={state.analysisSymbol}
                  onClose={() => {}}
                  inline={true}
                  onTickerChange={(v) => dispatch(actions.setAnalysisSymbol(v))}
                />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "alerts" && (
          <TabErrorBoundary tabName="Alerts">
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
          </TabErrorBoundary>
        )}

        {state.activeTab === "comparison" && (
          <TabErrorBoundary tabName="Comparison">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <ComparisonMode />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "risk" && (
          <TabErrorBoundary tabName="Risk Dashboard">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <RiskDashboard
                  holdings={state.portfolioHoldings}
                  portfolioValue={state.portfolioValue}
                  marketPrices={state.marketPrices}
                />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}

        {state.activeTab === "scheduler" && (
          <TabErrorBoundary tabName="Scheduler">
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
          </TabErrorBoundary>
        )}

        {state.activeTab === "news" && (
          <TabErrorBoundary tabName="News">
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
          </TabErrorBoundary>
        )}


        {state.activeTab === "settings" && (
          <TabErrorBoundary tabName="Settings">
            <div className="animate-fade-in">
              <Suspense fallback={<TabLoading />}>
                <SettingsPage />
              </Suspense>
            </div>
          </TabErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default App;
