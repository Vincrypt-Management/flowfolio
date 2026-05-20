import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DividendsTab } from '../../components/DividendsTab';
import { _resetCacheForTests } from '../../services/dividendCalendar';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
  _resetCacheForTests();
});

describe('DividendsTab', () => {
  const dividends = [
    { symbol: 'VTI', ex_date: '2026-06-05', pay_date: '2026-06-20', amount_per_share: 0.85 },
  ];
  const projection = {
    portfolio_name: 'main',
    total_projected_annual: 3200,
    by_symbol: [
      { symbol: 'VTI', trailing_12mo: 1600, projected_annual: 1600 },
      { symbol: 'SCHD', trailing_12mo: 1600, projected_annual: 1600 },
    ],
  };

  it('shows empty state when no dividends', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_upcoming_dividends') return Promise.resolve([]);
      if (cmd === 'get_projected_annual_income') return Promise.resolve({ portfolio_name: 'main', total_projected_annual: 0, by_symbol: [] });
      return Promise.resolve(null);
    });
    render(<DividendsTab portfolioName="main" heldSymbols={['VTI']} />);
    await waitFor(() => expect(screen.getByText(/No upcoming dividends/i)).toBeInTheDocument());
  });

  it('renders projected income card with total', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_upcoming_dividends') return Promise.resolve(dividends);
      if (cmd === 'get_projected_annual_income') return Promise.resolve(projection);
      return Promise.resolve(null);
    });
    render(<DividendsTab portfolioName="main" heldSymbols={['VTI', 'SCHD']} />);
    await waitFor(() => expect(screen.getByText(/\$3,?200/)).toBeInTheDocument());
  });

  it('toggles between calendar and list views', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_upcoming_dividends') return Promise.resolve(dividends);
      if (cmd === 'get_projected_annual_income') return Promise.resolve(projection);
      return Promise.resolve(null);
    });
    render(<DividendsTab portfolioName="main" heldSymbols={['VTI']} />);
    await waitFor(() => expect(screen.getByText(/June 2026/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^list$/i }));
    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.queryByText(/June 2026/i)).not.toBeInTheDocument();
  });
});
