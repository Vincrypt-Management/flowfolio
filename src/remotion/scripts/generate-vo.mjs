#!/usr/bin/env node
/**
 * Generate voiceover audio files using macOS TTS (`say` command).
 * Outputs .wav files to public/audio/vo/{compositionId}/{segmentId}.wav
 *
 * Usage:
 *   node src/remotion/scripts/generate-vo.mjs [--seed=N] [--voice=Name]
 *
 * Requires macOS with `say` and `afconvert` commands.
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Configuration ──────────────────────────────────────────────
const VOICE = process.argv.find(a => a.startsWith('--voice='))?.split('=')[1] ?? 'Samantha';
const SEED = parseInt(process.argv.find(a => a.startsWith('--seed='))?.split('=')[1] ?? '12345', 10);
const RATE = 175; // words per minute (natural pace)
const OUT_DIR = join(process.cwd(), 'public', 'audio', 'vo');

// ─── Simple PRNG (same as uniqueness.ts mulberry32) ─────────────
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Narration content (inline to avoid TS import issues) ────────

const showcaseVariants = {
  hook: [
    'Tired of guessing where to invest? What if your portfolio could think for itself?',
    'Most investors fly blind. Spreadsheets, gut feelings, scattered data. There has to be a better way.',
    'What if you could invest with the precision of a quant fund, without the six-figure salary?',
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
    'Start in Vibe Studio. Define your investment personality with weighted factors. Growth, value, momentum, quality. Your strategy, your rules.',
    'Vibe Studio lets you craft custom strategies by dialing in the factors that matter to you. No two portfolios are alike.',
    'Drag, weight, and refine your investment factors in Vibe Studio. Your strategy becomes a living, breathing algorithm.',
  ],
  portfolio: [
    'Track your entire portfolio in real time. Every holding, every gain, every allocation. Crystal clear.',
    'Your portfolio dashboard gives you institutional-grade visibility. Watch your strategy come to life.',
    'See your money at work. Live prices, allocation breakdowns, and performance metrics, all in one view.',
  ],
  backtest: [
    "Don't just hope your strategy works. Prove it. Backtest against years of historical data.",
    'Run your strategy through the gauntlet of history. See exactly how it would have performed.',
    'Backtesting turns hunches into evidence. Simulate your approach across bull markets, bear markets, and everything between.',
  ],
  quant: [
    'Dive deep with quantitative analysis. Sharpe ratios, drawdowns, volatility metrics. The numbers that matter.',
    'Professional-grade quant metrics at your fingertips. Understand your risk before it becomes real.',
    'From alpha to beta to maximum drawdown. Every metric a professional analyst would want.',
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
    'Available on mac OS, Windows, and Linux. One app, every platform.',
    'Runs natively on every desktop. Mac, Windows, Linux. Your choice.',
    'Cross-platform by design. Install once, invest everywhere.',
  ],
  closing: [
    'FlowFolio. Invest with clarity. Invest with confidence.',
    'FlowFolio. Your portfolio. Your rules. Your edge.',
    'FlowFolio. Privacy-first investing, powered by intelligence.',
  ],
};

const introVariants = {
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

const igVariants = {
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
    'Build, test, optimize. All on your device.',
  ],
  cta: [
    'Download now. Free and open source.',
    'Get started today. Its free.',
    'Try FlowFolio. Your portfolio will thank you.',
  ],
};

// Segment definitions with frame timing
function buildSegments(variants, layout, rng) {
  return layout.map(({ id, key, startFrame, durationInFrames }) => ({
    id,
    text: pick(variants[key], rng),
    startFrame,
    durationInFrames,
  }));
}

const showcaseLayout = [
  { id: 'hook', key: 'hook', startFrame: 0, durationInFrames: 140 },
  { id: 'logo', key: 'logoReveal', startFrame: 140, durationInFrames: 115 },
  { id: 'privacy', key: 'privacy', startFrame: 255, durationInFrames: 120 },
  { id: 'vibe', key: 'vibeStudio', startFrame: 375, durationInFrames: 290 },
  { id: 'portfolio', key: 'portfolio', startFrame: 665, durationInFrames: 270 },
  { id: 'backtest', key: 'backtest', startFrame: 935, durationInFrames: 280 },
  { id: 'quant', key: 'quant', startFrame: 1215, durationInFrames: 240 },
  { id: 'optimizer', key: 'optimizer', startFrame: 1455, durationInFrames: 250 },
  { id: 'journal', key: 'journal', startFrame: 1915, durationInFrames: 250 },
  { id: 'ai-chat', key: 'aiChat', startFrame: 2165, durationInFrames: 250 },
  { id: 'platforms', key: 'platforms', startFrame: 2415, durationInFrames: 120 },
  { id: 'closing', key: 'closing', startFrame: 2535, durationInFrames: 100 },
];

const introLayout = [
  { id: 'hook', key: 'hook', startFrame: 0, durationInFrames: 80 },
  { id: 'logo', key: 'logo', startFrame: 80, durationInFrames: 115 },
  { id: 'privacy', key: 'privacy', startFrame: 195, durationInFrames: 120 },
  { id: 'platforms', key: 'platforms', startFrame: 315, durationInFrames: 120 },
  { id: 'closing', key: 'closing', startFrame: 435, durationInFrames: 90 },
];

const igLayout = [
  { id: 'hook', key: 'hook', startFrame: 0, durationInFrames: 115 },
  { id: 'logo', key: 'logo', startFrame: 115, durationInFrames: 115 },
  { id: 'features', key: 'features', startFrame: 230, durationInFrames: 155 },
  { id: 'cta', key: 'cta', startFrame: 385, durationInFrames: 65 },
];

// ─── TTS Generation ─────────────────────────────────────────────

function generateAudioFile(text, outputPath, voice, rate) {
  const tempAiff = outputPath.replace('.wav', '.aiff');
  // Escape text for shell
  const escaped = text.replace(/'/g, "'\\''");
  try {
    execSync(`say -v "${voice}" -r ${rate} -o "${tempAiff}" '${escaped}'`, { stdio: 'pipe' });
    execSync(`afconvert -f WAVE -d LEI16 "${tempAiff}" "${outputPath}"`, { stdio: 'pipe' });
    // Clean up temp aiff
    execSync(`rm -f "${tempAiff}"`, { stdio: 'pipe' });
    return true;
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────────

console.log(`\n🎙  FlowFolio Voiceover Generator`);
console.log(`   Voice: ${VOICE} | Rate: ${RATE} wpm | Seed: ${SEED}\n`);

const rng = mulberry32(SEED);

const compositions = [
  { name: 'showcase', segments: buildSegments(showcaseVariants, showcaseLayout, rng) },
  { name: 'intro', segments: buildSegments(introVariants, introLayout, rng) },
  { name: 'ig', segments: buildSegments(igVariants, igLayout, rng) },
];

let totalGenerated = 0;
const manifest = {};

for (const comp of compositions) {
  const dir = join(OUT_DIR, comp.name);
  mkdirSync(dir, { recursive: true });
  console.log(`📁 ${comp.name}/`);
  manifest[comp.name] = [];

  for (const seg of comp.segments) {
    const wavPath = join(dir, `${seg.id}.wav`);
    const relativePath = `audio/vo/${comp.name}/${seg.id}.wav`;
    process.stdout.write(`   🔊 ${seg.id}: "${seg.text.substring(0, 60)}..." `);

    if (generateAudioFile(seg.text, wavPath, VOICE, RATE)) {
      console.log('✓');
      manifest[comp.name].push({
        id: seg.id,
        text: seg.text,
        file: relativePath,
        startFrame: seg.startFrame,
        durationInFrames: seg.durationInFrames,
      });
      totalGenerated++;
    }
  }
  console.log('');
}

// Write manifest for Remotion to consume
const manifestPath = join(OUT_DIR, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Generated ${totalGenerated} audio files`);
console.log(`📄 Manifest: ${manifestPath}\n`);
