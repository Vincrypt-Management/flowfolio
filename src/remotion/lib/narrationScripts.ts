/**
 * Narration scripts for all 3 compositions.
 * Each segment has text, startFrame, and durationInFrames.
 * Multiple variants per segment for seed-driven uniqueness.
 */
import type { VideoRNG } from './uniqueness';

export interface NarrationSegment {
  id: string;
  text: string;
  /** Frame where this segment begins (at 30fps) */
  startFrame: number;
  /** Duration this segment spans */
  durationInFrames: number;
}

// ─── SHOWCASE (~88s, 2640 frames @ 30fps) ───────────────────────

const showcaseVariants: Record<string, string[]> = {
  hook: [
    'Tired of guessing where to invest? What if your portfolio could think for itself?',
    'Most investors fly blind. Spreadsheets, gut feelings, scattered data. There has to be a better way.',
    'What if you could invest with the precision of a quant fund — without the six-figure salary?',
  ],
  logoReveal: [
    'Introducing FlowFolio. Privacy-first investment intelligence, built for the modern investor.',
    'Meet FlowFolio. Your data stays yours. Your strategy stays sharp.',
    'This is FlowFolio. Zero cloud. Zero telemetry. One hundred percent yours.',
  ],
  privacy: [
    'Your financial data never leaves your machine. No cloud. No tracking. No compromises.',
    'Built on a simple principle: your money, your data, your device. Period.',
    'Every byte of your portfolio stays local. Encrypted, private, untouchable.',
  ],
  vibeStudio: [
    'Start in Vibe Studio. Define your investment personality with weighted factors — growth, value, momentum, quality. Your strategy, your rules.',
    'Vibe Studio lets you craft custom strategies by dialing in the factors that matter to you. No two portfolios are alike.',
    'Drag, weight, and refine your investment factors in Vibe Studio. Your strategy becomes a living, breathing algorithm.',
  ],
  portfolio: [
    'Track your entire portfolio in real time. Every holding, every gain, every allocation — crystal clear.',
    'Your portfolio dashboard gives you institutional-grade visibility. Watch your strategy come to life.',
    'See your money at work. Live prices, allocation breakdowns, and performance metrics, all in one view.',
  ],
  backtest: [
    'Don\'t just hope your strategy works. Prove it. Backtest against years of historical data.',
    'Run your strategy through the gauntlet of history. See exactly how it would have performed.',
    'Backtesting turns hunches into evidence. Simulate your approach across bull markets, bear markets, and everything between.',
  ],
  quant: [
    'Dive deep with quantitative analysis. Sharpe ratios, drawdowns, volatility metrics — the numbers that matter.',
    'Professional-grade quant metrics at your fingertips. Understand your risk before it becomes real.',
    'From alpha to beta to maximum drawdown — every metric a professional analyst would want.',
  ],
  optimizer: [
    'Let the optimizer fine-tune your allocations. Maximum return. Minimum risk. Mathematical precision.',
    'Portfolio optimization finds the sweet spot between growth and safety. Powered by real math, not guesswork.',
    'The optimizer rebalances your portfolio for peak efficiency. Better returns, less risk, backed by data.',
  ],
  journal: [
    'Document every decision in your investment journal. Track your reasoning, learn from your moves.',
    'Your journal captures the why behind every trade. Build a library of investment wisdom.',
    'The smartest investors reflect on their decisions. Your journal makes that effortless.',
  ],
  aiChat: [
    'Need a second opinion? Ask the AI assistant. It analyzes your portfolio and speaks your language.',
    'Chat with your portfolio. The AI agent understands your holdings and helps you think clearly.',
    'An AI copilot for your investments. Ask anything about your portfolio and get intelligent answers.',
  ],
  platforms: [
    'Available on macOS, Windows, and Linux. One app, every platform.',
    'Runs natively on every desktop. Mac, Windows, Linux — your choice.',
    'Cross-platform by design. Install once, invest everywhere.',
  ],
  closing: [
    'FlowFolio. Invest with clarity. Invest with confidence.',
    'FlowFolio. Your portfolio. Your rules. Your edge.',
    'FlowFolio. Privacy-first investing, powered by intelligence.',
  ],
};

