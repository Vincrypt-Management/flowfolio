import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { auth, User, Subscription } from '../services/auth';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  subscription: Subscription | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, name?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    subscription: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  // Load session on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const session = await auth.getSession();
        if (session && mounted) {
          const result = await auth.getUser();
          if (result && mounted) {
            setState({
              user: result.user,
              subscription: result.subscription,
              session,
              loading: false,
              isAuthenticated: true,
            });
            return;
          }
        }
      } catch {
        // Session invalid or expired
      }
      if (mounted) {
        setState(s => ({ ...s, loading: false }));
      }
    }

    init();

    // Listen for auth state changes (OAuth redirects, token refresh, etc.)
    const { data: { subscription: authSub } } = auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session) {
        const result = await auth.getUser();
        if (result && mounted) {
          setState({
            user: result.user,
            subscription: result.subscription,
            session,
            loading: false,
            isAuthenticated: true,
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setState({
          user: null,
          subscription: null,
          session: null,
          loading: false,
          isAuthenticated: false,
        });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setState(s => ({ ...s, session }));
      }
    });

    return () => {
      mounted = false;
      authSub.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await auth.login(email, password);
    const session = await auth.getSession();
    setState({
      user: result.user,
      subscription: result.subscription,
      session,
      loading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (email: string, password: string, username: string, name?: string) => {
    const result = await auth.register(email, password, username, name);
    const session = await auth.getSession();
    setState({
      user: result.user,
      subscription: result.subscription,
      session,
      loading: false,
      isAuthenticated: true,
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await auth.loginWithProvider('google');
    // Redirect happens — state will update via onAuthStateChange
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setState({
      user: null,
      subscription: null,
      session: null,
      loading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const result = await auth.getUser();
    if (result) {
      setState(s => ({
        ...s,
        user: result.user,
        subscription: result.subscription,
      }));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
