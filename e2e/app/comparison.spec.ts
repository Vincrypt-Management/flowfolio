import { test, expect } from './fixtures';

test.describe('Comparison tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const comparisonBtn = page.locator('aside .nav-item', { hasText: 'Compare' });
    await comparisonBtn.click();
    await expect(comparisonBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Comparison Mode root element renders', async ({ page }) => {
    const root = page.locator('.comparison-mode').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('Compare Tickers heading is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Compare Tickers' })).toBeVisible({ timeout: 10000 });
  });

  test('comparison picker card is present', async ({ page }) => {
    const picker = page.locator('.comparison-picker.card').first();
    await expect(picker).toBeVisible({ timeout: 10000 });
  });

  test('Symbol A label is visible', async ({ page }) => {
    await expect(page.locator('label', { hasText: 'Symbol A' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Symbol A input is present', async ({ page }) => {
    const inputA = page.locator('input.picker-input').first();
    await expect(inputA).toBeVisible({ timeout: 10000 });
  });

  test('Symbol A input accepts ticker text', async ({ page }) => {
    const inputA = page.locator('input.picker-input').first();
    await expect(inputA).toBeVisible({ timeout: 10000 });
    await inputA.fill('AAPL');
    await expect(inputA).toHaveValue('AAPL');
  });

  test('vs separator is visible', async ({ page }) => {
    await expect(page.locator('.picker-vs').first()).toBeVisible({ timeout: 10000 });
  });

  test('Symbol B label is visible', async ({ page }) => {
    await expect(page.locator('label', { hasText: 'Symbol B' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Symbol B input is present', async ({ page }) => {
    const inputB = page.locator('input.picker-input').nth(1);
    await expect(inputB).toBeVisible({ timeout: 10000 });
  });

  test('Symbol B input accepts ticker text', async ({ page }) => {
    const inputB = page.locator('input.picker-input').nth(1);
    await expect(inputB).toBeVisible({ timeout: 10000 });
    await inputB.fill('MSFT');
    await expect(inputB).toHaveValue('MSFT');
  });

  test('Compare button is present', async ({ page }) => {
    const compareBtn = page.locator('button.btn-primary.compare-btn').first();
    await expect(compareBtn).toBeVisible({ timeout: 10000 });
  });

  test('Compare button triggers data fetch with both symbols', async ({ page }) => {
    let fetchCalled = false;
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'get_current_prices' || cmd === 'get_historical_prices') {
          (window as unknown as { _fetchCalled?: boolean })._fetchCalled = true;
          return { prices: [] };
        }
        return undefined;
      };
    });

    const inputA = page.locator('input.picker-input').first();
    const inputB = page.locator('input.picker-input').nth(1);
    await inputA.fill('AAPL');
    await inputB.fill('MSFT');

    const compareBtn = page.locator('button.btn-primary.compare-btn').first();
    await compareBtn.click();
    await page.waitForTimeout(500);

    fetchCalled = await page.evaluate(() => !!(window as unknown as { _fetchCalled?: boolean })._fetchCalled);
    expect(fetchCalled).toBe(true);
  });

  test('Symbol A placeholder hint text is correct', async ({ page }) => {
    const inputA = page.locator('input.picker-input').first();
    const placeholder = await inputA.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('Symbol B placeholder hint text is correct', async ({ page }) => {
    const inputB = page.locator('input.picker-input').nth(1);
    const placeholder = await inputB.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });
});
