import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type UserMode = 'simple' | 'advanced';

interface UserModeContextType {
  mode: UserMode;
  isAdvanced: boolean;
  toggleMode: () => void;
  setMode: (mode: UserMode) => void;
}

const STORAGE_KEY = 'flowfolio-user-mode';

const UserModeContext = createContext<UserModeContextType | undefined>(undefined);

export function UserModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UserMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as UserMode | null;
      return stored === 'advanced' ? 'advanced' : 'simple';
    }
    return 'simple';
  });

  const setMode = useCallback((newMode: UserMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'simple' ? 'advanced' : 'simple');
  }, [mode, setMode]);

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
