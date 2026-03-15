import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "./services/tauri";
import { YearlyReviewComponent } from "./components/YearlyReview";
import { PortfolioOptimizerComponent } from "./components/PortfolioOptimizer";
import { useToast } from "./components/Toast";
import { useUserMode } from './contexts/UserModeContext';

interface Portfolio {
  name: string;
  holdings: Holding[];
  cash: number;
  total_value: number;
  last_updated: string;
}

interface Holding {
  symbol: string;
  shares: number;
  cost_basis: number;
  current_price: number;
  market_value: number;
  target_pct: number;
  current_pct: number;
  drift_pct: number;
}

interface AllocationPlan {
  method: string;
  allocations: TargetAllocation[];
  constraints: Record<string, number | string>;
}

interface TargetAllocation {
  symbol: string;
  target_pct: number;
  score: number;
  weight_reason: string;
}

interface BuyList {
  date: string;
  total_contribution: number;
  recommendations: BuyRecommendation[];
  rationale: string;
}

interface BuyRecommendation {
  symbol: string;
  action: string;
  amount: number;
  shares: number;
  rationale: string;
  priority: number;
}

interface RebalanceReport {
  date: string;
  drift_detected: boolean;
  max_drift_pct: number;
  threshold_pct: number;
  actions: RebalanceAction[];
  estimated_transactions: number;
}

interface RebalanceAction {
  symbol: string;
  action: string;
  current_pct: number;
  target_pct: number;
  drift_pct: number;
  amount: number;
  shares: number;
}

interface PortfolioTabProps {
  onHoldingsChange?: (holdings: Array<{
    symbol: string; shares: number; currentPrice: number;
    value: number; weight: number;
  }>, totalValue: number) => void;
  onAnalyze?: (symbol: string) => void;
}

