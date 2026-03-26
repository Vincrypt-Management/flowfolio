#!/usr/bin/env node
/**
 * Generate voiceover audio for Backtest Educational Reel (032).
 * Uses Microsoft Edge Neural TTS (en-US-AndrewNeural).
 *
 * Usage: node src/remotion/scripts/generate-vo-backtest032.mjs
 *
 * NOTE: Do NOT model this on generate-vo-security031.mjs — that script
 * includes legacy startFrame/durationInFrames fields that are intentionally
 * absent here. Timing is measured at render time via calculateMetadata.
 */

import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const EDGE_TTS = '/Users/evintleovonzko/Library/Python/3.9/bin/edge-tts';
const VOICE = 'en-US-AndrewNeural';
const RATE = '-5%';
const OUT_DIR = join(process.cwd(), 'public', 'audio', 'vo', 'backtest032');

const segments = [
  {
    id: 'hook',
    text: 'Most investors test strategies the expensive way — by losing real money on them.',
  },
  {
    id: 'problem',
    text: "A strategy that worked for three months might have a forty percent drawdown hiding in 2020. You won't find that out by watching. You find it by backtesting.",
  },
  {
    id: 'howto',
    text: 'In FlowFolio, a backtest takes four steps. Pick your symbols, set your date range, choose your vibe strategy, and run. The engine pulls historical data from eight providers and simulates every trade.',
  },
  {
    id: 'results',
    text: 'The results give you the five numbers that matter — Sharpe ratio, max drawdown, Sortino, beta, and profit factor. You saw these in the last post. Now you know where they come from.',
  },
  {
    id: 'verdict',
    text: "A Sharpe above one, drawdown under twenty percent, profit factor above one-point-five — that's a strategy worth risking real money on. Anything else goes back to the drawing board.",
  },
  {
    id: 'cta',
    text: 'FlowFolio. Backtest before you invest. One hundred percent offline. Free.',
  },
];

console.log(`\nFlowFolio Backtest Educational Voiceover Generator`);
console.log(`Voice: ${VOICE} | Rate: ${RATE}\n`);

mkdirSync(OUT_DIR, { recursive: true });

let generated = 0;

for (const seg of segments) {
  const mp3Path = join(OUT_DIR, `${seg.id}.mp3`);
  const wavPath = join(OUT_DIR, `${seg.id}.wav`);
  process.stdout.write(`  ${seg.id}: "${seg.text.substring(0, 50)}..." `);

  const tts = spawnSync(EDGE_TTS, [
    '--voice', VOICE,
    `--rate=${RATE}`,
    '--text', seg.text,
    '--write-media', mp3Path,
  ], { stdio: 'pipe' });

  if (tts.status !== 0) {
    console.log(`FAILED (tts): ${tts.stderr?.toString()}`);
    continue;
  }

  const conv = spawnSync('afconvert', [
    '-f', 'WAVE', '-d', 'LEI16@48000', mp3Path, wavPath,
  ], { stdio: 'pipe' });

  if (conv.status !== 0) {
    console.log(`FAILED (afconvert): ${conv.stderr?.toString()}`);
    continue;
  }

  spawnSync('rm', ['-f', mp3Path], { stdio: 'pipe' });
  console.log('done');
  generated++;
}

console.log(`\nGenerated ${generated}/${segments.length} audio files`);
console.log(`Output: ${OUT_DIR}\n`);
