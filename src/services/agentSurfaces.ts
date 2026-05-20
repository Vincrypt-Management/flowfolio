// Pure prompt builders for the three AI surfaces. Each declares its own
// narrow input type — DO NOT couple to shared/types/index.ts (its shapes
// drifted from what the components actually hold).

// ─── Backtest ────────────────────────────────────────────────────

export interface BacktestMetricsInput {
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

export interface BacktestInput {
  start_date: string;
  end_date: string;
  duration_months: number;
  metrics: BacktestMetricsInput;
}

export function buildBacktestPrompt(r: BacktestInput): string {
  const m = r.metrics;
  return [
    'You are a financial analyst. Explain the backtest result below in 3–4 short paragraphs.',
    'Cover: (1) headline performance, (2) risk profile, (3) anything unusual (drawdowns, Sharpe, turnover) worth flagging, (4) whether the result is suggestive or noisy given the duration.',
    'Be specific. No generic platitudes. No disclaimers.',
    '',
    `Period: ${r.start_date} → ${r.end_date} (${r.duration_months} months)`,
    `CAGR: ${m.cagr.toFixed(2)}%`,
    `Total return: ${m.total_return.toFixed(2)}%`,
    `Max drawdown: ${m.max_drawdown.toFixed(2)}%`,
    `Volatility: ${m.volatility.toFixed(2)}%`,
    `Sharpe ratio: ${m.sharpe_ratio.toFixed(2)}`,
    `Turnover: ${m.turnover.toFixed(2)}%`,
    `Trades: ${m.num_trades}`,
    `Final value: $${m.final_value.toFixed(0)} on $${m.total_invested.toFixed(0)} invested`,
  ].join('\n');
}

// ─── Vibe plan ────────────────────────────────────────────────────

export interface VibePlanFilter {
  name: string;
  operator: string;
  value: unknown;
}

export interface VibePlanFactor {
  name: string;
  weight: number;
}

export interface VibePlanInput {
  name: string;
  universe: {
    exchanges: string[];
    regions: string[];
    sectors: string[];
  };
  filters: VibePlanFilter[];
  ranking: {
    factors: VibePlanFactor[];
  };
  portfolio: {
    allocation_method: string;
    max_position_pct: number;
    cash_buffer_pct: number;
  };
  cadence: {
    quarterly_rebalance: boolean;
    rebalance_threshold_pct: number;
  };
  risk: {
    max_drawdown_pct?: number;
    max_concentration_pct: number;
  };
}

export function buildVibePlanPrompt(p: VibePlanInput): string {
  const factors = p.ranking.factors
    .map((f) => `${f.name} (${(f.weight * 100).toFixed(0)}%)`)
    .join(', ');
  const filters =
    p.filters.length > 0
      ? p.filters
          .map((f) => `${f.name} ${f.operator} ${JSON.stringify(f.value)}`)
          .join('; ')
      : '(none)';
  const drawdownReport = p.risk.max_drawdown_pct ?? 'unset';

  return [
    'You are a portfolio strategist. Describe what this VibePlan will favor and where it could go wrong.',
    'Cover: (1) the kind of companies the universe + filters select for, (2) what the factor weights tilt toward, (3) concentration or sector risk, (4) one situation where this plan would underperform.',
    'Be concise (3–4 short paragraphs). No disclaimers.',
    '',
    `Name: ${p.name}`,
    `Universe: exchanges ${p.universe.exchanges.join(', ') || '(any)'}, regions ${p.universe.regions.join(', ') || '(any)'}, sectors ${p.universe.sectors.join(', ') || '(any)'}`,
    `Filters: ${filters}`,
    `Ranking factors: ${factors}`,
    `Portfolio: ${p.portfolio.allocation_method}, max ${p.portfolio.max_position_pct}% per position, ${p.portfolio.cash_buffer_pct}% cash buffer`,
    `Cadence: ${p.cadence.quarterly_rebalance ? 'quarterly' : 'manual'} rebalance, threshold ${p.cadence.rebalance_threshold_pct}%`,
    `Risk: max DD ${drawdownReport}%, max concentration ${p.risk.max_concentration_pct}%`,
  ].join('\n');
}

// ─── Risk dashboard ───────────────────────────────────────────────

export interface RiskConcentration {
  symbol: string;
  weight: number;
}

export interface RiskInput {
  compositeScore?: number;
  volatility?: number;
  maxDrawdown?: number;
  var95?: number;
  topConcentrations?: RiskConcentration[];
  avgCorrelation?: number;
}

export function buildRiskPrompt(d: RiskInput): string {
  const composite = d.compositeScore !== undefined
    ? d.compositeScore.toFixed(0)
    : 'n/a';
  const vol = d.volatility !== undefined ? d.volatility.toFixed(2) : 'n/a';
  const maxDD = d.maxDrawdown !== undefined ? d.maxDrawdown.toFixed(2) : 'n/a';
  const var95 = d.var95 !== undefined ? d.var95.toFixed(2) : 'n/a';
  const corr = d.avgCorrelation !== undefined ? d.avgCorrelation.toFixed(2) : 'n/a';
  const conc = d.topConcentrations && d.topConcentrations.length > 0
    ? d.topConcentrations.map((c) => `${c.symbol} ${c.weight.toFixed(1)}%`).join(', ')
    : 'n/a';

  return [
    'You are a risk analyst. Summarize this portfolio risk snapshot in plain English.',
    'Cover: (1) overall risk level vs typical equity exposure, (2) the single biggest concentration or correlation risk, (3) what a 95% VaR loss would look like in dollar terms, (4) one practical action to lower risk if needed.',
    'Three short paragraphs. No disclaimers.',
    '',
    `Composite score: ${composite} / 100`,
    `Volatility: ${vol}%`,
    `Max drawdown: ${maxDD}%`,
    `VaR 95: ${var95}%`,
    `Concentration risk (top 3): ${conc}`,
    `Avg correlation: ${corr}`,
  ].join('\n');
}
