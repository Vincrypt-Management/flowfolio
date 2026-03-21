import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { auth, type User } from '../services/auth';
import { isTauriContext } from '../services/tauri';

export type Tier = 'free' | 'ai' | 'sync' | 'pro';

interface AuthContextType {
  user: User | null;
  tier: Tier;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  handleOAuthCallback: (url: string) => Promise<void>;
  // Legacy compatibility
  login: () => Promise<void>;
  register: () => Promise<void>;
  subscription: null;
  session: null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Parse tier from a JWT access token payload (base64 decode middle segment). */
function parseTierFromToken(token: string): Tier {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
    const tier = payload?.tier as string;
    if (tier === 'ai' || tier === 'sync' || tier === 'pro') return tier;
  } catch { /* ignore */ }
  return 'free';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tier, setTier] = useState<Tier>('free');
  const [loading, setLoading] = useState(true);

  const loadAuth = useCallback(async () => {
    await auth.init();
    const loggedIn = await auth.isLoggedIn();
    if (!loggedIn) { setLoading(false); return; }

    // Silently refresh if needed
    await auth.refreshIfNeeded();

    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));

    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
    setLoading(false);
  }, []);

  useEffect(() => { loadAuth(); }, [loadAuth]);

  const loginWithGoogle = useCallback(async () => {
    const url = auth.getLoginUrl();
    if (isTauriContext()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }, []);

  const handleOAuthCallback = useCallback(async (deepLinkUrl: string) => {
    const url = new URL(deepLinkUrl);
    await auth.handleCallback(url.searchParams);
    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));
    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
    setTier('free');
  }, []);

  const refreshUser = useCallback(async () => {
    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));
  }, []);

  const noop = () => Promise.resolve();

  return (
    <AuthContext.Provider value={{
      user,
      tier,
      loading,
      isAuthenticated: !!user,
      loginWithGoogle,
      logout,
      refreshUser,
      handleOAuthCallback,
      login: noop,
      register: noop,
      subscription: null,
      session: null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
