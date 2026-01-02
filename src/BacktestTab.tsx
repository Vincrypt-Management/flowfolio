import { useState } from "react";
import { invoke } from "./services/tauri";
import {
  FlaskConical,
  Play,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  PiggyBank,
  LineChart,
  List
} from "lucide-react";

interface BacktestConfig {
  start_date: string;
  end_date: string;
  initial_cash: number;
  monthly_contribution: number;
  rebalance_frequency: string;
  rebalance_threshold: number;
  symbols: string[];
  allocation_method: string;
}

interface BacktestResult {
  start_date: string;
  end_date: string;
  duration_months: number;
  metrics: BacktestMetrics;
  timeline: PortfolioSnapshot[];
  trades: TradeRecord[];
  summary: string;
}

interface BacktestMetrics {
  cagr: number;
  total_return: number;
  max_drawdown: number;
  volatility: number;
  sharpe_ratio: number;
  turnover: number;
  num_trades: number;
  final_value: number;
  total_invested: number;
}

interface PortfolioSnapshot {
  date: string;
  value: number;
  cash: number;
  invested: number;
  positions: PositionSnapshot[];
}

interface PositionSnapshot {
  symbol: string;
  shares: number;
  price: number;
  value: number;
  weight: number;
}

interface TradeRecord {
  date: string;
  symbol: string;
  action: string;
  shares: number;
  price: number;
  amount: number;
  reason: string;
}

// Preset strategies
const PRESET_STRATEGIES = [
  {
    name: "Tech Giants",
    symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "META"],
    description: "Top 5 tech companies"
  },
  {
    name: "Dividend Aristocrats",
    symbols: ["JNJ", "PG", "KO", "PEP", "MMM"],
    description: "Stable dividend payers"
  },
  {
    name: "Growth Mix",
    symbols: ["NVDA", "TSLA", "AMD", "CRM", "SHOP"],
    description: "High growth stocks"
  },
  {
    name: "Balanced ETFs",
    symbols: ["SPY", "QQQ", "VTI", "BND", "GLD"],
    description: "Diversified ETF mix"
  }
];

