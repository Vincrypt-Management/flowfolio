/**
 * Scene-specific data generators that use VideoRNG for unique demo content.
 * Each function returns varied but realistic-looking mock data.
 */
import { VideoRNG } from './uniqueness';

// ─── Vibe Studio ────────────────────────────────────────────────

const factorNames = ['Momentum', 'Value', 'Quality', 'Growth', 'Volatility', 'Dividend', 'Size', 'Stability'];
const strategyNames = [
  'Momentum Growth', 'Value Hunter', 'Quality Core', 'Balanced Alpha',
  'Growth Seeker', 'Dividend Focus', 'Smart Beta', 'Risk Parity',
];

export function generateVibeStudioData(rng: VideoRNG) {
  const sceneFork = rng.fork('vibe-studio');
  const selectedFactors = sceneFork.pickN(factorNames, 5);
  const accentColors = ['primary', 'accent', 'amber', 'cyan', 'rose'] as const;

  return {
    factors: selectedFactors.map((name, i) => ({
      name,
      value: sceneFork.vary(0.7, 0.3),
      colorKey: accentColors[i],
    })),
    strategyName: sceneFork.pick(strategyNames),
  };
}

// ─── Portfolio Demo ─────────────────────────────────────────────

export function generatePortfolioData(rng: VideoRNG) {
  const sceneFork = rng.fork('portfolio');
  return {
    totalValue: sceneFork.vary(125000, 0.3),
    dayChange: sceneFork.vary(1.2, 0.8),
    totalReturn: sceneFork.vary(18.5, 0.4),
    sharpeRatio: sceneFork.vary(1.45, 0.2),
    chartData: generateChartPoints(sceneFork, 24, 100),
    allocations: [
      { sector: 'Technology', pct: sceneFork.vary(35, 0.2) },
      { sector: 'Healthcare', pct: sceneFork.vary(20, 0.2) },
      { sector: 'Finance', pct: sceneFork.vary(18, 0.2) },
      { sector: 'Consumer', pct: sceneFork.vary(15, 0.2) },
      { sector: 'Energy', pct: sceneFork.vary(12, 0.2) },
    ],
  };
}

// ─── Backtest Demo ──────────────────────────────────────────────

export function generateBacktestData(rng: VideoRNG) {
  const sceneFork = rng.fork('backtest');
  const cagr = sceneFork.vary(14.2, 0.3);
  return {
    cagr,
    sharpe: sceneFork.vary(1.3, 0.25),
    maxDrawdown: sceneFork.vary(-18, 0.3),
    winRate: sceneFork.vary(62, 0.15),
    strategyLine: generateChartPoints(sceneFork, 20, 100),
    benchmarkLine: generateChartPoints(sceneFork, 20, 100),
  };
}

// ─── Quant Demo ─────────────────────────────────────────────────

const quantMetricNames = [
  'Sharpe Ratio', 'Sortino Ratio', 'Max Drawdown', 'Beta', 'Alpha', 'Volatility',
  'Calmar Ratio', 'Treynor Ratio', 'Info Ratio', 'Omega Ratio',
];

export function generateQuantData(rng: VideoRNG) {
  const sceneFork = rng.fork('quant');
  const metrics = sceneFork.pickN(quantMetricNames, 6);
  return {
    metrics: metrics.map((name) => ({
      name,
      value: sceneFork.vary(1.2, 0.5),
      isGood: sceneFork.next() > 0.3,
    })),
    radarValues: Array.from({ length: 6 }, () => sceneFork.vary(0.7, 0.3)),
  };
}

// ─── Fundamentals Demo ──────────────────────────────────────────

export function generateFundamentalsData(rng: VideoRNG) {
  const sceneFork = rng.fork('fundamentals');
  const stockPool = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];
  const stocks = sceneFork.pickN(stockPool, 5);
  return {
    stocks: stocks.map((symbol) => ({
      symbol,
      pe: sceneFork.vary(25, 0.4),
      pb: sceneFork.vary(8, 0.5),
      roe: sceneFork.vary(28, 0.3),
      margin: sceneFork.vary(22, 0.35),
    })),
    featuredTicker: stocks[0],
  };
}

// ─── Optimizer Demo ─────────────────────────────────────────────

export function generateOptimizerData(rng: VideoRNG) {
  const sceneFork = rng.fork('optimizer');
  return {
    currentScore: sceneFork.int(55, 72),
    projectedScore: sceneFork.int(82, 96),
    dropCandidate: sceneFork.pick(['INTC', 'T', 'IBM', 'GE', 'F', 'BAC']),
    replacements: sceneFork.pickN(['NVDA', 'MSFT', 'AAPL', 'AMD', 'CRM', 'COST'], 3),
  };
}

// ─── Journal Demo ───────────────────────────────────────────────

const journalTitles = [
  'Added NVDA position', 'Trimmed META stake', 'Research: AI sector',
  'Quarterly review', 'Rebalanced portfolio', 'New watchlist entry',
  'Earnings analysis: AAPL', 'Risk assessment update', 'Sector rotation noted',
  'Dividend strategy update', 'Market outlook review', 'Position sizing review',
];

export function generateJournalData(rng: VideoRNG) {
  const sceneFork = rng.fork('journal');
  return {
    entries: sceneFork.pickN(journalTitles, 4).map((title, i) => ({
      title,
      daysAgo: i * sceneFork.int(1, 5),
      type: sceneFork.pick(['trade', 'research', 'review', 'note'] as const),
    })),
    totalEntries: sceneFork.int(24, 89),
    streak: sceneFork.int(5, 21),
  };
}

// ─── AI Chat Demo ───────────────────────────────────────────────

const chatQuestions = [
  'What should I rebalance this quarter?',
  'How is my tech exposure looking?',
  'Analyze my portfolio risk',
  'Which holdings are underperforming?',
  'Suggest a diversification strategy',
  'Compare my returns to S&P 500',
];

const chatResponses = [
  'Based on your current allocations, I recommend reducing your tech weighting by 5% and adding defensive positions in healthcare.',
  'Your portfolio shows strong momentum but elevated concentration risk. Consider trimming your top 3 holdings.',
  'Risk analysis shows a Sharpe ratio of 1.3 with moderate downside exposure. Your max drawdown risk is approximately -15%.',
  'Looking at factor exposure, your value tilt has strengthened. Growth factors remain well-positioned for the current cycle.',
];

export function generateAIChatData(rng: VideoRNG) {
  const sceneFork = rng.fork('ai-chat');
  return {
    question: sceneFork.pick(chatQuestions),
    response: sceneFork.pick(chatResponses),
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function generateChartPoints(rng: VideoRNG, count: number, base: number): number[] {
  const data: number[] = [base];
  for (let i = 1; i < count; i++) {
    const change = rng.offset(0, 4);
    const trend = rng.next() > 0.4 ? 1.003 : 0.997;
    data.push(Math.max(base * 0.7, data[i - 1] * trend + change));
  }
  return data;
}
