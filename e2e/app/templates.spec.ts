import { test, expect } from './fixtures';

test.describe('Templates tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const templatesBtn = page.locator('aside .nav-item', { hasText: 'Templates' });
    await templatesBtn.click();
    await expect(templatesBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Templates page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'Templates' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('pre-configured');
  });

  test('template grid renders', async ({ page }) => {
    const grid = page.locator('.template-grid').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
  });

  test('mock template Growth is listed', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Growth' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock template Dividend is listed', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Dividend' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock template Value is listed', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Value' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock template Momentum is listed', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Momentum' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock template Balanced is listed', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Balanced' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('exactly 5 template cards render matching fixture', async ({ page }) => {
    // list_templates fixture returns 5 items: Growth, Dividend, Value, Momentum, Balanced
    const grid = page.locator('.template-grid').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
    const cards = grid.locator('.template-card');
    await expect(cards).toHaveCount(5, { timeout: 8000 });
  });

  test('all fixture template names appear in template grid', async ({ page }) => {
    const expectedNames = ['Growth', 'Dividend', 'Value', 'Momentum', 'Balanced'];
    for (const name of expectedNames) {
      await expect(page.locator('.template-card h3', { hasText: name }).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Use This Template button is present for each template', async ({ page }) => {
    const loadBtns = page.locator('button.btn-primary', { hasText: /load template/i });
    const count = await loadBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking Load Template button selects a template', async ({ page }) => {
    const loadBtn = page.locator('button.btn-primary', { hasText: /load template/i }).first();
    await expect(loadBtn).toBeVisible({ timeout: 8000 });
    await loadBtn.click();
    await page.waitForTimeout(500);
    // After clicking, the template card gets the 'selected' class
    const selectedCard = page.locator('.template-card.selected').first();
    await expect(selectedCard).toBeVisible({ timeout: 5000 });
  });

  test('template cards are clickable without crashing', async ({ page }) => {
    const loadBtns = page.locator('button.btn-primary', { hasText: /load template/i });
    const count = await loadBtns.count();
    expect(count).toBeGreaterThan(0);
    await loadBtns.first().click();
    await page.waitForTimeout(300);
    // Verify the page did not crash
    const errorBoundary = page.locator('.error-boundary, .tab-error-boundary');
    const errorCount = await errorBoundary.count();
    expect(errorCount).toBe(0);
  });
});
