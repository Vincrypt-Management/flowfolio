import { test, expect } from './fixtures';

test.describe('Ticker Analysis tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const analysisBtn = page.locator('aside .nav-item', { hasText: 'Analysis' });
    await analysisBtn.click();
    await expect(analysisBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Ticker Analysis page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'Ticker Analysis' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('Deep-dive');
  });

  test('TickerAnalysis component header renders', async ({ page }) => {
    const header = page.locator('.ta-header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('ticker select dropdown is present', async ({ page }) => {
    // The ticker select has class ta-ticker-select
    const tickerSelect = page.locator('.ta-ticker-select').first();
    await expect(tickerSelect).toBeVisible({ timeout: 10000 });
  });

  test('ticker select has options', async ({ page }) => {
    const tickerSelect = page.locator('.ta-ticker-select').first();
    await expect(tickerSelect).toBeVisible({ timeout: 10000 });
    // The select should have at least one option
    const optionCount = await tickerSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('right side header actions are present', async ({ page }) => {
    const headerRight = page.locator('.ta-header-right').first();
    await expect(headerRight).toBeVisible({ timeout: 10000 });
  });

  test('full-page refresh button is present', async ({ page }) => {
    const refreshBtn = page.locator('.ta-btn-icon').first();
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  });

  test('analysis content area or loading state renders', async ({ page }) => {
    // Either the content area or loading state should be visible after navigation
    const content = page.locator('.ta-content, .ta-loading').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('analysis tab in inline mode has no close button', async ({ page }) => {
    const closeBtn = page.locator('.ta-btn-close');
    const count = await closeBtn.count();
    expect(count).toBe(0);
  });
});
