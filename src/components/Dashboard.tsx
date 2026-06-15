import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { invokeWithResilience } from "../services/apiClient";
import { useToast } from "./Toast";
import { useUserMode } from "../contexts/UserModeContext";
import { logger } from "../core/logger";
import { DEFAULT_SYMBOLS } from "../shared/constants";
import type { VibePlan } from "../shared/types";
import {
  Button,
  MetricCard,
  PortfolioAllocation,
  ChangeIndicator,
  PriceDisplay,
  EmptyState,
  Card,
  Spinner,
} from "@flowfolio/ui";
import {
  PieChart,
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  BookOpen,
  Zap,
  BarChart3,
  ShoppingCart,
  FlaskConical,
  PenSquare,
  RefreshCw,
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

// Hex values required — SVG fill attributes don't compute CSS variables,
// so var(--chart-N) strings render as black in recharts Cell elements.
const CHART_COLORS = [
  "#00c281",
  "#4f46e5",
  "#f59e0b",
  "#f97316",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
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

  // ---- Fetch full quotes (price + day change) ----
  useEffect(() => {
    let active = true;

    async function fetchQuotes() {
      // Seed immediately from the already-loaded price map so the UI isn't blank.
      setPriceData(DEFAULT_SYMBOLS.map((symbol) => ({
        symbol,
        price: marketPrices[symbol] ?? 0,
        change: 0,
        changePercent: 0,
      })));

      try {
        const quotes = await invokeWithResilience<Record<string, { price: number; change: number; changePercent: number }>>(
          "get_current_quotes_batch",
          { symbols: DEFAULT_SYMBOLS }
        );
        if (!active) return;
        setPriceData(DEFAULT_SYMBOLS.map((symbol) => {
          const q = quotes[symbol];
          return {
            symbol,
            price: q?.price ?? marketPrices[symbol] ?? 0,
            change: q?.change ?? 0,
            changePercent: q?.changePercent ?? 0,
          };
        }));
      } catch {
        // Leave the seeded data in place — prices are shown, change stays 0.
      }
    }

    fetchQuotes();
    return () => { active = false; };
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
        if (active) setSavedPlans(plans ?? []);
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
    // Only count symbols with actual moves — avoids GOOGL appearing in both lists.
    const gainers = sorted.filter(d => d.changePercent > 0).slice(0, 3);
    const losers = sorted.filter(d => d.changePercent < 0).slice(-3).reverse();
    // Fallback: if no real moves yet, show top/bottom 3 sorted by price as placeholders.
    return {
      gainers: gainers.length > 0 ? gainers : sorted.slice(0, 3),
      losers: losers.length > 0 ? losers : sorted.slice(-3).reverse().filter(d => !gainers.includes(d)),
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

  const changeClass = (val: number) =>
    val > 0 ? "positive" : val < 0 ? "negative" : "";

  const changeSign = (val: number) => (val > 0 ? "+" : "");

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
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshMarket}
            loading={isLoadingMarket}
            leftIcon={!isLoadingMarket ? <RefreshCw size={14} /> : undefined}
            title="Refresh market data"
          >
            Refresh
          </Button>
        </div>
      </header>

      {/* ---- Summary Cards ---- */}
      <div className="dashboard-summary-cards">
        <MetricCard
          label="Portfolio Value"
          icon={<Wallet size={16} />}
          value={<PriceDisplay value={totalValue} />}
          change={<ChangeIndicator value={dayChange.percent} showPercent size="sm" />}
        />

        <MetricCard
          label="Day Change"
          icon={<Activity size={16} />}
          value={
            <PriceDisplay
              value={dayChange.amount}
              style={{
                color:
                  dayChange.amount > 0
                    ? 'var(--color-buy)'
                    : dayChange.amount < 0
                    ? 'var(--color-sell)'
                    : undefined,
              }}
            />
          }
          change={<ChangeIndicator value={dayChange.percent} showPercent size="sm" />}
        />

        <MetricCard
          label="Total Gain/Loss"
          icon={
            totalGain.amount >= 0 ? (
              <TrendingUp size={16} style={{ color: 'var(--color-buy)' }} />
            ) : (
              <TrendingDown size={16} style={{ color: 'var(--color-sell)' }} />
            )
          }
          value={
            <PriceDisplay
              value={totalGain.amount}
              style={{
                color:
                  totalGain.amount > 0
                    ? 'var(--color-buy)'
                    : totalGain.amount < 0
                    ? 'var(--color-sell)'
                    : undefined,
              }}
            />
          }
          change={<ChangeIndicator value={totalGain.percent} showPercent size="sm" />}
        />
      </div>

      {/* ---- Main Content Sections ---- */}
      <div className="dashboard-sections">
        {/* Left column */}
        <div className="dashboard-col">
          {/* Allocation Donut */}
          {sectorAllocation.length > 0 ? (
            <PortfolioAllocation
              title="Sector Allocation"
              items={sectorAllocation.map((s, idx) => ({
                name: s.name,
                value: s.value,
                color: CHART_COLORS[idx % CHART_COLORS.length],
              }))}
              height={220}
              showValues
              showPercentages
            />
          ) : (
            <Card padding="md">
              <EmptyState
                icon={<PieChart size={20} />}
                title="No allocation data"
                description="Allocation will appear once prices load."
              />
            </Card>
          )}

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
                  <Spinner size="sm" color="muted" /> Loading plans...
                </div>
              ) : savedPlans.length > 0 ? (
                <ul className="plans-list">
                  {savedPlans.map((name) => (
                    <li key={name} className="plan-row">
                      <span className="plan-name">{name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoadPlan(name)}
                        rightIcon={<ChevronRight size={14} />}
                      >
                        Load
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<Zap size={20} />}
                  title="No saved plans yet"
                  description="Create your first Vibe plan to score and rank symbols."
                  action={{ label: 'Create plan', onClick: () => onNavigate('vibe-studio') }}
                />
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
            <EmptyState
              icon={<BookOpen size={20} />}
              title="No journal entries yet"
              description="Track your investment decisions and reasoning."
              action={{ label: 'Write an entry', onClick: () => onNavigate('journal') }}
            />
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
