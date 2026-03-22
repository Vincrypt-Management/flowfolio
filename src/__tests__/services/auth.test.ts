// src/__tests__/services/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import { invokeWithResilience } from '../../services/apiClient';

// Mock invokeWithResilience — must be hoisted before importing auth
vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: vi.fn(),
}));

// Mock the logger so it doesn't emit noise during tests
vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import auth after mocks are in place
import { auth } from '../../services/auth';

// ─── Typed helpers ────────────────────────────────────────────────────────────

const mockInvoke = invokeWithResilience as MockedFunction<typeof invokeWithResilience>;

// Simulate Tauri token store: key → value
function setupTokenStore(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore };

  mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'save_setting') {
      const key = args?.key as string;
      const value = args?.value as string;
      store[key] = value;
      return undefined;
    }
    if (command === 'load_setting') {
      const key = args?.key as string;
      return store[key] ?? null;
    }
    return undefined;
  });

  return store;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage between tests (setup.ts defines the mock)
    localStorage.clear();
    // Default: fetch always resolves — individual tests override as needed
    global.fetch = vi.fn();
  });

  // ── 1. getLoginUrl ──────────────────────────────────────────────────────────

  describe('getLoginUrl', () => {
    it('returns the Google auth URL using SERVER_URL', () => {
      const url = auth.getLoginUrl();
      // import.meta.env.VITE_SERVER_URL falls back to http://localhost:3001 in tests
      expect(url).toMatch(/\/auth\/google$/);
      expect(url).toContain('http');
    });

    it('returns a string ending with /auth/google', () => {
      expect(auth.getLoginUrl()).toBe('http://localhost:3001/auth/google');
    });
  });

  // ── 2. handleCallback — tokens present ─────────────────────────────────────

  describe('handleCallback', () => {
    it('stores access_token and refresh_token when both are present', async () => {
      const store = setupTokenStore();
      const params = new URLSearchParams('access_token=acc123&refresh_token=ref456');

      await auth.handleCallback(params);

      expect(store['auth_access_token']).toBe('acc123');
      expect(store['auth_refresh_token']).toBe('ref456');
    });

    it('calls save_setting twice (once per token)', async () => {
      setupTokenStore();
      const params = new URLSearchParams('access_token=a&refresh_token=r');

      await auth.handleCallback(params);

      const saveCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'save_setting');
      expect(saveCalls).toHaveLength(2);
    });

    // ── 3. handleCallback — params empty ───────────────────────────────────

    it('does nothing when URLSearchParams are empty', async () => {
      setupTokenStore();
      const params = new URLSearchParams('');

      await auth.handleCallback(params);

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('does nothing when only access_token is present (no refresh_token)', async () => {
      setupTokenStore();
      const params = new URLSearchParams('access_token=only_access');

      await auth.handleCallback(params);

      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // ── 4. isLoggedIn ───────────────────────────────────────────────────────────

  describe('isLoggedIn', () => {
    it('returns true when a token is stored', async () => {
      setupTokenStore({ auth_access_token: 'valid_token' });

      expect(await auth.isLoggedIn()).toBe(true);
    });

    it('returns false when no token is stored', async () => {
      setupTokenStore({});

      expect(await auth.isLoggedIn()).toBe(false);
    });

    it('returns false when stored token is an empty string', async () => {
      setupTokenStore({ auth_access_token: '' });

      expect(await auth.isLoggedIn()).toBe(false);
    });
  });

  // ── 5. getAccessToken ───────────────────────────────────────────────────────

  describe('getAccessToken', () => {
    it('returns the stored access token', async () => {
      setupTokenStore({ auth_access_token: 'my_token' });

      expect(await auth.getAccessToken()).toBe('my_token');
    });

    it('returns null when no token is stored', async () => {
      setupTokenStore({});

      expect(await auth.getAccessToken()).toBeNull();
    });

    it('returns null when invokeWithResilience rejects', async () => {
      mockInvoke.mockRejectedValue(new Error('Tauri unavailable'));

      expect(await auth.getAccessToken()).toBeNull();
    });
  });

  // ── 6. logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('POSTs to /auth/logout and clears tokens', async () => {
      const store = setupTokenStore({
        auth_access_token: 'acc',
        auth_refresh_token: 'ref',
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

      await auth.logout();

      // Fetch called to /auth/logout
      expect(global.fetch).toHaveBeenCalledOnce();
      const [url, opts] = (global.fetch as MockedFunction<typeof fetch>).mock.calls[0];
      expect(String(url)).toContain('/auth/logout');
      expect((opts as RequestInit).method).toBe('POST');

      // Tokens cleared (saved as empty strings)
      expect(store['auth_access_token']).toBe('');
      expect(store['auth_refresh_token']).toBe('');
    });

    it('clears tokens even if no refresh token is stored (skips fetch)', async () => {
      const store = setupTokenStore({ auth_access_token: 'acc' });
      global.fetch = vi.fn();

      await auth.logout();

      // No refresh token means no POST to server
      expect(global.fetch).not.toHaveBeenCalled();
      expect(store['auth_access_token']).toBe('');
    });

    it('still clears tokens when the logout request fails', async () => {
      const store = setupTokenStore({
        auth_access_token: 'acc',
        auth_refresh_token: 'ref',
      });
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await auth.logout();

      expect(store['auth_access_token']).toBe('');
      expect(store['auth_refresh_token']).toBe('');
    });
  });

  // ── 7. init — migrate tokens from localStorage ──────────────────────────────

  describe('init', () => {
    it('migrates tokens from localStorage to Tauri settings', async () => {
      localStorage.setItem('flowfolio_access_token', 'legacy_acc');
      localStorage.setItem('flowfolio_refresh_token', 'legacy_ref');
      const store = setupTokenStore({});

      await auth.init();

      expect(store['auth_access_token']).toBe('legacy_acc');
      expect(store['auth_refresh_token']).toBe('legacy_ref');
    });

    it('removes legacy keys from localStorage after migration', async () => {
      localStorage.setItem('flowfolio_access_token', 'legacy_acc');
      localStorage.setItem('flowfolio_refresh_token', 'legacy_ref');
      setupTokenStore({});

      await auth.init();

      expect(localStorage.getItem('flowfolio_access_token')).toBeNull();
      expect(localStorage.getItem('flowfolio_refresh_token')).toBeNull();
    });

    it('does nothing when localStorage has no legacy tokens', async () => {
      setupTokenStore({});

      await auth.init();

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('migrates only access token when only access token exists in localStorage', async () => {
      localStorage.setItem('flowfolio_access_token', 'legacy_acc');
      const store = setupTokenStore({});

      await auth.init();

      expect(store['auth_access_token']).toBe('legacy_acc');
      // refresh token key should not be set
      expect(store['auth_refresh_token']).toBeUndefined();
    });
  });

  // ── 8. getUser — no token ───────────────────────────────────────────────────

  describe('getUser', () => {
    it('returns null when no access token is stored', async () => {
      setupTokenStore({});

      expect(await auth.getUser()).toBeNull();
    });

    it('returns null when the /user/me response is not ok', async () => {
      setupTokenStore({ auth_access_token: 'tok' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn(),
      } as unknown as Response);

      expect(await auth.getUser()).toBeNull();
    });

    // ── 9. getUser — fetches /user/me and maps snake_case to camelCase ────────

    it('fetches /user/me and maps snake_case fields to camelCase', async () => {
      setupTokenStore({ auth_access_token: 'valid_tok' });

      const serverPayload = {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatar_url: 'https://example.com/avatar.png',
        created_at: '2024-01-01T00:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(serverPayload),
      } as unknown as Response);

      const user = await auth.getUser();

      expect(user).not.toBeNull();
      expect(user?.id).toBe('user-1');
      expect(user?.email).toBe('alice@example.com');
      expect(user?.name).toBe('Alice');
      expect(user?.avatarUrl).toBe('https://example.com/avatar.png');
      expect(user?.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('includes Authorization header in the /user/me request', async () => {
      setupTokenStore({ auth_access_token: 'bearer_tok' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: '1',
          email: 'test@test.com',
          name: null,
          avatar_url: null,
          created_at: '',
        }),
      } as unknown as Response);

      await auth.getUser();

      const [, opts] = (global.fetch as MockedFunction<typeof fetch>).mock.calls[0];
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer bearer_tok');
    });

    it('returns null when fetch throws', async () => {
      setupTokenStore({ auth_access_token: 'tok' });
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      expect(await auth.getUser()).toBeNull();
    });
  });
});
