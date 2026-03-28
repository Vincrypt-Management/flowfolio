/**
 * PortfolioPerformanceChart Component
 * Displays portfolio value over time as an area chart, with optional
 * benchmark overlay (SPY, QQQ, DIA, IWM) normalized to % return.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TouchableChart } from './TouchableChart';
import { TrendingUp, Loader2 } from 'lucide-react';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import { formatCurrency } from '../shared/utils';
import './PortfolioPerformanceChart.css';

const log = createLogger('PortfolioPerformanceChart');

// ── Types ─────────────────────────────────────────────────────────────────

interface PortfolioSnapshot {
  date: string;
  value: number;
}

interface HistoricalPrice {
  date: string;
  close: number;
}

export interface PortfolioPerformanceChartProps {
  portfolioName: string;
  currentValue: number;
}

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
type BenchmarkSymbol = 'SPY' | 'QQQ' | 'DIA' | 'IWM';

interface ChartPoint {
  date: string;
  portfolioPct: number;
  benchmarkPct?: number;
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
}

interface PerfTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  ALL: 9999,
};

const RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

const BENCHMARK_OPTIONS: BenchmarkSymbol[] = ['SPY', 'QQQ', 'DIA', 'IWM'];

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function normalizeToPercent(
  items: { date: string; value: number }[]
): { date: string; pct: number }[] {
  if (items.length === 0) return [];
  const base = items[0].value;
  if (base === 0) return items.map((x) => ({ date: x.date, pct: 0 }));
  return items.map((x) => ({ date: x.date, pct: ((x.value - base) / base) * 100 }));
}

// ── Custom Tooltip ────────────────────────────────────────────────────────

function PerfTooltip({ active, payload, label }: PerfTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="perf-chart__tooltip">
      <p className="perf-chart__tooltip-date">{label}</p>
      {payload.map((entry, i) => (
        <p
          key={entry.name ?? i}
          className="perf-chart__tooltip-row"
          style={{ color: entry.color }}
        >
          <span>{entry.name}:</span>
          <span>{typeof entry.value === 'number' ? formatPercent(entry.value) : '—'}</span>
        </p>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function PortfolioPerformanceChart({
  portfolioName,
  currentValue,
}: PortfolioPerformanceChartProps) {
  const { addToast } = useToast();

  const [timeRange, setTimeRange] = useState<TimeRange>('3M');
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Benchmark state
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkSymbol>('SPY');
  const [benchmarkPrices, setBenchmarkPrices] = useState<HistoricalPrice[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  // ── Load snapshots ──

  const loadSnapshots = useCallback(
    async (range: TimeRange) => {
      setLoading(true);
      try {
        const days = TIME_RANGE_DAYS[range];
        const data = await invokeWithResilience<PortfolioSnapshot[]>('get_portfolio_snapshots', {
          portfolioName,
          days,
        });
        const sorted = [...data].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setSnapshots(sorted);
        log.info(`Loaded ${sorted.length} snapshots for ${portfolioName} (${range})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Failed to load portfolio snapshots', msg);
        addToast(`Failed to load performance data: ${msg}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [portfolioName, addToast]
  );

  useEffect(() => {
    void loadSnapshots(timeRange);
  }, [loadSnapshots, timeRange]);

  // ── Load benchmark ──

  const loadBenchmark = useCallback(
    async (symbol: BenchmarkSymbol, days: number) => {
      setBenchmarkLoading(true);
      try {
        const data = await invokeWithResilience<HistoricalPrice[]>('get_historical_prices', {
          symbol,
          days,
        });
        const sorted = [...data].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setBenchmarkPrices(sorted);
        log.info(`Loaded ${sorted.length} benchmark prices for ${symbol}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Failed to load benchmark data', msg);
        addToast(`Failed to load benchmark data: ${msg}`, 'error');
      } finally {
        setBenchmarkLoading(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (showBenchmark) {
      void loadBenchmark(benchmark, TIME_RANGE_DAYS[timeRange]);
    }
  }, [showBenchmark, benchmark, timeRange, loadBenchmark]);

  // ── Derived chart data ──

  const chartData = useMemo<ChartPoint[]>(() => {
    if (snapshots.length < 2) return [];

    // Append current value as the most recent point
    const portfolioItems: { date: string; value: number }[] = [
      ...snapshots,
      { date: new Date().toISOString().slice(0, 10), value: currentValue },
    ];

    const normalizedPortfolio = normalizeToPercent(portfolioItems);

    if (!showBenchmark || benchmarkPrices.length === 0) {
      return normalizedPortfolio.map((p, i) => ({
        date: formatDateShort(portfolioItems[i]?.date ?? p.date),
        portfolioPct: parseFloat(p.pct.toFixed(2)),
      }));
    }

    // Normalize benchmark aligned to same start date
    const startDate = portfolioItems[0].date;
    const filteredBenchmark = benchmarkPrices.filter((b) => b.date >= startDate);
    const normalizedBenchmark = normalizeToPercent(
      filteredBenchmark.map((b) => ({ date: b.date, value: b.close }))
    );
    const benchmarkMap = new Map(normalizedBenchmark.map((b) => [b.date, b.pct]));

    return normalizedPortfolio.map((p, i) => {
      const rawDate = portfolioItems[i]?.date ?? '';
      const bPct = benchmarkMap.get(rawDate.slice(0, 10));
      return {
        date: formatDateShort(rawDate),
        portfolioPct: parseFloat(p.pct.toFixed(2)),
        benchmarkPct: bPct !== undefined ? parseFloat(bPct.toFixed(2)) : undefined,
      };
    });
  }, [snapshots, currentValue, showBenchmark, benchmarkPrices]);

  const totalReturn = useMemo(() => {
    if (snapshots.length === 0) return null;
    const startValue = snapshots[0].value;
    if (startValue === 0) return null;
    const dollarReturn = currentValue - startValue;
    const pctReturn = (dollarReturn / startValue) * 100;
    return { dollarReturn, pctReturn };
  }, [snapshots, currentValue]);

  const isPositive = (totalReturn?.pctReturn ?? 0) >= 0;
  const hasEnoughData = snapshots.length >= 2;

  // ── Render ──

  return (
    <div className="perf-chart">
      {/* Header */}
      <div className="perf-chart__header">
        <div className="perf-chart__title">
          <TrendingUp size={20} />
          <h2>Portfolio Performance</h2>
        </div>

        {totalReturn !== null && (
          <div
            className={`perf-chart__return ${isPositive ? 'perf-chart__return--up' : 'perf-chart__return--down'}`}
          >
            <span className="perf-chart__return-pct">{formatPercent(totalReturn.pctReturn)}</span>
            <span className="perf-chart__return-dollar">
              {isPositive ? '+' : ''}
              {formatCurrency(totalReturn.dollarReturn)}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="perf-chart__controls">
        {/* Time range buttons */}
        <div className="perf-chart__ranges">
          {RANGES.map((r) => (
            <button
              key={r}
              className={`perf-chart__range-btn${timeRange === r ? ' perf-chart__range-btn--active' : ''}`}
              onClick={() => setTimeRange(r)}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Benchmark controls */}
        <div className="perf-chart__benchmark-controls">
          <label className="perf-chart__benchmark-toggle">
            <input
              type="checkbox"
              checked={showBenchmark}
              onChange={(e) => setShowBenchmark(e.target.checked)}
            />
            <span>Show benchmark</span>
          </label>

          {showBenchmark && (
            <select
              className="perf-chart__benchmark-select"
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value as BenchmarkSymbol)}
            >
              {BENCHMARK_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="perf-chart__body">
        {loading ? (
          <div className="perf-chart__loading">
            <Loader2 size={24} className="perf-chart__spinner" />
            <span>Loading performance data…</span>
          </div>
        ) : !hasEnoughData ? (
          <div className="perf-chart__empty">
            <TrendingUp size={40} />
            <p>Not enough data yet.</p>
            <p className="perf-chart__empty-sub">
              Portfolio snapshots are taken daily. Check back after a few days.
            </p>
          </div>
        ) : (
          <div className="perf-chart__chart-wrap">
            {benchmarkLoading && showBenchmark && (
              <div className="perf-chart__benchmark-loading">
                <Loader2 size={14} className="perf-chart__spinner" />
                <span>Loading {benchmark}…</span>
              </div>
            )}
            <TouchableChart height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={isPositive ? 'var(--accent)' : '#ef4444'}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="95%"
                      stopColor={isPositive ? 'var(--accent)' : '#ef4444'}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />

                <Tooltip content={<PerfTooltip />} />

                {showBenchmark && (
                  <Legend
                    iconType="line"
                    wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="portfolioPct"
                  name="Portfolio"
                  stroke={isPositive ? 'var(--accent)' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />

                {showBenchmark && (
                  <Line
                    type="monotone"
                    dataKey="benchmarkPct"
                    name={benchmark}
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                )}
              </ComposedChart>
            </TouchableChart>
          </div>
        )}
      </div>
    </div>
  );
}
