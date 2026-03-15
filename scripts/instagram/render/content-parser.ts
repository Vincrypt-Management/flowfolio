/**
 * Maps schedule DB caption + composition type → token map for HTML templates.
 * Uses keyword-based topic detection + pre-defined TOPIC_DATA (no LLM required).
 */

export type TopicKey =
  | 'portfolio-optimization'
  | 'build-in-public'
  | 'financial-literacy'
  | 'quant-concepts'
  | 'privacy-first'
  | 'rebalancing'
  | 'investing-education'
  | 'general';

interface SlideData {
  concept: string;
  headlineAccent: string;
  body: string;
  stat: string;
  statLbl: string;
}

interface TopicData {
  pill: string;
  headline: string;
  headlineAccent: string;
  headline2: string;
  kpis: Array<{ val: string; lbl: string; color: string }>;
  bars: Array<{ label: string; pct: number; color: string }>;
  stats: Array<{ val: string; lbl: string; color: string }>;
  quote: string;
  carouselCoverSub: string;
  carouselSlides: SlideData[];
}

const COLORS = {
  green: '#00e599',
  accent: '#818cf8',
  blue: '#38bdf8',
  rose: '#fb7185',
  amber: '#fbbf24',
  cyan: '#22d3ee',
};

const TOPIC_DATA: Record<TopicKey, TopicData> = {
  'portfolio-optimization': {
    pill: 'Portfolio Optimization',
    headline: 'Your portfolio has risks',
    headlineAccent: " you can't see.",
    headline2: '',
    kpis: [
      { val: '+23%', lbl: 'Sharpe Δ', color: COLORS.green },
      { val: '−18%', lbl: 'Max Drawdown', color: COLORS.rose },
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.blue },
    ],
    bars: [
      { label: 'Technology', pct: 72, color: COLORS.green },
      { label: 'Finance', pct: 14, color: COLORS.accent },
      { label: 'Energy', pct: 8, color: COLORS.blue },
      { label: 'Consumer', pct: 6, color: COLORS.amber },
    ],
    stats: [
      { val: '+23%', lbl: 'Sharpe Improvement', color: COLORS.green },
      { val: '−18%', lbl: 'Max Drawdown', color: COLORS.rose },
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.blue },
      { val: '94%', lbl: 'On Efficient Frontier', color: COLORS.green },
    ],
    quote: 'Math, not opinions. The efficient frontier shows you exactly what to change.',
    carouselCoverSub: 'How to build a portfolio that actually works — using quantitative optimization.',
    carouselSlides: [
      { concept: 'Efficient Frontier', headlineAccent: '', body: 'Every possible portfolio can be plotted on a risk-return chart. The efficient frontier is the upper edge — the set of portfolios that give maximum return for a given level of risk. Your job is to get there.', stat: '94%', statLbl: 'of portfolios are sub-optimal' },
      { concept: 'Sharpe Ratio', headlineAccent: '', body: 'Return means nothing without context. The Sharpe ratio measures return per unit of risk. Above 1.0 is good. Above 1.5 is great. Above 2.0 is exceptional — and rare.', stat: '1.84', statLbl: 'FlowFolio benchmark' },
      { concept: 'Maximum Drawdown', headlineAccent: '', body: "Max drawdown is the largest peak-to-trough decline in your portfolio. It answers: how bad did it actually get? Knowing your drawdown threshold is how you size positions without blowing up.", stat: '−18%', statLbl: 'avg max DD S&P 500' },
      { concept: 'Sector Concentration', headlineAccent: '', body: 'Most retail portfolios are secretly 70%+ tech even when they look diversified. Sector allocation analysis breaks down your real exposure — not the names you hold, but the risks you are actually carrying.', stat: '72%', statLbl: 'avg tech concentration' },
      { concept: 'Correlation Heatmap', headlineAccent: '', body: 'Diversification is about correlation, not count. Holding 20 stocks that all move together is no better than holding 1. A correlation heatmap reveals which holdings actually reduce risk.', stat: '0.91', statLbl: 'avg peer correlation' },
      { concept: 'Rebalancing Signal', headlineAccent: '', body: 'Portfolios drift. A position that started at 10% can become 25% after a bull run. Systematic rebalancing signals tell you exactly when and how much to trim.', stat: '2×/year', statLbl: 'optimal rebalance freq' },
    ],
  },

  'build-in-public': {
    pill: 'Build in Public',
    headline: 'I built the tool',
    headlineAccent: ' I wished existed.',
    headline2: '',
    kpis: [
      { val: 'v0.2.2', lbl: 'Current Version', color: COLORS.green },
      { val: '296', lbl: 'Tests Passing', color: COLORS.blue },
      { val: '8', lbl: 'New Features', color: COLORS.amber },
    ],
    bars: [
      { label: 'Rust', pct: 45, color: COLORS.rose },
      { label: 'TypeScript', pct: 35, color: COLORS.blue },
      { label: 'React', pct: 15, color: COLORS.cyan },
      { label: 'CSS', pct: 5, color: COLORS.accent },
    ],
    stats: [
      { val: 'v0.2.2', lbl: 'Latest Release', color: COLORS.green },
      { val: '8', lbl: 'New Tabs Added', color: COLORS.accent },
      { val: '6', lbl: 'Bugs Fixed', color: COLORS.blue },
      { val: '296', lbl: 'Tests Passing', color: COLORS.green },
    ],
    quote: 'The best tool is the one you build because nothing else exists.',
    carouselCoverSub: 'The honest story of building FlowFolio — a quant investing app — in public.',
    carouselSlides: [
      { concept: 'The Problem', headlineAccent: '', body: 'Every investing app either locks your data in the cloud, charges a subscription, or sells your order flow. I wanted something different: professional-grade tools that run entirely on my machine.', stat: '', statLbl: '' },
      { concept: 'The Stack', headlineAccent: '', body: 'Tauri 2 for the native shell. Rust for the backend — fast, safe, zero GC pauses. React 19 for the UI. SQLite for local storage. No servers. No accounts. No telemetry.', stat: '', statLbl: '' },
      { concept: 'v0.1 — The Core', headlineAccent: '', body: 'Vibe Studio: factor-weighted strategy builder. Backtest engine: 20 years of historical data. Portfolio optimizer: Sharpe maximization. All local, all fast.', stat: '', statLbl: '' },
      { concept: 'v0.2 — The Data Layer', headlineAccent: '', body: '8 market data providers with health-based failover, multi-tier caching, and circuit breakers. Real-time prices without paying $200/month for a Bloomberg terminal.', stat: '8', statLbl: 'data providers' },
      { concept: 'v0.2.2 — The Dashboard', headlineAccent: '', body: '8 new tabs: Portfolio Dashboard, Risk Dashboard, Comparison Mode, Price Alerts, News Sentiment, Rebalance Scheduler, Watchlist, and Credits. One unified command center.', stat: '8', statLbl: 'new components' },
      { concept: "What's Next", headlineAccent: '', body: 'Mobile companion app. AI-powered portfolio agent with memory. Options flow analysis. Community strategy sharing with zero data exposure. Building this in public — follow along.', stat: '', statLbl: '' },
    ],
  },

  'financial-literacy': {
    pill: 'Financial Literacy',
    headline: 'Investing knowledge',
    headlineAccent: ' without the jargon.',
    headline2: '',
    kpis: [
      { val: '8', lbl: 'Concepts', color: COLORS.green },
      { val: '0', lbl: 'Paywalls', color: COLORS.accent },
      { val: '∞', lbl: 'Value', color: COLORS.blue },
    ],
    bars: [
      { label: 'Strategy', pct: 80, color: COLORS.green },
      { label: 'Risk Mgmt', pct: 65, color: COLORS.accent },
      { label: 'Analysis', pct: 50, color: COLORS.blue },
      { label: 'Psychology', pct: 40, color: COLORS.amber },
    ],
    stats: [
      { val: '8', lbl: 'Key Concepts', color: COLORS.green },
      { val: '$0', lbl: 'Cost to Learn', color: COLORS.accent },
      { val: '∞', lbl: 'Return on Knowledge', color: COLORS.blue },
      { val: '1', lbl: 'Tool to Apply It', color: COLORS.green },
    ],
    quote: "Financial literacy shouldn't be a luxury. These concepts belong to everyone.",
    carouselCoverSub: 'No jargon. No gatekeeping. Just the investing knowledge that actually moves the needle.',
    carouselSlides: [
      { concept: 'Compound Interest', headlineAccent: '', body: '$10,000 at 10%/year becomes $174,000 in 30 years — without adding a dollar. Time in the market beats timing the market, always.', stat: '17×', statLbl: '30yr compound growth' },
      { concept: 'Asset Allocation', headlineAccent: '', body: '90% of portfolio returns come from asset allocation — not stock picking. The split between stocks, bonds, cash, and alternatives determines your long-term trajectory. Get this right first.', stat: '90%', statLbl: 'return from allocation' },
      { concept: 'Dollar-Cost Averaging', headlineAccent: '', body: 'Investing a fixed amount on a schedule removes the anxiety of timing. You buy more shares when prices are low and fewer when high — automatically. Boring is profitable.', stat: '', statLbl: '' },
      { concept: 'P/E Ratio', headlineAccent: '', body: 'Price-to-earnings tells you how much investors are paying per dollar of profit. High P/E = high growth expectations. Low P/E = value or value trap. Compare within sectors, not across them.', stat: '~22×', statLbl: 'S&P 500 avg P/E' },
      { concept: 'Beta & Volatility', headlineAccent: '', body: 'Beta measures how much your stock moves relative to the market. Beta of 1.5 means 50% more volatile than the S&P. High beta = higher potential return AND higher potential loss.', stat: '1.0', statLbl: 'market beta baseline' },
      { concept: 'Margin of Safety', headlineAccent: '', body: "Buy assets at a meaningful discount to their intrinsic value. The gap between price and value is your protection against being wrong. Great businesses bought at bad prices are bad investments.", stat: '30%', statLbl: 'typical margin of safety' },
    ],
  },

  'quant-concepts': {
    pill: 'Quant Finance',
    headline: 'Concepts that',
    headlineAccent: ' separate the best.',
    headline2: '',
    kpis: [
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.green },
      { val: '0.72', lbl: 'Beta', color: COLORS.blue },
      { val: '14.2%', lbl: 'CAGR', color: COLORS.accent },
    ],
    bars: [
      { label: 'Momentum', pct: 60, color: COLORS.green },
      { label: 'Value', pct: 50, color: COLORS.accent },
      { label: 'Quality', pct: 70, color: COLORS.blue },
      { label: 'Low Vol', pct: 45, color: COLORS.amber },
    ],
    stats: [
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.green },
      { val: '0.72', lbl: 'Portfolio Beta', color: COLORS.blue },
      { val: '14.2%', lbl: '10yr CAGR', color: COLORS.accent },
      { val: '−12%', lbl: 'Max Drawdown', color: COLORS.rose },
    ],
    quote: 'These are the metrics institutional investors live by. Now you have them too.',
    carouselCoverSub: 'The quant metrics that institutional investors use — explained simply.',
    carouselSlides: [
      { concept: 'Alpha', headlineAccent: '', body: "Alpha is the excess return above your benchmark. If the S&P returns 10% and your portfolio returns 13%, your alpha is 3%. Consistent positive alpha over time is extremely rare — and extremely valuable.", stat: '+3%', statLbl: 'example alpha' },
      { concept: 'Sharpe Ratio', headlineAccent: '', body: 'Return per unit of risk. Divide your excess return by your portfolio volatility. Above 1.0 is good. Above 2.0 is exceptional. This is the single most useful performance metric.', stat: '1.84', statLbl: 'target Sharpe' },
      { concept: 'Beta', headlineAccent: '', body: 'Market sensitivity. Beta of 0.7 means your portfolio moves 70% as much as the market. Beta of 1.3 means amplified moves both ways. Choose your beta intentionally.', stat: '0.72', statLbl: 'defensive beta' },
      { concept: 'CAGR', headlineAccent: '', body: 'Compound Annual Growth Rate smooths out volatility to show what your portfolio actually returned per year. The honest answer to "how did my investments do?"', stat: '14.2%', statLbl: '10-year CAGR' },
      { concept: 'Factor Exposure', headlineAccent: '', body: 'Every stock has exposures to systematic factors: momentum, value, quality, size, volatility. Understanding your factor exposures tells you WHY your portfolio behaves the way it does.', stat: '', statLbl: '' },
      { concept: 'Information Ratio', headlineAccent: '', body: 'The consistency of your alpha. A high IR means you beat the benchmark consistently, not just occasionally. This is the metric that separates skill from luck.', stat: '0.5+', statLbl: 'excellent IR threshold' },
    ],
  },

  'privacy-first': {
    pill: 'Privacy-First',
    headline: 'Your data stays',
    headlineAccent: ' on your machine.',
    headline2: '',
    kpis: [
      { val: '0', lbl: 'Servers', color: COLORS.green },
      { val: '100%', lbl: 'Local Storage', color: COLORS.blue },
      { val: '0', lbl: 'Tracking', color: COLORS.accent },
    ],
    bars: [
      { label: 'On-device', pct: 100, color: COLORS.green },
      { label: 'Encrypted', pct: 100, color: COLORS.accent },
      { label: 'Open Source', pct: 100, color: COLORS.blue },
      { label: 'Cloud deps', pct: 0, color: COLORS.rose },
    ],
    stats: [
      { val: '0', lbl: 'Cloud Servers', color: COLORS.green },
      { val: '0', lbl: 'Data Collected', color: COLORS.green },
      { val: 'AES', lbl: 'Key Encryption', color: COLORS.blue },
      { val: '100%', lbl: 'Local-First', color: COLORS.accent },
    ],
    quote: 'Your data. Your device. Your rules. Privacy is an engineering constraint, not a marketing angle.',
    carouselCoverSub: 'How FlowFolio was engineered from the ground up to be completely private.',
    carouselSlides: [
      { concept: 'No Server Architecture', headlineAccent: '', body: 'Most fintech apps run on cloud servers — which means your data does too. FlowFolio has no backend server. The app runs natively on your machine. There is no server to breach because there is no server.', stat: '0', statLbl: 'cloud servers' },
      { concept: 'Local SQLite Database', headlineAccent: '', body: 'All your portfolio data lives in a local SQLite database file on your machine. You own the file. You can back it up, move it, delete it. We never see it.', stat: '100%', statLbl: 'local storage' },
      { concept: 'Encrypted API Keys', headlineAccent: '', body: 'Your market data API keys are stored in Tauri Stronghold — an OS-level encrypted vault. They never appear in plain text. Even if someone cloned your drive, the keys would be unreadable without your credentials.', stat: 'AES-256', statLbl: 'encryption standard' },
      { concept: 'Zero Telemetry', headlineAccent: '', body: 'FlowFolio has no analytics, no crash reporters, no usage tracking. We do not know how many people use it, which features they use, or how often they open the app. We built it this way on purpose.', stat: '0', statLbl: 'tracking events' },
      { concept: 'Open Source', headlineAccent: '', body: "Don't trust our privacy claims — verify them. FlowFolio's source code is public. You can read every line, every network call, every data access. Privacy by architecture, verifiable by anyone.", stat: '100%', statLbl: 'auditable code' },
      { concept: 'Offline Capable', headlineAccent: '', body: 'Once your data is cached locally, FlowFolio works without an internet connection. Portfolio analysis, strategy backtesting, journal entries — all available offline.', stat: '', statLbl: '' },
    ],
  },

  'rebalancing': {
    pill: 'Portfolio Rebalancing',
    headline: '70% of my risk',
    headlineAccent: ' was 3 stocks.',
    headline2: '',
    kpis: [
      { val: '70%', lbl: 'Risk Concentrated', color: COLORS.rose },
      { val: '−12%', lbl: 'Drift Detected', color: COLORS.amber },
      { val: '6', lbl: 'Rebalance Signals', color: COLORS.green },
    ],
    bars: [
      { label: 'NVDA', pct: 34, color: COLORS.rose },
      { label: 'AAPL', pct: 22, color: COLORS.amber },
      { label: 'MSFT', pct: 14, color: COLORS.blue },
      { label: 'Other', pct: 30, color: COLORS.accent },
    ],
    stats: [
      { val: '70%', lbl: 'Risk in 3 Stocks', color: COLORS.rose },
      { val: '−12%', lbl: 'Allocation Drift', color: COLORS.amber },
      { val: '6', lbl: 'Rebalance Signals', color: COLORS.green },
      { val: '2×', lbl: 'Optimal/Year', color: COLORS.blue },
    ],
    quote: 'Rebalance with data, not instinct. FlowFolio shows you exactly what to change.',
    carouselCoverSub: "Why your \"diversified\" portfolio is probably more concentrated than you think.",
    carouselSlides: [
      { concept: 'Portfolio Drift', headlineAccent: '', body: 'A position that started at 10% of your portfolio can become 25% after a strong run — without adding a dollar. This drift silently concentrates your risk. FlowFolio tracks it automatically.', stat: '±5%', statLbl: 'trigger threshold' },
      { concept: 'Concentration Risk', headlineAccent: '', body: "Concentration risk is the danger of having too much tied to a single stock, sector, or factor. Most retail investors underestimate this. FlowFolio's Risk Dashboard calculates your real concentration.", stat: '70%', statLbl: 'avg retail concentration' },
      { concept: 'Rebalancing Signal', headlineAccent: '', body: 'A rebalance signal fires when a position drifts more than your configured threshold from its target. FlowFolio generates specific signals — buy X shares of A, sell Y shares of B — not vague suggestions.', stat: '6', statLbl: 'signals generated' },
      { concept: 'Tax-Aware Rebalancing', headlineAccent: '', body: 'Not all rebalances are equal. Selling appreciated positions triggers capital gains. Route new contributions toward underweight positions first — minimizing the tax hit.', stat: '', statLbl: '' },
      { concept: 'Rebalance Timeline', headlineAccent: '', body: 'The Rebalance Scheduler visualizes your entire history — when you last rebalanced, what changed, and which positions are now overdue. It flags positions drifting too long.', stat: '', statLbl: '' },
      { concept: 'Systematic Over Emotional', headlineAccent: '', body: 'The hardest part of rebalancing is fighting the urge to let winners run. A systematic threshold-based approach removes that emotional decision. You set the rules once; FlowFolio tells you when to act.', stat: '', statLbl: '' },
    ],
  },

  'investing-education': {
    pill: 'Investing Education',
    headline: '200 hours of learning.',
    headlineAccent: ' 8 slides.',
    headline2: '',
    kpis: [
      { val: '8', lbl: 'Key Concepts', color: COLORS.green },
      { val: '$0', lbl: 'Cost', color: COLORS.accent },
      { val: '200h', lbl: 'Research Condensed', color: COLORS.blue },
    ],
    bars: [
      { label: 'Fundamentals', pct: 85, color: COLORS.green },
      { label: 'Technical', pct: 60, color: COLORS.accent },
      { label: 'Macro', pct: 45, color: COLORS.blue },
      { label: 'Psychology', pct: 70, color: COLORS.amber },
    ],
    stats: [
      { val: '8', lbl: 'Core Concepts', color: COLORS.green },
      { val: '200h', lbl: 'Research Behind It', color: COLORS.blue },
      { val: '$0', lbl: 'To Access This', color: COLORS.accent },
      { val: '∞', lbl: 'Potential Return', color: COLORS.green },
    ],
    quote: 'The best investment you can make is in your own financial education.',
    carouselCoverSub: 'I spent 200 hours learning this. Here it is condensed into 8 slides.',
    carouselSlides: [
      { concept: 'Your Investment Thesis', headlineAccent: '', body: 'Every great investor starts with a thesis — a clear, written statement of why a position should outperform. Without a thesis, you are speculating. With one, you have a framework to evaluate new information against.', stat: '', statLbl: '' },
      { concept: 'Position Sizing', headlineAccent: '', body: 'The Kelly Criterion tells you the optimal fraction of your portfolio to risk on any single bet, based on your edge and odds. Most professionals use a fraction of Kelly to manage drawdowns.', stat: '1/4 Kelly', statLbl: 'common professional target' },
      { concept: 'Risk vs Volatility', headlineAccent: '', body: 'Risk and volatility are not the same thing. Risk is the probability of permanent loss of capital. Volatility is how much the price moves. A volatile stock of a great business is not risky if you can hold through the noise.', stat: '', statLbl: '' },
      { concept: 'Catalyst Investing', headlineAccent: '', body: "A catalyst is an event that unlocks a stock's value: an earnings beat, a product launch, a regulatory approval. The best trades combine a solid thesis with a near-term catalyst that forces the market to reprice.", stat: '', statLbl: '' },
      { concept: 'Mean Reversion', headlineAccent: '', body: 'Most financial metrics revert toward their long-term averages over time. Abnormally high margins attract competition. Abnormally low P/Es attract value buyers. Understanding mean reversion helps you know when to act.', stat: '', statLbl: '' },
      { concept: 'Conviction vs Overconfidence', headlineAccent: '', body: 'Conviction is holding a position because your thesis is intact. Overconfidence is holding it because you do not want to be wrong. Update your thesis, not your ego.', stat: '', statLbl: '' },
    ],
  },

  'general': {
    pill: 'FlowFolio',
    headline: 'Quantitative investing,',
    headlineAccent: ' simplified.',
    headline2: '',
    kpis: [
      { val: '8+', lbl: 'Data Sources', color: COLORS.green },
      { val: '20yr', lbl: 'Backtest History', color: COLORS.blue },
      { val: '100%', lbl: 'Local & Private', color: COLORS.accent },
    ],
    bars: [
      { label: 'Strategy', pct: 90, color: COLORS.green },
      { label: 'Backtest', pct: 75, color: COLORS.accent },
      { label: 'Portfolio', pct: 80, color: COLORS.blue },
      { label: 'Analysis', pct: 70, color: COLORS.amber },
    ],
    stats: [
      { val: '8+', lbl: 'Market Data Sources', color: COLORS.green },
      { val: '20yr', lbl: 'Backtest History', color: COLORS.blue },
      { val: '30+', lbl: 'Quant Metrics', color: COLORS.accent },
      { val: '0', lbl: 'Cloud Dependencies', color: COLORS.green },
    ],
    quote: 'Professional-grade portfolio tools. Entirely on your machine.',
    carouselCoverSub: 'Everything you need to invest systematically — without giving up your data.',
    carouselSlides: [
      { concept: 'Vibe Studio', headlineAccent: '', body: 'Build factor-weighted investment strategies. Dial up momentum, quality, or value — and watch a quant engine score your universe against your thesis. No templates. Just your conviction, backed by math.', stat: '', statLbl: '' },
      { concept: 'Backtesting', headlineAccent: '', body: 'Test any strategy against 20 years of historical data. CAGR, Sharpe ratio, max drawdown, and 30+ additional metrics. Know how your strategy would have performed before risking a dollar.', stat: '20yr', statLbl: 'historical data' },
      { concept: 'Portfolio Optimization', headlineAccent: '', body: 'Plot your holdings on the efficient frontier. Find the allocation that maximizes your Sharpe ratio. Generate specific rebalancing signals. Go from intuition to math.', stat: '', statLbl: '' },
      { concept: 'Multi-Source Market Data', headlineAccent: '', body: '8 market data providers with health-based failover, multi-tier caching, and circuit breakers. Real-time prices and historical data — no Bloomberg subscription required.', stat: '8', statLbl: 'data providers' },
      { concept: 'Investment Journal', headlineAccent: '', body: 'Log every trade with your thesis, emotion, and outcome. Track whether your reasoning was correct — separate from whether the trade was profitable.', stat: '', statLbl: '' },
      { concept: 'Privacy by Design', headlineAccent: '', body: 'Zero cloud dependencies. Local SQLite database. Encrypted key storage. No telemetry. Your portfolio data never leaves your machine — by architecture, not by policy.', stat: '0', statLbl: 'cloud servers' },
    ],
  },
};

