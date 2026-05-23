import { test, expect } from './fixtures';

test.describe('Backtest tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const backtestBtn = page.locator('aside .nav-item', { hasText: 'Backtest' });
    await backtestBtn.click();
    await expect(backtestBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('backtest root element renders', async ({ page }) => {
    const root = page.locator('.backtest-tab-redesign').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('Backtest Lab heading is visible', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Backtest Lab' })).toBeVisible({ timeout: 10000 });
  });

  test('backtest config panel is visible', async ({ page }) => {
    const panel = page.locator('.backtest-config-panel').first();
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('Time Period section with date inputs', async ({ page }) => {
    const startDate = page.locator('#backtest-start-date');
    const endDate = page.locator('#backtest-end-date');
    await expect(startDate).toBeVisible({ timeout: 10000 });
    await expect(endDate).toBeVisible({ timeout: 10000 });
  });

  test('start date input accepts a date value', async ({ page }) => {
    const startDate = page.locator('#backtest-start-date');
    await expect(startDate).toBeVisible({ timeout: 10000 });
    await startDate.fill('2020-01-01');
    await expect(startDate).toHaveValue('2020-01-01');
  });

  test('end date input accepts a date value', async ({ page }) => {
    const endDate = page.locator('#backtest-end-date');
    await expect(endDate).toBeVisible({ timeout: 10000 });
    await endDate.fill('2024-01-01');
    await expect(endDate).toHaveValue('2024-01-01');
  });

  test('Investment section with capital input', async ({ page }) => {
    const capitalLabel = page.locator('label', { hasText: 'Initial Capital' });
    await expect(capitalLabel).toBeVisible({ timeout: 10000 });
    const capitalInput = page.locator('.input-with-prefix input').first();
    await expect(capitalInput).toBeVisible({ timeout: 10000 });
  });

  test('initial capital input accepts numeric value', async ({ page }) => {
    const capitalInput = page.locator('.input-with-prefix input').first();
    await expect(capitalInput).toBeVisible({ timeout: 10000 });
    await capitalInput.fill('50000');
    await expect(capitalInput).toHaveValue('50000');
  });

  test('monthly contribution input is present', async ({ page }) => {
    const label = page.locator('label', { hasText: 'Monthly Contribution' });
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  test('Symbols section with preset buttons', async ({ page }) => {
    const presets = page.locator('.preset-buttons button');
    const count = await presets.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a preset populates symbols', async ({ page }) => {
    const firstPreset = page.locator('.preset-buttons button').first();
    await expect(firstPreset).toBeVisible({ timeout: 10000 });
    await firstPreset.click();
    const symbolTags = page.locator('.symbol-tag');
    const count = await symbolTags.count();
    expect(count).toBeGreaterThan(0);
  });

  test('custom symbols input is present', async ({ page }) => {
    const customInput = page.locator('label', { hasText: 'Custom Symbols' });
    await expect(customInput).toBeVisible({ timeout: 10000 });
  });

  test('custom symbols field accepts comma-separated input', async ({ page }) => {
    const input = page.locator('.config-field.full-width input').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill('AAPL, MSFT, GOOGL');
    await expect(input).toHaveValue('AAPL, MSFT, GOOGL');
  });

  test('advanced toggle button is present', async ({ page }) => {
    const toggle = page.locator('.advanced-toggle').first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });

  test('advanced toggle expands advanced settings', async ({ page }) => {
    const toggle = page.locator('.advanced-toggle').first();
    await toggle.click();
    const advanced = page.locator('.config-section.advanced').first();
    await expect(advanced).toBeVisible({ timeout: 5000 });
  });

  test('Run Backtest button is visible', async ({ page }) => {
    const runBtn = page.locator('.backtest-config-panel button', { hasText: /run/i }).first();
    await expect(runBtn).toBeVisible({ timeout: 10000 });
  });

});
