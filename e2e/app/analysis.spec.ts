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

  test('ticker symbol area is present in header', async ({ page }) => {
    // In inline mode with no availableTickers, the left header area renders
    const headerLeft = page.locator('.ta-header-left').first();
    await expect(headerLeft).toBeVisible({ timeout: 10000 });
  });

  test('header actions area is present', async ({ page }) => {
    const headerRight = page.locator('.ta-header-right').first();
    await expect(headerRight).toBeVisible({ timeout: 10000 });
  });

  test('full-page refresh button is present', async ({ page }) => {
    const refreshBtn = page.locator('.ta-btn-icon').first();
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  });

  test('analysis state area renders after loading', async ({ page }) => {
    // With empty symbol and no API keys, the component shows .ta-error, .ta-loading, or .ta-content
    const state = page.locator('.ta-content, .ta-loading, .ta-error').first();
    await expect(state).toBeVisible({ timeout: 10000 });
  });

  test('analysis tab in inline mode has no close button', async ({ page }) => {
    const closeBtn = page.locator('.ta-btn-close');
    const count = await closeBtn.count();
    expect(count).toBe(0);
  });

  test('price $180.00 from fixture appears in analysis header', async ({ page }) => {
    // get_detailed_ticker_analysis fixture: currentPrice: 180.0
    // Component renders `data.currentPrice` in .ta-price inside .ta-header
    // The symbol prop starts empty, so .ta-symbol is blank, but the price renders.
    await expect(page.locator('.ta-header').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ta-header')).toContainText('$180.00');
  });

  test('ta-price element shows formatted price from fixture', async ({ page }) => {
    // get_detailed_ticker_analysis fixture: currentPrice: 180.0
    const priceEl = page.locator('.ta-price').first();
    await expect(priceEl).toBeVisible({ timeout: 10000 });
    await expect(priceEl).toContainText('180');
  });

  test('ta-content renders data from fixture mock', async ({ page }) => {
    // get_detailed_ticker_analysis fixture returns partial data so .ta-content shows summary
    const content = page.locator('.ta-content').first();
    await expect(content).toBeVisible({ timeout: 10000 });
    // The content should be non-empty when fixture data is available
    const text = await content.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
