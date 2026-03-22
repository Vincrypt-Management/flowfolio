import { useReducer } from "react";
import type { VibePlan } from "../shared/types";
import type { GeneratedPortfolio } from "../services/portfolioAgent";
import { DEFAULT_SYMBOLS } from "../shared/constants";

// ---------------------------------------------------------------------------
// Local types (mirrored from App.tsx so they live in one shared place)
// ---------------------------------------------------------------------------

export interface ScoringConfig {
  factor_weights: Record<string, number>;
}

export interface SymbolScore {
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

export interface Universe {
  id: string;
  name: string;
  description: string;
  symbols: string[];
  tags: Record<string, string[]>;
  exclude_list: string[];
  created_at: string;
  updated_at: string;
}

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  currentPrice: number;
  value: number;
  weight: number;
}

/** Full holding record — mirrors the Holding interface in PortfolioTab. */
export interface PersistedHolding {
  symbol: string;
  shares: number;
  cost_basis: number;
  current_price: number;
  market_value: number;
  target_pct: number;
  current_pct: number;
  drift_pct: number;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface AppState {
  // App lifecycle / connectivity
  status: string;

  // Vibe plan
  plan: VibePlan | null;

  // Templates
  templates: string[];
  selectedTemplate: string;

  // Navigation
  activeTab: string;

  // Sidebar / mobile
  isSidebarCollapsed: boolean;
  isMobileMenuOpen: boolean;

  // Command palette
  showCommandPalette: boolean;

  // Rankings
  rankingsSymbols: string;
  scores: SymbolScore[];
  isScoring: boolean;
  selectedScore: SymbolScore | null;

  // Universe management
  universes: Universe[];
  selectedUniverse: Universe | null;
  newUniverseName: string;
  newUniverseSymbols: string;

  // Saved plans
  savedPlans: string[];

  // Market overview
  marketPrices: Record<string, number>;
  isLoadingMarket: boolean;

  // Portfolio-to-load (passed from SavedPortfoliosTab → VibeStudio)
  portfolioToLoad: GeneratedPortfolio | null;

  // Analysis tab
  analysisSymbol: string;

  // Real holdings lifted from PortfolioTab (for RiskDashboard)
  portfolioHoldings: PortfolioHolding[];
  portfolioValue: number;

  // Persisted PortfolioTab state so holdings survive tab switches
  portfolioName: string;
  persistedHoldings: PersistedHolding[];
  portfolioCash: number;

  // Onboarding
  onboardingComplete: boolean | null;
}

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PLAN"; payload: VibePlan | null }
  | { type: "SET_TEMPLATES"; payload: string[] }
  | { type: "SET_SELECTED_TEMPLATE"; payload: string }
  | { type: "SET_ACTIVE_TAB"; payload: string }
  | { type: "SET_SIDEBAR_COLLAPSED"; payload: boolean }
  | { type: "SET_MOBILE_MENU_OPEN"; payload: boolean }
  | { type: "SET_SHOW_COMMAND_PALETTE"; payload: boolean }
  | { type: "SET_RANKINGS_SYMBOLS"; payload: string }
  | { type: "SET_SCORES"; payload: SymbolScore[] }
  | { type: "SET_IS_SCORING"; payload: boolean }
  | { type: "SET_SELECTED_SCORE"; payload: SymbolScore | null }
  | { type: "SET_UNIVERSES"; payload: Universe[] }
  | { type: "SET_SELECTED_UNIVERSE"; payload: Universe | null }
  | { type: "SET_NEW_UNIVERSE_NAME"; payload: string }
  | { type: "SET_NEW_UNIVERSE_SYMBOLS"; payload: string }
  | { type: "SET_SAVED_PLANS"; payload: string[] }
  | { type: "SET_MARKET_PRICES"; payload: Record<string, number> }
  | { type: "SET_IS_LOADING_MARKET"; payload: boolean }
  | { type: "SET_PORTFOLIO_TO_LOAD"; payload: GeneratedPortfolio | null }
  | { type: "SET_ANALYSIS_SYMBOL"; payload: string }
  | { type: "SET_PORTFOLIO_HOLDINGS"; payload: PortfolioHolding[] }
  | { type: "SET_PORTFOLIO_VALUE"; payload: number }
  | { type: "SET_PORTFOLIO_NAME"; payload: string }
  | { type: "SET_PERSISTED_HOLDINGS"; payload: PersistedHolding[] }
  | { type: "SET_PORTFOLIO_CASH"; payload: number }
  | { type: "SET_ONBOARDING_COMPLETE"; payload: boolean | null }
  // Compound actions for common multi-field updates
  | {
      type: "SET_PORTFOLIO_HOLDINGS_AND_VALUE";
      payload: { holdings: PortfolioHolding[]; value: number };
    }
  | {
      type: "UNIVERSE_CREATED";
      payload: Universe;
    }
  | {
      type: "UNIVERSE_DELETED";
      payload: string; // universe id
    }
  | {
      type: "SCORES_READY";
      payload: SymbolScore[];
    }
  | {
      type: "NEW_UNIVERSE_FORM_RESET";
    };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: AppState = {
  status: "Initializing...",
  plan: null,
  templates: [],
  selectedTemplate: "",
  activeTab: "dashboard",
  isSidebarCollapsed: false,
  isMobileMenuOpen: false,
  showCommandPalette: false,
  rankingsSymbols: DEFAULT_SYMBOLS.join(","),
  scores: [],
  isScoring: false,
  selectedScore: null,
  universes: [],
  selectedUniverse: null,
  newUniverseName: "",
  newUniverseSymbols: "",
  savedPlans: [],
  marketPrices: {},
  isLoadingMarket: false,
  portfolioToLoad: null,
  analysisSymbol: "",
  portfolioHoldings: [],
  portfolioValue: 0,
  portfolioName: "My Portfolio",
  persistedHoldings: [],
  portfolioCash: 0,
  onboardingComplete: null,
};

// ---------------------------------------------------------------------------
// Reducer (pure – no side effects)
// ---------------------------------------------------------------------------

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.payload };

    case "SET_PLAN":
      return { ...state, plan: action.payload };

    case "SET_TEMPLATES":
      return { ...state, templates: action.payload };

    case "SET_SELECTED_TEMPLATE":
      return { ...state, selectedTemplate: action.payload };

    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };

    case "SET_SIDEBAR_COLLAPSED":
      return { ...state, isSidebarCollapsed: action.payload };

    case "SET_MOBILE_MENU_OPEN":
      return { ...state, isMobileMenuOpen: action.payload };

    case "SET_SHOW_COMMAND_PALETTE":
      return { ...state, showCommandPalette: action.payload };

    case "SET_RANKINGS_SYMBOLS":
      return { ...state, rankingsSymbols: action.payload };

    case "SET_SCORES":
      return { ...state, scores: action.payload };

    case "SET_IS_SCORING":
      return { ...state, isScoring: action.payload };

    case "SET_SELECTED_SCORE":
      return { ...state, selectedScore: action.payload };

    case "SET_UNIVERSES":
      return { ...state, universes: action.payload };

    case "SET_SELECTED_UNIVERSE":
      return { ...state, selectedUniverse: action.payload };

    case "SET_NEW_UNIVERSE_NAME":
      return { ...state, newUniverseName: action.payload };

    case "SET_NEW_UNIVERSE_SYMBOLS":
      return { ...state, newUniverseSymbols: action.payload };

    case "SET_SAVED_PLANS":
      return { ...state, savedPlans: action.payload };

    case "SET_MARKET_PRICES":
      return { ...state, marketPrices: action.payload };

    case "SET_IS_LOADING_MARKET":
      return { ...state, isLoadingMarket: action.payload };

    case "SET_PORTFOLIO_TO_LOAD":
      return { ...state, portfolioToLoad: action.payload };

    case "SET_ANALYSIS_SYMBOL":
      return { ...state, analysisSymbol: action.payload };

    case "SET_PORTFOLIO_HOLDINGS":
      return { ...state, portfolioHoldings: action.payload };

    case "SET_PORTFOLIO_VALUE":
      return { ...state, portfolioValue: action.payload };

    case "SET_PORTFOLIO_NAME":
      return { ...state, portfolioName: action.payload };

    case "SET_PERSISTED_HOLDINGS":
      return { ...state, persistedHoldings: action.payload };

    case "SET_PORTFOLIO_CASH":
      return { ...state, portfolioCash: action.payload };

    case "SET_ONBOARDING_COMPLETE":
      return { ...state, onboardingComplete: action.payload };

    // Compound actions
    case "SET_PORTFOLIO_HOLDINGS_AND_VALUE":
      return {
        ...state,
        portfolioHoldings: action.payload.holdings,
        portfolioValue: action.payload.value,
      };

    case "UNIVERSE_CREATED":
      return {
        ...state,
        universes: [...state.universes, action.payload],
        newUniverseName: "",
        newUniverseSymbols: "",
      };

    case "UNIVERSE_DELETED": {
      const nextSelectedUniverse =
        state.selectedUniverse?.id === action.payload
          ? null
          : state.selectedUniverse;
      return {
        ...state,
        universes: state.universes.filter((u) => u.id !== action.payload),
        selectedUniverse: nextSelectedUniverse,
      };
    }

    case "SCORES_READY":
      return {
        ...state,
        scores: action.payload,
        isScoring: false,
      };

    case "NEW_UNIVERSE_FORM_RESET":
      return { ...state, newUniverseName: "", newUniverseSymbols: "" };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppState(): { state: AppState; dispatch: React.Dispatch<AppAction> } {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return { state, dispatch };
}

