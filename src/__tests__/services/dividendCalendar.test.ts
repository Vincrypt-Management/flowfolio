import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchUpcomingDividends, fetchProjectedIncome, _resetCacheForTests } from '../../services/dividendCalendar';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
  _resetCacheForTests();
});

describe('fetchUpcomingDividends', () => {
  it('invokes get_upcoming_dividends with symbols + lookahead', async () => {
    invokeMock.mockResolvedValue([]);
    await fetchUpcomingDividends(['VTI', 'SCHD'], 60);
    expect(invokeMock).toHaveBeenCalledWith(
      'get_upcoming_dividends',
      expect.objectContaining({ symbols: ['VTI', 'SCHD'], lookaheadDays: 60 }),
    );
  });

  it('memoizes results in-process for 5 minutes (cache hit)', async () => {
    invokeMock.mockResolvedValue([{ symbol: 'VTI', ex_date: '2026-06-01', pay_date: '2026-06-15', amount_per_share: 0.5 }]);
    const a = await fetchUpcomingDividends(['VTI'], 90);
    const b = await fetchUpcomingDividends(['VTI'], 90);
    expect(a).toEqual(b);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('different lookahead bypasses the in-process cache', async () => {
    invokeMock.mockResolvedValue([]);
    await fetchUpcomingDividends(['VTI'], 30);
    await fetchUpcomingDividends(['VTI'], 90);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when backend returns null/undefined', async () => {
    invokeMock.mockResolvedValue(null);
    const result = await fetchUpcomingDividends(['VTI'], 90);
    expect(result).toEqual([]);
  });
});

describe('fetchProjectedIncome', () => {
  it('invokes get_projected_annual_income with portfolio name', async () => {
    invokeMock.mockResolvedValue({ total_projected_annual: 0, by_symbol: [] });
    await fetchProjectedIncome('main');
    expect(invokeMock).toHaveBeenCalledWith(
      'get_projected_annual_income',
      { portfolioName: 'main' },
    );
  });
});
