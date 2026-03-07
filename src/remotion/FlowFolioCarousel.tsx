/**
 * FlowFolio Instagram Educational Carousel (1080x1080 per slide)
 *
 * Multi-slide carousel compositions for educational content.
 * Each carousel is a set of slides rendered as individual PNGs.
 * The `slide` prop selects which slide (0-indexed) to render.
 */

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { colors, fonts, radius, gradients } from './styles';
import { Background } from './components/Background';
import { GlassCard } from './components/GlassCard';
import { GlowText } from './components/GlowText';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';

// ─── Shared Carousel Layout ──────────────────────────────────

const CarouselFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.bg,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 60,
    }}
  >
    <Background variant="default" />
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

const LogoBrand: React.FC<{ size?: number }> = ({ size = 36 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity }}>
      <Img
        src={staticFile('logo.png')}
        style={{ width: size, height: size, borderRadius: radius.lg }}
      />
      <span
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: colors.textMuted,
          fontFamily: fonts.sans,
          letterSpacing: '-0.02em',
        }}
      >
        FlowFolio
      </span>
    </div>
  );
};

const SlideIndicator: React.FC<{ total: number; current: number; accent?: string }> = ({
  total,
  current,
  accent = colors.primary,
}) => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          width: i === current ? 28 : 8,
          height: 8,
          borderRadius: 4,
          background: i === current ? accent : 'rgba(255,255,255,0.15)',
          transition: 'all 0.3s',
        }}
      />
    ))}
  </div>
);

const SlideNumber: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <span
    style={{
      fontSize: 14,
      color: colors.textDim,
      fontFamily: fonts.mono,
      opacity: 0.6,
    }}
  >
    {current + 1}/{total}
  </span>
);

