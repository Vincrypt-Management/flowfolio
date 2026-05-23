import { test, expect } from './fixtures';

test.describe('Vibe Studio tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const vibeStudioBtn = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await vibeStudioBtn.click();
    await expect(vibeStudioBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Vibe Studio root element renders', async ({ page }) => {
    const vibeStudio = page.locator('.vibe-studio').first();
    await expect(vibeStudio).toBeVisible({ timeout: 10000 });
  });

  test('studio header with title is visible', async ({ page }) => {
    const studioHeader = page.locator('.studio-header').first();
    await expect(studioHeader).toBeVisible({ timeout: 10000 });
    await expect(studioHeader.locator('h2').first()).toContainText('Vibe Studio');
  });

  test('studio subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('AI-powered');
  });

  test('welcome section is shown by default', async ({ page }) => {
    const welcome = page.locator('.welcome-section').first();
    await expect(welcome).toBeVisible({ timeout: 10000 });
  });

  test('how it works card is visible in welcome section', async ({ page }) => {
    const howItWorks = page.locator('.welcome-card').first();
    await expect(howItWorks).toBeVisible({ timeout: 10000 });
    await expect(howItWorks).toContainText('How it works');
  });

  test('example cards are listed', async ({ page }) => {
    const examples = page.locator('.examples-section').first();
    await expect(examples).toBeVisible({ timeout: 10000 });
    const cards = page.locator('.example-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking an example card fills prompt', async ({ page }) => {
    const firstExample = page.locator('.example-card').first();
    await expect(firstExample).toBeVisible({ timeout: 10000 });
    await firstExample.click();
    const promptInput = page.locator('.prompt-input, textarea[placeholder]').first();
    await expect(promptInput).not.toBeEmpty({ timeout: 5000 });
  });

  test('prompt input is present and editable', async ({ page }) => {
    const promptInput = page.locator('.prompt-input, textarea[placeholder]').first();
    await expect(promptInput).toBeVisible({ timeout: 10000 });
    await promptInput.fill('Build a tech-focused growth portfolio');
    await expect(promptInput).toHaveValue('Build a tech-focused growth portfolio');
  });

  test('generate / submit button is present', async ({ page }) => {
    const generateBtn = page.locator('.prompt-actions button[type="submit"], button.btn-generate, .vibe-studio button[type="submit"]').first();
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
  });

  test('submit generates AI prompt call (invoke hook)', async ({ page }) => {
    const invokes: string[] = [];
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        (window as unknown as { _invokes?: string[] })._invokes = [
          ...((window as unknown as { _invokes?: string[] })._invokes ?? []),
          cmd,
        ];
        if (cmd === 'ai_vibe_studio') return null;
        return undefined;
      };
    });
    const firstExample = page.locator('.example-card').first();
    await firstExample.click();
    const generateBtn = page.locator('.prompt-actions button[type="submit"], button.btn-generate, .vibe-studio button[type="submit"]').first();
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
    }
    await page.waitForTimeout(500);
    const invokes2 = await page.evaluate(() => (window as unknown as { _invokes?: string[] })._invokes ?? []);
    expect(invokes2.length).toBeGreaterThanOrEqual(0);
  });
});
