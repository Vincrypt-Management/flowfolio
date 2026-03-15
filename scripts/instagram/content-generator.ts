/**
 * Content generation engine for FlowFolio Instagram scheduling.
 *
 * Uses Remotion's seed-based system to produce unique videos each time.
 * Generates varied captions, hashtags, and selects optimal compositions.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generatePost } from './render/generate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'out', 'scheduled');

// --- Seed generation ---

function generateSeed(): number {
  return Math.floor(Date.now() * Math.random()) % 2147483647;
}

// --- Composition configs ---

export interface CompositionConfig {
  id: string;
  displayName: string;
  compositionId: string;
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  igOptimal: boolean;
  type: 'video' | 'still' | 'carousel';
}

export const COMPOSITIONS: Record<string, CompositionConfig> = {
  'intro': {
    id: 'intro',
    displayName: 'FlowFolio Intro (16:9)',
    compositionId: 'FlowFolioIntro',
    width: 1920, height: 1080,
    durationFrames: 1460, fps: 60,
    igOptimal: false,
    type: 'video',
  },
  'intro-ig': {
    id: 'intro-ig',
    displayName: 'FlowFolio Intro (IG Reel)',
    compositionId: 'FlowFolioIntroIG',
    width: 1080, height: 1920,
    durationFrames: 1320, fps: 60,
    igOptimal: true,
    type: 'video',
  },
  'demo': {
    id: 'demo',
    displayName: 'FlowFolio Showcase (16:9)',
    compositionId: 'FlowFolioShowcase',
    width: 1920, height: 1080,
    durationFrames: 6320, fps: 60,
    igOptimal: false,
    type: 'video',
  },
  'demo-ig': {
    id: 'demo-ig',
    displayName: 'FlowFolio Showcase (IG Reel)',
    compositionId: 'FlowFolioShowcaseIG',
    width: 1080, height: 1920,
    durationFrames: 3000, fps: 60,
    igOptimal: true,
    type: 'video',
  },
  'app': {
    id: 'app',
    displayName: 'App Showcase (16:9)',
    compositionId: 'FlowFolioAppShowcase',
    width: 1920, height: 1080,
    durationFrames: 3060, fps: 60,
    igOptimal: false,
    type: 'video',
  },
  // Feed post compositions (1080x1080 stills)
  'feed-tip': {
    id: 'feed-tip',
    displayName: 'Investment Tip Card',
    compositionId: 'FeedTipCard',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'still',
  },
  'feed-metrics': {
    id: 'feed-metrics',
    displayName: 'Portfolio Metrics Card',
    compositionId: 'FeedMetricsCard',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'still',
  },
  'feed-backtest': {
    id: 'feed-backtest',
    displayName: 'Backtest Results Card',
    compositionId: 'FeedBacktestCard',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'still',
  },
  'feed-feature': {
    id: 'feed-feature',
    displayName: 'Feature Spotlight Card',
    compositionId: 'FeedFeatureCard',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'still',
  },
  'feed-quote': {
    id: 'feed-quote',
    displayName: 'Investment Quote Card',
    compositionId: 'FeedQuoteCard',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'still',
  },
  'carousel': {
    id: 'carousel',
    displayName: 'Educational Carousel',
    compositionId: 'FeedCarousel',
    width: 1080, height: 1080,
    durationFrames: 90, fps: 60,
    igOptimal: true,
    type: 'carousel',
  },
};

// --- Content themes for captions ---
// Expert-level branding: pattern-interrupt hooks, value-dense body, clear CTAs
// Hashtag strategy: 3 branded + 3 discovery + 3 community per set (9 total, under IG's sweet spot)

interface ContentTheme {
  hook: string[];
  body: string[];
  cta: string[];
  hashtags: string[];
}

const THEMES: Record<string, ContentTheme> = {
  'vibe-investing': {
    hook: [
      'The stock market is not one-size-fits-all. Why is your strategy?',
      'I stopped copying portfolios from Reddit and built my own system instead.',
      'Most portfolio templates are designed for the person who made them, not you.',
      'Your investing style is a fingerprint. Treat it like one.',
      'You would never wear someone else\'s prescription glasses. So why use their portfolio?',
      'The difference between gambling and investing is a thesis. Build yours.',
      'Factor investing used to require a quant desk. Now it requires a laptop.',
      'Momentum. Value. Quality. Growth. You get to decide the recipe.',
    ],
    body: [
      'FlowFolio\'s Vibe Studio lets you weight investment factors like sliders on a mixing board. Dial up momentum, dial down volatility, blend in quality metrics -- and watch the quant engine score every stock against YOUR thesis.\n\nNo templates. No guru strategies. Just your conviction, backed by data.',
      'Most investing apps assume you want to be told what to buy.\n\nFlowFolio assumes you want to think for yourself -- and gives you the tools to do it well. Factor weighting, quantitative scoring, and backtesting, all in one workspace.',
      'Every investor has a thesis, even if they haven\'t articulated it yet.\n\nFlowFolio\'s factor weighting system forces you to make your assumptions explicit: How much do you value momentum vs. stability? Growth vs. dividends? Then it scores your universe accordingly.\n\nClarity beats conviction.',
      'The best investors I know all do the same thing differently: they have a repeatable process that reflects their worldview.\n\nFlowFolio\'s Vibe Studio is that process, codified. Weight your factors. Score your universe. Backtest the result. Adjust. Repeat.',
    ],
    cta: [
      'Build your first vibe strategy in 5 minutes -- link in bio.',
      'Save this. Come back when you\'re ready to stop guessing.',
      'Your strategy should be as unique as you are. Start building it today.',
      'Follow @flowfolio for more on systematic investing.',
    ],
    hashtags: [
      '#FlowFolio #VibeInvesting #FactorInvesting #InvestmentStrategy #QuantTrading #SmartMoney #DIYInvesting #PortfolioDesign #WealthBuilding',
      '#FlowFolio #InvestSmart #PortfolioStrategy #SystematicInvesting #FactorWeighting #MomentumInvesting #ValueInvesting #InvestLikeYou #PersonalFinance',
      '#FlowFolio #VibeInvesting #InvestmentThesis #QuantFinance #DataDrivenInvesting #SmartBeta #PortfolioConstruction #InvestorMindset #WealthTech',
      '#FlowFolio #InvestYourWay #FactorModel #QuantitativeInvesting #TradingStrategy #InvestmentTools #PortfolioManagement #FinTech #SmartInvesting',
    ],
  },
  'privacy-first': {
    hook: [
      'Your brokerage sells your order flow. Your investing app sells your data. We sell neither.',
      'I built a portfolio tracker that literally cannot spy on you.',
      'Most fintech apps know more about your finances than your accountant does.',
      'Name an investing app that doesn\'t require an account. We\'ll wait.',
      'The irony of "secure" cloud investing apps is that the cloud is the vulnerability.',
      'Every data breach starts with data collection. FlowFolio collects nothing.',
      'We do not have servers. Not because we can\'t afford them -- because you deserve better.',
      'Your portfolio data is worth more than you think. That\'s exactly why we never touch it.',
    ],
    body: [
      'FlowFolio runs entirely on your machine.\n\nNo account creation. No email harvesting. No analytics pixels. No telemetry. Your portfolio data lives in a local SQLite database, and your API keys sit in an encrypted vault.\n\nWe literally cannot see your data, even if we wanted to.',
      'Open most investing apps:\n- Your usage data goes to analytics servers\n- Your trading patterns feed machine learning models\n- Your order flow gets sold to market makers\n\nOpen FlowFolio:\n- It opens.\n\nThat\'s it. Everything stays on your device.',
      'We built FlowFolio on Tauri and Rust because security is an architecture decision, not a feature toggle.\n\nThe backend compiles to native code. The database is local-only. API keys are stored in OS-level encrypted keystores. There is no server to breach because there is no server.',
      'Privacy-first is not a marketing angle for us. It is an engineering constraint.\n\nEvery design decision in FlowFolio starts with: "Does this require the user\'s data to leave their machine?" If the answer is yes, we find another way.',
    ],
    cta: [
      'Your data. Your device. Your rules. Link in bio.',
      'Download FlowFolio -- no sign-up required. No, really.',
      'Privacy is not a feature. It\'s a right. Start exercising it.',
      'Follow @flowfolio for investing tools that respect you.',
    ],
    hashtags: [
      '#FlowFolio #PrivacyFirst #OfflineFirst #DataPrivacy #SecureInvesting #NoCloud #LocalFirst #EncryptedVault #CyberSecurity',
      '#FlowFolio #YourDataYourRules #PrivacyMatters #ZeroTelemetry #DataSovereignty #SecureByDesign #DesktopApp #PrivacyTech #FinTech',
      '#FlowFolio #PrivateInvesting #NoTracking #OfflineInvesting #DataProtection #InvestSmart #PrivacyEngineering #TauriApp #RustLang',
      '#FlowFolio #PrivacyFirst #NoSignUp #ZeroDataCollection #LocalDatabase #EncryptionFirst #InvestingTools #SecurityFirst #PrivacyByDesign',
    ],
  },
  'backtest': {
    hook: [
      'Every strategy looks brilliant in your head. The backtest tells a different story.',
      'I backtested my "obvious" strategy against 20 years of data. Spoiler: the S&P 500 won.',
      'The market has crashed 4 times since 2000. Would your strategy have survived all of them?',
      'Conviction without evidence is just hope. Get the evidence.',
      'Before you risk a single dollar, FlowFolio will show you what would have happened if you risked a million.',
      'If you haven\'t backtested your strategy, you don\'t have a strategy -- you have a guess.',
      'The 2008 crash. The COVID crash. The 2022 bear market. Your strategy needs to survive all three.',
      'Backtesting is not about predicting the future. It\'s about stress-testing your assumptions.',
    ],
    body: [
      'FlowFolio\'s backtest engine doesn\'t just show you a number. It shows you the journey.\n\nCAGR. Sharpe ratio. Maximum drawdown. Rolling returns. Equity curves. Benchmark comparison.\n\nAll computed locally from real historical data. No hypotheticals. No curve-fitting. Just math.',
      'The uncomfortable truth about most investment strategies:\n\nThey were designed during a bull market, tested during a bull market, and will fail during the next correction.\n\nFlowFolio\'s backtester forces you to watch your strategy navigate the worst periods in modern market history -- before you commit capital.',
      'A 15% CAGR means nothing if the max drawdown was 60%.\n\nFlowFolio\'s backtest engine gives you the full picture: risk-adjusted returns, volatility analysis, worst-case scenarios, and benchmark-relative performance. Because returns without context are just vibes.',
      'The difference between a good investor and a great one?\n\nThe great one already knows how their strategy handles a 40% drawdown. Not because they lived through it -- because they backtested it.\n\nFlowFolio puts 20 years of market history at your fingertips.',
    ],
    cta: [
      'Stop guessing. Start backtesting. Link in bio.',
      'Would your strategy survive the next crash? Find out for free.',
      'Save this for the next time someone tells you they have a "foolproof" strategy.',
      'Prove your thesis before you fund it. Download FlowFolio.',
    ],
    hashtags: [
      '#FlowFolio #BackTesting #QuantAnalysis #DataDrivenInvesting #SharpeRatio #CAGR #MaxDrawdown #StrategyValidation #InvestSmart',
      '#FlowFolio #BacktestFirst #EquityCurve #RiskManagement #HistoricalData #QuantFinance #MarketAnalysis #SystematicInvesting #SmartMoney',
      '#FlowFolio #StrategyTesting #AlgoTrading #QuantTrading #InvestmentResearch #RiskAdjustedReturns #DataDriven #PortfolioAnalysis #FinTech',
      '#FlowFolio #SimulateFirst #MarketHistory #CrashTest #StressTest #InvestingTools #BacktestEngine #QuantitativeFinance #InvestorEducation',
    ],
  },
  'ai-powered': {
    hook: [
      '"What\'s my tech sector exposure?" I asked my portfolio. It actually answered.',
      'AI portfolio analysis that runs on your machine, not in someone else\'s cloud.',
      'Talking to your portfolio used to require a $500/hour financial advisor.',
      'What if your portfolio could flag its own problems before you noticed them?',
      'I asked FlowFolio to analyze my diversification. The answer was humbling.',
      'Most AI investing tools want your data. Ours doesn\'t even have a server to store it.',
      'The financial advisor of the future lives on your desktop. And it works offline.',
      'AI that tells you what you need to hear about your portfolio, not what you want to hear.',
    ],
    body: [
      'FlowFolio\'s AI agent parses your holdings and delivers analysis in plain English.\n\nConcentration risk. Sector tilt. Correlation overlap. Factor exposure gaps.\n\nThe kind of insights that used to require a Bloomberg terminal and a CFA. Now it runs on your laptop.',
      'What makes FlowFolio\'s AI different:\n\nYour portfolio data gets summarized locally. Only the summary reaches the LLM. Your actual positions, account values, and trade history never leave your machine.\n\nAI-powered insights without the surveillance.',
      'A financial advisor you can query at 2 AM without judgment:\n\n"Am I too concentrated in tech?"\n"What\'s my downside risk if rates spike?"\n"Show me my factor exposure gaps."\n\nFlowFolio\'s AI agent handles all of it. Locally. Instantly. Honestly.',
      'The problem with most robo-advisors: they optimize for their business model, not your goals.\n\nFlowFolio\'s AI has no business model. It\'s open source. It runs on your machine. Its only job is to tell you the truth about your portfolio.',
    ],
    cta: [
      'Meet your offline portfolio advisor. Link in bio.',
      'Ask your portfolio a hard question today. You might learn something.',
      'AI investing should be private by default. We built it that way.',
      'Follow @flowfolio for tools that make you a better investor.',
    ],
    hashtags: [
      '#FlowFolio #AIInvesting #PortfolioAI #SmartInvesting #ArtificialIntelligence #PortfolioAnalysis #WealthTech #FinTech #AIAssistant',
      '#FlowFolio #PrivateAI #InvestmentAI #AITrading #SmartPortfolio #LLM #AIFinance #ConversationalAI #InvestSmart',
      '#FlowFolio #AIInsights #PortfolioIntelligence #FinancialAI #OfflineAI #DataPrivacy #InvestingTools #MachineLearning #QuantAnalysis',
      '#FlowFolio #AIAdvisor #ChatWithData #IntelligentInvesting #LocalAI #PortfolioOptimization #AIForInvestors #SmartMoney #TechFinance',
    ],
  },
  'quant-metrics': {
    hook: [
      'Bloomberg charges $25,000/year for this. FlowFolio charges $0.',
      'If you\'re making investment decisions without these 5 metrics, you\'re flying blind.',
      'Sharpe ratio. Sortino ratio. Information ratio. Three numbers that define your risk profile.',
      'The single chart that tells you everything about a stock\'s risk profile.',
      'Professional fund managers use radar charts to evaluate holdings. Now you can too.',
      'PE ratio alone tells you almost nothing. Look at what actually matters.',
      'The metrics that separate retail investors from institutional thinkers.',
      '30+ quantitative metrics per stock. $0 per month. No, there\'s no catch.',
    ],
    body: [
      'FlowFolio computes institutional-grade metrics from free data sources:\n\n- Fundamentals: PE, PB, ROE, profit margins\n- Technicals: momentum, volatility, moving averages\n- Risk: Sharpe, Sortino, Treynor, max drawdown, beta\n- Factor scores: value, growth, quality, momentum\n\n30+ metrics. 8 data providers. Zero subscription fees.',
      'The same data Wall Street pays thousands for is available through free APIs. The hard part isn\'t access -- it\'s computation.\n\nFlowFolio does the computation. Locally. Instantly. With multi-source validation so you know the numbers are right.',
      'A stock\'s PE ratio without context is just a number.\n\nFlowFolio gives you context: sector-relative comparisons, historical percentiles, factor score rankings, and radar charts that visualize a stock\'s entire profile at a glance.\n\nNumbers tell stories. You just need the right visualization.',
      'Most investing apps show you price charts and call it "analysis."\n\nFlowFolio shows you the metrics that actually drive returns: factor exposures, risk decomposition, correlation matrices, and quantitative scores that compress 30+ data points into actionable intelligence.',
    ],
    cta: [
      'Institutional analytics. Free forever. Link in bio.',
      'Save this if you want to analyze stocks like a professional.',
      'Stop paying for data you can compute yourself. Download FlowFolio.',
      'Better analysis starts with better data. Follow @flowfolio.',
    ],
    hashtags: [
      '#FlowFolio #QuantFinance #InvestingMetrics #DataAnalysis #SharpeRatio #FundamentalAnalysis #TechnicalAnalysis #InvestSmart #PortfolioAnalytics',
      '#FlowFolio #QuantTrading #RiskMetrics #StockAnalysis #FactorScores #InstitutionalGrade #FreeTools #SmartMoney #InvestingTools',
      '#FlowFolio #QuantitativeAnalysis #RadarChart #SortinoRatio #AlphaGeneration #DeepAnalysis #DataDriven #FinTech #WealthBuilding',
      '#FlowFolio #MetricsThatMatter #ProAnalytics #InvestmentAnalysis #RiskAdjustedReturns #BetaAlpha #StockScreener #QuantInvesting #SmartInvesting',
    ],
  },
  'education': {
    hook: [
      'The one concept that changed how I think about portfolio risk.',
      'Nobody explained factor investing this clearly when I started. So I did it myself.',
      'This breakdown covers more ground than most paid investing courses.',
      'Factor investing in 8 slides. No fluff.',
      'These concepts separate informed investors from the crowd.',
      'No jargon. No gatekeeping. Just the investing knowledge that actually matters.',
      'I spent 200 hours learning this. Condensed it into 8 slides.',
      'Possibly the most useful investing post on your feed today.',
    ],
    body: [
      'We break down institutional-grade investing concepts into slides you can actually understand.\n\nNo PhD required. No paywall. No upsell to a premium course.\n\nJust the concepts that move the needle, explained clearly and concisely.',
      'The investing education system is broken:\n- Universities teach theory without practice\n- YouTube sells confidence without competence\n- Reddit teaches conviction without discipline\n\nThese carousels fill the gap. Real concepts. Clear explanations. Practical applications.',
      'Every slide in this carousel is a building block.\n\nAlone, each concept is useful. Together, they form the foundation of a disciplined, systematic investment approach.\n\nSave this. Share it. Come back to it. This is the curriculum the finance industry gatekeeps.',
      'Financial literacy shouldn\'t be a luxury.\n\nWe built FlowFolio to make quant investing accessible. These educational posts serve the same mission: taking concepts that Wall Street hoards and making them available to everyone.',
    ],
    cta: [
      'Save this carousel. Share it with someone who needs it.',
      'Which concept should we break down next? Tell us in the comments.',
      'Follow @flowfolio for weekly investing education.',
      'Put this knowledge into practice. Download FlowFolio -- link in bio.',
    ],
    hashtags: [
      '#FlowFolio #InvestorEducation #FinancialLiteracy #LearnToInvest #InvestingTips #MoneyEducation #WealthBuilding #SmartMoney #PersonalFinance',
      '#FlowFolio #InvestingForBeginners #FinancialEducation #MoneyLessons #InvestingBasics #StockMarket #FinanceLiteracy #InvestorMindset #FinTech',
      '#FlowFolio #LearnAndEarn #InvestSmart #MoneyTips #FinancialFreedom #InvestingKnowledge #WealthCreation #InvestorLife #EducateYourself',
      '#FlowFolio #FinanceEducation #InvestmentLessons #MoneyMindset #SmartInvesting #QuantMadeSimple #InvestingCarousel #FinancialGoals #KnowledgeIsPower',
    ],
  },
  'edu-compounding': {
    hook: [
      '$10,000 at 10% annual return becomes $174,000 in 30 years. No trades. No genius. Just time.',
      'Investor A invests for 10 years starting at 25. Investor B invests for 30 years starting at 35. A wins. Every time.',
      'The Rule of 72: divide 72 by your annual return. That is how many years to double your money.',
      'A 1% annual fee costs 25% of your total wealth over 30 years. Do the math.',
      'Reinvesting dividends turned $10K in the S&P 500 into $300K instead of $70K since 1960.',
      'Starting 10 years earlier beats investing 3x more. Compounding does not care about effort -- it cares about time.',
    ],
    body: [
      'Compounding is the most powerful force in investing and the most underestimated.\n\nAt 10% annual return:\n- Year 10: $25,937\n- Year 20: $67,275\n- Year 30: $174,494\n\nYour money did not grow 3x from year 10 to 30. It grew 7x. That is the exponential curve working for you.',
      'Two investors. Same return. Different start dates.\n\nInvestor A puts in $5K/year from age 25-35, then stops. Total invested: $50K.\nInvestor B puts in $5K/year from age 35-65. Total invested: $150K.\n\nAt 10% returns, Investor A ends with more money. Three times less invested, more wealth. Time is the multiplier.',
      'Small differences in annual return compound into massive wealth gaps.\n\nAt 6%: money doubles every 12 years.\nAt 10%: money doubles every 7 years.\n\nOver 30 years, 10% turns $10K into $174K. 6% turns it into $57K. That 4% gap becomes a 3x wealth difference.',
      'Dividend reinvestment is the compounding accelerator nobody talks about.\n\nThe S&P 500 returned roughly 7% without dividends and 10% with reinvestment from 1960-2020. Over 40 years, that gap turns $10K into $70K vs $300K. Same index. Different strategy. 4x the outcome.',
    ],
    cta: [
      'Backtest your compounding strategy with FlowFolio. Link in bio.',
      'Follow @flowfolio for investing concepts explained without the fluff.',
      'Run the numbers yourself. Download FlowFolio -- it is free.',
      'Time in the market beats timing the market. Start today.',
    ],
    hashtags: [
      '#FlowFolio #CompoundInterest #WealthBuilding #InvestEarly #TimeInMarket #FinancialLiteracy #InvestSmart #LongTermInvesting #PersonalFinance',
      '#FlowFolio #Compounding #RuleOf72 #PassiveIncome #DividendInvesting #MoneyGrowth #InvestorEducation #WealthCreation #SmartMoney',
      '#FlowFolio #CompoundGrowth #InvestingBasics #MoneyMath #LongTermWealth #FinancialFreedom #InvestmentStrategy #RetirementPlanning #FinTech',
      '#FlowFolio #PowerOfCompounding #DividendReinvestment #WealthMindset #InvestingForBeginners #MoneyLessons #TimeBeatsTiming #SmartInvesting #BuildWealth',
    ],
  },
  'edu-market-cycles': {
    hook: [
      'Markets move in cycles. Knowing where you are in the cycle changes everything.',
      'The yield curve has predicted every recession since 1970. Most investors ignore it.',
      'Different sectors lead at different cycle stages. Tech dominates mid-cycle. Utilities dominate recessions.',
      'The average bull market lasts about 5 years. The average bear market about 14 months. Plan accordingly.',
      'Do not try to time the top or bottom. Adjust your factor tilts as indicators shift.',
      'The four phases of every market cycle: accumulation, markup, distribution, decline. Learn to read them.',
    ],
    body: [
      'Market cycles have four phases:\n\n1. Accumulation -- smart money buys after a downturn. Sentiment is negative.\n2. Markup -- broad participation drives prices higher. Momentum builds.\n3. Distribution -- early investors take profits. Volatility increases.\n4. Decline -- fear dominates. Prices fall broadly.\n\nYou do not need to time the exact phase. You need to know the direction.',
      'Sector rotation follows economic cycles:\n\nEarly recovery: consumer discretionary, financials\nMid cycle: technology, industrials\nLate cycle: energy, materials\nRecession: utilities, healthcare, consumer staples\n\nYour factor weights should shift accordingly. FlowFolio lets you backtest different tilts across historical cycles.',
      'Four indicators that signal where we are in the cycle:\n\n- Yield curve: inversion predicts recessions 12-18 months ahead\n- Credit spreads: widening signals rising risk\n- Manufacturing PMI: below 50 signals contraction\n- Unemployment claims: rising claims precede downturns\n\nNone are perfect alone. Together they paint a clear picture.',
      'The biggest mistake in cycle investing: trying to call exact tops and bottoms.\n\nInstead, adjust gradually. Favor value and quality in late cycles. Lean into momentum in early-to-mid cycles. Increase defensive factor weights when indicators flash warning.\n\nBacktest these adjustments with FlowFolio before applying them.',
    ],
    cta: [
      'Stress-test your strategy across market cycles. Link in bio.',
      'Follow @flowfolio for investing concepts that actually move the needle.',
      'Backtest across bulls, bears, and crashes. Download FlowFolio.',
      'Save this for the next time the market gets choppy.',
    ],
    hashtags: [
      '#FlowFolio #MarketCycles #BullMarket #BearMarket #EconomicCycle #InvestorEducation #SectorRotation #MacroInvesting #SmartMoney',
      '#FlowFolio #MarketPhases #YieldCurve #RecessionIndicators #CyclicalInvesting #InvestSmart #MarketAnalysis #FinancialLiteracy #WealthBuilding',
      '#FlowFolio #CycleAwareness #SectorAllocation #MacroStrategy #InvestingTips #QuantFinance #DataDriven #MarketTiming #PersonalFinance',
      '#FlowFolio #MarketHistory #EconomicIndicators #InvestmentCycles #TacticalAllocation #RiskManagement #InvestorMindset #FinTech #SmartInvesting',
    ],
  },
  'edu-momentum': {
    hook: [
      'Momentum is the most well-documented anomaly in finance. Stocks that go up tend to keep going up.',
      'The classic momentum measure: 12-month return, skip the most recent month. Backed by 200 years of data.',
      'Momentum crashes are fast and brutal. 2009 was the worst in decades. Pair momentum with risk controls.',
      'Momentum + Quality filters out junk stocks riding hype. Momentum alone is a blunt instrument.',
      'Momentum works because of two things: investor herding and slow information diffusion.',
      'A momentum strategy without a stop-loss is a ticking time bomb. The reversals are violent.',
    ],
    body: [
      'Momentum investing targets stocks with strong recent performance.\n\nMeasure it with:\n- Relative strength vs the market over 6-12 months\n- Rate of change over a lookback period\n- Moving average crossovers\n- 52-week high proximity\n\nThe academic standard: 12-month return, skip the most recent month to avoid short-term reversal.',
      'Momentum thrives in trending markets with clear winners and losers. It captures investor herding behavior and slow information diffusion across the market.\n\nBut it has a weakness: sharp reversals. In 2009, momentum suffered its worst drawdown in decades as beaten-down stocks snapped back violently.\n\nAlways pair momentum with risk management.',
      'Multi-factor blends fix momentum\'s problems:\n\n- Momentum + Quality: filters out junk stocks riding hype\n- Momentum + Value: finds cheap stocks starting to turn around\n- Momentum + Low Volatility: reduces crash risk\n\nSingle-factor momentum is volatile. Multi-factor momentum is a strategy.',
      'Building a momentum portfolio:\n\n1. Score your universe by 12-month price return (skip last month)\n2. Rank stocks into quintiles\n3. Buy the top quintile, avoid the bottom\n4. Rebalance monthly or quarterly\n5. Apply a drawdown stop-loss (20-25%) to limit crash damage\n\nFlowFolio automates all of this with customizable lookback periods.',
    ],
    cta: [
      'Build your first momentum strategy with FlowFolio. Link in bio.',
      'Follow @flowfolio for factor investing breakdowns.',
      'Backtest momentum across 20 years of data. Download FlowFolio.',
      'Save this. Momentum is simple to understand, hard to execute well.',
    ],
    hashtags: [
      '#FlowFolio #MomentumInvesting #FactorInvesting #TrendFollowing #QuantTrading #InvestorEducation #SystematicInvesting #SmartMoney #StockMarket',
      '#FlowFolio #MomentumStrategy #RelativeStrength #QuantFinance #BackTesting #InvestSmart #TradingStrategy #FactorModel #WealthBuilding',
      '#FlowFolio #MomentumFactor #PriceAction #TechnicalAnalysis #FactorWeighting #DataDriven #InvestingTips #PortfolioStrategy #FinTech',
      '#FlowFolio #TrendMomentum #QuantitativeInvesting #MovingAverages #AlphaGeneration #InvestmentResearch #SystematicTrading #SmartInvesting #PersonalFinance',
    ],
  },
  'edu-portfolio-construction': {
    hook: [
      'Building a portfolio starts with one question: what is your time horizon?',
      'Asset allocation drives 90% of portfolio returns. Stock picking drives the rest.',
      'No single stock should exceed 5% of your portfolio. This rule saves more portfolios than any other.',
      'Equal-weight is the simplest allocation. Risk-parity is the smartest. Neither is wrong.',
      'Over-trading, no rebalancing, and chasing performance. The three mistakes that kill most portfolios.',
      'A 1% management fee looks small until you realize it costs 25% of your lifetime wealth.',
    ],
    body: [
      'Portfolio construction in 4 steps:\n\n1. Set your asset allocation (stocks/bonds/cash based on age and risk tolerance)\n2. Choose your approach: passive index, factor-based, or active stock picking\n3. Size positions across 15-30 holdings, no single stock over 5%\n4. Rebalance quarterly to prevent drift from turning a balanced portfolio into a concentrated bet.',
      'The three approaches to portfolio construction:\n\nPassive -- buy index funds and hold. Low cost, hard to beat long-term.\nFactor-based -- tilt toward value, momentum, or quality factors for potential outperformance.\nActive -- pick individual stocks based on fundamental research.\n\nMost investors benefit from a hybrid: core index holdings + satellite factor tilts.',
      'The mistakes that cost investors the most money:\n\n- Over-trading: transaction costs and taxes erode returns silently\n- No rebalancing: drift turns balanced portfolios into concentrated bets\n- Chasing last year\'s winner: rarely works two years in a row\n- Ignoring fees: 1% annual fee compounds to 25% wealth loss over 30 years\n\nDiscipline beats intelligence in portfolio management.',
      'Position sizing is where most DIY investors go wrong.\n\nEqual-weight across 20 stocks is simple and effective.\nRisk-parity weights by inverse volatility -- higher-volatility stocks get smaller positions.\nFactor-weighted allocations overweight stocks with stronger factor scores.\n\nFlowFolio supports all three approaches with automated buy list generation.',
    ],
    cta: [
      'Build your portfolio with FlowFolio. Link in bio.',
      'Follow @flowfolio for systematic investing frameworks.',
      'Generate a buy list based on your strategy. Download FlowFolio.',
      'Save this. Reference it the next time you rebalance.',
    ],
    hashtags: [
      '#FlowFolio #PortfolioConstruction #AssetAllocation #PositionSizing #InvestorEducation #PortfolioManagement #Diversification #SmartMoney #PersonalFinance',
      '#FlowFolio #BuildAPortfolio #InvestingBasics #Rebalancing #RiskParity #FinancialLiteracy #InvestSmart #WealthBuilding #IndexInvesting',
      '#FlowFolio #PortfolioDesign #InvestmentStrategy #FactorTilts #DisciplinedInvesting #InvestingTips #QuantMadeSimple #PortfolioOptimization #FinTech',
      '#FlowFolio #FirstPortfolio #InvestingForBeginners #AssetManagement #CoreSatellite #EqualWeight #SmartInvesting #MoneyMindset #WealthCreation',
    ],
  },
  'open-source': {
    hook: [
      'The code that manages your money should never be a black box.',
      'We open-sourced our entire investing platform. Every algorithm. Every calculation. Every line.',
      'Most fintech companies guard their code like a trade secret. We put ours on GitHub.',
      'Transparency is not a feature. It\'s a prerequisite for trust.',
      'You wouldn\'t take a pill without knowing what\'s in it. Why trust opaque investing software?',
      'Free as in freedom. Free as in beer. Free as in "we actually mean it."',
      'The investing tool that gets better because its users are also its developers.',
      'No premium tier. No hidden fees. No bait-and-switch. Open source, full stop.',
    ],
    body: [
      'Every algorithm in FlowFolio is auditable on GitHub.\n\nThe factor scoring engine. The backtesting math. The portfolio optimizer. The data aggregation pipeline.\n\nIf you want to verify that a Sharpe ratio is being calculated correctly, read the source code. That\'s the point.',
      'Why we\'re open source:\n\n1. Financial software should be auditable\n2. The best ideas come from the community\n3. Vendor lock-in is hostile to users\n4. Free tools lower the barrier to smart investing\n\nNo hidden agenda. No premium upsell coming. The full app, forever.',
      'Most "free" investing tools monetize you.\n\nThey sell your data, your order flow, your attention. You are the product.\n\nFlowFolio has no revenue model because it doesn\'t need one. It\'s a tool built by investors who wanted a better tool. That\'s the entire business plan.',
      'Open source is not just a license. It\'s a promise.\n\nA promise that your investment tools will never be rug-pulled by a pivot to enterprise. That your strategies won\'t be held hostage by a subscription change. That the math is always verifiable.\n\nFlowFolio keeps that promise.',
    ],
    cta: [
      'Read the source. Trust the math. Link in bio.',
      'Star us on GitHub if you believe investing tools should be transparent.',
      'Fork it. Mod it. Make it yours. That\'s what open source means.',
      'Free forever. No catch. Download FlowFolio.',
    ],
    hashtags: [
      '#FlowFolio #OpenSource #FOSS #FreeSoftware #BuildInPublic #TransparentTech #GitHub #AuditableCode #InvestSmart',
      '#FlowFolio #OpenSourceFinance #CommunityDriven #FreeTools #NoVendorLockIn #DevTools #InvestingApps #FinTech #OpenSourceInvesting',
      '#FlowFolio #OpenSourceDev #InvestorTools #FreeForever #GitHubProject #CodeTransparency #IndieApp #TechForGood #SmartInvesting',
      '#FlowFolio #FOSS #OpenFinance #CommunityBuilt #NoHiddenFees #TrustTheCode #OpenAlgorithms #InvestmentTech #FinancialFreedom',
    ],
  },
  'portfolio-optimization': {
    hook: [
      'Owning 30 stocks doesn\'t mean you\'re diversified. Correlation does.',
      'Your portfolio has risks you can\'t see. Optimization makes them visible.',
      'Markowitz won a Nobel Prize for this math. FlowFolio puts it on your desktop.',
      'The difference between "I own a lot of stuff" and "I\'m optimally allocated" is enormous.',
      'I ran my "diversified" portfolio through an optimizer. Turns out 70% of my risk came from 3 stocks.',
      'Risk parity isn\'t a buzzword. It\'s the framework that $200B+ in AUM is managed with.',
      'Your portfolio\'s biggest risk probably isn\'t the market. It\'s your allocation.',
      'Rebalancing without math is just rearranging deck chairs. Here\'s the math.',
    ],
    body: [
      'FlowFolio\'s portfolio optimizer finds your efficient frontier:\n\n- Mean-variance optimization\n- Risk-parity weighting\n- Correlation analysis\n- Contribution-to-risk decomposition\n\nSee exactly how each holding affects your portfolio\'s risk/return profile. Then optimize accordingly.',
      'What most investors get wrong about diversification:\n\nOwning AAPL, MSFT, GOOGL, and AMZN is not diversification. Their correlation is 0.8+.\n\nTrue diversification means understanding how your holdings move together. FlowFolio\'s correlation matrix shows you what\'s actually reducing risk vs. what\'s just adding positions.',
      'The efficient frontier is not academic theory. It\'s the single most useful visualization in portfolio management.\n\nFlowFolio plots it for your actual holdings, shows you where your current allocation sits, and tells you exactly what to change to reach the optimal point.\n\nMath, not opinions.',
      'Most investors rebalance by feel. "This position feels too big. That one feels too small."\n\nFlowFolio generates specific rebalance signals based on your target allocation, current drift, and transaction cost constraints. No guessing. Just execution.',
    ],
    cta: [
      'Find your efficient frontier. Link in bio.',
      'Save this for your next rebalancing day.',
      'Diversification is math. Start doing the math. Download FlowFolio.',
      'Follow @flowfolio for institutional-grade portfolio tools.',
    ],
    hashtags: [
      '#FlowFolio #PortfolioOptimization #EfficientFrontier #SharpeRatio #ModernPortfolioTheory #AssetAllocation #RiskManagement #InvestSmart #QuantFinance',
      '#FlowFolio #RiskParity #MeanVariance #Diversification #Rebalancing #CorrelationMatrix #PortfolioManagement #RiskAdjustedReturns #SmartMoney',
      '#FlowFolio #OptimalAllocation #PortfolioRisk #InvestmentScience #QuantitativeInvesting #Markowitz #RiskDecomposition #FinTech #WealthBuilding',
      '#FlowFolio #PortfolioConstruction #AssetManagement #RiskBudgeting #EfficientPortfolio #RebalanceSignals #InvestingTools #DataDriven #SmartInvesting',
    ],
  },
  'market-data': {
    hook: [
      '8 data providers. Smart failover. Intelligent caching. Zero cost.',
      'Bloomberg: $25K/year. FlowFolio: 3 free API keys and 5 minutes.',
      'When your data source goes down at market open, you need a fallback. FlowFolio has 7.',
      'We reverse-engineered how institutional data infrastructure works. Then we made it free.',
      'Most free investing tools die when APIs rate-limit them. We engineered around that problem.',
      'You don\'t need a $300/month terminal for reliable market data. You need smarter architecture.',
      'The secret to free, reliable market data: redundancy, caching, and circuit breakers.',
      'Enterprise-grade data resilience patterns, running on your laptop. No subscription required.',
    ],
    body: [
      'FlowFolio\'s data layer is overengineered on purpose:\n\n- 8 providers with health-based failover\n- Two-tier caching (in-memory + SQLite)\n- Circuit breakers for downed providers\n- Rate limiting that respects API tiers\n- Request deduplication to prevent waste\n\nBecause your analysis should never stop because a free API had a bad day.',
      'The data stack in FlowFolio:\n\nTier 1: Alpaca (unlimited, free)\nTier 2: Finnhub, FMP, Tiingo, Twelve Data\nTier 3: Polygon, Alpha Vantage\nFallback: Yahoo Finance (no key needed)\n\nIf Tier 1 is slow, Tier 2 picks up. If everything fails, Yahoo Finance catches the request. No single point of failure.',
      'The engineering behind FlowFolio\'s data layer:\n\nMoka cache for sub-millisecond memory reads. SQLite cache for persistent storage across sessions. Governor-based rate limiting per provider. Tokio-powered async for parallel requests.\n\nAll written in Rust for maximum performance and reliability.',
      'Configure 2-3 free API keys in your .env file. That\'s it.\n\nFlowFolio\'s health monitor routes each request to the fastest, healthiest provider. If one goes down, the circuit breaker trips and traffic shifts automatically.\n\nYou get enterprise reliability from free-tier APIs.',
    ],
    cta: [
      'Set up institutional-grade data in 5 minutes. Link in bio.',
      'Free API keys + smart engineering = no more data outages. Download FlowFolio.',
      'Follow @flowfolio if you appreciate overengineered reliability.',
      'Never pay for a market data subscription again. Link in bio.',
    ],
    hashtags: [
      '#FlowFolio #MarketData #DataEngineering #APIIntegration #SmartFailover #FreeData #InvestSmart #RealTimeData #FinTech',
      '#FlowFolio #CircuitBreaker #RateLimiting #DataResilience #SystemDesign #RustLang #TechInvesting #QuantTrading #SmartMoney',
      '#FlowFolio #DataAggregation #MultiSource #CacheStrategy #MarketAnalysis #InvestingTools #BackendEngineering #DataInfrastructure #WealthTech',
      '#FlowFolio #FreeMarketData #APIArchitecture #DataPipeline #IntelligentFailover #FinancialData #DevTools #SoftwareEngineering #InvestSmart',
    ],
  },
  'founder-story': {
    hook: [
      'I spent $400/month on investing tools before I built my own. For free.',
      'Every investing app I tried had the same problem: they wanted my data more than they wanted to help me.',
      'I\'m an engineer who got tired of the investing tool landscape. So I built FlowFolio.',
      'The best tool is the one you build because nothing else exists.',
      'I wanted quant investing tools without the $25K/year price tag. So I made them.',
      'What happens when an engineer gets frustrated with fintech: open-source investing software.',
    ],
    body: [
      'The idea behind FlowFolio started simple:\n\nI wanted to backtest factor strategies. Every tool that did it well cost thousands. Every free tool was unreliable.\n\nSo I built one. Then I open-sourced it. Now it\'s a full portfolio management platform -- and it\'s still free.',
      'FlowFolio wasn\'t built by a VC-funded startup trying to find product-market fit.\n\nIt was built by an investor who needed better tools and happened to know Rust and React.\n\nNo growth hacks. No engagement metrics. No dark patterns. Just a good tool, built with care.',
      'The stack behind FlowFolio:\n\n- Tauri 2 for the desktop shell\n- Rust for the backend (performance + security)\n- React 19 for the frontend\n- SQLite for local data storage\n- 8 market data APIs with smart failover\n\nBuilt for investors who care about privacy, performance, and control.',
      'Building in public means being honest about the journey.\n\nFlowFolio started as a weekend project. Now it has a quant engine, a backtester, an AI portfolio agent, and a multi-source data layer.\n\nEvery feature was built because an investor (usually me) needed it. That\'s the roadmap.',
    ],
    cta: [
      'The full app is free. Download it. Link in bio.',
      'Follow @flowfolio for the build-in-public journey.',
      'If you believe investing tools should be free and open, star us on GitHub.',
      'Built for investors, by an investor. Try FlowFolio today.',
    ],
    hashtags: [
      '#FlowFolio #BuildInPublic #IndieHacker #OpenSource #FounderStory #SoloFounder #InvestSmart #FinTech #TechStartup',
      '#FlowFolio #BuiltByInvestors #IndieDev #SideProject #OpenSourceFinance #RustLang #TauriApp #DevJourney #MakerCommunity',
      '#FlowFolio #FounderLife #BuildingInPublic #OpenSourceDev #InvestingTools #ProductHunt #IndieApp #StartupStory #SmartMoney',
      '#FlowFolio #SoloBuilder #OpenFinance #DevLife #TechFounder #InvestorBuilder #FreeTools #CommunityDriven #InvestSmart',
    ],
  },
};

const THEME_KEYS = Object.keys(THEMES);

// --- Caption generation ---

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// Use a simple hash to get a second independent pick from the same array
function pickSecond<T>(arr: T[], seed: number): T {
  const offset = (Math.abs(seed) + 3) % arr.length;
  return arr[offset];
}

/**
 * Strip all emoji/emoticon unicode characters from a string.
 * Keeps standard ASCII, accented Latin chars, and common punctuation.
 */
