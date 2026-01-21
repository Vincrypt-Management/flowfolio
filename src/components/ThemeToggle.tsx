import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Cycle through themes in compact mode
  const cycleTheme = () => {
    const themes: Array<'light' | 'system' | 'dark'> = ['light', 'system', 'dark'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  if (compact) {
    return (
      <button
        className="theme-btn-compact"
        onClick={cycleTheme}
        title={`Theme: ${theme} (click to change)`}
        aria-label={`Current theme: ${theme}`}
      >
        {resolvedTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    );
  }

  return (
    <div className="theme-toggle">
      <button
        className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        title="Light mode"
        aria-label="Light mode"
      >
        <Sun size={16} />
      </button>
      <button
        className={`theme-btn ${theme === 'system' ? 'active' : ''}`}
        onClick={() => setTheme('system')}
        title="System preference"
        aria-label="System preference"
      >
        <Monitor size={16} />
      </button>
      <button
        className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
        onClick={() => setTheme('dark')}
        title="Dark mode"
        aria-label="Dark mode"
      >
        <Moon size={16} />
      </button>
    </div>
  );
}
