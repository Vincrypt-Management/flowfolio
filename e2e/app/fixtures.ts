import { test as base, expect } from '@playwright/test';

/**
 * Realistic mock responses keyed by Tauri command name.
 */
const MOCK_RESPONSES: Record<string, unknown> = {
  health_check: 'OK',

  list_templates: ['Growth', 'Dividend', 'Value', 'Momentum', 'Balanced'],

  get_default_plan: {
    name: 'Default Plan',
    description: 'A balanced default investment strategy',
    factor_weights: {
      momentum: 0.3,
      value: 0.3,
      quality: 0.2,
      growth: 0.2,
    },
    universe: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
    rebalance_frequency: 'monthly',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },

  list_universes: [
    {
      id: 'universe-1',
      name: 'S&P 500 Core',
      description: 'Large-cap US equities',
      symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'],
      tags: { sector: ['tech'] },
      exclude_list: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],

  list_saved_plans: ['My Growth Strategy', 'Dividend Income'],

  get_api_key_statuses: {
    alpaca_key: false,
    alpaca_secret: false,
    finnhub_key: false,
    fmp_key: false,
    tiingo_key: false,
    twelve_data_key: false,
    polygon_key: false,
    alpha_vantage_key: false,
    openrouter_key: false,
  },

  list_alerts: [],

  list_schedules: [],

  get_cache_stats: {
    memory_entries: 0,
    memory_hits: 0,
    memory_misses: 0,
    db_entries: 0,
    db_hits: 0,
    db_misses: 0,
    total_requests: 0,
    hit_rate: 0.0,
  },

  // Vault
  vault_exists: false,
  vault_is_unlocked: false,
  vault_get_path: '/tmp/test-vault.hold',

  // Catch-all for commands not explicitly listed above
  get_current_prices_batch: {},
};

/**
 * Install a mock for `window.__TAURI_INTERNALS__` so that all `invoke()`
 * calls resolve with realistic data instead of throwing "not in Tauri".
 *
 * The mock is installed via `page.addInitScript` which runs before any
 * page scripts, so the check in `src/services/tauri.ts` sees the object.
 */
const test = base.extend<object>({
  page: async ({ page }, use) => {
    await page.addInitScript((responses: Record<string, unknown>) => {
      // Minimal __TAURI_INTERNALS__ shim — enough for @tauri-apps/api/core
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, args?: Record<string, unknown>) => {
          // Per-spec setups can install a routing hook on window.__INVOKE_HOOK__
          // to inspect (cmd, args) and return a value. Falsy → fall through to defaults.
          const hook = (window as unknown as { __INVOKE_HOOK__?: (c: string, a?: Record<string, unknown>) => unknown }).__INVOKE_HOOK__;
          if (hook) {
            const v = hook(cmd, args);
            if (v !== undefined) return Promise.resolve(v);
          }
          // load_setting is key-dependent: onboarding_complete must be 'true'
          // so the app skips the wizard and shows the main UI. All other keys
          // return null (settings fall back to their defaults in the app).
          if (cmd === 'load_setting') {
            const key = args && (args.key as string);
            return Promise.resolve(key === 'onboarding_complete' ? 'true' : null);
          }
          if (Object.prototype.hasOwnProperty.call(responses, cmd)) {
            return Promise.resolve(responses[cmd]);
          }
          // Unknown command: resolve with null so the app doesn't crash
          return Promise.resolve(null);
        },
        // Minimal metadata expected by the Tauri JS runtime
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main', windowLabel: 'main' },
        },
        transformCallback: (cb: (arg: unknown) => void, once?: boolean) => {
          void once;
          const id = Math.floor(Math.random() * 1e9);
          (window as unknown as Record<string, unknown>)[`_${id}`] = cb;
          return id;
        },
      };

      // Stub the deep-link plugin so onOpenUrl never throws
      (window as unknown as Record<string, unknown>).__TAURI_PLUGIN_DEEP_LINK__ = null;
    }, MOCK_RESPONSES);

    await use(page);
  },
});

export { test, expect };
