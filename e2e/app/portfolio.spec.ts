import { test, expect } from './fixtures';

test.describe('Portfolio tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await portfolioBtn.click();
    await expect(portfolioBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Portfolio tab root element renders', async ({ page }) => {
    const portfolioTab = page.locator('.portfolio-tab').first();
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
  });

  test('Portfolio heading is visible', async ({ page }) => {
    const heading = page.locator('.portfolio-tab h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('portfolio card section is present', async ({ page }) => {
    const card = page.locator('.portfolio-tab .card').first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('add holding form or section is present', async ({ page }) => {
    const addSection = page.locator('[placeholder*="symbol" i], input[placeholder*="AAPL" i]').first();
    await expect(addSection).toBeVisible({ timeout: 10000 });
  });

  test('symbol input accepts ticker text', async ({ page }) => {
    const symbolInput = page.locator('input[placeholder*="symbol" i], input[placeholder*="AAPL" i]').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    await symbolInput.fill('AAPL');
    await expect(symbolInput).toHaveValue('AAPL');
  });

  test('shares input is present in add holding form', async ({ page }) => {
    // The Shares input is the first number input within the add-holding-form
    const sharesInput = page.locator('.add-holding-form input[type="number"]').first();
    await expect(sharesInput).toBeVisible({ timeout: 10000 });
  });

  test('shares input accepts numeric value', async ({ page }) => {
    const sharesInput = page.locator('.add-holding-form input[type="number"]').first();
    await expect(sharesInput).toBeVisible({ timeout: 10000 });
    await sharesInput.fill('100');
    await expect(sharesInput).toHaveValue('100');
  });

  test('add holding button is present', async ({ page }) => {
    const addBtn = page.locator('button', { hasText: /add/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('current portfolio heading is present', async ({ page }) => {
    // Portfolio name is shown as an h3 heading, not an editable input
    const portfolioHeading = page.locator('h3', { hasText: /current portfolio/i }).first();
    await expect(portfolioHeading).toBeVisible({ timeout: 10000 });
  });

  test('current portfolio name is displayed', async ({ page }) => {
    const portfolioHeading = page.locator('h3', { hasText: /current portfolio/i }).first();
    await expect(portfolioHeading).toBeVisible({ timeout: 10000 });
    const text = await portfolioHeading.textContent();
    expect(text).toBeTruthy();
  });

  test('Optimize Portfolio button is present', async ({ page }) => {
    const optimizeBtn = page.locator('button', { hasText: /optim/i }).first();
    await expect(optimizeBtn).toBeVisible({ timeout: 10000 });
  });

  test('Import from Broker section is accessible', async ({ page }) => {
    // Import section is shown as a card heading with a toggle button
    const importHeading = page.locator('h3', { hasText: /Import from Broker/i }).first();
    await expect(importHeading).toBeVisible({ timeout: 10000 });
  });

  test('import show/hide button is present', async ({ page }) => {
    // Import section has a "Show ▼" toggle button
    const importToggle = page.locator('button', { hasText: /show/i }).first();
    await expect(importToggle).toBeVisible({ timeout: 10000 });
  });

  test('cash/allocation field is present', async ({ page }) => {
    const cashInput = page.locator('input[placeholder*="cash" i], input[placeholder*="allocation" i]').first();
    await expect(cashInput).toBeVisible({ timeout: 10000 });
  });

  test('portfolio thresholds section is visible', async ({ page }) => {
    const thresholdsHeading = page.locator('h3', { hasText: /portfolio thresholds/i }).first();
    await expect(thresholdsHeading).toBeVisible({ timeout: 10000 });
  });

  test('rebalance threshold input is present', async ({ page }) => {
    const label = page.locator('label, [class*="label"]', { hasText: /rebalance.*threshold/i }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  });
});
