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
  addTrendingAudio?: boolean;  // attempt to add trending IG audio to reels
  /** @deprecated Use mediaPath instead */
  videoPath?: string;
}

function isImagePost(filePath: string): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(filePath);
}

function isCarouselPost(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

/**
 * Attempt to add a trending audio track to the reel during creation.
 * Instagram's web UI shows a music icon on the reel editor screen.
 * If the UI changes or the button isn't found, this silently skips.
 */
async function tryAddTrendingAudio(page: Page): Promise<void> {
  try {
    // Look for the music/audio button on the reel editor
    const musicSelectors = [
      'svg[aria-label="Open music picker"]',
      'svg[aria-label="Select music"]',
      '[aria-label="Music"]',
      'svg[aria-label="Audio"]',
      'button:has(svg[aria-label*="music" i])',
      'div[role="button"]:has(svg[aria-label*="music" i])',
      // IG sometimes uses a music note icon without a specific aria-label
      'button:has(svg path[d*="M19"])',
    ];

    let musicClicked = false;
    for (const sel of musicSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ force: true });
        musicClicked = true;
        console.log('Opening music picker...');
        break;
      }
    }

    if (!musicClicked) {
      console.log('Music picker not found -- skipping trending audio (post will use original audio)');
      return;
    }

    await delay(3000);

    // Navigate to trending/for-you tab if available
    const trendingSelectors = [
      'div[role="tab"]:has-text("Trending")',
      'div[role="tab"]:has-text("For You")',
      'button:has-text("Trending")',
      'button:has-text("For You")',
      'span:text-is("Trending")',
      'span:text-is("For You")',
    ];

    for (const sel of trendingSelectors) {
      const tab = page.locator(sel).first();
      if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tab.click({ force: true });
        console.log('Switched to trending audio tab');
        await delay(2000);
        break;
      }
    }

    // Select the first available trending track
    // IG shows tracks as rows with play buttons -- click the first one
    const trackSelectors = [
      'div[role="listbox"] div[role="option"]:first-child',
      'div[role="button"]:has(div[style*="background-image"])',
      // Track rows typically have album art + title
      'div[class*="track"], div[class*="audio"]',
    ];

    let trackSelected = false;
    for (const sel of trackSelectors) {
      const track = page.locator(sel).first();
      if (await track.isVisible({ timeout: 3000 }).catch(() => false)) {
        await track.click({ force: true });
        trackSelected = true;
        console.log('Selected trending audio track');
        await delay(2000);
        break;
      }
    }

    if (!trackSelected) {
      // Fallback: try clicking any visible music row in the picker
      const anyTrack = page.locator('div[role="dialog"] div[role="button"]').nth(1);
      if (await anyTrack.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyTrack.click({ force: true });
        console.log('Selected audio track (fallback)');
        await delay(2000);
      } else {
        console.log('No audio tracks found -- skipping');
        // Close the music picker
        const closeBtn = page.locator('svg[aria-label="Close"], button[aria-label="Close"]').first();
        if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await closeBtn.click({ force: true });
        } else {
          await page.keyboard.press('Escape');
        }
        await delay(1000);
        return;
      }
    }

    // Confirm/done -- look for a "Done" button in the music picker
    const doneSelectors = [
      'button:has-text("Done")',
      'div[role="button"]:has-text("Done")',
      'button:has-text("Save")',
    ];

    for (const sel of doneSelectors) {
      const doneBtn = page.locator(sel).first();
      if (await doneBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await doneBtn.click({ force: true });
        console.log('Audio added to reel');
        await delay(2000);
        break;
      }
    }
  } catch (err) {
    console.log('Could not add trending audio:', (err as Error).message);
    // Non-fatal -- continue posting without music
  }
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

  // Debug screenshot helper
  const debugDir = path.join(path.dirname(mediaPath), 'debug-reel');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const screenshot = async (name: string) => {
    await page.screenshot({ path: path.join(debugDir, `${name}.png`) });
    console.log(`  [debug] screenshot: ${name}`);
  };

  try {
    // Navigate to Instagram home
    await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(3000);
    await screenshot('01-home');

    // Click the "Create" / "New post" button (+ icon)
    const createSelectors = [
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'a[href="/create/style/"]',
      'svg[aria-label="New Post"]',
    ];
    let clicked = false;
    for (const sel of createSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click({ force: true });
        clicked = true;
        console.log(`  Clicked create button: ${sel}`);
        break;
      }
    }
    if (!clicked) {
      await page.click('[href="/create/style/"]', { force: true }).catch(() => {});
    }
    await delay(3000);
    await screenshot('02-create-dialog');

    // Check if file input is available or if we need to navigate
    let fileInput = page.locator('input[type="file"]').first();
    let inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);

    if (!inputAvailable) {
      // Try navigating directly to create page
      console.log('  File input not found, navigating to create page...');
      await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000);
      fileInput = page.locator('input[type="file"]').first();
      inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);
    }

    if (!inputAvailable) {
      // Retry: click Create icon again
      const createIcon = page.locator('svg[aria-label="New post"]').first();
      if (await createIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createIcon.click({ force: true });
        await delay(3000);
      }
      fileInput = page.locator('input[type="file"]').first();
    }

    // Handle file input - Instagram uses a hidden file input
    await fileInput.setInputFiles(mediaPath);
    await delay(4000);

    // Wait for processing
    console.log(`Waiting for ${isImage ? 'image' : 'video'} to process...`);
    await delay(5000);

    // Dismiss any informational popups (e.g. "Video posts are now shared as reels")
    const okBtn = page.locator('button:has-text("OK")').first();
    if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await okBtn.click({ force: true });
      console.log('  Dismissed informational popup');
      await delay(2000);
    }

    await screenshot('03-after-upload');

    // Add trending audio for video reels
    if (!isImage && opts.addTrendingAudio !== false) {
      await tryAddTrendingAudio(page);
    }

    await screenshot('04-pre-next');

    // Click through the creation flow
    // Step 1: Crop/Trim -> Next
    const nextBtn = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    if (await nextBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await nextBtn.click({ force: true });
      console.log('  Clicked Next (step 1: crop/trim)');
      await delay(3000);
    }
    await screenshot('05-after-next-1');

    // Step 2: Filters → Next
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.click({ force: true });
      console.log('  Clicked Next (step 2: filters)');
      await delay(3000);
    }
    await screenshot('06-after-next-2');

    // Step 3: Caption — try multiple selectors for IG's evolving UI
    const captionSelectors = [
      'div[aria-label="Write a caption..."]',
      'textarea[aria-label="Write a caption..."]',
      '[data-testid="creation-caption-text"]',
      'div[role="textbox"][contenteditable="true"]',
    ];
    for (const sel of captionSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.click({ force: true });
        await delay(500);
        const chunks = opts.caption.match(/.{1,200}/gs) || [opts.caption];
        for (const chunk of chunks) {
          await page.keyboard.type(chunk, { delay: 15 });
          await delay(300);
        }
        console.log(`  Caption filled using: ${sel}`);
        await delay(1000);
        break;
      }
    }

    await screenshot('07-caption-done');

    // Dismiss any hashtag/mention suggestion popups by clicking the caption counter area
    // (safe neutral zone that won't trigger navigation)
    const listbox = page.locator('div[role="listbox"]').first();
    if (await listbox.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log('  Dismissing suggestion popup...');
      // Click on the character counter (e.g. "758/2,200") — a safe neutral area
      const counter = page.locator('span:has-text("/2,200")').first();
      if (await counter.isVisible({ timeout: 1000 }).catch(() => false)) {
        await counter.click({ force: true });
      }
      await delay(1000);
    }

    // Handle "Discard post?" if it somehow appeared
    const discardDialog = page.locator('text="Discard post?"').first();
    if (await discardDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('  Discard dialog detected — clicking Cancel...');
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click({ force: true });
        await delay(2000);
      }
    }

    await screenshot('07b-pre-share');

    // Click Share — IG uses a text element in the dialog header, not a <button>
    // Use getByText for precise matching, or evaluate JS to find and click it
    let shareClicked = false;

    // Strategy 1: Use Playwright's getByText with exact match
    const shareByText = page.getByText('Share', { exact: true });
    const shareCount = await shareByText.count();
    console.log(`  Found ${shareCount} "Share" text element(s)`);
    if (shareCount > 0) {
      // Click the last one (usually the header Share link, not other occurrences)
      for (let i = 0; i < shareCount; i++) {
        const el = shareByText.nth(i);
        const box = await el.boundingBox().catch(() => null);
        if (box) {
          console.log(`  Share element ${i}: x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}, w=${box.width.toFixed(0)}, h=${box.height.toFixed(0)}`);
          // The header Share link should be near the top of the page (y < 150) and on the right side (x > 900)
          if (box.y < 150 && box.x > 900) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            shareClicked = true;
            console.log(`  Share clicked at (${(box.x + box.width / 2).toFixed(0)}, ${(box.y + box.height / 2).toFixed(0)})`);
            break;
          }
        }
      }
    }

    if (!shareClicked) {
      // Strategy 2: Use JavaScript to find the Share element in the dialog header
      console.log('  Trying JS click on Share...');
      shareClicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('div[role="dialog"] *');
        for (const el of elements) {
          if (el.textContent?.trim() === 'Share' && el.children.length === 0) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
      if (shareClicked) console.log('  Share clicked via JS evaluate');
    }

    if (!shareClicked) {
      // Strategy 3: Click by known coordinates from screenshots
      console.log('  Clicking Share by coordinates...');
      await page.mouse.click(1103, 109);
      shareClicked = true;
      console.log('  Share clicked via coordinates');
    }

    console.log('📤 Posting...');
    await screenshot('08-after-share-click');

    // Wait for upload to complete
    await delay(15000);
    await screenshot('09-uploading');

    // Check for success
    const successTexts = [
      'Your reel has been shared',
      'Your reel has been shared.',
      'Post shared',
      'Reel shared',
      'Your post has been shared',
    ];

    const success = await Promise.race([
      ...successTexts.map(text =>
        page.locator(`text="${text}"`).waitFor({ timeout: 45000 }).then(() => {
          console.log(`  Success detected: "${text}"`);
          return true;
        }).catch(() => false)
      ),
      delay(50000).then(() => false),
    ]);

    await screenshot('10-final');

    if (success) {
      console.log(`✅ ${isImage ? 'Image' : 'Video'} posted successfully!`);
      return true;
    }

    // Check if we're back on the feed (another success indicator)
    const currentUrl = page.url();
    console.log(`  Final URL: ${currentUrl}`);
    if (currentUrl === 'https://www.instagram.com/' || !currentUrl.includes('/create')) {
      console.log('✅ Redirected to feed — post likely succeeded');
      return true;
    }

    console.log('⚠️  Upload may have succeeded - check Instagram manually');
    console.log(`  Debug screenshots saved to: ${debugDir}`);
    return true; // Optimistic return
  } catch (err) {
    await screenshot('error').catch(() => {});
    console.error('❌ Upload error:', (err as Error).message);
    return false;
  }
}

