import { test, expect } from './fixtures';

test.describe('Dashboard tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('dashboard nav item is active by default', async ({ page }) => {
    // The dashboard nav item should carry aria-current="page" on initial load
    const dashboardBtn = page.locator('aside .nav-item', { hasText: 'Dashboard' });
    await expect(dashboardBtn).toBeVisible();
    await expect(dashboardBtn).toHaveAttribute('aria-current', 'page');
  });

  test('dashboard main content area renders', async ({ page }) => {
    // The main content region should be present and non-empty
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 10000 });
    await expect(main).not.toBeEmpty();
  });

  test('dashboard component mounts with its root element', async ({ page }) => {
    // Dashboard renders a div.dashboard as its root
    const dashboard = page.locator('.dashboard').first();
    await expect(dashboard).toBeVisible({ timeout: 10000 });
  });

  test('market overview section is present', async ({ page }) => {
    // Dashboard renders summary cards and a page header
    const pageHeader = page.locator('.page-header').first();
    await expect(pageHeader).toBeVisible({ timeout: 10000 });

    // Summary cards section contains portfolio value and market data
    const summaryCards = page.locator('.dashboard-summary-cards').first();
    await expect(summaryCards).toBeVisible({ timeout: 10000 });
  });
});
