import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import { UserModeProvider, useUserMode } from '../../contexts/UserModeContext';

// ============ ThemeContext ============

describe('ThemeContext', () => {
  beforeEach(() => localStorage.clear());

  function themeWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ThemeProvider, null, children);
  }

  it('defaults to system theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    expect(result.current.theme).toBe('system');
  });

  it('resolvedTheme returns dark or light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    expect(['dark', 'light']).toContain(result.current.resolvedTheme);
  });

  it('setTheme dark persists to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    act(() => { result.current.setTheme('dark'); });
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('flowfolio-theme')).toBe('dark');
  });

  it('setTheme light updates resolvedTheme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    act(() => { result.current.setTheme('light'); });
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within a ThemeProvider');
  });
});

// ============ UserModeContext ============

describe('UserModeContext', () => {
  beforeEach(() => localStorage.clear());

  function userModeWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(UserModeProvider, null, children);
  }

  it('defaults to simple mode', () => {
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    expect(result.current.mode).toBe('simple');
    expect(result.current.isAdvanced).toBe(false);
  });

  it('toggleMode switches to advanced', () => {
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    act(() => { result.current.toggleMode(); });
    expect(result.current.mode).toBe('advanced');
    expect(result.current.isAdvanced).toBe(true);
  });

  it('toggleMode switches back to simple', () => {
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    act(() => { result.current.toggleMode(); });
    act(() => { result.current.toggleMode(); });
    expect(result.current.mode).toBe('simple');
  });

  it('persists mode via setMode (state update)', () => {
    // Mode is now persisted to SQLite via invoke; verify in-memory state is updated
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    act(() => { result.current.setMode('advanced'); });
    expect(result.current.mode).toBe('advanced');
    expect(result.current.isAdvanced).toBe(true);
  });

  it('setMode works directly', () => {
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    act(() => { result.current.setMode('advanced'); });
    expect(result.current.mode).toBe('advanced');
    expect(result.current.isAdvanced).toBe(true);
  });

  it('defaults to simple when no SQLite value available (test env)', () => {
    // In test env, invoke is unavailable so SQLite load silently fails; default is 'simple'
    const { result } = renderHook(() => useUserMode(), { wrapper: userModeWrapper });
    expect(result.current.mode).toBe('simple');
    expect(result.current.isAdvanced).toBe(false);
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useUserMode());
    }).toThrow('useUserMode must be used within a UserModeProvider');
  });
});