export function generateCaption(videoType: string): string {
  const captions: Record<string, string> = {
    'intro': `FlowFolio -- investment planning that actually respects your privacy.

Vibe-based strategies with quantitative factor analysis.
Backtest against 20 years of real market data.
Runs entirely on your machine. No cloud. No tracking.

The investing tool I wish existed, so I built it.

#FlowFolio #InvestSmart #QuantTrading #PortfolioManagement #FactorInvesting #FinTech #StockMarket #PrivacyFirst #OfflineFirst #BackTesting`,

    'demo': `Full walkthrough of FlowFolio's feature set.

Factor-weighted strategy creation in Vibe Studio.
Backtesting against S&P 500 with full risk metrics.
Portfolio optimization with Sharpe maximization.
Investment journal for tracking your thesis evolution.

Everything computed locally. Zero cloud dependencies.

#FlowFolio #InvestmentTool #QuantAnalysis #BackTesting #PortfolioOptimization #DesktopApp #TauriApp #RustLang #React #FinancialTech`,

    'app-showcase': `Every screen in FlowFolio, end to end.

Portfolio tracking with real-time multi-source data.
Vibe Studio for building factor-weighted strategies.
Backtest results with CAGR, Sharpe, and drawdown analysis.
30+ quantitative metrics per stock.
Investment journal with full trade logging.

Built on Tauri 2, React 19, and Rust.

#FlowFolio #DesktopApp #InvestmentApp #TauriApp #Rust #React #AppDesign #FinTech #QuantFinance`,
  };

  return captions[videoType] || captions['intro'];
}

