/**
 * ComparisonMode Component
 * Side-by-side comparison of two tickers with normalized price charts
 * and quantitative metrics comparison table.
 */

import { useState, useMemo, useCallback, memo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { TouchableChart } from './TouchableChart';
import {
  ArrowRightLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  BarChart3,
  Target,
  Zap,
} from 'lucide-react';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import './ComparisonMode.css';

const log = createLogger('ComparisonMode');

interface ComparisonModeProps {
  initialSymbolA?: string;
  initialSymbolB?: string;
}

interface HistoricalPrice {
  date: string;
  close: number;
}

interface QuantMetrics {
  symbol: string;
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  max_drawdown: number;
  rsi: number;
  signal: string;
  confidence: number;
}

interface ChartDataPoint {
  date: string;
  a: number;
  b: number;
}

type TimeRange = '1M' | '3M' | '6M' | '1Y';

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

function filterByTimeRange(
  prices: HistoricalPrice[],
  range: TimeRange
): HistoricalPrice[] {
  const days = TIME_RANGE_DAYS[range];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return prices.filter((p) => p.date >= cutoffStr);
}

function normalizeToPercent(prices: HistoricalPrice[]): number[] {
  if (prices.length === 0) return [];
  const base = prices[0].close;
  if (base === 0) return prices.map(() => 0);
  return prices.map((p) => ((p.close - base) / base) * 100);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatMetric(value: number, isPercent = false): string {
  if (isPercent) return `${(value * 100).toFixed(2)}%`;
  return value.toFixed(3);
}

function ComparisonMode({
  initialSymbolA = '',
  initialSymbolB = '',
}: ComparisonModeProps) {
  const { addToast } = useToast();

  const [symbolA, setSymbolA] = useState(initialSymbolA.toUpperCase());
  const [symbolB, setSymbolB] = useState(initialSymbolB.toUpperCase());
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const [pricesA, setPricesA] = useState<HistoricalPrice[]>([]);
  const [pricesB, setPricesB] = useState<HistoricalPrice[]>([]);
  const [metricsA, setMetricsA] = useState<QuantMetrics | null>(null);
  const [metricsB, setMetricsB] = useState<QuantMetrics | null>(null);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [comparedSymbols, setComparedSymbols] = useState<[string, string]>(['', '']);

  const handleCompare = useCallback(async () => {
    const a = symbolA.trim().toUpperCase();
    const b = symbolB.trim().toUpperCase();

    if (!a || !b) {
      addToast('Please enter both symbols', 'warning');
      return;
    }
    if (a === b) {
      addToast('Please enter two different symbols', 'warning');
      return;
    }

    setLoading(true);
    log.info(`Comparing ${a} vs ${b}`);

    try {
      const [histA, histB, quantA, quantB, prices] = await Promise.all([
        invokeWithResilience<HistoricalPrice[]>('get_historical_prices', { symbol: a, days: 365 }),
        invokeWithResilience<HistoricalPrice[]>('get_historical_prices', { symbol: b, days: 365 }),
        invokeWithResilience<QuantMetrics>('get_quant_metrics_single', { symbol: a }),
        invokeWithResilience<QuantMetrics>('get_quant_metrics_single', { symbol: b }),
        invokeWithResilience<Record<string, number>>('get_current_prices_batch', { symbols: [a, b] }),
      ]);

      setPricesA(histA);
      setPricesB(histB);
      setMetricsA(quantA);
      setMetricsB(quantB);
      setCurrentPrices(prices);
      setComparedSymbols([a, b]);
      addToast(`Comparison loaded: ${a} vs ${b}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Comparison failed', msg);
      addToast(`Comparison failed: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [symbolA, symbolB, addToast]);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (pricesA.length === 0 || pricesB.length === 0) return [];

    const filteredA = filterByTimeRange(pricesA, timeRange);
    const filteredB = filterByTimeRange(pricesB, timeRange);

    // Build a date map from both series
    const dateMap = new Map<string, { a?: number; b?: number }>();

    const normA = normalizeToPercent(filteredA);
    filteredA.forEach((p, i) => {
      const entry = dateMap.get(p.date) || {};
      entry.a = normA[i];
      dateMap.set(p.date, entry);
    });

    const normB = normalizeToPercent(filteredB);
    filteredB.forEach((p, i) => {
      const entry = dateMap.get(p.date) || {};
      entry.b = normB[i];
      dateMap.set(p.date, entry);
    });

    const sorted = Array.from(dateMap.entries())
      .filter(([, v]) => v.a !== undefined && v.b !== undefined)
      .sort(([da], [db]) => da.localeCompare(db))
      .map(([date, v]) => ({
        date,
        a: v.a as number,
        b: v.b as number,
      }));

    return sorted;
  }, [pricesA, pricesB, timeRange]);

  const metricRows = useMemo(() => {
    if (!metricsA || !metricsB) return [];

    const rows = [
      {
        label: 'Sharpe Ratio',
        icon: Shield,
        a: metricsA.sharpe_ratio,
        b: metricsB.sharpe_ratio,
        format: (v: number) => formatMetric(v),
        higherBetter: true,
      },
      {
        label: 'Annualized Return',
        icon: TrendingUp,
        a: metricsA.annualized_return,
        b: metricsB.annualized_return,
        format: (v: number) => formatMetric(v, true),
        higherBetter: true,
      },
      {
        label: 'Volatility',
        icon: Activity,
        a: metricsA.volatility,
        b: metricsB.volatility,
        format: (v: number) => formatMetric(v, true),
        higherBetter: false,
      },
      {
        label: 'Max Drawdown',
        icon: TrendingDown,
        a: metricsA.max_drawdown,
        b: metricsB.max_drawdown,
        format: (v: number) => formatMetric(v, true),
        higherBetter: false,
      },
      {
        label: 'RSI',
        icon: BarChart3,
        a: metricsA.rsi,
        b: metricsB.rsi,
        format: (v: number) => v.toFixed(1),
        higherBetter: null, // neutral
      },
      {
        label: 'Signal',
        icon: Target,
        a: metricsA.signal,
        b: metricsB.signal,
        format: (v: string) => v,
        higherBetter: null,
        isString: true,
      },
    ];

    return rows;
  }, [metricsA, metricsB]);

  const verdict = useMemo(() => {
    if (!metricsA || !metricsB) return null;
    const [a, b] = comparedSymbols;

    let aWins = 0;
    let bWins = 0;
    const comparableMetrics = metricRows.filter((r) => r.higherBetter !== null && !r.isString);

    for (const row of comparableMetrics) {
      const valA = row.a as number;
      const valB = row.b as number;
      if (row.higherBetter) {
        if (valA > valB) aWins++;
        else if (valB > valA) bWins++;
      } else {
        // lower is better (volatility, drawdown)
        if (Math.abs(valA) < Math.abs(valB)) aWins++;
        else if (Math.abs(valB) < Math.abs(valA)) bWins++;
      }
    }

    const total = comparableMetrics.length;
    const winner = aWins > bWins ? a : bWins > aWins ? b : null;
    const loser = winner === a ? b : a;
    const winCount = Math.max(aWins, bWins);

    let assessment = '';
    if (metricsA.sharpe_ratio > metricsB.sharpe_ratio) {
      assessment = `${a} has a superior risk-adjusted return (Sharpe ${metricsA.sharpe_ratio.toFixed(2)} vs ${metricsB.sharpe_ratio.toFixed(2)}).`;
    } else {
      assessment = `${b} has a superior risk-adjusted return (Sharpe ${metricsB.sharpe_ratio.toFixed(2)} vs ${metricsA.sharpe_ratio.toFixed(2)}).`;
    }

    return {
      winner,
      loser,
      aWins,
      bWins,
      total,
      winCount,
      assessment,
      summary: winner
        ? `${winner} outperforms ${loser} on ${winCount}/${total} metrics.`
        : `${a} and ${b} are evenly matched across ${total} metrics.`,
    };
  }, [metricsA, metricsB, comparedSymbols, metricRows]);

  const hasData = pricesA.length > 0 && pricesB.length > 0;

  return (
    <div className="comparison-mode">
      <div className="page-header">
        <div className="page-title">
          <ArrowRightLeft size={22} />
          <h2>Compare Tickers</h2>
        </div>
      </div>

      {/* Dual Symbol Picker */}
      <div className="comparison-picker card">
        <div className="picker-inputs">
          <div className="picker-field">
            <label className="text-muted">Symbol A</label>
            <input
              type="text"
              className="picker-input"
              value={symbolA}
              onChange={(e) => setSymbolA(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              maxLength={10}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCompare();
              }}
            />
          </div>
          <div className="picker-vs">
            <span className="text-muted">vs</span>
          </div>
          <div className="picker-field">
            <label className="text-muted">Symbol B</label>
            <input
              type="text"
              className="picker-input"
              value={symbolB}
              onChange={(e) => setSymbolB(e.target.value.toUpperCase())}
              placeholder="e.g. MSFT"
              maxLength={10}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCompare();
              }}
            />
          </div>
          <button
            className="btn-primary compare-btn"
            onClick={handleCompare}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Loading...
              </>
            ) : (
              'Compare'
            )}
          </button>
        </div>
      </div>

      {/* Price Performance Chart */}
      {hasData && (
        <div className="comparison-chart card">
          <div className="chart-header">
            <h3>
              Price Performance (% Change)
            </h3>
            <div className="time-range-selector">
              {(['1M', '3M', '6M', '1Y'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-prices">
            {currentPrices[comparedSymbols[0]] !== undefined && (
              <span className="current-price price-a">
                {comparedSymbols[0]}: ${currentPrices[comparedSymbols[0]]?.toFixed(2)}
              </span>
            )}
            {currentPrices[comparedSymbols[1]] !== undefined && (
              <span className="current-price price-b">
                {comparedSymbols[1]}: ${currentPrices[comparedSymbols[1]]?.toFixed(2)}
              </span>
            )}
          </div>
          <div className="chart-container">
            <TouchableChart height={360}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                          {label}
                        </div>
                        {payload.map((entry) => (
                          <div
                            key={entry.dataKey}
                            style={{ color: entry.color, fontFamily: 'var(--font-mono)' }}
                          >
                            {entry.dataKey === 'a' ? comparedSymbols[0] : comparedSymbols[1]}:{' '}
                            {formatPercent(Number(entry.value))}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === 'a' ? comparedSymbols[0] : comparedSymbols[1]
                  }
                />
                <Line
                  type="monotone"
                  dataKey="a"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  name="a"
                />
                <Line
                  type="monotone"
                  dataKey="b"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  name="b"
                />
              </LineChart>
            </TouchableChart>
          </div>
        </div>
      )}

      {/* Metrics Comparison Table */}
      {metricsA && metricsB && (
        <div className="comparison-metrics card">
          <h3>Metrics Comparison</h3>
          <table className="data-table metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="symbol-col">{comparedSymbols[0]}</th>
                <th className="symbol-col">{comparedSymbols[1]}</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => {
                let winnerSide: 'a' | 'b' | null = null;
                if (row.higherBetter !== null && !row.isString) {
                  const valA = row.a as number;
                  const valB = row.b as number;
                  if (row.higherBetter) {
                    winnerSide = valA > valB ? 'a' : valB > valA ? 'b' : null;
                  } else {
                    winnerSide =
                      Math.abs(valA) < Math.abs(valB)
                        ? 'a'
                        : Math.abs(valB) < Math.abs(valA)
                          ? 'b'
                          : null;
                  }
                }

                const Icon = row.icon;
                return (
                  <tr key={row.label}>
                    <td className="metric-label">
                      <Icon size={14} />
                      {row.label}
                    </td>
                    <td
                      className={`font-mono metric-value ${winnerSide === 'a' ? 'winner' : ''}`}
                    >
                      {row.isString
                        ? (row.a as string)
                        : (row.format as (v: number) => string)(row.a as number)}
                    </td>
                    <td
                      className={`font-mono metric-value ${winnerSide === 'b' ? 'winner' : ''}`}
                    >
                      {row.isString
                        ? (row.b as string)
                        : (row.format as (v: number) => string)(row.b as number)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Verdict */}
      {verdict && (
        <div className="comparison-verdict card">
          <div className="verdict-header">
            <Zap size={18} />
            <h3>Verdict</h3>
          </div>
          <p className="verdict-summary">{verdict.summary}</p>
          <p className="verdict-assessment text-muted">{verdict.assessment}</p>
          {verdict.winner && (
            <div className="verdict-recommendation">
              On a risk-adjusted basis,{' '}
              <strong>{verdict.winner}</strong> appears to be the stronger pick
              with {verdict.winCount} favorable metrics out of {verdict.total}.
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!hasData && !loading && (
        <div className="comparison-empty card">
          <ArrowRightLeft size={40} className="text-muted" />
          <p className="text-muted">
            Enter two ticker symbols above and click Compare to see a side-by-side analysis.
          </p>
        </div>
      )}
    </div>
  );
}
export { ComparisonMode };
export default memo(ComparisonMode);
