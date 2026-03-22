import { test, expect } from './fixtures';

test.describe('Portfolio tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('can navigate to Portfolio', async ({ page }) => {
    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await expect(portfolioBtn).toBeVisible();
    await portfolioBtn.click();
    await expect(portfolioBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Portfolio tab root element renders', async ({ page }) => {
    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await portfolioBtn.click();
    await expect(portfolioBtn).toHaveAttribute('aria-current', 'page');

    // PortfolioTab renders a div.portfolio-tab as its root
    const portfolioTab = page.locator('.portfolio-tab').first();
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
  });

  test('Portfolio heading is visible', async ({ page }) => {
    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await portfolioBtn.click();

    // PortfolioTab renders an h2 with "Portfolio Management"
    const heading = page.locator('.portfolio-tab h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Portfolio broker import section is present', async ({ page }) => {
    const portfolioBtn = page.getByRole('menuitem', { name: 'Portfolio', exact: true });
    await portfolioBtn.click();

    // The broker import card is always rendered (not behind a toggle)
    await page.waitForTimeout(500);
    const importSection = page.locator('.portfolio-tab .card').first();
    await expect(importSection).toBeVisible({ timeout: 10000 });
  });
});
