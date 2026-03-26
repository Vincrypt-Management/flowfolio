#!/usr/bin/env npx tsx
/**
 * Post v0.3.2 Backtest Educational Reel to Instagram.
 * Usage: npx tsx scripts/instagram/post-backtest-educational-032.ts
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

const OUTPUT_FILE = path.join(ROOT, 'out', 'flowfolio-backtest-educational-032.mp4');

const CAPTION = `most investors find out their strategy doesn't work the same way — by watching their account drop

a strategy that looked great on paper can have a 40% drawdown hiding in 2020. you won't know until it happens again. unless you backtest first.

here's what backtesting actually tells you:

→ sharpe ratio — are you being paid for the risk you're taking?
→ max drawdown — what's the worst you'd have had to sit through?
→ sortino ratio — how bad is the downside volatility specifically?
→ beta — how much of this is just the market moving?
→ profit factor — do your winners actually outweigh your losers?

FlowFolio runs this simulation automatically. pick your symbols, set your date range, choose your strategy, and run. eight market data providers. historical data going back years. all on your machine.

if it doesn't pass the five-number test, it doesn't get real money.

link in bio.

—

#backtesting #quanttrading #investingsmart #portfoliomanagement #riskmanagement #sharperatio #stockmarket #retailinvesting #tradingstrategy #financialeducation #personalfinance #stocktrading #wealthbuilding #fintech #indieapp #buildingpublicly #passiveincome #investingforbeginners #portfoliooptimization #factorinvesting`;

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

    console.log('Uploading backtest educational reel...');
    const success = await uploadReel(page, {
      mediaPath: OUTPUT_FILE,
      caption: CAPTION,
      addTrendingAudio: false,
    });

    if (success) {
      console.log('\nBacktest educational reel posted successfully!');
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

  for (let i = 1; i <= MAX_RETRIES; i++) {
    const ok = await attempt(username, password, i);
    if (ok) process.exit(0);

    if (i < MAX_RETRIES) {
      console.log(`\nRetrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.error(`\nAll ${MAX_RETRIES} attempts failed. Post this manually:`);
  console.error(`  File:    ${OUTPUT_FILE}`);
  console.error(`  Caption: (see script CAPTION constant)`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
