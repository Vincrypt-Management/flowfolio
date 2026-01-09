import { useState, useRef, useEffect, useMemo } from "react";
import { portfolioAgent, GeneratedPortfolio } from "../services/portfolioAgent";
import { OpenRouterMessage } from "../services/openrouter";
import { invoke } from "../services/tauri";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
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
  FolderOpen,
  Trash2,
  Eye,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  X
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
import "./VibeStudio.css";

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

interface SavedPortfolioInfo {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export default function VibeStudio() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPortfolio, setGeneratedPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState(false);
  const [chatHistory, setChatHistory] = useState<OpenRouterMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [showQuantDashboard, setShowQuantDashboard] = useState(true);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  
  // Saved portfolios state
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolioInfo[]>([]);
  const [showSavedPortfolios, setShowSavedPortfolios] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(false);
  
  // Refs for chart containers (for PDF export)
  const pieChartRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const quantDashboardRef = useRef<HTMLDivElement>(null);
  const tickerAnalysisRef = useRef<HTMLDivElement>(null);
  
  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

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
  
  useEffect(() => {
    isMountedRef.current = true;
    loadSavedPortfolios();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load saved portfolios from backend
  const loadSavedPortfolios = async () => {
    setIsLoadingPortfolios(true);
    try {
      const portfolios = await invoke<SavedPortfolioInfo[]>('list_saved_portfolios');
      if (isMountedRef.current) {
        setSavedPortfolios(portfolios);
      }
    } catch (err) {
      console.error('Failed to load saved portfolios:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingPortfolios(false);
      }
    }
  };

  // Save current portfolio to backend
  const handleSavePortfolio = async () => {
    if (!generatedPortfolio) return;
    
    setIsSaving(true);
    try {
      const id = `portfolio_${Date.now()}`;
      const name = generatedPortfolio.title || 'Untitled Portfolio';
      
      await invoke('save_generated_portfolio', {
        id,
        name,
        data: generatedPortfolio
      });
      
      if (isMountedRef.current) {
        await loadSavedPortfolios();
        alert('Portfolio saved successfully!');
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Failed to save portfolio:', err);
        alert('Failed to save portfolio: ' + err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  // Load a saved portfolio
  const handleLoadPortfolio = async (id: string) => {
    try {
      const portfolio = await invoke<GeneratedPortfolio>('load_generated_portfolio', { id });
      if (isMountedRef.current) {
        setGeneratedPortfolio(portfolio);
        setShowSavedPortfolios(false);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Failed to load portfolio:', err);
        alert('Failed to load portfolio: ' + err);
      }
    }
  };

  // Delete a saved portfolio
  const handleDeletePortfolio = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this portfolio?')) return;
    
    try {
      await invoke('delete_saved_portfolio', { id });
      if (isMountedRef.current) {
        await loadSavedPortfolios();
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Failed to delete portfolio:', err);
        alert('Failed to delete portfolio: ' + err);
      }
    }
  };

  // Disabled preloading to avoid rate limit issues
  // Data is fetched on-demand when portfolio is generated

  const CHART_COLORS = ['#00e599', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const examplePrompts = [
    "Create a growth-focused tech portfolio with quarterly rebalancing",
    "Build a conservative dividend portfolio with blue-chip stocks",
    "Design an ESG-focused portfolio with renewable energy exposure",
    "Create a balanced portfolio mixing growth and value stocks"
  ];

  const updateProgress = (stepId: string, status: ProgressStep['status'], message?: string) => {
    setProgressSteps(prev => {
      const stepIndex = prev.findIndex(s => s.id === stepId);
      if (stepIndex === -1) return prev;
      
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], status, message };
      return updated;
    });
  };

  const handleGeneratePlan = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedPortfolio(null);
    setChatMode(false);
    setChatHistory([]);
    setStreamingMessage('');

    // Initialize progress steps
    const steps: ProgressStep[] = [
      { id: 'analyzing', label: 'Analyzing your investment goals', status: 'pending' },
      { id: 'generating', label: 'Generating portfolio structure', status: 'pending' },
      { id: 'fetching', label: 'Fetching all market data (prices, metrics)', status: 'pending' },
      { id: 'quantitative', label: 'Running quantitative analysis', status: 'pending' },
      { id: 'feedback', label: 'Applying quant feedback loop', status: 'pending' },
      { id: 'complete', label: 'Finalizing portfolio', status: 'pending' },
    ];
    setProgressSteps(steps);

    try {
      console.log('[INFO] Streaming portfolio generation for:', prompt);

      // Use streaming API
      const stream = portfolioAgent.generatePortfolioStream(prompt);
      
      for await (const update of stream) {
        // Check if still mounted before updating state
        if (!isMountedRef.current) break;
        
        console.log('📡 Stream update:', update);
        
        if (update.type === 'progress' && update.step) {
          setStreamingMessage(update.message || '');
          updateProgress(update.step, 'active', update.message);
        } else if (update.type === 'data' && update.data) {
          if (update.step) {
            updateProgress(update.step, 'completed', update.message);
          }
          // Merge streaming data into portfolio
          setGeneratedPortfolio(prev => ({
            ...prev,
            ...update.data
          } as GeneratedPortfolio));
        } else if (update.type === 'complete' && update.data) {
          // Mark all as complete
          steps.forEach(step => updateProgress(step.id, 'completed'));
          setGeneratedPortfolio(update.data as GeneratedPortfolio);
          setStreamingMessage('');
        } else if (update.type === 'error') {
          throw new Error(update.error || 'Stream error');
        }
      }

      if (isMountedRef.current) {
        console.log('[INFO] Portfolio generation completed');
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('[ERROR] Portfolio generation failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate portfolio');
        setProgressSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
        setStreamingMessage('');
      }
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

      // Check if still mounted before updating state
      if (isMountedRef.current) {
        setChatHistory([
          ...newHistory,
          { role: 'assistant', content: response }
        ]);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("Chat error:", error);
        setError(error instanceof Error ? error.message : "Chat failed");
      }
    } finally {
      if (isMountedRef.current) {
        setIsChatting(false);
      }
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
    setProgressSteps([]);
  };

  const handleSaveJSON = async () => {
    if (!generatedPortfolio) return;
    
    try {
      const dataStr = JSON.stringify(generatedPortfolio, null, 2);
      const safeTitle = (generatedPortfolio.title || 'Portfolio').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}_${new Date().toISOString().split('T')[0]}.json`;
      
      // Auto-download using browser
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('JSON export error:', err);
    }
  };

  const handleExportPDF = async () => {
    if (!generatedPortfolio || isExportingPDF) return;
    
    setIsExportingPDF(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      // Title
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(generatedPortfolio.title || 'Portfolio', margin, yPos);
      yPos += 10;

      // Description
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const descLines = pdf.splitTextToSize(generatedPortfolio.description || '', pageWidth - margin * 2);
      pdf.text(descLines, margin, yPos);
      yPos += descLines.length * 5 + 5;

      // Meta info
      pdf.setFontSize(9);
      pdf.text(`Risk: ${generatedPortfolio.riskLevel || 'N/A'} | Horizon: ${generatedPortfolio.timeHorizon || 'N/A'} | Rebalance: ${generatedPortfolio.rebalanceFrequency || 'N/A'}`, margin, yPos);
      yPos += 8;

      // Strategy
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Strategy', margin, yPos);
      yPos += 6;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const strategyLines = pdf.splitTextToSize(generatedPortfolio.strategy || '', pageWidth - margin * 2);
      pdf.text(strategyLines, margin, yPos);
      yPos += strategyLines.length * 4 + 8;

      // Holdings
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Holdings', margin, yPos);
      yPos += 6;
      
      pdf.setFontSize(8);
      if (generatedPortfolio.assets && generatedPortfolio.assets.length > 0) {
        generatedPortfolio.assets.forEach((asset) => {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${asset.symbol || ''} - ${(asset.allocation || 0).toFixed(1)}%`, margin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`  ${(asset.name || '').substring(0, 40)}`, margin + 35, yPos);
          yPos += 5;
        });
      }

      yPos += 5;

      // Helper function to capture chart as image with dimensions
      const captureChart = async (ref: React.RefObject<HTMLDivElement | null>): Promise<{image: string, width: number, height: number} | null> => {
        if (!ref.current) return null;
        try {
          const canvas = await html2canvas(ref.current, {
            backgroundColor: '#1a1a2e',
            scale: 3, // Higher scale for better quality
            logging: false,
            useCORS: true,
            allowTaint: true,
          });
          return {
            image: canvas.toDataURL('image/png', 1.0),
            width: canvas.width,
            height: canvas.height
          };
        } catch (e) {
          console.error('Chart capture error:', e);
          return null;
        }
      };

      // Helper to add image with proper aspect ratio
      const addChartToPdf = (
        chartData: {image: string, width: number, height: number},
        title: string,
        maxHeight: number = 80
      ) => {
        const chartWidth = pageWidth - margin * 2;
        const aspectRatio = chartData.width / chartData.height;
        let chartHeight = chartWidth / aspectRatio;
        
        // Cap the height if too tall
        if (chartHeight > maxHeight) {
          chartHeight = maxHeight;
        }
        
        // Check if we need a new page
        if (yPos + chartHeight + 15 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin, yPos);
        yPos += 6;
        
        pdf.addImage(chartData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
        yPos += chartHeight + 10;
      };

      // Allocation Pie Chart
      if (pieChartRef.current) {
        const pieData = await captureChart(pieChartRef);
        if (pieData) {
          addChartToPdf(pieData, 'Allocation Distribution', 85);
        }
      }

      // Allocation Bar Chart
      if (barChartRef.current) {
        const barData = await captureChart(barChartRef);
        if (barData) {
          addChartToPdf(barData, 'Asset Allocation Breakdown', 85);
        }
      }

      // Quant Dashboard - give it its own page with more space
      if (quantDashboardRef.current && showQuantDashboard) {
        const quantData = await captureChart(quantDashboardRef);
        if (quantData) {
          pdf.addPage();
          yPos = margin;
          
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Quantitative Analysis Dashboard', margin, yPos);
          yPos += 8;
          
          const chartWidth = pageWidth - margin * 2;
          const aspectRatio = quantData.width / quantData.height;
          let chartHeight = chartWidth / aspectRatio;
          
          // Allow more height for quant dashboard
          const maxQuantHeight = pageHeight - margin * 2 - 15;
          if (chartHeight > maxQuantHeight) {
            chartHeight = maxQuantHeight;
          }
          
          pdf.addImage(quantData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
          yPos += chartHeight + 10;
        }
      }

      // Individual Ticker Analysis - capture each ticker card
      if (tickerAnalysisRef.current) {
        const tickerCards = tickerAnalysisRef.current.querySelectorAll('.ticker-analysis-inline');
        for (let i = 0; i < tickerCards.length; i++) {
          const card = tickerCards[i] as HTMLElement;
          try {
            const canvas = await html2canvas(card, {
              backgroundColor: '#1a1a2e',
              scale: 2,
              logging: false,
              useCORS: true,
              allowTaint: true,
            });
            const tickerData = {
              image: canvas.toDataURL('image/png', 1.0),
              width: canvas.width,
              height: canvas.height
            };
            
            pdf.addPage();
            yPos = margin;
            
            const chartWidth = pageWidth - margin * 2;
            const aspectRatio = tickerData.width / tickerData.height;
            let chartHeight = chartWidth / aspectRatio;
            
            const maxTickerHeight = pageHeight - margin * 2;
            if (chartHeight > maxTickerHeight) {
              chartHeight = maxTickerHeight;
            }
            
            pdf.addImage(tickerData.image, 'PNG', margin, yPos, chartWidth, chartHeight);
          } catch (e) {
            console.error('Ticker card capture error:', e);
          }
        }
      }

      // Performance
      if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Expected Performance', margin, yPos);
      yPos += 5;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Return: ${generatedPortfolio.expectedReturn || 'N/A'} | Volatility: ${generatedPortfolio.volatility || 'N/A'}`, margin, yPos);
      yPos += 8;

      // Reasoning
      if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('AI Reasoning', margin, yPos);
      yPos += 5;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const reasoningLines = pdf.splitTextToSize(generatedPortfolio.reasoning || '', pageWidth - margin * 2);
      pdf.text(reasoningLines, margin, yPos);
      yPos += reasoningLines.length * 4 + 8;

      // Monte Carlo Results
      if (generatedPortfolio.monteCarloResult) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Monte Carlo Simulation (1-Year Forecast)', margin, yPos);
        yPos += 5;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const mc = generatedPortfolio.monteCarloResult;
        pdf.text(`Expected Value: $${mc.expectedValue.toFixed(2)} | Probability of Loss: ${mc.probabilityOfLoss.toFixed(2)}%`, margin, yPos);
        yPos += 4;
        pdf.text(`5th Percentile: $${mc.percentiles.p5.toFixed(2)} | 50th Percentile: $${mc.percentiles.p50.toFixed(2)} | 95th Percentile: $${mc.percentiles.p95.toFixed(2)}`, margin, yPos);
        yPos += 8;
      }

      // Backtest Results
      if (generatedPortfolio.backtestResult) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Historical Backtest Results', margin, yPos);
        yPos += 5;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const bt = generatedPortfolio.backtestResult;
        pdf.text(`Total Return: ${bt.totalReturn.toFixed(2)}% | Annualized Return: ${bt.annualizedReturn.toFixed(2)}% | Sharpe Ratio: ${bt.sharpeRatio.toFixed(2)}`, margin, yPos);
        yPos += 4;
        pdf.text(`Max Drawdown: ${bt.maxDrawdown.toFixed(2)}% | Win Rate: ${bt.winRate.toFixed(2)}% | Calmar Ratio: ${bt.calmarRatio.toFixed(2)}`, margin, yPos);
        yPos += 4;
        pdf.text(`Best Year: ${bt.bestYear.toFixed(2)}% | Worst Year: ${bt.worstYear.toFixed(2)}%`, margin, yPos);
        yPos += 8;
      }

      // Quantitative Analysis per Asset
      const assetsWithQuant = generatedPortfolio.assets.filter(a => a.quantMetrics);
      if (assetsWithQuant.length > 0) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Quantitative Analysis by Asset', margin, yPos);
        yPos += 5;
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        assetsWithQuant.forEach(asset => {
          if (yPos > pageHeight - 15) {
            pdf.addPage();
            yPos = margin;
          }
          const q = asset.quantMetrics!;
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${asset.symbol}:`, margin, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Sharpe: ${q.sharpeRatio.toFixed(2)} | Volatility: ${q.volatility.toFixed(2)}% | RSI: ${q.rsi.toFixed(0)} | Max DD: ${q.maxDrawdown.toFixed(2)}% | Signal: ${q.recommendation}`, margin + 20, yPos);
          yPos += 4;
        });
        yPos += 4;
      }

      // Fundamental Analysis per Asset
      const assetsWithFundamentals = generatedPortfolio.assets.filter(a => a.fundamentals);
      if (assetsWithFundamentals.length > 0) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Fundamental Analysis by Asset', margin, yPos);
        yPos += 5;
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        assetsWithFundamentals.forEach(asset => {
          if (yPos > pageHeight - 15) {
            pdf.addPage();
            yPos = margin;
          }
          const f = asset.fundamentals!;
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${asset.symbol}:`, margin, yPos);
          pdf.setFont('helvetica', 'normal');
          const peStr = f.peRatio != null ? f.peRatio.toFixed(1) : 'N/A';
          const pbStr = f.priceToBook != null ? f.priceToBook.toFixed(2) : 'N/A';
          const roeStr = f.returnOnEquity != null ? (f.returnOnEquity * 100).toFixed(1) + '%' : 'N/A';
          const divStr = f.dividendYield != null ? (f.dividendYield * 100).toFixed(2) + '%' : 'N/A';
          pdf.text(`P/E: ${peStr} | P/B: ${pbStr} | ROE: ${roeStr} | Div Yield: ${divStr}`, margin + 20, yPos);
          yPos += 4;
        });
        yPos += 4;
      }

      // Market Insights
      const assetsWithInsights = generatedPortfolio.assets.filter(a => a.marketInsights && a.marketInsights.length > 0);
      if (assetsWithInsights.length > 0) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Market Insights', margin, yPos);
        yPos += 5;
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        assetsWithInsights.forEach(asset => {
          asset.marketInsights!.slice(0, 2).forEach(insight => {
            if (yPos > pageHeight - 15) {
              pdf.addPage();
              yPos = margin;
            }
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${asset.symbol}:`, margin, yPos);
            pdf.setFont('helvetica', 'normal');
            const insightText = pdf.splitTextToSize(`${insight.headline} - ${insight.analysis}`, pageWidth - margin * 2 - 20);
            pdf.text(insightText, margin + 20, yPos);
            yPos += insightText.length * 3 + 2;
          });
        });
      }

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(128);
        pdf.text(`FlowFolio | ${new Date().toLocaleDateString()} | Page ${i}/${totalPages}`, margin, pageHeight - 8);
        pdf.setTextColor(0);
      }

      // Auto-download PDF
      const safeTitle = (generatedPortfolio.title || 'Portfolio').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPDF(false);
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
          (q as any)?.rsiSignal || '',
          q?.maxDrawdown?.toFixed(2) || '',
          q?.expectedReturn?.toFixed(2) || '',
          q?.beta?.toFixed(2) || '',
          q?.alpha?.toFixed(2) || '',
          q?.var95?.toFixed(2) || '',
          (q as any)?.cvar95?.toFixed(2) || '',
          (q as any)?.treynorRatio?.toFixed(2) || '',
          (q as any)?.informationRatio?.toFixed(2) || '',
          (q as any)?.trendStrength || '',
          (q as any)?.momentumScore?.toFixed(0) || '',
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
          (f as any)?.valueScore?.toFixed(0) || '',
          (f as any)?.qualityScore?.toFixed(0) || '',
          (f as any)?.growthScore?.toFixed(0) || '',
          // Sentiment (extended)
          s?.overallSentiment || '',
          s?.sentimentScore?.toFixed(2) || '',
          s?.newsCount || '',
          s?.buzzScore?.toFixed(2) || '',
          (s as any)?.sentimentTrend || '',
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
      
      // Auto-download using browser
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
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
                {step.status === 'pending' && (
                  <div className="step-dot"></div>
                )}
              </div>
              <div className="step-content">
                <div className="step-label">{step.label}</div>
                {step.message && (
                  <div className="step-message">{step.message}</div>
                )}
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
          <button 
            className="btn-saved-portfolios" 
            onClick={() => setShowSavedPortfolios(!showSavedPortfolios)}
          >
            <FolderOpen size={16} /> 
            Saved ({savedPortfolios.length})
          </button>
          {generatedPortfolio && (
            <button className="btn-reset" onClick={handleReset}>
              <RotateCcw size={16} /> New Portfolio
            </button>
          )}
        </div>
      </div>

      {/* Saved Portfolios Panel */}
      {showSavedPortfolios && (
        <div className="saved-portfolios-panel">
          <div className="saved-portfolios-header">
            <h3><FolderOpen size={18} /> Saved Portfolios</h3>
            <button className="btn-close-panel" onClick={() => setShowSavedPortfolios(false)}>
              <X size={18} />
            </button>
          </div>
          {isLoadingPortfolios ? (
            <div className="loading-portfolios">
              <Loader2 size={20} className="spinning" />
              <span>Loading portfolios...</span>
            </div>
          ) : savedPortfolios.length === 0 ? (
            <div className="no-portfolios">
              <p>No saved portfolios yet.</p>
              <p className="hint">Generate a portfolio and click "Save" to save it here.</p>
            </div>
          ) : (
            <div className="saved-portfolios-list">
              {savedPortfolios.map((portfolio) => (
                <div 
                  key={portfolio.id} 
                  className="saved-portfolio-item"
                  onClick={() => handleLoadPortfolio(portfolio.id)}
                >
                  <div className="portfolio-info">
                    <span className="portfolio-name">{portfolio.name}</span>
                    <span className="portfolio-date">
                      {new Date(portfolio.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="portfolio-actions">
                    <button 
                      className="btn-icon-small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadPortfolio(portfolio.id);
                      }}
                      title="Load"
                    >
                      <Eye size={14} />
                    </button>
                    <button 
                      className="btn-icon-small danger" 
                      onClick={(e) => handleDeletePortfolio(portfolio.id, e)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn-refresh-list" onClick={loadSavedPortfolios}>
            <RefreshCw size={14} /> Refresh List
          </button>
        </div>
      )}

      {/* Progress Indicator */}
      {isGenerating && renderProgressIndicator()}

      {!generatedPortfolio && !error && !isGenerating ? (
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
                    {generatedPortfolio.quantFeedbackSummary.actions.slice(0, 5).map((action, i) => (
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
              <button className="btn-secondary" onClick={handleExportCSV}>
                <FileSpreadsheet size={16} /> Export CSV
              </button>
              <button className="btn-secondary" onClick={handleExportPDF} disabled={isExportingPDF}>
                <FileText size={16} /> {isExportingPDF ? 'Exporting...' : 'Export PDF'}
              </button>
              <button className="btn-save" onClick={handleSaveJSON}>
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
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)' 
                              : generatedPortfolio.activityLevel.score <= 0.2 
                                ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                : 'linear-gradient(90deg, #ef4444, #f87171)'
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
                    <div className="th">Score</div>
                    <div className="th">Allocation</div>
                    <div className="th">Price</div>
                    <div className="th">Analyst</div>
                    <div className="th">Target</div>
                    <div className="th">Sentiment</div>
                  </div>
                  {generatedPortfolio.assets.map((asset, i) => (
                    <div key={i} className="table-row">
                      <div className="td symbol">
                        {asset.symbol}
                      </div>
                      <div className="td name">{asset.name}</div>
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
                      <div className="td target">
                        {asset.analystData?.targetPriceMean ? (
                          <span className={`target-price ${
                            (asset.analystData.upside || 0) > 10 ? 'upside' : 
                            (asset.analystData.upside || 0) < -10 ? 'downside' : 'neutral'
                          }`}>
                            ${asset.analystData.targetPriceMean.toFixed(0)}
                            {asset.analystData.upside !== null && (
                              <span className="upside-text">
                                ({asset.analystData.upside > 0 ? '+' : ''}{asset.analystData.upside.toFixed(0)}%)
                              </span>
                            )}
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
            {sectionVisibility.hasQuantMetrics && (
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
                    {generatedPortfolio.quantFeedbackSummary.actions.map((action, i) => (
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
            <div className="quant-dashboard-toggle">
              <button 
                className="btn-quant-toggle"
                onClick={() => setShowQuantDashboard(!showQuantDashboard)}
              >
                <Gauge size={20} />
                <span>Advanced Quantitative Analysis</span>
                {showQuantDashboard ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {/* Advanced Quant Dashboard */}
            {showQuantDashboard && (
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
                {generatedPortfolio.assets.map((asset) => (
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
