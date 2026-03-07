import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const IG_BASE = 'https://www.instagram.com';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5));
}

export interface PostOptions {
  mediaPath: string;       // video (.mp4), image (.png/.jpg), or directory (carousel)
  caption: string;
  coverTimestamp?: number;
  /** @deprecated Use mediaPath instead */
  videoPath?: string;
}

function isImagePost(filePath: string): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(filePath);
}

function isCarouselPost(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

export async function uploadReel(page: Page, opts: PostOptions): Promise<boolean> {
  const mediaPath = opts.mediaPath || opts.videoPath || '';

  if (!fs.existsSync(mediaPath)) {
    console.error(`Media file not found: ${mediaPath}`);
    return false;
  }

  const isCarousel = isCarouselPost(mediaPath);
  const isImage = !isCarousel && isImagePost(mediaPath);

  if (isCarousel) {
    const slides = fs.readdirSync(mediaPath)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort()
      .map(f => path.join(mediaPath, f));
    console.log(`Uploading carousel: ${slides.length} slides from ${mediaPath}`);
    return uploadCarouselPost(page, slides, opts.caption);
  }

  const stats = fs.statSync(mediaPath);
  const sizeLabel = isImage
    ? `${(stats.size / 1024).toFixed(0)} KB`
    : `${(stats.size / 1024 / 1024).toFixed(1)} MB`;
  console.log(`Uploading ${isImage ? 'image' : 'video'}: ${mediaPath} (${sizeLabel})`);

  try {
    // Navigate to Instagram home
    await page.goto(IG_BASE, { waitUntil: 'networkidle' });
    await delay(2000);

    // Click the "Create" / "New post" button (+ icon)
    const createBtn = page.locator(
      'svg[aria-label="New post"], a[href="/create/style/"], [aria-label="New post"]'
    ).first();

    if (await createBtn.isVisible({ timeout: 5000 })) {
      await createBtn.click();
    } else {
      // Mobile: try bottom nav create button
      const mobileCreate = page.locator('[data-testid="new-post-button"], svg[aria-label="New Post"]').first();
      await mobileCreate.click();
    }
    await delay(2000);

    // Handle file input - Instagram uses a hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(mediaPath);
    await delay(3000);

    // Wait for processing
    console.log(`⏳ Waiting for ${isImage ? 'image' : 'video'} to process...`);
    await delay(5000);

    // Click through the creation flow
    // Step 1: Crop/Trim → Next
    const nextBtn = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    if (await nextBtn.isVisible({ timeout: 5000 })) {
      await nextBtn.click();
      await delay(2000);
    }

    // Step 2: Filters → Next
    if (await nextBtn.isVisible({ timeout: 3000 })) {
      await nextBtn.click();
      await delay(2000);
    }

    // Step 3: Caption
    const captionInput = page.locator(
      'textarea[aria-label="Write a caption..."], div[aria-label="Write a caption..."], [data-testid="creation-caption-text"]'
    ).first();

    if (await captionInput.isVisible({ timeout: 5000 })) {
      await captionInput.click();
      await delay(500);
      await page.keyboard.type(opts.caption, { delay: 20 });
      await delay(1000);
    }

    // Click Share
    const shareBtn = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")').first();
    await shareBtn.click();
    console.log('📤 Posting...');

    // Wait for upload to complete
    await delay(10000);

    // Check for success
    const successIndicator = page.locator('text="Your reel has been shared"', );
    const postShared = page.locator('text="Post shared"');
    const reelShared = page.locator('text="Reel shared"');

    const success = await Promise.race([
      successIndicator.waitFor({ timeout: 30000 }).then(() => true),
      postShared.waitFor({ timeout: 30000 }).then(() => true),
      reelShared.waitFor({ timeout: 30000 }).then(() => true),
      delay(30000).then(() => false),
    ]);

    if (success) {
      console.log(`✅ ${isImage ? 'Image' : 'Video'} posted successfully!`);
      return true;
    }

    console.log('⚠️  Upload may have succeeded - check Instagram manually');
    return true; // Optimistic return
  } catch (err) {
    console.error('❌ Upload error:', (err as Error).message);
    return false;
  }
}

export function generateCaption(videoType: string): string {
  const captions: Record<string, string> = {
    'intro': `🚀 Meet FlowFolio — Your AI-Powered Investment Companion

✨ Vibe-based investing meets quantitative analysis
📊 Backtest strategies with real historical data
🔒 100% offline & privacy-first
🤖 AI portfolio insights

No cloud. No tracking. Just smart investing.

#FlowFolio #InvestSmart #QuantTrading #AIInvesting #PortfolioManagement #VibeInvesting #FinTech #Trading #StockMarket #Investment #PrivacyFirst #OfflineFirst #BackTesting #TechStartup #IndieApp`,

    'demo': `📊 FlowFolio Deep Dive — Full Feature Showcase

Watch how FlowFolio transforms your investment workflow:
🎯 Create vibe strategies with factor weighting
📈 Run backtests against S&P 500
💼 Optimize portfolios with Sharpe ratio
📝 Track your investment journal

All running locally on your machine. Zero cloud dependencies.

#FlowFolio #TradingApp #InvestmentTool #QuantAnalysis #BackTesting #PortfolioOptimization #AITrading #DesktopApp #TauriApp #RustLang #React #FinancialTech`,

    'app-showcase': `💼 FlowFolio App Showcase — Every Screen, Every Feature

From dashboard to detailed analysis:
📊 Real-time portfolio tracking
🎨 Vibe Studio for strategy creation
📈 Comprehensive backtest results
🔬 Quantitative metrics deep dive
📓 Investment journal

Built with Tauri 2 + React 19 + Rust 🦀

#FlowFolio #AppShowcase #DesktopApp #InvestmentApp #TauriApp #Rust #React #UI #AppDesign #FinTech #Trading`,
  };

  return captions[videoType] || captions['intro'];
}

async function uploadCarouselPost(page: Page, slides: string[], caption: string): Promise<boolean> {
  try {
    await page.goto(IG_BASE, { waitUntil: 'networkidle' });
    await delay(2000);

    // Click Create / New post button
    const createBtn = page.locator(
      'svg[aria-label="New post"], a[href="/create/style/"], [aria-label="New post"]'
    ).first();

    if (await createBtn.isVisible({ timeout: 5000 })) {
      await createBtn.click();
    } else {
      const mobileCreate = page.locator('[data-testid="new-post-button"], svg[aria-label="New Post"]').first();
      await mobileCreate.click();
    }
    await delay(2000);

    // Upload all slides at once — Instagram file input accepts multiple files
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(slides);
    await delay(3000);

    console.log(`Processing ${slides.length} carousel slides...`);
    await delay(5000);

    // Click through creation flow: Crop → Next
    const nextBtn = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    if (await nextBtn.isVisible({ timeout: 5000 })) {
      await nextBtn.click();
      await delay(2000);
    }

    // Filters → Next
    if (await nextBtn.isVisible({ timeout: 3000 })) {
      await nextBtn.click();
      await delay(2000);
    }

    // Caption
    const captionInput = page.locator(
      'textarea[aria-label="Write a caption..."], div[aria-label="Write a caption..."], [data-testid="creation-caption-text"]'
    ).first();

    if (await captionInput.isVisible({ timeout: 5000 })) {
      await captionInput.click();
      await delay(500);
      await page.keyboard.type(caption, { delay: 20 });
      await delay(1000);
    }

    // Share
    const shareBtn = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")').first();
    await shareBtn.click();
    console.log('Posting carousel...');

    await delay(15000);

    const postShared = page.locator('text="Post shared"');
    const success = await Promise.race([
      postShared.waitFor({ timeout: 30000 }).then(() => true),
      delay(30000).then(() => false),
    ]);

    if (success) {
      console.log(`Carousel posted successfully (${slides.length} slides)`);
      return true;
    }

    console.log('Upload may have succeeded - check Instagram manually');
    return true;
  } catch (err) {
    console.error('Carousel upload error:', (err as Error).message);
    return false;
  }
}
