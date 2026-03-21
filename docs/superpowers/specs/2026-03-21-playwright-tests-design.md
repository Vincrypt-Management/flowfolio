# Playwright E2E Test Suite — Design Spec

**Date:** 2026-03-21
**Status:** Ready for Implementation — Prerequisites Required (see Vite Alias Stubs and data-testid sections)

## Overview

Add a Playwright end-to-end test suite covering two surfaces of the FlowFolio product:

1. **Landing page** — static React marketing site (`npm run dev:landing`)
2. **Main app in web mode** — full React app without Rust backend (`npm run dev:web`)

Tests run locally and in CI (GitHub Actions) on every push/PR.

> **CI note:** The CI workflow will not pass until the Vite alias stubs prerequisite (Step 1) is completed. That step must be done before the GitHub Actions workflow is considered functional.

---

## Ports & Entry Points

Verified from Vite configs:

| Surface | Dev Server Command | Port | Readiness URL |
|---------|-------------------|------|--------------|
| Main app | `npm run dev:web` | `1420` (strictPort) | `http://localhost:1420` |
| Landing page | `npm run dev:landing` | `3000` | `http://localhost:3000/flowfolio/landing.html` |

> **Landing page URL:** `vite.landing.config.ts` sets `base: "/flowfolio/"`. With this base, Vite dev server serves the landing HTML at `/flowfolio/landing.html`. All landing tests navigate to `/flowfolio/landing.html`. The `webServer` readiness URL uses this same path — Vite's root `/` returns 404 with a non-root base, so only the full path reliably returns 200.

---

## Architecture

### Single Config, Two Named Projects + Multi-Browser (Option C)

One `playwright.config.ts` defines named projects. The `webServer` config is an **array** of two objects (required for running both projects simultaneously).

Multi-browser is environment-aware:
- **CI:** Chromium only
- **Local:** Chromium + Firefox + WebKit. Since landing and app tests have different `baseURL`s, Firefox and WebKit are split into separate projects per surface (4 local projects total beyond the 2 CI ones).

```ts
// playwright.config.ts (structure)
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
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
    // --- CI projects (Chromium) ---
    {
      name: 'landing',
      testDir: './e2e/landing',
      use: { baseURL: 'http://localhost:3000' },
    },
    {
      name: 'app',
      testDir: './e2e/app',
      use: { baseURL: 'http://localhost:1420' },
    },
    // --- Local-only: Firefox and WebKit (split per surface for correct baseURL) ---
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

**npm scripts:**
```bash
npm run test:e2e                   # all tests
npm run test:e2e:landing           # landing only
npm run test:e2e:app               # app only
npm run test:e2e:ui                # interactive Playwright UI
```

---

## File Structure

```
flowfolio/
├── playwright.config.ts
├── src/
│   └── mocks/
│       └── tauri-plugins/
│           ├── deep-link.ts       # Stub for @tauri-apps/plugin-deep-link
│           └── api-core.ts        # Stub for @tauri-apps/api/core (see below)
├── e2e/
│   ├── fixtures/
│   │   └── tauri-mock.ts          # Custom test fixture with Tauri mock data
│   ├── pages/                     # Page Object Model classes
│   │   ├── LandingPage.ts
│   │   ├── AppPage.ts
│   │   ├── DashboardPage.ts
│   │   ├── VibeStudioPage.ts
│   │   ├── PortfolioPage.ts
│   │   ├── BacktestPage.ts
│   │   └── JournalPage.ts
│   ├── landing/
│   │   ├── smoke.spec.ts
│   │   ├── navigation.spec.ts
│   │   └── download.spec.ts
│   └── app/
│       ├── smoke.spec.ts
│       ├── navigation.spec.ts
│       ├── vibe-studio.spec.ts
│       ├── portfolio.spec.ts
│       ├── backtest.spec.ts
│       └── journal.spec.ts
```

---

## Prerequisites: Vite Alias Stubs (Step 1 of Implementation)

**This must be done before `npm run dev:web` can function and before CI will pass.**

`App.tsx` imports `@tauri-apps/plugin-deep-link` at the module level, and `src/services/tauri.ts` imports from `@tauri-apps/api/core`. Both must be aliased in `vite.config.ts`:

### Why `@tauri-apps/api/core` needs an alias

`src/services/tauri.ts` imports `tauriInvoke` from `@tauri-apps/api/core` at the module level. While `@tauri-apps/api/core` v2 is designed to be importable in non-Tauri contexts, its `invoke()` dispatch mechanism reads from `window.__TAURI_INTERNALS__` at call time. However, because the `addInitScript` mock (see Tauri Mocking Strategy) depends on this routing being correct, and the behavior of `@tauri-apps/api/core`'s internal dispatch cannot be fully verified without running it, the safer approach is to alias `@tauri-apps/api/core` to a local stub that directly returns mock fixture data. This eliminates the dependency on `@tauri-apps/api/core`'s internal implementation details.

### Alias config

Add to `vite.config.ts` inside the `defineConfig` async callback. The alias **must be conditional** — it must only apply when running in web mode (`dev:web`), not during `tauri dev` or `tauri build`.

**Guard approach:** Use a dedicated `VITE_WEB_ONLY` env var set explicitly by the `dev:web` npm script. Do NOT use `TAURI_DEV_HOST` — that env var is only set for remote device targets, not for a standard local `tauri dev` run.

**Step 1:** Update `package.json`:
```json
"dev:web": "VITE_WEB_ONLY=true vite"
```

**Step 2:** Add the conditional alias to `vite.config.ts`:
```ts
import { resolve } from 'path';

