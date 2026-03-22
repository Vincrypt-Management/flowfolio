import { test, expect } from './fixtures';

test.describe('Vibe Studio tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('can navigate to Vibe Studio', async ({ page }) => {
    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await expect(vibeStudioBtn).toBeVisible();
    await vibeStudioBtn.click();
    await expect(vibeStudioBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Vibe Studio root element renders', async ({ page }) => {
    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await vibeStudioBtn.click();
    await expect(vibeStudioBtn).toHaveAttribute('aria-current', 'page');

    // VibeStudio renders a div.vibe-studio as its root
    const vibeStudio = page.locator('.vibe-studio').first();
    await expect(vibeStudio).toBeVisible({ timeout: 10000 });
  });

  test('Vibe Studio header and studio controls are visible', async ({ page }) => {
    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await vibeStudioBtn.click();

    // Header with title is always rendered
    const studioHeader = page.locator('.studio-header').first();
    await expect(studioHeader).toBeVisible({ timeout: 10000 });
  });

  test('Vibe Studio welcome section or content area is present', async ({ page }) => {
    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await vibeStudioBtn.click();

    // After navigation the welcome section or plan result should be present
    await page.waitForTimeout(500);
    const content = page.locator('.welcome-section, .plan-result').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});
