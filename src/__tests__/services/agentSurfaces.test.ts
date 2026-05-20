import { describe, it, expect } from 'vitest';
import {
  buildBacktestPrompt,
  buildVibePlanPrompt,
  buildGeneratedPortfolioPrompt,
  buildRiskPrompt,
  type BacktestInput,
  type VibePlanInput,
  type GeneratedPortfolioInput,
  type RiskInput,
} from '../../services/agentSurfaces';

describe('buildBacktestPrompt', () => {
  const sample: BacktestInput = {
    start_date: '2020-01-01',
    end_date: '2024-01-01',
    duration_months: 48,
    metrics: {
      cagr: 8.4,
      total_return: 38.2,
      max_drawdown: 12.1,
      volatility: 14.5,
      sharpe_ratio: 0.91,
      turnover: 22.0,
      num_trades: 47,
      final_value: 138_200,
      total_invested: 100_000,
    },
  };

  it('includes the period and duration', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('2020-01-01');
    expect(p).toContain('2024-01-01');
    expect(p).toContain('48');
  });

  it('formats each metric with two-decimal precision', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('CAGR: 8.40%');
    expect(p).toContain('Sharpe ratio: 0.91');
    expect(p).toContain('Max drawdown: 12.10%');
  });

  it('includes capital values in dollar form', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('$138200');
    expect(p).toContain('$100000');
  });

  it('starts with the analyst role and ends with structured data', () => {
    const p = buildBacktestPrompt(sample);
    expect(p.startsWith('You are a financial analyst.')).toBe(true);
    expect(p).toMatch(/No disclaimers/);
  });
});

describe('buildVibePlanPrompt', () => {
  const sample: VibePlanInput = {
    name: 'Quality Compounders',
    universe: {
      exchanges: ['NYSE', 'NASDAQ'],
      regions: ['US'],
      sectors: [],
    },
    filters: [
      { name: 'Market Cap', operator: 'greater_than', value: 1_000_000_000 },
      { name: 'ROE', operator: 'greater_than', value: 15 },
    ],
    ranking: {
      factors: [
        { name: 'quality', weight: 0.4 },
        { name: 'value', weight: 0.3 },
        { name: 'momentum', weight: 0.3 },
      ],
    },
    portfolio: {
      allocation_method: 'equal_weight',
      max_position_pct: 10,
      cash_buffer_pct: 5,
    },
    cadence: {
      quarterly_rebalance: true,
      rebalance_threshold_pct: 5,
    },
    risk: {
      max_drawdown_pct: 20,
      max_concentration_pct: 30,
    },
  };

  it('lists each factor with its weight as a percentage', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('quality (40%)');
    expect(p).toContain('value (30%)');
    expect(p).toContain('momentum (30%)');
  });

  it('renders the universe exchanges and falls back to (any) for empty sectors', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('NYSE, NASDAQ');
    expect(p).toContain('sectors (any)');
  });

  it('joins filters with semicolons', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('Market Cap greater_than');
    expect(p).toContain(';');
  });

  it('reports max_drawdown_pct unset as "unset" when missing', () => {
    const p = buildVibePlanPrompt({
      ...sample,
      risk: { max_concentration_pct: 30 },
    });
    expect(p).toContain('max DD unset%');
  });

  it('renders "(none)" when filters array is empty', () => {
    const p = buildVibePlanPrompt({ ...sample, filters: [] });
    expect(p).toContain('Filters: (none)');
  });

  it('renders "manual" cadence when quarterly_rebalance is false', () => {
    const p = buildVibePlanPrompt({
      ...sample,
      cadence: { quarterly_rebalance: false, rebalance_threshold_pct: 10 },
    });
    expect(p).toContain('manual rebalance');
  });
});

describe('buildGeneratedPortfolioPrompt', () => {
  const sample: GeneratedPortfolioInput = {
    title: 'Conservative Income',
    description: 'Dividend-focused balanced portfolio.',
    strategy: 'Buy and hold dividend payers and bonds.',
    riskLevel: 'Low',
    timeHorizon: '10+ years',
    rebalanceFrequency: 'Annually',
    expectedReturn: '6-8% annually',
    volatility: '8-12%',
    assets: [
      { symbol: 'VYM', name: 'Vanguard High Dividend', allocation: 40, sector: 'Equity' },
      { symbol: 'BND', name: 'Vanguard Total Bond', allocation: 35 },
      { symbol: 'SCHD', name: 'Schwab US Dividend', allocation: 25, sector: 'Equity' },
    ],
  };

  it('lists each asset with symbol, name, and allocation', () => {
    const p = buildGeneratedPortfolioPrompt(sample);
    expect(p).toContain('VYM (Vanguard High Dividend) — 40.0%');
    expect(p).toContain('BND (Vanguard Total Bond) — 35.0%');
    expect(p).toContain('SCHD (Schwab US Dividend) — 25.0%');
  });

  it('includes sector in brackets when present', () => {
    const p = buildGeneratedPortfolioPrompt(sample);
    expect(p).toContain('[Equity]');
  });

  it('includes title, risk level, time horizon, and rebalance frequency', () => {
    const p = buildGeneratedPortfolioPrompt(sample);
    expect(p).toContain('Title: Conservative Income');
    expect(p).toContain('Risk level: Low');
    expect(p).toContain('Time horizon: 10+ years');
    expect(p).toContain('Rebalance: Annually');
  });

  it('renders "(no assets)" when assets array is empty', () => {
    const p = buildGeneratedPortfolioPrompt({ ...sample, assets: [] });
    expect(p).toContain('(no assets)');
    expect(p).toContain('Holdings (0):');
  });

  it('starts with strategist framing', () => {
    const p = buildGeneratedPortfolioPrompt(sample);
    expect(p.startsWith('You are a portfolio strategist.')).toBe(true);
  });
});

describe('buildRiskPrompt', () => {
  const sample: RiskInput = {
    compositeScore: 62,
    volatility: 18.4,
    maxDrawdown: 14.2,
    var95: 4.1,
    topConcentrations: [
      { symbol: 'AAPL', weight: 22.5 },
      { symbol: 'MSFT', weight: 15.0 },
    ],
    avgCorrelation: 0.48,
  };

  it('includes the composite score in N/100 form', () => {
    const p = buildRiskPrompt(sample);
    expect(p).toContain('62 / 100');
  });

  it('formats each top concentration', () => {
    const p = buildRiskPrompt(sample);
    expect(p).toContain('AAPL 22.5%');
    expect(p).toContain('MSFT 15.0%');
  });

  it('emits "n/a" placeholders for missing optional fields', () => {
    const p = buildRiskPrompt({});
    expect(p).toContain('Composite score: n/a / 100');
    expect(p).toContain('Volatility: n/a%');
    expect(p).toContain('Concentration risk (top 3): n/a');
  });

  it('starts with risk-analyst framing', () => {
    const p = buildRiskPrompt(sample);
    expect(p.startsWith('You are a risk analyst.')).toBe(true);
  });
});