const FooterBar: React.FC<{ slide: number; total: number; accent?: string }> = ({
  slide,
  total,
  accent,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <LogoBrand />
    <SlideIndicator total={total} current={slide} accent={accent} />
    <SlideNumber current={slide} total={total} />
  </div>
);

// ─── SVG Icons (matching FeedPosts set) ──────────────────────

const ICON_PATHS: Record<string, string> = {
  'chart-bar': 'M3 3v18h18M7 16V9m4 7V5m4 11v-4m4 4V8',
  'shield': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'trending-up': 'M22 7l-8.5 8.5-5-5L2 17',
  'cpu': 'M4 4h16v16H4zM9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3',
  'layers': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'target': 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z',
  'sliders': 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6M9 8h6M17 16h6',
  'database': 'M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2zM2 11.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5',
  'lock': 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  'arrow-right': 'M5 12h14m-7-7l7 7-7 7',
  'check-circle': 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  'book-open': 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  'bar-chart-2': 'M18 20V10M12 20V4M6 20v-6',
  'activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'compass': 'M12 2a10 10 0 100 20 10 10 0 000-20zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
  'award': 'M12 15a7 7 0 100-14 7 7 0 000 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
};

const SvgIcon: React.FC<{
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ name, size = 48, color = colors.text, strokeWidth = 1.8 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={ICON_PATHS[name] || ICON_PATHS['chart-bar']} />
  </svg>
);

// ─── CAROUSEL TOPICS ─────────────────────────────────────────

interface CarouselTopic {
  title: string;
  subtitle: string;
  accent: string;
  icon: string;
  slides: {
    heading: string;
    body: string;
    icon: string;
    highlight?: string;
  }[];
  cta: string;
}

const CAROUSEL_TOPICS: CarouselTopic[] = [
  {
    title: 'Factor Investing\n101',
    subtitle: 'The complete beginner guide',
    accent: colors.primary,
    icon: 'layers',
    slides: [
      {
        heading: 'What is Factor Investing?',
        body: 'Factor investing is a strategy that targets specific drivers of return across asset classes. Instead of picking individual stocks, you invest based on characteristics (factors) that have historically driven higher returns.',
        icon: 'book-open',
      },
      {
        heading: 'The 5 Core Factors',
        body: 'Value — buy underpriced stocks (low P/E)\nMomentum — ride winners, sell losers\nQuality — high ROE, low debt\nSize — small caps outperform long-term\nVolatility — low-vol stocks beat high-vol',
        icon: 'layers',
        highlight: '5 factors backed by decades of academic research',
      },
      {
        heading: 'Why Factors Work',
        body: 'Factors represent compensation for bearing risk, behavioral biases, or structural market inefficiencies. They persist across geographies and time periods because they are rooted in economic fundamentals.',
        icon: 'compass',
      },
      {
        heading: 'Building a Factor Portfolio',
        body: 'Step 1: Choose your factors (momentum + quality is popular)\nStep 2: Score each stock on those factors\nStep 3: Weight your portfolio toward high-scoring stocks\nStep 4: Rebalance quarterly',
        icon: 'sliders',
      },
      {
        heading: 'Common Mistakes',
        body: 'Chasing single-factor performance — factors rotate.\nIgnoring transaction costs from frequent rebalancing.\nOver-fitting to historical data without out-of-sample testing.\nNot diversifying across multiple factors.',
        icon: 'target',
      },
      {
        heading: 'How FlowFolio Helps',
        body: 'FlowFolio lets you design factor strategies with intuitive sliders, backtest against 20 years of data, and see exactly how your factor mix would have performed — all locally on your machine.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this carousel and start building your first factor strategy with FlowFolio.',
  },
  {
    title: 'Backtesting\nYour Strategy',
    subtitle: 'Test before you invest',
    accent: colors.accent,
    icon: 'activity',
    slides: [
      {
        heading: 'What is Backtesting?',
        body: 'Backtesting runs your investment strategy against historical market data to see how it would have performed. It answers the critical question: "Would this strategy have made money in the past?"',
        icon: 'book-open',
      },
      {
        heading: 'Key Metrics to Watch',
        body: 'CAGR — Compound annual growth rate\nSharpe Ratio — Return per unit of risk\nMax Drawdown — Worst peak-to-trough decline\nWin Rate — Percentage of profitable periods\nAlpha — Excess return vs benchmark',
        icon: 'bar-chart-2',
        highlight: 'A Sharpe above 1.0 is considered good',
      },
      {
        heading: 'Avoiding Overfitting',
        body: 'The biggest backtesting trap is overfitting — tuning your strategy to perfectly match past data. An overfitted strategy looks amazing historically but fails in real markets. Always use out-of-sample testing.',
        icon: 'target',
      },
      {
        heading: 'Walk-Forward Analysis',
        body: 'Split your data into training and testing periods. Optimize on the training set, then validate on the testing set. Repeat by rolling the window forward. This simulates real-world strategy deployment.',
        icon: 'arrow-right',
      },
      {
        heading: 'Benchmark Comparison',
        body: 'Always compare your strategy against a simple benchmark like the S&P 500 buy-and-hold. If your complex strategy cannot beat a simple index fund after fees, it is not worth the effort.',
        icon: 'trending-up',
      },
      {
        heading: 'Backtest with FlowFolio',
        body: 'FlowFolio runs full backtests locally — no cloud needed. See equity curves, drawdown charts, rolling returns, and risk metrics. Compare any vibe strategy against buy-and-hold instantly.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this and backtest your strategy before putting real money to work.',
  },
  {
    title: 'Portfolio Risk\nManagement',
    subtitle: 'Protect your capital',
    accent: colors.cyan,
    icon: 'shield',
    slides: [
      {
        heading: 'Why Risk Management Matters',
        body: 'A 50% loss requires a 100% gain to break even. Risk management is not about avoiding risk — it is about taking the right amount of risk for your goals and ensuring no single event can wipe out your portfolio.',
        icon: 'shield',
        highlight: '-50% needs +100% to recover',
      },
      {
        heading: 'Diversification Done Right',
        body: 'True diversification means owning assets that do not move together. Holding 30 tech stocks is not diversified. Mix factors (value + momentum), sectors, geographies, and asset classes for real protection.',
        icon: 'layers',
      },
      {
        heading: 'Position Sizing',
        body: 'Never put more than 5% of your portfolio in a single position. Many professionals use the Kelly Criterion or risk-parity to determine optimal position sizes based on conviction and volatility.',
        icon: 'sliders',
        highlight: 'Max 5% per position is a common rule',
      },
      {
        heading: 'Understanding Drawdowns',
        body: 'Drawdown measures the decline from a portfolio peak. A max drawdown of -20% means at your worst point you were 20% below your high. Track drawdown duration too — how long until recovery.',
        icon: 'activity',
      },
      {
        heading: 'The Sharpe Ratio',
        body: 'Sharpe Ratio = (Return - Risk Free Rate) / Volatility. It measures return per unit of risk. A strategy returning 12% with 8% volatility (Sharpe 1.5) is better than 20% return with 25% volatility (Sharpe 0.8).',
        icon: 'award',
      },
      {
        heading: 'Monitor with FlowFolio',
        body: 'FlowFolio calculates Sharpe ratio, max drawdown, volatility, and 30+ risk metrics for your portfolio. All computed locally from multi-source market data with zero subscription fees.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this guide and start monitoring your portfolio risk with FlowFolio.',
  },
  {
    title: 'Reading\nFinancial Ratios',
    subtitle: 'Fundamental analysis essentials',
    accent: colors.blue,
    icon: 'bar-chart-2',
    slides: [
      {
        heading: 'Why Ratios Matter',
        body: 'Financial ratios translate complex financial statements into comparable numbers. They let you quickly assess whether a stock is cheap, profitable, growing, or over-leveraged — without reading entire annual reports.',
        icon: 'book-open',
      },
      {
        heading: 'Valuation Ratios',
        body: 'P/E Ratio — Price vs earnings. Below 15 is typically "value."\nP/B Ratio — Price vs book value. Below 1 means trading below assets.\nPEG Ratio — P/E adjusted for growth. Below 1 suggests undervalued growth.',
        icon: 'bar-chart-2',
        highlight: 'Compare ratios within the same sector',
      },
      {
        heading: 'Profitability Ratios',
        body: 'ROE — Return on equity. How well management uses shareholder capital.\nROA — Return on assets. Efficiency of total asset utilization.\nNet Margin — What percentage of revenue becomes profit.',
        icon: 'trending-up',
      },
      {
        heading: 'Leverage Ratios',
        body: 'Debt/Equity — How much debt vs shareholder equity. Below 0.5 is conservative.\nInterest Coverage — Can the company cover its interest payments? Above 5x is healthy.\nCurrent Ratio — Short-term liquidity. Above 1.5 means it can pay bills.',
        icon: 'activity',
        highlight: 'High debt amplifies both gains and losses',
      },
      {
        heading: 'Growth Metrics',
        body: 'Revenue Growth — Is the top line expanding?\nEPS Growth — Are earnings per share increasing?\nFree Cash Flow Growth — Is the business generating more cash? FCF is harder to manipulate than earnings.',
        icon: 'arrow-right',
      },
      {
        heading: 'Analyze with FlowFolio',
        body: 'FlowFolio computes 30+ financial ratios per stock using data from 8 free providers. See radar charts, factor scores, and sector comparisons — all on your local machine, no Bloomberg needed.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this reference and analyze any stock with FlowFolio.',
  },
  {
    title: 'Data Privacy\nin Investing',
    subtitle: 'Why your portfolio data matters',
    accent: colors.rose,
    icon: 'lock',
    slides: [
      {
        heading: 'Your Data Has Value',
        body: 'When you use a free portfolio tracker, your holdings, trades, and strategies become the product. Brokers and apps sell aggregated trading data to hedge funds who trade against retail investors.',
        icon: 'database',
      },
      {
        heading: 'What They Track',
        body: 'Your exact holdings and position sizes.\nEvery trade you make and when you make it.\nYour watchlist reveals your intentions.\nYour portfolio value and risk tolerance.\nAll used for "order flow" payments.',
        icon: 'target',
        highlight: 'Payment for order flow is a multi-billion dollar industry',
      },
      {
        heading: 'The Cloud Problem',
        body: 'Cloud-based apps store your data on their servers. Even with encryption, they hold the keys. Data breaches expose financial information. Server outages lock you out of your own portfolio.',
        icon: 'shield',
      },
      {
        heading: 'Local-First Architecture',
        body: 'Local-first means your data never leaves your device. No accounts to create. No servers to trust. No data to breach. Your portfolio analysis runs entirely on your machine using your hardware.',
        icon: 'lock',
      },
      {
        heading: 'Secure API Key Storage',
        body: 'Market data requires API keys. FlowFolio stores them in an OS-level encrypted vault (Tauri Stronghold), not in plain text config files. Keys are never exposed to the frontend or logged anywhere.',
        icon: 'shield',
        highlight: 'Encrypted at the operating system level',
      },
      {
        heading: 'FlowFolio is Privacy-First',
        body: 'Zero telemetry. Zero cloud. Zero accounts. All data in local SQLite. API keys in encrypted vaults. Open-source Rust backend you can audit. Your investment data stays yours.',
        icon: 'check-circle',
      },
    ],
    cta: 'Save this and take control of your portfolio privacy with FlowFolio.',
  },
  {
    title: 'Momentum Investing\nExplained',
    subtitle: 'Ride the trend with confidence',
    accent: colors.amber,
    icon: 'trending-up',
    slides: [
      {
        heading: 'What is Momentum?',
        body: 'Momentum investing is based on a simple observation: stocks that have been going up tend to keep going up, and stocks that have been falling tend to keep falling. It is one of the most well-documented anomalies in finance.',
        icon: 'book-open',
      },
      {
        heading: 'How to Measure It',
        body: 'Relative Strength — Compare a stock\'s return vs the market over 6-12 months.\nRate of Change — Percentage price change over a lookback period.\nMoving Average Crossover — When short-term MA crosses above long-term MA.\n52-Week High Proximity — Stocks near their highs often keep climbing.',
        icon: 'bar-chart-2',
        highlight: '12-month momentum with 1-month skip is the classic measure',
      },
      {
        heading: 'When Momentum Works',
        body: 'Momentum thrives in trending markets with clear winners and losers. It performs best during sustained bull runs and sector rotations. The strategy captures investor herding behavior and slow information diffusion.',
        icon: 'trending-up',
      },
      {
        heading: 'When It Fails',
        body: 'Momentum crashes happen during sharp market reversals — so-called "momentum crashes." In 2009, momentum suffered its worst drawdown in decades as beaten-down stocks snapped back violently. Always pair momentum with risk controls.',
        icon: 'shield',
        highlight: 'Momentum reversals are fast and brutal',
      },
      {
        heading: 'Combining with Other Factors',
        body: 'Momentum + Quality filters out junk stocks riding hype.\nMomentum + Value finds cheap stocks starting to turn around.\nMomentum + Low Volatility reduces crash risk.\nMulti-factor blends smooth out single-factor drawdowns.',
        icon: 'layers',
      },
      {
        heading: 'Momentum in FlowFolio',
        body: 'FlowFolio lets you build momentum strategies with customizable lookback periods, combine them with any other factor, and backtest across decades of data. All computed locally — your alpha stays yours.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this carousel and build your first momentum strategy with FlowFolio.',
  },
  {
    title: 'Building Your\nFirst Portfolio',
    subtitle: 'From zero to invested',
    accent: colors.primary,
    icon: 'compass',
    slides: [
      {
        heading: 'Getting Started',
        body: 'Building a portfolio starts with understanding your goals. Are you saving for retirement in 30 years or a house in 5? Your time horizon and risk tolerance determine everything — from asset allocation to rebalancing frequency.',
        icon: 'compass',
      },
      {
        heading: 'Asset Allocation',
        body: 'Asset allocation drives 90% of portfolio returns. A classic split:\nAggressive (age 25): 90% stocks, 10% bonds\nModerate (age 40): 70% stocks, 30% bonds\nConservative (age 60): 40% stocks, 60% bonds\nAdjust based on your personal risk tolerance.',
        icon: 'layers',
        highlight: 'Allocation matters more than stock picking',
      },
      {
        heading: 'Position Sizing',
        body: 'Spread your capital across 15-30 positions for diversification. No single stock should exceed 5% of your portfolio. Equal-weight is the simplest approach. Risk-parity weights by inverse volatility for smoother returns.',
        icon: 'sliders',
      },
      {
        heading: 'Choosing Your Approach',
        body: 'Passive — Buy index funds and hold. Low cost, hard to beat long-term.\nFactor-Based — Tilt toward value, momentum, or quality factors.\nActive — Pick individual stocks based on research.\nHybrid — Core index holdings + satellite factor tilts.',
        icon: 'target',
      },
      {
        heading: 'Common Mistakes',
        body: 'Over-trading — Transaction costs and taxes erode returns.\nNo rebalancing — Drift turns a balanced portfolio into a concentrated bet.\nChasing performance — Last year\'s winner is rarely next year\'s.\nIgnoring fees — A 1% annual fee costs 25% of your wealth over 30 years.',
        icon: 'activity',
        highlight: '1% in fees = 25% less wealth over 30 years',
      },
      {
        heading: 'Build with FlowFolio',
        body: 'FlowFolio walks you through portfolio construction with factor-based scoring, position sizing tools, and buy list generation. Backtest your allocation before committing real capital — all offline and free.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this guide and build your first portfolio with FlowFolio.',
  },
  {
    title: 'Understanding\nMarket Cycles',
    subtitle: 'Navigate bulls, bears, and everything between',
    accent: colors.cyan,
    icon: 'activity',
    slides: [
      {
        heading: 'What Are Market Cycles?',
        body: 'Markets move in recurring cycles driven by economic expansion and contraction. Understanding where you are in the cycle helps you position your portfolio. No cycle is identical, but patterns rhyme across history.',
        icon: 'book-open',
      },
      {
        heading: 'The Four Phases',
        body: 'Accumulation — Smart money buys after a downturn. Sentiment is negative.\nMarkup — Broad participation drives prices higher. Momentum builds.\nDistribution — Early investors take profits. Volatility increases.\nDecline — Fear dominates. Prices fall broadly. Cash is king.',
        icon: 'activity',
        highlight: 'The average bull market lasts ~5 years',
      },
      {
        heading: 'Sector Rotation',
        body: 'Different sectors lead at different cycle stages:\nEarly Recovery — Consumer discretionary, financials\nMid Cycle — Technology, industrials\nLate Cycle — Energy, materials\nRecession — Utilities, healthcare, consumer staples',
        icon: 'compass',
      },
      {
        heading: 'Leading Indicators',
        body: 'Yield curve — Inversion predicts recessions 12-18 months ahead.\nCredit spreads — Widening signals rising risk.\nManufacturing PMI — Below 50 signals contraction.\nUnemployment claims — Rising claims precede downturns.',
        icon: 'bar-chart-2',
        highlight: 'The yield curve has predicted every recession since 1970',
      },
      {
        heading: 'How to Position',
        body: 'Do not try to time exact tops and bottoms — it is impossible consistently. Instead, adjust factor tilts: favor value and quality in late cycles, momentum in early-to-mid cycles, and defensive factors when indicators flash warning.',
        icon: 'shield',
      },
      {
        heading: 'Cycle Analysis in FlowFolio',
        body: 'FlowFolio lets you backtest your strategy across multiple market cycles to see how it performs in bulls, bears, and crashes. Adjust your factor weights and instantly see the impact — all computed locally.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this and stress-test your strategy across market cycles with FlowFolio.',
  },
  {
    title: 'The Power of\nCompounding',
    subtitle: 'The eighth wonder of the world',
    accent: colors.accent,
    icon: 'award',
    slides: [
      {
        heading: 'Time Value of Money',
        body: 'A dollar today is worth more than a dollar tomorrow because today\'s dollar can be invested and earn returns. This fundamental principle is why starting early matters more than almost any other investment decision.',
        icon: 'book-open',
      },
      {
        heading: 'Compound Interest Math',
        body: '$10,000 invested at 10% annual return:\nAfter 10 years: $25,937\nAfter 20 years: $67,275\nAfter 30 years: $174,494\nYour money did not grow 3x in 30 years — it grew 17x. That is the exponential power of compounding.',
        icon: 'trending-up',
        highlight: '$10K becomes $174K in 30 years at 10%',
      },
      {
        heading: 'The Reinvestment Edge',
        body: 'Reinvesting dividends dramatically accelerates compounding. The S&P 500 returned ~7% without dividends vs ~10% with dividends reinvested from 1960-2020. That difference turns $10K into $70K vs $300K over 40 years.',
        icon: 'layers',
      },
      {
        heading: 'Starting Early vs Timing',
        body: 'Investor A invests $5K/year from age 25-35 then stops (10 years, $50K total).\nInvestor B invests $5K/year from age 35-65 (30 years, $150K total).\nAt 10% returns, Investor A ends with MORE money despite investing one-third as much. Time beats timing.',
        icon: 'arrow-right',
        highlight: 'Starting 10 years earlier beats investing 3x more',
      },
      {
        heading: 'The Rule of 72',
        body: 'Divide 72 by your annual return to find how many years it takes to double your money.\nAt 6%: doubles in 12 years\nAt 8%: doubles in 9 years\nAt 10%: doubles in 7.2 years\nAt 12%: doubles in 6 years\nSmall return differences compound into massive wealth gaps.',
        icon: 'target',
      },
      {
        heading: 'Compound with FlowFolio',
        body: 'FlowFolio projects long-term compounding for any strategy using historical backtests. See how factor tilts, rebalancing frequency, and dividend reinvestment affect your compound growth — all locally on your machine.',
        icon: 'chart-bar',
      },
    ],
    cta: 'Save this and let FlowFolio show you the power of compounding your strategy.',
  },
];

// ─── Slide Components ────────────────────────────────────────

/** Cover slide (slide 0) — big title + logo */
const CoverSlide: React.FC<{ topic: CarouselTopic; totalSlides: number }> = ({
  topic,
  totalSlides,
}) => {
  const frame = useCurrentFrame();
  const logoScale = interpolate(frame, [0, 40], [0.6, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });

  return (
    <CarouselFrame>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <LogoBrand size={40} />
        <SlideNumber current={0} total={totalSlides} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 40,
        }}
      >
        {/* Logo icon */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: radius.full,
              background: `${topic.accent}12`,
              border: `2px solid ${topic.accent}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgIcon name={topic.icon} size={64} color={topic.accent} />
          </div>
        </div>

        <GlowText
          text={topic.title}
          fontSize={64}
          delay={5}
          style={{
            textAlign: 'center',
            lineHeight: 1.15,
            background: `linear-gradient(135deg, ${colors.text}, ${topic.accent})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        />

        <GlowText
          text={topic.subtitle}
          fontSize={26}
          color={colors.textMuted}
          delay={20}
          style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        />

        {/* Swipe hint */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 20,
          }}
        >
          <GlowText
            text="Swipe to learn"
            fontSize={18}
            color={colors.textDim}
            delay={40}
            style={{ textAlign: 'center' }}
          />
          <div style={{ opacity: 0.5 }}>
            <SvgIcon name="arrow-right" size={18} color={colors.textDim} />
          </div>
        </div>
      </div>

      <SlideIndicator total={totalSlides} current={0} accent={topic.accent} />
    </CarouselFrame>
  );
};

/** Content slide (slides 1..N-1) */
const ContentSlide: React.FC<{
  topic: CarouselTopic;
  slideIndex: number;
  totalSlides: number;
}> = ({ topic, slideIndex, totalSlides }) => {
  const slideData = topic.slides[slideIndex - 1];

  return (
    <CarouselFrame>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <LogoBrand />
        <SlideNumber current={slideIndex} total={totalSlides} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        {/* Icon + heading row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.xl,
              background: `${topic.accent}12`,
              border: `1.5px solid ${topic.accent}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SvgIcon name={slideData.icon} size={32} color={topic.accent} />
          </div>
          <GlowText
            text={slideData.heading}
            fontSize={40}
            delay={5}
            style={{ lineHeight: 1.2 }}
          />
        </div>

        {/* Divider */}
        <div
          style={{
            width: 60,
            height: 3,
            borderRadius: 2,
            background: topic.accent,
            opacity: 0.6,
          }}
        />

        {/* Body */}
        <GlassCard delay={15} style={{ padding: 32 }}>
          <GlowText
            text={slideData.body}
            fontSize={26}
            color={colors.textSoft}
            delay={20}
            style={{ lineHeight: 1.7 }}
          />
        </GlassCard>

        {/* Highlight callout */}
        {slideData.highlight && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 24px',
              background: `${topic.accent}08`,
              border: `1px solid ${topic.accent}25`,
              borderRadius: radius.xl,
            }}
          >
            <SvgIcon name="arrow-right" size={20} color={topic.accent} strokeWidth={2.5} />
            <GlowText
              text={slideData.highlight}
              fontSize={20}
              color={topic.accent}
              delay={35}
              style={{ fontWeight: 600 }}
            />
          </div>
        )}
      </div>

      <FooterBar slide={slideIndex} total={totalSlides} accent={topic.accent} />
    </CarouselFrame>
  );
};

/** CTA slide (last slide) */
const CtaSlide: React.FC<{
  topic: CarouselTopic;
  totalSlides: number;
}> = ({ topic, totalSlides }) => {
  const frame = useCurrentFrame();
  const btnScale = interpolate(frame, [20, 50], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });

  return (
    <CarouselFrame>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <LogoBrand size={40} />
        <SlideNumber current={totalSlides - 1} total={totalSlides} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 40,
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 120,
            height: 120,
            borderRadius: radius['2xl'],
          }}
        />

        <GlowText
          text="FlowFolio"
          fontSize={56}
          delay={5}
          style={{
            textAlign: 'center',
            background: gradients.primaryToAccent,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        />

        <GlowText
          text="Privacy-First Investment Intelligence"
          fontSize={24}
          color={colors.textMuted}
          delay={15}
          style={{ textAlign: 'center' }}
        />

        {/* CTA text */}
        <GlassCard delay={25} style={{ padding: 32, maxWidth: 800 }}>
          <GlowText
            text={topic.cta}
            fontSize={26}
            color={colors.textSoft}
            delay={30}
            style={{ textAlign: 'center', lineHeight: 1.6 }}
          />
        </GlassCard>

        {/* Button-like CTA */}
        <div
          style={{
            transform: `scale(${btnScale})`,
            padding: '18px 48px',
            background: gradients.primaryToAccent,
            borderRadius: radius.full,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: colors.bg,
              fontFamily: fonts.sans,
            }}
          >
            Download Free
          </span>
          <SvgIcon name="arrow-right" size={20} color={colors.bg} strokeWidth={2.5} />
        </div>

        <GlowText
          text="100% free -- 100% offline -- 100% yours"
          fontSize={18}
          color={colors.textDim}
          delay={45}
          style={{ textAlign: 'center' }}
        />
      </div>

      <SlideIndicator total={totalSlides} current={totalSlides - 1} accent={topic.accent} />
    </CarouselFrame>
  );
};

// ─── Main Carousel Composition ───────────────────────────────

export const FeedCarousel: React.FC<{
  seed?: number;
  slide?: number;
}> = ({ seed = 42, slide = 0 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const topic = rng.pick(CAROUSEL_TOPICS);
  // cover + content slides + CTA
  const totalSlides = topic.slides.length + 2;

  return (
    <VideoSeedContext.Provider value={rng}>
      {slide === 0 && <CoverSlide topic={topic} totalSlides={totalSlides} />}
      {slide > 0 && slide <= topic.slides.length && (
        <ContentSlide topic={topic} slideIndex={slide} totalSlides={totalSlides} />
      )}
      {slide === totalSlides - 1 && <CtaSlide topic={topic} totalSlides={totalSlides} />}
    </VideoSeedContext.Provider>
  );
};

export const CAROUSEL_SLIDE_COUNT = (seed: number): number => {
  const rng = new VideoRNG(seed);
  const topic = rng.pick(CAROUSEL_TOPICS);
  return topic.slides.length + 2; // cover + content + CTA
};