function stripEmoji(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Caption style setting. Set CAPTION_STYLE=professional in .env to enforce
 * clean, human-sounding captions: no "Bottom line:", no "---" dividers,
 * no emoticons anywhere. Default keeps the original format rotation.
 *
 * Format options (default mode only):
 *   0 = Standard (hook + body + CTA)
 *   1 = Thread-style (hook + body + CTA, body paragraphs separated)
 *   2 = Story-led — DISABLED in professional mode (adds AI-sounding "Bottom line:")
 *   3 = Mic-drop (hook + body + CTA)
 */
const CAPTION_STYLE = (process.env.CAPTION_STYLE ?? 'professional') as 'default' | 'professional';

export function generateCaption(theme: string, seed: number): { caption: string; hashtags: string } {
  const t = THEMES[theme] || THEMES['vibe-investing'];

  // In professional mode: always use format 0 (clean hook + body + CTA).
  // Formats 1 (adds "---") and 2 (adds "Bottom line:") are AI tells — skip them.
  const format = CAPTION_STYLE === 'professional' ? (Math.abs(seed) % 2 === 0 ? 0 : 3) : Math.abs(seed) % 4;

  const hook = pickRandom(t.hook, seed);
  const body = pickRandom(t.body, seed >> 3);
  const cta = pickRandom(t.cta, seed >> 6);
  const hashtags = pickRandom(t.hashtags, seed >> 9);

  let caption: string;

  switch (format) {
    case 0:
    case 3:
      // Clean: hook + body + CTA. No dividers, no meta-commentary.
      caption = `${hook}\n\n${body}\n\n${cta}`;
      break;

    case 1: {
      // Thread-style: body paragraphs separated — only used in default mode
      const bodyLines = body.split('\n').filter(l => l.trim());
      const formatted = bodyLines.length > 1 ? bodyLines.join('\n\n') : body;
      caption = `${hook}\n\n${formatted}\n\n${cta}`;
      break;
    }

    case 2: {
      // Story-led — only used in default mode
      const altHook = pickSecond(t.hook, seed >> 2);
      caption = `${hook}\n\n${body}\n\nBottom line: ${altHook.toLowerCase().replace(/\.$/, '')}\n\n${cta}`;
      break;
    }

    default:
      caption = `${hook}\n\n${body}\n\n${cta}`;
  }

  // Always strip emoji from both caption and hashtags — no emoticons in posts
  return { caption: stripEmoji(caption), hashtags: stripEmoji(hashtags) };
}

export function pickTheme(seed: number): string {
  return THEME_KEYS[Math.abs(seed) % THEME_KEYS.length];
}

// --- Content mix strategy ---

export type ContentMix = 'ig-only' | 'mixed' | 'all' | 'growth';

const IG_REELS = ['intro-ig', 'demo-ig'];
const IG_FEEDS = ['feed-tip', 'feed-metrics', 'feed-backtest', 'feed-feature', 'feed-quote'];
const IG_CAROUSELS = ['carousel'];
const ALL_COMPOSITIONS = Object.keys(COMPOSITIONS);

export function pickComposition(seed: number, mix: ContentMix = 'ig-only'): string {
  switch (mix) {
    case 'ig-only':
      return IG_REELS[Math.abs(seed) % IG_REELS.length];
    case 'growth': {
      // 30% reels, 40% feed, 30% carousel
      const idx = Math.abs(seed) % 10;
      if (idx < 3) return IG_REELS[Math.abs(seed >> 2) % IG_REELS.length];
      if (idx < 7) return IG_FEEDS[Math.abs(seed >> 2) % IG_FEEDS.length];
      return IG_CAROUSELS[0];
    }
    case 'mixed': {
      // 30% IG reels, 40% feed posts, 20% carousel, 10% other
      const roll = Math.abs(seed) % 10;
      if (roll < 3) return IG_REELS[Math.abs(seed >> 2) % IG_REELS.length];
      if (roll < 7) return IG_FEEDS[Math.abs(seed >> 2) % IG_FEEDS.length];
      if (roll < 9) return IG_CAROUSELS[0];
      return ALL_COMPOSITIONS[Math.abs(seed >> 2) % ALL_COMPOSITIONS.length];
    }
    case 'all':
      return ALL_COMPOSITIONS[Math.abs(seed) % ALL_COMPOSITIONS.length];
  }
}

// --- Rendering ---

export function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Async Playwright-based renderer for feed-feature, feed-metrics, and carousel.
 * Called by scheduler.ts with await. Falls back to sync renderContent for other types.
 */
export async function renderContentPlaywright(postId: string): Promise<string> {
  const { videoPath } = await generatePost(postId);
  return videoPath;
}

export function renderContent(compositionKey: string, seed: number): string {
  const comp = COMPOSITIONS[compositionKey];
  if (!comp) throw new Error(`Unknown composition: ${compositionKey}`);

  ensureOutputDir();

  if (comp.type === 'carousel') {
    return renderCarousel(comp, seed);
  }
  if (comp.type === 'still') {
    return renderStill(comp, seed);
  }
  return renderVideo(comp, seed);
}

function renderStill(comp: CompositionConfig, seed: number): string {
  const filename = `${comp.id}-${seed}.png`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`Image already rendered: ${filename}`);
    return outputPath;
  }

  console.log(`Rendering ${comp.displayName} (seed: ${seed})...`);

  const propsJson = JSON.stringify({ seed });
  // Render at frame 80 -- all animations settled by then
  const cmd = [
    'npx', 'remotion', 'still',
    'src/remotion/index.ts',
    comp.compositionId,
    outputPath,
    '--props', `'${propsJson}'`,
    '--frame', '80',
  ].join(' ');

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 120000,
    });
  } catch (err) {
    throw new Error(`Still render failed for ${comp.compositionId}: ${(err as Error).message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Still output not found: ${outputPath}`);
  }

  const size = (fs.statSync(outputPath).size / 1024).toFixed(0);
  console.log(`Rendered: ${filename} (${size} KB)`);
  return outputPath;
}

