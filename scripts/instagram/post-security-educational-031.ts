#!/usr/bin/env npx tsx
/**
 * Post v0.3.1 Security Educational Reel to Instagram.
 * Usage: npx tsx scripts/instagram/post-security-educational-031.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

import { launchBrowser, login, saveSession } from './auth';
import { uploadReel } from './upload';

const OUTPUT_FILE = path.join(ROOT, 'out', 'flowfolio-security-educational-031.mp4');

const CAPTION = `Is your portfolio tracker selling your data?

Most free investment tools store your holdings, trades, and API keys on their servers. That data gets sold to hedge funds who trade against retail investors.

FlowFolio v0.3.1 takes a different approach:

Your API keys are now encrypted with IOTA Stronghold — the same vault technology used in blockchain infrastructure. Argon2 key derivation makes brute-force attacks impractical. Keys never exist in plain text on disk.

Every release is battle-tested with Playwright E2E tests across Linux, macOS, and Windows. Dynamic plugin loading ensures zero crashes.

All Pro features are unlocked locally. No cloud account. No paywall. 30+ quant metrics, 8 market data providers, and an AI portfolio agent — all running on your machine.

Your portfolio data is valuable. Keep it where it belongs.

Download: link in bio

#FlowFolio #InvestSmart #PortfolioManagement #FinTech #CyberSecurity #PrivacyFirst #DataPrivacy #EncryptedVault #LocalFirst #RustLang #TauriApp #DesktopApp #QuantTrading #BuildInPublic #IndieHacker #OpenSource #InvestmentApp #SecurityFirst #FactorInvesting #VaultEncrypted`;

async function main() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`Video not found: ${OUTPUT_FILE}`);
    process.exit(1);
  }

  const size = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`Video: ${OUTPUT_FILE} (${size} MB)`);

  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    console.log('\nTo post manually, upload from:', OUTPUT_FILE);
    console.log('\nCaption:\n');
    console.log(CAPTION);
    process.exit(1);
  }

  console.log('Launching browser for Instagram upload...');
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed. Aborting.');
      process.exit(1);
    }
    await saveSession(context);

    console.log('\nUploading security educational reel...');
    const success = await uploadReel(page, {
      mediaPath: OUTPUT_FILE,
      caption: CAPTION,
      addTrendingAudio: false,
    });

    if (success) {
      console.log('\nSecurity educational reel posted successfully!');
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

main().catch(console.error);
