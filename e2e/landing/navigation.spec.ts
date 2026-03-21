import { test, expect } from '@playwright/test';

test.describe('Landing page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flowfolio/landing.html');
  });

  test('landing page loads and shows hero section', async ({ page }) => {
    await expect(page).toHaveTitle(/Flowfolio/i);
    const hero = page.locator('.landing-hero');
    await expect(hero).toBeVisible();
    await expect(hero.locator('h1')).toContainText('Privacy-First Portfolio');
  });

  test('navbar is visible with navigation links', async ({ page }) => {
    const navbar = page.locator('nav.landing-navbar');
    await expect(navbar).toBeVisible();

    await expect(navbar.locator('a', { hasText: 'Features' })).toBeVisible();
    await expect(navbar.locator('a', { hasText: 'Download' })).toBeVisible();
    await expect(navbar.locator('a', { hasText: 'GitHub' })).toBeVisible();
  });

  test('feature grid section exists', async ({ page }) => {
    const featuresSection = page.locator('section.landing-features');
    await expect(featuresSection).toBeVisible();
    // Should contain at least one feature card
    await expect(featuresSection.locator('.landing-features-grid').first()).toBeVisible();
  });

  test('download section exists', async ({ page }) => {
    const downloadSection = page.locator('section#download');
    await expect(downloadSection).toBeVisible();
    await expect(downloadSection.locator('h2')).toContainText('Download');
  });

  test('footer is visible', async ({ page }) => {
    const footer = page.locator('footer.landing-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Flowfolio');
  });
});
