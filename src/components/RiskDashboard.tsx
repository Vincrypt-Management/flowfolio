/**
 * RiskDashboard Component
 * Portfolio risk analysis with composite score gauge, metrics cards,
 * concentration risk, correlation heatmap, VaR display, and drawdown chart.
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { DEFAULT_SYMBOLS } from '../shared/constants';
import {
  Shield,
  Activity,
  TrendingDown,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Zap,
  Target,
  Info,
  FlaskConical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ExposureChart } from './ExposureChart';
import { ScenarioAnalysis } from './ScenarioAnalysis';
import { PortfolioHolding as Holding } from '../hooks/useAppState';
import './RiskDashboard.css';

interface RiskDashboardProps {
  holdings: Holding[];
  portfolioValue: number;
  marketPrices?: Record<string, number>;
  onRefresh?: () => void;
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

interface SymbolMetrics {
  symbol: string;
  weight: number;
  metrics: QuantMetrics;
}

// --- Constants ---

const VAR_Z_SCORE = 1.645; // 95% confidence

// --- Helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function riskColor(score: number): string {
  if (score <= 30) return 'var(--success)';
  if (score <= 60) return 'var(--warning)';
  return 'var(--error)';
}

function riskLabel(score: number): string {
  if (score <= 30) return 'Low Risk';
  if (score <= 60) return 'Moderate';
  return 'High Risk';
}

function concentrationColor(weight: number): string {
  if (weight > 25) return 'var(--error)';
  if (weight >= 15) return 'var(--warning)';
  return 'var(--success)';
}

function correlationColor(corr: number): string {
  if (corr >= 0.7) return 'var(--color-correlation-high, #ef4444)';
  if (corr >= 0.3) return 'var(--color-correlation-med, #f59e0b)';
  if (corr >= 0) return 'var(--color-correlation-low, #22c55e)';
  return 'var(--color-correlation-neg, #3b82f6)';
}

/**
 * Calculate a simple pseudo-correlation based on volatility and return similarity.
 * Real correlation requires historical price series; this is a reasonable proxy.
 */
function pseudoCorrelation(a: QuantMetrics, b: QuantMetrics): number {
  if (a.symbol === b.symbol) return 1.0;

  const volDiff = Math.abs(a.volatility - b.volatility);
  const retDiff = Math.abs(a.annualized_return - b.annualized_return);
  const signalMatch = a.signal === b.signal ? 0.2 : -0.1;

  // Closer volatility and returns = higher correlation estimate
  const volSim = Math.max(0, 1 - volDiff / 0.5);
  const retSim = Math.max(0, 1 - retDiff / 0.5);

  const corr = (volSim * 0.4 + retSim * 0.4 + signalMatch) * 0.9;
  return clamp(corr, -1, 1);
}

/**
 * Compute composite risk score (0-100) from portfolio metrics.
 */
function computeRiskScore(
  symbolMetrics: SymbolMetrics[],
  maxConcentration: number
): number {
  if (symbolMetrics.length === 0) return 0;

  // Weighted portfolio volatility
  const portfolioVol = symbolMetrics.reduce(
    (sum, sm) => sum + sm.weight * sm.metrics.volatility,
    0
  );

  // Weighted max drawdown
  const portfolioDrawdown = symbolMetrics.reduce(
    (sum, sm) => sum + sm.weight * Math.abs(sm.metrics.max_drawdown),
    0
  );

  // Volatility score: 0-40% vol maps to 0-40 points
  const volScore = clamp((portfolioVol / 0.4) * 40, 0, 40);

  // Drawdown score: 0-50% dd maps to 0-30 points
  const ddScore = clamp((portfolioDrawdown / 0.5) * 30, 0, 30);

  // Concentration score: HHI-based, 0-15 points
  const concScore = clamp((maxConcentration / 50) * 15, 0, 15);

  // Sharpe penalty: low sharpe adds risk, 0-15 points
  const avgSharpe = symbolMetrics.reduce(
    (sum, sm) => sum + sm.weight * sm.metrics.sharpe_ratio,
    0
  );
  const sharpeScore = clamp(((2 - avgSharpe) / 4) * 15, 0, 15);

  return Math.round(clamp(volScore + ddScore + concScore + sharpeScore, 0, 100));
}

