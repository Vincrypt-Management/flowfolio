import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: vi.fn(),
}));

import { invokeWithResilience } from '../../services/apiClient';
import { useWashSaleStatus, __resetWashSaleCache } from '../../hooks/useWashSaleStatus';

const invokeMock = invokeWithResilience as unknown as ReturnType<typeof vi.fn>;

describe('useWashSaleStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWashSaleCache();
  });

  it('returns unknown initially while inflight', () => {
    invokeMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWashSaleStatus('AAPL'));
    expect(result.current.status).toBe('unknown');
    expect(result.current.loading).toBe(true);
  });

  it('returns window when backend reports in_wash_sale_window=true', async () => {
    invokeMock.mockResolvedValue({ in_wash_sale_window: true, days_until_safe: 12 });
    const { result } = renderHook(() => useWashSaleStatus('AAPL'));
    await waitFor(() => expect(result.current.status).toBe('window'));
    expect(result.current.loading).toBe(false);
  });

  it('returns safe when in_wash_sale_window=false', async () => {
    invokeMock.mockResolvedValue({ in_wash_sale_window: false });
    const { result } = renderHook(() => useWashSaleStatus('AAPL'));
    await waitFor(() => expect(result.current.status).toBe('safe'));
  });

  it('returns unknown on error', async () => {
    invokeMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useWashSaleStatus('AAPL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe('unknown');
  });

  it('dedupes concurrent calls for the same symbol', async () => {
    invokeMock.mockResolvedValue({ in_wash_sale_window: false });
    renderHook(() => useWashSaleStatus('AAPL'));
    renderHook(() => useWashSaleStatus('AAPL'));
    renderHook(() => useWashSaleStatus('AAPL'));
    await waitFor(() => {
      expect(invokeMock.mock.calls.length).toBe(1);
    });
  });

  it('returns unknown and does not call backend when symbol is empty', async () => {
    const { result } = renderHook(() => useWashSaleStatus(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe('unknown');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
