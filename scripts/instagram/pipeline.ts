#!/usr/bin/env npx ts-node
/**
 * FlowFolio Instagram Automation Pipeline
 *
 * Full pipeline: Render Remotion videos → Login to Instagram → Post as Reels
 *
 * Usage:
 *   npx ts-node scripts/instagram/pipeline.ts [--skip-render] [--video <type>] [--signup]
 *
 * Options:
 *   --skip-render   Skip video rendering (use existing files in out/)
 *   --video <type>  Which video to post: intro, intro-ig, demo, demo-ig, app (default: intro-ig)
 *   --signup        Attempt to create a new Instagram account first
 *   --all           Render and post all video types
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { launchBrowser, signup, login, saveSession } from './auth';
import { uploadReel, generateCaption } from './upload';

// Load env from project root
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

interface PipelineConfig {
  skipRender: boolean;
  videoType: string;
  doSignup: boolean;
  postAll: boolean;
}

const VIDEO_MAP: Record<string, { script: string; output: string; captionKey: string }> = {
  'intro': {
    script: 'remotion:render:intro',
    output: 'out/flowfolio-intro.mp4',
    captionKey: 'intro',
  },
  'intro-ig': {
    script: 'remotion:render:intro-ig',
    output: 'out/flowfolio-intro-ig.mp4',
    captionKey: 'intro',
  },
  'demo': {
    script: 'remotion:render:demo',
    output: 'out/flowfolio-demo.mp4',
    captionKey: 'demo',
  },
  'demo-ig': {
    script: 'remotion:render:demo-ig',
    output: 'out/flowfolio-demo-ig.mp4',
    captionKey: 'demo',
  },
  'app': {
    script: 'remotion:render:app',
    output: 'out/flowfolio-app-showcase.mp4',
    captionKey: 'app-showcase',
  },
};

function parseArgs(): PipelineConfig {
  const args = process.argv.slice(2);
  return {
    skipRender: args.includes('--skip-render'),
    videoType: args.includes('--video')
      ? args[args.indexOf('--video') + 1] || 'intro-ig'
      : 'intro-ig',
    doSignup: args.includes('--signup'),
    postAll: args.includes('--all'),
  };
}

function renderVideo(videoType: string): string {
  const config = VIDEO_MAP[videoType];
  if (!config) {
    console.error(`❌ Unknown video type: ${videoType}. Options: ${Object.keys(VIDEO_MAP).join(', ')}`);
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '..', '..', config.output);

  if (fs.existsSync(outputPath)) {
    console.log(`📁 Video already exists: ${outputPath}`);
    return outputPath;
  }

  console.log(`🎬 Rendering ${videoType} video...`);
  try {
    execSync(`npm run ${config.script}`, {
      cwd: path.join(__dirname, '..', '..'),
      stdio: 'inherit',
      timeout: 600000, // 10 min timeout
    });
  } catch (err) {
    console.error(`❌ Failed to render video: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputPath)) {
    console.error(`❌ Expected output not found: ${outputPath}`);
    process.exit(1);
  }

  console.log(`✅ Video rendered: ${outputPath}`);
  return outputPath;
}

async function main() {
  const config = parseArgs();

  console.log('═══════════════════════════════════════════════');
  console.log('  🎬 FlowFolio Instagram Pipeline');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Video: ${config.postAll ? 'ALL' : config.videoType}`);
  console.log(`  Render: ${config.skipRender ? 'SKIP' : 'YES'}`);
  console.log(`  Signup: ${config.doSignup ? 'YES' : 'NO'}`);
  console.log('═══════════════════════════════════════════════\n');

  // Validate env
  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;
  const email = process.env.IG_EMAIL;
  const fullName = process.env.IG_FULL_NAME;

  if (!username || !password) {
    console.error('❌ Missing IG_USERNAME or IG_PASSWORD in .env');
    process.exit(1);
  }

  // Step 1: Determine which videos to process
  const videoTypes = config.postAll ? Object.keys(VIDEO_MAP) : [config.videoType];

  // Step 2: Render videos
  const videos: { type: string; path: string }[] = [];
  for (const vType of videoTypes) {
    if (config.skipRender) {
      const vPath = path.join(__dirname, '..', '..', VIDEO_MAP[vType].output);
      if (fs.existsSync(vPath)) {
        videos.push({ type: vType, path: vPath });
        console.log(`📁 Using existing: ${vPath}`);
      } else {
        console.log(`⚠️  Skipping ${vType} — file not found: ${vPath}`);
      }
    } else {
      const vPath = renderVideo(vType);
      videos.push({ type: vType, path: vPath });
    }
  }

  if (videos.length === 0) {
    console.error('❌ No videos to post!');
    process.exit(1);
  }

  // Step 3: Launch browser and authenticate
  console.log('\n🌐 Launching browser...');
  const { browser, context, page } = await launchBrowser();

  try {
    // Signup if requested
    if (config.doSignup && email && fullName) {
      const signupOk = await signup(page, { email, fullName, username, password });
      if (signupOk) {
        await saveSession(context);
      } else {
        console.log('⚠️  Signup failed/blocked. Attempting login instead...');
      }
    }

    // Login
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('❌ Could not log in. Aborting pipeline.');
      return;
    }
    await saveSession(context);

    // Step 4: Post videos as Reels
    for (const video of videos) {
      const captionKey = VIDEO_MAP[video.type].captionKey;
      const caption = generateCaption(captionKey);

      console.log(`\n📤 Posting ${video.type}...`);
      const posted = await uploadReel(page, {
        mediaPath: video.path,
        caption,
      });

      if (posted) {
        console.log(`✅ ${video.type} posted!`);
      } else {
        console.log(`❌ Failed to post ${video.type}`);
      }

      // Delay between posts to avoid rate limiting
      if (videos.indexOf(video) < videos.length - 1) {
        console.log('⏳ Waiting 30s between posts...');
        await new Promise((r) => setTimeout(r, 30000));
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  ✅ Pipeline complete!');
    console.log('═══════════════════════════════════════════════');
  } catch (err) {
    console.error('❌ Pipeline error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

main().catch(console.error);
