import { test, expect } from './fixtures';

test.describe('Journal tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('can navigate to Journal', async ({ page }) => {
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await expect(journalBtn).toBeVisible();
    await journalBtn.click();
    await expect(journalBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Journal tab root element renders', async ({ page }) => {
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await journalBtn.click();
    await expect(journalBtn).toHaveAttribute('aria-current', 'page');

    // JournalTab renders a div.journal-tab as its root
    const journalTab = page.locator('.journal-tab').first();
    await expect(journalTab).toBeVisible({ timeout: 10000 });
  });

  test('Journal header is visible', async ({ page }) => {
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await journalBtn.click();

    // JournalTab renders a div.journal-header containing the h2
    const journalHeader = page.locator('.journal-header').first();
    await expect(journalHeader).toBeVisible({ timeout: 10000 });
  });

  test('Journal view tabs are present', async ({ page }) => {
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await journalBtn.click();

    // JournalTab renders Timeline, and Add Entry view-tab buttons
    await page.waitForTimeout(500);
    const viewTabs = page.locator('.view-tabs').first();
    await expect(viewTabs).toBeVisible({ timeout: 10000 });

    // "Add Entry" button is always visible regardless of mode
    const addEntryBtn = page.locator('.view-tabs button', { hasText: '+ Add Entry' });
    await expect(addEntryBtn).toBeVisible({ timeout: 10000 });
  });
});
