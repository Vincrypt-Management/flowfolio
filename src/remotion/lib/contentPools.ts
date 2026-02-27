/**
 * Content pools for video uniqueness.
 * Each pool contains multiple variants; the seed picks which to use.
 */
import { colors } from '../styles';
import type { VideoRNG } from './uniqueness';

// ─── Hook Lines ─────────────────────────────────────────────────

export interface HookVariant {
  line1: string;
  line2: string;
}

export const hookVariants: readonly HookVariant[] = [
  { line1: 'You have a strategy.', line2: "Your tools don't." },
  { line1: 'You track everything.', line2: 'Except what matters.' },
  { line1: "You've done the research.", line2: "Your tools haven't." },
  { line1: 'Your edge is real.', line2: 'Your toolkit is holding you back.' },
  { line1: 'You think in factors.', line2: 'Your spreadsheet thinks in cells.' },
  { line1: 'Markets move fast.', line2: 'Your workflow moves slower.' },
  { line1: 'You see the signal.', line2: 'Your tools see noise.' },
  { line1: 'You know what to buy.', line2: 'But not when or how much.' },
  { line1: 'Your thesis is solid.', line2: 'Your process is manual.' },
  { line1: 'Data is everywhere.', line2: 'Insight is nowhere.' },
  { line1: 'You invest with conviction.', line2: 'You manage with chaos.' },
  { line1: 'Your ideas outpace', line2: 'your infrastructure.' },
];

// ─── Pain Points ────────────────────────────────────────────────

export interface PainPoint {
  label: string;
  desc: string;
  colorKey: 'rose' | 'amber' | 'accent';
}

const painPointPool: readonly PainPoint[] = [
  { label: 'Scattered spreadsheets', desc: 'Data in ten places, insights in none', colorKey: 'rose' },
  { label: 'Cloud privacy fears', desc: "Your portfolio data on someone else's server", colorKey: 'amber' },
  { label: 'Guessing without data', desc: 'Gut feelings where analysis should be', colorKey: 'accent' },
  { label: 'Manual rebalancing', desc: 'Hours spent on what should take seconds', colorKey: 'rose' },
  { label: 'No backtesting', desc: "Can't prove your strategy works before risking capital", colorKey: 'amber' },
  { label: 'Fragmented tools', desc: 'Five apps to do one job', colorKey: 'accent' },
  { label: 'Subscription fatigue', desc: 'Paying monthly for features you barely use', colorKey: 'rose' },
  { label: 'Stale data', desc: 'Decisions based on yesterday\'s numbers', colorKey: 'amber' },
];

export function pickPainPoints(rng: VideoRNG, count = 3): PainPoint[] {
  return rng.pickN(painPointPool, count);
}

// ─── Story Beats ────────────────────────────────────────────────

export interface StoryBeatVariant {
  line: string;
  accentColor: string;
}

interface StoryBeatPool {
  sceneKey: string;
  variants: readonly StoryBeatVariant[];
}

export const storyBeatPools: readonly StoryBeatPool[] = [
  {
    sceneKey: 'vibe-studio',
    variants: [
      { line: 'Start with what matters to you.', accentColor: colors.primary },
      { line: 'Define your investing philosophy.', accentColor: colors.primary },
      { line: 'Turn your thesis into a strategy.', accentColor: colors.primary },
      { line: 'Your convictions, quantified.', accentColor: colors.primaryBright },
    ],
  },
  {
    sceneKey: 'portfolio',
    variants: [
      { line: 'Watch your strategy come alive.', accentColor: colors.accent },
      { line: 'From plan to portfolio in seconds.', accentColor: colors.accent },
      { line: 'See the bigger picture.', accentColor: colors.accentBright },
      { line: 'Your portfolio, at a glance.', accentColor: colors.accent },
    ],
  },
  {
    sceneKey: 'backtest',
    variants: [
      { line: "Don't guess. Prove it.", accentColor: colors.cyan },
      { line: 'Test before you invest.', accentColor: colors.cyan },
      { line: 'History is your laboratory.', accentColor: colors.blue },
      { line: 'Would this have worked? Find out.', accentColor: colors.cyan },
    ],
  },
  {
    sceneKey: 'quant',
    variants: [
      { line: 'Know every number.', accentColor: colors.blue },
      { line: 'Quantify your conviction.', accentColor: colors.blue },
      { line: 'Numbers don\'t lie.', accentColor: colors.blueLight },
      { line: 'Deep metrics, clear picture.', accentColor: colors.blue },
    ],
  },
  {
    sceneKey: 'optimizer',
    variants: [
      { line: 'Let AI sharpen your edge.', accentColor: colors.amber },
      { line: 'Optimize without overthinking.', accentColor: colors.amber },
      { line: 'Smart rebalancing, instantly.', accentColor: colors.amber },
      { line: 'Fine-tune with intelligence.', accentColor: colors.amber },
    ],
  },
  {
    sceneKey: 'journal',
    variants: [
      { line: 'Remember every decision.', accentColor: colors.rose },
      { line: 'Your investing diary.', accentColor: colors.rose },
      { line: 'Track why, not just what.', accentColor: colors.rose },
      { line: 'Learn from every trade.', accentColor: colors.rose },
    ],
  },
  {
    sceneKey: 'ai-chat',
    variants: [
      { line: 'Ask anything.', accentColor: colors.accent },
      { line: 'Your portfolio analyst, on demand.', accentColor: colors.accent },
      { line: 'Conversations that compound.', accentColor: colors.primaryBright },
      { line: 'AI that knows your portfolio.', accentColor: colors.accent },
    ],
  },
];