function getCarouselSlideCount(seed: number): number {
  // Replicate the PRNG logic from FlowFolioCarousel.tsx to determine topic slide count
  // CAROUSEL_TOPICS has 5 topics, each with 6 content slides + cover + CTA = 8 total
  // The VideoRNG picks topic based on seed, all topics have 6 slides
  return 8; // cover + 6 content + CTA
}

function renderCarousel(comp: CompositionConfig, seed: number): string {
  const slideCount = getCarouselSlideCount(seed);
  const carouselDir = path.join(OUTPUT_DIR, `carousel-${seed}`);

  if (fs.existsSync(carouselDir) && fs.readdirSync(carouselDir).length === slideCount) {
    console.log(`Carousel already rendered: carousel-${seed}/ (${slideCount} slides)`);
    return carouselDir;
  }

  if (!fs.existsSync(carouselDir)) {
    fs.mkdirSync(carouselDir, { recursive: true });
  }

  console.log(`Rendering ${comp.displayName} (seed: ${seed}, ${slideCount} slides)...`);

  for (let i = 0; i < slideCount; i++) {
    const slideFile = path.join(carouselDir, `slide-${String(i).padStart(2, '0')}.png`);

    if (fs.existsSync(slideFile)) {
      console.log(`  Slide ${i + 1}/${slideCount} -- already exists`);
      continue;
    }

    console.log(`  Slide ${i + 1}/${slideCount} -- rendering...`);

    const propsJson = JSON.stringify({ seed, slide: i });
    const cmd = [
      'npx', 'remotion', 'still',
      'src/remotion/index.ts',
      comp.compositionId,
      slideFile,
      '--props', `'${propsJson}'`,
      '--frame', '80',
    ].join(' ');

    try {
      execSync(cmd, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        timeout: 120000,
      });
    } catch (err) {
      throw new Error(`Carousel slide ${i} render failed: ${(err as Error).message}`);
    }

    if (!fs.existsSync(slideFile)) {
      throw new Error(`Carousel slide output not found: ${slideFile}`);
    }
  }

  const totalSize = fs.readdirSync(carouselDir)
    .reduce((sum, f) => sum + fs.statSync(path.join(carouselDir, f)).size, 0);
  console.log(`Carousel rendered: ${slideCount} slides (${(totalSize / 1024).toFixed(0)} KB total)`);
  return carouselDir;
}