export function PortfolioTab({ onHoldingsChange, onAnalyze }: PortfolioTabProps = {}) {
  const { addToast } = useToast();
  const { isAdvanced } = useUserMode();
  const [rebalanceThreshold, setRebalanceThreshold] = useState(5.0);
  const [maxPosition, setMaxPosition] = useState(25.0);
  const [cashBuffer, setCashBuffer] = useState(5.0);
  const [portfolio, setPortfolio] = useState<Portfolio>({
    name: "My Portfolio",
    holdings: [],
    cash: 0.0,
    total_value: 0.0,
    last_updated: new Date().toISOString(),
  });
  const [allocationPlan, setAllocationPlan] = useState<AllocationPlan | null>(null);
  const [buyList, setBuyList] = useState<BuyList | null>(null);
  const [rebalanceReport, setRebalanceReport] = useState<RebalanceReport | null>(null);
  const [contribution, setContribution] = useState<string>("1000");
  const [isLoading, setIsLoading] = useState(false);
  
  // Add holding form state
  const [newSymbol, setNewSymbol] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCostBasis, setNewCostBasis] = useState("");
  const [newTargetPct, setNewTargetPct] = useState("");
  const [cashAmount, setCashAmount] = useState("");

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const notifyHoldingsChange = useCallback((holdings: Holding[], totalValue: number) => {
    if (!onHoldingsChange) return;
    onHoldingsChange(
      holdings.map((h) => ({
        symbol: h.symbol,
        shares: h.shares,
        currentPrice: h.current_price,
        value: h.market_value,
        weight: h.current_pct / 100,
      })),
      totalValue
    );
  }, [onHoldingsChange]);

  async function addHolding() {
    if (!newSymbol || !newShares) {
      addToast("Please enter symbol and shares", "warning");
      return;
    }

    setIsLoading(true);
    try {
      // Fetch current price
      const price = await invoke<number>("get_current_price_single", { symbol: newSymbol.toUpperCase() });
      
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;
      
      const shares = parseFloat(newShares);
      const costBasis = newCostBasis ? parseFloat(newCostBasis) : price;
      const targetPct = newTargetPct ? parseFloat(newTargetPct) : 0;
      
      const newHolding: Holding = {
        symbol: newSymbol.toUpperCase(),
        shares,
        cost_basis: costBasis,
        current_price: price,
        market_value: shares * price,
        target_pct: targetPct,
        current_pct: 0,
        drift_pct: 0,
      };

      const updatedHoldings = [...portfolio.holdings, newHolding];
      const totalValue = updatedHoldings.reduce((sum, h) => sum + h.market_value, 0) + portfolio.cash;
      
      // Recalculate percentages
      const holdingsWithPct = updatedHoldings.map(h => ({
        ...h,
        current_pct: (h.market_value / totalValue) * 100,
        drift_pct: ((h.market_value / totalValue) * 100) - h.target_pct,
      }));

      setPortfolio({
        ...portfolio,
        holdings: holdingsWithPct,
        total_value: totalValue,
        last_updated: new Date().toISOString(),
      });

      notifyHoldingsChange(holdingsWithPct, totalValue);

      // Clear form
      setNewSymbol("");
      setNewShares("");
      setNewCostBasis("");
      setNewTargetPct("");
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error adding holding: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function updatePrices() {
    if (portfolio.holdings.length === 0) return;

    setIsLoading(true);
    try {
      const symbols = portfolio.holdings.map(h => h.symbol);
      const prices = await invoke<Record<string, number>>("get_current_prices_batch", { symbols });
      
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;
      
      const updatedHoldings = portfolio.holdings.map(h => ({
        ...h,
        current_price: prices[h.symbol] || h.current_price,
        market_value: h.shares * (prices[h.symbol] || h.current_price),
      }));

      const totalValue = updatedHoldings.reduce((sum, h) => sum + h.market_value, 0) + portfolio.cash;
      
      const holdingsWithPct = updatedHoldings.map(h => ({
        ...h,
        current_pct: (h.market_value / totalValue) * 100,
        drift_pct: ((h.market_value / totalValue) * 100) - h.target_pct,
      }));

      setPortfolio({
        ...portfolio,
        holdings: holdingsWithPct,
        total_value: totalValue,
        last_updated: new Date().toISOString(),
      });

      notifyHoldingsChange(holdingsWithPct, totalValue);
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error updating prices: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  function removeHolding(symbol: string) {
    const updatedHoldings = portfolio.holdings.filter(h => h.symbol !== symbol);
    const totalValue = updatedHoldings.reduce((sum, h) => sum + h.market_value, 0) + portfolio.cash;
    
    const holdingsWithPct = updatedHoldings.map(h => ({
      ...h,
      current_pct: totalValue > 0 ? (h.market_value / totalValue) * 100 : 0,
      drift_pct: totalValue > 0 ? ((h.market_value / totalValue) * 100) - h.target_pct : 0,
    }));

    setPortfolio({
      ...portfolio,
      holdings: holdingsWithPct,
      total_value: totalValue,
      last_updated: new Date().toISOString(),
    });

    notifyHoldingsChange(holdingsWithPct, totalValue);
  }

  function updateCash() {
    const cash = parseFloat(cashAmount) || 0;
    const totalValue = portfolio.holdings.reduce((sum, h) => sum + h.market_value, 0) + cash;
    
    const holdingsWithPct = portfolio.holdings.map(h => ({
      ...h,
      current_pct: totalValue > 0 ? (h.market_value / totalValue) * 100 : 0,
      drift_pct: totalValue > 0 ? ((h.market_value / totalValue) * 100) - h.target_pct : 0,
    }));

    setPortfolio({
      ...portfolio,
      holdings: holdingsWithPct,
      cash,
      total_value: totalValue,
      last_updated: new Date().toISOString(),
    });

    notifyHoldingsChange(holdingsWithPct, totalValue);

    setCashAmount("");
  }

  async function generateBuyList() {
    if (!portfolio || portfolio.holdings.length === 0 || !allocationPlan) {
      addToast("Please add holdings and create an allocation plan first", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const symbols = portfolio.holdings.map(h => h.symbol);
      const prices = await invoke<Record<string, number>>("get_current_prices_batch", { symbols });

      // Check if still mounted before updating state
      if (!isMountedRef.current) return;

      const list = await invoke<BuyList>("generate_monthly_buy_list", {
        contribution: parseFloat(contribution),
        portfolio,
        allocationPlan,
        prices,
      });

      if (isMountedRef.current) {
        setBuyList(list);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error generating buy list: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function checkRebalance() {
    if (!portfolio || portfolio.holdings.length === 0) {
      addToast("Please add holdings first", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const report = await invoke<RebalanceReport>("check_portfolio_rebalance", {
        portfolio,
        thresholdPct: rebalanceThreshold,
      });

      if (isMountedRef.current) {
        setRebalanceReport(report);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error checking rebalance: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function createAllocation() {
    if (!portfolio || portfolio.holdings.length === 0) {
      addToast("Please add holdings first", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const symbols = portfolio.holdings.map(h => h.symbol);
      
      const plan = await invoke<AllocationPlan>("create_equal_weight_allocation", {
        symbols,
        maxPositionPct: maxPosition,
        cashBufferPct: cashBuffer,
      });

      if (isMountedRef.current) {
        setAllocationPlan(plan);
      }
    } catch (error) {
      if (isMountedRef.current) {
        addToast("Error creating allocation: " + (error instanceof Error ? error.message : String(error)), "error");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  return (
    <div className="portfolio-tab">
      <h2>Portfolio Management</h2>
      <p className="subtitle">Track your holdings, generate buy lists, and manage rebalancing</p>

      {isAdvanced && (
        <div className="card advanced-settings">
          <h3>⚙️ Portfolio Thresholds</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Rebalance Threshold (%)</label>
              <input type="number" value={rebalanceThreshold} onChange={(e) => setRebalanceThreshold(parseFloat(e.target.value) || 0)} min={1} max={20} step={0.5} />
            </div>
            <div className="form-group">
              <label>Max Position Size (%)</label>
              <input type="number" value={maxPosition} onChange={(e) => setMaxPosition(parseFloat(e.target.value) || 0)} min={5} max={50} step={1} />
            </div>
            <div className="form-group">
              <label>Cash Buffer (%)</label>
              <input type="number" value={cashBuffer} onChange={(e) => setCashBuffer(parseFloat(e.target.value) || 0)} min={0} max={20} step={1} />
            </div>
          </div>
        </div>
      )}

      {/* Add Holding Form */}
      <div className="card">
        <h3>Add New Holding</h3>
        <div className="add-holding-form">
          <div className="form-row">
            <div className="form-group">
              <label>Symbol</label>
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL"
              />
            </div>
            <div className="form-group">
              <label>Shares</label>
              <input
                type="number"
                value={newShares}
                onChange={(e) => setNewShares(e.target.value)}
                placeholder="10"
              />
            </div>
            <div className="form-group">
              <label>Cost Basis (optional)</label>
              <input
                type="number"
                value={newCostBasis}
                onChange={(e) => setNewCostBasis(e.target.value)}
                placeholder="Current price"
              />
            </div>
            <div className="form-group">
              <label>Target % (optional)</label>
              <input
                type="number"
                value={newTargetPct}
                onChange={(e) => setNewTargetPct(e.target.value)}
                placeholder="20"
              />
            </div>
            <button className="btn-primary" onClick={addHolding} disabled={isLoading}>
              {isLoading ? "Adding..." : "Add Holding"}
            </button>
          </div>
          <div className="form-row mt-md">
            <div className="form-group">
              <label>Cash Balance</label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Enter cash amount"
              />
            </div>
            <button className="btn-secondary" onClick={updateCash} disabled={isLoading}>
              Update Cash
            </button>
            <button className="btn-secondary" onClick={updatePrices} disabled={isLoading || portfolio.holdings.length === 0}>
              Refresh Prices
            </button>
          </div>
        </div>
      </div>

      {portfolio && (
        <>
          <div className="card">
            <h3>Current Portfolio: {portfolio.name}</h3>
            <div className="portfolio-summary">
              <div className="summary-row">
                <span className="label">Total Value:</span>
                <span className="value">${portfolio.total_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div className="summary-row">
                <span className="label">Cash:</span>
                <span className="value">${portfolio.cash.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div className="summary-row">
                <span className="label">Holdings:</span>
                <span className="value">{portfolio.holdings.length} positions</span>
              </div>
              <div className="summary-row">
                <span className="label">Last Updated:</span>
                <span className="value">{new Date(portfolio.last_updated).toLocaleString()}</span>
              </div>
            </div>

            {portfolio.holdings.length > 0 ? (
              <>
                <h4>Holdings</h4>
                <div className="holdings-table">
                  <table>
                    <caption className="sr-only">Portfolio Holdings</caption>
                    <thead>
                      <tr>
                        <th scope="col">Symbol</th>
                        <th scope="col">Shares</th>
                        <th scope="col">Price</th>
                        <th scope="col">Value</th>
                        {isAdvanced && <th scope="col">Target %</th>}
                        <th scope="col">Current %</th>
                        {isAdvanced && <th scope="col">Drift</th>}
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.map((holding) => (
                        <tr key={holding.symbol}>
                          <td><strong>{holding.symbol}</strong></td>
                          <td>{holding.shares.toFixed(2)}</td>
                          <td>${holding.current_price.toFixed(2)}</td>
                          <td>${holding.market_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          {isAdvanced && <td>{holding.target_pct.toFixed(1)}%</td>}
                          <td>{holding.current_pct.toFixed(1)}%</td>
                          {isAdvanced && (
                            <td className={holding.drift_pct > 0 ? "drift-positive" : "drift-negative"}>
                              {holding.drift_pct > 0 ? "+" : ""}{holding.drift_pct.toFixed(1)}%
                            </td>
                          )}
                          <td>
                            {onAnalyze && (
                              <button
                                className="btn-small"
                                onClick={() => onAnalyze(holding.symbol)}
                                title="Deep analysis"
                              >
                                Analyze →
                              </button>
                            )}
                            <button
                              className="btn-small btn-danger"
                              onClick={() => removeHolding(holding.symbol)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isAdvanced && (
                  <div className="actions">
                    <button className="btn-secondary" onClick={createAllocation} disabled={isLoading}>
                      Create Allocation Plan
                    </button>
                    <button className="btn-secondary" onClick={checkRebalance} disabled={isLoading}>
                      Check Rebalance
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">
                No holdings yet. Add your first holding above to get started.
              </p>
            )}
          </div>

          {allocationPlan && (
            <div className="card">
              <h3>Allocation Plan ({allocationPlan.method})</h3>
              <div className="allocation-list">
                {allocationPlan.allocations.length === 0 ? (
                  <p className="empty-state" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No allocations generated</p>
                ) : allocationPlan.allocations.map((alloc) => (
                  <div key={alloc.symbol} className="allocation-item">
                    <div className="alloc-header">
                      <span className="alloc-symbol">{alloc.symbol}</span>
                      <span className="alloc-pct">{alloc.target_pct.toFixed(1)}%</span>
                    </div>
                    <div className="alloc-reason">{alloc.weight_reason}</div>
                  </div>
                ))}
              </div>

              {isAdvanced && (
                <div className="buy-list-section">
                  <h4>Generate Buy List</h4>
                  <div className="input-group">
                    <label>Monthly Contribution ($):</label>
                    <input
                      type="number"
                      value={contribution}
                      onChange={(e) => setContribution(e.target.value)}
                      className="contribution-input"
                    />
                  </div>
                  <button className="btn-primary" onClick={generateBuyList} disabled={isLoading}>
                    {isLoading ? "Generating..." : "Generate Buy List"}
                  </button>
                </div>
              )}
            </div>
          )}

          {isAdvanced && buyList && (
            <div className="card buy-list-card">
              <h3>📅 Monthly Buy List</h3>
              <p className="buy-list-date">Generated: {new Date(buyList.date).toLocaleString()}</p>
              <p><strong>Total Contribution:</strong> ${buyList.total_contribution.toLocaleString()}</p>
              <p className="rationale">{buyList.rationale}</p>

              <h4>Recommendations ({buyList.recommendations.length})</h4>
              <div className="buy-recommendations">
                {buyList.recommendations.length === 0 ? (
                  <p className="empty-state" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No recommendations available</p>
                ) : buyList.recommendations.map((rec) => (
                  <div key={rec.symbol} className="buy-rec-item">
                    <div className="rec-header">
                      <span className="rec-priority">#{rec.priority}</span>
                      <span className="rec-symbol">{rec.symbol}</span>
                      <span className={`rec-action ${rec.action.toLowerCase()}`}>{rec.action}</span>
                    </div>
                    <div className="rec-details">
                      <div className="rec-amounts">
                        <span>${rec.amount.toFixed(2)}</span>
                        <span>•</span>
                        <span>{rec.shares.toFixed(2)} shares</span>
                      </div>
                      <div className="rec-rationale">{rec.rationale}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAdvanced && rebalanceReport && (
            <div className={`card rebalance-card ${rebalanceReport.drift_detected ? "needs-rebalance" : "balanced"}`}>
              <h3>🔄 Rebalance Report</h3>
              <p className="rebalance-date">Checked: {new Date(rebalanceReport.date).toLocaleString()}</p>
              
              <div className="rebalance-summary">
                <div className="summary-item">
                  <span className="label">Max Drift:</span>
                  <span className={`value ${rebalanceReport.drift_detected ? "alert" : "ok"}`}>
                    {rebalanceReport.max_drift_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Threshold:</span>
                  <span className="value">{rebalanceReport.threshold_pct.toFixed(1)}%</span>
                </div>
                <div className="summary-item">
                  <span className="label">Status:</span>
                  <span className={`value ${rebalanceReport.drift_detected ? "alert" : "ok"}`}>
                    {rebalanceReport.drift_detected ? "⚠️ Rebalance Needed" : "✅ Balanced"}
                  </span>
                </div>
              </div>

              {rebalanceReport.drift_detected && (
                <>
                  <h4>Recommended Actions ({rebalanceReport.estimated_transactions})</h4>
                  <div className="rebalance-actions">
                    {rebalanceReport.actions.map((action) => (
                      <div key={action.symbol} className="rebalance-action-item">
                        <div className="action-header">
                          <span className="action-symbol">{action.symbol}</span>
                          <span className={`action-type ${action.action.toLowerCase()}`}>{action.action}</span>
                        </div>
                        <div className="action-details">
                          <div>Current: {action.current_pct.toFixed(1)}% → Target: {action.target_pct.toFixed(1)}%</div>
                          <div>Drift: {action.drift_pct > 0 ? "+" : ""}{action.drift_pct.toFixed(2)}%</div>
                          <div>${action.amount.toFixed(2)} ({action.shares.toFixed(2)} shares)</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Portfolio Optimizer Section */}
          <PortfolioOptimizerComponent 
            holdings={portfolio.holdings.map(h => ({
              symbol: h.symbol,
              shares: h.shares,
              cost_basis: h.cost_basis,
              current_price: h.current_price,
            }))}
            portfolioName={portfolio.name}
          />

          {/* Yearly Review Section */}
          <YearlyReviewComponent portfolioName={portfolio.name} />
        </>
      )}
    </div>
  );
}