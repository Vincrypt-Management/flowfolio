import { test, expect } from './fixtures';

test.describe('Watchlist tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const watchlistBtn = page.locator('aside .nav-item', { hasText: 'Watchlist' });
    await watchlistBtn.click();
    await expect(watchlistBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
    // The create form is hidden by default; toggle it via the "New Watchlist" button
    const newWatchlistBtn = page.locator('.page-header-actions .btn-primary').first();
    if (await newWatchlistBtn.isVisible()) {
      await newWatchlistBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('Watchlist root element renders', async ({ page }) => {
    const root = page.locator('.watchlist-tab').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('Watchlist page header is visible', async ({ page }) => {
    const header = page.locator('header.page-header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('Watchlist page title contains Watchlist', async ({ page }) => {
    const title = page.locator('h1.page-title').first();
    await expect(title).toBeVisible({ timeout: 10000 });
    await expect(title).toContainText('Watchlist');
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
  });

  test('Create New Watchlist card is present', async ({ page }) => {
    const card = page.locator('.card.watchlist-create-form').first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('watchlist Name input is present', async ({ page }) => {
    const label = page.locator('.form-label', { hasText: 'Name' }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
    const nameInput = page.locator('input.form-input').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test('Name input accepts text', async ({ page }) => {
    const nameInput = page.locator('input.form-input').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('My Tech Watchlist');
    await expect(nameInput).toHaveValue('My Tech Watchlist');
  });

  test('Description input is present', async ({ page }) => {
    const label = page.locator('.form-label', { hasText: 'Description' }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  test('Description input accepts text', async ({ page }) => {
    const inputs = page.locator('input.form-input');
    const descInput = inputs.nth(1);
    await expect(descInput).toBeVisible({ timeout: 10000 });
    await descInput.fill('Top technology stocks to watch');
    await expect(descInput).toHaveValue('Top technology stocks to watch');
  });

  test('Symbols input is present', async ({ page }) => {
    const label = page.locator('.form-label', { hasText: /symbols/i }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  test('Symbols input accepts comma-separated tickers', async ({ page }) => {
    const inputs = page.locator('input.form-input');
    const symbolsInput = inputs.nth(2);
    await expect(symbolsInput).toBeVisible({ timeout: 10000 });
    await symbolsInput.fill('AAPL, MSFT, GOOGL, NVDA');
    await expect(symbolsInput).toHaveValue('AAPL, MSFT, GOOGL, NVDA');
  });

  test('Create Watchlist button is present', async ({ page }) => {
    const createBtn = page.locator('.watchlist-create-actions button.btn-primary').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('Cancel button in create form is present', async ({ page }) => {
    const cancelBtn = page.locator('.watchlist-create-actions button.btn-secondary').first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
  });

  test('tier limit badge is displayed', async ({ page }) => {
    const badge = page.locator('.tier-limit-badge').first();
    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test('refresh button is present in header actions', async ({ page }) => {
    const refreshBtn = page.locator('.page-header-actions .btn-icon').first();
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  });

  test('Create New Watchlist header button is present', async ({ page }) => {
    const createNewBtn = page.locator('.page-header-actions .btn-primary').first();
    await expect(createNewBtn).toBeVisible({ timeout: 10000 });
  });
});
