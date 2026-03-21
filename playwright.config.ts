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
