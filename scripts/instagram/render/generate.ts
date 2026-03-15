#!/usr/bin/env npx tsx
/**
 * Playwright-based Instagram post generator.
 * Reads pending/rendered posts from schedule DB, renders HTML templates → PNG.
 *
 * CLI usage:
 *   npx tsx scripts/instagram/render/generate.ts                   # all upcoming
 *   npx tsx scripts/instagram/render/generate.ts --post-id <id>    # single post
 *   npx tsx scripts/instagram/render/generate.ts --all-pending     # overdue only
 *
 * Programmatic usage (from content-generator.ts):
 *   import { generatePost } from './render/generate.js'
 *   const { videoPath } = await generatePost(postId)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getDb, getUpcomingPosts, getPendingPosts, getPost, updatePostStatus,
  type ScheduledPost,
} from '../schedule-db.js';
import { parsePost } from './content-parser.js';
import { launchBrowser, renderPost } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..', '..');
const TEMPLATES = path.join(__dirname, '..', 'templates');
const OUTPUT_DIR = path.join(ROOT, 'out', 'scheduled');

function templateFor(composition: string): string {
  const map: Record<string, string> = {
    'feed-feature': path.join(TEMPLATES, 'feed-feature.html'),
    'feed-metrics': path.join(TEMPLATES, 'feed-metrics.html'),
    'carousel':     path.join(TEMPLATES, 'carousel-slide.html'),
  };
  const tpl = map[composition];
  if (!tpl) throw new Error(`No template for composition: ${composition}`);
  return tpl;
}

function outputPathFor(post: ScheduledPost): string {
  if (post.composition === 'carousel') {
    return path.join(OUTPUT_DIR, `carousel-${post.seed}`);
  }
  return path.join(OUTPUT_DIR, `${post.composition}-${post.seed}.png`);
}

async function renderFeedPost(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  post: ScheduledPost,
  tokens: Record<string, string>,
): Promise<string> {
  const outPath = outputPathFor(post);
  await renderPost(browser, {
    templatePath: templateFor(post.composition),
    tokens,
    outputPath: outPath,
  });
  return outPath;
}

async function renderCarousel(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  post: ScheduledPost,
  tokens: Record<string, string>,
): Promise<string> {
  const outDir = outputPathFor(post);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const slides: Array<{
    concept: string; headlineAccent: string; body: string; stat: string; statLbl: string;
  }> = JSON.parse(tokens.CAROUSEL_SLIDES_JSON);

  const TOTAL = 8; // 1 cover + 6 content + 1 CTA (always exactly 8)

  // Slide 0: cover
  await renderPost(browser, {
    templatePath: templateFor('carousel'),
    tokens: {
      ...tokens,
      SLIDE_TYPE: 'cover',
      SLIDE_N: '1',
      SLIDE_TOTAL: String(TOTAL),
      HEADLINE: tokens.HEADLINE,
      HEADLINE_ACCENT: tokens.HEADLINE_ACCENT,
      HEADLINE_2: tokens.HEADLINE_2,
      BODY: tokens.CAROUSEL_COVER_SUB,
      CONCEPT: '',
      STAT: '',
      STAT_LBL: '',
    },
    outputPath: path.join(outDir, 'slide-00.png'),
  });
  console.log(`  slide-00 (cover) ✓`);

  // Slides 1–6: content
  for (let i = 0; i < 6; i++) {
    const slide = slides[i];
    const slideNum = String(i + 2).padStart(2, '0');
    await renderPost(browser, {
      templatePath: templateFor('carousel'),
      tokens: {
        ...tokens,
        SLIDE_TYPE: 'content',
        SLIDE_N: String(i + 2),
        SLIDE_TOTAL: String(TOTAL),
        CONCEPT: slide.concept,
        HEADLINE: slide.concept,
        HEADLINE_ACCENT: slide.headlineAccent,
        HEADLINE_2: '',
        BODY: slide.body,
        STAT: slide.stat,
        STAT_LBL: slide.statLbl,
      },
      outputPath: path.join(outDir, `slide-${slideNum}.png`),
    });
    console.log(`  slide-${slideNum} (${slide.concept}) ✓`);
  }

  // Slide 7: CTA
  await renderPost(browser, {
    templatePath: templateFor('carousel'),
    tokens: {
      ...tokens,
      SLIDE_TYPE: 'cta',
      SLIDE_N: String(TOTAL),
      SLIDE_TOTAL: String(TOTAL),
      HEADLINE: 'Ready to invest smarter?',
      HEADLINE_ACCENT: '',
      HEADLINE_2: '',
      BODY: '',
      CONCEPT: '',
      STAT: '',
      STAT_LBL: '',
    },
    outputPath: path.join(outDir, 'slide-07.png'),
  });
  console.log(`  slide-07 (CTA) ✓`);

  return outDir;
}

/** Render a single post by ID.
 *  Opens and closes its own browser.
 *  Exported for use by content-generator.ts. */
