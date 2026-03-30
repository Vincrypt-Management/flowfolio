#!/usr/bin/env npx tsx
/**
 * Post a specific scheduled post immediately.
 * Usage: npx tsx scripts/instagram/post-now.ts <post-id>
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { launchBrowser, login, saveSession } from './auth';
import { uploadReel, uploadStory } from './upload';
import { getDb, updatePostStatus } from './schedule-db';

const STORY_ONLY = process.argv.includes('--story-only');
const POST_ID = process.argv.find(a => !a.startsWith('--') && a !== process.argv[1] && a !== process.execPath); // optional — if omitted, posts ALL due content

async function postSingle(page: any, db: any, post: any): Promise<boolean> {
  console.log('\n--- Posting:', post.id, '---');
  console.log('Type:', post.composition);
  console.log('Media:', post.video_path);
  console.log('Caption preview:', post.caption.slice(0, 120) + '...');

  updatePostStatus(db, post.id, 'posting');

  const fullCaption = post.caption + (post.hashtags ? '\n\n' + post.hashtags : '');
  const success = await uploadReel(page, {
    mediaPath: post.video_path,
    caption: fullCaption,
    addTrendingAudio: false,
  });

  if (success) {
    updatePostStatus(db, post.id, 'posted', { posted_at: new Date().toISOString() });
    console.log('Posted successfully:', post.id);

    const isCarousel = fs.existsSync(post.video_path) && fs.statSync(post.video_path).isDirectory();
    if (!isCarousel) {
      console.log('Sharing to story...');
      await uploadStory(page, post.video_path);
    }
  } else {
    updatePostStatus(db, post.id, 'failed', { error: 'Upload failed' });
    console.error('Upload failed:', post.id);
  }

  return success;
}

async function main() {
  const db = getDb();

  // Determine which posts to publish
  let posts: any[];
  if (POST_ID) {
    const post = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(POST_ID) as any;
    if (!post) {
      console.error('Post not found:', POST_ID);
      process.exit(1);
    }
    posts = [post];
  } else {
    // All posts due up until now with a video/media path ready
    const now = new Date().toISOString();
    const statusFilter = STORY_ONLY
      ? `status IN ('pending', 'rendered', 'posted')`
      : `status IN ('pending', 'rendered')`;
    posts = db.prepare(`
      SELECT * FROM scheduled_posts
      WHERE ${statusFilter}
        AND scheduled_at <= ?
        AND video_path IS NOT NULL
      ORDER BY scheduled_at ASC
    `).all(now) as any[];

    if (posts.length === 0) {
      console.log('No due posts found with media ready. Check status with the scheduler.');
      db.close();
      return;
    }

    console.log(`=== Posting ALL Due Content: ${posts.length} post(s) ===`);
    posts.forEach((p, i) => console.log(`  ${i + 1}. [${p.scheduled_at}] ${p.id} (${p.composition})`));
  }

  const username = process.env.IG_USERNAME!;
  const password = process.env.IG_PASSWORD!;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\nLaunching browser...');
  const { browser, context, page } = await launchBrowser();

  let passed = 0;
  let failed = 0;

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed. Aborting.');
      process.exit(1);
    }
    await saveSession(context);

    for (const post of posts) {
      try {
        if (STORY_ONLY) {
          console.log('\n--- Story only:', post.id, '---');
          const mediaPath = post.video_path;
          if (!mediaPath) { console.error('No video_path for', post.id); failed++; continue; }
          const ok = await uploadStory(page, mediaPath);
          if (ok) passed++; else failed++;
        } else {
          const ok = await postSingle(page, db, post);
          if (ok) passed++; else failed++;
        }
      } catch (err) {
        console.error('Error posting', post.id, ':', (err as Error).message);
        if (!STORY_ONLY) updatePostStatus(db, post.id, 'failed', { error: (err as Error).message });
        failed++;
      }
    }
  } finally {
    await saveSession(context);
    await browser.close();
    db.close();
  }

  console.log(`\n=== Done: ${passed} posted, ${failed} failed ===`);
}

main().catch(console.error);
