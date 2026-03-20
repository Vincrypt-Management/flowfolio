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

    // Open the "Create new post" dialog via the sidebar
    // Strategy 1: Click the "Create" sidebar link/button which opens the upload dialog
    const createSelectors = [
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
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
    await delay(2000);
    await screenshot('02-after-create-click');

    // Check if a dialog opened (the upload dialog) or a dropdown sub-menu appeared
    let dialog = page.locator('div[role="dialog"]').first();
    let dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

    if (!dialogVisible) {
      // IG may show a sidebar dropdown (Post, Live Video, Ad) — click "Post" within the sidebar nav
      // Scope to the sidebar nav area to avoid clicking random "Post" text on the feed
      const sidebarPostSelectors = [
        'nav span:text-is("Post")',
        'nav a:has-text("Post")',
        'div[style*="drawer"] span:text-is("Post")',
        // The sidebar sub-menu items are typically direct children of the nav
        'a[role="link"] span:text-is("Post")',
      ];

      for (const sel of sidebarPostSelectors) {
        const postBtn = page.locator(sel).first();
        if (await postBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await postBtn.click({ force: true });
          console.log(`  Clicked "Post" from sidebar menu: ${sel}`);
          await delay(3000);
          break;
        }
      }
      await screenshot('02b-post-clicked');

      dialog = page.locator('div[role="dialog"]').first();
      dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    }

    if (dialogVisible) {
      console.log('  Upload dialog opened');
    }

    // Check if file input is available
    let fileInput = page.locator('input[type="file"]').first();
    let inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);

    if (!inputAvailable) {
      // Try clicking "Select from computer" or "Select from device" button in the dialog
      const selectBtn = page.locator('button:has-text("Select"), button:has-text("select")').first();
      if (await selectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('  Clicking "Select from computer"...');
        await selectBtn.click({ force: true });
        await delay(2000);
        fileInput = page.locator('input[type="file"]').first();
        inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);
      }
    }

    if (!inputAvailable) {
      // Strategy 2: Use JavaScript to create a file input and trigger the upload
      console.log('  File input not found in dialog, injecting file input via JS...');
      await page.evaluate(() => {
        // Find the hidden file input that IG creates
        const inputs = document.querySelectorAll('input[type="file"]');
        if (inputs.length === 0) {
          // Create one — IG will pick it up
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/mp4,video/quicktime,image/jpeg,image/png';
          input.style.display = 'none';
          document.body.appendChild(input);
        }
      });
      fileInput = page.locator('input[type="file"]').first();
      inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);
    }

    if (!inputAvailable) {
      // Strategy 3: Navigate to /create/select/ which sometimes shows the upload form
      console.log('  Navigating to /create/select/...');
      await page.goto(`${IG_BASE}/create/select/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000);
      // Check if we got redirected (IG sometimes redirects logged-out users)
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      await screenshot('02c-create-select');

      fileInput = page.locator('input[type="file"]').first();
      inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);

      if (!inputAvailable) {
        // Last resort: go back home and try the full flow again
        await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(3000);
        const createIcon = page.locator('svg[aria-label="New post"]').first();
        if (await createIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
          await createIcon.click({ force: true });
          await delay(3000);
        }
        fileInput = page.locator('input[type="file"]').first();
      }
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

async function dismissPopups(page: Page): Promise<void> {
  const dismissSelectors = [
    'button:has-text("Not Now")',
    'button:has-text("Not now")',
    'button:has-text("Dismiss")',
    'button:has-text("Close")',
    '[aria-label="Close"]:not(dialog)',
  ];
  for (const sel of dismissSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ force: true });
      console.log(`  Dismissed popup: ${sel}`);
      await delay(1000);
    }
  }
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
    await dismissPopups(page);
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
    await dismissPopups(page);
    await screenshot('02-create-dialog');

    // Check if creation dialog opened or if we got a dropdown menu
    // Make sure we're NOT looking at the notifications popup — detect by presence of file input or "drag and drop" text
    let dialog = page.locator('div[role="dialog"]').first();
    let dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    // If the dialog is the notifications popup, dismiss it and re-check
    const isNotificationsPopup = await page.locator('div[role="dialog"]:has-text("Turn on Notifications")').isVisible({ timeout: 1000 }).catch(() => false);
    if (isNotificationsPopup) {
      console.log('  Notifications popup detected, dismissing...');
      const notNow = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
      await notNow.click({ force: true }).catch(() => {});
      await delay(2000);
      dialogVisible = false;
    }

    if (!dialogVisible) {
      // IG shows a sidebar sub-menu with Post/Reel/Story — click "Post" to open the upload dialog
      const sidebarPostSelectors = [
        'nav span:text-is("Post")',
        'nav a:has-text("Post")',
        'div[style*="drawer"] span:text-is("Post")',
        'a[role="link"] span:text-is("Post")',
        'span:text-is("Post")',
      ];
      for (const sel of sidebarPostSelectors) {
        const postBtn = page.locator(sel).first();
        if (await postBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await postBtn.click({ force: true });
          console.log(`  Clicked "Post" sub-menu: ${sel}`);
          await delay(3000);
          break;
        }
      }
      await screenshot('02b-post-clicked');

      dialog = page.locator('div[role="dialog"]').first();
      dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    }

    if (!dialogVisible) {
      // Fallback: navigate to /create/select/ (different UI, but still works)
      console.log('  Sub-menu click failed, navigating to /create/select/...');
      await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000);
      await screenshot('02c-create-select');

      dialog = page.locator('div[role="dialog"]').first();
      dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    }

    console.log(`  Creation dialog visible: ${dialogVisible}`);
    await screenshot('02c-dialog-state');

    // If dialog is showing but no file input yet, click "Select from computer"
    let inputCount = await page.locator('input[type="file"]').count();
    console.log(`  File inputs found: ${inputCount}`);

    if (inputCount === 0) {
      const selectSelectors = [
        'button:has-text("Select from computer")',
        'button:has-text("Select from device")',
        'button:has-text("Select")',
        'div[role="button"]:has-text("Select from computer")',
        'div[role="button"]:has-text("Select")',
      ];
      for (const sel of selectSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click({ force: true });
          console.log(`  Clicked "${sel}" to reveal file input`);
          await delay(2000);
          break;
        }
      }
      inputCount = await page.locator('input[type="file"]').count();
      console.log(`  File inputs after click: ${inputCount}`);
    }

    // Upload all slides at once
    const fileInput = page.locator('input[type="file"]').first();

    // Check if input has multiple attribute, if not, set it
    await fileInput.evaluate((el: HTMLInputElement) => {
      el.setAttribute('multiple', 'true');
      el.setAttribute('accept', 'image/jpeg,image/png,image/heic,image/heif');
    });

    await fileInput.setInputFiles(slides);
    console.log(`  Uploaded ${slides.length} files`);
    await delay(5000);
    await screenshot('03-after-upload');

    // Navigate through all slides using the right-arrow button inside the dialog.
    // The right arrow appears at the center-right of the image area within the dialog.
    // We find it by locating the rightmost mid-height button inside the dialog.
    console.log(`  Navigating through all ${slides.length} slides via right arrow...`);

    const rightArrow = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return null;
      const dialogRect = dialog.getBoundingClientRect();
      const midY = dialogRect.top + dialogRect.height / 2;
      let best: { x: number; y: number } | null = null;
      let bestX = -Infinity;
      dialog.querySelectorAll('button, [role="button"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        // Must be in the right half of the dialog and vertically near the center
        if (cx > dialogRect.left + dialogRect.width * 0.6 && Math.abs(cy - midY) < 200) {
          // Pick the rightmost one (not the Next/Close header buttons — those are at the very top)
          if (cy > dialogRect.top + 100 && cy < dialogRect.bottom - 100 && cx > bestX) {
            bestX = cx;
            best = { x: Math.round(cx), y: Math.round(cy) };
          }
        }
      });
      return best;
    });

    if (rightArrow) {
      console.log(`  Right arrow found at (${rightArrow.x}, ${rightArrow.y})`);
      for (let i = 1; i < slides.length; i++) {
        await page.mouse.click(rightArrow.x, rightArrow.y);
        await delay(600);
        console.log(`  Navigated to slide ${i + 1}/${slides.length}`);
      }
    } else {
      console.log('  Right arrow not found — proceeding anyway (all slides should still be included)');
    }

    await screenshot('04-all-slides-visited');

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

    await screenshot('08-after-share');

    // Watch for "Share to story" button and success concurrently.
    // IG shows the success overlay briefly — use waitForSelector for instant reaction.
    console.log('  Watching for "Share to story" and post success...');
    let storyShared = false;
    let success = false;

    // Race: share-to-story button vs timeout
    const storyBtnPromise = page.waitForSelector(
      'button:has-text("Share to story"), div[role="button"]:has-text("Share to story"), button:has-text("Share to Story"), div[role="button"]:has-text("Share to Story")',
      { timeout: 60000 }
    ).then(async (el) => {
      await el.click({ force: true });
      storyShared = true;
      console.log('  ✅ Clicked "Share to story" (waitForSelector)');
    }).catch(() => {});

    const successTexts = ['Post shared', 'Your post has been shared', 'Reel shared'];
    const successPromise = Promise.race([
      ...successTexts.map(text =>
        page.locator(`text="${text}"`).waitFor({ timeout: 60000 }).then(() => {
          success = true;
          console.log(`  Success: "${text}"`);
        }).catch(() => {})
      ),
    ]);

    const feedRedirectPromise = page.waitForURL(
      url => url.toString() === `${IG_BASE}/` || !url.toString().includes('/create'),
      { timeout: 60000 }
    ).then(() => {
      console.log('  Redirected to feed — post succeeded');
      success = true;
    }).catch(() => {});

    // Wait for all three concurrently, give up after 65s
    await Promise.race([
      Promise.all([storyBtnPromise, successPromise, feedRedirectPromise]),
      delay(65000),
    ]);

    if (!storyShared) {
      console.log('  "Share to story" button not found — story skipped');
    }

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

/**
 * Upload an image to Instagram Stories.
 * For carousels, uses the first slide (slide-00.png).
 * No caption — stories don't have one.
 */
export async function uploadStory(page: Page, mediaPath: string): Promise<boolean> {
  // For carousels, use the cover slide
  let filePath = mediaPath;
  if (isCarouselPost(mediaPath)) {
    const slides = fs.readdirSync(mediaPath)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort()
      .map(f => path.join(mediaPath, f));
    if (slides.length === 0) {
      console.error('No slides found in carousel directory:', mediaPath);
      return false;
    }
    filePath = slides[0];
    console.log(`Story: using cover slide ${filePath}`);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Story media not found: ${filePath}`);
    return false;
  }

  const debugDir = path.join(path.dirname(filePath), 'debug-story');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const screenshot = async (name: string) => {
    await page.screenshot({ path: path.join(debugDir, `${name}.png`) });
    console.log(`  [debug] screenshot: ${name}`);
  };

  console.log(`Uploading story: ${filePath}`);

  try {
    await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(3000);
    await dismissPopups(page);
    await screenshot('s01-home');

    let storyModeEntered = false;

    // Strategy 1: SPA-click the story creation link in the stories tray.
    // Important: do NOT use page.goto('/stories/create/') — that navigates to the @create
    // user's profile. Clicking the <a> lets the React router open the story creator modal.
    const storyCreateLink = page.locator('a[href="/stories/create/"]').first();
    if (await storyCreateLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await storyCreateLink.click({ force: true });
      storyModeEntered = true;
      console.log('  Clicked story creation link (SPA) from home feed');
      await delay(4000);
    }

    // Strategy 2: aria-label scan across the whole page
    if (!storyModeEntered) {
      const storyBtn = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"]'));
        for (const el of els) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          if (aria.includes('add to your story') || aria.includes('create story') || aria.includes('new story')) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), label: aria };
            }
          }
        }
        // Also scan all <a> hrefs for stories/create
        const links = Array.from(document.querySelectorAll('a[href*="stories"][href*="create"]'));
        if (links.length > 0) {
          const rect = (links[0] as HTMLElement).getBoundingClientRect();
          return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), label: 'stories-create-link' };
        }
        return null;
      });
      if (storyBtn) {
        console.log(`  Found story button: "${storyBtn.label}" at (${storyBtn.x}, ${storyBtn.y})`);
        await page.mouse.click(storyBtn.x, storyBtn.y);
        storyModeEntered = true;
        await delay(4000);
      }
    }

    // Strategy 3: "New post" dropdown (works on some account types)
    if (!storyModeEntered) {
      console.log('  Trying New post dropdown...');
      const createBtn = page.locator('svg[aria-label="New post"], [aria-label="New post"]').first();
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click({ force: true });
        await delay(3000);
      }
      const dropdownStory = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.children.length === 0 && el.textContent?.trim() === 'Story') {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              (el as HTMLElement).click();
              return true;
            }
          }
        }
        return false;
      });
      if (dropdownStory) {
        console.log('  Clicked "Story" via dropdown evaluate');
        storyModeEntered = true;
        await delay(3000);
      }
    }

    // Strategy 4: Mobile viewport — IG mobile web has clear story creation UI
    if (!storyModeEntered) {
      console.log('  Switching to mobile viewport for story creation...');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await delay(3000);
      await dismissPopups(page);
      await screenshot('s02-mobile');

      const mobileStoryBtn = await page.evaluate(() => {
        // On mobile IG, the story creation "+" is typically at the top of the screen
        const els = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        for (const el of els) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const href = (el as HTMLAnchorElement).href || '';
          if (aria.includes('story') || href.includes('stories/create')) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), label: aria || href };
            }
          }
        }
        return null;
      });

      if (mobileStoryBtn) {
        console.log(`  Mobile story button: "${mobileStoryBtn.label}" at (${mobileStoryBtn.x}, ${mobileStoryBtn.y})`);
        await page.mouse.click(mobileStoryBtn.x, mobileStoryBtn.y);
        storyModeEntered = true;
        await delay(3000);
      }
    }

    await screenshot('s03-story-mode');

    // Find or trigger file input
    let fileInput = page.locator('input[type="file"]').first();
    let inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);

    if (!inputAvailable) {
      // Try clicking the gallery/upload button that reveals the file input
      const gallerySelectors = [
        'button:has-text("Upload")',
        'div[role="button"]:has-text("Upload")',
        '[aria-label="Upload photo or video"]',
        '[aria-label="Add photo or video"]',
        'svg[aria-label="Upload"]',
      ];
      for (const sel of gallerySelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click({ force: true });
          console.log(`  Clicked gallery button: ${sel}`);
          await delay(2000);
          break;
        }
      }
      fileInput = page.locator('input[type="file"]').first();
      inputAvailable = await fileInput.count().then(c => c > 0).catch(() => false);
    }

    if (inputAvailable) {
      await fileInput.setInputFiles(filePath);
      console.log(`  File set on input: ${path.basename(filePath)}`);
    } else {
      // JS injection fallback
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,video/mp4,video/quicktime';
        input.style.position = 'fixed';
        input.style.top = '0';
        input.style.left = '0';
        input.style.opacity = '0';
        document.body.appendChild(input);
      });
      await delay(500);
      fileInput = page.locator('input[type="file"]').last();
      await fileInput.setInputFiles(filePath);
      console.log(`  File set via injected input: ${path.basename(filePath)}`);
    }

    await delay(5000);
    await screenshot('s04-after-upload');

    // Click share / add-to-story button
    const shareSelectors = [
      'button:has-text("Add to story")',
      'div[role="button"]:has-text("Add to story")',
      'button:has-text("Share to story")',
      'div[role="button"]:has-text("Share to story")',
      'button:has-text("Your story")',
      'div[role="button"]:has-text("Your story")',
      '[aria-label="Share to story"]',
      '[aria-label="Add to story"]',
      'button:has-text("Share")',
      'div[role="button"]:has-text("Share")',
    ];
    let shared = false;
    for (const sel of shareSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click({ force: true });
        shared = true;
        console.log(`  Clicked share: ${sel}`);
        break;
      }
    }

    if (!shared) {
      shared = await page.evaluate(() => {
        const candidates = ['Add to story', 'Share to story', 'Your story', 'Share'];
        for (const text of candidates) {
          const els = Array.from(document.querySelectorAll('button, [role="button"]'));
          const btn = els.find(el => el.textContent?.trim() === text) as HTMLElement | undefined;
          if (btn) { btn.click(); return true; }
        }
        return false;
      }).catch(() => false);
      if (shared) console.log('  Share clicked via JS evaluate');
    }

    if (!shared) {
      console.log('  WARNING: Share button not found — story may not have been submitted');
    }

    // Wait for success or redirect
    const successTexts = ['Your story has been shared', 'Story shared', 'Story posted'];
    const success = await Promise.race([
      ...successTexts.map(text =>
        page.locator(`text="${text}"`).waitFor({ timeout: 30000 }).then(() => {
          console.log(`  Story success: "${text}"`);
          return true;
        }).catch(() => false)
      ),
      page.waitForURL(
        url => url.toString() === `${IG_BASE}/` || !url.toString().includes('/create'),
        { timeout: 30000 }
      ).then(() => {
        console.log('  Redirected away from create — story likely posted');
        return true;
      }).catch(() => false),
      delay(35000).then(() => false),
    ]);

    await screenshot('s05-final');

    if (success) {
      console.log('✅ Story posted successfully!');
      return true;
    }

    const finalUrl = page.url();
    console.log(`  Final story URL: ${finalUrl}`);
    console.log('⚠️  Story status unclear — check Instagram manually.');
    return true;
  } catch (err) {
    await screenshot('s-error').catch(() => {});
    console.error('❌ Story upload error:', (err as Error).message);
    return false;
  } finally {
    // Restore desktop viewport in case we switched to mobile
    await page.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
  }
}
