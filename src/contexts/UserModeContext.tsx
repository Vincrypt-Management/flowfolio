import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createLogger } from '../core/logger';
import { invokeWithResilience } from '../services/apiClient';

const log = createLogger('UserModeContext');

export type UserMode = 'simple' | 'advanced';

interface UserModeContextType {
  mode: UserMode;
  isAdvanced: boolean;
  toggleMode: () => void;
  setMode: (mode: UserMode) => void;
}

const LEGACY_STORAGE_KEY = 'flowfolio-user-mode';

const UserModeContext = createContext<UserModeContextType | undefined>(undefined);

export function UserModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UserMode>('simple');

  // Load mode from SQLite on mount
  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: 'user_mode' })
      .then(value => {
        if (value === 'simple' || value === 'advanced') setModeState(value);
      })
      .catch(() => {});
  }, []);

  // One-time migration from localStorage to SQLite
  useEffect(() => {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      invokeWithResilience('save_setting', { key: 'user_mode', value: legacy })
        .then(() => localStorage.removeItem(LEGACY_STORAGE_KEY))
        .catch(err => log.error('Failed to save user mode', err));
    }
  }, []);

  const setMode = useCallback((newMode: UserMode) => {
    setModeState(newMode);
    invokeWithResilience('save_setting', { key: 'user_mode', value: newMode })
      .catch(err => log.error('Failed to save user mode', err));
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      const newMode: UserMode = prev === 'simple' ? 'advanced' : 'simple';
      invokeWithResilience('save_setting', { key: 'user_mode', value: newMode })
        .catch(err => log.error('Failed to save user mode', err));
      return newMode;
    });
  }, []);

  return (
    <UserModeContext.Provider value={{ mode, isAdvanced: mode === 'advanced', toggleMode, setMode }}>
      {children}
    </UserModeContext.Provider>
  );
}

export function useUserMode(): UserModeContextType {
  const context = useContext(UserModeContext);
  if (!context) {
    throw new Error('useUserMode must be used within a UserModeProvider');
  }
  return context;
}
