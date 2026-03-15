import { createContext, useContext, ReactNode } from 'react';
import { useUserProfile } from './UserProfileContext';

interface LocalUser {
  id: 'local';
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

interface AuthContextType {
  user: LocalUser | null;
  subscription: null;
  session: null;
  loading: false;
  isAuthenticated: true;
  login: () => Promise<void>;
  register: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();

  const name = profile.displayName || 'Investor';

  const user: LocalUser = {
    id: 'local',
    name,
    username: name,
    avatar_url: profile.avatarUrl || '',
    email: profile.email || '',
  };

  const noop = () => Promise.resolve();

  const value: AuthContextType = {
    user,
    subscription: null,
    session: null,
    loading: false,
    isAuthenticated: true,
    login: noop,
    register: noop,
    loginWithGoogle: noop,
    logout: () => {},
    refreshUser: noop,
  };

  return (
    <AuthContext.Provider value={value}>
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
