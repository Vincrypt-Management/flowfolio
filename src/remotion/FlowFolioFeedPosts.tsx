/**
 * FlowFolio Instagram Feed Post Compositions (1080×1080)
 *
 * Static-rendered compositions for IG feed carousel/single posts.
 * Uses existing design system components with feed-optimized layouts.
 */

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing, Img, staticFile } from 'remotion';
import { colors, fonts, radius } from './styles';
import { Background } from './components/Background';
import { GlassCard } from './components/GlassCard';
import { GlowText } from './components/GlowText';
import { AnimatedNumber } from './components/AnimatedNumber';
import { AnimatedChart } from './components/AnimatedChart';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';
import { generatePortfolioData, generateBacktestData } from './lib/sceneData';

// ─── Shared Feed Layout ──────────────────────────────────────

const FeedFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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

const BrandBar: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity }}>
      <Img
        src={staticFile('logo.png')}
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.lg,
        }}
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

const Watermark: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <BrandBar delay={5} />
    <span
      style={{
        fontSize: 14,
        color: colors.textDim,
        fontFamily: fonts.mono,
        opacity: 0.6,
      }}
    >
      @flowfolio
    </span>
  </div>
);

// ─── SVG Icon Component (no emojis) ──────────────────────────

const ICON_PATHS: Record<string, string> = {
  'chart-bar': 'M3 3v18h18M7 16V9m4 7V5m4 11v-4m4 4V8',
  'flask': 'M9 3h6M10 3v5.2a2 2 0 01-.5 1.3L5.2 15a2 2 0 00-.2.9V18a2 2 0 002 2h10a2 2 0 002-2v-2.1a2 2 0 00-.2-.9l-4.3-5.5a2 2 0 01-.5-1.3V3',
  'brain': 'M12 2a5 5 0 00-4.8 3.6A4 4 0 004 9.5a4.5 4.5 0 001 8.9A5 5 0 0012 22a5 5 0 007-3.6 4.5 4.5 0 001-8.9A4 4 0 0016.8 5.6 5 5 0 0012 2zM12 2v20',
  'trending-up': 'M22 7l-8.5 8.5-5-5L2 17',
  'crosshair': 'M12 2v4m0 12v4M2 12h4m12 0h4M12 8a4 4 0 100 8 4 4 0 000-8z',
  'shield': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'lightbulb': 'M9 21h6m-6-2h6a2 2 0 002-2v-1a7 7 0 10-10 0v1a2 2 0 002 2z',
  'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8',
  'palette': 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.2 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-5.2-4.5-9.3-10-9.3z',
  'bar-chart': 'M12 20V10m6 10V4M6 20v-4',
  'cpu': 'M4 4h16v16H4zM9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3',
  'grid': 'M3 3h7v7H3zm11 0h7v7h-7zm0 11h7v7h-7zM3 14h7v7H3z',
  'tool': 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  'bookmark': 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
  'book': 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z',
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

// ─── Feed Post Type 1: Investment Tip Card ──────────────────

const TIPS = [
  { icon: 'chart-bar', title: 'Diversify by Factor,\nNot Just Sector', body: 'Momentum, value, quality, and growth factors often move independently. Mixing them reduces correlation risk better than sector diversification alone.' },
  { icon: 'flask', title: 'Backtest Before\nYou Invest', body: 'Never deploy a strategy without historical validation. Check CAGR, Sharpe ratio, max drawdown, and win rate across multiple market cycles.' },
  { icon: 'brain', title: 'Your Emotions Are\nNot Your Strategy', body: 'Document your investment thesis BEFORE you trade. When the market dips, reference your written plan — not your feelings.' },
  { icon: 'trending-up', title: 'Sharpe Ratio >\nRaw Returns', body: 'A 15% return with 8% volatility beats a 20% return with 25% volatility. Risk-adjusted returns reveal true strategy quality.' },
  { icon: 'crosshair', title: 'Rebalance Quarterly,\nNot Daily', body: 'Over-trading erodes returns through fees and taxes. Quarterly rebalancing captures most of the benefit at a fraction of the cost.' },
  { icon: 'shield', title: 'Your Data Should\nStay Yours', body: 'Cloud-based portfolio trackers can sell your trading data. Local-first tools keep your strategy and holdings private.' },
  { icon: 'lightbulb', title: 'Factor Scores Beat\nGut Feelings', body: 'Quantitative factor scoring removes bias. Let PE, ROE, momentum, and quality metrics guide your stock selection.' },
  { icon: 'zap', title: 'Small Caps +\nMomentum = Alpha', body: 'Research shows small-cap stocks with strong momentum historically outperform. But always validate with backtesting first.' },
  { icon: 'crosshair', title: 'Position Sizing\nIs Everything', body: 'Even the best stock pick fails if you bet too big. Limit individual positions to 5-8% of your portfolio to manage single-stock risk.' },
  { icon: 'grid', title: 'Check Correlation\nBefore You Buy', body: 'Adding a stock that moves in lockstep with your existing holdings adds no diversification. Aim for low-correlation assets.' },
  { icon: 'trending-up', title: 'Momentum Works,\nBut Rotates', body: 'Factor premiums cycle in and out. Momentum may lag for a year then surge. Stay disciplined and avoid chasing last quarter\'s winner.' },
  { icon: 'bookmark', title: 'Tax-Loss Harvesting\nSaves Real Money', body: 'Sell losing positions to offset gains and reduce your tax bill. Reinvest in similar (not identical) assets to maintain exposure.' },
  { icon: 'bar-chart', title: 'Dollar-Cost Average\nInto Volatility', body: 'Buying a fixed amount on a regular schedule turns market dips into opportunities. Consistency beats timing.' },
  { icon: 'flask', title: 'Mean Reversion\nIs a Force', body: 'Extreme valuations tend to snap back. Stocks trading far above or below their historical averages often revert — plan entries and exits accordingly.' },
  { icon: 'shield', title: 'Never Skip\nMax Drawdown', body: 'A strategy with great returns but a 60% drawdown will test your resolve. Know the worst-case scenario before you commit capital.' },
  { icon: 'brain', title: 'Anchoring Bias\nDistorts Decisions', body: 'Don\'t fixate on the price you paid. Evaluate every holding based on its current fundamentals and forward outlook, not your cost basis.' },
  { icon: 'palette', title: 'Sector Rotation\nFollows Cycles', body: 'Defensives outperform in recessions, cyclicals in expansions. Aligning sector weights with the economic cycle can add meaningful alpha.' },
  { icon: 'book', title: 'Earnings Quality\nOver Quantity', body: 'High revenue growth means nothing if cash flow is negative. Focus on companies with strong free cash flow and low accruals.' },
  { icon: 'lightbulb', title: 'Free Cash Flow\nIs King', body: 'FCF yield tells you what a business actually generates after reinvestment. It is harder to manipulate than earnings per share.' },
  { icon: 'tool', title: 'Dividend Growth\nBeats High Yield', body: 'A 2% yield growing at 12% per year beats a stagnant 5% yield within a decade. Compounding dividend growth builds lasting wealth.' },
  { icon: 'cpu', title: 'Automate Your\nRebalancing Rules', body: 'Set threshold-based rebalancing triggers instead of relying on memory. Systematic rules remove procrastination and emotional hesitation.' },
  { icon: 'zap', title: 'Avoid Recency Bias\nIn Strategy Design', body: 'Backtests that only cover bull markets will mislead you. Always include at least two bear markets in your testing window.' },
];

export const FeedTipCard: React.FC<{ seed?: number }> = ({ seed = 42 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const tip = rng.pick(TIPS);
  const accentColors = [colors.primary, colors.accent, colors.cyan, colors.blue, colors.amber];
  const accent = rng.pick(accentColors);

  return (
    <VideoSeedContext.Provider value={rng}>
      <FeedFrame>
        <Watermark />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
          {/* Icon */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: radius.full,
                background: `${accent}15`,
                border: `2px solid ${accent}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SvgIcon name={tip.icon} size={44} color={accent} />
            </div>
          </div>

          {/* Title */}
          <GlowText
            text={tip.title}
            fontSize={52}
            delay={10}
            style={{ textAlign: 'center', lineHeight: 1.2 }}
          />

          {/* Divider */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 80,
                height: 3,
                borderRadius: 2,
                background: accent,
                opacity: 0.8,
              }}
            />
          </div>

          {/* Body */}
          <GlowText
            text={tip.body}
            fontSize={26}
            color={colors.textMuted}
            delay={25}
            style={{ textAlign: 'center', lineHeight: 1.6, padding: '0 20px' }}
          />
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <GlowText
            text="Save this for later"
            fontSize={18}
            color={colors.textDim}
            delay={40}
            style={{ textAlign: 'center' }}
          />
        </div>
      </FeedFrame>
    </VideoSeedContext.Provider>
  );
};

// ─── Feed Post Type 2: Portfolio Metrics ──────────────────

export const FeedMetricsCard: React.FC<{ seed?: number }> = ({ seed = 42 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const portfolio = generatePortfolioData(rng);
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const base = 10000;
    const trend = i * 200 + rng.vary(100, 0.5);
    return base + trend + Math.sin(i / 3) * 500;
  });

  return (
    <VideoSeedContext.Provider value={rng}>
      <FeedFrame>
        <Watermark />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
          <GlowText
            text="Portfolio Performance"
            fontSize={42}
            delay={5}
            style={{ textAlign: 'center' }}
          />
          <GlowText
            text="Vibe Strategy — Last 12 Months"
            fontSize={22}
            color={colors.textMuted}
            delay={15}
            style={{ textAlign: 'center' }}
          />

          {/* Chart */}
          <GlassCard delay={20} style={{ marginTop: 20 }}>
            <AnimatedChart
              data={chartData}
              width={860}
              height={280}
              delay={30}
              strokeColor={colors.primary}
            />
          </GlassCard>

          {/* Metrics Row */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
            <GlassCard delay={40} padding={20} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 8 }}>
                Total Return
              </div>
              <AnimatedNumber
                value={portfolio.totalReturn}
                suffix="%"
                decimals={1}
                delay={50}
                fontSize={32}
                color={colors.primary}
              />
            </GlassCard>
            <GlassCard delay={48} padding={20} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 8 }}>
                Sharpe Ratio
              </div>
              <AnimatedNumber
                value={portfolio.sharpeRatio}
                decimals={2}
                delay={58}
                fontSize={32}
                color={colors.accent}
              />
            </GlassCard>
            <GlassCard delay={56} padding={20} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 8 }}>
                Portfolio
              </div>
              <AnimatedNumber
                value={portfolio.totalValue}
                prefix="$"
                decimals={0}
                delay={66}
                fontSize={32}
                color={colors.cyan}
              />
            </GlassCard>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <GlowText
            text="Built with FlowFolio — Privacy-First Investing"
            fontSize={16}
            color={colors.textDim}
            delay={60}
            style={{ textAlign: 'center' }}
          />
        </div>
      </FeedFrame>
    </VideoSeedContext.Provider>
  );
};

// ─── Feed Post Type 3: Backtest Results Card ──────────────

export const FeedBacktestCard: React.FC<{ seed?: number }> = ({ seed = 42 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const bt = generateBacktestData(rng);

  const strategies = ['Momentum + Quality', 'Value + Growth', 'All-Factor Blend', 'High Conviction', 'Defensive Yield', 'Small-Cap Momentum', 'Quality + Low Vol', 'Dividend Compounder', 'Mean Reversion Value', 'Growth at a Price', 'Sector Rotator', 'Multi-Factor Equal'];
  const strategyName = rng.pick(strategies);

  return (
    <VideoSeedContext.Provider value={rng}>
      <FeedFrame>
        <Watermark />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <GlowText
            text="Backtest Results"
            fontSize={40}
            delay={5}
            style={{ textAlign: 'center' }}
          />
          <GlowText
            text={`"${strategyName}" — 2005 to 2025`}
            fontSize={22}
            color={colors.accent}
            delay={12}
            style={{ textAlign: 'center' }}
          />

          {/* Results Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <GlassCard delay={20} padding={24} glowColor={colors.primary}>
              <div style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 12 }}>CAGR</div>
              <AnimatedNumber value={bt.cagr} suffix="%" decimals={1} delay={30} fontSize={44} color={colors.primary} />
            </GlassCard>
            <GlassCard delay={28} padding={24} glowColor={colors.accent}>
              <div style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 12 }}>Sharpe</div>
              <AnimatedNumber value={bt.sharpe} decimals={2} delay={38} fontSize={44} color={colors.accent} />
            </GlassCard>
            <GlassCard delay={36} padding={24} glowColor={colors.rose}>
              <div style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 12 }}>Max Drawdown</div>
              <AnimatedNumber value={bt.maxDrawdown} suffix="%" decimals={1} delay={46} fontSize={44} color={colors.rose} />
            </GlassCard>
            <GlassCard delay={44} padding={24} glowColor={colors.cyan}>
              <div style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', marginBottom: 12 }}>Win Rate</div>
              <AnimatedNumber value={bt.winRate} suffix="%" decimals={0} delay={54} fontSize={44} color={colors.cyan} />
            </GlassCard>
          </div>

          {/* vs Benchmark */}
          <GlassCard delay={52} style={{ textAlign: 'center', marginTop: 8 }}>
            <div style={{ fontSize: 14, color: colors.textMuted, fontFamily: fonts.sans, marginBottom: 8 }}>
              vs. S&P 500 Buy & Hold
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, color: colors.primary, fontWeight: 700, fontFamily: fonts.sans }}>
                {bt.cagr > 10 ? 'Outperformed' : 'Comparable'}
              </span>
            </div>
          </GlassCard>
        </div>

        <div style={{ textAlign: 'center' }}>
          <GlowText
            text="Test YOUR strategy → FlowFolio"
            fontSize={16}
            color={colors.textDim}
            delay={60}
            style={{ textAlign: 'center' }}
          />
        </div>
      </FeedFrame>
    </VideoSeedContext.Provider>
  );
};

// ─── Feed Post Type 4: Feature Spotlight ──────────────────

const FEATURES = [
  { icon: 'palette', name: 'Vibe Studio', desc: 'Design investment strategies with factor sliders — momentum, value, growth, quality. Your vibe, quantified.', accent: colors.primary },
  { icon: 'trending-up', name: 'Backtesting', desc: 'Run your strategy against 20 years of market data. See CAGR, Sharpe, drawdown — before risking a dollar.', accent: colors.accent },
  { icon: 'cpu', name: 'AI Portfolio Agent', desc: 'Ask your portfolio anything. Get insights on diversification, risk, and optimization — all processed locally.', accent: colors.cyan },
  { icon: 'bar-chart', name: 'Quant Metrics', desc: '30+ quantitative metrics per stock. PE, PB, ROE, momentum — professional-grade analysis, zero subscription.', accent: colors.blue },
  { icon: 'tool', name: 'Portfolio Optimizer', desc: 'Maximize Sharpe ratio with constraint-based optimization. Get buy/sell suggestions to improve your portfolio.', accent: colors.amber },
  { icon: 'book', name: 'Investment Journal', desc: 'Track your investment decisions, emotions, and lessons. Build a searchable knowledge base of your trading history.', accent: colors.rose },
  { icon: 'grid', name: 'Multi-Source Data', desc: 'Aggregate prices from 8 market data providers with automatic failover. Never miss a quote because one API goes down.', accent: colors.primary },
  { icon: 'shield', name: 'Privacy Vault', desc: 'All data stored locally in encrypted SQLite. Zero telemetry, zero cloud sync. Your portfolio never leaves your machine.', accent: colors.accent },
  { icon: 'chart-bar', name: 'Yearly Review', desc: 'Generate a comprehensive annual review of your portfolio. Performance attribution, best and worst picks, lessons learned.', accent: colors.cyan },
  { icon: 'crosshair', name: 'Factor Rankings', desc: 'Rank your entire watchlist by any factor — momentum score, value composite, quality grade. See who rises to the top.', accent: colors.amber },
];

export const FeedFeatureCard: React.FC<{ seed?: number }> = ({ seed = 42 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const feature = rng.pick(FEATURES);

  return (
    <VideoSeedContext.Provider value={rng}>
      <FeedFrame>
        <Watermark />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
          {/* Icon circle */}
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: radius.full,
              background: `${feature.accent}15`,
              border: `2px solid ${feature.accent}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgIcon name={feature.icon} size={56} color={feature.accent} />
          </div>

          <GlowText
            text={feature.name}
            fontSize={56}
            delay={10}
            style={{ textAlign: 'center', background: `linear-gradient(135deg, ${feature.accent}, ${colors.text})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          />

          <GlassCard delay={20} style={{ maxWidth: 800 }}>
            <GlowText
              text={feature.desc}
              fontSize={28}
              color={colors.textSoft}
              delay={30}
              style={{ textAlign: 'center', lineHeight: 1.7 }}
            />
          </GlassCard>

          {/* Tags */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Offline', 'Free', 'Rust-Powered'].map((tag) => (
              <div
                key={tag}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${colors.glassBorder}`,
                  borderRadius: radius.full,
                  padding: '8px 20px',
                  fontSize: 16,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <GlowText
            text="Download FlowFolio — link in bio"
            fontSize={16}
            color={colors.textDim}
            delay={45}
            style={{ textAlign: 'center' }}
          />
        </div>
      </FeedFrame>
    </VideoSeedContext.Provider>
  );
};

// ─── Feed Post Type 5: Quote / Mindset Card ──────────────

const QUOTES = [
  { quote: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
  { quote: 'In investing, what is comfortable is rarely profitable.', author: 'Robert Arnott' },
  { quote: 'The individual investor should act consistently as an investor and not as a speculator.', author: 'Ben Graham' },
  { quote: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
  { quote: 'The four most dangerous words in investing are: "This time it\'s different."', author: 'John Templeton' },
  { quote: 'Wide diversification is only required when investors do not understand what they are doing.', author: 'Warren Buffett' },
  { quote: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { quote: 'Buy not on optimism, but on arithmetic.', author: 'Ben Graham' },
  { quote: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
  { quote: 'It\'s far better to buy a wonderful company at a fair price than a fair company at a wonderful price.', author: 'Charlie Munger' },
  { quote: 'The most important thing is to be aware of how little you know.', author: 'Howard Marks' },
  { quote: 'He who lives by the crystal ball will eat shattered glass.', author: 'Ray Dalio' },
  { quote: 'There is nothing new in Wall Street. There can\'t be because speculation is as old as the hills.', author: 'Jesse Livermore' },
  { quote: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.', author: 'Philip Fisher' },
  { quote: 'Don\'t look for the needle in the haystack. Just buy the haystack.', author: 'John Bogle' },
  { quote: 'The trick of successful investors is to sell when they want to, not when they have to.', author: 'Seth Klarman' },
  { quote: 'Investing should be more like watching paint dry or watching grass grow. If you want excitement, take $800 and go to Las Vegas.', author: 'Paul Samuelson' },
  { quote: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { quote: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
  { quote: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
  { quote: 'Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn\'t, pays it.', author: 'Albert Einstein' },
  { quote: 'I will tell you how to become rich. Close the doors. Be fearful when others are greedy. Be greedy when others are fearful.', author: 'Warren Buffett' },
];

export const FeedQuoteCard: React.FC<{ seed?: number }> = ({ seed = 42 }) => {
  const rng = React.useMemo(() => new VideoRNG(seed), [seed]);
  const q = rng.pick(QUOTES);
  const accentColors = [colors.primary, colors.accent, colors.cyan, colors.blue];
  const accent = rng.pick(accentColors);

  return (
    <VideoSeedContext.Provider value={rng}>
      <FeedFrame>
        <Watermark />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
          {/* Quote mark */}
          <div
            style={{
              fontSize: 120,
              color: accent,
              opacity: 0.3,
              fontFamily: 'Georgia, serif',
              lineHeight: 0.8,
            }}
          >
            "
          </div>

          <GlowText
            text={q.quote}
            fontSize={36}
            delay={10}
            style={{
              textAlign: 'center',
              lineHeight: 1.6,
              maxWidth: 800,
              fontStyle: 'italic',
            }}
          />

          <div
            style={{
              width: 60,
              height: 3,
              background: accent,
              borderRadius: 2,
            }}
          />

          <GlowText
            text={`— ${q.author}`}
            fontSize={24}
            color={accent}
            delay={30}
            style={{ textAlign: 'center' }}
          />
        </div>

        <div style={{ textAlign: 'center' }}>
          <GlowText
            text="Follow @flowfolio for more investing insights"
            fontSize={16}
            color={colors.textDim}
            delay={45}
            style={{ textAlign: 'center' }}
          />
        </div>
      </FeedFrame>
    </VideoSeedContext.Provider>
  );
};
