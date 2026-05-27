import { Sun, Moon, Monitor } from 'lucide-react';
import { IconButton, Tooltip } from '@flowfolio/ui';
import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

interface ThemeToggleProps {
  compact?: boolean;
}

type ThemeOption = 'light' | 'system' | 'dark';

const THEMES: { value: ThemeOption; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light mode', Icon: Sun },
  { value: 'system', label: 'System preference', Icon: Monitor },
  { value: 'dark', label: 'Dark mode', Icon: Moon },
];

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (compact) {
    const cycleTheme = () => {
      const idx = THEMES.findIndex((t) => t.value === theme);
      const next = THEMES[(idx + 1) % THEMES.length];
      setTheme(next.value);
    };

    const Icon = resolvedTheme === 'dark' ? Moon : Sun;
    return (
      <Tooltip content={`Theme: ${theme}`} side="bottom">
        <IconButton
          variant="ghost"
          size="md"
          onClick={cycleTheme}
          aria-label={`Current theme: ${theme}, click to change`}
        >
          <Icon size={16} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme selector">
      {THEMES.map(({ value, label, Icon }) => (
        <Tooltip key={value} content={label} side="bottom">
          <IconButton
            variant={theme === value ? 'filled' : 'ghost'}
            size="sm"
            onClick={() => setTheme(value)}
            aria-label={label}
            aria-pressed={theme === value}
          >
            <Icon size={14} />
          </IconButton>
        </Tooltip>
      ))}
    </div>
  );
}
