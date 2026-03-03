// Enhanced Live Progress Panel Component
// Provides a beautiful, informative real-time progress display

import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  BarChart3,
  Target,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { ProgressState, formatDuration, calculateETA } from "../hooks/useLiveProgress";

interface LiveProgressPanelProps {
  progress: ProgressState;
  totalHoldings: number;
  totalCandidates: number;
}

// Phase definitions for the optimization process
type Phase = "initializing" | "analyzing_holdings" | "evaluating_candidates" | "generating_report" | "completed";

function getPhase(progress: ProgressState, totalHoldings: number): Phase {
  if (!progress.isActive && progress.success !== null) return "completed";
  if (progress.currentStep === 0) return "initializing";
  if (progress.currentStep <= totalHoldings) return "analyzing_holdings";
  if (progress.message.includes("recommendation")) return "generating_report";
  return "evaluating_candidates";
}

export function LiveProgressPanel({ progress, totalHoldings, totalCandidates }: LiveProgressPanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Update elapsed time every second
  useEffect(() => {
    if (!progress.startTime || !progress.isActive) return;
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - progress.startTime!);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [progress.startTime, progress.isActive]);

  const phase = getPhase(progress, totalHoldings);
  
  // Calculate phase-specific progress
  const phaseProgress = useMemo(() => {
    const holdingsComplete = progress.partialResults.holding_metrics.size;
    const candidatesComplete = progress.partialResults.candidate_metrics.size;
    
    return {
      holdings: {
        current: holdingsComplete,
        total: totalHoldings,
        pct: totalHoldings > 0 ? (holdingsComplete / totalHoldings) * 100 : 0,
      },
      candidates: {
        current: candidatesComplete,
        total: totalCandidates,
        pct: totalCandidates > 0 ? (candidatesComplete / totalCandidates) * 100 : 0,
      },
    };
  }, [progress.partialResults, totalHoldings, totalCandidates]);

  // Get top candidates by score
  const topCandidates = useMemo(() => {
    return Array.from(progress.partialResults.candidate_metrics.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [progress.partialResults.candidate_metrics]);

  // Get signal color
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "STRONG BUY": return "var(--success)";
      case "BUY": return "var(--color-buy)";
      case "HOLD": return "var(--text-muted)";
      case "SELL": return "var(--color-sell)";
      case "STRONG SELL": return "var(--error)";
      default: return "var(--text-muted)";
    }
  };

  return (
    <div className="enhanced-progress-panel">
      {/* Header */}
      <div className="progress-panel-header">
        <div className="header-title">
          <div className="activity-indicator">
            {progress.isActive ? (
              <Loader2 size={24} className="spinning" />
            ) : progress.success ? (
              <CheckCircle2 size={24} />
            ) : (
              <XCircle size={24} />
            )}
          </div>
          <div>
            <h3>Portfolio Analysis</h3>
            <span className="subtitle">
              {phase === "completed" 
                ? (progress.success ? "Analysis Complete" : "Analysis Failed")
                : "Real-time optimization in progress"}
            </span>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <Clock size={16} />
            <span>{formatDuration(elapsedTime)}</span>
          </div>
          {progress.isActive && progress.currentStep > 0 && progress.totalSteps && (
            <div className="stat-item eta">
              <Target size={16} />
              <span>ETA: {calculateETA(progress.currentStep, progress.totalSteps, progress.startTime) || "..."}</span>
            </div>
          )}
        </div>
      </div>

      {/* Phase Timeline */}
      <div className="phase-timeline">
        <div className={`phase-step ${phase === "initializing" ? "active" : "completed"}`}>
          <div className="phase-icon">
            <Zap size={16} />
          </div>
          <span>Initialize</span>
        </div>
        <ChevronRight size={16} className="phase-arrow" />
        <div className={`phase-step ${phase === "analyzing_holdings" ? "active" : ["evaluating_candidates", "generating_report", "completed"].includes(phase) ? "completed" : ""}`}>
          <div className="phase-icon">
            <BarChart3 size={16} />
          </div>
          <span>Analyze Holdings</span>
        </div>
        <ChevronRight size={16} className="phase-arrow" />
        <div className={`phase-step ${phase === "evaluating_candidates" ? "active" : ["generating_report", "completed"].includes(phase) ? "completed" : ""}`}>
          <div className="phase-icon">
            <Sparkles size={16} />
          </div>
          <span>Find Replacements</span>
        </div>
        <ChevronRight size={16} className="phase-arrow" />
        <div className={`phase-step ${phase === "generating_report" ? "active" : phase === "completed" ? "completed" : ""}`}>
          <div className="phase-icon">
            <Target size={16} />
          </div>
          <span>Generate Report</span>
        </div>
      </div>

      {/* Main Progress */}
      <div className="overall-progress">
        <div className="progress-label">
          <span className="current-action">
            {progress.currentSymbol ? (
              <>Analyzing <strong>{progress.currentSymbol}</strong></>
            ) : (
              progress.message || "Processing..."
            )}
          </span>
          <span className="progress-percentage">{progress.percentage.toFixed(0)}%</span>
        </div>
        <div className="progress-track">
          <div 
            className="progress-fill"
            style={{ width: `${progress.percentage}%` }}
          >
            <div className="progress-glow"></div>
          </div>
        </div>
      </div>

      {/* Retry Alert */}
      {progress.retryState && (
        <div className="retry-alert">
          <div className="retry-icon">
            <RefreshCw size={18} className="spinning" />
          </div>
          <div className="retry-content">
            <div className="retry-title">
              Retrying {progress.retryState.symbol || "request"}
              <span className="retry-badge">
                Attempt {progress.retryState.attempt}/{progress.retryState.maxAttempts}
              </span>
            </div>
            <div className="retry-reason">{progress.retryState.error}</div>
            <div className="retry-timer">
              Next retry in {(progress.retryState.nextRetryMs / 1000).toFixed(1)}s
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout for Results */}
      <div className="results-grid">
        {/* Holdings Analysis */}
        <div className="results-section holdings">
          <div className="section-header">
            <BarChart3 size={16} />
            <span>Holdings Analysis</span>
            <span className="count-badge">
              {phaseProgress.holdings.current}/{phaseProgress.holdings.total}
            </span>
          </div>
          <div className="mini-progress">
            <div 
              className="mini-progress-fill holdings"
              style={{ width: `${phaseProgress.holdings.pct}%` }}
            />
          </div>
          <div className="results-list">
            {Array.from(progress.partialResults.holding_metrics.values()).map((metric) => (
              <div key={metric.symbol} className="result-item">
                <span className="item-symbol">{metric.symbol}</span>
                <div className="item-metrics">
                  <span className="metric-value" title="Sharpe Ratio">
                    {metric.sharpe_ratio >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {metric.sharpe_ratio.toFixed(2)}
                  </span>
                  <span 
                    className="item-signal"
                    style={{ color: getSignalColor(metric.signal) }}
                  >
                    {metric.signal}
                  </span>
                </div>
              </div>
            ))}
            {phaseProgress.holdings.current === 0 && (
              <div className="empty-placeholder">
                <Loader2 size={16} className="spinning" />
                <span>Waiting for data...</span>
              </div>
            )}
          </div>
        </div>

        {/* Candidate Evaluation */}
        <div className="results-section candidates">
          <div className="section-header">
            <Sparkles size={16} />
            <span>Top Replacement Candidates</span>
            <span className="count-badge">
              {phaseProgress.candidates.current}/{phaseProgress.candidates.total}
            </span>
          </div>
          <div className="mini-progress">
            <div 
              className="mini-progress-fill candidates"
              style={{ width: `${phaseProgress.candidates.pct}%` }}
            />
          </div>
          <div className="results-list candidates-list">
            {topCandidates.map((metric, idx) => (
              <div key={metric.symbol} className="result-item candidate">
                <span className="rank">#{idx + 1}</span>
                <span className="item-symbol">{metric.symbol}</span>
                <div className="item-metrics">
                  <span className="score-badge">
                    Score: {metric.score.toFixed(0)}
                  </span>
                  <span 
                    className="item-signal"
                    style={{ color: getSignalColor(metric.signal) }}
                  >
                    {metric.signal}
                  </span>
                </div>
              </div>
            ))}
            {phaseProgress.candidates.current === 0 && phase !== "analyzing_holdings" && (
              <div className="empty-placeholder">
                <Loader2 size={16} className="spinning" />
                <span>Evaluating candidates...</span>
              </div>
            )}
            {phase === "analyzing_holdings" && (
              <div className="empty-placeholder pending">
                <Clock size={16} />
                <span>Pending holdings analysis</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Errors */}
      {progress.errors.length > 0 && (
        <div className="errors-section">
          <div className="errors-header">
            <AlertTriangle size={16} />
            <span>Warnings ({progress.errors.length})</span>
          </div>
          <div className="errors-list">
            {progress.errors.slice(-3).map((err, i) => (
              <div key={i} className="error-item">
                <XCircle size={14} />
                <span>{err}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion Summary */}
      {phase === "completed" && progress.success && (
        <div className="completion-summary">
          <CheckCircle2 size={20} />
          <span>{progress.message}</span>
        </div>
      )}
    </div>
  );
}

export default LiveProgressPanel;
