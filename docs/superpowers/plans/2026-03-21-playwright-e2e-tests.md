# Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Playwright E2E test suite covering the FlowFolio landing page and main app (web mode), running locally and in GitHub Actions CI.

**Architecture:** Single `playwright.config.ts` with two named Playwright projects (`landing`, `app`), each pointing at a separate Vite dev server. Tauri IPC is intercepted via Vite alias stubs (web-only) + a Playwright `addInitScript` fixture. Tests use Page Object Model classes and ARIA-first selectors.

**Tech Stack:** Playwright 1.58, React 19, Vite 7, TypeScript, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-21-playwright-tests-design.md`

---

## File Map

### Created
- `src/mocks/tauri-plugins/deep-link.ts` — no-op stub for `@tauri-apps/plugin-deep-link`
- `src/mocks/tauri-plugins/api-core.ts` — stub for `@tauri-apps/api/core` that delegates to Playwright's `window.__TAURI_INTERNALS__` mock
- `playwright.config.ts` — Playwright config with two projects, two webServers, multi-browser local matrix
- `e2e/fixtures/tauri-mock.ts` — custom `test` fixture that injects `window.__TAURI_INTERNALS__` with mock command responses
- `e2e/pages/LandingPage.ts` — POM for the landing page
- `e2e/pages/AppPage.ts` — POM for the app shell (sidebar, tab nav)
- `e2e/pages/VibeStudioPage.ts` — POM for the Vibe Studio tab
- `e2e/pages/PortfolioPage.ts` — POM for the Portfolio tab
- `e2e/pages/BacktestPage.ts` — POM for the Backtest tab
- `e2e/pages/JournalPage.ts` — POM for the Journal tab
- `e2e/landing/smoke.spec.ts`
- `e2e/landing/navigation.spec.ts`
- `e2e/landing/download.spec.ts`
- `e2e/app/smoke.spec.ts`
- `e2e/app/navigation.spec.ts`
- `e2e/app/vibe-studio.spec.ts`
- `e2e/app/portfolio.spec.ts`
- `e2e/app/backtest.spec.ts`
- `e2e/app/journal.spec.ts`
- `.github/workflows/e2e.yml`

### Modified
- `package.json` — move `@playwright/test`/`playwright` to devDependencies; add `test:e2e*` scripts; update `dev:web` to set `VITE_WEB_ONLY=true`
- `vite.config.ts` — add conditional `resolve.alias` block guarded by `VITE_WEB_ONLY`
- `src/App.tsx` — add `data-testid` to sidebar `<aside>`, sidebar toggle `<button>`, and each tab panel `<div>`
- `src/landing/components/Hero.tsx` — add `data-testid="hero"` to `<section>`
- `src/landing/components/DownloadSection.tsx` — add `data-testid="download-section"` to root `<section>`

---

## Task 1: Dependency cleanup & update dev:web script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move playwright packages to devDependencies**

In `package.json`, move both `@playwright/test` and `playwright` from `"dependencies"` to `"devDependencies"`. No version changes.

- [ ] **Step 2: Add VITE_WEB_ONLY to dev:web script**

Change the `dev:web` script from:
```json
"dev:web": "vite"
```
to:
```json
"dev:web": "VITE_WEB_ONLY=true vite"
```

- [ ] **Step 3: Add test:e2e scripts**

Add to `"scripts"`:
```json
"test:e2e": "playwright test",
"test:e2e:landing": "playwright test --project=landing",
"test:e2e:app": "playwright test --project=app",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Verify lint still passes**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: move playwright to devDeps, add test:e2e scripts, set VITE_WEB_ONLY"
```

---

## Task 2: Create Vite stub files for Tauri packages

**Files:**
- Create: `src/mocks/tauri-plugins/deep-link.ts`
- Create: `src/mocks/tauri-plugins/api-core.ts`

These stubs are loaded by Vite when `VITE_WEB_ONLY=true` (i.e., `npm run dev:web` and Playwright's `webServer`). They replace the real Tauri packages with safe no-ops that work in a plain browser context.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/mocks/tauri-plugins
```

- [ ] **Step 2: Create deep-link stub**

