import { test, expect } from '@playwright/test';

test.describe('Landing page download section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flowfolio/landing.html');
  });

  test('download buttons exist for Windows, macOS, and Linux', async ({ page }) => {
    const downloadSection = page.locator('section#download');

    await expect(downloadSection.locator('.landing-platform-btn', { hasText: 'Windows' })).toBeVisible();
    await expect(downloadSection.locator('.landing-platform-btn', { hasText: 'macOS' })).toBeVisible();
    await expect(downloadSection.locator('.landing-platform-btn', { hasText: 'Linux' })).toBeVisible();
  });

  test('download buttons have valid href attributes', async ({ page }) => {
    const downloadSection = page.locator('section#download');
    const buttons = downloadSection.locator('.landing-platform-btn');

    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const href = await buttons.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^https?:\/\//);
    }
  });
});
