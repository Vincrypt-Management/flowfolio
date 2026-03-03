import { renderHook, act } from '@testing-library/react';
import {
  useDebounce,
  useToggle,
  useLocalStorage,
  usePrevious,
  useKeyPress,
  useMediaQuery,
} from '../../shared/hooks/index';

// ============ useDebounce ============

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('does not update value before delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } }
    );

    rerender({ value: 'world', delay: 500 });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('hello');
  });

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } }
    );

    rerender({ value: 'world', delay: 500 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('world');
  });
});

// ============ useToggle ============

describe('useToggle', () => {
  it('starts with initial value false', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current[0]).toBe(false);
  });

  it('toggles to true', () => {
    const { result } = renderHook(() => useToggle());
    act(() => { result.current[1](); });
    expect(result.current[0]).toBe(true);
  });

  it('toggles back to false', () => {
    const { result } = renderHook(() => useToggle());
    act(() => { result.current[1](); });
    act(() => { result.current[1](); });
    expect(result.current[0]).toBe(false);
  });

  it('sets value directly', () => {
    const { result } = renderHook(() => useToggle());
    act(() => { result.current[2](true); });
    expect(result.current[0]).toBe(true);
    act(() => { result.current[2](false); });
    expect(result.current[0]).toBe(false);
  });
});

// ============ useLocalStorage ============

describe('useLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('reads initial value when no stored value', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('persists value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    act(() => { result.current[1]('updated'); });
    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('test-key')).toBe('"updated"');
  });

  it('reads existing value from localStorage', () => {
    localStorage.setItem('test-key', '"stored"');
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    expect(result.current[0]).toBe('stored');
  });

  it('handles invalid JSON gracefully', () => {
    localStorage.setItem('test-key', 'not-json{{{');
    const { result } = renderHook(() => useLocalStorage('test-key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});

// ============ usePrevious ============

describe('usePrevious', () => {
  it('returns undefined initially', () => {
    const { result } = renderHook(() => usePrevious(0));
    expect(result.current).toBeUndefined();
  });

  it('returns previous value after update', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 0 },
    });

    rerender({ value: 1 });
    expect(result.current).toBe(0);

    rerender({ value: 2 });
    expect(result.current).toBe(1);
  });
});

// ============ useKeyPress ============

describe('useKeyPress', () => {
  it('detects key press', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    expect(result.current).toBe(false);

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    expect(result.current).toBe(true);
  });

  it('detects key release', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    expect(result.current).toBe(true);

    act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' })); });
    expect(result.current).toBe(false);
  });

  it('ignores other keys', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current).toBe(false);
  });
});

// ============ useMediaQuery ============

describe('useMediaQuery', () => {
  it('returns match result from matchMedia', () => {
    const { result } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'));
    expect(result.current).toBe(true);
  });

  it('returns false for non-matching query', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'));
    expect(result.current).toBe(false);
  });
});