/** Detect topic from caption keywords. Logs a warning when falling to 'general'. */
function detectTopic(caption: string): TopicKey {
  const c = caption.toLowerCase();
  if (c.includes('efficient frontier') || c.includes('optimization') || c.includes('optimal point')) return 'portfolio-optimization';
  if (c.includes('build') && (c.includes('engineer') || c.includes('weekend project') || c.includes('built flowfolio'))) return 'build-in-public';
  if (c.includes('rebalanc') || c.includes('drift') || c.includes('70% of my risk')) return 'rebalancing';
  if (c.includes('privacy') || c.includes('spy on you') || c.includes('cannot spy') || c.includes('offline')) return 'privacy-first';
  if (c.includes('quant') && c.includes('concepts')) return 'quant-concepts';
  if (c.includes('200 hours') || c.includes('condensed it') || c.includes('condensed into')) return 'investing-education';
  if (c.includes('financial literacy') || c.includes('gatekeep') || c.includes('no jargon')) return 'financial-literacy';
  console.warn(`[content-parser] Topic detection fell to 'general' for caption: "${caption.slice(0, 80)}..."`);
  return 'general';
}

/** Build full token map for a given post (excludes LOGO_B64 — injected by renderer) */
export function parsePost(
  composition: string,
  caption: string,
  seed: number,
): Record<string, string> {
  const topic = detectTopic(caption);
  const d = TOPIC_DATA[topic];

  // Tiny numeric jitter driven by seed (±1–3 on percentages) for visual variation
  const jitter = (seed % 5) - 2; // -2 to +2

  const tokens: Record<string, string> = {
    VERSION: 'FlowFolio v0.2.2',
    PILL: d.pill,
    HEADLINE: d.headline,
    HEADLINE_ACCENT: d.headlineAccent,
    HEADLINE_2: d.headline2,
  };

  if (composition === 'feed-feature' || composition === 'feed-metrics') {
    d.kpis.forEach((k, i) => {
      const n = i + 1;
      tokens[`KPI_${n}_VAL`] = k.val;
      tokens[`KPI_${n}_LBL`] = k.lbl;
      tokens[`KPI_${n}_COLOR`] = k.color;
    });

    d.bars.forEach((b, i) => {
      const n = i + 1;
      const pct = Math.max(1, Math.min(99, b.pct + (n % 2 === 0 ? jitter : -jitter)));
      tokens[`BAR_${n}_LABEL`] = b.label;
      tokens[`BAR_${n}_PCT`] = String(pct);
      tokens[`BAR_${n}_COLOR`] = b.color;
    });

    d.stats.forEach((s, i) => {
      const n = i + 1;
      tokens[`STAT_${n}_VAL`] = s.val;
      tokens[`STAT_${n}_LBL`] = s.lbl;
      tokens[`STAT_${n}_COLOR`] = s.color;
    });

    tokens.QUOTE = d.quote;
  }

  if (composition === 'carousel') {
    // Copy the array to avoid mutating shared TOPIC_DATA
    const slides = [...d.carouselSlides];
    // Pad to exactly 6 content slides using 'general' fallback data
    const fallback = TOPIC_DATA['general'].carouselSlides;
    while (slides.length < 6) {
      slides.push(fallback[(slides.length) % fallback.length]);
    }
    tokens.CAROUSEL_COVER_SUB = d.carouselCoverSub;
    tokens.CAROUSEL_SLIDES_JSON = JSON.stringify(slides.slice(0, 6));
    tokens.CTA_HANDLE = '@flowfolio';
    tokens.CTA_LINE = 'Download — link in bio';
    tokens.CTA_SUB = 'Privacy-first · Free · macOS / Windows / Linux';
  }

  return tokens;
}
