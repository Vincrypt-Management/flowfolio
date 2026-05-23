import { test, expect } from './fixtures';

test.describe('Rebalance Scheduler tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const schedulerBtn = page.locator('aside .nav-item', { hasText: 'Scheduler' });
    await schedulerBtn.click();
    await expect(schedulerBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
    // Open the create form (hidden by default, shown by the Add Schedule button)
    const addBtn = page.locator('.header-actions .btn-primary.btn-small').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('Rebalance Scheduler root element renders', async ({ page }) => {
    const root = page.locator('.rebalance-scheduler').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('Rebalance Scheduler heading is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Rebalance Scheduler' })).toBeVisible({ timeout: 10000 });
  });

  test('Refresh button is present in header', async ({ page }) => {
    const refreshBtn = page.locator('.header-actions .btn-secondary.btn-small').first();
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  });

  test('Add Schedule button is present in header', async ({ page }) => {
    const addBtn = page.locator('.header-actions .btn-primary.btn-small').first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('Create Schedule form card is present', async ({ page }) => {
    const form = page.locator('.create-form.card').first();
    await expect(form).toBeVisible({ timeout: 10000 });
  });

  test('Create Schedule heading is visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Create Schedule' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Plan Name field is present in Create Schedule form', async ({ page }) => {
    const planLabel = page.locator('label', { hasText: 'Plan Name' }).first();
    await expect(planLabel).toBeVisible({ timeout: 10000 });
  });

  test('Plan Name input accepts text', async ({ page }) => {
    const planInput = page.locator('.form-input[placeholder*="plan name" i]').first();
    await expect(planInput).toBeVisible({ timeout: 10000 });
    await planInput.fill('Q1 Rebalance');
    await expect(planInput).toHaveValue('Q1 Rebalance');
  });

  test('Frequency dropdown is present', async ({ page }) => {
    const freqLabel = page.locator('label', { hasText: 'Frequency' }).first();
    await expect(freqLabel).toBeVisible({ timeout: 10000 });
    const freqSelect = page.locator('select.form-select').first();
    await expect(freqSelect).toBeVisible({ timeout: 10000 });
  });

  test('Frequency select has expected options', async ({ page }) => {
    const freqSelect = page.locator('select.form-select').first();
    await expect(freqSelect).toBeVisible({ timeout: 10000 });
    const options = await freqSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
  });

  test('Frequency select can be changed', async ({ page }) => {
    const freqSelect = page.locator('select.form-select').first();
    await expect(freqSelect).toBeVisible({ timeout: 10000 });
    const options = await freqSelect.locator('option').allTextContents();
    if (options.length > 1) {
      await freqSelect.selectOption({ index: 1 });
      const value = await freqSelect.inputValue();
      expect(value).toBeTruthy();
    }
  });

  test('no overdue schedules banner shown when list_schedules returns empty', async ({ page }) => {
    const overdue = page.locator('.overdue-banner');
    const count = await overdue.count();
    expect(count).toBe(0);
  });

  test('Create Schedule button triggers invoke', async ({ page }) => {
    let createCalled = false;
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'create_schedule') {
          (window as unknown as { _createCalled?: boolean })._createCalled = true;
          return { id: 'sched-1' };
        }
        return undefined;
      };
    });

    const planInput = page.locator('.form-input[placeholder*="plan name" i]').first();
    await planInput.fill('Test Schedule');
    const createBtn = page.locator('.create-form button.btn-primary').first();
    await createBtn.click();
    await page.waitForTimeout(500);

    createCalled = await page.evaluate(() => !!(window as unknown as { _createCalled?: boolean })._createCalled);
    expect(createCalled).toBe(true);
  });
});
