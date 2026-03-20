// src/services/auth.ts
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../core/logger';

const log = createLogger('auth');

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

async function migrateTokensFromLocalStorage(): Promise<void> {
  const legacyAccess = localStorage.getItem('flowfolio_access_token');
  const legacyRefresh = localStorage.getItem('flowfolio_refresh_token');
  if (legacyAccess && legacyRefresh) {
    await invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: legacyAccess }).catch(() => {});
    await invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: legacyRefresh }).catch(() => {});
    localStorage.removeItem('flowfolio_access_token');
    localStorage.removeItem('flowfolio_refresh_token');
  }
}

async function getStoredToken(): Promise<string | null> {
  const v = await invoke<string | null>('load_setting', { key: ACCESS_TOKEN_KEY }).catch(() => null);
  return v || null;
}

async function getStoredRefreshToken(): Promise<string | null> {
  const v = await invoke<string | null>('load_setting', { key: REFRESH_TOKEN_KEY }).catch(() => null);
  return v || null;
}

async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: accessToken }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: refreshToken }),
  ]).catch(err => log.error('Failed to store tokens', err));
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: '' }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: '' }),
  ]).catch(() => {});
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${SERVER_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) { await clearTokens(); return false; }
    const data = await res.json();
    await invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: data.access_token }).catch(() => {});
    return true;
  } catch (e) {
    log.error('Token refresh failed', e);
    await clearTokens();
    return false;
  }
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getStoredToken();
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && (await getStoredRefreshToken())) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = await getStoredToken();
      return fetch(`${SERVER_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          ...options.headers,
        },
      });
    }
  }
  return res;
}

export const auth = {
  async init(): Promise<void> {
    await migrateTokensFromLocalStorage();
  },

  getLoginUrl(): string {
    return `${SERVER_URL}/auth/google`;
  },

  async handleCallback(params: URLSearchParams): Promise<void> {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      await storeTokens(accessToken, refreshToken);
    }
  },

  async getUser(): Promise<User | null> {
    const token = await getStoredToken();
    if (!token) return null;
    try {
      const res = await authFetch('/user/me');
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async updateProfile(data: { name?: string }): Promise<User | null> {
    try {
      const res = await authFetch('/user/me', { method: 'PATCH', body: JSON.stringify(data) });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async logout(): Promise<void> {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${SERVER_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch { /* best effort */ }
    }
    await clearTokens();
  },

  async isLoggedIn(): Promise<boolean> {
    const token = await getStoredToken();
    return !!token;
  },

  async getAccessToken(): Promise<string | null> {
    return getStoredToken();
  },

  /** Silently refresh if access token present but optionally expired. Returns true if still authenticated. */
  async refreshIfNeeded(): Promise<boolean> {
    const token = await getStoredToken();
    if (!token) return false;
    // Try to use token as-is; if 401, refresh
    const res = await authFetch('/user/me');
    if (res.ok) return true;
    return refreshAccessToken();
  },
};
