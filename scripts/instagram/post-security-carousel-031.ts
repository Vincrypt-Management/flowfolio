#!/usr/bin/env npx tsx
/**
 * Post v0.3.1 security carousel to Instagram.
 * Usage: npx tsx scripts/instagram/post-security-carousel-031.ts
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

const CAROUSEL_DIR = path.join(ROOT, 'out', 'security-carousel-031');

const CAPTION = `Your portfolio tracker is selling your data. Here's what we did about it.

FlowFolio v0.3.1 — the security & stability update.

Most free investment tools store your holdings, trades, and API keys on their servers. That data gets sold to hedge funds who trade against retail investors.

We took a different approach:

1. Stronghold Vault — API keys encrypted with IOTA Stronghold + Argon2 KDF. No plain-text secrets on disk.

2. E2E test suite — Playwright validates every user flow across Linux, macOS, and Windows before release.

3. Zero-crash architecture — dynamic plugin loading ensures the app stays responsive even when native modules are unavailable.

4. Local-first Pro — all features unlocked without cloud accounts or paywalls. Your analysis runs on your hardware.

5. 24 product gaps mapped — comprehensive audit with a clear roadmap to production-ready.

Your portfolio data is valuable. Keep it on your machine.

Download: link in bio

#FlowFolio #InvestSmart #PortfolioManagement #FinTech #CyberSecurity #PrivacyFirst #DataPrivacy #EncryptedVault #LocalFirst #RustLang #TauriApp #DesktopApp #QuantTrading #BuildInPublic #IndieHacker #OpenSource #InvestmentApp #AppDev #FactorInvesting #SecurityFirst`;

async function main() {
  // Verify slides exist
  for (let i = 0; i < 8; i++) {
    const slide = path.join(CAROUSEL_DIR, `slide-${i}.png`);
    if (!fs.existsSync(slide)) {
      console.error(`Missing slide: ${slide}`);
      console.error('Run: for i in $(seq 0 7); do npx remotion still src/remotion/index.ts "SecurityCarousel031-Slide${i}" "out/security-carousel-031/slide-${i}.png" --frame=45; done');
      process.exit(1);
    }
  }
  console.log('All 8 carousel slides found.');

  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    console.log('\nTo post manually, upload the carousel from:', CAROUSEL_DIR);
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

    console.log('\nUploading v0.3.1 security carousel (8 slides)...');
    const success = await uploadReel(page, {
      mediaPath: CAROUSEL_DIR,
      caption: CAPTION,
    });

    if (success) {
      console.log('\nv0.3.1 security carousel posted successfully!');
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
