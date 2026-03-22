#!/usr/bin/env npx tsx
/**
 * Render and post v0.3.1 release Instagram Reel.
 * Usage: npx tsx scripts/instagram/post-release-031.ts [--skip-render]
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

const OUTPUT_FILE = path.join(ROOT, 'out', 'flowfolio-release-031.mp4');

const CAPTION = `FlowFolio v0.3.1 — the security & stability update.

Your API keys are now vault-encrypted. Your app is battle-tested. Everything runs on your machine.

What's new:
🔐 Stronghold Vault — encrypted key storage with Argon2 KDF
🧪 E2E Test Suite — Playwright smoke tests with Tauri mock fixtures
⚡ Dynamic Plugin Loading — zero-crash web mode compatibility
🏠 Local-First Pro — all features unlocked, no cloud, no paywall
📱 Mobile Build Pipeline — iOS & Android verification scripts
🤖 AI Streaming — OpenRouter SSE for the portfolio agent
🔧 5 Integration Fixes — DividendTracker, SQL ops, ExposureChart
📋 24 Product Gaps Mapped — full roadmap to production-ready

Plus 6 new vault commands and a comprehensive product audit.

Built with Rust, React 19, Tauri 2, and IOTA Stronghold.
Privacy-first. Vault-encrypted. Runs on your machine.

Download: link in bio

#FlowFolio #CyberSecurity #EncryptedVault #PortfolioManagement #FinTech #RustLang #TauriApp #React #DesktopApp #PrivacyFirst #Stronghold #InvestSmart #QuantTrading #BuildInPublic #IndieHacker #AppDev #E2ETesting #OpenSource #VaultEncrypted #LocalFirst`;

// ── Render ───────────────────────────────────────────────
// Note: execSync uses a hardcoded command — no user input, safe from injection.

function renderReel() {
  console.log('Rendering FlowFolio v0.3.1 Instagram Reel...\n');

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const cmd = 'npx remotion render src/remotion/index.ts FlowFolioRelease031';
  console.log(`> ${cmd} ${OUTPUT_FILE}\n`);

  execSync(`${cmd} ${OUTPUT_FILE}`, { cwd: ROOT, stdio: 'inherit' });

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

    console.log('\nUploading v0.3.1 release reel...');
    const success = await uploadReel(page, {
      mediaPath: OUTPUT_FILE,
      caption: CAPTION,
      addTrendingAudio: false,
    });

    if (success) {
      console.log('\nv0.3.1 release reel posted successfully!');
    } else {
      console.error('\nUpload failed — check debug screenshots');
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
