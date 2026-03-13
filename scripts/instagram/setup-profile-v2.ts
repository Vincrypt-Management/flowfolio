#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { launchBrowser, login, saveSession } from './auth';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.3));
}

const PROFILE_PHOTO = path.join(__dirname, '..', '..', 'src-tauri', 'icons', 'icon.png');
const username = process.env.IG_USERNAME!;

const BIO = `AI-powered investment companion.
Vibe-based strategies. Quant analysis. Backtesting.
100% offline. 100% private. 100% free.
Built with Rust + React.`;
const WEBSITE = 'https://github.com/nickvincrypt/flowfolio';
const DISPLAY_NAME = 'FlowFolio';

async function main() {
  const password = process.env.IG_PASSWORD!;
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) { console.error('Login failed'); process.exit(1); }
    await saveSession(context);

    // ====== STEP 1: Profile Photo via profile page ======
    console.log('\n=== Step 1: Profile Photo ===');
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(4000);

    // Click on the profile avatar image to trigger photo change
    try {
      const avatar = page.locator(`img[alt*="${username}"]`).first();
      if (await avatar.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Set up file chooser listener before clicking
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
        await avatar.click({ force: true });
        await delay(1000);

        // Check if a menu appeared — click "Upload Photo"
        const uploadBtn = page.locator('button:has-text("Upload Photo"), button:has-text("Upload photo")').first();
        if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          const fileChooserPromise2 = page.waitForEvent('filechooser', { timeout: 10000 });
          await uploadBtn.click({ force: true });
          const chooser = await fileChooserPromise2;
          await chooser.setFiles(PROFILE_PHOTO);
          console.log('Profile photo uploaded via dialog!');
          await delay(5000);
        } else {
          // Maybe file chooser opened directly
          try {
            const chooser = await fileChooserPromise;
            await chooser.setFiles(PROFILE_PHOTO);
            console.log('Profile photo uploaded directly!');
            await delay(5000);
          } catch {
            console.log('No file chooser triggered from avatar click');
          }
        }
      }
    } catch (err) {
      console.log('Profile photo attempt 1 failed:', (err as Error).message.slice(0, 80));
    }

    // ====== STEP 2: Edit Profile (Bio, Name, Website) ======
    console.log('\n=== Step 2: Edit Profile ===');
    
    // Click "Edit profile" button on profile page
    const editBtn = page.locator('button:has-text("Edit profile"), a:has-text("Edit profile")').first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click({ force: true });
      await delay(4000);
      console.log('Opened edit profile. URL:', page.url());
    } else {
      await page.goto('https://www.instagram.com/accounts/edit/', {
        waitUntil: 'domcontentloaded', timeout: 60000,
      });
      await delay(4000);
    }

    // Take a screenshot to see what we're working with
    await page.screenshot({ path: '/tmp/ig-edit-page.png' });
    console.log('Edit page screenshot saved to /tmp/ig-edit-page.png');

    // Try to find and fill fields on the edit page
    // The new IG edit profile page may have different input structures

    // Attempt: look for all visible input/textarea elements
    const allInputs = await page.locator('input:visible, textarea:visible').all();
    console.log(`Found ${allInputs.length} visible input/textarea elements`);
    
    for (let i = 0; i < allInputs.length; i++) {
      const el = allInputs[i];
      const tag = await el.evaluate(e => e.tagName);
      const name = await el.getAttribute('name') || '';
      const placeholder = await el.getAttribute('placeholder') || '';
      const ariaLabel = await el.getAttribute('aria-label') || '';
      const value = await el.inputValue().catch(() => '');
      console.log(`  [${i}] <${tag}> name="${name}" placeholder="${placeholder}" aria="${ariaLabel}" value="${value.slice(0, 30)}"`);
    }

    // Also check contenteditable divs
    const editables = await page.locator('div[contenteditable="true"]:visible').all();
    console.log(`Found ${editables.length} contenteditable elements`);

    // Try setting Name
    const nameSelectors = [
      'input[name="fullName"]',
      'input[aria-label="Name"]',
      'input[placeholder*="Name"]',
    ];
    for (const sel of nameSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ force: true, clickCount: 3 });
        await delay(200);
        await input.fill(DISPLAY_NAME);
        console.log('Name set via:', sel);
        break;
      }
    }

    // Try setting Bio
    const bioSelectors = [
      'textarea[name="biography"]',
      'textarea[aria-label="Bio"]', 
      'textarea[placeholder*="Bio"]',
      'textarea',
    ];
    for (const sel of bioSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ force: true });
        await delay(200);
        await input.fill(BIO);
        console.log('Bio set via:', sel);
        break;
      }
    }

    // Try setting Website
    const webSelectors = [
      'input[name="website"]',
      'input[aria-label="Website"]',
      'input[placeholder*="Website"]',
    ];
    for (const sel of webSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.click({ force: true, clickCount: 3 });
        await delay(200);
        await input.fill(WEBSITE);
        console.log('Website set via:', sel);
        break;
      }
    }

    await delay(1000);

    // Submit
    const submitSelectors = [
      'button:has-text("Submit")',
      'button:has-text("Done")',
      'button:has-text("Save")',
      'div[role="button"]:has-text("Submit")',
      'div[role="button"]:has-text("Done")',
    ];
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ force: true });
        console.log('Submitted via:', sel);
        await delay(3000);
        break;
      }
    }

    // ====== STEP 3: Profile Photo via Edit Profile page (fallback) ======
    console.log('\n=== Step 3: Profile Photo (fallback via edit page) ===');
    await page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(3000);

    try {
      // Look for "Change profile photo" text/button
      const changePhotoSelectors = [
        'text="Change profile photo"',
        'text="Change photo"',
        'button:has-text("Change")',
        'span:has-text("Change profile photo")',
        'a:has-text("Change profile photo")',
      ];

      for (const sel of changePhotoSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
          await btn.click({ force: true });
          await delay(1500);

          // If menu appears, click Upload
          const uploadOpt = page.locator('button:has-text("Upload Photo"), button:has-text("Upload photo")').first();
          if (await uploadOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
            const fc2 = page.waitForEvent('filechooser', { timeout: 10000 });
            await uploadOpt.click({ force: true });
            const chooser = await fc2;
            await chooser.setFiles(PROFILE_PHOTO);
          } else {
            const chooser = await fileChooserPromise;
            await chooser.setFiles(PROFILE_PHOTO);
          }
          console.log('Profile photo uploaded via edit page!');
          await delay(5000);
          break;
        }
      }
    } catch (err) {
      console.log('Photo fallback error:', (err as Error).message.slice(0, 80));
    }

    // Final verification
    console.log('\n=== Verifying ===');
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(4000);
    const finalScreenshot = path.join(__dirname, '..', '..', 'out', 'ig-profile-final.png');
    await page.screenshot({ path: finalScreenshot });
    console.log('Final screenshot:', finalScreenshot);
    console.log('\n=== Done ===');

  } catch (err) {
    console.error('Error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

main().catch(console.error);
