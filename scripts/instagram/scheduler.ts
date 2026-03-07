#!/usr/bin/env npx ts-node
/**
 * FlowFolio Instagram Scheduler Engine
 *
 * Manages the full lifecycle:
 *   1. Populate schedule from profile (content calendar)
 *   2. Pre-render videos for upcoming posts
 *   3. Run daemon that posts at scheduled times
 *
 * Usage:
 *   npx ts-node scripts/instagram/scheduler.ts <command> [options]
 *
 * Commands:
 *   plan [--profile <name>] [--weeks <n>]   Generate content calendar
 *   render [--next <n>]                     Pre-render next N scheduled videos
 *   run                                     Start scheduler daemon (posts when due)
 *   status                                  Show schedule status
 *   list                                    List upcoming posts
 *   clear                                   Clear all pending posts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import {
  getDb, createPost, getPendingPosts, getUpcomingPosts,
  updatePostStatus, getStats, clearPending, ScheduledPost,
} from './schedule-db';
import {
  generateSeed, generateContentPlan, renderContent, ContentMix, COMPOSITIONS,
} from './content-generator';
import {
  PROFILES, DEFAULT_PROFILE, generateScheduleDates, formatSchedule,
  ScheduleProfile,
} from './schedule-config';
import { launchBrowser, login, saveSession } from './auth';
import { uploadReel } from './upload';

// --- CLI parsing ---

function parseCommand(): { command: string; flags: Record<string, string> } {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  return { command, flags };
}

// --- Commands ---

async function cmdPlan(flags: Record<string, string>) {
  const profileName = flags.profile || DEFAULT_PROFILE;
  const weeks = parseInt(flags.weeks || '4', 10);
  const profile = PROFILES[profileName];

  if (!profile) {
    console.error(`❌ Unknown profile: ${profileName}`);
    console.log(`   Available: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log(`  📅 Content Calendar — ${profile.name}`);
  console.log(`  ${profile.description}`);
  console.log(`  Planning ${weeks} weeks ahead`);
  console.log('═══════════════════════════════════════════════\n');

  const dates = generateScheduleDates(profile, weeks);

  if (dates.length === 0) {
    console.log('No upcoming slots found. Try increasing --weeks.');
    return;
  }

  console.log(`📋 Schedule (${dates.length} posts):\n`);
  console.log(formatSchedule(dates));

  // Populate the database
  const db = getDb();
  let created = 0;

  for (const date of dates) {
    const seed = generateSeed();
    const plan = generateContentPlan(seed, profile.contentMix);
    const id = `post-${date.toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

    // Skip if already scheduled for this time
    const existing = db.prepare(
      `SELECT id FROM scheduled_posts WHERE scheduled_at = ? AND status != 'failed'`
    ).get(date.toISOString());

    if (existing) continue;

    createPost(db, {
      id,
      composition: plan.composition,
      seed: plan.seed,
      caption: plan.caption,
      hashtags: plan.hashtags,
      scheduled_at: date.toISOString(),
    });
    created++;
  }

  console.log(`\n✅ Created ${created} new scheduled posts (${dates.length - created} already existed)`);

  // Show stats
  const stats = getStats(db);
  console.log(`\n📊 Total: ${stats.total} posts | ${JSON.stringify(stats.breakdown)}`);
  db.close();
}

async function cmdRender(flags: Record<string, string>) {
  const limit = parseInt(flags.next || '3', 10);
  const db = getDb();
  const upcoming = getUpcomingPosts(db, limit);

  const toRender = upcoming.filter(p => p.status === 'pending');
  if (toRender.length === 0) {
    console.log('✅ No videos to render. All upcoming posts are ready.');
    db.close();
    return;
  }

  console.log(`🎬 Pre-rendering ${toRender.length} videos...\n`);

  for (const post of toRender) {
    console.log(`  → ${post.id} (${post.composition}, seed: ${post.seed})`);
    updatePostStatus(db, post.id, 'rendering');

    try {
      const videoPath = renderContent(post.composition, post.seed);
      updatePostStatus(db, post.id, 'rendered', { video_path: videoPath });
      console.log(`  ✅ Rendered: ${path.basename(videoPath)}`);
    } catch (err) {
      const errMsg = (err as Error).message;
      updatePostStatus(db, post.id, 'failed', { error: errMsg });
      console.error(`  ❌ Failed: ${errMsg}`);
    }
  }

  db.close();
}

async function cmdRun() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🤖 FlowFolio Instagram Scheduler Daemon');
  console.log('═══════════════════════════════════════════════');
  console.log('  Checking for due posts every 60 seconds...');
  console.log('  Press Ctrl+C to stop\n');

  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;

  if (!username || !password) {
    console.error('❌ Missing IG_USERNAME or IG_PASSWORD in .env');
    process.exit(1);
  }

  let browser: any = null;
  let context: any = null;
  let page: any = null;
  let isLoggedIn = false;

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down scheduler...');
    if (browser) await browser.close();
    process.exit(0);
  });

  const tick = async () => {
    const db = getDb();

    try {
      const duePosts = getPendingPosts(db);

      if (duePosts.length === 0) {
        return;
      }

      console.log(`\n📬 ${duePosts.length} post(s) due!`);

      for (const post of duePosts) {
        // Step 1: Render if not already
        let videoPath = post.video_path;
        if (!videoPath || !fs.existsSync(videoPath)) {
          console.log(`🎬 Rendering ${post.composition} (seed: ${post.seed})...`);
          updatePostStatus(db, post.id, 'rendering');
          try {
            videoPath = renderContent(post.composition, post.seed);
            updatePostStatus(db, post.id, 'rendered', { video_path: videoPath });
          } catch (err) {
            updatePostStatus(db, post.id, 'failed', { error: (err as Error).message });
            console.error(`❌ Render failed for ${post.id}: ${(err as Error).message}`);
            continue;
          }
        }

        // Step 2: Launch browser + login if needed
        if (!isLoggedIn) {
          console.log('🌐 Launching browser...');
          const launched = await launchBrowser();
          browser = launched.browser;
          context = launched.context;
          page = launched.page;

          isLoggedIn = await login(page, username!, password!);
          if (!isLoggedIn) {
            console.error('❌ Login failed. Skipping post cycle.');
            await browser.close();
            browser = null;
            return;
          }
          await saveSession(context);
        }

        // Step 3: Upload
        console.log(`📤 Posting ${post.id}...`);
        updatePostStatus(db, post.id, 'posting');

        const fullCaption = post.caption + '\n\n' + post.hashtags;
        const isStill = COMPOSITIONS[post.composition]?.type === 'still';
        console.log(`  ${isStill ? '🖼️  Feed post' : '🎬 Reel'}`);
        const success = await uploadReel(page, {
          mediaPath: videoPath!,
          caption: fullCaption,
        });

        if (success) {
          updatePostStatus(db, post.id, 'posted', { posted_at: new Date().toISOString() });
          console.log(`✅ Posted: ${post.id}`);
        } else {
          updatePostStatus(db, post.id, 'failed', { error: 'Upload failed' });
          console.error(`❌ Failed to post: ${post.id}`);
        }

        // Delay between posts
        if (duePosts.indexOf(post) < duePosts.length - 1) {
          console.log('⏳ Waiting 60s between posts...');
          await new Promise((r) => setTimeout(r, 60000));
        }
      }
    } catch (err) {
      console.error('❌ Scheduler tick error:', (err as Error).message);
    } finally {
      db.close();
    }
  };

  // Run immediately, then every 60 seconds
  await tick();
  setInterval(tick, 60000);

  // Keep process alive
  await new Promise(() => {});
}

async function cmdStatus() {
  const db = getDb();
  const stats = getStats(db);

  console.log('═══════════════════════════════════════════════');
  console.log('  📊 Schedule Status');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total posts: ${stats.total}`);

  for (const [status, count] of Object.entries(stats.breakdown)) {
    const icon = { pending: '⏳', rendering: '🎬', rendered: '📁', posting: '📤', posted: '✅', failed: '❌' }[status] || '•';
    console.log(`  ${icon} ${status}: ${count}`);
  }

  // Next upcoming
  const upcoming = getUpcomingPosts(db, 5);
  if (upcoming.length > 0) {
    console.log('\n  📅 Next up:');
    for (const post of upcoming) {
      const date = new Date(post.scheduled_at);
      const time = date.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      console.log(`    ${post.status === 'rendered' ? '📁' : '⏳'} ${time} — ${post.composition} (seed: ${post.seed})`);
    }
  }

  db.close();
}

async function cmdList() {
  const db = getDb();
  const posts = getUpcomingPosts(db, 50);

  if (posts.length === 0) {
    console.log('📭 No upcoming posts. Run `plan` to generate a content calendar.');
    db.close();
    return;
  }

  console.log(`📋 Upcoming posts (${posts.length}):\n`);

  for (const post of posts) {
    const date = new Date(post.scheduled_at);
    const time = date.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const iconMap: Record<string, string> = { pending: '⏳', rendering: '🎬', rendered: '📁', posting: '📤', posted: '✅', failed: '❌' };
    const icon = iconMap[post.status] || '•';
    console.log(`${icon} ${post.id}`);
    console.log(`   ${time} | ${post.composition} | seed: ${post.seed}`);
    console.log(`   ${post.caption.slice(0, 80)}...`);
    console.log('');
  }

  db.close();
}

async function cmdClear() {
  const db = getDb();
  const removed = clearPending(db);
  console.log(`🗑️  Cleared ${removed} pending posts.`);
  db.close();
}

// --- Main ---

async function main() {
  const { command, flags } = parseCommand();

  switch (command) {
    case 'plan': return cmdPlan(flags);
    case 'render': return cmdRender(flags);
    case 'run': return cmdRun();
    case 'status': return cmdStatus();
    case 'list': return cmdList();
    case 'clear': return cmdClear();
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Commands: plan, render, run, status, list, clear');
      process.exit(1);
  }
}

main().catch(console.error);
