import { test, expect } from './fixtures';

test.describe('Universe tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const universeBtn = page.locator('aside .nav-item', { hasText: 'Universe' });
    await universeBtn.click();
    await expect(universeBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Universe page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: /Universe/i })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
  });

  test('Create New Universe card is present', async ({ page }) => {
    const card = page.locator('.card', { hasText: 'Create New Universe' }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('universe name input is present', async ({ page }) => {
    // Actual placeholder: "e.g., Tech Leaders"
    const nameInput = page.locator('input[placeholder*="Tech Leaders" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test('universe name input accepts text', async ({ page }) => {
    const nameInput = page.locator('input[placeholder*="Tech Leaders" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('My Tech Universe');
    await expect(nameInput).toHaveValue('My Tech Universe');
  });

  test('symbols input is present in Create Universe form', async ({ page }) => {
    // Actual placeholder: "e.g., AAPL, MSFT, GOOGL"
    const symbolInput = page.locator('input[placeholder*="AAPL" i]').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
  });

  test('symbols input accepts comma-separated values', async ({ page }) => {
    const symbolInput = page.locator('input[placeholder*="AAPL" i]').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    await symbolInput.fill('AAPL, MSFT, GOOGL');
    await expect(symbolInput).toHaveValue('AAPL, MSFT, GOOGL');
  });

  test('Create Universe button is present', async ({ page }) => {
    const createBtn = page.locator('.card button.btn-primary', { hasText: /create/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('Export / Import card is present', async ({ page }) => {
    const exportCard = page.locator('.card', { hasText: /export.*import/i }).first();
    await expect(exportCard).toBeVisible({ timeout: 10000 });
  });

  test('Export Data button is present', async ({ page }) => {
    const exportBtn = page.locator('button.btn-primary', { hasText: /export/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });

  test('Import Data label/button is present', async ({ page }) => {
    const importLabel = page.locator('label.btn-secondary', { hasText: /import/i }).first();
    await expect(importLabel).toBeVisible({ timeout: 10000 });
  });

  test('Your Universes list card is present', async ({ page }) => {
    const card = page.locator('.card', { hasText: /your universes/i }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('mock universe S&P 500 Core is listed', async ({ page }) => {
    await expect(page.locator('h4', { hasText: 'S&P 500 Core' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock universe shows symbol count from fixture', async ({ page }) => {
    // list_universes fixture has 5 symbols; component renders "{n} symbols" count text
    const universeItem = page.locator('.universe-item').first();
    await expect(universeItem).toBeVisible({ timeout: 8000 });
    await expect(universeItem).toContainText('5 symbols');
  });

  test('mock universe symbols render as tags including AAPL', async ({ page }) => {
    // list_universes fixture: symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']
    // Universe item renders each symbol as <span class="tag">
    const universeItem = page.locator('.universe-item').first();
    await expect(universeItem).toBeVisible({ timeout: 8000 });
    await expect(universeItem.locator('.tag', { hasText: 'AAPL' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('mock universe shows all 5 symbols as tags from fixture', async ({ page }) => {
    const universeItem = page.locator('.universe-item').first();
    await expect(universeItem).toBeVisible({ timeout: 8000 });
    for (const sym of ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']) {
      await expect(universeItem.locator('.tag', { hasText: sym }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Use in Rankings button is visible for listed universe', async ({ page }) => {
    const useBtn = page.locator('.btn-small', { hasText: /use in rankings/i }).first();
    await expect(useBtn).toBeVisible({ timeout: 8000 });
  });

  test('Delete universe button is present', async ({ page }) => {
    const deleteBtn = page.locator('.btn-small.text-error').first();
    await expect(deleteBtn).toBeVisible({ timeout: 8000 });
  });

  test('Saved Plans card is present', async ({ page }) => {
    const card = page.locator('.card', { hasText: /saved plans/i }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('mock saved plans are listed', async ({ page }) => {
    await expect(page.locator('.saved-plan-card').first()).toBeVisible({ timeout: 8000 });
  });

  test('mock saved plan My Growth Strategy name is visible', async ({ page }) => {
    // list_saved_plans fixture returns ['My Growth Strategy', 'Dividend Income']
    await expect(page.locator('.saved-plan-card', { hasText: 'My Growth Strategy' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('mock saved plan Dividend Income name is visible', async ({ page }) => {
    await expect(page.locator('.saved-plan-card', { hasText: 'Dividend Income' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('exactly 2 saved plan cards render matching fixture', async ({ page }) => {
    // list_saved_plans returns 2 plans
    const planCards = page.locator('.saved-plan-card');
    await expect(planCards).toHaveCount(2, { timeout: 8000 });
  });
});
