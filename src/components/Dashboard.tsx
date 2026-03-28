import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { invokeWithResilience } from "../services/apiClient";
import { useToast } from "./Toast";
import { useUserMode } from "../contexts/UserModeContext";
import { logger } from "../core/logger";
import { DEFAULT_SYMBOLS } from "../shared/constants";
import type { VibePlan } from "../shared/types";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { TouchableChart } from './TouchableChart';
import {
  PieChart,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BookOpen,
  Zap,
  BarChart3,
  ShoppingCart,
  FlaskConical,
  PenSquare,
  RefreshCw,
  Loader2,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import "./Dashboard.css";

// ============ Types ============

interface DashboardProps {
  plan: VibePlan | null;
  onNavigate: (tab: string) => void;
  marketPrices: Record<string, number>;
  onRefreshMarket: () => void;
  isLoadingMarket: boolean;
}

interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface SectorAllocation {
  name: string;
  value: number;
}

// ============ Constants ============

const SECTOR_MAP: Record<string, string> = {
  AAPL: "Technology",
  MSFT: "Technology",
  GOOGL: "Communication",
  AMZN: "Consumer Cyclical",
  META: "Communication",
  NVDA: "Technology",
  TSLA: "Consumer Cyclical",
  JPM: "Financial",
  V: "Financial",
  JNJ: "Healthcare",
};

const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
];

// ============ Component ============