export async function generatePost(postId: string): Promise<{ videoPath: string }> {
  const db = getDb();
  const post = getPost(db, postId);
  if (!post) throw new Error(`Post not found: ${postId}`);

  const tokens = parsePost(post.composition, post.caption, post.seed);
  updatePostStatus(db, postId, 'rendering');

  const browser = await launchBrowser();
  try {
    let videoPath: string;
    if (post.composition === 'carousel') {
      videoPath = await renderCarousel(browser, post, tokens);
    } else {
      videoPath = await renderFeedPost(browser, post, tokens);
    }
    updatePostStatus(db, postId, 'rendered', { video_path: videoPath });
    return { videoPath };
  } catch (err) {
    updatePostStatus(db, postId, 'failed', { error: (err as Error).message });
    throw err;
  } finally {
    await browser.close();
  }
}

/** CLI batch entry point — shares one browser across all posts for speed */
async function main() {
  const args = process.argv.slice(2);
  const postIdIdx = args.indexOf('--post-id');
  const allPending = args.includes('--all-pending');

  const db = getDb();
  let posts: ScheduledPost[];

  if (postIdIdx !== -1) {
    const id = args[postIdIdx + 1];
    if (!id) { console.error('--post-id requires a value'); process.exit(1); }
    const post = getPost(db, id);
    if (!post) { console.error(`Post not found: ${id}`); process.exit(1); }
    posts = [post];
  } else if (allPending) {
    posts = getPendingPosts(db);
  } else {
    posts = getUpcomingPosts(db);
  }

  if (posts.length === 0) { console.log('No posts to render.'); return; }

  console.log(`\nRendering ${posts.length} post(s)...\n`);

  const browser = await launchBrowser();
  const results: Array<{ id: string; status: string; path?: string }> = [];

  for (const post of posts) {
    console.log(`→ ${post.id} (${post.composition})`);
    const tokens = parsePost(post.composition, post.caption, post.seed);
    updatePostStatus(db, post.id, 'rendering');

    try {
      let videoPath: string;
      if (post.composition === 'carousel') {
        videoPath = await renderCarousel(browser, post, tokens);
      } else {
        videoPath = await renderFeedPost(browser, post, tokens);
      }
      updatePostStatus(db, post.id, 'rendered', { video_path: videoPath });
      results.push({ id: post.id, status: '✅ rendered', path: videoPath });
      console.log(`  → ${videoPath}\n`);
    } catch (err) {
      const msg = (err as Error).message;
      updatePostStatus(db, post.id, 'failed', { error: msg });
      results.push({ id: post.id, status: `❌ ${msg}` });
      console.error(`  ❌ ${msg}\n`);
    }
  }

  await browser.close();

  console.log('\n── Results ──────────────────────────────────');
  results.forEach(r => console.log(`${r.status.padEnd(16)} ${r.id}`));
  console.log('─────────────────────────────────────────────\n');
}

main().catch(err => { console.error(err); process.exit(1); });
