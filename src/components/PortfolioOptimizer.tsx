import { useState, useMemo, useEffect, useRef, memo } from "react";
import { invoke } from "../services/tauri";
import { useLiveProgress } from "../hooks/useLiveProgress";
import { LiveProgressPanel } from "./LiveProgressPanel";
import { useToast } from "./Toast";
import { useUserMode } from '../contexts/UserModeContext';
import {
  Zap,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Target,
  DollarSign,
  BarChart3,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// Types matching the Rust structs
interface HoldingMetrics {
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  max_drawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
}

interface EvaluatedHolding {
  symbol: string;
  shares: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  total_return_pct: number;
  metrics: HoldingMetrics;
  performance_grade: string;
  issues: string[];
}

interface DropRecommendation {
  symbol: string;
  current_value: number;
  grade: string;
  primary_reason: string;
  all_reasons: string[];
  urgency: string;
  estimated_loss_if_held: number;
  tax_impact_note: string;
}

interface ReplacementOption {
  symbol: string;
  score: number;
  metrics: HoldingMetrics;
  why_better: string[];
  suggested_allocation_pct: number;
  suggested_amount: number;
}

interface ActionStep {
  order: number;
  action: string;
  symbol: string;
  amount: number;
  shares: number;
  rationale: string;
}

interface ActionPlan {
  total_to_sell: number;
  total_to_buy: number;
  estimated_improvement_pct: number;
  steps: ActionStep[];
}

interface PortfolioOptimizationReport {
  date: string;
  portfolio_name: string;
  current_health_score: number;
  projected_health_score: number;
  evaluated_holdings: EvaluatedHolding[];
  drop_recommendations: DropRecommendation[];
  replacement_options: ReplacementOption[];
  action_plan: ActionPlan;
  summary: string;
}

interface OptimizationThresholds {
  min_sharpe_ratio: number;
  max_volatility: number;
  max_drawdown: number;
  min_annualized_return: number;
  min_holding_period_days: number;
}

interface PortfolioHolding {
  symbol: string;
  shares: number;
  cost_basis: number;
  current_price: number;
}

interface PortfolioOptimizerProps {
  holdings: PortfolioHolding[];
  portfolioName: string;
}

// Default candidate symbols to analyze for replacement
const DEFAULT_CANDIDATES = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "DIS", "PYPL", "ADBE",
  "NFLX", "CRM", "INTC", "AMD", "QCOM", "COST", "PEP", "KO", "WMT",
  "SPY", "QQQ", "VTI", "VOO", "IWM", "EFA", "VWO", "BND", "GLD"
];

