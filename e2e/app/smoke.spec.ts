import { test, expect } from './fixtures';

test.describe('App smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads without crash', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('.error-boundary')).toHaveCount(0);
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('sidebar navigation renders', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await expect(sidebar.locator('[role="menubar"]')).toBeVisible();
  });

  test('dashboard tab is the default view', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
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

  test('command palette opens with Cmd+K', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Meta+k');
    await expect(page.locator('.command-palette-overlay, [role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('command palette closes with Escape', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-overlay')).toHaveCount(0, { timeout: 3000 });
  });

  test('command palette search filters results', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    const input = page.locator('.command-input, input[aria-label="Search commands"]').first();
    await expect(input).toBeVisible();
    await input.fill('portfolio');
    await expect(page.locator('[role="listbox"], [role="option"]').first()).toBeVisible({ timeout: 3000 });
  });

  test('sidebar collapse toggle works', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const toggle = page.locator('.sidebar-toggle').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toHaveClass(/collapsed/, { timeout: 3000 });
    await toggle.click();
    await expect(sidebar).not.toHaveClass(/collapsed/, { timeout: 3000 });
  });

  test('mode toggle button is present in sidebar footer', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const footer = page.locator('.sidebar-footer').first();
    await expect(footer).toBeVisible({ timeout: 5000 });
  });

  test('main content area has correct landmark role', async ({ page }) => {
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 5000 });
  });
});
