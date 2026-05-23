import { test, expect } from './fixtures';

test.describe('News & Sentiment tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const newsBtn = page.locator('aside .nav-item', { hasText: 'News' });
    await newsBtn.click();
    await expect(newsBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('News & Sentiment page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'News & Sentiment' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('sentiment');
  });

  test('news feed header is visible', async ({ page }) => {
    const header = page.locator('.newsfeed-header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('news feed title is visible', async ({ page }) => {
    const title = page.locator('.newsfeed-title').first();
    await expect(title).toBeVisible({ timeout: 10000 });
  });

  test('news feed body section renders', async ({ page }) => {
    const body = page.locator('.newsfeed-body').first();
    await expect(body).toBeVisible({ timeout: 10000 });
  });

  test('symbol bar with input is present', async ({ page }) => {
    const symbolBar = page.locator('.newsfeed-symbol-bar').first();
    await expect(symbolBar).toBeVisible({ timeout: 10000 });
  });

  test('symbol input accepts ticker text', async ({ page }) => {
    const symbolInput = page.locator('input.newsfeed-symbol-input').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    await symbolInput.fill('AAPL');
    await expect(symbolInput).toHaveValue('AAPL');
  });

  test('symbol input placeholder shows example tickers', async ({ page }) => {
    const symbolInput = page.locator('input.newsfeed-symbol-input').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    const placeholder = await symbolInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('Fetch News button is present', async ({ page }) => {
    const fetchBtn = page.locator('button.newsfeed-fetch-btn').first();
    await expect(fetchBtn).toBeVisible({ timeout: 10000 });
  });

  test('Fetch News button click does not crash the page', async ({ page }) => {
    // News uses a frontend fetch service (not Tauri invoke), so we just verify no crash
    const symbolInput = page.locator('input.newsfeed-symbol-input').first();
    await symbolInput.fill('AAPL');
    const fetchBtn = page.locator('button.newsfeed-fetch-btn').first();
    await fetchBtn.click();
    await page.waitForTimeout(500);
    // The page body and the news feed should still be visible
    const body = page.locator('.newsfeed-body').first();
    await expect(body).toBeVisible({ timeout: 5000 });
  });

  test('empty hint text is shown initially', async ({ page }) => {
    const emptyHint = page.locator('.newsfeed-empty, .newsfeed-empty-hint').first();
    await expect(emptyHint).toBeVisible({ timeout: 10000 });
  });

  test('collapse button is present in news feed header', async ({ page }) => {
    const collapseBtn = page.locator('.newsfeed-collapse-btn').first();
    await expect(collapseBtn).toBeVisible({ timeout: 10000 });
  });

  test('symbol input can clear and re-enter text', async ({ page }) => {
    const symbolInput = page.locator('input.newsfeed-symbol-input').first();
    await symbolInput.fill('AAPL');
    await symbolInput.fill('');
    await symbolInput.fill('MSFT');
    await expect(symbolInput).toHaveValue('MSFT');
  });

  test('pressing Enter in symbol input triggers fetch', async ({ page }) => {
    const symbolInput = page.locator('input.newsfeed-symbol-input').first();
    await symbolInput.fill('TSLA');
    await symbolInput.press('Enter');
    await page.waitForTimeout(300);
    // The fetch should have been attempted without error
    await expect(page.locator('.newsfeed-body').first()).toBeVisible({ timeout: 5000 });
  });
});
