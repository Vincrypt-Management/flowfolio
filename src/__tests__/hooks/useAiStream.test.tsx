import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAiStream } from '../../hooks/useAiStream';
import { _resetForTests as resetCoord } from '../../hooks/aiStreamCoordinator';

// Mock Tauri APIs
const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

interface FakeListener {
  fire: (payload: string) => void;
  unlisten: ReturnType<typeof vi.fn>;
}

function setupListener(): FakeListener {
  const unlisten = vi.fn();
  let handler: ((evt: { payload: string }) => void) | null = null;
  listenMock.mockImplementation(async (_name: string, cb: typeof handler) => {
    handler = cb;
    return unlisten;
  });
  return {
    fire: (payload) => handler?.({ payload }),
    unlisten,
  };
}

// Flush both microtasks and one macrotask so React commits and listen() resolves.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useAiStream', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    resetCoord();
  });

  it('starts in idle phase', () => {
    const { result } = renderHook(() => useAiStream());
    expect(result.current.state.phase).toBe('idle');
  });

  it('transitions idle → streaming → done, accumulating tokens', async () => {
    const listener = setupListener();
    let resolveInvoke!: (v: string) => void;
    invokeMock.mockImplementation(
      () => new Promise<string>((res) => { resolveInvoke = res; })
    );

    const { result } = renderHook(() => useAiStream());

    let startPromise!: Promise<void>;
    await act(async () => {
      startPromise = result.current.start('hello');
      await flush();
    });

    expect(result.current.state.phase).toBe('streaming');

    await act(async () => {
      listener.fire('Hello ');
      listener.fire('world.');
      resolveInvoke('Hello world.');
      await startPromise;
    });

    expect(result.current.state.phase).toBe('done');
    if (result.current.state.phase === 'done') {
      expect(result.current.state.tokens).toBe('Hello world.');
    }
  });

  it('flips to error phase when invoke rejects, keeping partial tokens', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(async () => {
      // Simulate a short stream before failure
      listener.fire('partial ');
      throw new Error('boom');
    });

    const { result } = renderHook(() => useAiStream());
    await act(async () => {
      await result.current.start('p');
    });

    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase === 'error') {
      expect(result.current.state.error).toContain('boom');
      expect(result.current.state.tokens).toContain('partial');
    }
  });

  it('stop() returns hook to idle and unsubscribes', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(() => new Promise<string>(() => { /* never resolves */ }));

    const { result } = renderHook(() => useAiStream());
    await act(async () => {
      void result.current.start('p');
      await flush();
    });

    expect(result.current.state.phase).toBe('streaming');

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(listener.unlisten).toHaveBeenCalled();
  });

  it('unmount during streaming calls unlisten', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(() => new Promise<string>(() => {}));

    const { result, unmount } = renderHook(() => useAiStream());
    await act(async () => {
      void result.current.start('p');
      await flush();
    });

    expect(result.current.state.phase).toBe('streaming');
    unmount();
    expect(listener.unlisten).toHaveBeenCalled();
  });
});