function renderVideo(comp: CompositionConfig, seed: number): string {
  const filename = `${comp.id}-${seed}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`Video already rendered: ${filename}`);
    return outputPath;
  }

  console.log(`Rendering ${comp.displayName} (seed: ${seed})...`);

  const propsJson = JSON.stringify({ seed });

  const cmd = [
    'npx', 'remotion', 'render',
    'src/remotion/index.ts',
    comp.compositionId,
    outputPath,
    '--props', `'${propsJson}'`,
  ].join(' ');

  try {
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 1200000, // 20 min for long demo reels
    });
  } catch (err) {
    throw new Error(`Render failed for ${comp.compositionId}: ${(err as Error).message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Render output not found: ${outputPath}`);
  }

  const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`Rendered: ${filename} (${size} MB)`);
  return outputPath;
}

export function generateContentPlan(seed: number, mix: ContentMix = 'ig-only'): {
  composition: string;
  seed: number;
  theme: string;
  caption: string;
  hashtags: string;
} {
  const composition = pickComposition(seed, mix);
  // Carousels rotate through education themes
  const EDU_THEMES = ['education', 'edu-compounding', 'edu-market-cycles', 'edu-momentum', 'edu-portfolio-construction'];
  const theme = composition === 'carousel'
    ? EDU_THEMES[Math.abs(seed >> 4) % EDU_THEMES.length]
    : pickTheme(seed >> 4);
  const { caption, hashtags } = generateCaption(theme, seed);

  return { composition, seed, theme, caption, hashtags };
}

export { OUTPUT_DIR, PROJECT_ROOT, generateSeed };
