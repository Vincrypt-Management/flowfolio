import { test, expect } from './fixtures';

test.describe('Yearly Review tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const reviewBtn = page.locator('aside .nav-item', { hasText: 'Yearly Review' });
    await reviewBtn.click();
    await expect(reviewBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Yearly Review page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'Yearly Review' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('annual strategy');
  });

  test('yearly review component mounts', async ({ page }) => {
    const main = page.locator('main#main-content');
    await expect(main).not.toBeEmpty({ timeout: 10000 });
  });

  test('review component root or section renders', async ({ page }) => {
    const reviewContent = page.locator('.yearly-review, [class*="review"], .animate-fade-in').first();
    await expect(reviewContent).toBeVisible({ timeout: 10000 });
  });

  test('Generate Review button is present', async ({ page }) => {
    const generateBtn = page.locator('button', { hasText: /generate.*review/i }).first();
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
  });

  test('review header with Generate Review button is visible', async ({ page }) => {
    const reviewHeader = page.locator('.review-header').first();
    await expect(reviewHeader).toBeVisible({ timeout: 10000 });
    const generateBtn = page.locator('button', { hasText: /generate review/i }).first();
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('page header renders with correct content', async ({ page }) => {
    const header = page.locator('header.page-header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
    await expect(header.locator('h1')).toContainText('Yearly Review');
  });
});
