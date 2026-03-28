/**
 * ScenarioAnalysis Component
 * What-If scenario analysis for portfolio holdings.
 * Supports predefined macro scenarios, sector-weighted impact calculations,
 * a custom slider-based scenario builder, and a per-holding bar chart.
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { TouchableChart } from './TouchableChart';
import { FlaskConical, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';
import { PortfolioHolding as Holding } from '../hooks/useAppState';
import './ScenarioAnalysis.css';

const log = createLogger('scenario-analysis');

interface ScenarioAnalysisProps {
  holdings: Holding[];
  portfolioValue: number;
}

interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  /** Flat factor applied to all holdings (e.g. -0.20 = -20%) */
  factor?: number;
  /** Per-sector factors; _default used for sectors not listed */
  sectorFactors?: Record<string, number>;
}

interface HoldingImpact {
  symbol: string;
  currentValue: number;
  scenarioValue: number;
  changeDollar: number;
  changePct: number;
}

interface ScenarioResult {
  scenario: ScenarioDefinition;
  impacts: HoldingImpact[];
  totalCurrentValue: number;
  totalScenarioValue: number;
  totalChangeDollar: number;
  totalChangePct: number;
}

interface BackendFundamentalsMinimal {
  symbol: string;
  sector: string;
  industry: string;
}

// Custom scenario state
interface CustomScenario {
  overallFactor: number; // -50 to +50 (percentage)
  sectorOverrides: Record<string, number>; // sector name -> percentage override
}

// --- Constants ---

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'crash',
    name: 'Market Crash',
    description: 'Broad market decline of 20%',
    factor: -0.20,
  },
  {
    id: 'correction',
    name: 'Correction',
    description: '10% pullback across all sectors',
    factor: -0.10,
  },
  {
    id: 'tech-selloff',
    name: 'Tech Selloff',
    description: 'Tech -30%, others -10%',
    sectorFactors: {
      Technology: -0.30,
      'Information Technology': -0.30,
      _default: -0.10,
    },
  },
  {
    id: 'rates-up',
    name: 'Rising Rates',
    description: 'Growth -15%, Financials +5%',
    sectorFactors: {
      Technology: -0.15,
      'Information Technology': -0.15,
      Financials: 0.05,
      _default: -0.05,
    },
  },
  {
    id: 'recession',
    name: 'Recession',
    description: 'Deep recession, -25% across the board',
    factor: -0.25,
  },
  {
    id: 'bull',
    name: 'Bull Run',
    description: 'Sustained rally, +20%',
    factor: 0.20,
  },
];

const KNOWN_SECTORS = [
  'Technology',
  'Information Technology',
  'Financials',
  'Healthcare',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
];

// --- Helpers ---