// --- SVG Gauge ---

function RiskGauge({ score }: { score: number }) {
  const radius = 80;
  const strokeWidth = 14;
  const cx = 100;
  const cy = 95;
  const circumference = Math.PI * radius;
  const progress = clamp(score / 100, 0, 1);
  const dashLen = progress * circumference;
  const gapLen = circumference - dashLen;

  const color = riskColor(score);

  return (
    <div className="risk-gauge">
      <svg viewBox="0 0 200 110" className="risk-gauge-svg">
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${gapLen}`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.6s ease' }}
        />
        {/* Score label */}
        <text
          x={cx}
          y={cy - 15}
          textAnchor="middle"
          className="risk-gauge-score"
          fill={color}
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          className="risk-gauge-label"
          fill="var(--text-muted)"
        >
          {riskLabel(score)}
        </text>
      </svg>
    </div>
  );
}

// --- Component ---

function RiskDashboard({
  holdings: propHoldings,
  portfolioValue: propPortfolioValue,
  marketPrices,
  onRefresh,
}: RiskDashboardProps) {
  const [symbolMetrics, setSymbolMetrics] = useState<SymbolMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);

  // Build demo holdings from market prices when none provided
  const isDemo = propHoldings.length === 0;
  const { holdings, portfolioValue } = useMemo(() => {
    if (propHoldings.length > 0) {
      return { holdings: propHoldings, portfolioValue: propPortfolioValue };
    }
    // Generate equal-weight demo portfolio from DEFAULT_SYMBOLS
    const prices = marketPrices ?? {};
    const syms = DEFAULT_SYMBOLS.filter((s) => (prices[s] ?? 0) > 0);
    if (syms.length === 0) {
      return { holdings: [] as Holding[], portfolioValue: 0 };
    }
    const weight = 1 / syms.length;
    const demoHoldings: Holding[] = syms.map((symbol) => {
      const price = prices[symbol];
      return {
        symbol,
        shares: 10,
        currentPrice: price,
        value: price * 10,
        weight,
      };
    });
    const total = demoHoldings.reduce((s, h) => s + h.value, 0);
    return { holdings: demoHoldings, portfolioValue: total };
  }, [propHoldings, propPortfolioValue, marketPrices]);

  const fetchMetrics = useCallback(async () => {
    if (holdings.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        holdings.map(async (h) => {
          const metrics = await invokeWithResilience<QuantMetrics>('get_quant_metrics_single', {
            symbol: h.symbol,
          });
          return { symbol: h.symbol, weight: h.weight, metrics };
        })
      );

      const successful: SymbolMetrics[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          successful.push(r.value);
        }
      }

      if (successful.length === 0 && holdings.length > 0) {
        setError('Could not fetch metrics for any holdings');
      }

      setSymbolMetrics(successful);
    } catch {
      setError('Failed to fetch risk metrics');
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Computed values
  const maxConcentration = useMemo(
    () =>
      holdings.length > 0
        ? Math.max(...holdings.map((h) => h.weight * 100))
        : 0,
    [holdings]
  );

  const riskScore = useMemo(
    () => computeRiskScore(symbolMetrics, maxConcentration),
    [symbolMetrics, maxConcentration]
  );

  const portfolioVolatility = useMemo(
    () =>
      symbolMetrics.reduce((sum, sm) => sum + sm.weight * sm.metrics.volatility, 0),
    [symbolMetrics]
  );

  const portfolioMaxDrawdown = useMemo(
    () =>
      symbolMetrics.reduce(
        (sum, sm) => sum + sm.weight * Math.abs(sm.metrics.max_drawdown),
        0
      ),
    [symbolMetrics]
  );

  const portfolioSharpe = useMemo(
    () =>
      symbolMetrics.reduce(
        (sum, sm) => sum + sm.weight * sm.metrics.sharpe_ratio,
        0
      ),
    [symbolMetrics]
  );

  // VaR (95%) - 1 day
  const dailyVol = portfolioVolatility / Math.sqrt(252);
  const var95 = portfolioValue * dailyVol * VAR_Z_SCORE;

  // Correlation matrix
  const correlationPairs = useMemo(() => {
    if (symbolMetrics.length < 2) return [];
    const pairs: Array<{
      symbolA: string;
      symbolB: string;
      correlation: number;
    }> = [];
    for (let i = 0; i < symbolMetrics.length; i++) {
      for (let j = i + 1; j < symbolMetrics.length; j++) {
        pairs.push({
          symbolA: symbolMetrics[i].symbol,
          symbolB: symbolMetrics[j].symbol,
          correlation: pseudoCorrelation(
            symbolMetrics[i].metrics,
            symbolMetrics[j].metrics
          ),
        });
      }
    }
    return pairs;
  }, [symbolMetrics]);

  // Synthetic drawdown timeline data
  const drawdownData = useMemo(() => {
    if (symbolMetrics.length === 0) return [];

    const points: Array<{ day: string; drawdown: number }> = [];
    const totalDays = 60;

    // Generate a synthetic drawdown curve based on actual max drawdown
    const maxDD = portfolioMaxDrawdown;
    const peakDay = Math.floor(totalDays * 0.3);
    const troughDay = Math.floor(totalDays * 0.6);

    for (let i = 0; i < totalDays; i++) {
      let dd = 0;
      if (i <= peakDay) {
        dd = 0;
      } else if (i <= troughDay) {
        const progress = (i - peakDay) / (troughDay - peakDay);
        dd = -maxDD * 100 * Math.sin((progress * Math.PI) / 2);
      } else {
        const recovery = (i - troughDay) / (totalDays - troughDay);
        dd = -maxDD * 100 * (1 - recovery * 0.7);
      }

      const date = new Date();
      date.setDate(date.getDate() - (totalDays - i));
      points.push({
        day: date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        drawdown: Math.round(dd * 100) / 100,
      });
    }

    return points;
  }, [symbolMetrics, portfolioMaxDrawdown]);

  const handleRefresh = useCallback(() => {
    fetchMetrics();
    onRefresh?.();
  }, [fetchMetrics, onRefresh]);

  if (holdings.length === 0) {
    return (
      <div className="risk-dashboard">
        <div className="risk-dashboard-empty">
          <Shield size={32} />
          <p>Waiting for market data to load...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="risk-dashboard">
      {/* Demo banner */}
      {isDemo && (
        <div className="risk-demo-banner">
          <Info size={14} />
          <span>Showing equal-weight demo analysis using default symbols. Add portfolio holdings for personalized risk metrics.</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header risk-dashboard-header">
        <div className="page-title">
          <Shield size={20} />
          <h2>Risk Dashboard</h2>
        </div>
        <button
          className="btn-secondary btn-small"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="risk-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Top row: Gauge + Metrics Cards */}
      <div className="risk-top-row">
        <div className="card risk-gauge-card">
          <RiskGauge score={riskScore} />
          <div className="risk-gauge-subtitle text-muted">
            Composite Risk Score
          </div>
        </div>

        <div className="risk-metrics-grid">
          <div className="card risk-metric-card">
            <div className="risk-metric-icon">
              <Activity size={16} />
            </div>
            <div className="risk-metric-value font-mono">
              {(portfolioVolatility * 100).toFixed(1)}%
            </div>
            <div className="risk-metric-label text-muted">Volatility</div>
          </div>

          <div className="card risk-metric-card">
            <div className="risk-metric-icon risk-metric-icon--warning">
              <TrendingDown size={16} />
            </div>
            <div className="risk-metric-value font-mono">
              {(portfolioMaxDrawdown * 100).toFixed(1)}%
            </div>
            <div className="risk-metric-label text-muted">Max Drawdown</div>
          </div>

          <div className="card risk-metric-card">
            <div className="risk-metric-icon risk-metric-icon--accent">
              <Zap size={16} />
            </div>
            <div className="risk-metric-value font-mono">
              {portfolioSharpe.toFixed(2)}
            </div>
            <div className="risk-metric-label text-muted">Sharpe Ratio</div>
          </div>

          <div className="card risk-metric-card">
            <div className="risk-metric-icon risk-metric-icon--dim">
              <Target size={16} />
            </div>
            <div className="risk-metric-value font-mono">--</div>
            <div className="risk-metric-label text-muted">Beta</div>
          </div>
        </div>
      </div>

      {/* VaR Display */}
      <div className="card risk-var-card">
        <div className="risk-var-header">
          <AlertTriangle size={16} />
          <span>Value at Risk (95%)</span>
        </div>
        <div className="risk-var-value font-mono">
          ${var95.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="risk-var-desc text-muted">
          at risk over 1 day at 95% confidence
        </div>
      </div>

      {/* Concentration Risk */}
      <div className="card risk-concentration-card">
        <h3 className="risk-section-title">
          <BarChart3 size={16} />
          Concentration Risk
        </h3>
        <div className="risk-concentration-bars">
          {holdings
            .slice()
            .sort((a, b) => b.weight - a.weight)
            .map((h) => {
              const pct = h.weight * 100;
              return (
                <div key={h.symbol} className="risk-bar-row">
                  <span className="risk-bar-label font-mono">{h.symbol}</span>
                  <div className="risk-bar-track">
                    <div
                      className="risk-bar-fill"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: concentrationColor(pct),
                      }}
                    />
                  </div>
                  <span className="risk-bar-value font-mono">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Correlation Heatmap */}
      {correlationPairs.length > 0 && (
        <div className="card risk-correlation-card">
          <h3 className="risk-section-title">
            <Activity size={16} />
            Correlation Matrix
          </h3>
          <div className="risk-correlation-grid">
            {correlationPairs.map((pair) => (
              <div
                key={`${pair.symbolA}-${pair.symbolB}`}
                className="risk-correlation-cell"
                style={{ backgroundColor: correlationColor(pair.correlation) }}
                title={`${pair.symbolA} / ${pair.symbolB}: ${pair.correlation.toFixed(2)}`}
              >
                <span className="risk-correlation-pair">
                  {pair.symbolA}/{pair.symbolB}
                </span>
                <span className="risk-correlation-value font-mono">
                  {pair.correlation.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drawdown Timeline */}
      {drawdownData.length > 0 && (
        <div className="card risk-drawdown-card">
          <h3 className="risk-section-title">
            <TrendingDown size={16} />
            Drawdown Timeline
          </h3>
          <div className="risk-drawdown-chart">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--error)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--error)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={['dataMin', 0]}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                  }}
                  formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}%`, 'Drawdown']}
                />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="var(--error)"
                  strokeWidth={2}
                  fill="url(#drawdownGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sector / Geographic Exposure */}
      <div className="card risk-exposure-card">
        <h3 className="risk-section-title">
          <BarChart3 size={16} />
          Sector Exposure
        </h3>
        <ExposureChart
          holdings={holdings.map((h) => ({
            symbol: h.symbol,
            value: h.value,
            weight: h.weight,
          }))}
        />
      </div>

      {/* Scenario Analysis (collapsible) */}
      <div className="card risk-scenario-card">
        <button
          className="risk-scenario-toggle"
          onClick={() => setScenarioOpen((v) => !v)}
          aria-expanded={scenarioOpen}
        >
          <FlaskConical size={16} />
          <span>What-If Scenario Analysis</span>
          {scenarioOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {scenarioOpen && (
          <div className="risk-scenario-body">
            <ScenarioAnalysis holdings={holdings} portfolioValue={portfolioValue} />
          </div>
        )}
      </div>
    </div>
  );
}
export { RiskDashboard };
export default memo(RiskDashboard);
