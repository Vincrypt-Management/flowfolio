import { test, expect } from './fixtures';

test.describe('App smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads without crash', async ({ page }) => {
    // The app shell should mount — no fatal error boundary shown
    await expect(page.locator('body')).toBeVisible();
    // Error boundary should not be visible (count=0 handles element not existing)
    await expect(page.locator('.error-boundary')).toHaveCount(0);
    // Root div rendered
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('sidebar navigation renders', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    // Navigation landmark present
    await expect(sidebar.locator('[role="menubar"]')).toBeVisible();
  });

  test('dashboard tab is the default view', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // The dashboard nav item should carry the active class
    const dashboardBtn = sidebar.locator('[role="menuitem"][aria-current="page"]').first();
    await expect(dashboardBtn).toBeVisible();
  });

  test('can navigate to Vibe Studio tab', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });

    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await expect(vibeStudioBtn).toBeVisible();
    await vibeStudioBtn.click();

    await expect(vibeStudioBtn).toHaveAttribute('aria-current', 'page');
  });

  test('can navigate to Portfolio tab', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });

    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await expect(portfolioBtn).toBeVisible();
    await portfolioBtn.click();

    await expect(portfolioBtn).toHaveAttribute('aria-current', 'page');
  });

  test('can navigate to Journal tab', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });

    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await expect(journalBtn).toBeVisible();
    await journalBtn.click();

    await expect(journalBtn).toHaveAttribute('aria-current', 'page');
  });
});