Create `src/mocks/tauri-plugins/deep-link.ts`:
```ts
// Stub for @tauri-apps/plugin-deep-link — used in dev:web / Playwright mode only.
// App.tsx imports onOpenUrl from this package; it crashes at import in non-Tauri context.
export const onOpenUrl = (_handler: (urls: string[]) => void) => {
  return Promise.resolve(() => { /* cleanup noop */ });
};
```

- [ ] **Step 3: Create api-core stub**

Create `src/mocks/tauri-plugins/api-core.ts`:
```ts
// Stub for @tauri-apps/api/core — used in dev:web / Playwright mode only.
// Delegates to window.__TAURI_INTERNALS__.invoke, which Playwright's addInitScript
// fixture populates before each test with per-command mock responses.
export const invoke = async <T>(cmd: string, _args?: unknown): Promise<T> => {
  const internals = (window as Record<string, unknown>)['__TAURI_INTERNALS__'] as
    { invoke?: (cmd: string) => Promise<T> } | undefined;
  if (internals?.invoke) {
    return internals.invoke(cmd);
  }
  throw new Error(`[dev:web] Tauri mock not initialised for command: ${cmd}`);
};
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/mocks/tauri-plugins/
git commit -m "feat: add Vite stub files for Tauri plugins (dev:web / Playwright mode)"
```

---

## Task 3: Update vite.config.ts with conditional alias

**Files:**
- Modify: `vite.config.ts`

The alias must only activate when `VITE_WEB_ONLY=true`. Do NOT apply it unconditionally — that would replace the real Tauri packages during `tauri dev` and `tauri build`.

- [ ] **Step 1: Add path import and conditional alias**

In `vite.config.ts`, add `import { resolve } from 'path';` at the top (after the existing imports), then inside the `defineConfig` async callback, spread the conditional block into the config object:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const isWebOnly = process.env.VITE_WEB_ONLY === 'true';

export default defineConfig(async () => ({
  plugins: [react()],

  // Conditional aliases: only active in dev:web / Playwright mode.
  // Guards tauri dev and tauri build from receiving stubs.
  ...(isWebOnly ? {
    resolve: {
      alias: {
        '@tauri-apps/plugin-deep-link': resolve(__dirname, 'src/mocks/tauri-plugins/deep-link.ts'),
        '@tauri-apps/api/core': resolve(__dirname, 'src/mocks/tauri-plugins/api-core.ts'),
      },
    },
  } : {}),

  // ... rest of existing config unchanged
}));
```

- [ ] **Step 2: Verify dev:web starts without crashing**

Run: `npm run dev:web`
Expected: Vite starts on port 1420 with no "module not found" or "must be run as Tauri" errors in the console. Open `http://localhost:1420` — the app should render (or show the onboarding wizard if mock isn't injected yet). Stop the server (Ctrl+C).

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add conditional Vite alias for Tauri stubs in dev:web / Playwright mode"
```

---

## Task 4: Add data-testid attributes to React components

**Files:**
- Modify: `src/App.tsx` (lines ~453, ~465, ~821–879 for tab panels)
- Modify: `src/landing/components/Hero.tsx` (line 5)
- Modify: `src/landing/components/DownloadSection.tsx` (line 26)

These attributes are required by the POM classes. Add them without changing any logic.

- [ ] **Step 1: Add data-testid to App.tsx sidebar `<aside>`**

In `src/App.tsx`, find the `<aside` opening tag in `renderSidebar()`:
```tsx
<aside
  className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
  role="navigation"
  aria-label="Main navigation"
>
```
Add `data-testid="sidebar"`:
```tsx
<aside
  className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
  role="navigation"
  aria-label="Main navigation"
  data-testid="sidebar"
>
```

- [ ] **Step 2: Add data-testid to sidebar toggle button**

Find the sidebar toggle `<button`:
```tsx
<button
  className="sidebar-toggle"
  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
>
```
Add `data-testid="sidebar-toggle"`:
```tsx
<button
  className="sidebar-toggle"
  data-testid="sidebar-toggle"
  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
