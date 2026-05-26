import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Use Vite's production preview server by default. The dev server triggers
// "504 Outdated Optimize Dep" responses mid-suite when lazy chunks load,
// which crashes ErrorBoundary; preview serves prebuilt static files and is
// stable. Set USE_DEV=1 to opt back in to the dev server.
const useDev = !!process.env.USE_DEV;

export default defineConfig({
  timeout: 30000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  webServer: [
    useDev
      ? {
          command: 'npm run dev:web',
          url: 'http://localhost:1420',
          reuseExistingServer: !isCI,
          timeout: 30000,
        }
      : {
          command: 'npm run build && npx vite preview --port 1420 --strictPort',
          url: 'http://localhost:1420',
          reuseExistingServer: !isCI,
          timeout: 120000,
        },
    {
      command: 'npm run dev:landing',
      url: 'http://localhost:3100/flowfolio/landing.html',
      reuseExistingServer: !isCI,
      timeout: 30000,
    },
  ],

  projects: [
    {
      name: 'landing',
      testDir: './e2e/landing',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' },
    },
    {
      name: 'app',
      testDir: './e2e/app',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:1420' },
    },
    ...(!isCI
      ? [
          {
            name: 'firefox-landing',
            testDir: './e2e/landing',
            use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:3100' },
          },
          {
            name: 'firefox-app',
            testDir: './e2e/app',
            use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:1420' },
          },
          {
            name: 'webkit-landing',
            testDir: './e2e/landing',
            use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:3100' },
          },
          {
            name: 'webkit-app',
            testDir: './e2e/app',
            use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:1420' },
          },
        ]
      : []),
  ],
});
