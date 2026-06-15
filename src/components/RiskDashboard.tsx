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
  Zap,
  Target,
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
} from 'recharts';
import { TouchableChart } from './TouchableChart';
import { ExposureChart } from './ExposureChart';
import { ScenarioAnalysis } from './ScenarioAnalysis';
import { PortfolioHolding as Holding } from '../hooks/useAppState';
import { AiInlinePanel } from './AiInlinePanel';
import { buildRiskPrompt, type RiskInput } from '../services/agentSurfaces';
import { Button, MetricCard, Alert, Gauge, Heatmap } from '@flowfolio/ui';
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

const RISK_ZONES = [
  { upTo: 30, color: 'var(--success)', label: 'Low Risk' },
  { upTo: 60, color: 'var(--warning)', label: 'Moderate' },
  { upTo: 100, color: 'var(--error)', label: 'High Risk' },
];

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

  const correlationMatrix = useMemo(() => {
    const n = symbolMetrics.length;
    if (n < 2) return { symbols: [] as string[], values: [] as number[][] };
    const symbols = symbolMetrics.map((s) => s.symbol);
    const values: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(1);
        } else {
          const [a, b] = i < j ? [i, j] : [j, i];
          row.push(
            pseudoCorrelation(symbolMetrics[a].metrics, symbolMetrics[b].metrics)
          );
        }
      }
      values.push(row);
    }
    return { symbols, values };
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

  // Assemble RiskInput for the AI summary panel — undefined fields when there are
  // no holdings render as 'n/a' placeholders in the prompt.
  const riskInput: RiskInput = useMemo(() => {
    const dailyVol = portfolioVolatility / Math.sqrt(252);
    const var95Pct =
      symbolMetrics.length > 0 ? dailyVol * VAR_Z_SCORE * 100 : undefined;
    const topConcentrations =
      symbolMetrics.length > 0
        ? [...symbolMetrics]
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map((sm) => ({ symbol: sm.symbol, weight: sm.weight * 100 }))
        : undefined;
    const avgCorrelation =
      correlationPairs.length > 0
        ? correlationPairs.reduce((sum, p) => sum + p.correlation, 0) /
          correlationPairs.length
        : undefined;

    return {
      compositeScore: symbolMetrics.length > 0 ? riskScore : undefined,
      volatility: symbolMetrics.length > 0 ? portfolioVolatility : undefined,
      maxDrawdown: symbolMetrics.length > 0 ? portfolioMaxDrawdown : undefined,
      var95: var95Pct,
      topConcentrations,
      avgCorrelation,
    };
  }, [
    riskScore,
    portfolioVolatility,
    portfolioMaxDrawdown,
    symbolMetrics,
    correlationPairs,
  ]);

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
        <Alert
          variant="info"
          title="Demo analysis"
          description="Equal-weighted across default symbols. Add portfolio holdings for personalized risk metrics."
        />
      )}

      {/* Header */}
      <div className="page-header risk-dashboard-header">
        <div className="page-title">
          <Shield size={20} />
          <h2>Risk Dashboard</h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          loading={loading}
          leftIcon={!loading ? <RefreshCw size={14} /> : undefined}
        >
          Refresh
        </Button>
      </div>

      {error && <Alert variant="error" title="Risk analysis failed" description={error} />}

      {/* Top row: Gauge + Metrics Cards */}
      <div className="risk-top-row">
        <div className="card risk-gauge-card">
          <Gauge
            value={riskScore}
            zones={RISK_ZONES}
            aria-label="Composite risk score"
          />
          <div className="risk-gauge-subtitle text-muted">
            Composite Risk Score
          </div>
        </div>

        <div className="risk-metrics-grid">
          <MetricCard
            label="Volatility"
            icon={<Activity size={14} />}
            value={`${(portfolioVolatility * 100).toFixed(1)}%`}
          />
          <MetricCard
            label="Max Drawdown"
            icon={<TrendingDown size={14} style={{ color: 'var(--warning)' }} />}
            value={`${(portfolioMaxDrawdown * 100).toFixed(1)}%`}
          />
          <MetricCard
            label="Sharpe Ratio"
            icon={<Zap size={14} style={{ color: 'var(--accent)' }} />}
            value={portfolioSharpe.toFixed(2)}
          />
          <MetricCard
            label="Beta"
            icon={<Target size={14} />}
            value="—"
          />
        </div>
      </div>

      {/* VaR Display */}
      <MetricCard
        className="risk-var-card"
        label="Value at Risk (95%)"
        icon={<AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
        value={`$${var95.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        change={
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            at risk over 1 day at 95% confidence
          </span>
        }
      />

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
      {correlationMatrix.symbols.length > 0 && (
        <div className="card risk-correlation-card">
          <h3 className="risk-section-title">
            <Activity size={16} />
            Correlation Matrix
          </h3>
          <Heatmap
            values={correlationMatrix.values}
            rowLabels={correlationMatrix.symbols}
            colLabels={correlationMatrix.symbols}
            domainMin={-1}
            domainMax={1}
            colorFor={correlationColor}
            aria-label="Pairwise correlation matrix"
          />
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
            <TouchableChart height={200}>
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
                  formatter={(value) => [`${(Number(value) || 0).toFixed(2)}%`, 'Drawdown']}
                />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#drawdownGrad)"
                />
              </AreaChart>
            </TouchableChart>
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

      {riskInput.compositeScore !== undefined && (
        <AiInlinePanel
          prompt={buildRiskPrompt(riskInput)}
          triggerLabel="Summarize risk"
          emptyHint="Get a plain-English read on this portfolio's risk profile."
        />
      )}
    </div>
  );
}
export { RiskDashboard };
export default memo(RiskDashboard);
