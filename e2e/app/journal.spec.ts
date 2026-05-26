import { test, expect } from './fixtures';

test.describe('Journal tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('aside.sidebar').waitFor({ state: 'visible', timeout: 10000 });
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await journalBtn.click();
    await expect(journalBtn).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);
  });

  test('can navigate to Journal', async ({ page }) => {
    const journalBtn = page.locator('aside .nav-item', { hasText: 'Journal' });
    await expect(journalBtn).toHaveAttribute('aria-current', 'page');
  });

  test('Journal tab root element renders', async ({ page }) => {
    const journalTab = page.locator('.journal-tab').first();
    await expect(journalTab).toBeVisible({ timeout: 10000 });
  });

  test('Journal header is visible', async ({ page }) => {
    const journalHeader = page.locator('.journal-header').first();
    await expect(journalHeader).toBeVisible({ timeout: 10000 });
  });

  test('view tabs bar is present', async ({ page }) => {
    const viewTabs = page.locator('.view-tabs').first();
    await expect(viewTabs).toBeVisible({ timeout: 10000 });
  });

  test('Add Entry button is visible', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await expect(addEntryBtn).toBeVisible({ timeout: 10000 });
  });

  test('clicking Add Entry opens entry form', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await addEntryBtn.click();
    const form = page.locator('.add-entry-view').first();
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test('entry form has title input', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await addEntryBtn.click();
    // Title input has placeholder "Brief title for this entry..."
    const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="brief" i]').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
  });

  test('entry form title input accepts text', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await addEntryBtn.click();
    const titleInput = page.locator('input[placeholder*="title" i], input[placeholder*="brief" i]').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill('My test journal entry');
    await expect(titleInput).toHaveValue('My test journal entry');
  });

  test('entry form has event type selector', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await addEntryBtn.click();
    const typeSelect = page.locator('.add-entry-view select').first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
  });

  test('entry form has content textarea', async ({ page }) => {
    const addEntryBtn = page.locator('.view-tabs button', { hasText: /add entry/i });
    await addEntryBtn.click();
    const textarea = page.locator('.add-entry-view textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('Testing journal entry content');
    await expect(textarea).toHaveValue('Testing journal entry content');
  });

  test('empty timeline message is shown when no entries', async ({ page }) => {
    // JournalTab starts with no entries (does not call list_journal_entries on mount)
    const emptyState = page.locator('.empty-state').first();
    await expect(emptyState).toBeVisible({ timeout: 8000 });
  });

  test('filter select is present in timeline view', async ({ page }) => {
    // Timeline view has a <select> to filter by entry type
    const filterSelect = page.locator('select[aria-label="Filter by entry type"]').first();
    await expect(filterSelect).toBeVisible({ timeout: 10000 });
  });

  test('filter select has event type options', async ({ page }) => {
    const filterSelect = page.locator('select[aria-label="Filter by entry type"]').first();
    await expect(filterSelect).toBeVisible({ timeout: 10000 });
    const options = await filterSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
  });

  test('Statistics button is visible in view tabs when in advanced mode', async ({ page }) => {
    // The fixture sets user_mode='advanced', so Statistics button should show
    // Note: button text is "Statistics" not "stats"
    const statsBtn = page.locator('.view-tabs button', { hasText: 'Statistics' });
    await expect(statsBtn).toBeVisible({ timeout: 8000 });
  });
});
