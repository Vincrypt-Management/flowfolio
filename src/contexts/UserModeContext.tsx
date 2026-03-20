import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
    invoke<string | null>('load_setting', { key: 'user_mode' })
      .then(value => {
        if (value === 'simple' || value === 'advanced') setModeState(value);
      })
      .catch(() => {});
  }, []);

  // One-time migration from localStorage to SQLite
  useEffect(() => {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      invoke('save_setting', { key: 'user_mode', value: legacy })
        .then(() => localStorage.removeItem(LEGACY_STORAGE_KEY))
        .catch(console.error);
    }
  }, []);

  const setMode = useCallback((newMode: UserMode) => {
    setModeState(newMode);
    invoke('save_setting', { key: 'user_mode', value: newMode })
      .catch(console.error);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
      const newMode: UserMode = prev === 'simple' ? 'advanced' : 'simple';
      invoke('save_setting', { key: 'user_mode', value: newMode })
        .catch(console.error);
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
