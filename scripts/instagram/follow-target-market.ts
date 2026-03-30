#!/usr/bin/env npx tsx
/**
 * Follow target-market users on Instagram.
 * Targets people interested in investing, trading, and personal finance —
 * the core audience for FlowFolio.
 *
 * Usage:
 *   npx tsx scripts/instagram/follow-target-market.ts               # 80 follows from finance accounts
 *   npx tsx scripts/instagram/follow-target-market.ts --limit 50
 *   npx tsx scripts/instagram/follow-target-market.ts --hashtags    # hashtag strategy instead
 *
 * Safe limits: run up to 2x per day (~160/day). Delays are randomized
 * to mimic human behaviour and avoid action blocks.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { launchBrowser, login, saveSession } from './auth';

const IG_BASE = 'https://www.instagram.com';
const FOLLOWED_LOG = path.join(__dirname, '..', '..', '.ig-followed.json');

// ─── Large pool of investing / finance accounts ──────────────────────────────
// Followers of these accounts are the target market for FlowFolio.
const TARGET_ACCOUNTS = [
  // Education & media
  'investopedia',
  'wallstreetmojo',
  'thestockmarketinvestor',
  'financialeducation_j',
  'minority.mindset',
  'jeremiah_say',
  'thewealthmindset_',
  'wealthlab.ig',
  'thefinancialadvice',
  'richmentality_',
  'theinvestingclub',
  'finance_with_purpose',
  'investinglab_',
  'stockmarket.daily',
  'trading.education',
  // Quant / algo / tech finance
  'quantopian_fan',
  'algo.trading.hub',
  'tradingwithpython',
  'quantfinancehub',
  // Personal finance & wealth building
  'moneymindsetofficial',
  'wealthaccumulator',
  'buildingwealthdaily',
  'financefreedompath',
  'thewealthyinvestor',
  'smartmoneyhabits',
  'millionairemindsetofficial',
  'wealthbuildingcoach',
  'passive.income.path',
  // Value & dividend investing
  'valueinvestingworld',
  'dividendgrowth_investor',
  'dividendinvestor_',
  'valueinvesting.official',
  'buffettstyle_investor',
  // Stock market & trading
  'stockmarketmentor',
  'tradingtips_daily',
  'stocknewsdaily_',
  'marketanalysis.official',
  'wallstreettrader_',
  'thetradersmindset',
  'profitableinvestor_',
  'stocksimplified_',
  'investsmarter_',
  'thestockinvestor',
];

// ─── Hashtags (used with --hashtags flag) ────────────────────────────────────
const TARGET_HASHTAGS = [
  'stockmarketinvesting',
  'algotrading',
  'valueInvesting',
  'portfoliomanagement',
  'wealthbuilding',
  'stockanalysis',
  'investingtips',
  'quanttrading',
  'dividendinvesting',
  'financialindependence',
  'passiveincome',
  'stockmarket',
  'daytrading',
  'investing101',
  'personalfinance',
];

// ─── Config ──────────────────────────────────────────────────────────────────
const SESSION_LIMIT = parseInt(
  process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ||
  (process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : '80'),
  10,
);
const USE_HASHTAGS = process.argv.includes('--hashtags');
// How many followers to scroll-extract per account (more = bigger candidate pool)
const FOLLOWERS_PER_ACCOUNT = 80;
// Delay between follows in ms (randomised). Keep ≥20s to stay safe.
const FOLLOW_DELAY_MIN = 20000;
const FOLLOW_DELAY_MAX = 40000;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms + Math.random() * ms * 0.3));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function loadFollowed(): Set<string> {
  try {
    if (fs.existsSync(FOLLOWED_LOG)) {
      const data = JSON.parse(fs.readFileSync(FOLLOWED_LOG, 'utf-8'));
      return new Set(data.followed || []);
    }
  } catch { /* start fresh */ }
  return new Set();
}

function saveFollowed(followed: Set<string>) {
  fs.writeFileSync(FOLLOWED_LOG, JSON.stringify({
    followed: Array.from(followed),
    updated_at: new Date().toISOString(),
    total: followed.size,
  }, null, 2));
}

async function dismissPopups(page: any) {
  for (const text of ['Not Now', 'Not now', 'Dismiss', 'Cancel']) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 700 }).catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      await delay(500);
    }
  }
}

