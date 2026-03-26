#!/usr/bin/env npx tsx
/**
 * Post quant metrics educational carousel to Instagram.
 * Usage: npx tsx scripts/instagram/post-quant-carousel-032.ts
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

const CAROUSEL_DIR = path.join(ROOT, 'out', 'quant-carousel-032');

const CAPTION = `been burned by a strategy that looked great on paper but fell apart live? these 5 numbers tell you why before it happens

most people just watch returns. but returns without context are basically useless — a fund that made 40% one year and lost 35% the next isn't impressive, it's a trap.

here's what actually matters:

→ sharpe ratio tells you if you're being compensated for the risk you're taking. below 1.0 and you're not.

→ max drawdown shows the worst case you'd have had to sit through. knowing this before you invest changes how you size positions entirely.

→ sortino ratio is sharpe's smarter sibling — it only counts the bad volatility against you. upside surprises shouldn't be penalized.

→ beta measures how much market exposure you actually have. a lot of "diversified" portfolios are just 1.3x S&P500 in disguise.

→ profit factor catches strategies that win often but lose big. a 70% win rate sounds great until the 30% wipes out everything.

FlowFolio calculates all of this automatically when you backtest or score a strategy. no spreadsheets, no formulas to copy from reddit.

link in bio if you want to try it.

—

#quanttrading #investingsmart #portfoliomanagement #riskmanagement #backtesting #sharperation #stockmarket #retailinvesting #tradingstrategy #financialeducation #personalfinance #stocktrading #dividendinvesting #wealthbuilding #fintech #indieapp #buildingpublicly #passiveincome #investingforbeginners #portfoliooptimization`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15000;

async function attempt(username: string, password: string, attemptNum: number): Promise<boolean> {
  console.log(`\n--- Attempt ${attemptNum} of ${MAX_RETRIES} ---`);
  const { browser, context, page } = await launchBrowser();
  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed on this attempt.');
      return false;
    }
    await saveSession(context);

    console.log('Uploading quant metrics carousel (8 slides)...');
    const success = await uploadReel(page, {
      mediaPath: CAROUSEL_DIR,
      caption: CAPTION,
    });

    if (success) {
      console.log('\nQuant carousel posted successfully!');
    } else {
      console.error('\nUpload returned false — check debug screenshots');
    }
    return success;
  } catch (err) {
    console.error(`Attempt ${attemptNum} threw:`, (err as Error).message);
    return false;
  } finally {
    await saveSession(context).catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  // Verify slides exist
  for (let i = 0; i < 8; i++) {
    const slide = path.join(CAROUSEL_DIR, `slide-${i}.png`);
    if (!fs.existsSync(slide)) {
      console.error(`Missing slide: ${slide}`);
      console.error('Run: for i in $(seq 0 7); do npx remotion still src/remotion/index.ts "QuantCarousel032-Slide${i}" "out/quant-carousel-032/slide-${i}.png" --frame=45; done');
      process.exit(1);
    }
  }
  console.log('All 8 slides found.');

  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    console.log('\nCarousel directory:', CAROUSEL_DIR);
    console.log('\nCaption:\n');
    console.log(CAPTION);
    process.exit(1);
  }

  for (let i = 1; i <= MAX_RETRIES; i++) {
    const ok = await attempt(username, password, i);
    if (ok) process.exit(0);

    if (i < MAX_RETRIES) {
      console.log(`\nRetrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.error(`\nAll ${MAX_RETRIES} attempts failed. Post this manually:`);
  console.error(`  Directory: ${CAROUSEL_DIR}`);
  console.error(`  Caption:   (see script CAPTION constant)`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
