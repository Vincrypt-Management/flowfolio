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

// Bio: 150 char limit — every character counts
const BIO = `AI-powered investing companion\nVibe strategies \u00B7 Quant analysis \u00B7 Backtesting\n100% offline \u00B7 100% private \u00B7 100% free\nOpen source \u2022 Built with Rust`;

async function main() {
  const password = process.env.IG_PASSWORD!;
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) { console.error('Login failed'); process.exit(1); }
    await saveSession(context);

    // Go to Edit Profile page
    await page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(4000);

    // ====== PROFILE PHOTO ======
    console.log('=== Setting Profile Photo ===');
    const changePhotoBtn = page.locator('button:has-text("Change photo")').first();
    if (await changePhotoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set up file chooser before clicking
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        changePhotoBtn.click({ force: true }),
      ]);
      await fileChooser.setFiles(PROFILE_PHOTO);
      console.log('Profile photo uploaded!');
      await delay(5000);
    } else {
      console.log('"Change photo" button not found');
    }

    // ====== BIO ======
    console.log('\n=== Setting Bio ===');
    const bioField = page.locator('textarea[placeholder="Bio"]').first();
    if (await bioField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bioField.click({ force: true });
      await delay(200);
      // Clear existing bio
      await bioField.fill('');
      await delay(200);
      await bioField.fill(BIO);
      console.log('Bio set (' + BIO.length + ' chars)');
      console.log('Bio:', BIO.replace(/\n/g, ' | '));
    } else {
      console.log('Bio field not found');
    }

    await delay(1000);

    // ====== SUBMIT ======
    console.log('\n=== Submitting ===');
    // Scroll down to find the submit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1000);

    const submitBtn = page.locator('button:has-text("Submit"), div[role="button"]:has-text("Submit")').first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click({ force: true });
      console.log('Form submitted!');
      await delay(4000);
    } else {
      console.log('Submit button not found, trying keyboard submit');
      await page.keyboard.press('Enter');
      await delay(3000);
    }

    // ====== VERIFY ======
    console.log('\n=== Verifying ===');
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(4000);
    const screenshotPath = path.join(__dirname, '..', '..', 'out', 'ig-profile-final.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot:', screenshotPath);
    console.log('\nDone!');

  } catch (err) {
    console.error('Error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

main().catch(console.error);