export function PortfolioOptimizerComponent({ holdings, portfolioName }: PortfolioOptimizerProps) {
  const { addToast } = useToast();
  const { isAdvanced } = useUserMode();
  const [report, setReport] = useState<PortfolioOptimizationReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useLiveMode, setUseLiveMode] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["drops", "replacements"]));
  const [customCandidates, setCustomCandidates] = useState<string>(DEFAULT_CANDIDATES.join(", "));
  const [thresholds, setThresholds] = useState<OptimizationThresholds>({
    min_sharpe_ratio: 0.3,
    max_volatility: 45.0,
    max_drawdown: 35.0,
    min_annualized_return: -15.0,
    min_holding_period_days: 30,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Live progress hook
  const { progress, reset: resetProgress } = useLiveProgress("optimization_progress");

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function generateReport() {
    if (holdings.length === 0) {
      addToast("Please add holdings to your portfolio first", "warning");
      return;
    }

    setIsLoading(true);
    resetProgress();
    
    try {
      const holdingsData: [string, number, number, number][] = holdings.map(h => [
        h.symbol,
        h.shares,
        h.cost_basis,
        h.current_price,
      ]);

      const candidates = customCandidates
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length > 0);

      // Use live mode or regular mode
      const command = useLiveMode ? "generate_optimization_report_live" : "generate_optimization_report";
      
      const result = await invoke<PortfolioOptimizationReport>(command, {
        portfolioName,
        holdings: holdingsData,
        candidateSymbols: candidates,
        thresholds,
      });

      // Check if still mounted before updating state
      if (isMountedRef.current) {
        setReport(result);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error generating optimization report: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  // Calculate candidate count for progress display
  const candidateCount = useMemo(() => {
    return customCandidates
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !holdings.some(h => h.symbol === s.toUpperCase()))
      .length;
  }, [customCandidates, holdings]);

  function toggleSection(section: string) {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  }

  function getGradeColor(grade: string): string {
    switch (grade) {
      case "A": return "var(--success)";
      case "B": return "var(--color-success)";
      case "C": return "var(--warning)";
      case "D": return "var(--color-sell)";
      case "F": return "var(--error)";
      default: return "var(--text-muted)";
    }
  }

  function getUrgencyColor(urgency: string): string {
    switch (urgency) {
      case "HIGH": return "var(--error)";
      case "MEDIUM": return "var(--warning)";
      case "LOW": return "var(--text-muted)";
      default: return "var(--text-muted)";
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function exportReportMarkdown() {
    if (!report) return;

    let md = `# Portfolio Optimization Report\n\n`;
    md += `**Portfolio:** ${report.portfolio_name}\n`;
    md += `**Date:** ${new Date(report.date).toLocaleDateString()}\n\n`;
    md += `## Health Score\n`;
    md += `- Current: ${report.current_health_score.toFixed(0)}/100\n`;
    md += `- Projected: ${report.projected_health_score.toFixed(0)}/100\n\n`;

    if (report.drop_recommendations.length > 0) {
      md += `## Positions to Drop\n\n`;
      report.drop_recommendations.forEach(drop => {
        md += `### ${drop.symbol} (Grade: ${drop.grade})\n`;
        md += `- Value: ${formatCurrency(drop.current_value)}\n`;
        md += `- Urgency: ${drop.urgency}\n`;
        md += `- Reason: ${drop.primary_reason}\n`;
        md += `- Tax Note: ${drop.tax_impact_note}\n\n`;
      });
    }

    if (report.replacement_options.length > 0) {
      md += `## Recommended Replacements\n\n`;
      report.replacement_options.forEach((opt, i) => {
        md += `### ${i + 1}. ${opt.symbol} (Score: ${opt.score.toFixed(1)})\n`;
        md += `- Suggested Amount: ${formatCurrency(opt.suggested_amount)}\n`;
        md += `- Why Better:\n`;
        opt.why_better.forEach(reason => {
          md += `  - ${reason}\n`;
        });
        md += `\n`;
      });
    }

    md += `## Action Plan\n\n`;
    report.action_plan.steps.forEach(step => {
      md += `${step.order}. **${step.action}** ${step.symbol}: ${formatCurrency(step.amount)}\n`;
      md += `   - ${step.rationale}\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-optimization-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="portfolio-optimizer">
      <div className="optimizer-header">
        <div className="header-left">
          <Zap size={24} />
          <div>
            <h3>Portfolio Optimizer</h3>
            <p>Identify underperformers and find better alternatives</p>
          </div>
        </div>
        <div className="header-actions">
          {isAdvanced && (
            <button
              className="btn-secondary"
              onClick={() => setShowSettings(!showSettings)}
            >
              <BarChart3 size={16} />
              {showSettings ? "Hide Settings" : "Settings"}
            </button>
          )}
          <button
            className="btn-primary"
            onClick={generateReport}
            disabled={isLoading || holdings.length === 0}
          >
            {isLoading ? (
              <>
                <RefreshCw size={16} className="spinning" /> Analyzing...
              </>
            ) : (
              <>
                <Zap size={16} /> Optimize Portfolio
              </>
            )}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {isAdvanced && showSettings && (
        <div className="optimizer-settings">
          <h4>Optimization Thresholds</h4>
          <div className="settings-grid">
            <div className="setting-item">
              <label>Min Sharpe Ratio</label>
              <input
                type="number"
                step="0.1"
                value={thresholds.min_sharpe_ratio}
                onChange={(e) => setThresholds({...thresholds, min_sharpe_ratio: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="setting-item">
              <label>Max Volatility (%)</label>
              <input
                type="number"
                step="1"
                value={thresholds.max_volatility}
                onChange={(e) => setThresholds({...thresholds, max_volatility: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="setting-item">
              <label>Max Drawdown (%)</label>
              <input
                type="number"
                step="1"
                value={thresholds.max_drawdown}
                onChange={(e) => setThresholds({...thresholds, max_drawdown: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="setting-item">
              <label>Min Return (%)</label>
              <input
                type="number"
                step="1"
                value={thresholds.min_annualized_return}
                onChange={(e) => setThresholds({...thresholds, min_annualized_return: parseFloat(e.target.value) || 0})}
              />
            </div>
          </div>
          <div className="setting-item full-width">
            <label>Candidate Symbols for Replacement (comma-separated)</label>
            <input
              type="text"
              value={customCandidates}
              onChange={(e) => setCustomCandidates(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL, ..."
            />
          </div>
          <div className="setting-item">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={useLiveMode}
                onChange={(e) => setUseLiveMode(e.target.checked)}
              />
              <span>Enable Live Updates</span>
            </label>
            <span className="setting-hint">See real-time progress and partial results</span>
          </div>
        </div>
      )}

      {/* Enhanced Live Progress Panel */}
      {(isLoading || progress.isActive) && useLiveMode && (
        <LiveProgressPanel 
          progress={progress}
          totalHoldings={holdings.length}
          totalCandidates={candidateCount}
        />
      )}

      {/* Simple Loading State (when live mode is off) */}
      {isLoading && !useLiveMode && (
        <div className="simple-loading">
          <RefreshCw size={24} className="spinning" />
          <span>Analyzing portfolio...</span>
        </div>
      )}

      {/* No Holdings Message */}
      {holdings.length === 0 && !isLoading && (
        <div className="empty-state">
          <Target size={48} />
          <h4>No Holdings to Optimize</h4>
          <p>Add holdings to your portfolio first, then come back to optimize.</p>
        </div>
      )}

      {/* Report Results */}
      {report && (
        <div className="optimization-report">
          {/* Health Score Summary */}
          <div className="health-summary">
            <div className="health-card current">
              <div className="health-label">Current Health</div>
              <div className="health-score" style={{ 
                color: report.current_health_score >= 70 ? "var(--success)" : 
                       report.current_health_score >= 50 ? "var(--warning)" : "var(--error)" 
              }}>
                {report.current_health_score.toFixed(0)}
              </div>
              <div className="health-max">/100</div>
            </div>
            <ArrowRight size={24} className="health-arrow" />
            <div className="health-card projected">
              <div className="health-label">Projected Health</div>
              <div className="health-score" style={{ color: "var(--success)" }}>
                {report.projected_health_score.toFixed(0)}
              </div>
              <div className="health-max">/100</div>
            </div>
            <div className="improvement-badge">
              <ArrowUpRight size={16} />
              +{(report.projected_health_score - report.current_health_score).toFixed(0)} pts
            </div>
          </div>

          {/* Summary */}
          <div className="report-summary">
            <pre>{report.summary}</pre>
          </div>

          {/* Holdings Evaluation */}
          <div className="report-section">
            <button 
              className="section-header"
              onClick={() => toggleSection("holdings")}
            >
              <div className="section-title">
                <BarChart3 size={20} />
                <span>Current Holdings Evaluation</span>
                <span className="section-count">{report.evaluated_holdings.length} positions</span>
              </div>
              {expandedSections.has("holdings") ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {expandedSections.has("holdings") && (
              <div className="section-content">
                <div className="holdings-grid">
                  {report.evaluated_holdings.map((holding) => (
                    <div 
                      key={holding.symbol} 
                      className={`holding-eval-card grade-${holding.performance_grade.toLowerCase()}`}
                    >
                      <div className="holding-header">
                        <span className="holding-symbol">{holding.symbol}</span>
                        <span 
                          className="holding-grade"
                          style={{ backgroundColor: getGradeColor(holding.performance_grade) }}
                        >
                          {holding.performance_grade}
                        </span>
                      </div>
                      <div className="holding-value">{formatCurrency(holding.market_value)}</div>
                      <div className={`holding-return ${holding.total_return_pct >= 0 ? 'positive' : 'negative'}`}>
                        {holding.total_return_pct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {holding.total_return_pct >= 0 ? '+' : ''}{holding.total_return_pct.toFixed(1)}%
                      </div>
                      <div className="holding-metrics">
                        <div className="metric">
                          <span className="metric-label">Sharpe</span>
                          <span className="metric-value">{holding.metrics.sharpe_ratio.toFixed(2)}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Vol</span>
                          <span className="metric-value">{holding.metrics.volatility.toFixed(1)}%</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Signal</span>
                          <span className={`metric-value signal-${holding.metrics.signal.toLowerCase().replace(' ', '-')}`}>
                            {holding.metrics.signal}
                          </span>
                        </div>
                      </div>
                      {holding.issues.length > 0 && (
                        <div className="holding-issues">
                          {holding.issues.map((issue, i) => (
                            <div key={i} className="issue-item">
                              <AlertTriangle size={12} />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Drop Recommendations */}
          {report.drop_recommendations.length > 0 && (
            <div className="report-section drops">
              <button 
                className="section-header"
                onClick={() => toggleSection("drops")}
              >
                <div className="section-title">
                  <TrendingDown size={20} />
                  <span>Positions to Drop</span>
                  <span className="section-count urgent">{report.drop_recommendations.length} recommendations</span>
                </div>
                {expandedSections.has("drops") ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedSections.has("drops") && (
                <div className="section-content">
                  {report.drop_recommendations.map((drop) => (
                    <div key={drop.symbol} className="drop-card">
                      <div className="drop-header">
                        <div className="drop-symbol-info">
                          <XCircle size={20} style={{ color: "var(--error)" }} />
                          <span className="drop-symbol">{drop.symbol}</span>
                          <span 
                            className="drop-grade"
                            style={{ backgroundColor: getGradeColor(drop.grade) }}
                          >
                            Grade: {drop.grade}
                          </span>
                        </div>
                        <div className="drop-urgency" style={{ color: getUrgencyColor(drop.urgency) }}>
                          {drop.urgency} URGENCY
                        </div>
                      </div>
                      <div className="drop-value">
                        <DollarSign size={16} />
                        {formatCurrency(drop.current_value)}
                      </div>
                      <div className="drop-reason">
                        <strong>Primary Issue:</strong> {drop.primary_reason}
                      </div>
                      {drop.all_reasons.length > 1 && (
                        <div className="drop-all-reasons">
                          <strong>All Issues:</strong>
                          <ul>
                            {drop.all_reasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {drop.estimated_loss_if_held > 0 && (
                        <div className="drop-warning">
                          <AlertTriangle size={14} />
                          Estimated loss if held 3 months: {formatCurrency(drop.estimated_loss_if_held)}
                        </div>
                      )}
                      <div className="drop-tax-note">{drop.tax_impact_note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Replacement Options */}
          {report.replacement_options.length > 0 && (
            <div className="report-section replacements">
              <button 
                className="section-header"
                onClick={() => toggleSection("replacements")}
              >
                <div className="section-title">
                  <TrendingUp size={20} />
                  <span>Recommended Replacements</span>
                  <span className="section-count">{report.replacement_options.length} options</span>
                </div>
                {expandedSections.has("replacements") ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedSections.has("replacements") && (
                <div className="section-content">
                  <div className="replacements-grid">
                    {report.replacement_options.map((option, idx) => (
                      <div key={option.symbol} className="replacement-card">
                        <div className="replacement-rank">#{idx + 1}</div>
                        <div className="replacement-header">
                          <span className="replacement-symbol">{option.symbol}</span>
                          <span className="replacement-score">
                            Score: {option.score.toFixed(0)}
                          </span>
                        </div>
                        <div className="replacement-allocation">
                          <span className="alloc-label">Suggested:</span>
                          <span className="alloc-amount">{formatCurrency(option.suggested_amount)}</span>
                          <span className="alloc-pct">({option.suggested_allocation_pct.toFixed(0)}%)</span>
                        </div>
                        <div className="replacement-metrics">
                          <div className="metric">
                            <span>Sharpe</span>
                            <span className="positive">{option.metrics.sharpe_ratio.toFixed(2)}</span>
                          </div>
                          <div className="metric">
                            <span>Return</span>
                            <span className="positive">{option.metrics.annualized_return.toFixed(1)}%</span>
                          </div>
                          <div className="metric">
                            <span>Vol</span>
                            <span>{option.metrics.volatility.toFixed(1)}%</span>
                          </div>
                          <div className="metric">
                            <span>Signal</span>
                            <span className={`signal-${option.metrics.signal.toLowerCase().replace(' ', '-')}`}>
                              {option.metrics.signal}
                            </span>
                          </div>
                        </div>
                        <div className="why-better">
                          <Lightbulb size={14} />
                          <div className="reasons">
                            {option.why_better.map((reason, i) => (
                              <span key={i} className="reason-tag">{reason}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Plan */}
          {report.action_plan.steps.length > 0 && (
            <div className="report-section action-plan">
              <button 
                className="section-header"
                onClick={() => toggleSection("actions")}
              >
                <div className="section-title">
                  <Target size={20} />
                  <span>Action Plan</span>
                  <span className="section-count">{report.action_plan.steps.length} steps</span>
                </div>
                {expandedSections.has("actions") ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              
              {expandedSections.has("actions") && (
                <div className="section-content">
                  <div className="action-summary">
                    <div className="summary-item sell">
                      <span className="label">Total to Sell</span>
                      <span className="value">{formatCurrency(report.action_plan.total_to_sell)}</span>
                    </div>
                    <div className="summary-item buy">
                      <span className="label">Total to Buy</span>
                      <span className="value">{formatCurrency(report.action_plan.total_to_buy)}</span>
                    </div>
                    <div className="summary-item improvement">
                      <span className="label">Expected Improvement</span>
                      <span className="value">+{report.action_plan.estimated_improvement_pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="action-steps">
                    {report.action_plan.steps.map((step) => (
                      <div key={step.order} className={`action-step ${step.action.toLowerCase()}`}>
                        <div className="step-number">{step.order}</div>
                        <div className="step-content">
                          <div className="step-header">
                            <span className={`step-action ${step.action.toLowerCase()}`}>
                              {step.action}
                            </span>
                            <span className="step-symbol">{step.symbol}</span>
                            <span className="step-amount">{formatCurrency(step.amount)}</span>
                          </div>
                          <div className="step-rationale">{step.rationale}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Export Button */}
          <div className="report-footer">
            <button className="btn-secondary" onClick={exportReportMarkdown}>
              <Download size={16} /> Export Report
            </button>
            <span className="report-date">
              Generated: {new Date(report.date).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* No Drops Needed */}
      {report && report.drop_recommendations.length === 0 && (
        <div className="no-drops-message">
          <CheckCircle2 size={32} />
          <h4>Portfolio Looks Healthy!</h4>
          <p>No positions currently meet the criteria for dropping. Your holdings are performing within acceptable thresholds.</p>
        </div>
      )}
    </div>
  );
}

export default memo(PortfolioOptimizerComponent);
