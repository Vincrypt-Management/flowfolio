import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OptionsTab } from '../../components/OptionsTab';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

const openCC = {
  id: 'opt-1',
  portfolio_name: 'main',
  symbol: 'AAPL',
  strategy: 'covered_call',
  strike: 200,
  expiration: '2026-07-19',
  contracts: 1,
  premium_per_contract: 3.5,
  open_date: '2026-05-15',
  status: 'open',
  close_date: null,
  close_premium: null,
  notes: null,
  created_at: '2026-05-15T10:00:00Z',
};

describe('OptionsTab', () => {
  it('shows empty state when no positions', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 0, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
      });
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText(/No options tracked/i)).toBeInTheDocument());
  });

  it('renders open positions in the Open table', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([openCC]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 1, total_cash_secured: 0, total_assignment_exposure: 20000, realized_premium_ytd: 0,
      });
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.getByText(/covered call/i)).toBeInTheDocument();
    expect(screen.getByText(/\$20,?000/)).toBeInTheDocument();
  });

  it('fires update_option_position with status=expired on Mark Expired', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([openCC]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 1, total_cash_secured: 0, total_assignment_exposure: 20000, realized_premium_ytd: 0,
      });
      if (cmd === 'update_option_position') return Promise.resolve();
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /mark expired/i }));
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter((c) => c[0] === 'update_option_position');
      expect(calls.length).toBe(1);
      expect(calls[0][1]).toMatchObject({ id: 'opt-1', status: 'expired' });
    });
  });

  it('opens the Add Position modal and creates on submit', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 0, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
      });
      if (cmd === 'create_option_position') return Promise.resolve();
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText(/No options tracked/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add position/i }));
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/strike/i), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/expiration/i), { target: { value: '2026-07-19' } });
    fireEvent.change(screen.getByLabelText(/premium/i), { target: { value: '3.50' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      const creates = invokeMock.mock.calls.filter((c) => c[0] === 'create_option_position');
      expect(creates.length).toBe(1);
      expect(creates[0][1]).toMatchObject({
        portfolioName: 'main',
        symbol: 'AAPL',
        strategy: 'covered_call',
        strike: 200,
        expiration: '2026-07-19',
        premiumPerContract: 3.50,
      });
    });
  });

  it('toggles to History sub-tab', async () => {
    const expired = { ...openCC, id: 'opt-2', status: 'expired', close_date: '2026-07-19' };
    invokeMock.mockImplementation((cmd: string, args: any) => {
      if (cmd === 'list_option_positions') {
        return Promise.resolve(args?.statusFilter === 'open' ? [openCC] : [expired]);
      }
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 1, total_cash_secured: 0, total_assignment_exposure: 20000, realized_premium_ytd: 350,
      });
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  });
});
