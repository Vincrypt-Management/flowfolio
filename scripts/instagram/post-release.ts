#!/usr/bin/env npx tsx
/**
 * Render and post v0.2.2 release Instagram Reel.
 * Usage: npx tsx scripts/instagram/post-release.ts [--skip-render]
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

import { launchBrowser, login, saveSession } from './auth';
import { uploadReel } from './upload';

const OUTPUT_FILE = path.join(ROOT, 'out', 'flowfolio-release-022-silent.mp4');

const CAPTION = `FlowFolio v0.2.2 — the biggest feature drop yet.

8 new tabs. One unified command center.

What's new:
📊 Portfolio Dashboard with sector allocation, top movers, and quick actions
🛡️ Risk Dashboard with composite score gauge, VaR, correlation heatmap
🔀 Side-by-side Comparison Mode for any two tickers
🔔 Price Alerts with configurable thresholds and auto-monitoring
📰 News & Sentiment analysis with bullish/bearish scoring
📅 Rebalance Scheduler with timeline and overdue detection
👁️ Watchlist Manager for tracking symbols across universes
💳 Credits Dashboard with balance ring and usage meters

Plus 6 critical backend bug fixes and fully lazy-loaded components.

Built with Rust, React 19, Tauri 2, and Recharts.
Privacy-first. Runs on your machine.

Download: link in bio

#FlowFolio #InvestSmart #QuantTrading #PortfolioManagement #FinTech #RiskAnalysis #TauriApp #RustLang #React #DesktopApp #FactorInvesting #BackTesting #PrivacyFirst #OpenSource #AppDev #InvestmentApp #StockMarket #CodingLife #BuildInPublic #IndieHacker`;

// ── Render ───────────────────────────────────────────────

function renderReel() {
  console.log('Rendering FlowFolio v0.2.2 Instagram Reel...\n');

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const cmd = `npx remotion render src/remotion/index.ts FlowFolioRelease022 ${OUTPUT_FILE}`;
  console.log(`> ${cmd}\n`);

  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

  const size = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`\nReel rendered: ${OUTPUT_FILE} (${size} MB)`);
}

// ── Post ─────────────────────────────────────────────────

async function postReel() {
  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    console.log('\nTo post manually, upload the reel from:', OUTPUT_FILE);
    console.log('\nCaption:\n');
    console.log(CAPTION);
    process.exit(1);
  }

  console.log('\nLaunching browser for Instagram upload...');
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed. Aborting.');
      process.exit(1);
    }
    await saveSession(context);

    console.log('\nUploading v0.2.2 release reel...');
    const success = await uploadReel(page, {
      mediaPath: OUTPUT_FILE,
      caption: CAPTION,
      addTrendingAudio: false,
    });

    if (success) {
      console.log('\n✅ v0.2.2 release reel posted successfully!');
    } else {
      console.error('\n❌ Upload failed — check debug screenshots');
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const skipRender = process.argv.includes('--skip-render');

  if (!skipRender) {
    renderReel();
  } else if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`Reel not found at ${OUTPUT_FILE} — run without --skip-render first`);
    process.exit(1);
  } else {
    console.log(`Using existing reel: ${OUTPUT_FILE}`);
  }

  await postReel();
}

main().catch(console.error);
