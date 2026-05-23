import { test, expect } from './fixtures';

test.describe('Risk Dashboard tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const riskBtn = page.locator('aside .nav-item', { hasText: 'Risk' });
    await riskBtn.click();
    await expect(riskBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('Risk Dashboard root element renders', async ({ page }) => {
    const root = page.locator('.risk-dashboard').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  // With no portfolio holdings, RiskDashboard renders the empty state only.
  // All metrics, heading, gauge, and demo banner require holdings.length > 0.
  test('risk dashboard with no holdings shows empty state', async ({ page }) => {
    const emptyState = page.locator('.risk-dashboard-empty').first();
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('empty state contains explanatory text', async ({ page }) => {
    const emptyState = page.locator('.risk-dashboard-empty').first();
    await expect(emptyState).toBeVisible({ timeout: 10000 });
    const text = await emptyState.textContent();
    expect(text).toBeTruthy();
  });

  test('no error boundary shown on Risk tab', async ({ page }) => {
    const errorBoundary = page.locator('.error-boundary, .tab-error-boundary');
    const count = await errorBoundary.count();
    expect(count).toBe(0);
  });

  test('main content area is not empty', async ({ page }) => {
    const main = page.locator('main#main-content');
    await expect(main).not.toBeEmpty({ timeout: 10000 });
  });
});