export function BacktestTab() {
  const [config, setConfig] = useState<BacktestConfig>({
    start_date: "2020-01-01",
    end_date: "2024-12-01",
    initial_cash: 10000.0,
    monthly_contribution: 500.0,
    rebalance_frequency: "quarterly",
    rebalance_threshold: 5.0,
    symbols: ["AAPL", "MSFT", "GOOGL"],
    allocation_method: "equal_weight",
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedView, setSelectedView] = useState<"overview" | "timeline" | "trades">("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [symbolInput, setSymbolInput] = useState("AAPL, MSFT, GOOGL");

  async function runBacktest() {
    if (config.symbols.length === 0) {
      alert("Please add at least one symbol to backtest");
      return;
    }

    setIsRunning(true);
    setResult(null);
    
    try {
      const backtestResult = await invoke<BacktestResult>("run_backtest_simulation", { config });
      setResult(backtestResult);
      setSelectedView("overview");
    } catch (error) {
      alert("Error running backtest: " + error);
    } finally {
      setIsRunning(false);
    }
  }

  const updateConfig = (field: keyof BacktestConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  const handleSymbolsChange = (value: string) => {
    setSymbolInput(value);
    const symbols = value.split(",").map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    updateConfig("symbols", symbols);
  };

  const applyPreset = (preset: typeof PRESET_STRATEGIES[0]) => {
    setSymbolInput(preset.symbols.join(", "));
    updateConfig("symbols", preset.symbols);
  };

  const calculateGrowth = () => {
    if (!result) return 0;
    return ((result.metrics.final_value - result.metrics.total_invested) / result.metrics.total_invested * 100);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderMetricCard = (
    label: string, 
    value: string | number, 
    icon: React.ReactNode, 
    trend?: "up" | "down" | "neutral",
    highlight?: boolean
  ) => (
    <div className={`backtest-metric-card ${highlight ? 'highlight' : ''} ${trend || ''}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <div className="metric-label">{label}</div>
        <div className={`metric-value ${trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : ''}`}>
          {value}
          {trend === 'up' && <ArrowUpRight size={16} />}
          {trend === 'down' && <ArrowDownRight size={16} />}
        </div>
      </div>
    </div>
  );

  const renderSimpleChart = () => {
    if (!result || result.timeline.length === 0) return null;
    
    const maxValue = Math.max(...result.timeline.map(s => s.value));
    const minValue = Math.min(...result.timeline.map(s => s.value));
    const range = maxValue - minValue || 1;
    
    // Sample points for the chart (max 24 points)
    const sampleRate = Math.max(1, Math.floor(result.timeline.length / 24));
    const sampledData = result.timeline.filter((_, i) => i % sampleRate === 0);
    
    return (
      <div className="simple-chart">
        <div className="chart-header">
          <span className="chart-title">Portfolio Value Over Time</span>
          <span className="chart-range">
            {result.start_date} → {result.end_date}
          </span>
        </div>
        <div className="chart-container">
          <div className="chart-y-axis">
            <span>{formatCurrency(maxValue)}</span>
            <span>{formatCurrency((maxValue + minValue) / 2)}</span>
            <span>{formatCurrency(minValue)}</span>
          </div>
          <div className="chart-bars">
            {sampledData.map((snapshot, idx) => {
              const height = ((snapshot.value - minValue) / range) * 100;
              const isLast = idx === sampledData.length - 1;
              return (
                <div 
                  key={idx} 
                  className={`chart-bar ${isLast ? 'current' : ''}`}
                  style={{ height: `${Math.max(5, height)}%` }}
                  title={`${snapshot.date}: ${formatCurrency(snapshot.value)}`}
                >
                  <div className="bar-fill"></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="chart-x-axis">
          <span>{result.start_date}</span>
          <span>{result.end_date}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="backtest-tab-redesign">
      {/* Header */}
      <header className="backtest-header">
        <div className="header-title">
          <FlaskConical size={28} />
          <div>
            <h1>Backtest Lab</h1>
            <p>Simulate your investment strategy with historical data</p>
          </div>
        </div>
        {result && (
          <button className="btn-reset" onClick={() => setResult(null)}>
            <RefreshCw size={16} /> New Test
          </button>
        )}
      </header>

      {/* Configuration Panel */}
      <div className="backtest-config-panel">
        <div className="config-section">
          <h3><Calendar size={18} /> Time Period</h3>
          <div className="config-row">
            <div className="config-field">
              <label>Start Date</label>
              <input
                type="date"
                value={config.start_date}
                onChange={(e) => updateConfig("start_date", e.target.value)}
              />
            </div>
            <div className="config-field">
              <label>End Date</label>
              <input
                type="date"
                value={config.end_date}
                onChange={(e) => updateConfig("end_date", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="config-section">
          <h3><DollarSign size={18} /> Investment</h3>
          <div className="config-row">
            <div className="config-field">
              <label>Initial Capital</label>
              <div className="input-with-prefix">
                <span>$</span>
                <input
                  type="number"
                  value={config.initial_cash}
                  onChange={(e) => updateConfig("initial_cash", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="config-field">
              <label>Monthly Contribution</label>
              <div className="input-with-prefix">
                <span>$</span>
                <input
                  type="number"
                  value={config.monthly_contribution}
                  onChange={(e) => updateConfig("monthly_contribution", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="config-section">
          <h3><BarChart3 size={18} /> Symbols</h3>
          <div className="preset-buttons">
            {PRESET_STRATEGIES.map((preset) => (
              <button
                key={preset.name}
                className={`preset-btn ${config.symbols.join(',') === preset.symbols.join(',') ? 'active' : ''}`}
                onClick={() => applyPreset(preset)}
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="config-field full-width">
            <label>Custom Symbols (comma-separated)</label>
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => handleSymbolsChange(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL, ..."
            />
          </div>
          <div className="symbol-tags">
            {config.symbols.map((symbol) => (
              <span key={symbol} className="symbol-tag">{symbol}</span>
            ))}
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <button 
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Advanced Settings
        </button>

        {showAdvanced && (
          <div className="config-section advanced">
            <div className="config-row">
              <div className="config-field">
                <label>Rebalance Frequency</label>
                <select
                  value={config.rebalance_frequency}
                  onChange={(e) => updateConfig("rebalance_frequency", e.target.value)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="config-field">
                <label>Rebalance Threshold</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    value={config.rebalance_threshold}
                    onChange={(e) => updateConfig("rebalance_threshold", parseFloat(e.target.value) || 0)}
                  />
                  <span>%</span>
                </div>
              </div>
              <div className="config-field">
                <label>Allocation Method</label>
                <select
                  value={config.allocation_method}
                  onChange={(e) => updateConfig("allocation_method", e.target.value)}
                >
                  <option value="equal_weight">Equal Weight</option>
                  <option value="score_weighted">Score Weighted</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Run Button */}
        <button 
          className={`btn-run-backtest ${isRunning ? 'running' : ''}`}
          onClick={runBacktest}
          disabled={isRunning || config.symbols.length === 0}
        >
          {isRunning ? (
            <>
              <div className="spinner"></div>
              Running Simulation...
            </>
          ) : (
            <>
              <Play size={18} />
              Run Backtest
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="backtest-results">
          {/* Key Metrics */}
          <div className="results-summary">
            <div className="summary-highlight">
              <div className="highlight-label">Final Portfolio Value</div>
              <div className="highlight-value">{formatCurrency(result.metrics.final_value)}</div>
              <div className={`highlight-change ${result.metrics.total_return >= 0 ? 'positive' : 'negative'}`}>
                {result.metrics.total_return >= 0 ? '+' : ''}{result.metrics.total_return.toFixed(1)}% total return
              </div>
            </div>
            
            <div className="summary-stats">
              <div className="stat-item">
                <PiggyBank size={20} />
                <div>
                  <span className="stat-label">Total Invested</span>
                  <span className="stat-value">{formatCurrency(result.metrics.total_invested)}</span>
                </div>
              </div>
              <div className="stat-item">
                <TrendingUp size={20} />
                <div>
                  <span className="stat-label">Profit/Loss</span>
                  <span className={`stat-value ${calculateGrowth() >= 0 ? 'positive' : 'negative'}`}>
                    {calculateGrowth() >= 0 ? '+' : ''}{formatCurrency(result.metrics.final_value - result.metrics.total_invested)}
                  </span>
                </div>
              </div>
              <div className="stat-item">
                <Clock size={20} />
                <div>
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{result.duration_months} months</span>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="metrics-section">
            <h3><Activity size={20} /> Performance Metrics</h3>
            <div className="metrics-grid-new">
              {renderMetricCard("CAGR", `${result.metrics.cagr.toFixed(2)}%`, <TrendingUp size={20} />, result.metrics.cagr >= 0 ? "up" : "down")}
              {renderMetricCard("Sharpe Ratio", result.metrics.sharpe_ratio.toFixed(2), <BarChart3 size={20} />, result.metrics.sharpe_ratio >= 1 ? "up" : result.metrics.sharpe_ratio >= 0 ? "neutral" : "down")}
              {renderMetricCard("Max Drawdown", `-${result.metrics.max_drawdown.toFixed(2)}%`, <TrendingDown size={20} />, "down")}
              {renderMetricCard("Volatility", `${result.metrics.volatility.toFixed(2)}%`, <Activity size={20} />, "neutral")}
              {renderMetricCard("Turnover", `${result.metrics.turnover.toFixed(1)}%`, <RefreshCw size={20} />, "neutral")}
              {renderMetricCard("Total Trades", result.metrics.num_trades.toString(), <List size={20} />, "neutral")}
            </div>
          </div>

          {/* Chart */}
          <div className="chart-section">
            {renderSimpleChart()}
          </div>

          {/* View Tabs */}
          <div className="detail-section">
            <div className="detail-tabs">
              <button
                className={selectedView === "overview" ? "active" : ""}
                onClick={() => setSelectedView("overview")}
              >
                <LineChart size={16} /> Overview
              </button>
              <button
                className={selectedView === "timeline" ? "active" : ""}
                onClick={() => setSelectedView("timeline")}
              >
                <Calendar size={16} /> Timeline ({result.timeline.length})
              </button>
              <button
                className={selectedView === "trades" ? "active" : ""}
                onClick={() => setSelectedView("trades")}
              >
                <List size={16} /> Trades ({result.trades.length})
              </button>
            </div>

            <div className="detail-content">
              {selectedView === "overview" && (
                <div className="overview-content">
                  <div className="summary-text">
                    <h4>Backtest Summary</h4>
                    <pre>{result.summary}</pre>
                  </div>
                  
                  <div className="position-breakdown">
                    <h4>Final Position Breakdown</h4>
                    {result.timeline.length > 0 && (
                      <div className="positions-grid">
                        {result.timeline[result.timeline.length - 1].positions.map((pos) => (
                          <div key={pos.symbol} className="position-card">
                            <div className="position-symbol">{pos.symbol}</div>
                            <div className="position-details">
                              <div><span>Shares:</span> {pos.shares.toFixed(2)}</div>
                              <div><span>Price:</span> ${pos.price.toFixed(2)}</div>
                              <div><span>Value:</span> ${pos.value.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                              <div><span>Weight:</span> {pos.weight.toFixed(1)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedView === "timeline" && (
                <div className="timeline-content">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Portfolio Value</th>
                        <th>Cash</th>
                        <th>Invested</th>
                        <th>Positions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.timeline.slice().reverse().slice(0, 24).map((snapshot, idx) => (
                        <tr key={idx}>
                          <td>{snapshot.date}</td>
                          <td className="value-cell">{formatCurrency(snapshot.value)}</td>
                          <td>{formatCurrency(snapshot.cash)}</td>
                          <td>{formatCurrency(snapshot.invested)}</td>
                          <td>{snapshot.positions.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.timeline.length > 24 && (
                    <p className="table-note">Showing last 24 of {result.timeline.length} snapshots</p>
                  )}
                </div>
              )}

              {selectedView === "trades" && (
                <div className="trades-content">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Symbol</th>
                        <th>Action</th>
                        <th>Shares</th>
                        <th>Price</th>
                        <th>Amount</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice().reverse().slice(0, 30).map((trade, idx) => (
                        <tr key={idx}>
                          <td>{trade.date}</td>
                          <td><strong>{trade.symbol}</strong></td>
                          <td>
                            <span className={`action-badge ${trade.action.toLowerCase()}`}>
                              {trade.action}
                            </span>
                          </td>
                          <td>{trade.shares.toFixed(2)}</td>
                          <td>${trade.price.toFixed(2)}</td>
                          <td>{formatCurrency(trade.amount)}</td>
                          <td className="reason-cell">{trade.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.trades.length > 30 && (
                    <p className="table-note">Showing last 30 of {result.trades.length} trades</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
