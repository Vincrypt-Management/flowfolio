import { useReducer, useRef, useEffect, useMemo, memo } from "react";
import { useIsMounted } from '../hooks/useIsMounted';
import { saveFile } from '../shared/utils/fileSystem';
import { portfolioAgent, GeneratedPortfolio } from "../services/portfolioAgent";
import { OpenRouterMessage, streamChat } from "../services/openrouter";
import { chatHistoryService, Conversation } from "../services/chatHistory";
import { invokeWithResilience } from "../services/apiClient";
import { exportPortfolioToPdf } from "../services/pdfService";
import { logger } from "../core/logger";
import { useToast } from "./Toast";
import { useUserMode } from '../contexts/UserModeContext';
import { PremiumGate } from './PremiumGate';
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
  Gauge,
  FileText,
  Save,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Eye,
  Share2
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
import TickerAnalysis from "./TickerAnalysis";
import { PrivacyDisclosure } from "./PrivacyDisclosure";
import { StrategyShareCard } from "./StrategyShareCard";
import "./VibeStudio.css";

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

// --- VibeStudio useReducer ---

interface VibeStudioState {
  prompt: string;
  isGenerating: boolean;
  generatedPortfolio: GeneratedPortfolio | null;
  error: string | null;
  chatMode: boolean;
  chatHistory: OpenRouterMessage[];
  chatInput: string;
  isChatting: boolean;
  progressSteps: ProgressStep[];
  streamingMessage: string;
  showQuantDashboard: boolean;
  isExportingPDF: boolean;
  currentConversationId: string | null;
  savedConversations: Conversation[];
  showChatHistory: boolean;
  isSaving: boolean;
  showShareCard: boolean;
  aiPrivacyAccepted: boolean;
  showPrivacyDisclosure: boolean;
}

type VibeStudioAction =
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_IS_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATED_PORTFOLIO'; payload: GeneratedPortfolio | null }
  | { type: 'MERGE_GENERATED_PORTFOLIO'; payload: Partial<GeneratedPortfolio> }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CHAT_MODE'; payload: boolean }
  | { type: 'SET_CHAT_HISTORY'; payload: OpenRouterMessage[] }
  | { type: 'SET_CHAT_INPUT'; payload: string }
  | { type: 'SET_IS_CHATTING'; payload: boolean }
  | { type: 'SET_PROGRESS_STEPS'; payload: ProgressStep[] }
  | { type: 'UPDATE_PROGRESS_STEP'; payload: { stepId: string; message: string; isCompleted: boolean } }
  | { type: 'COMPLETE_ALL_PROGRESS_STEPS' }
  | { type: 'ERROR_ACTIVE_PROGRESS_STEPS' }
  | { type: 'SET_STREAMING_MESSAGE'; payload: string }
  | { type: 'APPEND_STREAMING_MESSAGE'; payload: string }
  | { type: 'SET_SHOW_QUANT_DASHBOARD'; payload: boolean }
  | { type: 'SET_IS_EXPORTING_PDF'; payload: boolean }
  | { type: 'SET_CURRENT_CONVERSATION_ID'; payload: string | null }
  | { type: 'SET_SAVED_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'SET_SHOW_CHAT_HISTORY'; payload: boolean }
  | { type: 'SET_IS_SAVING'; payload: boolean }
  | { type: 'SET_SHOW_SHARE_CARD'; payload: boolean }
  | { type: 'SET_AI_PRIVACY_ACCEPTED'; payload: boolean }
  | { type: 'SET_SHOW_PRIVACY_DISCLOSURE'; payload: boolean }
  | { type: 'RESET' };

const initialVibeStudioState: VibeStudioState = {
  prompt: '',
  isGenerating: false,
  generatedPortfolio: null,
  error: null,
  chatMode: false,
  chatHistory: [],
  chatInput: '',
  isChatting: false,
  progressSteps: [],
  streamingMessage: '',
  showQuantDashboard: true,
  isExportingPDF: false,
  currentConversationId: null,
  savedConversations: [],
  showChatHistory: false,
  isSaving: false,
  showShareCard: false,
  aiPrivacyAccepted: false,
  showPrivacyDisclosure: false,
};

function vibeStudioReducer(state: VibeStudioState, action: VibeStudioAction): VibeStudioState {
  switch (action.type) {
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload };
    case 'SET_IS_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATED_PORTFOLIO':
      return { ...state, generatedPortfolio: action.payload };
    case 'MERGE_GENERATED_PORTFOLIO':
      return {
        ...state,
        generatedPortfolio: state.generatedPortfolio
          ? { ...state.generatedPortfolio, ...action.payload }
          : action.payload as GeneratedPortfolio,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_CHAT_MODE':
      return { ...state, chatMode: action.payload };
    case 'SET_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload };
    case 'SET_CHAT_INPUT':
      return { ...state, chatInput: action.payload };
    case 'SET_IS_CHATTING':
      return { ...state, isChatting: action.payload };
    case 'SET_PROGRESS_STEPS':
      return { ...state, progressSteps: action.payload };
    case 'UPDATE_PROGRESS_STEP': {
      const { stepId, message, isCompleted } = action.payload;
      const existingIndex = state.progressSteps.findIndex(s => s.id === stepId);
      if (existingIndex >= 0) {
        const updated = [...state.progressSteps];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status: isCompleted ? 'completed' : 'active',
          message,
        };
        for (let i = 0; i < existingIndex; i++) {
          if (updated[i].status !== 'completed') {
            updated[i] = { ...updated[i], status: 'completed' };
          }
        }
        return { ...state, progressSteps: updated };
      } else {
        const updatedPrev = state.progressSteps.map(s =>
          s.status !== 'completed' ? { ...s, status: 'completed' as const } : s
        );
        return {
          ...state,
          progressSteps: [
            ...updatedPrev,
            {
              id: stepId,
              label: message.replace(/^✓\s*/, ''),
              status: isCompleted ? 'completed' as const : 'active' as const,
              message,
            },
          ],
        };
      }
    }
    case 'COMPLETE_ALL_PROGRESS_STEPS':
      return {
        ...state,
        progressSteps: state.progressSteps.map(step => ({ ...step, status: 'completed' as const })),
      };
    case 'ERROR_ACTIVE_PROGRESS_STEPS':
      return {
        ...state,
        progressSteps: state.progressSteps.map(s =>
          s.status === 'active' ? { ...s, status: 'error' as const } : s
        ),
      };
    case 'SET_STREAMING_MESSAGE':
      return { ...state, streamingMessage: action.payload };
    case 'APPEND_STREAMING_MESSAGE':
      return { ...state, streamingMessage: (state.streamingMessage ?? '') + action.payload };
    case 'SET_SHOW_QUANT_DASHBOARD':
      return { ...state, showQuantDashboard: action.payload };
    case 'SET_IS_EXPORTING_PDF':
      return { ...state, isExportingPDF: action.payload };
    case 'SET_CURRENT_CONVERSATION_ID':
      return { ...state, currentConversationId: action.payload };
    case 'SET_SAVED_CONVERSATIONS':
      return { ...state, savedConversations: action.payload };
    case 'SET_SHOW_CHAT_HISTORY':
      return { ...state, showChatHistory: action.payload };
    case 'SET_IS_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_SHOW_SHARE_CARD':
      return { ...state, showShareCard: action.payload };
    case 'SET_AI_PRIVACY_ACCEPTED':
      return { ...state, aiPrivacyAccepted: action.payload };
    case 'SET_SHOW_PRIVACY_DISCLOSURE':
      return { ...state, showPrivacyDisclosure: action.payload };
    case 'RESET':
      return {
        ...initialVibeStudioState,
        savedConversations: state.savedConversations,
        showQuantDashboard: state.showQuantDashboard,
        aiPrivacyAccepted: state.aiPrivacyAccepted,
      };
    default:
      return state;
  }
}

