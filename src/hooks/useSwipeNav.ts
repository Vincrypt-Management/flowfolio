import { RefObject, useEffect } from 'react';

const TAB_ORDER = [
  'dashboard', 'vibe-studio', 'saved-portfolios', 'templates', 'rankings',
  'portfolio', 'backtest', 'journal', 'watchlist', 'analysis', 'alerts',
  'comparison', 'risk', 'scheduler', 'news', 'yearly-review', 'universe',
  'data', 'settings',
] as const;

const MIN_SWIPE_PX = 60;
const DIRECTION_RATIO = 1.5; // |deltaX| must be > |deltaY| * 1.5
const MAX_DURATION_MS = 500;

export function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  activeTab: string,
  onNavigate: (tab: string) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;

    const el = ref.current;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const onDown = (e: PointerEvent): void => {
      startX = e.clientX;
      startY = e.clientY;
      startTime = e.timeStamp;
    };

    const onUp = (e: PointerEvent): void => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const elapsed = e.timeStamp - startTime;

      if (
        Math.abs(deltaX) < MIN_SWIPE_PX ||
        Math.abs(deltaX) <= Math.abs(deltaY) * DIRECTION_RATIO ||
        elapsed > MAX_DURATION_MS
      ) {
        return;
      }

      const currentIndex = (TAB_ORDER as ReadonlyArray<string>).indexOf(activeTab);
      if (currentIndex === -1) return;

      if (deltaX < 0) {
        // Swipe left → next tab
        if (currentIndex < TAB_ORDER.length - 1) {
          onNavigate(TAB_ORDER[currentIndex + 1]);
        }
      } else {
        // Swipe right → previous tab
        if (currentIndex > 0) {
          onNavigate(TAB_ORDER[currentIndex - 1]);
        }
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [ref, activeTab, onNavigate, enabled]);
}