// ─── Candidate discovery: followers of a target account ──────────────────────
async function getUsernamesFromFollowers(
  page: any,
  targetAccount: string,
  selfUsername: string,
  alreadyFollowed: Set<string>,
): Promise<string[]> {
  console.log(`\nScraping followers of @${targetAccount}...`);

  try {
    await page.goto(`${IG_BASE}/${targetAccount}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch {
    console.log(`  Timeout — skipping`);
    return [];
  }
  await delay(2500);
  await dismissPopups(page);

  // Click the followers count link
  const followersLink = page.locator('a[href*="/followers/"]').first();
  if (!await followersLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`  No followers link — skipping`);
    return [];
  }
  await followersLink.click({ force: true });
  await delay(3000);

  const dialog = page.locator('div[role="dialog"]').first();
  if (!await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  Followers dialog did not open — skipping`);
    return [];
  }

  // Scroll deeply to load more followers
  const scrollRounds = Math.ceil(FOLLOWERS_PER_ACCOUNT / 8); // ~8 per scroll
  for (let i = 0; i < scrollRounds; i++) {
    await dialog.evaluate((el: Element) => el.scrollBy(0, 500));
    await delay(400);
  }

  // Extract unique usernames from dialog links
  const usernames: string[] = await page.evaluate(
    (params: { self: string; max: number; alreadyFollowed: string[] }) => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return [];
      const reserved = ['p', 'explore', 'reel', 'reels', 'stories', 'tv', 'direct', 'accounts'];
      const names: string[] = [];
      const followed = new Set(params.alreadyFollowed);
      const links = Array.from(dialog.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      for (const link of links) {
        const p = link.pathname; // "/username/"
        if (/^\/[a-zA-Z0-9._]{1,30}\/$/.test(p)) {
          const name = p.replace(/\//g, '').toLowerCase();
          if (
            name &&
            !reserved.includes(name) &&
            name !== params.self.toLowerCase() &&
            !names.includes(name) &&
            !followed.has(name)
          ) {
            names.push(name);
          }
        }
        if (names.length >= params.max) break;
      }
      return names;
    },
    { self: selfUsername, max: FOLLOWERS_PER_ACCOUNT, alreadyFollowed: Array.from(alreadyFollowed) },
  );

  await page.keyboard.press('Escape').catch(() => {});
  await delay(800);

  console.log(`  Extracted ${usernames.length} candidates`);
  return usernames;
}

// ─── Candidate discovery: hashtag post authors ───────────────────────────────
async function getUsernamesFromHashtag(
  page: any,
  hashtag: string,
  selfUsername: string,
  alreadyFollowed: Set<string>,
): Promise<string[]> {
  console.log(`\nScraping #${hashtag}...`);

  try {
    await page.goto(`${IG_BASE}/explore/tags/${hashtag}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch {
    console.log(`  Timeout — skipping`);
    return [];
  }
  await delay(3000);
  await dismissPopups(page);

  // Scroll to trigger lazy loading
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 700));
    await delay(600);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);

  const postLinks: string[] = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    const links = anchors
      .map(a => a.href)
      .filter(h => /instagram\.com\/p\/[A-Za-z0-9_-]+\/?$/.test(h));
    return [...new Set(links)];
  });

  console.log(`  Found ${postLinks.length} post links`);
  if (postLinks.length === 0) return [];

  const reserved = new Set(['p', 'explore', 'reel', 'reels', 'stories', 'tv', 'direct', 'accounts']);
  const usernames: string[] = [];

  for (const postUrl of postLinks.slice(0, 20)) {
    try {
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
      await delay(1000);

      const author: string | null = await page.evaluate((self: string) => {
        const containers = [
          document.querySelector('article'),
          document.querySelector('main'),
          document.querySelector('div[role="dialog"]'),
        ].filter(Boolean);
        const reserved = ['p', 'explore', 'reel', 'reels', 'stories', 'tv', 'direct', 'accounts'];
        for (const c of containers) {
          const links = Array.from((c as Element).querySelectorAll('a[href]')) as HTMLAnchorElement[];
          for (const link of links) {
            const p = link.pathname;
            if (/^\/[a-zA-Z0-9._]{1,30}\/$/.test(p)) {
              const name = p.replace(/\//g, '').toLowerCase();
              if (name && !reserved.includes(name) && name !== self.toLowerCase()) return name;
            }
          }
        }
        return null;
      }, selfUsername);

      if (author && !usernames.includes(author) && !alreadyFollowed.has(author)) {
        usernames.push(author);
        console.log(`  Author: @${author}`);
      }
    } catch { /* skip */ }
  }

  console.log(`  Unique new authors: ${usernames.length}`);
  return usernames;
}

// ─── Follow a single user ────────────────────────────────────────────────────
async function followUser(
  page: any,
  username: string,
  alreadyFollowed: Set<string>,
): Promise<'followed' | 'skipped' | 'already_followed' | 'blocked'> {
  if (alreadyFollowed.has(username)) return 'already_followed';

  try {
    await page.goto(`${IG_BASE}/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await delay(1800);
    await dismissPopups(page);

    if (await page.locator('text="Action Blocked"').isVisible({ timeout: 800 }).catch(() => false)) {
      console.log('  ACTION BLOCKED — stopping');
      return 'blocked';
    }
    if (await page.locator('h2:has-text("This account is private")').isVisible({ timeout: 800 }).catch(() => false)) {
      return 'skipped';
    }

    // Filter by follower count
    const metaDesc: string = await page.evaluate(() =>
      document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    );
    const match = metaDesc.match(/([\d,]+(?:\.\d+)?[KkMm]?)\s*Followers/i);
    if (match) {
      const raw = match[1].replace(/,/g, '');
      let count = parseFloat(raw);
      if (/[Kk]$/.test(raw)) count *= 1000;
      if (/[Mm]$/.test(raw)) count *= 1000000;
      if (count > 800000) { console.log(`  @${username}: ${match[1]} followers — brand/celeb, skip`); return 'skipped'; }
      if (count < 500)    { console.log(`  @${username}: ${match[1]} followers — too few (<500), skip`); return 'skipped'; }
    }

    // Click Follow button (exact text match only)
    const followBtn: { x: number; y: number } | null = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div[role="button"]')) as HTMLElement[];
      for (const btn of btns) {
        if (btn.textContent?.trim() === 'Follow') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
      }
      return null;
    });

    if (!followBtn) {
      const alreadyFollowing: boolean = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]')) as HTMLElement[];
        return btns.some(b => b.textContent?.trim() === 'Following' || b.textContent?.trim() === 'Requested');
      });
      if (alreadyFollowing) { alreadyFollowed.add(username); return 'already_followed'; }
      return 'skipped';
    }

    await page.mouse.click(followBtn.x, followBtn.y);
    await delay(1500);

    if (await page.locator('text="Action Blocked"').isVisible({ timeout: 2000 }).catch(() => false)) {
      return 'blocked';
    }

    alreadyFollowed.add(username);
    console.log(`  Followed @${username}`);
    return 'followed';
  } catch (err) {
    console.log(`  Error @${username}: ${(err as Error).message.slice(0, 60)}`);
    return 'skipped';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const igUsername = process.env.IG_USERNAME!;
  const igPassword = process.env.IG_PASSWORD!;
  if (!igUsername || !igPassword) { console.error('Missing IG_USERNAME or IG_PASSWORD in .env'); process.exit(1); }

  const followed = loadFollowed();
  console.log(`Previously followed: ${followed.size} accounts`);
  console.log(`Target this session: ${SESSION_LIMIT} follows`);
  console.log(`Strategy: ${USE_HASHTAGS ? 'hashtag post authors' : 'followers of finance accounts'}`);
  console.log(`Delay between follows: ${FOLLOW_DELAY_MIN / 1000}–${FOLLOW_DELAY_MAX / 1000}s\n`);

  console.log('Launching browser...');
  const { browser, context, page } = await launchBrowser();

  let sessionFollowed = 0;
  let sessionSkipped = 0;
  let stopped = false;

  // Shuffle sources so repeated runs hit different accounts
  const sources = USE_HASHTAGS ? [...TARGET_HASHTAGS] : [...TARGET_ACCOUNTS];
  for (let i = sources.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  try {
    const loggedIn = await login(page, igUsername, igPassword);
    if (!loggedIn) { console.error('Login failed.'); process.exit(1); }
    await saveSession(context);

    for (const source of sources) {
      if (stopped || sessionFollowed >= SESSION_LIMIT) break;

      let candidates: string[] = [];
      try {
        candidates = USE_HASHTAGS
          ? await getUsernamesFromHashtag(page, source, igUsername, followed)
          : await getUsernamesFromFollowers(page, source, igUsername, followed);
      } catch (err) {
        console.log(`  Scrape error (${source}): ${(err as Error).message.slice(0, 80)}`);
        continue;
      }

      for (const candidate of candidates) {
        if (stopped || sessionFollowed >= SESSION_LIMIT) break;

        const result = await followUser(page, candidate, followed);

        if (result === 'blocked') {
          stopped = true;
          break;
        }

        if (result === 'followed') {
          sessionFollowed++;
          saveFollowed(followed);
          console.log(`  [${sessionFollowed}/${SESSION_LIMIT}]`);
          const waitMs = randInt(FOLLOW_DELAY_MIN, FOLLOW_DELAY_MAX);
          console.log(`  Waiting ${Math.round(waitMs / 1000)}s...`);
          await delay(waitMs);
        } else {
          sessionSkipped++;
          await delay(randInt(1200, 2500));
        }
      }

      if (!stopped && sessionFollowed < SESSION_LIMIT) {
        await delay(randInt(4000, 8000));
      }
    }
  } finally {
    await saveSession(context);
    await browser.close();
  }

  console.log(`\n=== Done ===`);
  console.log(`Followed this session : ${sessionFollowed}`);
  console.log(`Skipped               : ${sessionSkipped}`);
  console.log(`Total ever followed   : ${followed.size}`);
  if (stopped) console.log('Stopped early — action block detected.');
}

main().catch(console.error);
