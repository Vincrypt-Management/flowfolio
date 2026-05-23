import { test, expect } from './fixtures';

test.describe('Alerts tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const alertsBtn = page.locator('aside .nav-item', { hasText: 'Alerts' });
    await alertsBtn.click();
    await expect(alertsBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
    // Open the create alert form (hidden by default, toggled by btn-primary in alerts-header-actions)
    const newAlertBtn = page.locator('.alerts-header-actions button.btn-primary').first();
    if (await newAlertBtn.isVisible()) {
      await newAlertBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('Price Alerts page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'Price Alerts' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('Monitor price');
  });

  test('alerts panel renders', async ({ page }) => {
    const panel = page.locator('.alerts-header').first();
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('Price Alerts section heading is visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Price Alerts' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('create alert form is present', async ({ page }) => {
    const form = page.locator('.alerts-form').first();
    await expect(form).toBeVisible({ timeout: 10000 });
  });

  test('symbol input is present in create alert form', async ({ page }) => {
    const symbolInput = page.locator('input.alerts-input[placeholder*="Symbol" i]').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
  });

  test('symbol input accepts ticker text', async ({ page }) => {
    const symbolInput = page.locator('input.alerts-input[placeholder*="Symbol" i]').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    await symbolInput.fill('AAPL');
    await expect(symbolInput).toHaveValue('AAPL');
  });

  test('condition select dropdown is present', async ({ page }) => {
    const conditionSelect = page.locator('select.alerts-select').first();
    await expect(conditionSelect).toBeVisible({ timeout: 10000 });
  });

  test('condition select has expected options', async ({ page }) => {
    const conditionSelect = page.locator('select.alerts-select').first();
    await expect(conditionSelect).toBeVisible({ timeout: 10000 });
    const options = await conditionSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
  });

  test('threshold price input is present', async ({ page }) => {
    const thresholdInput = page.locator('input.alerts-input[placeholder*="Price" i], input.alerts-input[placeholder*="Threshold" i]').first();
    await expect(thresholdInput).toBeVisible({ timeout: 10000 });
  });

  test('threshold input accepts numeric value', async ({ page }) => {
    const thresholdInput = page.locator('input.alerts-input[placeholder*="Price" i], input.alerts-input[placeholder*="Threshold" i]').first();
    await expect(thresholdInput).toBeVisible({ timeout: 10000 });
    await thresholdInput.fill('150.00');
    await expect(thresholdInput).toHaveValue('150.00');
  });

  test('note input is present in create alert form', async ({ page }) => {
    const noteInput = page.locator('input.alerts-input--note').first();
    await expect(noteInput).toBeVisible({ timeout: 10000 });
  });

  test('note input accepts text', async ({ page }) => {
    const noteInput = page.locator('input.alerts-input--note').first();
    await expect(noteInput).toBeVisible({ timeout: 10000 });
    await noteInput.fill('Buy signal when AAPL hits target');
    await expect(noteInput).toHaveValue('Buy signal when AAPL hits target');
  });

  test('Create Alert button is present', async ({ page }) => {
    const createBtn = page.locator('button.alerts-create-btn').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('Check Now button is present in header', async ({ page }) => {
    const checkBtn = page.locator('.alerts-header-actions .btn-small').first();
    await expect(checkBtn).toBeVisible({ timeout: 10000 });
  });

  test('Create Alert button triggers invoke on submit', async ({ page }) => {
    let createCalled = false;
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'create_alert') {
          (window as unknown as { _createCalled?: boolean })._createCalled = true;
          return null;
        }
        return undefined;
      };
    });

    const symbolInput = page.locator('input.alerts-input[placeholder*="Symbol" i]').first();
    await symbolInput.fill('AAPL');
    const thresholdInput = page.locator('input.alerts-input[placeholder*="Price" i], input.alerts-input[placeholder*="Threshold" i]').first();
    await thresholdInput.fill('200');
    const createBtn = page.locator('button.alerts-create-btn').first();
    await createBtn.click();
    await page.waitForTimeout(500);

    createCalled = await page.evaluate(() => !!(window as unknown as { _createCalled?: boolean })._createCalled);
    expect(createCalled).toBe(true);
  });
});