// Inside defineConfig (alongside the existing config):
...(process.env.VITE_WEB_ONLY === 'true' ? {
  resolve: {
    alias: {
      '@tauri-apps/plugin-deep-link': resolve(__dirname, 'src/mocks/tauri-plugins/deep-link.ts'),
      '@tauri-apps/api/core': resolve(__dirname, 'src/mocks/tauri-plugins/api-core.ts'),
    },
  },
} : {}),
```

> **Why VITE_WEB_ONLY?** `TAURI_DEV_HOST` is only set for remote device builds, not for local `tauri dev`. Using an explicit opt-in var ensures `tauri dev` and `tauri build` always use the real Tauri packages. `VITE_WEB_ONLY` is also set by Playwright's `webServer` command, so CI runs correctly without extra configuration.

### Stub files

```ts
// src/mocks/tauri-plugins/deep-link.ts
export const onOpenUrl = (_handler: (urls: string[]) => void) => {
  return Promise.resolve(() => { /* cleanup noop */ });
};
```

```ts
// src/mocks/tauri-plugins/api-core.ts
// In dev:web mode, tauriInvoke is replaced by this stub.
// The Playwright fixture (tauri-mock.ts) overrides window.__TAURI_INTERNALS__ at test time
// to inject per-command mock responses. This stub delegates to that runtime mock.
export const invoke = async <T>(cmd: string, _args?: unknown): Promise<T> => {
  const internals = (window as Record<string, unknown>)['__TAURI_INTERNALS__'] as
    { invoke?: (cmd: string) => Promise<T> } | undefined;
  if (internals?.invoke) {
    return internals.invoke(cmd);
  }
  throw new Error(`[dev:web] Tauri mock not initialised for command: ${cmd}`);
};
```

This design keeps a clean separation: the Vite alias makes the import safe; the Playwright `addInitScript` mock provides per-command responses at test time.

---

## Tauri Mocking Strategy

### Critical: Onboarding gate

`App.tsx` calls `invokeWithResilience('load_setting', { key: 'onboarding_complete' })` on mount. Three possible states:
- `null` (loading) → full-screen spinner — app is not visible
- `false` → `OnboardingWizard` — app is not visible
- `true` → main app renders

**The mock must return `'true'` for `load_setting`.** The mock ignores `args` — all `load_setting` calls return `'true'` regardless of key. This is intentional; document as a known limitation if future tests need per-key granularity.

### Circuit breaker

`apiClient.ts` has `MAX_RETRIES = 3`, `INITIAL_DELAY = 100ms`, exponential backoff up to `MAX_DELAY = 5000ms`, and opens after 5 failures. **All mocked commands must return valid data (arrays, objects, strings) — never reject.** A rejecting mock triggers retries and eventually opens the circuit breaker, causing slow or flaky tests.

### Custom test fixture

All app specs import `test` and `expect` from `e2e/fixtures/tauri-mock.ts`:

```ts
// e2e/fixtures/tauri-mock.ts
import { test as base } from '@playwright/test';

