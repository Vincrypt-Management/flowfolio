#!/usr/bin/env npx tsx
/**
 * Set up FlowFolio Instagram account profile:
 * - Profile photo
 * - Bio
 * - Website
 * - Name
 */
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

const PROFILE = {
  name: 'FlowFolio',
  bio: `AI-powered investment companion.\nVibe-based strategies. Quant analysis. Backtesting.\n100% offline. 100% private. 100% free.\nBuilt with Rust + React.`,
  website: 'https://github.com/nickvincrypt/flowfolio',
};

async function main() {
  const username = process.env.IG_USERNAME!;
  const password = process.env.IG_PASSWORD!;

  if (!username || !password) {
    console.error('Missing IG_USERNAME or IG_PASSWORD in .env');
    process.exit(1);
  }

  console.log('=== FlowFolio Instagram Profile Setup ===');
  console.log('Name:', PROFILE.name);
  console.log('Bio:', PROFILE.bio.replace(/\n/g, ' | '));
  console.log('Website:', PROFILE.website);
  console.log('Photo:', PROFILE_PHOTO);
  console.log('');

  const { browser, context, page } = await launchBrowser();

  try {
    // Login
    const loggedIn = await login(page, username, password);
    if (!loggedIn) {
      console.error('Login failed');
      process.exit(1);
    }
    await saveSession(context);

    // Navigate to edit profile page
    console.log('\n--- Navigating to Edit Profile ---');
    await page.goto(`https://www.instagram.com/accounts/edit/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(4000);

    // Instagram may redirect to the new /accounts/edit/ or /settings/ flow
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // --- Profile Photo ---
    console.log('\n--- Setting Profile Photo ---');
    try {
      // Look for the profile photo / avatar area and click it
      const avatarSelectors = [
        'img[alt*="profile"]',
        'button:has-text("Change profile photo")',
        '[aria-label="Change profile photo"]',
        'div[role="button"] img[draggable="false"]',
        'img[data-testid="user-avatar"]',
        // New IG settings layout
        'button:has-text("Change photo")',
        'span:has-text("Change photo")',
      ];

      let avatarClicked = false;
      for (const sel of avatarSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click({ force: true });
          avatarClicked = true;
          console.log('Clicked avatar with selector:', sel);
          break;
        }
      }

      if (!avatarClicked) {
        // Try clicking the profile image directly
        const profileImg = page.locator('header img, form img, [role="img"]').first();
        if (await profileImg.isVisible({ timeout: 3000 }).catch(() => false)) {
          await profileImg.click({ force: true });
          avatarClicked = true;
          console.log('Clicked profile image element');
        }
      }

      if (avatarClicked) {
        await delay(2000);

        // Look for "Upload Photo" option in the dialog
        const uploadSelectors = [
          'button:has-text("Upload Photo")',
          'button:has-text("Upload photo")',
          'text="Upload Photo"',
          'text="Upload photo"',
        ];

        let uploadClicked = false;
        for (const sel of uploadSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Set up file chooser handler before clicking
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }),
              btn.click({ force: true }),
            ]);
            await fileChooser.setFiles(PROFILE_PHOTO);
            uploadClicked = true;
            console.log('Profile photo uploaded!');
            break;
          }
        }

        if (!uploadClicked) {
          // Try direct file input
          const fileInput = page.locator('input[type="file"]').first();
          if (await fileInput.count() > 0) {
            await fileInput.setInputFiles(PROFILE_PHOTO);
            console.log('Profile photo set via file input');
          } else {
            console.log('Could not find upload mechanism for profile photo');
          }
        }

        await delay(3000);
      } else {
        console.log('Could not find avatar click target');
      }
    } catch (err) {
      console.log('Profile photo error (non-fatal):', (err as Error).message.slice(0, 100));
    }

    // --- Bio, Name, Website ---
    console.log('\n--- Setting Bio, Name & Website ---');

    // Instagram has two possible edit flows:
    // 1. Old: /accounts/edit/ with form fields
    // 2. New: /accounts/edit/ with a different layout

    // Try the form-based approach first
    try {
      // Name field
      const nameInput = page.locator('input[name="fullName"], input[id="pepName"], input[placeholder*="Name"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.click({ force: true, clickCount: 3 });
        await delay(200);
        await page.keyboard.type(PROFILE.name, { delay: 30 });
        console.log('Name set:', PROFILE.name);
      }
      await delay(1000);

      // Website field
      const websiteInput = page.locator('input[name="website"], input[id="pepWebsite"], input[placeholder*="Website"]').first();
      if (await websiteInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await websiteInput.click({ force: true, clickCount: 3 });
        await delay(200);
        await page.keyboard.type(PROFILE.website, { delay: 20 });
        console.log('Website set:', PROFILE.website);
      }
      await delay(1000);

      // Bio field
      const bioInput = page.locator('textarea[name="biography"], textarea[id="pepBio"], textarea[placeholder*="Bio"]').first();
      if (await bioInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bioInput.click({ force: true, clickCount: 3 });
        await delay(200);
        await bioInput.fill('');
        await delay(200);
        await page.keyboard.type(PROFILE.bio, { delay: 15 });
        console.log('Bio set');
      }
      await delay(1000);

      // Submit the form
      const submitBtn = page.locator('button:has-text("Submit"), button[type="submit"], div[role="button"]:has-text("Submit")').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click({ force: true });
        console.log('Form submitted');
        await delay(3000);
      }
    } catch (err) {
      console.log('Form-based edit error:', (err as Error).message.slice(0, 100));
    }

    // If the new IG settings layout, try navigating to individual edit sections
    if (page.url().includes('accounts/edit') || page.url().includes('settings')) {
      console.log('\n--- Trying new IG edit layout ---');
      try {
        // Click "Edit profile" if we're on the settings page
        const editProfileBtn = page.locator('a:has-text("Edit profile"), button:has-text("Edit profile")').first();
        if (await editProfileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await editProfileBtn.click({ force: true });
          await delay(3000);
        }

        // Look for editable fields in the new layout
        // Bio field (contenteditable or textarea)
        const bioField = page.locator('textarea, div[contenteditable="true"]').first();
        if (await bioField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await bioField.click({ force: true });
          await delay(200);
          // Select all and replace
          await page.keyboard.press('Meta+a');
          await delay(100);
          await page.keyboard.type(PROFILE.bio, { delay: 15 });
          console.log('Bio updated via new layout');
        }

        await delay(2000);

        // Look for Done/Save button
        const saveSelectors = [
          'button:has-text("Done")',
          'button:has-text("Save")',
          'div[role="button"]:has-text("Done")',
          'div[role="button"]:has-text("Save")',
        ];
        for (const sel of saveSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click({ force: true });
            console.log('Saved via:', sel);
            break;
          }
        }
      } catch (err) {
        console.log('New layout edit error:', (err as Error).message.slice(0, 100));
      }
    }

    // --- Set external link (Links section in new IG) ---
    console.log('\n--- Setting External Link ---');
    try {
      await page.goto('https://www.instagram.com/accounts/edit/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await delay(3000);

      // Look for Links section
      const linksBtn = page.locator('button:has-text("Links"), a:has-text("Links"), span:has-text("Links")').first();
      if (await linksBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await linksBtn.click({ force: true });
        await delay(2000);

        // Add external link
        const addLinkBtn = page.locator('button:has-text("Add external link"), button:has-text("Add link")').first();
        if (await addLinkBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addLinkBtn.click({ force: true });
          await delay(2000);

          // URL input
          const urlInput = page.locator('input[placeholder*="URL"], input[name="url"]').first();
          if (await urlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await urlInput.fill(PROFILE.website);
            await delay(500);
          }

          // Title input
          const titleInput = page.locator('input[placeholder*="Title"], input[name="title"]').first();
          if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await titleInput.fill('Download FlowFolio');
            await delay(500);
          }

          // Submit link
          const submitLink = page.locator('button:has-text("Submit"), button:has-text("Done")').first();
          if (await submitLink.isVisible({ timeout: 3000 }).catch(() => false)) {
            await submitLink.click({ force: true });
            console.log('External link added:', PROFILE.website);
          }
        }
      }
    } catch (err) {
      console.log('Link setup error (non-fatal):', (err as Error).message.slice(0, 100));
    }

    await delay(2000);

    // Final: Take a screenshot for verification
    console.log('\n--- Verifying profile ---');
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(4000);
    
    const screenshotPath = path.join(__dirname, '..', '..', 'out', 'ig-profile-setup.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Screenshot saved:', screenshotPath);

    console.log('\n=== Profile Setup Complete ===');
  } catch (err) {
    console.error('Setup error:', (err as Error).message);
  } finally {
    await saveSession(context);
    await browser.close();
  }
}

main().catch(console.error);
