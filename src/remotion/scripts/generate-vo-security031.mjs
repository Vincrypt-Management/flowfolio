#!/usr/bin/env node
/**
 * Generate voiceover audio for v0.3.1 Security Educational Reel.
 * Uses Microsoft Edge Neural TTS (en-US-AndrewNeural) for high-quality narration.
 * All inputs are hardcoded — no user-supplied data.
 *
 * Usage: node src/remotion/scripts/generate-vo-security031.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const EDGE_TTS = '/Users/evintleovonzko/Library/Python/3.9/bin/edge-tts';
const VOICE = 'en-US-AndrewNeural';
const RATE = '-5%';
const OUT_DIR = join(process.cwd(), 'public', 'audio', 'vo', 'security031');

const segments = [
  {
    id: 'hook',
    text: 'Your portfolio tracker might be selling your data. Most free investment tools store your holdings on their servers, and that data gets sold to hedge funds who trade against you.',
    startFrame: 0,
    durationInFrames: 360,
  },
  {
    id: 'vault',
    text: 'FlowFolio version 0.3.1 changes everything. Your API keys are now encrypted with IOTA Stronghold, the same vault technology used in blockchain infrastructure. Argon 2 key derivation makes brute force impractical.',
    startFrame: 380,
    durationInFrames: 480,
  },
  {
    id: 'testing',
    text: 'Every release is battle tested. A new Playwright end-to-end test suite validates every critical user flow across Linux, macOS, and Windows before a single line ships.',
    startFrame: 880,
    durationInFrames: 420,
  },
  {
    id: 'architecture',
    text: 'Zero crash architecture. Dynamic plugin loading ensures the app never goes down from missing modules. Five critical integration bugs were fixed in this release.',
    startFrame: 1320,
    durationInFrames: 380,
  },
  {
    id: 'local',
    text: 'All features are now unlocked locally. No cloud account. No paywall. Thirty plus quant metrics, eight market data providers, and an AI portfolio agent, all running on your machine.',
    startFrame: 1720,
    durationInFrames: 440,
  },
  {
    id: 'cta',
    text: 'Your portfolio data is valuable. Keep it on your machine. FlowFolio. Vault encrypted. One hundred percent offline. One hundred percent yours.',
    startFrame: 2180,
    durationInFrames: 380,
  },
];

// ─── Generate ──────────────────────────────────────────────

console.log(`\nFlowFolio v0.3.1 Security Voiceover Generator`);
console.log(`Voice: ${VOICE} | Rate: ${RATE}\n`);

mkdirSync(OUT_DIR, { recursive: true });

let generated = 0;

for (const seg of segments) {
  const mp3Path = join(OUT_DIR, `${seg.id}.mp3`);
  const wavPath = join(OUT_DIR, `${seg.id}.wav`);
  process.stdout.write(`  ${seg.id}: "${seg.text.substring(0, 50)}..." `);

  try {
    // Generate mp3 with edge-tts
    execSync(
      `${EDGE_TTS} --voice ${VOICE} --rate="${RATE}" --text "${seg.text.replace(/"/g, '\\"')}" --write-media "${mp3Path}"`,
      { stdio: 'pipe' },
    );
    // Convert to wav for Remotion compatibility
    execSync(`afconvert -f WAVE -d LEI16@48000 "${mp3Path}" "${wavPath}"`, { stdio: 'pipe' });
    execSync(`rm -f "${mp3Path}"`, { stdio: 'pipe' });
    console.log('done');
    generated++;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
}

console.log(`\nGenerated ${generated}/${segments.length} audio files\n`);
