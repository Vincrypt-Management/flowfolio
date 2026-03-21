import { useEffect, useCallback } from 'react';

interface ShortcutMap {
  [combo: string]: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handler = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs/textareas
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow Escape in inputs
      if (e.key !== 'Escape') return;
    }

    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    let combo = '';
    if (meta) combo += 'mod+';
    if (e.shiftKey) combo += 'shift+';
    if (e.altKey) combo += 'alt+';
    combo += key;

    const action = shortcuts[combo];
    if (action) {
      e.preventDefault();
      action();
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
