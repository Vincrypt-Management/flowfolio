import { test, expect } from './fixtures';

test.describe('Dividends tab (0.4.7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const upcoming = [
        {
          symbol: 'AAPL',
          ex_date: '2026-06-15',
          pay_date: '2026-06-30',
          amount_per_share: 0.25,
          shares_held: 100,
          projected_payout: 25,
        },
        {
          symbol: 'MSFT',
          ex_date: '2026-07-01',
          pay_date: '2026-07-15',
          amount_per_share: 0.75,
          shares_held: 20,
          projected_payout: 15,
        },
      ];
      const income = {
        portfolio_name: 'default',
        total_projected_annual: 320,
        by_symbol: [
          { symbol: 'AAPL', trailing_12mo: 100, trailing_per_share: 1.0, current_shares: 100, projected_annual: 100 },
          { symbol: 'MSFT', trailing_12mo: 220, trailing_per_share: 11.0, current_shares: 20, projected_annual: 220 },
        ],
      };
      (window as unknown as { __INVOKE_HOOK__: (cmd: string, args?: Record<string, unknown>) => unknown }).__INVOKE_HOOK__ = (
        cmd,
      ) => {
        if (cmd === 'get_upcoming_dividends') return upcoming;
        if (cmd === 'get_projected_annual_income') return income;
        return undefined;
      };
    });
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('Dividends sidebar entry navigates to Dividends tab', async ({ page }) => {
    const btn = page.getByRole('menuitem', { name: 'Dividends', exact: true });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.dividends-tab').first()).toBeVisible({ timeout: 10000 });
  });

  test('Dividends tab shows projected annual income card with total', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Dividends', exact: true }).click();
    await expect(page.locator('.dividends-tab').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Projected annual income/i)).toBeVisible();
    await expect(page.getByText(/\$320/)).toBeVisible({ timeout: 5000 });
  });

  test('List view shows Projected payout column with values', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Dividends', exact: true }).click();
    await expect(page.locator('.dividends-tab').first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^List$/i }).click();
    await expect(page.getByRole('columnheader', { name: /Projected payout/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('$25.00')).toBeVisible();
    await expect(page.getByText('$15.00')).toBeVisible();
  });

  test('Calendar / List / Income view toggle works', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Dividends', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Income$/i }).click();
    await expect(page.getByText('AAPL')).toBeVisible();
    await page.getByRole('button', { name: /^List$/i }).click();
    await expect(page.getByText(/Projected payout/i)).toBeVisible();
    await page.getByRole('button', { name: /^Calendar$/i }).click();
    await page.waitForTimeout(300);
    const dividendsTab = page.locator('.dividends-tab').first();
    await expect(dividendsTab).toBeVisible();
  });

  test('command palette navigates to Dividends', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.type('dividends');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await expect(page.locator('.dividends-tab').first()).toBeVisible({ timeout: 10000 });
  });
});