interface VibeStudioProps {
  initialPortfolio?: GeneratedPortfolio | null;
  onPortfolioLoaded?: () => void;
}

function VibeStudio({ initialPortfolio, onPortfolioLoaded }: VibeStudioProps) {
  const { addToast } = useToast();
  const { isAdvanced } = useUserMode();
  const [state, dispatch] = useReducer(vibeStudioReducer, initialVibeStudioState);

  const {
    prompt,
    isGenerating,
    generatedPortfolio,
    error,
    chatMode,
    chatHistory,
    chatInput,
    isChatting,
    progressSteps,
    streamingMessage,
    showQuantDashboard,
    isExportingPDF,
    currentConversationId,
    savedConversations,
    showChatHistory,
    isSaving,
    showShareCard,
    aiPrivacyAccepted,
    showPrivacyDisclosure,
  } = state;
  
  // Refs for chart containers (for PDF export)
  const pieChartRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const quantDashboardRef = useRef<HTMLDivElement>(null);
  const tickerAnalysisRef = useRef<HTMLDivElement>(null);
  
  const isMountedRef = useIsMounted();

  // Load saved conversations on mount
  useEffect(() => {
    loadSavedConversations();
  }, []);

  // Load portfolio from props when passed (from SavedPortfoliosTab)
  useEffect(() => {
    if (initialPortfolio) {
      dispatch({ type: 'SET_GENERATED_PORTFOLIO', payload: initialPortfolio });
      dispatch({ type: 'SET_ERROR', payload: null });
      if (onPortfolioLoaded) {
        onPortfolioLoaded();
      }
    }
  }, [initialPortfolio, onPortfolioLoaded]);

  // Load saved conversations from IndexedDB
  const loadSavedConversations = async () => {
    try {
      const conversations = await chatHistoryService.listConversations();
      if (isMountedRef.current) {
        dispatch({ type: 'SET_SAVED_CONVERSATIONS', payload: conversations });
      }
    } catch (err) {
      logger.error('Failed to load chat history:', err);
    }
  };

  // Save chat message to history
  const saveChatMessage = async (role: 'user' | 'assistant', content: string) => {
    try {
      // Create new conversation if none exists
      if (!currentConversationId) {
        const conv = await chatHistoryService.createConversation(
          prompt.substring(0, 50) || 'New Conversation'
        );
        dispatch({ type: 'SET_CURRENT_CONVERSATION_ID', payload: conv.id });
        await chatHistoryService.addMessage(conv.id, role, content);
      } else {
        await chatHistoryService.addMessage(currentConversationId, role, content);
      }
      // Refresh conversation list
      loadSavedConversations();
    } catch (err) {
      logger.error('Failed to save chat message:', err);
    }
  };

  // Load a conversation from history
  const loadConversation = async (conversationId: string) => {
    try {
      const conversation = await chatHistoryService.getConversation(conversationId);
      if (conversation && isMountedRef.current) {
        dispatch({ type: 'SET_CURRENT_CONVERSATION_ID', payload: conversation.id });
        dispatch({
          type: 'SET_CHAT_HISTORY',
          payload: conversation.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
        });
        dispatch({ type: 'SET_CHAT_MODE', payload: true });
        dispatch({ type: 'SET_SHOW_CHAT_HISTORY', payload: false });
      }
    } catch (err) {
      logger.error('Failed to load conversation:', err);
    }
  };

  // Delete a conversation
  const deleteConversation = async (conversationId: string) => {
    try {
      await chatHistoryService.deleteConversation(conversationId);
      if (currentConversationId === conversationId) {
        dispatch({ type: 'SET_CURRENT_CONVERSATION_ID', payload: null });
        dispatch({ type: 'SET_CHAT_HISTORY', payload: [] });
      }
      loadSavedConversations();
    } catch (err) {
      logger.error('Failed to delete conversation:', err);
    }
  };

  // Start a new conversation
  const startNewConversation = () => {
    dispatch({ type: 'SET_CURRENT_CONVERSATION_ID', payload: null });
    dispatch({ type: 'SET_CHAT_HISTORY', payload: [] });
    dispatch({ type: 'SET_CHAT_MODE', payload: false });
    dispatch({ type: 'SET_GENERATED_PORTFOLIO', payload: null });
    dispatch({ type: 'SET_PROMPT', payload: '' });
    dispatch({ type: 'SET_SHOW_CHAT_HISTORY', payload: false });
  };

  // Helper to check if sections have data (for hiding empty sections)
  const sectionVisibility = useMemo(() => {
    if (!generatedPortfolio) return {};
    
    const assets = generatedPortfolio.assets || [];
    
    return {
      hasQuantMetrics: assets.some(a => a.quantMetrics && a.quantMetrics.recommendation !== 'Data pending'),
      hasFundamentals: assets.some(a => a.fundamentals),
      hasSentiment: assets.some(a => a.sentiment),
      hasAnalystData: assets.some(a => a.analystData),
      hasMarketInsights: assets.some(a => a.marketInsights && a.marketInsights.length > 0),
      hasMonteCarloResult: !!generatedPortfolio.monteCarloResult,
      hasBacktestResult: !!generatedPortfolio.backtestResult,
      hasActivityLevel: !!generatedPortfolio.activityLevel,
      hasQuantFeedback: !!generatedPortfolio.quantFeedbackApplied && !!generatedPortfolio.quantFeedbackSummary,
      hasRiskAdjustments: !!generatedPortfolio.riskAdjustments && generatedPortfolio.riskAdjustments.length > 0,
      hasAssets: assets.length > 0,
    };
  }, [generatedPortfolio]);
  
  // Save current portfolio to local storage via backend
  const handleSavePortfolio = async () => {
    if (!generatedPortfolio) return;

    dispatch({ type: 'SET_IS_SAVING', payload: true });
    try {
      const id = `portfolio_${Date.now()}`;
      const name = generatedPortfolio.title || 'Untitled Portfolio';

      await invokeWithResilience('save_generated_portfolio', {
        id,
        name,
        data: generatedPortfolio
      });

      if (isMountedRef.current) {
        addToast('Portfolio saved successfully! View it in the Saved Portfolios tab.', 'success');
      }
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('Failed to save portfolio:', err);
        addToast('Failed to save portfolio: ' + (err instanceof Error ? err.message : String(err)), 'error');
      }
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: 'SET_IS_SAVING', payload: false });
      }
    }
  };

  // Disabled preloading to avoid rate limit issues
  // Data is fetched on-demand when portfolio is generated

  // Hex values kept because Recharts/canvas cannot resolve CSS variables
  const CHART_COLORS = ['#00e599', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const examplePrompts = [
    "Create a growth-focused tech portfolio with quarterly rebalancing",
    "Build a diversified ETF portfolio with global exposure and low fees",
    "Design an ESG-focused portfolio with renewable energy ETFs",
    "Create a core-satellite portfolio with index ETFs and growth stocks",
    "Build a conservative dividend portfolio with dividend ETFs and blue-chips",
    "Create a balanced portfolio mixing bond ETFs and value stocks"
  ];

  const handleGeneratePlan = async () => {
    if (!prompt.trim() || isGenerating) return;

    dispatch({ type: 'SET_IS_GENERATING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_GENERATED_PORTFOLIO', payload: null });
    dispatch({ type: 'SET_CHAT_MODE', payload: false });
    dispatch({ type: 'SET_CHAT_HISTORY', payload: [] });
    dispatch({ type: 'SET_STREAMING_MESSAGE', payload: '' });

    // Start with empty steps - will be populated dynamically from backend
    dispatch({ type: 'SET_PROGRESS_STEPS', payload: [] });

    try {
      logger.info('[INFO] Streaming portfolio generation for:', prompt);

      // Use streaming API - asset type is auto-detected from prompt
      const stream = portfolioAgent.generatePortfolioStream(prompt);

      for await (const update of stream) {
        // Check if still mounted before updating state
        if (!isMountedRef.current) break;

        logger.debug('📡 Stream update:', update);

        if ((update.type === 'progress' || update.type === 'data') && update.step) {
          const stepId = update.step;
          const message = update.message || '';
          const isCompleted = message.startsWith('✓') || update.type === 'data';

          dispatch({ type: 'SET_STREAMING_MESSAGE', payload: message });
          dispatch({ type: 'UPDATE_PROGRESS_STEP', payload: { stepId, message, isCompleted } });

          // If data update, merge into portfolio
          if (update.type === 'data' && update.data) {
            dispatch({ type: 'MERGE_GENERATED_PORTFOLIO', payload: update.data as Partial<GeneratedPortfolio> });
          }
        } else if (update.type === 'complete' && update.data) {
          // Mark all as complete
          dispatch({ type: 'COMPLETE_ALL_PROGRESS_STEPS' });
          dispatch({ type: 'SET_GENERATED_PORTFOLIO', payload: update.data as GeneratedPortfolio });
          dispatch({ type: 'SET_STREAMING_MESSAGE', payload: '' });
        } else if (update.type === 'error') {
          throw new Error(update.error || 'Stream error');
        }
      }

      if (isMountedRef.current) {
        logger.info('[INFO] Portfolio generation completed');
      }
    } catch (err) {
      if (isMountedRef.current) {
        logger.error('[ERROR] Portfolio generation failed:', err);
        dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to generate portfolio' });
        dispatch({ type: 'ERROR_ACTIVE_PROGRESS_STEPS' });
      }
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: 'SET_IS_GENERATING', payload: false });
        dispatch({ type: 'SET_STREAMING_MESSAGE', payload: '' });
      }
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || isChatting || !generatedPortfolio) return;

    dispatch({ type: 'SET_IS_CHATTING', payload: true });
    const userMessage = chatInput;
    dispatch({ type: 'SET_CHAT_INPUT', payload: '' });

    try {
      const newHistory: OpenRouterMessage[] = [
        ...chatHistory,
        { role: 'user', content: userMessage }
      ];

      // Save user message to history
      await saveChatMessage('user', userMessage);

      dispatch({ type: 'SET_STREAMING_MESSAGE', payload: '' });

      const vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01';
      const streamMessages: Array<{ role: string; content: string }> = [
        {
          role: 'system',
          content: `You are an elite portfolio advisor (CFA, CFP) providing expert consultation.

CURRENT PORTFOLIO CONTEXT:
${JSON.stringify(generatedPortfolio, null, 2)}

Your consultation style:
- Provide specific, actionable insights
- Reference real market data and current conditions
- Consider tax implications, fees, and transaction costs
- Explain complex concepts clearly
- Challenge assumptions when necessary
- Suggest alternatives when appropriate

Be conversational but professional. Cite specific data points from the portfolio.`
        },
        ...chatHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await streamChat(
        streamMessages,
        (token) => {
          if (isMountedRef.current) {
            dispatch({ type: 'APPEND_STREAMING_MESSAGE', payload: token });
          }
        },
        { model: vibeModel, temperature: 0.8, maxTokens: 1500 }
      );

      // Check if still mounted before updating state
      if (isMountedRef.current) {
        dispatch({ type: 'SET_STREAMING_MESSAGE', payload: '' });
        dispatch({
          type: 'SET_CHAT_HISTORY',
          payload: [
            ...newHistory,
            { role: 'assistant', content: response }
          ],
        });

        // Save assistant response to history
        await saveChatMessage('assistant', response);
      }
    } catch (error) {
      if (isMountedRef.current) {
        logger.error("Chat error:", error);
        dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : "Chat failed" });
      }
    } finally {
      if (isMountedRef.current) {
        dispatch({ type: 'SET_IS_CHATTING', payload: false });
      }
    }
  };

  const handleExampleClick = (example: string) => {
    dispatch({ type: 'SET_PROMPT', payload: example });
  };

  const handleReset = () => {
    dispatch({ type: 'RESET' });
  };

  const handleSaveJSON = async () => {
    if (!generatedPortfolio) return;
    
    try {
      const dataStr = JSON.stringify(generatedPortfolio, null, 2);
      const safeTitle = (generatedPortfolio.title || 'Portfolio').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}_${new Date().toISOString().split('T')[0]}.json`;
      
      await saveFile(dataStr, fileName, 'application/json');
    } catch (err) {
      logger.error('JSON export error:', err);
    }
  };

  const handleExportPDF = async () => {
    if (!generatedPortfolio || isExportingPDF) return;

    dispatch({ type: 'SET_IS_EXPORTING_PDF', payload: true });
    
    try {
      await exportPortfolioToPdf({
        generatedPortfolio,
        pieChartRef,
        barChartRef,
        quantDashboardRef,
        tickerAnalysisRef,
        showQuantDashboard
      });
      
    } catch (err) {
      logger.error('PDF export error:', err);
    } finally {
      dispatch({ type: 'SET_IS_EXPORTING_PDF', payload: false });
    }
  };

  const handleExportCSV = async () => {
    if (!generatedPortfolio) return;
    
    try {
      // Extended headers with all analysis data
      const headers = [
        'Symbol', 'Name', 'Allocation %', 'Price', 'Score', 'Sector', 'Rationale',
        // Quant metrics
        'Sharpe Ratio', 'Sortino Ratio', 'Calmar Ratio', 'Volatility %', 'RSI', 'RSI Signal', 'Max Drawdown %', 'Expected Return %', 'Beta', 'Alpha', 'VaR 95%', 'CVaR 95%', 'Treynor Ratio', 'Information Ratio', 'Trend Strength', 'Momentum Score', 'Recommendation', 'Confidence',
        // Fundamentals
        'P/E Ratio', 'Forward P/E', 'P/B Ratio', 'Profit Margin %', 'ROE %', 'Revenue Growth %', 'Debt/Equity', 'Dividend Yield %', 'Market Cap', 'EPS', 'Value Score', 'Quality Score', 'Growth Score',
        // Sentiment
        'Sentiment', 'Sentiment Score', 'News Count', 'Buzz Score', 'Sentiment Trend',
        // Analyst data
        'Analyst Rating', 'Target Price Mean', 'Target Price High', 'Target Price Low', 'Analyst Count', 'Upside %'
      ];
      
      const rows = (generatedPortfolio.assets || []).map(asset => {
        const q = asset.quantMetrics;
        const f = asset.fundamentals;
        const s = asset.sentiment;
        const a = asset.analystData;
        
        return [
          asset.symbol || '',
          `"${(asset.name || '').replace(/"/g, '""')}"`,
          (asset.allocation || 0).toFixed(2),
          asset.currentPrice?.toFixed(2) || '',
          asset.compositeScore || '',
          asset.sector || '',
          `"${(asset.rationale || '').replace(/"/g, '""')}"`,
          // Quant metrics (extended)
          q?.sharpeRatio?.toFixed(2) || '',
          q?.sortinoRatio?.toFixed(2) || '',
          q?.calmarRatio?.toFixed(2) || '',
          q?.volatility?.toFixed(2) || '',
          q?.rsi?.toFixed(0) || '',
          q?.rsiSignal || '',
          q?.maxDrawdown?.toFixed(2) || '',
          q?.expectedReturn?.toFixed(2) || '',
          q?.beta?.toFixed(2) || '',
          q?.alpha?.toFixed(2) || '',
          q?.var95?.toFixed(2) || '',
          q?.cvar95?.toFixed(2) || '',
          q?.treynorRatio?.toFixed(2) || '',
          q?.informationRatio?.toFixed(2) || '',
          q?.trendStrength || '',
          q?.momentumScore?.toFixed(0) || '',
          q?.recommendation || '',
          q?.confidence?.toFixed(0) || '',
          // Fundamentals (extended)
          f?.peRatio?.toFixed(2) || '',
          f?.forwardPE?.toFixed(2) || '',
          f?.priceToBook?.toFixed(2) || '',
          f?.profitMargin != null ? (f.profitMargin * 100).toFixed(2) : '',
          f?.returnOnEquity != null ? (f.returnOnEquity * 100).toFixed(2) : '',
          f?.revenueGrowthYoY != null ? (f.revenueGrowthYoY * 100).toFixed(2) : '',
          f?.debtToEquity?.toFixed(2) || '',
          f?.dividendYield != null ? (f.dividendYield * 100).toFixed(2) : '',
          f?.marketCap?.toFixed(0) || '',
          f?.eps?.toFixed(2) || '',
          f?.valueScore?.toFixed(0) || '',
          f?.qualityScore?.toFixed(0) || '',
          f?.growthScore?.toFixed(0) || '',
          // Sentiment (extended)
          s?.overallSentiment || '',
          s?.sentimentScore?.toFixed(2) || '',
          s?.newsCount || '',
          s?.buzzScore?.toFixed(2) || '',
          s?.sentimentTrend || '',
          // Analyst data
          a?.consensusRating || '',
          a?.targetPriceMean?.toFixed(2) || '',
          a?.targetPriceHigh?.toFixed(2) || '',
          a?.targetPriceLow?.toFixed(2) || '',
          a?.numberOfAnalysts || '',
          a?.upside?.toFixed(2) || ''
        ];
      });
      
      // Build CSV content with holdings
      let csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      // Add portfolio summary section
      csvContent += '\n\n# Portfolio Summary\n';
      csvContent += `Title,"${generatedPortfolio.title || ''}"\n`;
      csvContent += `Description,"${(generatedPortfolio.description || '').replace(/"/g, '""')}"\n`;
      csvContent += `Risk Level,${generatedPortfolio.riskLevel || ''}\n`;
      csvContent += `Time Horizon,${generatedPortfolio.timeHorizon || ''}\n`;
      csvContent += `Expected Return,${generatedPortfolio.expectedReturn || ''}\n`;
      csvContent += `Volatility,${generatedPortfolio.volatility || ''}\n`;
      csvContent += `Diversification Score,${generatedPortfolio.diversificationScore || ''}\n`;
      csvContent += `Sharpe Estimate,${generatedPortfolio.sharpeRatioEstimate || ''}\n`;
      
      // Add Monte Carlo results
      if (generatedPortfolio.monteCarloResult) {
        const mc = generatedPortfolio.monteCarloResult;
        csvContent += '\n# Monte Carlo Simulation\n';
        csvContent += `Expected Value,$${mc.expectedValue.toFixed(2)}\n`;
        csvContent += `Probability of Loss,${mc.probabilityOfLoss.toFixed(2)}%\n`;
        csvContent += `5th Percentile,$${mc.percentiles.p5.toFixed(2)}\n`;
        csvContent += `25th Percentile,$${mc.percentiles.p25.toFixed(2)}\n`;
        csvContent += `50th Percentile,$${mc.percentiles.p50.toFixed(2)}\n`;
        csvContent += `75th Percentile,$${mc.percentiles.p75.toFixed(2)}\n`;
        csvContent += `95th Percentile,$${mc.percentiles.p95.toFixed(2)}\n`;
      }
      
      // Add Backtest results
      if (generatedPortfolio.backtestResult) {
        const bt = generatedPortfolio.backtestResult;
        csvContent += '\n# Historical Backtest Results\n';
        csvContent += `Total Return,${bt.totalReturn.toFixed(2)}%\n`;
        csvContent += `Annualized Return,${bt.annualizedReturn.toFixed(2)}%\n`;
        csvContent += `Sharpe Ratio,${bt.sharpeRatio.toFixed(2)}\n`;
        csvContent += `Max Drawdown,${bt.maxDrawdown.toFixed(2)}%\n`;
        csvContent += `Win Rate,${bt.winRate.toFixed(2)}%\n`;
        csvContent += `Calmar Ratio,${bt.calmarRatio.toFixed(2)}\n`;
        csvContent += `Best Year,${bt.bestYear.toFixed(2)}%\n`;
        csvContent += `Worst Year,${bt.worstYear.toFixed(2)}%\n`;
      }
      
      const safeTitle = (generatedPortfolio.title || 'Portfolio').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}_full_analysis.csv`;
      
      await saveFile(csvContent, fileName, 'text/csv');
    } catch (err) {
      logger.error('CSV export error:', err);
    }
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
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
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
        <div className="header-buttons">
          {generatedPortfolio && (
            <button className="btn-reset" onClick={handleReset} disabled={isGenerating || isChatting}>
              <RotateCcw size={16} /> New Portfolio
            </button>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      {isGenerating && renderProgressIndicator()}

      {!generatedPortfolio && !error && !isGenerating ? (
        <div className="welcome-section">
          <div className="welcome-card">
            <h3><Target size={20} /> How it works</h3>
            <ol className="steps-list">
              <li>Describe your investment goals and risk tolerance</li>
              <li>AI automatically detects if you want stocks, ETFs, or a mix</li>
              <li>Portfolio is generated with appropriate assets and analysis</li>
              <li>Real-time market data is fetched for each recommended asset</li>
              <li>Review allocations, rationale, and current prices</li>
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
                {generatedPortfolio.activityLevel && (
                  <span className={`meta-badge ${
                    generatedPortfolio.activityLevel.score <= -0.2 ? 'success' : 
                    generatedPortfolio.activityLevel.score <= 0.2 ? 'warning' : 'active'
                  }`}>
                    {generatedPortfolio.activityLevel.score <= -0.2 ? '🧘' : 
                     generatedPortfolio.activityLevel.score <= 0.2 ? '⚖️' : '🏃'} {generatedPortfolio.activityLevel.label}
                  </span>
                )}
                {generatedPortfolio.diversificationScore && (
                  <span className="meta-badge">Diversification: {generatedPortfolio.diversificationScore}%</span>
                )}
                {generatedPortfolio.sharpeRatioEstimate && (
                  <span className="meta-badge">Sharpe: {generatedPortfolio.sharpeRatioEstimate}</span>
                )}
                {generatedPortfolio.monteCarloResult && (
                  <span className={`meta-badge ${generatedPortfolio.monteCarloResult.probabilityOfLoss <= 15 ? 'success' : 'warning'}`}>
                    Loss Prob: {generatedPortfolio.monteCarloResult.probabilityOfLoss.toFixed(1)}%
                  </span>
                )}
                {generatedPortfolio.riskProtectionApplied && (
                  <span className="meta-badge success">✓ Risk Protected</span>
                )}
                {generatedPortfolio.quantFeedbackApplied && (
                  <span className="meta-badge info">🔄 Quant Optimized</span>
                )}
              </div>
              {sectionVisibility.hasRiskAdjustments && (
                <div className="risk-adjustments-notice" style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.5rem 0.75rem', 
                  background: 'rgba(0, 229, 153, 0.1)', 
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: 'var(--success, #00e599)'
                }}>
                  <strong>🛡️ Risk Protection Applied:</strong> {generatedPortfolio.riskAdjustments!.join(' • ')}
                </div>
              )}
              {sectionVisibility.hasQuantFeedback && generatedPortfolio.quantFeedbackSummary && (
                <div className="quant-feedback-notice" style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  border: '1px solid rgba(99, 102, 241, 0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <RefreshCw size={16} style={{ color: 'var(--primary, #6366f1)' }} />
                    <strong style={{ color: 'var(--primary, #6366f1)' }}>
                      Quant Feedback Loop Applied ({generatedPortfolio.quantFeedbackSummary.adjustmentsCount} adjustments)
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {generatedPortfolio.quantFeedbackSummary.actions.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No action items available</span>
                    ) : generatedPortfolio.quantFeedbackSummary.actions.slice(0, 5).map((action, i) => (
                      <span key={i} style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{action}</span>
                    ))}
                    {generatedPortfolio.quantFeedbackSummary.actions.length > 5 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                        ...and {generatedPortfolio.quantFeedbackSummary.actions.length - 5} more adjustments
                      </span>
                    )}
                  </div>
                  {generatedPortfolio.quantFeedbackSummary.replacementSuggestions.length > 0 && (
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      <span style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.8rem' }}>
                        ⚠️ {generatedPortfolio.quantFeedbackSummary.replacementSuggestions.length} ticker(s) flagged for review
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="header-actions">
              <button className="btn-primary" onClick={handleSavePortfolio} disabled={isSaving}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" onClick={() => dispatch({ type: 'SET_SHOW_SHARE_CARD', payload: true })} title="Share Strategy">
                <Share2 size={16} /> Share
              </button>
              {isAdvanced && (
                <>
                  <button className="btn-secondary" onClick={handleExportCSV}>
                    <FileSpreadsheet size={16} /> Export CSV
                  </button>
                  <button className="btn-secondary" onClick={handleExportPDF} disabled={isExportingPDF}>
                    <FileText size={16} /> {isExportingPDF ? 'Exporting...' : 'Export PDF'}
                  </button>
                  <button className="btn-save" onClick={handleSaveJSON}>
                    <Download size={16} /> Save JSON
                  </button>
                  <button
                    className="btn-chat"
                    onClick={() => {
                      if (chatMode) {
                        dispatch({ type: 'SET_CHAT_MODE', payload: false });
                      } else if (aiPrivacyAccepted) {
                        dispatch({ type: 'SET_CHAT_MODE', payload: true });
                      } else {
                        dispatch({ type: 'SET_SHOW_PRIVACY_DISCLOSURE', payload: true });
                      }
                    }}
                  >
                    <MessageSquare size={16} /> {chatMode ? 'Hide Chat' : 'Ask AI'}
                  </button>
                </>
              )}
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

            {/* Activity Level Card */}
            {sectionVisibility.hasActivityLevel && generatedPortfolio.activityLevel && (
              <div className="detail-card">
                <h3><Activity size={20} /> Portfolio Activity Level</h3>
                <div className="detail-content">
                  <div className="activity-level-display">
                    <div className="activity-score-container">
                      <div className="activity-score-gauge">
                        <div 
                          className="activity-score-fill"
                          style={{ 
                            width: `${((generatedPortfolio.activityLevel.score + 1) / 2) * 100}%`,
                            background: generatedPortfolio.activityLevel.score <= -0.2 
                              ? 'linear-gradient(90deg, var(--color-success), var(--color-success-light))' 
                              : generatedPortfolio.activityLevel.score <= 0.2 
                                ? 'linear-gradient(90deg, var(--color-warning), var(--color-warning-light))'
                                : 'linear-gradient(90deg, var(--color-danger), var(--color-danger-light))'
                          }}
                        />
                      </div>
                      <div className="activity-score-labels">
                        <span>-1 Passive</span>
                        <span>Active +1</span>
                      </div>
                    </div>
                    <div className="activity-label-large">
                      <span className={`activity-badge ${
                        generatedPortfolio.activityLevel.score <= -0.2 ? 'passive' : 
                        generatedPortfolio.activityLevel.score <= 0.2 ? 'moderate' : 'active'
                      }`}>
                        {generatedPortfolio.activityLevel.label}
                      </span>
                      <span className="activity-score-number">{generatedPortfolio.activityLevel.score > 0 ? '+' : ''}{generatedPortfolio.activityLevel.score.toFixed(2)}</span>
                    </div>
                    <p className="activity-description">{generatedPortfolio.activityLevel.description}</p>
                  </div>
                  <div className="activity-factors">
                    <div className="factor-row">
                      <span className="factor-label">Rebalance Frequency</span>
                      <div className="factor-bar">
                        <div className="factor-fill" style={{ width: `${((generatedPortfolio.activityLevel.factors.rebalanceFrequency + 1) / 2) * 100}%` }} />
                      </div>
                      <span className="factor-value">{generatedPortfolio.activityLevel.factors.rebalanceFrequency > 0 ? '+' : ''}{generatedPortfolio.activityLevel.factors.rebalanceFrequency.toFixed(2)}</span>
                    </div>
                    <div className="factor-row">
                      <span className="factor-label">Est. Turnover</span>
                      <div className="factor-bar">
                        <div className="factor-fill" style={{ width: `${((generatedPortfolio.activityLevel.factors.turnoverEstimate + 1) / 2) * 100}%` }} />
                      </div>
                      <span className="factor-value">{generatedPortfolio.activityLevel.factors.turnoverEstimate > 0 ? '+' : ''}{generatedPortfolio.activityLevel.factors.turnoverEstimate.toFixed(2)}</span>
                    </div>
                    <div className="factor-row">
                      <span className="factor-label">Monitoring Needed</span>
                      <div className="factor-bar">
                        <div className="factor-fill" style={{ width: `${((generatedPortfolio.activityLevel.factors.monitoringNeeded + 1) / 2) * 100}%` }} />
                      </div>
                      <span className="factor-value">{generatedPortfolio.activityLevel.factors.monitoringNeeded > 0 ? '+' : ''}{generatedPortfolio.activityLevel.factors.monitoringNeeded.toFixed(2)}</span>
                    </div>
                    <div className="factor-row">
                      <span className="factor-label">Decision Frequency</span>
                      <div className="factor-bar">
                        <div className="factor-fill" style={{ width: `${((generatedPortfolio.activityLevel.factors.decisionFrequency + 1) / 2) * 100}%` }} />
                      </div>
                      <span className="factor-value">{generatedPortfolio.activityLevel.factors.decisionFrequency > 0 ? '+' : ''}{generatedPortfolio.activityLevel.factors.decisionFrequency.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Allocation Pie Chart */}
            <div className="detail-card full-width">
              <h3><PieChart size={20} /> Allocation Distribution</h3>
              <div className="detail-content" ref={pieChartRef}>
                {renderAllocationChart()}
              </div>
            </div>

            {/* Allocation Bar Chart */}
            <div className="detail-card full-width">
              <h3><BarChart3 size={20} /> Asset Allocation Breakdown</h3>
              <div className="detail-content" ref={barChartRef}>
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
                    <div className="th">Type</div>
                    <div className="th">Score</div>
                    <div className="th">Allocation</div>
                    <div className="th">Price</div>
                    <div className="th">Analyst</div>
                    <div className="th">Sentiment</div>
                  </div>
                  {generatedPortfolio.assets.length === 0 ? (
                    <p className="empty-state" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No assets in portfolio</p>
                  ) : generatedPortfolio.assets.map((asset, i) => (
                    <div key={i} className="table-row">
                      <div className="td symbol">
                        {asset.symbol}
                      </div>
                      <div className="td name">{asset.name}</div>
                      <div className="td asset-type">
                        <span className={`asset-type-badge ${asset.assetType || 'stock'}`}>
                          {asset.assetType === 'etf' ? 'ETF' : 'Stock'}
                        </span>
                      </div>
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
            {isAdvanced && sectionVisibility.hasQuantMetrics && (
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
            )}

            {/* Fundamental Analysis Table */}
            {sectionVisibility.hasFundamentals && (
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
            )}

            {/* Market Insights from Web Search */}
            {sectionVisibility.hasMarketInsights && (
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

            {/* Quant Feedback Loop - Detailed Analysis */}
            {sectionVisibility.hasQuantFeedback && generatedPortfolio.quantFeedbackSummary && (
              <div className="detail-card full-width">
                <h3><RefreshCw size={20} /> Quant Feedback Analysis</h3>
                <div className="detail-content">
                  <div className="quant-feedback-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem'
                  }}>
                    {/* Flagged Assets */}
                    {generatedPortfolio.quantFeedbackSummary.flaggedAssets.length > 0 && (
                      <div className="feedback-section" style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}>
                        <h4 style={{ color: 'var(--danger, #ef4444)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertTriangle size={18} /> Flagged for Review
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {generatedPortfolio.quantFeedbackSummary.flaggedAssets.map((symbol, i) => {
                            const asset = generatedPortfolio.assets.find(a => a.symbol === symbol);
                            return (
                              <div key={i} style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem'
                              }}>
                                <strong>{symbol}</strong>
                                {asset?.quantFeedback?.issues && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    {asset.quantFeedback.issues.slice(0, 2).join(', ')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Replacement Suggestions */}
                    {generatedPortfolio.quantFeedbackSummary.replacementSuggestions.length > 0 && (
                      <div className="feedback-section" style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        <h4 style={{ color: 'var(--warning, #f59e0b)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <ArrowUpRight size={18} /> Alternative Suggestions
                        </h4>
                        {generatedPortfolio.quantFeedbackSummary.replacementSuggestions.map((suggestion, i) => (
                          <div key={i} style={{ marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '0.85rem' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Replace </span>
                              <strong style={{ color: 'var(--danger)' }}>{suggestion.symbol}</strong>
                              <span style={{ color: 'var(--text-muted)' }}> with: </span>
                              <span style={{ color: 'var(--success)' }}>{suggestion.alternatives.join(', ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Portfolio Metrics After Feedback */}
                    <div className="feedback-section" style={{
                      background: 'rgba(99, 102, 241, 0.1)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(99, 102, 241, 0.3)'
                    }}>
                      <h4 style={{ color: 'var(--primary, #6366f1)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Gauge size={18} /> Post-Optimization Metrics
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Est. Sharpe Ratio</div>
                          <div style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 'bold',
                            color: generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedSharpe > 1 
                              ? 'var(--success)' 
                              : generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedSharpe > 0.5 
                                ? 'var(--warning)' 
                                : 'var(--danger)'
                          }}>
                            {generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedSharpe.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Est. Volatility</div>
                          <div style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 'bold',
                            color: generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedVolatility < 20 
                              ? 'var(--success)' 
                              : generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedVolatility < 30 
                                ? 'var(--warning)' 
                                : 'var(--danger)'
                          }}>
                            {generatedPortfolio.quantFeedbackSummary.portfolioMetricsAfter.estimatedVolatility.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* All Feedback Actions */}
                  <div style={{ 
                    background: 'var(--bg-secondary)', 
                    padding: '1rem', 
                    borderRadius: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>All Adjustments Made:</h4>
                    {generatedPortfolio.quantFeedbackSummary.actions.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No action items available</p>
                    ) : generatedPortfolio.quantFeedbackSummary.actions.map((action, i) => (
                      <div key={i} style={{ 
                        fontSize: '0.85rem', 
                        padding: '0.25rem 0',
                        borderBottom: i < generatedPortfolio.quantFeedbackSummary!.actions.length - 1 
                          ? '1px solid var(--border)' 
                          : 'none'
                      }}>
                        {action}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Monte Carlo Simulation Results */}
            {sectionVisibility.hasMonteCarloResult && generatedPortfolio.monteCarloResult && (
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
            {sectionVisibility.hasBacktestResult && generatedPortfolio.backtestResult && (
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
            {isAdvanced && (
              <div className="quant-dashboard-toggle">
                <button 
                  className="btn-quant-toggle"
                  onClick={() => dispatch({ type: 'SET_SHOW_QUANT_DASHBOARD', payload: !showQuantDashboard })}
                >
                  <Gauge size={20} />
                  <span>Advanced Quantitative Analysis</span>
                  {showQuantDashboard ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            )}

            {/* Advanced Quant Dashboard */}
            {isAdvanced && showQuantDashboard && (
              <div className="quant-dashboard-container" ref={quantDashboardRef}>
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

            {/* Inline Ticker Quant Analysis - All Tickers */}
            <div className="detail-card full-width" ref={tickerAnalysisRef}>
              <h3><Eye size={20} /> Individual Ticker Analysis</h3>
              <div className="all-tickers-analysis">
                {generatedPortfolio.assets.length === 0 ? (
                  <p className="empty-state" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No assets to analyze</p>
                ) : generatedPortfolio.assets.map((asset) => (
                  <TickerAnalysis
                    key={asset.symbol}
                    symbol={asset.symbol}
                    onClose={() => {}}
                    inline={true}
                  />
                ))}
              </div>
            </div>
          </div>

          {isAdvanced && chatMode && (
            <PremiumGate tier="ai">
            <div className="chat-section">
              <div className="chat-header">
                <h3><MessageSquare size={20} /> Chat with AI about this portfolio</h3>
                <div className="chat-header-actions">
                  <button 
                    className="btn-icon"
                    onClick={() => dispatch({ type: 'SET_SHOW_CHAT_HISTORY', payload: !showChatHistory })}
                    title="Chat history"
                  >
                    <FileText size={16} />
                  </button>
                  <button 
                    className="btn-icon"
                    onClick={startNewConversation}
                    title="New conversation"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
              
              {/* Chat History Panel */}
              {showChatHistory && (
                <div className="chat-history-panel">
                  <div className="chat-history-header">
                    <h4>Saved Conversations</h4>
                    <span className="chat-history-info">Auto-deleted after 30 days</span>
                  </div>
                  {savedConversations.length === 0 ? (
                    <p className="chat-history-empty">No saved conversations</p>
                  ) : (
                    <div className="chat-history-list">
                      {savedConversations.map((conv) => {
                        const daysLeft = chatHistoryService.getDaysUntilDeletion(conv);
                        return (
                          <div 
                            key={conv.id} 
                            className={`chat-history-item ${currentConversationId === conv.id ? 'active' : ''}`}
                          >
                            <div 
                              className="chat-history-item-content"
                              onClick={() => loadConversation(conv.id)}
                            >
                              <span className="chat-history-title">{conv.title}</span>
                              <span className="chat-history-preview">{conv.preview}</span>
                              <div className="chat-history-meta">
                                <span>{conv.messageCount} messages</span>
                                <span className={daysLeft <= 7 ? 'expiring-soon' : ''}>
                                  {daysLeft} days left
                                </span>
                              </div>
                            </div>
                            <button 
                              className="chat-history-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(conv.id);
                              }}
                              title="Delete conversation"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              <div className="chat-messages">
                {chatHistory.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No messages yet. Start chatting to analyze your portfolio!</p>
                ) : chatHistory.map((msg, i) => (
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
                  onChange={(e) => dispatch({ type: 'SET_CHAT_INPUT', payload: e.target.value })}
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
            </PremiumGate>
          )}
        </div>
      )}

      <div className="input-section">
        <div className="input-container">
          <textarea
            className="prompt-input"
            placeholder="Describe your investment goals... (e.g., 'Create a growth-focused tech portfolio with quarterly rebalancing and moderate risk tolerance')"
            value={prompt}
            onChange={(e) => dispatch({ type: 'SET_PROMPT', payload: e.target.value })}
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

      {showPrivacyDisclosure && (
        <PrivacyDisclosure
          featureName="portfolio_agent"
          onAccept={() => {
            dispatch({ type: 'SET_AI_PRIVACY_ACCEPTED', payload: true });
            dispatch({ type: 'SET_SHOW_PRIVACY_DISCLOSURE', payload: false });
            dispatch({ type: 'SET_CHAT_MODE', payload: true });
          }}
          onDecline={() => {
            dispatch({ type: 'SET_SHOW_PRIVACY_DISCLOSURE', payload: false });
            addToast('AI chat requires data consent. Staying in manual mode.', 'info');
          }}
        />
      )}

      {showShareCard && generatedPortfolio && (
        <StrategyShareCard
          planName={generatedPortfolio.title}
          factors={generatedPortfolio.assets.map((a) => ({
            name: a.symbol,
            weight: a.allocation,
          }))}
          backtestMetrics={
            generatedPortfolio.backtestResult
              ? {
                  cagr: generatedPortfolio.backtestResult.annualizedReturn,
                  sharpe: generatedPortfolio.backtestResult.sharpeRatio,
                  maxDrawdown: generatedPortfolio.backtestResult.maxDrawdown,
                }
              : generatedPortfolio.sharpeRatioEstimate !== undefined
              ? { sharpe: generatedPortfolio.sharpeRatioEstimate }
              : undefined
          }
          onClose={() => dispatch({ type: 'SET_SHOW_SHARE_CARD', payload: false })}
        />
      )}
    </div>
  );
}

export default memo(VibeStudio);
