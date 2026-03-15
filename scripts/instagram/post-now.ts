#!/usr/bin/env npx tsx
/**
 * Post a specific scheduled post immediately.
 * Usage: npx tsx scripts/instagram/post-now.ts <post-id>
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { launchBrowser, login, saveSession } from './auth';
import { uploadReel, uploadStory } from './upload';
import { getDb, updatePostStatus } from './schedule-db';

const POST_ID = process.argv[2] || 'post-2026-03-11T04-30-00';

async function main() {
  const db = getDb();
  const post = db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(POST_ID) as any;
  
  if (!post) {
    console.error('Post not found:', POST_ID);
    process.exit(1);
  }

  console.log('=== Posting Now ===');
  console.log('ID:', post.id);
  console.log('Type:', post.composition);
  console.log('Media:', post.video_path);
  console.log('Caption preview:', post.caption.slice(0, 120) + '...');

  const username = process.env.IG_USERNAME!;
  const password = process.env.IG_PASSWORD!;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    process.exit(1);
  }

  console.log('\nLaunching browser...');
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed. Aborting.');
      process.exit(1);
    }
    await saveSession(context);

    console.log('\nUploading', post.composition, '...');
    updatePostStatus(db, post.id, 'posting');

    const fullCaption = post.caption + (post.hashtags ? '\n\n' + post.hashtags : '');
    const success = await uploadReel(page, {
      mediaPath: post.video_path,
      caption: fullCaption,
      addTrendingAudio: false,
    });

    if (success) {
      updatePostStatus(db, post.id, 'posted', { posted_at: new Date().toISOString() });
      console.log('\nPosted successfully!');

      // Auto-share to story
      console.log('\nSharing to story...');
      await uploadStory(page, post.video_path);
    } else {
      updatePostStatus(db, post.id, 'failed', { error: 'Upload failed' });
      console.error('\nUpload failed');
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    updatePostStatus(db, post.id, 'failed', { error: (err as Error).message });
  } finally {
    await saveSession(context);
    await browser.close();
    db.close();
  }
}

main().catch(console.error);