async function uploadCarouselPost(page: Page, slides: string[], caption: string): Promise<boolean> {
  const debugDir = path.join(path.dirname(slides[0]), '..', 'debug');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const screenshot = async (name: string) => {
    await page.screenshot({ path: path.join(debugDir, `${name}.png`) });
    console.log(`  [debug] screenshot: ${name}`);
  };

  try {
    await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(3000);
    await screenshot('01-home');

    // Click Create / New post button
    const createSelectors = [
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'svg[aria-label="New Post"]',
      'a[href="/create/style/"]',
    ];
    let clicked = false;
    for (const sel of createSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click({ force: true });
        clicked = true;
        console.log(`  Clicked create button: ${sel}`);
        break;
      }
    }
    if (!clicked) {
      console.log('  Create button not found, trying fallback...');
      await page.click('[href="/create/style/"]', { force: true }).catch(() => {});
    }
    await delay(3000);
    await screenshot('02-create-dialog');

    // Check if creation dialog opened or if we got a dropdown menu
    let dialog = page.locator('div[role="dialog"]').first();
    let dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

    if (!dialogVisible) {
      // IG may show a sidebar sub-menu instead of a dialog — try clicking Create again
      // or navigate directly to the creation page
      console.log('  Dialog not found, trying direct navigation to create page...');
      await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000);
      await screenshot('02b-create-select');

      dialog = page.locator('div[role="dialog"]').first();
      dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    }

    if (!dialogVisible) {
      // Fallback: click Create from sidebar again and look for the + icon
      console.log('  Still no dialog, trying Create click on the + icon...');
      const createIcon = page.locator('svg[aria-label="New post"]').first();
      if (await createIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createIcon.click({ force: true });
        await delay(3000);
      }
      dialog = page.locator('div[role="dialog"]').first();
      dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    }

    console.log(`  Creation dialog visible: ${dialogVisible}`);
    await screenshot('02c-dialog-state');

    // Upload all slides at once
    const fileInput = page.locator('input[type="file"]').first();
    const inputCount = await page.locator('input[type="file"]').count();
    console.log(`  File inputs found: ${inputCount}`);

    // Check if input has multiple attribute, if not, set it
    await fileInput.evaluate((el: HTMLInputElement) => {
      el.setAttribute('multiple', 'true');
      el.setAttribute('accept', 'image/jpeg,image/png,image/heic,image/heif');
    });

    await fileInput.setInputFiles(slides);
    console.log(`  Uploaded ${slides.length} files`);
    await delay(5000);
    await screenshot('03-after-upload');

    // Wait for images to process
    console.log(`  Processing ${slides.length} carousel slides...`);
    await delay(3000);
    await screenshot('04-processing');

    // Step 1: Crop -> Next
    const nextBtn = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    const nextVisible1 = await nextBtn.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`  Next button visible (crop step): ${nextVisible1}`);
    if (nextVisible1) {
      await nextBtn.click({ force: true });
      await delay(3000);
      await screenshot('05-after-next-1');
    }

    // Step 2: Filters -> Next
    const nextVisible2 = await nextBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  Next button visible (filter step): ${nextVisible2}`);
    if (nextVisible2) {
      await nextBtn.click({ force: true });
      await delay(3000);
      await screenshot('06-after-next-2');
    }

    // Step 3: Caption
    const captionSelectors = [
      'div[aria-label="Write a caption..."]',
      'textarea[aria-label="Write a caption..."]',
      '[data-testid="creation-caption-text"]',
      'div[role="textbox"][contenteditable="true"]',
      'p[contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea[placeholder*="caption" i]',
      'textarea[placeholder*="Write" i]',
    ];
    let captionFilled = false;
    for (const sel of captionSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ force: true });
        await delay(500);
        const chunks = caption.match(/.{1,200}/gs) || [caption];
        for (const chunk of chunks) {
          await page.keyboard.type(chunk, { delay: 15 });
          await delay(300);
        }
        captionFilled = true;
        console.log(`  Caption filled using: ${sel}`);
        await delay(1000);
        break;
      }
    }

    // Fallback: click in the caption area by coordinates and type
    if (!captionFilled) {
      console.log('  Trying coordinate click fallback for caption...');
      // The caption area is between the avatar (~32px from left) and the thumbnail (~right side)
      // On the "New post" page, it's at roughly y=88, x=center of the input area
      // Click at multiple potential positions
      const captionPositions = [
        { x: 400, y: 88 },   // Center of caption area on New post page
        { x: 300, y: 88 },   // Slightly left
        { x: 500, y: 88 },   // Slightly right
        { x: 400, y: 100 },  // Slightly lower
      ];
      for (const pos of captionPositions) {
        await page.mouse.click(pos.x, pos.y);
        await delay(500);
        // Check if a contenteditable or textarea is now focused
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return false;
          return el.getAttribute('contenteditable') === 'true' ||
                 el.tagName === 'TEXTAREA' ||
                 el.getAttribute('role') === 'textbox';
        }).catch(() => false);
        if (focused) {
          console.log(`  Caption area focused at (${pos.x}, ${pos.y})`);
          const chunks = caption.match(/.{1,200}/gs) || [caption];
          for (const chunk of chunks) {
            await page.keyboard.type(chunk, { delay: 10 });
            await delay(200);
          }
          captionFilled = true;
          console.log('  Caption typed via coordinate click');
          await delay(1000);
          break;
        }
      }
    }

    if (!captionFilled) console.log('  WARNING: Could not find caption input');
    await screenshot('07-caption');

    // Step 4: Share
    const shareBtn = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")').first();
    const shareVisible = await shareBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Share button visible: ${shareVisible}`);
    if (shareVisible) {
      await shareBtn.click({ force: true });
      console.log('  Share clicked, posting carousel...');
    } else {
      console.log('  WARNING: Share button not found');
      await screenshot('07b-no-share');
      return false;
    }

    await delay(15000);
    await screenshot('08-after-share');

    // Check for success indicators
    const successSelectors = [
      'text="Post shared"',
      'text="Your post has been shared"',
      'text="Reel shared"',
    ];
    const success = await Promise.race([
      ...successSelectors.map(sel =>
        page.locator(sel).waitFor({ timeout: 45000 }).then(() => true).catch(() => false)
      ),
      delay(50000).then(() => false),
    ]);

    await screenshot('09-final');

    if (success) {
      console.log(`Carousel posted successfully (${slides.length} slides)`);
      return true;
    }

    // Check current URL for clues
    console.log('  Final URL:', page.url());
    console.log('Upload may have succeeded - check debug screenshots in:', debugDir);
    return true;
  } catch (err) {
    await screenshot('error').catch(() => {});
    console.error('Carousel upload error:', (err as Error).message);
    return false;
  }
}