function formatDollar(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  return `${sign}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function impactColor(changePct: number): string {
  if (changePct > 0) return 'var(--success)';
  if (changePct < -15) return 'var(--error)';
  if (changePct < -5) return 'var(--warning)';
  return 'var(--error)';
}

function applyFactor(
  holding: Holding,
  scenario: ScenarioDefinition,
  sectorMap: Record<string, string>
): HoldingImpact {
  let factor = 0;

  if (scenario.factor !== undefined) {
    factor = scenario.factor;
  } else if (scenario.sectorFactors) {
    const sector = sectorMap[holding.symbol] ?? '';
    if (sector && sector in scenario.sectorFactors) {
      factor = scenario.sectorFactors[sector];
    } else {
      factor = scenario.sectorFactors['_default'] ?? 0;
    }
  }

  const scenarioValue = holding.value * (1 + factor);
  const changeDollar = scenarioValue - holding.value;
  const changePct = factor * 100;

  return {
    symbol: holding.symbol,
    currentValue: holding.value,
    scenarioValue,
    changeDollar,
    changePct,
  };
}

function computeScenarioResult(
  scenario: ScenarioDefinition,
  holdings: Holding[],
  sectorMap: Record<string, string>
): ScenarioResult {
  const impacts = holdings.map((h) => applyFactor(h, scenario, sectorMap));
  const totalCurrentValue = impacts.reduce((s, i) => s + i.currentValue, 0);
  const totalScenarioValue = impacts.reduce((s, i) => s + i.scenarioValue, 0);
  const totalChangeDollar = totalScenarioValue - totalCurrentValue;
  const totalChangePct =
    totalCurrentValue > 0 ? (totalChangeDollar / totalCurrentValue) * 100 : 0;

  return {
    scenario,
    impacts,
    totalCurrentValue,
    totalScenarioValue,
    totalChangeDollar,
    totalChangePct,
  };
}

function buildCustomScenarioDefinition(custom: CustomScenario): ScenarioDefinition {
  const hasSectorOverrides = Object.keys(custom.sectorOverrides).length > 0;

  if (hasSectorOverrides) {
    const sectorFactors: Record<string, number> = {
      _default: custom.overallFactor / 100,
    };
    for (const [sector, pct] of Object.entries(custom.sectorOverrides)) {
      sectorFactors[sector] = pct / 100;
    }
    return {
      id: 'custom',
      name: 'Custom Scenario',
      description: `Overall ${custom.overallFactor >= 0 ? '+' : ''}${custom.overallFactor}% with sector overrides`,
      sectorFactors,
    };
  }

  return {
    id: 'custom',
    name: 'Custom Scenario',
    description: `Overall ${custom.overallFactor >= 0 ? '+' : ''}${custom.overallFactor}%`,
    factor: custom.overallFactor / 100,
  };
}

// --- Custom Tooltip ---

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: HoldingImpact }>;
  label?: string;
}

function CustomBarTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="scenario-bar-tooltip">
      <div className="scenario-bar-tooltip-symbol">{item.symbol}</div>
      <div>Current: ${item.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      <div>Scenario: ${item.scenarioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      <div style={{ color: item.changePct >= 0 ? 'var(--success)' : 'var(--error)' }}>
        {formatPct(item.changePct)} ({formatDollar(item.changeDollar)})
      </div>
    </div>
  );
}

// --- Main Component ---

function ScenarioAnalysis({ holdings, portfolioValue }: ScenarioAnalysisProps) {
  const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
  const [loadingSectors, setLoadingSectors] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('crash');
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [custom, setCustom] = useState<CustomScenario>({
    overallFactor: -10,
    sectorOverrides: {},
  });

  // Fetch sector data for all holdings
  const fetchSectors = useCallback(async () => {
    if (holdings.length === 0) return;
    setLoadingSectors(true);
    try {
      const symbols = holdings.map((h) => h.symbol);
      const result = await invokeWithResilience<Record<string, BackendFundamentalsMinimal>>(
        'get_fundamentals_batch',
        { symbols }
      );
      const map: Record<string, string> = {};
      for (const [symbol, data] of Object.entries(result) as [string, BackendFundamentalsMinimal][]) {
        map[symbol] = data.sector ?? '';
      }
      setSectorMap(map);
      log.info(`Fetched sector data for ${Object.keys(map).length} symbols`);
    } catch (err) {
      log.warn('Failed to fetch sector data for scenario analysis', err);
      // Non-fatal: scenario will use flat factor as fallback
    } finally {
      setLoadingSectors(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchSectors();
  }, [fetchSectors]);

  // Compute results for all predefined scenarios
  const predefinedResults = useMemo<ScenarioResult[]>(
    () => SCENARIOS.map((s) => computeScenarioResult(s, holdings, sectorMap)),
    [holdings, sectorMap]
  );

  // Compute result for custom scenario
  const customResult = useMemo<ScenarioResult>(() => {
    const def = buildCustomScenarioDefinition(custom);
    return computeScenarioResult(def, holdings, sectorMap);
  }, [custom, holdings, sectorMap]);

  // Active scenario result
  const activeResult = useMemo<ScenarioResult>(() => {
    if (selectedScenarioId === 'custom') return customResult;
    return (
      predefinedResults.find((r) => r.scenario.id === selectedScenarioId) ??
      predefinedResults[0]
    );
  }, [selectedScenarioId, predefinedResults, customResult]);

  // Chart data
  const chartData = useMemo(
    () => activeResult?.impacts ?? [],
    [activeResult]
  );

  // Sectors present in portfolio for custom overrides
  const portfolioSectors = useMemo(() => {
    const seen = new Set<string>();
    for (const h of holdings) {
      const s = sectorMap[h.symbol];
      if (s) seen.add(s);
    }
    return Array.from(seen).sort();
  }, [holdings, sectorMap]);

  const allSectorsForCustom = useMemo(() => {
    const combined = new Set([...portfolioSectors, ...KNOWN_SECTORS]);
    return Array.from(combined).sort();
  }, [portfolioSectors]);

  const handleSectorOverrideChange = useCallback(
    (sector: string, value: number) => {
      setCustom((prev) => ({
        ...prev,
        sectorOverrides: { ...prev.sectorOverrides, [sector]: value },
      }));
    },
    []
  );

  const handleRemoveSectorOverride = useCallback((sector: string) => {
    setCustom((prev) => {
      const next = { ...prev.sectorOverrides };
      delete next[sector];
      return { ...prev, sectorOverrides: next };
    });
  }, []);

  if (holdings.length === 0) {
    return (
      <div className="scenario-analysis">
        <div className="scenario-empty">
          <FlaskConical size={28} />
          <span>Add holdings to run scenario analysis</span>
        </div>
      </div>
    );
  }

  const totalImpactColor = activeResult
    ? activeResult.totalChangePct >= 0
      ? 'var(--success)'
      : 'var(--error)'
    : 'var(--text-main)';

  return (
    <div className="scenario-analysis">
      {/* Scenario selector pills */}
      <div className="scenario-pills">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={`scenario-pill${selectedScenarioId === s.id ? ' scenario-pill--active' : ''}`}
            onClick={() => setSelectedScenarioId(s.id)}
            title={s.description}
          >
            {s.name}
          </button>
        ))}
        <button
          className={`scenario-pill${selectedScenarioId === 'custom' ? ' scenario-pill--active' : ''}`}
          onClick={() => {
            setSelectedScenarioId('custom');
            setShowCustomBuilder(true);
          }}
        >
          <SlidersHorizontal size={13} />
          Custom
        </button>
      </div>

      {/* Active scenario description */}
      {activeResult && (
        <div className="scenario-active-desc text-muted">
          {activeResult.scenario.description}
          {loadingSectors && (
            <span className="scenario-loading-tag"> (loading sector data...)</span>
          )}
        </div>
      )}

      {/* Total portfolio impact banner */}
      {activeResult && (
        <div className="scenario-total-banner">
          <div className="scenario-total-left">
            <span className="scenario-total-label">Portfolio Impact</span>
            <span className="scenario-total-current font-mono">
              ${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {' '}
              <span className="text-muted">current</span>
            </span>
          </div>
          <div className="scenario-total-right">
            <span
              className="scenario-total-value font-mono"
              style={{ color: totalImpactColor }}
            >
              ${activeResult.totalScenarioValue.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </span>
            <span
              className="scenario-total-change font-mono"
              style={{ color: totalImpactColor }}
            >
              {formatDollar(activeResult.totalChangeDollar)}{' '}
              ({formatPct(activeResult.totalChangePct)})
            </span>
          </div>
        </div>
      )}

      {/* Per-holding bar chart */}
      {chartData.length > 0 && (
        <div className="scenario-chart-wrap">
          <TouchableChart height={Math.max(160, chartData.length * 36)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
            >
              <XAxis
                type="number"
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                tick={{ fill: 'var(--text-main)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomBarTooltip />} />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1} />
              <Bar dataKey="changePct" radius={[0, 3, 3, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.symbol}
                    fill={impactColor(entry.changePct)}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </TouchableChart>
        </div>
      )}

      {/* Per-holding table */}
      {activeResult && (
        <div className="scenario-table-wrap">
          <table className="scenario-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="text-right">Current Value</th>
                <th className="text-right">Scenario Value</th>
                <th className="text-right">Change ($)</th>
                <th className="text-right">Change (%)</th>
              </tr>
            </thead>
            <tbody>
              {activeResult.impacts.map((impact) => (
                <tr key={impact.symbol}>
                  <td className="font-mono scenario-table-symbol">{impact.symbol}</td>
                  <td className="text-right font-mono">
                    ${impact.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="text-right font-mono">
                    ${impact.scenarioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td
                    className="text-right font-mono"
                    style={{ color: impact.changeDollar >= 0 ? 'var(--success)' : 'var(--error)' }}
                  >
                    {formatDollar(impact.changeDollar)}
                  </td>
                  <td
                    className="text-right font-mono"
                    style={{ color: impact.changePct >= 0 ? 'var(--success)' : 'var(--error)' }}
                  >
                    {formatPct(impact.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="scenario-table-total">
                <td><strong>Total</strong></td>
                <td className="text-right font-mono">
                  ${activeResult.totalCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="text-right font-mono">
                  ${activeResult.totalScenarioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td
                  className="text-right font-mono"
                  style={{ color: activeResult.totalChangeDollar >= 0 ? 'var(--success)' : 'var(--error)' }}
                >
                  <strong>{formatDollar(activeResult.totalChangeDollar)}</strong>
                </td>
                <td
                  className="text-right font-mono"
                  style={{ color: activeResult.totalChangePct >= 0 ? 'var(--success)' : 'var(--error)' }}
                >
                  <strong>{formatPct(activeResult.totalChangePct)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Custom scenario builder */}
      <div className="scenario-custom-section">
        <button
          className="scenario-custom-toggle"
          onClick={() => setShowCustomBuilder((v) => !v)}
        >
          <SlidersHorizontal size={15} />
          Custom Scenario Builder
          {showCustomBuilder ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showCustomBuilder && (
          <div className="scenario-custom-body">
            {/* Overall market slider */}
            <div className="scenario-custom-row">
              <label className="scenario-custom-label">
                Overall Market
              </label>
              <div className="scenario-custom-slider-wrap">
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={custom.overallFactor}
                  onChange={(e) =>
                    setCustom((prev) => ({
                      ...prev,
                      overallFactor: Number(e.target.value),
                    }))
                  }
                  className="scenario-slider"
                />
                <span
                  className="scenario-custom-value font-mono"
                  style={{
                    color:
                      custom.overallFactor >= 0 ? 'var(--success)' : 'var(--error)',
                  }}
                >
                  {custom.overallFactor >= 0 ? '+' : ''}{custom.overallFactor}%
                </span>
              </div>
            </div>

            {/* Per-sector overrides */}
            <div className="scenario-custom-sector-header">
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                Sector Overrides (override the overall factor for specific sectors)
              </span>
            </div>

            {/* Active overrides */}
            {Object.entries(custom.sectorOverrides).map(([sector, pct]) => (
              <div key={sector} className="scenario-custom-row scenario-custom-row--override">
                <label className="scenario-custom-label scenario-custom-label--sector">
                  {sector}
                </label>
                <div className="scenario-custom-slider-wrap">
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={pct}
                    onChange={(e) =>
                      handleSectorOverrideChange(sector, Number(e.target.value))
                    }
                    className="scenario-slider"
                  />
                  <span
                    className="scenario-custom-value font-mono"
                    style={{ color: pct >= 0 ? 'var(--success)' : 'var(--error)' }}
                  >
                    {pct >= 0 ? '+' : ''}{pct}%
                  </span>
                  <button
                    className="scenario-remove-override"
                    onClick={() => handleRemoveSectorOverride(sector)}
                    title={`Remove ${sector} override`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {/* Add sector override */}
            <div className="scenario-custom-add-sector">
              <select
                className="scenario-sector-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleSectorOverrideChange(e.target.value, custom.overallFactor);
                  }
                }}
              >
                <option value="">+ Add sector override...</option>
                {allSectorsForCustom
                  .filter((s) => !(s in custom.sectorOverrides))
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </div>

            {/* Apply custom button */}
            <button
              className="btn-primary scenario-apply-btn"
              onClick={() => setSelectedScenarioId('custom')}
            >
              Apply Custom Scenario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export { ScenarioAnalysis };
export default memo(ScenarioAnalysis);
