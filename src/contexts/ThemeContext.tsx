import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createLogger } from '../core/logger';
import { invokeWithResilience } from '../services/apiClient';

const log = createLogger('ThemeContext');

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LEGACY_STORAGE_KEY = 'flowfolio-theme';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    return getSystemTheme();
  });

  // Load theme from SQLite on mount
  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: 'theme' })
      .then(value => {
        if (value === 'dark' || value === 'light' || value === 'system') {
          setThemeState(value);
        }
      })
      .catch(() => {});
  }, []);

  // One-time migration from localStorage to SQLite
  useEffect(() => {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      invokeWithResilience('save_setting', { key: 'theme', value: legacy })
        .then(() => localStorage.removeItem(LEGACY_STORAGE_KEY))
        .catch(err => log.error('Failed to save theme', err));
    }
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        setResolvedTheme(getSystemTheme());
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Update resolved theme when theme changes
  useEffect(() => {
    if (theme === 'system') {
      setResolvedTheme(getSystemTheme());
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    
    // Remove opposite theme class and add current one
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    invokeWithResilience('save_setting', { key: 'theme', value: newTheme })
      .catch(err => log.error('Failed to save theme', err));
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