function Dashboard({
  plan: _plan,
  onNavigate,
  marketPrices,
  onRefreshMarket,
  isLoadingMarket,
}: DashboardProps) {
  const { addToast } = useToast();
  const { isAdvanced } = useUserMode();

  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [savedPlans, setSavedPlans] = useState<string[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  // ---- Build price data from marketPrices prop ----
  useEffect(() => {
    const entries = DEFAULT_SYMBOLS.map((symbol) => ({
      symbol,
      price: marketPrices[symbol] ?? 0,
      change: 0,
      changePercent: 0,
    }));
    setPriceData(entries);
  }, [marketPrices]);

  // Journal entries are client-side only (no backend persistence)
  // Dashboard shows empty state and links to journal tab

  // ---- Fetch saved plans ----
  useEffect(() => {
    let active = true;

    async function fetchPlans() {
      setIsLoadingPlans(true);
      try {
        const plans = await invokeWithResilience<string[]>("list_saved_plans");
        if (active) setSavedPlans(plans);
      } catch {
        if (active) {
          logger.warn("Dashboard: failed to fetch saved plans");
        }
      } finally {
        if (active) setIsLoadingPlans(false);
      }
    }

    fetchPlans();
    return () => { active = false; };
  }, []);

  // ---- Derived data ----
  const totalValue = useMemo(() => {
    return priceData.reduce((sum, d) => sum + d.price, 0);
  }, [priceData]);

  const dayChange = useMemo(() => {
    const abs = priceData.reduce((sum, d) => sum + d.change, 0);
    const pct = totalValue > 0
      ? (abs / (totalValue - abs)) * 100
      : 0;
    return { amount: abs, percent: pct };
  }, [priceData, totalValue]);

  const totalGain = useMemo(() => {
    const gain = priceData.reduce((sum, d) => sum + d.change, 0);
    return { amount: gain, percent: dayChange.percent };
  }, [priceData, dayChange]);

  const topMovers = useMemo(() => {
    const sorted = [...priceData].sort(
      (a, b) => b.changePercent - a.changePercent
    );
    return {
      gainers: sorted.slice(0, 3),
      losers: sorted.slice(-3).reverse(),
    };
  }, [priceData]);

  const sectorAllocation = useMemo((): SectorAllocation[] => {
    const sectors: Record<string, number> = {};
    for (const d of priceData) {
      const sector = SECTOR_MAP[d.symbol] ?? "Other";
      sectors[sector] = (sectors[sector] ?? 0) + d.price;
    }
    return Object.entries(sectors).map(([name, value]) => ({ name, value }));
  }, [priceData]);

  // ---- Handlers ----
  const handleLoadPlan = useCallback(
    (planName: string) => {
      addToast(`Loading plan: ${planName}`, "info");
      onNavigate("vibe-studio");
    },
    [addToast, onNavigate]
  );

  // ---- Formatting helpers ----
  const fmt = useCallback((val: number, decimals = 2) => {
    return val.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }, []);

  const fmtCurrency = useCallback(
    (val: number) => `$${fmt(Math.abs(val))}`,
    [fmt]
  );

  const changeClass = (val: number) =>
    val > 0 ? "positive" : val < 0 ? "negative" : "";

  const changeSign = (val: number) => (val > 0 ? "+" : "");

  // ---- Custom tooltip for donut chart ----
  const DonutTooltip = useMemo(() => {
    return function CustomTooltip({
      active,
      payload,
    }: {
      active?: boolean;
      payload?: Array<{ name: string; value: number }>;
    }) {
      if (!active || !payload?.length) return null;
      return (
        <div className="donut-tooltip">
          <span className="donut-tooltip-label">{payload[0].name}</span>
          <span className="donut-tooltip-value">${fmt(payload[0].value)}</span>
        </div>
      );
    };
  }, [fmt]);

  // ============ Render ============

  return (
    <div className="dashboard animate-fade-in">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">
              <LayoutDashboard size={24} />
              Dashboard
            </h1>
            <p className="page-subtitle">
              Portfolio overview and quick actions
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={onRefreshMarket}
            disabled={isLoadingMarket}
            title="Refresh market data"
          >
            {isLoadingMarket ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>
      </header>

      {/* ---- Summary Cards ---- */}
      <div className="dashboard-summary-cards">
        <div className="summary-card">
          <div className="summary-card-header">
            <Wallet size={18} className="summary-icon" />
            <span className="summary-label">Portfolio Value</span>
          </div>
          <div className="value">${fmt(totalValue)}</div>
          <div className={`change ${changeClass(dayChange.amount)}`}>
            {dayChange.amount >= 0 ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownRight size={14} />
            )}
            {changeSign(dayChange.percent)}
            {fmt(Math.abs(dayChange.percent))}% today
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <Activity size={18} className="summary-icon" />
            <span className="summary-label">Day Change</span>
          </div>
          <div className={`value ${changeClass(dayChange.amount)}`}>
            {changeSign(dayChange.amount)}
            {fmtCurrency(dayChange.amount)}
          </div>
          <div className={`change ${changeClass(dayChange.percent)}`}>
            {changeSign(dayChange.percent)}
            {fmt(Math.abs(dayChange.percent))}%
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            {totalGain.amount >= 0 ? (
              <TrendingUp size={18} className="summary-icon positive" />
            ) : (
              <TrendingDown size={18} className="summary-icon negative" />
            )}
            <span className="summary-label">Total Gain/Loss</span>
          </div>
          <div className={`value ${changeClass(totalGain.amount)}`}>
            {changeSign(totalGain.amount)}
            {fmtCurrency(totalGain.amount)}
          </div>
          <div className={`change ${changeClass(totalGain.percent)}`}>
            {changeSign(totalGain.percent)}
            {fmt(Math.abs(totalGain.percent))}%
          </div>
        </div>

      </div>

      {/* ---- Main Content Sections ---- */}
      <div className="dashboard-sections">
        {/* Left column */}
        <div className="dashboard-col">
          {/* Allocation Donut */}
          <div className="card">
            <h3>
              <PieChart size={18} />
              Sector Allocation
            </h3>
            <div className="donut-chart-container">
              {sectorAllocation.length > 0 ? (
                <TouchableChart height={220}>
                  <RechartsPieChart>
                    <Pie
                      data={sectorAllocation as unknown as Array<Record<string, unknown>>}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {sectorAllocation.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </RechartsPieChart>
                </TouchableChart>
              ) : (
                <div className="empty-state">No allocation data</div>
              )}
              <div className="donut-legend">
                {sectorAllocation.map((s, idx) => (
                  <div key={s.name} className="legend-item">
                    <span
                      className="legend-dot"
                      style={{
                        background: CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                    <span className="legend-label">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Movers */}
          <div className="card">
            <h3>
              <TrendingUp size={18} />
              Top Movers
            </h3>
            <div className="top-movers-list">
              <div className="movers-section">
                <span className="movers-heading positive">Gainers</span>
                {topMovers.gainers.map((d) => (
                  <div key={d.symbol} className="mover-row">
                    <span className="mover-symbol">{d.symbol}</span>
                    <span className="mover-price">${fmt(d.price)}</span>
                    <span className={`mover-change ${changeClass(d.changePercent)}`}>
                      {changeSign(d.changePercent)}
                      {fmt(Math.abs(d.changePercent))}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="movers-section">
                <span className="movers-heading negative">Losers</span>
                {topMovers.losers.map((d) => (
                  <div key={d.symbol} className="mover-row">
                    <span className="mover-symbol">{d.symbol}</span>
                    <span className="mover-price">${fmt(d.price)}</span>
                    <span className={`mover-change ${changeClass(d.changePercent)}`}>
                      {changeSign(d.changePercent)}
                      {fmt(Math.abs(d.changePercent))}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Active Vibe Plans (advanced only or always visible) */}
          {isAdvanced && (
            <div className="card">
              <h3>
                <Zap size={18} />
                Active Vibe Plans
              </h3>
              {isLoadingPlans ? (
                <div className="loading-row">
                  <Loader2 size={16} className="spin" /> Loading plans...
                </div>
              ) : savedPlans.length > 0 ? (
                <ul className="plans-list">
                  {savedPlans.map((name) => (
                    <li key={name} className="plan-row">
                      <span className="plan-name">{name}</span>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleLoadPlan(name)}
                      >
                        Load
                        <ChevronRight size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">
                  No saved plans yet.{" "}
                  <button
                    className="link-btn"
                    onClick={() => onNavigate("vibe-studio")}
                  >
                    Create one
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="dashboard-col">
          {/* Quick Actions */}
          <div className="card">
            <h3>
              <Zap size={18} />
              Quick Actions
            </h3>
            <div className="quick-actions-grid">
              <button
                className="quick-action-btn"
                onClick={() => onNavigate("vibe-studio")}
              >
                <BarChart3 size={20} />
                <span>Run Scoring</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => onNavigate("portfolio")}
              >
                <ShoppingCart size={20} />
                <span>Generate Buy List</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => onNavigate("backtest")}
              >
                <FlaskConical size={20} />
                <span>Start Backtest</span>
              </button>
              <button
                className="quick-action-btn"
                onClick={() => onNavigate("journal")}
              >
                <PenSquare size={20} />
                <span>New Journal Entry</span>
              </button>
            </div>
          </div>

          {/* Recent Journal Entries */}
          <div className="card">
            <h3>
              <BookOpen size={18} />
              Recent Journal
            </h3>
            <div className="empty-state">
              Start tracking your investment decisions.{" "}
              <button
                className="link-btn"
                onClick={() => onNavigate("journal")}
              >
                Write an entry
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Market Ticker Strip ---- */}
      <div className="market-ticker-strip">
        <div className="ticker-track">
          {priceData.map((d) => (
            <div key={d.symbol} className="ticker-item">
              <span className="ticker-symbol">{d.symbol}</span>
              <span className="ticker-price">${fmt(d.price)}</span>
              <span className={`ticker-change ${changeClass(d.changePercent)}`}>
                {changeSign(d.changePercent)}
                {fmt(Math.abs(d.changePercent))}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(Dashboard);
