import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { claim, release } from './aiStreamCoordinator';

export type AiStreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; tokens: string }
  | { phase: 'done'; tokens: string }
  | { phase: 'error'; tokens: string; error: string };

export interface UseAiStreamReturn {
  state: AiStreamState;
  start: (prompt: string) => Promise<void>;
  stop: () => void;
}

export function useAiStream(): UseAiStreamReturn {
  const [state, setState] = useState<AiStreamState>({ phase: 'idle' });
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const cancelledRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    cancelledRef.current = true;
    unlistenRef.current?.();
    unlistenRef.current = null;
    release(stopRef.current);
    setState({ phase: 'idle' });
  }, []);

  // Keep the ref pointing at the latest stop closure (stable identity for coordinator).
  stopRef.current = stop;

  const start = useCallback(async (prompt: string) => {
    cancelledRef.current = false;
    claim(stopRef.current);
    setState({ phase: 'streaming', tokens: '' });

    unlistenRef.current = await listen<string>('ai-token', (event) => {
      if (cancelledRef.current) return;
      setState((prev) =>
        prev.phase === 'streaming'
          ? { phase: 'streaming', tokens: prev.tokens + event.payload }
          : prev,
      );
    });

    try {
      await invoke('ai_chat_stream', {
        messages: [{ role: 'user', content: prompt }],
      });
      if (!cancelledRef.current) {
        setState((prev) =>
          prev.phase === 'streaming'
            ? { phase: 'done', tokens: prev.tokens }
            : { phase: 'done', tokens: '' },
        );
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setState((prev) => ({
          phase: 'error',
          tokens: prev.phase === 'streaming' ? prev.tokens : '',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      release(stopRef.current);
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
      release(stopRef.current);
    };
  }, []);

  return { state, start, stop };
}
