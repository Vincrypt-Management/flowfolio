// src/features/onboarding/SidebarTooltips.tsx
import { useState, useEffect, useCallback } from 'react';
import { invokeWithResilience } from '../../services/apiClient';
import { X } from 'lucide-react';

const TOOLTIP_CONTENT: Record<string, string> = {
  dashboard: 'Your portfolio snapshot — prices, P&L, and market overview at a glance.',
  vibe_studio: 'Build your investment strategy using factor weights: momentum, value, quality, and more.',
  templates: 'Start with a pre-built strategy instead of building from scratch.',
  rankings: 'Score and rank any list of stocks against your active Vibe Plan.',
  portfolio: 'Track holdings, generate buy lists, run rebalance reports, and import CSV.',
  backtest: 'Simulate your strategy against historical data to see how it would have performed.',
  journal: 'Record your investment decisions and track your thinking over time.',
  watchlist: 'Your curated universe of stocks to track, tag, and analyze.',
  alerts: 'Set price alerts — get notified when a stock hits your target.',
};

interface TooltipState {
  [tab: string]: boolean; // true = dismissed
}

export function useSidebarTooltips(onboardingComplete: boolean) {
  const [dismissed, setDismissed] = useState<TooltipState>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!onboardingComplete) return;
    const tabs = Object.keys(TOOLTIP_CONTENT);
    Promise.all(
      tabs.map(tab =>
        invokeWithResilience<string | null>('load_setting', { key: `tooltip_dismissed_${tab}` })
          .then(val => [tab, val === 'true'] as [string, boolean])
          .catch(() => [tab, false] as [string, boolean])
      )
    ).then(entries => {
      setDismissed(Object.fromEntries(entries));
      setLoaded(true);
    });
  }, [onboardingComplete]);

  const dismiss = useCallback((tab: string) => {
    setDismissed(prev => ({ ...prev, [tab]: true }));
    invokeWithResilience('save_setting', { key: `tooltip_dismissed_${tab}`, value: 'true' }).catch(() => {});
  }, []);

  const isShown = useCallback((tab: string) => {
    if (!loaded || !onboardingComplete) return false;
    return !dismissed[tab] && !!TOOLTIP_CONTENT[tab];
  }, [loaded, dismissed, onboardingComplete]);

  const getContent = (tab: string) => TOOLTIP_CONTENT[tab] ?? '';

  return { isShown, dismiss, getContent };
}

interface SidebarTooltipProps {
  tab: string;
  isShown: boolean;
  content: string;
  onDismiss: (tab: string) => void;
}

export function SidebarTooltip({ tab, isShown, content, onDismiss }: SidebarTooltipProps) {
  if (!isShown) return null;
  return (
    <div className="sidebar-tooltip" role="tooltip">
      <span className="sidebar-tooltip-text">{content}</span>
      <button
        className="sidebar-tooltip-close"
        onClick={(e) => { e.stopPropagation(); onDismiss(tab); }}
        aria-label="Dismiss tooltip"
      >
        <X size={10} />
      </button>
    </div>
  );
}
