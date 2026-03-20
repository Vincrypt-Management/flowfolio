import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { launchBrowser, login, saveSession } from './auth.ts';

const SLIDES = [
  path.join(__dirname, '..', '..', 'out/scheduled/carousel-1786850429/slide-00.png'),
  path.join(__dirname, '..', '..', 'out/scheduled/carousel-1786850429/slide-01.png'),
  path.join(__dirname, '..', '..', 'out/scheduled/carousel-1786850429/slide-02.png'),
];

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { browser, context, page } = await launchBrowser();
  await login(page, process.env.IG_USERNAME!, process.env.IG_PASSWORD!);
  await saveSession(context);

  await page.goto('https://www.instagram.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(3000);

  // Dismiss popups
  const notNow = page.locator('button:has-text("Not Now")').first();
  if (await notNow.isVisible({ timeout: 2000 }).catch(() => false)) await notNow.click({ force: true });
  await delay(1000);

  // Click New post → Post sub-menu (dialog path)
  await page.locator('svg[aria-label="New post"]').first().click({ force: true });
  await delay(2000);
  // Dismiss notifications if needed
  const notNow2 = page.locator('button:has-text("Not Now")').first();
  if (await notNow2.isVisible({ timeout: 2000 }).catch(() => false)) await notNow2.click({ force: true });
  await delay(500);
  // Click Post from sub-menu
  for (const sel of ['nav span:text-is("Post")', 'a[role="link"] span:text-is("Post")', 'span:text-is("Post")']) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ force: true });
      console.log('Clicked Post sub-menu:', sel);
      break;
    }
  }
  await delay(3000);

  // Upload slides
  const fi = page.locator('input[type="file"]').first();
  await fi.evaluate((el: HTMLInputElement) => {
    el.setAttribute('multiple', 'true');
    el.setAttribute('accept', 'image/jpeg,image/png');
  });
  await fi.setInputFiles(SLIDES);
  await delay(5000);

  await page.screenshot({ path: '/tmp/dlg-crop-01.png' });

  // Dump all interactive elements INSIDE the dialog
  const dialogElements = await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return { error: 'no dialog found', all: [] };
    const results: any[] = [];
    dialog.querySelectorAll('button, [role="button"], [tabindex]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      results.push({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        tabindex: el.getAttribute('tabindex'),
        text: (el as HTMLElement).innerText?.slice(0, 50),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    });
    return { error: null, all: results };
  });

  console.log('=== DIALOG ELEMENTS ===');
  console.log(JSON.stringify(dialogElements, null, 2));

  // Hover over right side of image and dump again
  await page.mouse.move(480, 230);
  await delay(1000);
  await page.screenshot({ path: '/tmp/dlg-crop-02-hover.png' });

  const afterHover = await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return [];
    const results: any[] = [];
    dialog.querySelectorAll('button, [role="button"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      results.push({
        ariaLabel: el.getAttribute('aria-label'),
        text: (el as HTMLElement).innerText?.slice(0, 50),
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    });
    return results;
  });

  console.log('\n=== DIALOG ELEMENTS AFTER HOVER ===');
  console.log(JSON.stringify(afterHover, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
