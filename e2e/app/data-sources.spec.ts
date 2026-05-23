import { test, expect } from './fixtures';

test.describe('Data Sources tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const dataBtn = page.locator('aside .nav-item', { hasText: 'Data Sources' });
    await dataBtn.click();
    await expect(dataBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Data Sources page mounts and shows content', async ({ page }) => {
    const main = page.locator('main#main-content');
    await expect(main).not.toBeEmpty({ timeout: 10000 });
  });

  test('Data Sources page renders without crash', async ({ page }) => {
    const errorBoundary = page.locator('.error-boundary, .tab-error-boundary');
    const count = await errorBoundary.count();
    expect(count).toBe(0);
  });

  test('Data Sources section or heading is visible', async ({ page }) => {
    const heading = page.locator('h1, h2', { hasText: /data source/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('provider cards or list is present', async ({ page }) => {
    const providerSection = page.locator('[class*="provider"], [class*="source"], .card').first();
    await expect(providerSection).toBeVisible({ timeout: 10000 });
  });

  test('cache stats are visible', async ({ page }) => {
    const statsSection = page.locator('[class*="cache"], [class*="stat"]').first();
    await expect(statsSection).toBeVisible({ timeout: 10000 });
  });
});
