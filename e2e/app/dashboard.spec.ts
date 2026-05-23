import { test, expect } from './fixtures';

test.describe('Dashboard tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('dashboard nav item is active by default', async ({ page }) => {
    const dashboardBtn = page.locator('aside .nav-item', { hasText: 'Dashboard' });
    await expect(dashboardBtn).toBeVisible();
    await expect(dashboardBtn).toHaveAttribute('aria-current', 'page');
  });

  test('dashboard main content area renders', async ({ page }) => {
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 10000 });
    await expect(main).not.toBeEmpty();
  });

  test('dashboard component mounts with its root element', async ({ page }) => {
    const dashboard = page.locator('.dashboard').first();
    await expect(dashboard).toBeVisible({ timeout: 10000 });
  });

  test('dashboard page header is visible', async ({ page }) => {
    const pageHeader = page.locator('.page-header').first();
    await expect(pageHeader).toBeVisible({ timeout: 10000 });
  });

  test('dashboard summary cards section is present', async ({ page }) => {
    const summaryCards = page.locator('.dashboard-summary-cards').first();
    await expect(summaryCards).toBeVisible({ timeout: 10000 });
  });

  test('command palette navigates to Dashboard', async ({ page }) => {
    const vibeBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await vibeBtn.click();
    await expect(vibeBtn).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.type('dashboard');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    const dashBtn = page.locator('aside .nav-item', { hasText: 'Dashboard' });
    await expect(dashBtn).toHaveAttribute('aria-current', 'page', { timeout: 5000 });
  });
});