// NOTE: args are ignored — command name is the only key.
// This is intentional: simple mocks for smoke/regression tests.
const MOCK_RESPONSES: Record<string, unknown> = {
  load_setting: 'true',          // CRITICAL: bypasses OnboardingWizard
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
  // compile_plan: return a minimal valid plan object, not null.
  // The VibeStudio component may destructure the result; null would crash it.
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

### Per-spec minimum mock commands

| Spec | Commands needed |
|------|----------------|
| `smoke.spec.ts` | `load_setting`, `health_check`, `list_templates`, `get_default_plan`, `list_universes`, `list_saved_plans`, `get_current_prices_batch` |
| `navigation.spec.ts` | same as smoke |
| `vibe-studio.spec.ts` | above + `list_vibe_plans`, `compile_plan` |
| `portfolio.spec.ts` | above + `get_portfolios` |
| `backtest.spec.ts` | above + `get_backtest_results` |
| `journal.spec.ts` | above + `list_journal_entries`, `get_journal_stats` |

All covered by `MOCK_RESPONSES`. Extend the map if new commands are encountered during implementation.

---

## Page Object Model

Selectors are never hardcoded in spec files. Each POM class owns the selectors for its surface.

**ARIA role note:** Sidebar nav buttons use `role="menuitem"`. Use `getByRole('menuitem')`, not `getByRole('button')`.

```ts
// e2e/pages/AppPage.ts
import { Page } from '@playwright/test';

export class AppPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/'); }
  sidebar() { return this.page.locator('[data-testid="sidebar"]'); }
  async navigateToTab(name: string) {
    await this.page.getByRole('menuitem', { name, exact: false }).click();
  }
  async toggleSidebar() {
    await this.page.locator('[data-testid="sidebar-toggle"]').click();
  }
}
```

```ts
// e2e/pages/LandingPage.ts
import { Page } from '@playwright/test';

export class LandingPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/flowfolio/landing.html'); }
  hero() { return this.page.locator('[data-testid="hero"]'); }
  downloadSection() { return this.page.locator('[data-testid="download-section"]'); }
  navbar() { return this.page.getByRole('navigation'); }
}
```

---

## Test Coverage

### Landing Page

| Spec | Tests |
|------|-------|
| `smoke.spec.ts` | Page loads, hero title visible, navbar renders, no uncaught console errors |
| `navigation.spec.ts` | Nav anchor links scroll to correct sections; "Download now" CTA links to `#download` |
| `download.spec.ts` | Download section renders; Windows/macOS/Linux platform icons visible |

### Main App

| Spec | Tests |
|------|-------|
| `smoke.spec.ts` | App mounts without crash, sidebar visible, Dashboard tab active by default |
| `navigation.spec.ts` | Each sidebar tab navigates to its panel; sidebar collapse/expand works |
| `vibe-studio.spec.ts` | Factor weights section renders; weight inputs adjustable; Compile Plan button interactive; plan name input accepts text |
| `portfolio.spec.ts` | Portfolio tab loads; symbol input accepts ticker text; holdings area renders |
| `backtest.spec.ts` | Backtest form renders; date/symbol inputs accept values; Run Backtest button clickable |
| `journal.spec.ts` | Journal tab loads; new entry form opens; form fields accept input |

---

## CI Configuration

**`.github/workflows/e2e.yml`:**

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

- **CI browsers:** Chromium only
- **Local browsers:** Chromium + Firefox + WebKit (6 projects total)
- **Failure artifacts:** HTML report on failure

---

## npm Scripts

Add to `package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:landing": "playwright test --project=landing",
"test:e2e:app": "playwright test --project=app",
"test:e2e:ui": "playwright test --ui"
```

---

## data-testid Additions Required (Step 2 of Implementation)

| Component | Element | data-testid |
|-----------|---------|-------------|
| `App.tsx` | `<aside>` sidebar container | `sidebar` |
| `App.tsx` | Sidebar collapse/expand `<button>` (`className="sidebar-toggle"`) | `sidebar-toggle` |
| `App.tsx` | Each tab panel wrapper `<div>` | `tab-panel-{name}` |
| `Hero.tsx` | Hero `<section>` | `hero` |
| `DownloadSection.tsx` | Download section root element | `download-section` |

---

## Dependency Cleanup

Move `@playwright/test` and `playwright` from `dependencies` to `devDependencies` in `package.json`.

---

## Constraints & Decisions

- **No Tauri WebDriver** — full desktop testing out of scope; web mode is sufficient for UI regression.
- **No visual regression** — screenshot diffing out of scope for this iteration.
- **Fixtures over real data** — all `invoke()` responses use static fixtures; no live API calls.
- **ARIA-first selectors** — `getByRole`, `getByLabel`, `getByText` preferred; `data-testid` as fallback.
- **Mock ignores args at two layers** — The `api-core.ts` stub drops `args` before delegating to `window.__TAURI_INTERNALS__.invoke(cmd)`, and the Playwright fixture's mock also ignores `args`. Both layers are intentional simplifications for this iteration. If a future command needs per-args responses (e.g., `load_setting` with different keys returning different values), the stub's arg-drop must be addressed first — it is a harder constraint than the fixture-level limitation.
- **Vite stubs are CI-blocking prerequisites** — must be applied before any test run.
