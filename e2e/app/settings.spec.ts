import { test, expect } from './fixtures';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const settingsBtn = page.locator('aside .nav-item', { hasText: 'Settings' });
    await settingsBtn.click();
    await expect(settingsBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('settings page loads', async ({ page }) => {
    const settingsContent = page.locator('[class*="settings"]').first();
    await expect(settingsContent).toBeVisible({ timeout: 10000 });
  });

  // --- API Keys section ---
  test('API keys card is present', async ({ page }) => {
    const firstKeyInput = page.locator('input[placeholder="Enter key…"]').first();
    await expect(firstKeyInput).toBeVisible({ timeout: 10000 });
  });

  test('Alpaca key input is present', async ({ page }) => {
    const alpacaLabel = page.locator('label', { hasText: /alpaca/i }).first();
    await expect(alpacaLabel).toBeVisible({ timeout: 10000 });
  });

  test('Finnhub key input is present', async ({ page }) => {
    const label = page.locator('label', { hasText: /finnhub/i }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  test('OpenRouter key input is present', async ({ page }) => {
    const label = page.locator('label', { hasText: /openrouter/i }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  });

  test('API key input accepts text', async ({ page }) => {
    const keyInput = page.locator('input[placeholder="Enter key…"]').first();
    await expect(keyInput).toBeVisible({ timeout: 10000 });
    await keyInput.fill('sk-test-key-12345');
    await expect(keyInput).toHaveValue('sk-test-key-12345');
  });

  test('Save API Keys button is present', async ({ page }) => {
    const saveBtn = page.locator('button', { hasText: /save.*key/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test('toggle key visibility button is present', async ({ page }) => {
    const toggleBtn = page.locator('button[aria-label*="show" i], button[aria-label*="hide" i]').first();
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
  });

  // --- Profile section ---
  test('profile section Save button is present', async ({ page }) => {
    const saveBtn = page.locator('button', { hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test('profile name input is present', async ({ page }) => {
    const nameInput = page.locator('input[placeholder*="name" i], input[id*="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test('profile name input accepts text', async ({ page }) => {
    const nameInput = page.locator('input[placeholder*="name" i], input[id*="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill('Test User');
    await expect(nameInput).toHaveValue('Test User');
  });

  // --- Tax / Preferences section ---
  test('tax settings card is present', async ({ page }) => {
    const taxCard = page.locator('.settings-card', { hasText: /tax/i }).first();
    await expect(taxCard).toBeVisible({ timeout: 10000 });
  });

  test('tax rate input is present', async ({ page }) => {
    const taxInput = page.locator('input[id*="tax"], input[id*="marginal"]').first();
    await expect(taxInput).toBeVisible({ timeout: 10000 });
  });

  // --- AI Model section ---
  test('AI Model card is present', async ({ page }) => {
    const aiCard = page.locator('.settings-card', { hasText: 'AI Model' }).first();
    await expect(aiCard).toBeVisible({ timeout: 10000 });
  });

  test('AI model dropdown is present', async ({ page }) => {
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });
  });

  test('AI model dropdown has multiple options', async ({ page }) => {
    const select = page.locator('#ai-model');
    await expect(select).toBeVisible({ timeout: 10000 });
    const count = await select.locator('option').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('Save AI Model button is visible', async ({ page }) => {
    const aiCard = page.locator('.settings-card', { hasText: 'AI Model' }).first();
    const saveBtn = aiCard.locator('button').first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  // --- Vault section ---
  test('vault section is present', async ({ page }) => {
    const vaultSection = page.locator('.settings-card', { hasText: /vault/i }).first();
    await expect(vaultSection).toBeVisible({ timeout: 10000 });
  });

  // --- Save Changes button ---
  test('Save Changes button is present', async ({ page }) => {
    const saveBtn = page.locator('button', { hasText: /save changes/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test('Reset to Defaults button is present', async ({ page }) => {
    const resetBtn = page.locator('button', { hasText: /reset to defaults/i }).first();
    await expect(resetBtn).toBeVisible({ timeout: 10000 });
  });
});
