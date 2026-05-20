import { test, expect } from './fixtures';

test.describe('Tax tab (0.4.7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const opp = [
        {
          lot_id: 'lot-1',
          symbol: 'AAPL',
          shares: 10,
          cost_basis: 200,
          current_price: 150,
          unrealized_loss: -500,
          days_held: 60,
          is_long_term: false,
          tax_benefit_estimate: 160,
          applied_rate: 0.32,
        },
      ];
      (window as unknown as { __INVOKE_HOOK__: (cmd: string, args?: Record<string, unknown>) => unknown }).__INVOKE_HOOK__ = (
        cmd,
        args,
      ) => {
        if (cmd === 'load_setting') {
          const key = args?.key;
          if (key === 'marginal_tax_rate') return '0.32';
          if (key === 'onboarding_complete') return 'true';
        }
        if (cmd === 'get_tax_loss_harvest_opportunities') return opp;
        if (cmd === 'record_wash_sale_event') return null;
        if (cmd === 'save_setting') return null;
        return undefined; // fall through to fixture default
      };
    });
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('Tax sidebar entry navigates to Tax tab', async ({ page }) => {
    const taxBtn = page.getByRole('menuitem', { name: 'Tax', exact: true });
    await expect(taxBtn).toBeVisible();
    await taxBtn.click();
    await expect(page.locator('.tax-tab').first()).toBeVisible({ timeout: 10000 });
  });

  test('Tax tab shows marginal rate from settings (32%) and harvest opportunity', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Tax', exact: true }).click();
    await expect(page.locator('.tax-tab').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Marginal tax rate: 32%')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AAPL', { exact: false })).toBeVisible();
  });

  test('Tax tab slider updates label live', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Tax', exact: true }).click();
    await expect(page.locator('.tax-tab').first()).toBeVisible({ timeout: 10000 });
    const slider = page.getByLabel('marginal tax rate');
    await expect(slider).toBeVisible();
    await slider.fill('0.45');
    await expect(page.getByText(/Marginal tax rate: 45%/)).toBeVisible({ timeout: 5000 });
  });

  test('command palette navigates to Tax', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.type('tax');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await expect(page.locator('.tax-tab').first()).toBeVisible({ timeout: 10000 });
  });
});