export function buildShowcaseNarration(rng: VideoRNG): NarrationSegment[] {
  const p = (key: string) => rng.pick(showcaseVariants[key]);
  return [
    { id: 'hook',       text: p('hook'),       startFrame: 0,    durationInFrames: 140 },
    { id: 'logo',       text: p('logoReveal'), startFrame: 140,  durationInFrames: 115 },
    { id: 'privacy',    text: p('privacy'),    startFrame: 255,  durationInFrames: 120 },
    { id: 'vibe',       text: p('vibeStudio'), startFrame: 375,  durationInFrames: 290 },
    { id: 'portfolio',  text: p('portfolio'),  startFrame: 665,  durationInFrames: 270 },
    { id: 'backtest',   text: p('backtest'),   startFrame: 935,  durationInFrames: 280 },
    { id: 'quant',      text: p('quant'),      startFrame: 1215, durationInFrames: 240 },
    { id: 'optimizer',  text: p('optimizer'),  startFrame: 1455, durationInFrames: 250 },  // covers fundamentals + optimizer
    { id: 'journal',    text: p('journal'),    startFrame: 1915, durationInFrames: 250 },
    { id: 'ai-chat',    text: p('aiChat'),     startFrame: 2165, durationInFrames: 250 },
    { id: 'platforms',  text: p('platforms'),  startFrame: 2415, durationInFrames: 120 },
    { id: 'closing',    text: p('closing'),    startFrame: 2535, durationInFrames: 100 },
  ];
}

// ─── INTRO (~17.7s, 530 frames @ 30fps) ─────────────────────────

const introVariants: Record<string, string[]> = {
  hook: [
    'Your investments deserve better than spreadsheets.',
    'What if investing felt effortless and intelligent?',
    'Stop guessing. Start investing with precision.',
  ],
  logo: [
    'FlowFolio. Smart investing, completely private.',
    'Meet FlowFolio. Your edge in the market.',
    'Introducing FlowFolio. Intelligence meets privacy.',
  ],
  privacy: [
    'All your data stays on your device. Always.',
    'Zero cloud. Zero tracking. Total control.',
    'Privacy-first. Your portfolio, your machine.',
  ],
  platforms: [
    'Available on Mac, Windows, and Linux.',
    'One app. Every platform. Seamless.',
    'Cross-platform investing done right.',
  ],
  closing: [
    'FlowFolio. Invest smarter.',
    'FlowFolio. Your portfolio, your rules.',
    'FlowFolio. Start today.',
  ],
};

export function buildIntroNarration(rng: VideoRNG): NarrationSegment[] {
  const p = (key: string) => rng.pick(introVariants[key]);
  return [
    { id: 'hook',      text: p('hook'),      startFrame: 0,   durationInFrames: 80 },
    { id: 'logo',      text: p('logo'),      startFrame: 80,  durationInFrames: 115 },
    { id: 'privacy',   text: p('privacy'),   startFrame: 195, durationInFrames: 120 },
    { id: 'platforms', text: p('platforms'), startFrame: 315, durationInFrames: 120 },
    { id: 'closing',   text: p('closing'),   startFrame: 435, durationInFrames: 90 },
  ];
}

// ─── IG REEL (~15s, 450 frames @ 30fps) ─────────────────────────

const igVariants: Record<string, string[]> = {
  hook: [
    'Investing without the noise.',
    'Your portfolio. Your privacy. Your rules.',
    'Smart investing starts here.',
  ],
  logo: [
    'FlowFolio.',
    'This is FlowFolio.',
    'Meet FlowFolio.',
  ],
  features: [
    'Vibe strategies. Live tracking. AI insights. All offline.',
    'Custom strategies. Real-time data. Complete privacy.',
    'Build, test, optimize — all on your device.',
  ],
  cta: [
    'Download now. Free and open source.',
    'Get started today. It\'s free.',
    'Try FlowFolio. Your portfolio will thank you.',
  ],
};

export function buildIGNarration(rng: VideoRNG): NarrationSegment[] {
  const p = (key: string) => rng.pick(igVariants[key]);
  return [
    { id: 'hook',     text: p('hook'),     startFrame: 0,   durationInFrames: 115 },
    { id: 'logo',     text: p('logo'),     startFrame: 115, durationInFrames: 115 },
    { id: 'features', text: p('features'), startFrame: 230, durationInFrames: 155 },
    { id: 'cta',      text: p('cta'),      startFrame: 385, durationInFrames: 65 },
  ];
}