// ---------------------------------------------------------------------------
// Convenience action creators
// ---------------------------------------------------------------------------

export const actions = {
  setStatus: (payload: string): AppAction => ({ type: "SET_STATUS", payload }),
  setPlan: (payload: VibePlan | null): AppAction => ({ type: "SET_PLAN", payload }),
  setTemplates: (payload: string[]): AppAction => ({ type: "SET_TEMPLATES", payload }),
  setSelectedTemplate: (payload: string): AppAction => ({ type: "SET_SELECTED_TEMPLATE", payload }),
  setActiveTab: (payload: string): AppAction => ({ type: "SET_ACTIVE_TAB", payload }),
  setSidebarCollapsed: (payload: boolean): AppAction => ({ type: "SET_SIDEBAR_COLLAPSED", payload }),
  setMobileMenuOpen: (payload: boolean): AppAction => ({ type: "SET_MOBILE_MENU_OPEN", payload }),
  setShowCommandPalette: (payload: boolean): AppAction => ({ type: "SET_SHOW_COMMAND_PALETTE", payload }),
  setRankingsSymbols: (payload: string): AppAction => ({ type: "SET_RANKINGS_SYMBOLS", payload }),
  setScores: (payload: SymbolScore[]): AppAction => ({ type: "SET_SCORES", payload }),
  setIsScoring: (payload: boolean): AppAction => ({ type: "SET_IS_SCORING", payload }),
  setSelectedScore: (payload: SymbolScore | null): AppAction => ({ type: "SET_SELECTED_SCORE", payload }),
  setUniverses: (payload: Universe[]): AppAction => ({ type: "SET_UNIVERSES", payload }),
  setSelectedUniverse: (payload: Universe | null): AppAction => ({ type: "SET_SELECTED_UNIVERSE", payload }),
  setNewUniverseName: (payload: string): AppAction => ({ type: "SET_NEW_UNIVERSE_NAME", payload }),
  setNewUniverseSymbols: (payload: string): AppAction => ({ type: "SET_NEW_UNIVERSE_SYMBOLS", payload }),
  setSavedPlans: (payload: string[]): AppAction => ({ type: "SET_SAVED_PLANS", payload }),
  setMarketPrices: (payload: Record<string, number>): AppAction => ({ type: "SET_MARKET_PRICES", payload }),
  setIsLoadingMarket: (payload: boolean): AppAction => ({ type: "SET_IS_LOADING_MARKET", payload }),
  setPortfolioToLoad: (payload: GeneratedPortfolio | null): AppAction => ({ type: "SET_PORTFOLIO_TO_LOAD", payload }),
  setAnalysisSymbol: (payload: string): AppAction => ({ type: "SET_ANALYSIS_SYMBOL", payload }),
  setPortfolioHoldings: (payload: PortfolioHolding[]): AppAction => ({ type: "SET_PORTFOLIO_HOLDINGS", payload }),
  setPortfolioValue: (payload: number): AppAction => ({ type: "SET_PORTFOLIO_VALUE", payload }),
  setPortfolioName: (payload: string): AppAction => ({ type: "SET_PORTFOLIO_NAME", payload }),
  setPersistedHoldings: (payload: PersistedHolding[]): AppAction => ({ type: "SET_PERSISTED_HOLDINGS", payload }),
  setPortfolioCash: (payload: number): AppAction => ({ type: "SET_PORTFOLIO_CASH", payload }),
  setOnboardingComplete: (payload: boolean | null): AppAction => ({ type: "SET_ONBOARDING_COMPLETE", payload }),
  setPortfolioHoldingsAndValue: (holdings: PortfolioHolding[], value: number): AppAction => ({
    type: "SET_PORTFOLIO_HOLDINGS_AND_VALUE",
    payload: { holdings, value },
  }),
  universeCreated: (universe: Universe): AppAction => ({ type: "UNIVERSE_CREATED", payload: universe }),
  universeDeleted: (id: string): AppAction => ({ type: "UNIVERSE_DELETED", payload: id }),
  scoresReady: (scores: SymbolScore[]): AppAction => ({ type: "SCORES_READY", payload: scores }),
  newUniverseFormReset: (): AppAction => ({ type: "NEW_UNIVERSE_FORM_RESET" }),
} as const;
