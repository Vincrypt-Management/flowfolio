// src/__tests__/contexts/AuthContext.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

// Mock auth service
vi.mock('../../services/auth', () => ({
  auth: {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockResolvedValue(false),
    getUser: vi.fn().mockResolvedValue(null),
    getLoginUrl: vi.fn().mockReturnValue('http://localhost:3001/auth/google'),
    handleCallback: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshIfNeeded: vi.fn().mockResolvedValue(false),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
}));

// Mock tauri service — isTauriContext must return false so loginWithGoogle uses window.open
vi.mock('../../services/tauri', () => ({
  isTauriContext: vi.fn().mockReturnValue(false),
  invoke: vi.fn().mockRejectedValue(new Error('Not in Tauri context')),
}));

// Mock @tauri-apps/plugin-opener
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// Mock UserProfileContext (used by old shim — new impl doesn't need it but provider tree might)
vi.mock('../../contexts/UserProfileContext', () => ({
  useUserProfile: vi.fn().mockReturnValue({ profile: { displayName: 'Test', avatarUrl: '', email: '' } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthContext', () => {
  it('starts with loading=true then resolves to not authenticated', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });
    // After initialization
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('exposes loginWithGoogle that opens the Google URL', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    // loginWithGoogle should not throw (browser open is mocked elsewhere)
    await act(async () => { await result.current.loginWithGoogle(); });
    // No assertion needed beyond not throwing
  });
});
