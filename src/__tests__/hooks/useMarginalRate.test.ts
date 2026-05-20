import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: vi.fn(),
}));

import { invokeWithResilience } from '../../services/apiClient';
import { useMarginalRate, __resetMarginalRateCache } from '../../hooks/useMarginalRate';

describe('useMarginalRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMarginalRateCache();
  });

  it('returns default 0.25 while loading', () => {
    (invokeWithResilience as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    const { result } = renderHook(() => useMarginalRate());
    expect(result.current.rate).toBe(0.25);
    expect(result.current.loading).toBe(true);
  });

  it('returns persisted rate after load', async () => {
    (invokeWithResilience as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('0.40');
    const { result } = renderHook(() => useMarginalRate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate).toBe(0.4);
  });

  it('falls back to default on error', async () => {
    (invokeWithResilience as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );
    const { result } = renderHook(() => useMarginalRate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate).toBe(0.25);
  });

  it('falls back to default for non-finite stored value', async () => {
    (invokeWithResilience as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('not-a-number');
    const { result } = renderHook(() => useMarginalRate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate).toBe(0.25);
  });
});
