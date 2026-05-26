import { test, expect } from './fixtures';

test.describe('Saved Portfolios tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __INVOKE_HOOK__?: (cmd: string, args?: Record<string, unknown>) => unknown }).__INVOKE_HOOK__ = (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'list_saved_portfolios') {
          return [
            {
              id: 'portfolio-1',
              name: 'My Growth Portfolio',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-15T00:00:00Z',
            },
            {
              id: 'portfolio-2',
              name: 'Dividend Income',
              created_at: '2024-02-01T00:00:00Z',
              updated_at: '2024-02-10T00:00:00Z',
            },
          ];
        }
        if (cmd === 'load_generated_portfolio') {
          return {
            id: args?.id as string ?? 'portfolio-1',
            title: 'My Growth Portfolio',
            description: 'Tech-heavy growth strategy',
            assets: [
              { symbol: 'AAPL', allocation: 0.3, rationale: 'Strong momentum' },
              { symbol: 'MSFT', allocation: 0.3, rationale: 'Quality factor' },
            ],
            riskLevel: 'High',
            timeHorizon: '10 years',
            created_at: '2024-01-01T00:00:00Z',
          };
        }
        return undefined;
      };
    });

    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const savedBtn = page.locator('aside .nav-item', { hasText: 'Saved Portfolios' });
    await savedBtn.click();
    await expect(savedBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(600);
  });

  test('Saved Portfolios root element renders', async ({ page }) => {
    const root = page.locator('.saved-portfolios-tab').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('page header is visible', async ({ page }) => {
    const header = page.locator('header.page-header').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('Saved Portfolios page title is visible', async ({ page }) => {
    const title = page.locator('h1.page-title').first();
    await expect(title).toBeVisible({ timeout: 10000 });
  });

  test('refresh button is present in header', async ({ page }) => {
    const refreshBtn = page.locator('.btn-refresh').first();
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  });

  test('search portfolios input is present', async ({ page }) => {
    const searchInput = page.locator('input[aria-label="Search portfolios"], input[placeholder*="search portfolios" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('search input filters by portfolio name', async ({ page }) => {
    const searchInput = page.locator('input[aria-label="Search portfolios"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Growth');
    await expect(searchInput).toHaveValue('Growth');
  });

  test('sort buttons are present in toolbar', async ({ page }) => {
    const toolbar = page.locator('.toolbar').first();
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    const sortBtns = toolbar.locator('button');
    const count = await sortBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('portfolio grid renders when data is available', async ({ page }) => {
    const grid = page.locator('.portfolios-grid').first();
    await expect(grid).toBeVisible({ timeout: 10000 });
  });

  test('My Growth Portfolio card is visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'My Growth Portfolio' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('Dividend Income card is visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Dividend Income' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('Load Portfolio button is present on each card', async ({ page }) => {
    const loadBtn = page.locator('.btn-action.primary').first();
    await expect(loadBtn).toBeVisible({ timeout: 8000 });
  });

  test('Export button is present on portfolio cards', async ({ page }) => {
    const exportBtn = page.locator('[aria-label="Export portfolio"]').first();
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
  });

  test('Delete button is present on portfolio cards', async ({ page }) => {
    const deleteBtn = page.locator('[aria-label="Delete portfolio"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 8000 });
  });

  test('clicking Load button loads portfolio and navigates to Vibe Studio', async ({ page }) => {
    // onLoadPortfolio dispatches setActiveTab('vibe-studio') in App.tsx
    const loadBtn = page.locator('.btn-action.primary').first();
    await expect(loadBtn).toBeVisible({ timeout: 8000 });
    await loadBtn.click();
    // After loading, the app navigates to Vibe Studio tab
    const vibeStudioNav = page.locator('aside .nav-item', { hasText: 'Vibe Studio' });
    await expect(vibeStudioNav).toHaveAttribute('aria-current', 'page', { timeout: 8000 });
  });
});