>
```

- [ ] **Step 3: Add data-testid to tab panel wrappers in the main return**

Two different patterns exist in App.tsx:

**Pattern A — tabs with `<div className="animate-fade-in">` wrapper** (dashboard, vibe-studio): add `data-testid` directly to the existing div:
```tsx
{activeTab === "dashboard" && (
  <div className="animate-fade-in" data-testid="tab-panel-dashboard">
    <Dashboard ... />
  </div>
)}
```
Apply the same to `vibe-studio` → `data-testid="tab-panel-vibe-studio"`.

**Pattern B — Suspense-wrapped tabs** (saved-portfolios, portfolio, backtest, journal — these render `<Suspense fallback={<TabLoading />}>` with no outer `<div>`): wrap the entire conditional in a `<div data-testid="tab-panel-{name}">`:
```tsx
{activeTab === "saved-portfolios" && (
  <div data-testid="tab-panel-saved-portfolios">
    <Suspense fallback={<TabLoading />}>
      <SavedPortfoliosTab ... />
    </Suspense>
  </div>
)}
```
Apply the same wrapper to: `portfolio` → `tab-panel-portfolio`, `backtest` → `tab-panel-backtest`, `journal` → `tab-panel-journal`.

> Note: The app also has tabs rendered directly without animation wrappers (templates, data, rankings, etc.). Only wrap the 6 tabs needed for tests (dashboard, vibe-studio, saved-portfolios, portfolio, backtest, journal).

- [ ] **Step 4: Add data-testid to Hero section**

In `src/landing/components/Hero.tsx`, find:
```tsx
<section className="landing-hero">
```
Change to:
```tsx
<section className="landing-hero" data-testid="hero">
```

- [ ] **Step 5: Add data-testid to DownloadSection**

In `src/landing/components/DownloadSection.tsx`, find:
```tsx
<section className="landing-download-section" id="download">
```
Change to:
```tsx
<section className="landing-download-section" id="download" data-testid="download-section">
```

- [ ] **Step 6: Verify lint passes**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/landing/components/Hero.tsx src/landing/components/DownloadSection.tsx
git commit -m "feat: add data-testid attributes for Playwright E2E selectors"
```

---

## Task 5: Create playwright.config.ts

**Files:**
- Create: `playwright.config.ts`

- [ ] **Step 1: Create the config**

Create `playwright.config.ts` at the project root:
```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  // Global test timeout
  timeout: 30000,
  // Fail fast in CI
  forbidOnly: isCI,
  // Retry once on CI to reduce flake
  retries: isCI ? 1 : 0,
  // Parallelism
  workers: isCI ? 1 : undefined,
  // HTML reporter
  reporter: [['html', { open: 'never' }]],

  webServer: [
    {
      command: 'npm run dev:web',
      url: 'http://localhost:1420',
      reuseExistingServer: !isCI,
      timeout: 30000,
    },
    {
      command: 'npm run dev:landing',
      url: 'http://localhost:3000/flowfolio/landing.html',
      reuseExistingServer: !isCI,
      timeout: 30000,
    },
  ],

  projects: [
    // CI projects (Chromium only)
    {
      name: 'landing',
      testDir: './e2e/landing',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
    },
    {
      name: 'app',
      testDir: './e2e/app',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:1420',
      },
    },
    // Local-only: Firefox and WebKit (split per surface for correct baseURL)
    ...(!isCI ? [
      {
        name: 'firefox-landing',
        testDir: './e2e/landing',
        use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:3000' },
      },
      {
        name: 'firefox-app',
        testDir: './e2e/app',
        use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:1420' },
      },
      {
        name: 'webkit-landing',
        testDir: './e2e/landing',
        use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:3000' },
      },
      {
        name: 'webkit-app',
        testDir: './e2e/app',
        use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:1420' },
      },
    ] : []),
  ],
});
```

- [ ] **Step 2: Verify playwright can find the config**

Run: `npx playwright test --list`
Expected: Output lists the projects (landing, app). May show 0 tests found (no spec files yet) — that's fine.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "feat: add playwright.config.ts with dual-project config and webServer"
```

---

## Task 6: Create Tauri mock fixture and Page Object Models

**Files:**
- Create: `e2e/fixtures/tauri-mock.ts`
- Create: `e2e/pages/LandingPage.ts`
- Create: `e2e/pages/AppPage.ts`
- Create: `e2e/pages/DashboardPage.ts` — POM for the dashboard tab
- Create: `e2e/pages/VibeStudioPage.ts`
- Create: `e2e/pages/PortfolioPage.ts`
- Create: `e2e/pages/BacktestPage.ts`
- Create: `e2e/pages/JournalPage.ts`

- [ ] **Step 1: Create the e2e directories**

```bash
mkdir -p e2e/fixtures e2e/pages e2e/landing e2e/app
```

- [ ] **Step 2: Create tauri-mock.ts fixture**

Create `e2e/fixtures/tauri-mock.ts`:
```ts
import { test as base } from '@playwright/test';