export function pickStoryBeat(rng: VideoRNG, sceneKey: string): StoryBeatVariant {
  const pool = storyBeatPools.find((p) => p.sceneKey === sceneKey);
  if (!pool) return { line: sceneKey, accentColor: colors.primary };
  return rng.pick(pool.variants);
}

// ─── Demo Data Variants ─────────────────────────────────────────

export interface StockSymbol {
  symbol: string;
  name: string;
}

const stockPool: readonly StockSymbol[] = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'PG', name: 'Procter & Gamble' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'HD', name: 'Home Depot' },
  { symbol: 'DIS', name: 'Disney' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'INTC', name: 'Intel' },
];

export function pickStocks(rng: VideoRNG, count = 5): StockSymbol[] {
  return rng.pickN(stockPool, count);
}

/** Generate varied chart data points */
export function generateChartData(rng: VideoRNG, points = 20, base = 100): number[] {
  const data: number[] = [base];
  for (let i = 1; i < points; i++) {
    const change = rng.offset(0, 5);
    const trend = rng.next() > 0.4 ? 1.002 : 0.998;
    data.push(Math.max(50, data[i - 1] * trend + change));
  }
  return data;
}

/** Generate a metric value with controlled variation */
export function varyMetric(rng: VideoRNG, base: number, pctRange = 0.15): number {
  return Math.round(rng.vary(base, pctRange) * 100) / 100;
}

// ─── Tagline Variants ───────────────────────────────────────────

export const taglineVariants: readonly string[] = [
  'Quantitative investing, beautifully simple',
  'Your strategy. Your data. Your edge.',
  'Where conviction meets computation',
  'Investing intelligence, offline',
  'The desktop quant lab',
  'Private. Powerful. Precise.',
  'Your portfolio, your rules',
  'Factor investing without the friction',
  'Offline-first. Insight-always.',
  'From thesis to portfolio in minutes',
];

// ─── Animation Style Variants ───────────────────────────────────

export type AnimationStyle = 'fade-rise' | 'scale-in' | 'word-reveal' | 'typewriter';

export const animationStyles: readonly AnimationStyle[] = ['fade-rise', 'scale-in', 'word-reveal', 'typewriter'];

export function pickAnimationStyle(rng: VideoRNG): AnimationStyle {
  return rng.pick(animationStyles);
}

// ─── IG Feature Story Variants ──────────────────────────────────

export interface IGFeatureVariant {
  beat: string;
  label: string;
  colorKey: 'primary' | 'cyan' | 'amber';
}

const igFeaturePool: readonly IGFeatureVariant[] = [
  { beat: 'Define your edge', label: 'Vibe Studio', colorKey: 'primary' },
  { beat: 'Prove it works', label: 'Backtest Engine', colorKey: 'cyan' },
  { beat: 'Let AI help', label: 'Portfolio Agent', colorKey: 'amber' },
  { beat: 'Know every number', label: 'Quant Analysis', colorKey: 'primary' },
  { beat: 'Track your journey', label: 'Journal', colorKey: 'cyan' },
  { beat: 'See the big picture', label: 'Portfolio View', colorKey: 'amber' },
];

export function pickIGFeatures(rng: VideoRNG, count = 3): IGFeatureVariant[] {
  return rng.pickN(igFeaturePool, count);
}

// ─── Background Variation ───────────────────────────────────────

export interface BGVariation {
  orb1Hue: string;
  orb2Hue: string;
  orbSpeed1: number;
  orbSpeed2: number;
}

const orbColors = [
  'rgba(0, 229, 153, 0.06)',  // green
  'rgba(129, 140, 248, 0.04)', // indigo
  'rgba(56, 189, 248, 0.05)',  // blue
  'rgba(251, 191, 36, 0.03)',  // amber
  'rgba(251, 113, 133, 0.03)', // rose
];

export function pickBGVariation(rng: VideoRNG): BGVariation {
  return {
    orb1Hue: rng.pick(orbColors),
    orb2Hue: rng.pick(orbColors),
    orbSpeed1: rng.vary(700, 0.2),
    orbSpeed2: rng.vary(900, 0.2),
  };
}
