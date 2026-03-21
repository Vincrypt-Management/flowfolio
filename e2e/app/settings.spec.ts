import { test, expect } from './fixtures';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for sidebar, then navigate to Settings
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const settingsBtn = page.locator('aside .nav-item', { hasText: 'Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
  });

  test('settings page loads', async ({ page }) => {
    // At minimum the settings nav item should be active
    const settingsBtn = page.locator('aside .nav-item', { hasText: 'Settings' });
    await expect(settingsBtn).toHaveAttribute('aria-current', 'page');

    // The lazy-loaded settings panel should appear
    const settingsContent = page.locator('[class*="settings"]').first();
    await expect(settingsContent).toBeVisible({ timeout: 10000 });
  });

  test('API keys section exists', async ({ page }) => {
    // Wait for lazy-loaded content
    await page.waitForTimeout(500);

    // Look for the API key inputs by placeholder text defined in SettingsPage.tsx
    const firstKeyInput = page.locator('input[placeholder="Enter key…"]').first();
    await expect(firstKeyInput).toBeVisible({ timeout: 10000 });
  });

  test('profile section exists', async ({ page }) => {
    // The profile / user section should be present on the settings page
    // SettingsPage renders profile fields (name, bio, etc.)
    await page.waitForTimeout(500);

    // The Save button is always present in the profile section
    const saveBtn = page.locator('button', { hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });
});
