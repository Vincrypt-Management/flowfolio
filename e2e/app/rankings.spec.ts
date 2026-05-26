import { test, expect } from './fixtures';

test.describe('Rankings tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const rankingsBtn = page.locator('aside .nav-item', { hasText: 'Rankings' });
    await rankingsBtn.click();
    await expect(rankingsBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('can navigate to Rankings', async ({ page }) => {
    const rankingsBtn = page.locator('aside .nav-item', { hasText: 'Rankings' });
    await expect(rankingsBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Stock Rankings page title is visible', async ({ page }) => {
    await expect(page.locator('h1.page-title', { hasText: 'Stock Rankings' })).toBeVisible({ timeout: 10000 });
  });

  test('page subtitle is visible', async ({ page }) => {
    const subtitle = page.locator('.page-subtitle').first();
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    await expect(subtitle).toContainText('Score and rank');
  });

  test('Score Symbols card is present', async ({ page }) => {
    const card = page.locator('.card', { hasText: 'Score Symbols' }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('symbols input is present in Score Symbols card', async ({ page }) => {
    const symbolInput = page.locator('.symbol-input').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
  });

  test('symbols input accepts comma-separated ticker values', async ({ page }) => {
    const symbolInput = page.locator('.symbol-input').first();
    await expect(symbolInput).toBeVisible({ timeout: 10000 });
    await symbolInput.fill('AAPL, MSFT, GOOGL, AMZN');
    await expect(symbolInput).toHaveValue('AAPL, MSFT, GOOGL, AMZN');
  });

  test('Score Symbols button is present', async ({ page }) => {
    const scoreBtn = page.locator('.card button.btn-primary', { hasText: /score/i }).first();
    await expect(scoreBtn).toBeVisible({ timeout: 10000 });
  });

  // The fixture returns get_default_plan so plan IS set; button is enabled when plan loaded.
  test('Score Symbols button is enabled when plan is loaded', async ({ page }) => {
    const scoreBtn = page.locator('.card button.btn-primary', { hasText: /score/i }).first();
    await expect(scoreBtn).toBeVisible({ timeout: 10000 });
    await expect(scoreBtn).not.toBeDisabled({ timeout: 5000 });
  });

  test('Default Plan name from fixture is displayed on page', async ({ page }) => {
    // get_default_plan fixture: name: 'Default Plan'
    await expect(page.locator('text=Default Plan').first()).toBeVisible({ timeout: 8000 });
  });

  test('factor weights from fixture are shown', async ({ page }) => {
    // get_default_plan fixture: factor_weights with momentum, value, quality, growth
    // Rankings page shows the active plan's factor weights somewhere in the UI
    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible({ timeout: 10000 });
    // At least one of the factor names should appear in the plan display
    const factorNames = ['momentum', 'value', 'quality', 'growth'];
    let found = false;
    for (const factor of factorNames) {
      const el = page.locator(`text=${factor}`).first();
      const count = await el.count();
      if (count > 0) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test('Score Symbols button triggers scoring invoke', async ({ page }) => {
    let scoringCalled = false;
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        // App calls get_scoring_config then score_symbols_batch
        if (cmd === 'get_scoring_config') {
          return { factor_weights: { momentum: 0.3, value: 0.3, quality: 0.2, growth: 0.2 } };
        }
        if (cmd === 'score_symbols_batch') {
          (window as unknown as { _scoringCalled?: boolean })._scoringCalled = true;
          return [];
        }
        return undefined;
      };
    });

    const symbolInput = page.locator('.symbol-input').first();
    await symbolInput.fill('AAPL,MSFT');
    const scoreBtn = page.locator('.card button.btn-primary', { hasText: /score/i }).first();
    await scoreBtn.click();
    await page.waitForTimeout(500);

    scoringCalled = await page.evaluate(() => !!(window as unknown as { _scoringCalled?: boolean })._scoringCalled);
    expect(scoringCalled).toBe(true);
  });

  test('results table appears after scoring', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'get_scoring_config') {
          return { factor_weights: { momentum: 0.3, value: 0.3, quality: 0.2, growth: 0.2 } };
        }
        if (cmd === 'score_symbols_batch') {
          return [
            { symbol: 'AAPL', total_score: 82.5, factors: [{ name: 'momentum', normalized_value: 85, raw_value: 0.85, weight: 0.3, contribution: 25.5 }], explanation: 'Strong momentum' },
            { symbol: 'MSFT', total_score: 78.0, factors: [{ name: 'momentum', normalized_value: 78, raw_value: 0.78, weight: 0.3, contribution: 23.4 }], explanation: 'Solid fundamentals' },
          ];
        }
        return undefined;
      };
    });

    const symbolInput = page.locator('.symbol-input').first();
    await symbolInput.fill('AAPL,MSFT');
    const scoreBtn = page.locator('.card button.btn-primary', { hasText: /score/i }).first();
    await scoreBtn.click();

    const table = page.locator('table.data-table').first();
    await expect(table).toBeVisible({ timeout: 8000 });
    await expect(page.locator('td', { hasText: 'AAPL' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('results count header shows symbol count after scoring', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string) => unknown }).__INVOKE_HOOK__ = (cmd: string) => {
        if (cmd === 'get_scoring_config') {
          return { factor_weights: { momentum: 0.3, value: 0.3, quality: 0.2, growth: 0.2 } };
        }
        if (cmd === 'score_symbols_batch') {
          return [
            { symbol: 'AAPL', total_score: 82.5, factors: [], explanation: '' },
          ];
        }
        return undefined;
      };
    });

    const symbolInput = page.locator('.symbol-input').first();
    await symbolInput.fill('AAPL');
    const scoreBtn = page.locator('.card button.btn-primary', { hasText: /score/i }).first();
    await scoreBtn.click();

    const resultsHeader = page.locator('h3', { hasText: /results/i }).first();
    await expect(resultsHeader).toBeVisible({ timeout: 8000 });
    await expect(resultsHeader).toContainText('1');
  });
});
