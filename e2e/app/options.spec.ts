import { test, expect } from './fixtures';

test.describe('Options tab (0.4.7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const openPosition = {
        id: 'opt-1',
        portfolio_name: 'default',
        symbol: 'AAPL',
        strategy: 'covered_call',
        strike: 200,
        expiration: '2027-01-15',
        contracts: 1,
        premium_per_contract: 3.5,
        open_date: '2026-05-15',
        status: 'open',
        close_date: null,
        close_premium: null,
      };
      const summary = {
        open_count: 1,
        total_cash_secured: 0,
        total_assignment_exposure: 20000,
        realized_premium_ytd: 0,
      };
      (window as unknown as { __INVOKE_HOOK__: (cmd: string, args?: Record<string, unknown>) => unknown }).__INVOKE_HOOK__ = (
        cmd,
        args,
      ) => {
        if (cmd === 'list_option_positions') {
          const a = (args ?? {}) as { statusFilter?: string | null };
          // History view (statusFilter === null) returns nothing for now.
          if (a.statusFilter === null) return [];
          return [openPosition];
        }
        if (cmd === 'get_options_summary') return summary;
        if (cmd === 'create_option_position') return null;
        if (cmd === 'update_option_position') return null;
        if (cmd === 'delete_option_position') return null;
        return undefined;
      };
    });
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('Options sidebar entry navigates to Options tab', async ({ page }) => {
    const btn = page.getByRole('menuitem', { name: 'Options', exact: true });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.options-tab').first()).toBeVisible({ timeout: 10000 });
  });

  test('Options tab renders summary + open position', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await expect(page.locator('.options-tab').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText(/Open:\s*1/)).toBeVisible();
    await expect(page.getByText(/\$20,000/)).toBeVisible();
  });

  test('Open row shows Close Early, Mark Expired, Mark Assigned, Delete', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await expect(page.getByText('AAPL')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Close Early/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark Expired/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark Assigned/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete$/i })).toBeVisible();
  });

  test('Add Position rejects past expiration with error toast', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await expect(page.locator('.options-tab').first()).toBeVisible();
    await page.getByRole('button', { name: /Add Position/i }).click();
    await page.getByLabel('Symbol').fill('AAPL');
    await page.getByLabel('Strike').fill('200');
    await page.getByLabel('Expiration').fill('2020-01-01');
    await page.getByLabel('Premium per contract').fill('1.5');
    await page.getByRole('button', { name: /^Create$/i }).click();
    await expect(page.getByText(/Expiration must be on or after today/i)).toBeVisible({ timeout: 5000 });
  });

  test('Add Position rejects strike=0 with error toast', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await page.getByRole('button', { name: /Add Position/i }).click();
    await page.getByLabel('Symbol').fill('AAPL');
    await page.getByLabel('Strike').fill('0');
    await page.getByLabel('Expiration').fill('2027-07-19');
    await page.getByLabel('Premium per contract').fill('1.0');
    await page.getByRole('button', { name: /^Create$/i }).click();
    await expect(page.getByText(/Strike must be > 0/i)).toBeVisible({ timeout: 5000 });
  });

  test('Close Early opens modal and submits', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await expect(page.getByText('AAPL')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close Early/i }).click();
    await expect(page.getByRole('dialog', { name: /Close option early/i })).toBeVisible();
    await page.getByLabel('close debit').fill('0.5');
    await expect(page.getByText(/Realized P&L:\s*\$300\.00/)).toBeVisible();
    await page.getByRole('button', { name: /^Confirm$/i }).click();
    await expect(page.getByRole('dialog', { name: /Close option early/i })).not.toBeVisible({ timeout: 5000 });
  });

  test('Delete asks for confirmation (dismiss keeps row)', async ({ page }) => {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await expect(page.getByText('AAPL')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Delete$/i }).click();
    await expect(page.getByText('AAPL')).toBeVisible();
  });

  test('History toggle shows empty-history copy when no historical positions', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Options', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^History$/i }).click();
    await expect(page.getByText(/No historical positions/i)).toBeVisible({ timeout: 5000 });
  });

  test('command palette navigates to Options', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(300);
    await page.keyboard.type('options');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await expect(page.locator('.options-tab').first()).toBeVisible({ timeout: 10000 });
  });
});
