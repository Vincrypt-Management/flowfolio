import { useState } from "react";
import { invoke } from "./services/tauri";

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

export function BacktestTab() {
  const [config, setConfig] = useState<BacktestConfig>({
    start_date: "2020-01-01",
    end_date: "2024-01-01",
    initial_cash: 10000.0,
    monthly_contribution: 1000.0,
    rebalance_frequency: "quarterly",
    rebalance_threshold: 5.0,
    symbols: [],
    allocation_method: "equal_weight",
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedView, setSelectedView] = useState<"metrics" | "timeline" | "trades">("metrics");

  async function runBacktest() {
    if (!config || config.symbols.length === 0) {
      alert("Please add symbols to backtest");
      return;
    }

    setIsRunning(true);
    try {
      const backtestResult = await invoke<BacktestResult>("run_backtest_simulation", { config });
      setResult(backtestResult);
    } catch (error) {
      alert("Error running backtest: " + error);
    } finally {
      setIsRunning(false);
    }
  }

  const updateConfig = (field: keyof BacktestConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="backtest-tab">
      <h2>Backtest Lab</h2>
      <p className="subtitle">Simulate your strategy with historical data</p>

      {config && (
        <div className="card">
          <h3>Backtest Configuration</h3>
          <div className="config-grid">
            <div className="config-group">
              <label>Start Date</label>
              <input
                type="date"
                value={config.start_date}
                onChange={(e) => updateConfig("start_date", e.target.value)}
              />
            </div>

            <div className="config-group">
              <label>End Date</label>
              <input
                type="date"
                value={config.end_date}
                onChange={(e) => updateConfig("end_date", e.target.value)}
              />
            </div>

            <div className="config-group">
              <label>Initial Cash ($)</label>
              <input
                type="number"
                value={config.initial_cash}
                onChange={(e) => updateConfig("initial_cash", parseFloat(e.target.value))}
              />
            </div>

            <div className="config-group">
              <label>Monthly Contribution ($)</label>
              <input
                type="number"
                value={config.monthly_contribution}
                onChange={(e) => updateConfig("monthly_contribution", parseFloat(e.target.value))}
              />
            </div>

            <div className="config-group">
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

            <div className="config-group">
              <label>Rebalance Threshold (%)</label>
              <input
                type="number"
                value={config.rebalance_threshold}
                onChange={(e) => updateConfig("rebalance_threshold", parseFloat(e.target.value))}
              />
            </div>

            <div className="config-group full-width">
              <label>Symbols (comma-separated)</label>
              <input
                type="text"
                value={config.symbols.join(", ")}
                onChange={(e) => updateConfig("symbols", e.target.value.split(",").map(s => s.trim()))}
              />
            </div>
          </div>

          <button 
            className="btn-primary" 
            onClick={runBacktest}
            disabled={isRunning}
          >
            {isRunning ? "Running Backtest..." : "Run Backtest"}
          </button>
        </div>
      )}

      {result && (
        <>
          <div className="card metrics-card">
            <h3>📊 Performance Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-item highlight">
                <div className="metric-label">Final Value</div>
                <div className="metric-value large">
                  ${result.metrics.final_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
              </div>

              <div className="metric-item highlight">
                <div className="metric-label">Total Return</div>
                <div className={`metric-value large ${result.metrics.total_return >= 0 ? "positive" : "negative"}`}>
                  {result.metrics.total_return >= 0 ? "+" : ""}{result.metrics.total_return.toFixed(2)}%
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">CAGR</div>
                <div className={`metric-value ${result.metrics.cagr >= 0 ? "positive" : "negative"}`}>
                  {result.metrics.cagr.toFixed(2)}%
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">Max Drawdown</div>
                <div className="metric-value negative">
                  -{result.metrics.max_drawdown.toFixed(2)}%
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">Volatility</div>
                <div className="metric-value">
                  {result.metrics.volatility.toFixed(2)}%
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">Sharpe Ratio</div>
                <div className="metric-value">
                  {result.metrics.sharpe_ratio.toFixed(2)}
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">Turnover</div>
                <div className="metric-value">
                  {result.metrics.turnover.toFixed(1)}%
                </div>
              </div>

              <div className="metric-item">
                <div className="metric-label">Trades</div>
                <div className="metric-value">
                  {result.metrics.num_trades}
                </div>
              </div>
            </div>

            <div className="summary-box">
              <pre>{result.summary}</pre>
            </div>
          </div>

          <div className="card">
            <div className="view-tabs">
              <button
                className={selectedView === "metrics" ? "active" : ""}
                onClick={() => setSelectedView("metrics")}
              >
                Timeline ({result.timeline.length} snapshots)
              </button>
              <button
                className={selectedView === "trades" ? "active" : ""}
                onClick={() => setSelectedView("trades")}
              >
                Trades ({result.trades.length})
              </button>
            </div>

            {selectedView === "metrics" && (
              <div className="timeline-view">
                <h4>Portfolio Value Over Time</h4>
                <div className="timeline-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Value</th>
                        <th>Cash</th>
                        <th>Invested</th>
                        <th>Positions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.timeline.slice(-12).reverse().map((snapshot, idx) => (
                        <tr key={idx}>
                          <td>{snapshot.date}</td>
                          <td>${snapshot.value.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td>${snapshot.cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td>${snapshot.invested.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td>{snapshot.positions.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note">Showing last 12 months</p>
              </div>
            )}

            {selectedView === "trades" && (
              <div className="trades-view">
                <h4>Trade History</h4>
                <div className="trades-table">
                  <table>
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
                      {result.trades.slice(-20).reverse().map((trade, idx) => (
                        <tr key={idx}>
                          <td>{trade.date}</td>
                          <td><strong>{trade.symbol}</strong></td>
                          <td>
                            <span className={`trade-action ${trade.action.toLowerCase()}`}>
                              {trade.action}
                            </span>
                          </td>
                          <td>{trade.shares.toFixed(2)}</td>
                          <td>${trade.price.toFixed(2)}</td>
                          <td>${trade.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="reason">{trade.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note">Showing last 20 trades</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