// Mock responses keyed by Tauri command name.
// args are INTENTIONALLY IGNORED at both the stub layer (api-core.ts) and here.
// All commands return valid non-null data to prevent circuit breaker retries.
// CRITICAL: load_setting MUST return 'true' to bypass the OnboardingWizard gate in App.tsx.
const MOCK_RESPONSES: Record<string, unknown> = {
  load_setting: 'true',
  health_check: 'ok',
  list_templates: [],
  get_default_plan: null,
  list_universes: [],
  list_saved_plans: [],
  get_current_prices_batch: {},
  list_vibe_plans: [],
  get_portfolios: [],
  list_journal_entries: [],
  get_journal_stats: { total: 0, by_type: {} },
  get_backtest_results: [],
  // Return a minimal valid object (not null) — VibeStudio may destructure this.
  compile_plan: { symbols: [], weights: {}, description: '' },
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((responses) => {
      (window as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
        invoke: (cmd: string) => Promise.resolve(responses[cmd] ?? null),
      };
    }, MOCK_RESPONSES);
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: Create LandingPage POM**

Create `e2e/pages/LandingPage.ts`:
```ts
import { Page } from '@playwright/test';

export class LandingPage {
  constructor(private page: Page) {}

  // Landing page lives at /flowfolio/landing.html due to base: "/flowfolio/" in vite.landing.config.ts
  async goto() {
    await this.page.goto('/flowfolio/landing.html');
  }

  hero() {
    return this.page.locator('[data-testid="hero"]');
  }

  heroTitle() {
    return this.page.locator('[data-testid="hero"] h1');
  }

  navbar() {
    // ARIA-first: landing page has one nav element
    return this.page.getByRole('navigation');
  }

  navLink(text: string) {
    return this.page.getByRole('navigation').getByRole('link', { name: text });
  }

  downloadSection() {
    return this.page.locator('[data-testid="download-section"]');
  }

  platformButton(name: string) {
    return this.page.locator('[data-testid="download-section"]').getByText(name);
  }
}
```

- [ ] **Step 4: Create AppPage POM**

Create `e2e/pages/AppPage.ts`:
```ts
import { Page } from '@playwright/test';

export class AppPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  sidebar() {
    return this.page.locator('[data-testid="sidebar"]');
  }

  sidebarToggle() {
    return this.page.locator('[data-testid="sidebar-toggle"]');
  }

  // Sidebar nav buttons use role="menuitem" — NOT role="button"
  async navigateToTab(name: string) {
    await this.page.getByRole('menuitem', { name, exact: false }).click();
  }

  async toggleSidebar() {
    await this.page.locator('[data-testid="sidebar-toggle"]').click();
  }

  tabPanel(name: string) {
    return this.page.locator(`[data-testid="tab-panel-${name}"]`);
  }
}
```

- [ ] **Step 5: Create DashboardPage POM**

Create `e2e/pages/DashboardPage.ts`:
```ts
import { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class DashboardPage {
  private app: AppPage;

  constructor(private page: Page) {
    this.app = new AppPage(page);
  }

  async goto() {
    await this.app.goto();
    // Dashboard is the default tab — no navigation needed
  }

  tabPanel() {
    return this.page.locator('[data-testid="tab-panel-dashboard"]');
  }
}
```

- [ ] **Step 6: Create VibeStudioPage POM**

Create `e2e/pages/VibeStudioPage.ts`:
```ts
import { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class VibeStudioPage {
  private app: AppPage;

  constructor(private page: Page) {
    this.app = new AppPage(page);
  }

  async goto() {
    await this.app.goto();
    await this.app.navigateToTab('Vibe Studio');
  }

  tabPanel() {
    return this.page.locator('[data-testid="tab-panel-vibe-studio"]');
  }

  planNameInput() {
    return this.page.getByRole('textbox', { name: /plan name/i });
  }

  compilePlanButton() {
    return this.page.getByRole('button', { name: /compile/i });
  }

  // Factor weight inputs (there may be several — first() is used in tests)
  weightInputs() {
    return this.page.locator('input[type="range"], input[type="number"]').filter({ hasText: /weight|factor/i });
  }
}
```

- [ ] **Step 7: Create PortfolioPage POM**

Create `e2e/pages/PortfolioPage.ts`:
```ts
import { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class PortfolioPage {
  private app: AppPage;

  constructor(private page: Page) {
    this.app = new AppPage(page);
  }

  async goto() {
    await this.app.goto();
    await this.app.navigateToTab('Portfolio');
  }

  tabPanel() {
    return this.page.locator('[data-testid="tab-panel-portfolio"]');
  }

  symbolInput() {
    return this.page.getByRole('textbox', { name: /symbol|ticker/i });
  }
}
```

- [ ] **Step 8: Create BacktestPage POM**

Create `e2e/pages/BacktestPage.ts`:
```ts
import { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class BacktestPage {
  private app: AppPage;

  constructor(private page: Page) {
    this.app = new AppPage(page);
  }

  async goto() {
    await this.app.goto();
    await this.app.navigateToTab('Backtest');
  }

  tabPanel() {
    return this.page.locator('[data-testid="tab-panel-backtest"]');
  }

  runButton() {
    return this.page.getByRole('button', { name: /run backtest/i });
  }
}
```

- [ ] **Step 9: Create JournalPage POM**

Create `e2e/pages/JournalPage.ts`:
```ts
import { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class JournalPage {
  private app: AppPage;

  constructor(private page: Page) {
    this.app = new AppPage(page);
  }

  async goto() {
    await this.app.goto();
    await this.app.navigateToTab('Journal');
  }

  tabPanel() {
    return this.page.locator('[data-testid="tab-panel-journal"]');
  }

  newEntryButton() {
    return this.page.getByRole('button', { name: /new entry/i });
  }
}
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 11: Commit**

```bash
git add e2e/
git commit -m "feat: add Playwright fixture and Page Object Model classes"
```

---

## Task 7: Landing page specs

**Files:**
- Create: `e2e/landing/smoke.spec.ts`
- Create: `e2e/landing/navigation.spec.ts`
- Create: `e2e/landing/download.spec.ts`

Landing specs use `@playwright/test` directly (no Tauri mock needed — landing page has no Tauri calls).

- [ ] **Step 1: Write landing smoke test**

Create `e2e/landing/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';

test.describe('Landing page smoke', () => {
  test('page loads and hero title is visible', async ({ page }) => {
    const landing = new LandingPage(page);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await landing.goto();

    await expect(landing.hero()).toBeVisible();
    await expect(landing.heroTitle()).toContainText('Privacy-First Portfolio');
    expect(errors).toHaveLength(0);
  });

  test('navbar renders with navigation links', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.navbar()).toBeVisible();
    await expect(landing.navLink('Features')).toBeVisible();
    await expect(landing.navLink('Download')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run smoke test to verify it passes**

Run: `npm run test:e2e:landing -- --grep "Landing page smoke"`
Expected: 2 tests pass

- [ ] **Step 3: Write landing navigation test**

Create `e2e/landing/navigation.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';

test.describe('Landing page navigation', () => {
  test('Download nav link has href pointing to #download', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const downloadLink = landing.navLink('Download');
    await expect(downloadLink).toHaveAttribute('href', '#download');
  });

  test('Download CTA button in hero links to #download', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    const cta = page.locator('a[href="#download"]').first();
    await expect(cta).toBeVisible();
  });
});
```

- [ ] **Step 4: Run navigation test**

Run: `npm run test:e2e:landing -- --grep "Landing page navigation"`
Expected: 2 tests pass

- [ ] **Step 5: Write download section test**

Create `e2e/landing/download.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';

test.describe('Download section', () => {
  test('download section renders with platform buttons', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.downloadSection()).toBeVisible();
  });

  test('Windows platform button is visible', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.platformButton('Windows')).toBeVisible();
  });

  test('macOS platform button is visible', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.platformButton('macOS')).toBeVisible();
  });

  test('Linux platform button is visible', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();
    await expect(landing.platformButton('Linux')).toBeVisible();
  });
});
```

- [ ] **Step 6: Run download test**

Run: `npm run test:e2e:landing -- --grep "Download section"`
Expected: 4 tests pass

- [ ] **Step 7: Run all landing tests**

Run: `npm run test:e2e:landing`
Expected: All 8 landing tests pass across Chromium (CI only, no Firefox/WebKit yet)

- [ ] **Step 8: Commit**

```bash
git add e2e/landing/
git commit -m "test: add landing page E2E specs (smoke, navigation, download)"
```

---

## Task 8: App smoke and navigation specs

**Files:**
- Create: `e2e/app/smoke.spec.ts`
- Create: `e2e/app/navigation.spec.ts`

App specs use the custom `test` from `e2e/fixtures/tauri-mock.ts` (not `@playwright/test` directly) to inject the Tauri mock.

- [ ] **Step 1: Write app smoke test**

Create `e2e/app/smoke.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { AppPage } from '../pages/AppPage';

test.describe('App smoke', () => {
  test('app loads without crashing', async ({ page }) => {
    const app = new AppPage(page);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await app.goto();

    await expect(app.sidebar()).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('Dashboard tab is active by default', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    await expect(app.tabPanel('dashboard')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run app smoke test**

Run: `npm run test:e2e:app -- --grep "App smoke"`
Expected: 2 tests pass

- [ ] **Step 3: Write app navigation test**

Create `e2e/app/navigation.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { AppPage } from '../pages/AppPage';

test.describe('App navigation', () => {
  test('navigating to Vibe Studio shows its tab panel', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigateToTab('Vibe Studio');
    await expect(app.tabPanel('vibe-studio')).toBeVisible();
  });

  test('navigating to Saved Portfolios shows its tab panel', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigateToTab('Saved Portfolios');
    await expect(app.tabPanel('saved-portfolios')).toBeVisible();
  });

  test('sidebar collapse toggle hides sidebar text', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    // Sidebar should start expanded
    await expect(app.sidebar()).toBeVisible();

    // Toggle to collapse
    await app.toggleSidebar();
    await expect(app.sidebar()).toHaveClass(/collapsed/);

    // Toggle back to expand
    await app.toggleSidebar();
    await expect(app.sidebar()).not.toHaveClass(/collapsed/);
  });
});
```

- [ ] **Step 4: Run navigation test**

Run: `npm run test:e2e:app -- --grep "App navigation"`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add e2e/app/smoke.spec.ts e2e/app/navigation.spec.ts
git commit -m "test: add app smoke and navigation E2E specs"
```

---

## Task 9: App feature specs (vibe-studio, portfolio, backtest, journal)

**Files:**
- Create: `e2e/app/vibe-studio.spec.ts`
- Create: `e2e/app/portfolio.spec.ts`
- Create: `e2e/app/backtest.spec.ts`
- Create: `e2e/app/journal.spec.ts`

- [ ] **Step 1: Write Vibe Studio spec**

Create `e2e/app/vibe-studio.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { VibeStudioPage } from '../pages/VibeStudioPage';

test.describe('Vibe Studio tab', () => {
  test('tab loads and panel is visible', async ({ page }) => {
    const vs = new VibeStudioPage(page);
    await vs.goto();
    await expect(vs.tabPanel()).toBeVisible();
  });

  test('Compile Plan button is present', async ({ page }) => {
    const vs = new VibeStudioPage(page);
    await vs.goto();
    await expect(vs.compilePlanButton()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run Vibe Studio spec**

Run: `npm run test:e2e:app -- --grep "Vibe Studio tab"`
Expected: 2 tests pass. If a test fails due to missing selector, update the POM in `e2e/pages/VibeStudioPage.ts` to match the actual rendered element (do not change the spec logic).

- [ ] **Step 3: Write Portfolio spec**

Create `e2e/app/portfolio.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { PortfolioPage } from '../pages/PortfolioPage';
import { AppPage } from '../pages/AppPage';

test.describe('Portfolio tab', () => {
  test('tab loads and panel is visible', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigateToTab('Portfolio');
    await expect(app.tabPanel('portfolio')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run Portfolio spec**

Run: `npm run test:e2e:app -- --grep "Portfolio tab"`
Expected: 1 test passes

- [ ] **Step 5: Write Backtest spec**

Create `e2e/app/backtest.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { AppPage } from '../pages/AppPage';
import { BacktestPage } from '../pages/BacktestPage';

test.describe('Backtest tab', () => {
  test('tab loads and panel is visible', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigateToTab('Backtest');
    await expect(app.tabPanel('backtest')).toBeVisible();
  });

  test('Run Backtest button is present', async ({ page }) => {
    const bt = new BacktestPage(page);
    await bt.goto();
    await expect(bt.runButton()).toBeVisible();
  });
});
```

- [ ] **Step 6: Run Backtest spec**

Run: `npm run test:e2e:app -- --grep "Backtest tab"`
Expected: 2 tests pass

- [ ] **Step 7: Write Journal spec**

Create `e2e/app/journal.spec.ts`:
```ts
import { test, expect } from '../fixtures/tauri-mock';
import { AppPage } from '../pages/AppPage';
import { JournalPage } from '../pages/JournalPage';

test.describe('Journal tab', () => {
  test('tab loads and panel is visible', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigateToTab('Journal');
    await expect(app.tabPanel('journal')).toBeVisible();
  });

  test('New Entry button is present', async ({ page }) => {
    const journal = new JournalPage(page);
    await journal.goto();
    await expect(journal.newEntryButton()).toBeVisible();
  });
});
```

- [ ] **Step 8: Run Journal spec**

Run: `npm run test:e2e:app -- --grep "Journal tab"`
Expected: 2 tests pass

- [ ] **Step 9: Run all app tests**

Run: `npm run test:e2e:app`
Expected: All app tests pass

- [ ] **Step 10: Commit**

```bash
git add e2e/app/vibe-studio.spec.ts e2e/app/portfolio.spec.ts e2e/app/backtest.spec.ts e2e/app/journal.spec.ts
git commit -m "test: add E2E specs for vibe-studio, portfolio, backtest, journal tabs"
```

---

## Task 10: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create the workflow directory if needed**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create the workflow file**

Create `.github/workflows/e2e.yml`:
```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

      - name: Upload Playwright report on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Run a full local test to verify all tests pass before pushing**

Run: `npm run test:e2e`
Expected: All tests in both `landing` and `app` projects pass (Chromium only since `CI` is not set locally, but you can simulate CI with `CI=true npm run test:e2e`)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add GitHub Actions E2E workflow for Playwright tests"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run the full suite locally**

Run: `npm run test:e2e`
Expected: All tests pass (6 projects if not setting CI=true: landing, app, firefox-landing, firefox-app, webkit-landing, webkit-app)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Run existing unit tests to confirm nothing was broken**

Run: `npm test`
Expected: All Vitest unit tests pass

- [ ] **Step 4: Final commit if anything was missed**

```bash
git add -A
git status  # verify only expected files are changed
git commit -m "chore: final E2E setup cleanup"
```

---

## Troubleshooting Guide

**App shows spinner or OnboardingWizard instead of main UI:**
The `load_setting` mock must return the string `'true'`. Check that `MOCK_RESPONSES` in `e2e/fixtures/tauri-mock.ts` has `load_setting: 'true'` and that the fixture is imported from the right path in the spec file.

**"Tauri mock not initialised for command: X" error:**
A Tauri command was called that isn't in `MOCK_RESPONSES`. Add it with a valid empty response (e.g., `[]]` for lists, `{}` for objects, `'ok'` for strings).

**Playwright times out waiting for dev server:**
- Verify `npm run dev:web` starts successfully: `VITE_WEB_ONLY=true npx vite`
- Verify `npm run dev:landing` starts: `npx vite --config vite.landing.config.ts`
- Increase `timeout` in `playwright.config.ts` `webServer` block

**`data-testid` not found:**
Check that the data-testid attribute was added to the correct element in the source file. Use `npx playwright test --ui` to visually inspect the DOM.

**POM method can't find an element:**
Open the app in `npm run dev:web`, inspect the element, and update the selector in the relevant POM file. Never update selector logic inside spec files — always put it in the POM.
