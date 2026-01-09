/**
 * Hook for generating AI-powered analysis reports
 * Supports manual generation and auto-generation on events
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  analysisReportService, 
  AnalysisReport, 
  TickerAnalysisData,
  OptimizationData,
  AutoReportConfig,
  ReportTriggerEvent,
} from '../services/analysisReport';
import type { GeneratedPortfolio } from '../services/portfolioAgent';

interface UseAnalysisReportResult {
  report: AnalysisReport | null;
  reports: AnalysisReport[]; // History of generated reports
  isLoading: boolean;
  error: string | null;
  progress: string;
  queueStatus: { pending: number; processing: number; completed: number; failed: number };
  // Generation methods
  generatePortfolioReport: (portfolio: GeneratedPortfolio, depth?: 'basic' | 'standard' | 'comprehensive') => Promise<void>;
  generateTickerReport: (data: TickerAnalysisData) => Promise<void>;
  generateOptimizationReport: (data: OptimizationData) => Promise<void>;
  generateRiskReport: (portfolio: GeneratedPortfolio) => Promise<void>;
  // Auto-generation
  configureAutoGeneration: (config: Partial<AutoReportConfig>) => void;
  triggerAutoReport: (event: ReportTriggerEvent) => Promise<void>;
  queueReport: (event: ReportTriggerEvent, priority?: 'high' | 'medium' | 'low') => string;
  // Export methods
  exportMarkdown: () => string | null;
  exportJSON: () => string | null;
  exportAllReportsMarkdown: () => string;
  // Utilities
  clearReport: () => void;
  clearAllReports: () => void;
  selectReport: (reportId: string) => void;
}

export function useAnalysisReport(): UseAnalysisReportResult {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [queueStatus, setQueueStatus] = useState({ pending: 0, processing: 0, completed: 0, failed: 0 });
  
  const unsubscribeRef = useRef<(() => void)[]>([]);

  // Subscribe to auto-generated reports
  useEffect(() => {
    const eventTypes = ['portfolio_created', 'optimization_complete', 'ticker_analyzed', 'significant_change', 'scheduled'];
    
    eventTypes.forEach(eventType => {
      const unsubscribe = analysisReportService.onReportGenerated(eventType, (newReport) => {
        setReports(prev => [newReport, ...prev].slice(0, 20)); // Keep last 20 reports
        setReport(newReport);
      });
      unsubscribeRef.current.push(unsubscribe);
    });

    return () => {
      unsubscribeRef.current.forEach(unsub => unsub());
      unsubscribeRef.current = [];
    };
  }, []);

  // Poll queue status periodically when loading
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      setQueueStatus(analysisReportService.getQueueStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading]);

  const addReportToHistory = useCallback((newReport: AnalysisReport) => {
    setReports(prev => [newReport, ...prev].slice(0, 20));
    setReport(newReport);
  }, []);

  const generatePortfolioReport = useCallback(async (
    portfolio: GeneratedPortfolio,
    depth: 'basic' | 'standard' | 'comprehensive' = 'standard'
  ) => {
    setIsLoading(true);
    setError(null);
    setProgress('Analyzing portfolio...');
    
    try {
      setProgress('Gathering portfolio data...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI to update
      
      setProgress('Generating AI analysis...');
      const result = await analysisReportService.generatePortfolioReport(portfolio, { depth });
      
      setProgress('Finalizing report...');
      addReportToHistory(result);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [addReportToHistory]);

  const generateTickerReport = useCallback(async (data: TickerAnalysisData) => {
    setIsLoading(true);
    setError(null);
    setProgress(`Analyzing ${data.symbol}...`);
    
    try {
      setProgress(`Fetching ${data.symbol} metrics...`);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setProgress('Generating comprehensive analysis...');
      const result = await analysisReportService.generateTickerReport(data);
      
      addReportToHistory(result);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [addReportToHistory]);

  const generateOptimizationReport = useCallback(async (data: OptimizationData) => {
    setIsLoading(true);
    setError(null);
    setProgress('Generating optimization recommendations...');
    
    try {
      setProgress('Analyzing current holdings...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setProgress('Evaluating replacement options...');
      const result = await analysisReportService.generateOptimizationReport(data);
      
      setProgress('Creating action plan...');
      addReportToHistory(result);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [addReportToHistory]);

  const generateRiskReport = useCallback(async (portfolio: GeneratedPortfolio) => {
    setIsLoading(true);
    setError(null);
    setProgress('Assessing portfolio risks...');
    
    try {
      setProgress('Calculating risk metrics...');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setProgress('Running stress tests...');
      const result = await analysisReportService.generateRiskReport(portfolio);
      
      setProgress('Generating mitigation strategies...');
      addReportToHistory(result);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [addReportToHistory]);

  const configureAutoGeneration = useCallback((config: Partial<AutoReportConfig>) => {
    analysisReportService.configureAutoGeneration(config);
  }, []);

  const triggerAutoReport = useCallback(async (event: ReportTriggerEvent) => {
    setIsLoading(true);
    setProgress('Auto-generating report...');
    
    try {
      const result = await analysisReportService.triggerAutoReport(event);
      if (result) {
        addReportToHistory(result);
      }
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-generation failed');
      setProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [addReportToHistory]);

  const queueReport = useCallback((event: ReportTriggerEvent, priority: 'high' | 'medium' | 'low' = 'medium') => {
    return analysisReportService.queueReport(event, priority);
  }, []);

  const exportMarkdown = useCallback(() => {
    if (!report) return null;
    return analysisReportService.exportToMarkdown(report);
  }, [report]);

  const exportJSON = useCallback(() => {
    if (!report) return null;
    return analysisReportService.exportToJSON(report);
  }, [report]);

  const exportAllReportsMarkdown = useCallback(() => {
    if (reports.length === 0) return '# No Reports Generated\n';
    
    const combined = reports.map(r => analysisReportService.exportToMarkdown(r)).join('\n\n---\n\n');
    return `# Analysis Reports Collection\n\n*${reports.length} reports generated*\n\n---\n\n${combined}`;
  }, [reports]);

  const clearReport = useCallback(() => {
    setReport(null);
    setError(null);
    setProgress('');
  }, []);

  const clearAllReports = useCallback(() => {
    setReport(null);
    setReports([]);
    setError(null);
    setProgress('');
  }, []);

  const selectReport = useCallback((reportId: string) => {
    const selected = reports.find(r => r.id === reportId);
    if (selected) {
      setReport(selected);
    }
  }, [reports]);

  return {
    report,
    reports,
    isLoading,
    error,
    progress,
    queueStatus,
    generatePortfolioReport,
    generateTickerReport,
    generateOptimizationReport,
    generateRiskReport,
    configureAutoGeneration,
    triggerAutoReport,
    queueReport,
    exportMarkdown,
    exportJSON,
    exportAllReportsMarkdown,
    clearReport,
    clearAllReports,
    selectReport,
  };
}
