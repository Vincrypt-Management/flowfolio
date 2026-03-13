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

async function main() {
  const username = process.env.IG_USERNAME!;
  const password = process.env.IG_PASSWORD!;
  const { browser, context, page } = await launchBrowser();

  try {
    const loggedIn = await login(page, username, password);
    if (!loggedIn) { console.error('Login failed'); process.exit(1); }
    await saveSession(context);

    await page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(5000);

    // Debug: find the exact text of all buttons on the page
    const buttons = await page.locator('button, div[role="button"], a[role="button"]').all();
    console.log(`Found ${buttons.length} buttons/links on edit page:`);
    for (let i = 0; i < Math.min(buttons.length, 20); i++) {
      const text = await buttons[i].textContent().catch(() => '');
      const ariaLabel = await buttons[i].getAttribute('aria-label').catch(() => '');
      if (text?.trim() || ariaLabel) {
        console.log(`  [${i}] text="${text?.trim().slice(0, 50)}" aria="${ariaLabel}"`);
      }
    }

    // Now try every approach to find the Change photo button
    // From the screenshot, it's a blue button saying "Change photo"
    const photoSelectors = [
      'button:text-is("Change photo")',
      'div:text-is("Change photo")',
      'span:text-is("Change photo")',
      'button:has-text("Change")',
      'div[role="button"]:has-text("Change")',
      // Try by the blue color / position near avatar
      'button >> text=Change',
      'button >> text=photo',
    ];

    for (const sel of photoSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`\nFound photo button with: ${sel}`);
          
          // Try clicking with filechooser
          try {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }),
              el.click({ force: true }),
            ]);
            await fileChooser.setFiles(PROFILE_PHOTO);
            console.log('Photo uploaded via filechooser!');
            await delay(5000);
            break;
          } catch {
            console.log('No direct filechooser, checking for dialog...');
            await delay(2000);

            // Check if a dialog/menu appeared
            const uploadOption = page.locator('button:has-text("Upload"), text="Upload Photo", text="Upload photo"').first();
            if (await uploadOption.isVisible({ timeout: 3000 }).catch(() => false)) {
              const [fc] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 10000 }),
                uploadOption.click({ force: true }),
              ]);
              await fc.setFiles(PROFILE_PHOTO);
              console.log('Photo uploaded via upload dialog!');
              await delay(5000);
              break;
            }

            // Try hidden file input
            const fileInput = page.locator('input[type="file"][accept*="image"]').first();
            if (await fileInput.count() > 0) {
              await fileInput.setInputFiles(PROFILE_PHOTO);
              console.log('Photo set via hidden file input!');
              await delay(5000);
              break;
            }
          }
        }
      } catch (err) {
        // continue
      }
    }

    // Also try: just find any file input on the page
    const anyFileInput = page.locator('input[type="file"]');
    const inputCount = await anyFileInput.count();
    console.log(`\nFile inputs on page: ${inputCount}`);
    if (inputCount > 0) {
      for (let i = 0; i < inputCount; i++) {
        const accept = await anyFileInput.nth(i).getAttribute('accept') || 'none';
        console.log(`  Input ${i}: accept="${accept}"`);
      }
      // Set on the first one that accepts images
      for (let i = 0; i < inputCount; i++) {
        const accept = await anyFileInput.nth(i).getAttribute('accept') || '';
        if (accept.includes('image') || accept === '' || accept === '*') {
          await anyFileInput.nth(i).setInputFiles(PROFILE_PHOTO);
          console.log(`Photo set on file input ${i}!`);
          await delay(5000);
          break;
        }
      }
    }

    // Verify
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await delay(4000);
    const ss = path.join(__dirname, '..', '..', 'out', 'ig-profile-photo-check.png');
    await page.screenshot({ path: ss });
    console.log('\nScreenshot:', ss);

  } catch (err) {
    console.error('Error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

main().catch(console.error);
