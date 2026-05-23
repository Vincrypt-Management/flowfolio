import { test, expect } from './fixtures';

test.describe('AI Model settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const settingsBtn = page.locator('aside .nav-item', { hasText: 'Settings' });
    await settingsBtn.click();
    await page.waitForTimeout(500);
  });

  test('AI Model card is visible in Settings', async ({ page }) => {
    // The AI Model card should render after the tax settings card
    const aiCard = page.locator('.settings-card', { hasText: 'AI Model' }).first();
    await expect(aiCard).toBeVisible({ timeout: 10000 });
  });

  test('AI model dropdown contains free models', async ({ page }) => {
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });

    // Llama 3.3 70B should be present (it's the recommended/default)
    const options = await select.locator('option').allTextContents();
    const hasLlama = options.some(o => o.includes('Llama 3.3 70B'));
    expect(hasLlama).toBe(true);
  });

  test('AI model dropdown has multiple free model options', async ({ page }) => {
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });

    const count = await select.locator('option').count();
    // We ship 8 free models
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('AI model default is Llama 3.3 70B (recommended)', async ({ page }) => {
    // load_setting mock returns 'true' (not a valid model id) so the service
    // falls back to DEFAULT_FREE_MODEL = meta-llama/llama-3.3-70b-instruct:free
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });
    await expect(select).toHaveValue('meta-llama/llama-3.3-70b-instruct:free');
  });

  test('model description updates when selection changes', async ({ page }) => {
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });

    // Select Gemini Flash
    await select.selectOption('google/gemini-2.0-flash-exp:free');
    // Description text for Gemini should appear
    const card = page.locator('.settings-card', { hasText: 'AI Model' }).first();
    await expect(card).toContainText('Google', { timeout: 5000 });
  });

  test('Save Model button is present', async ({ page }) => {
    const saveBtn = page.locator('.settings-card', { hasText: 'AI Model' })
      .locator('button', { hasText: /save model/i })
      .first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test('Save Model button shows saved confirmation', async ({ page }) => {
    // Override invoke hook to capture save_setting call
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'save_setting') return null;
        return undefined;
      };
    });

    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });

    const saveBtn = page.locator('.settings-card', { hasText: 'AI Model' })
      .locator('button')
      .first();
    await saveBtn.click();

    // After saving, the button text should change to "Saved!"
    await expect(saveBtn).toContainText('Saved!', { timeout: 5000 });
  });
});
