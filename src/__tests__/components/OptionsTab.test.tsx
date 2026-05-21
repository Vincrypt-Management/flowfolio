import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OptionsTab } from '../../components/OptionsTab';

const invokeMock = vi.fn();
vi.mock('../../services/apiClient', () => ({
  invokeWithResilience: (...args: unknown[]) => invokeMock(...args),
}));

const addToastMock = vi.fn();
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

beforeEach(() => {
  invokeMock.mockReset();
  addToastMock.mockReset();
});

const openCC = {
  id: 'opt-1',
  portfolio_name: 'main',
  symbol: 'AAPL',
  strategy: 'covered_call' as const,
  strike: 200,
  expiration: '2027-07-19',
  contracts: 1,
  premium_per_contract: 3.5,
  open_date: '2026-05-15',
  status: 'open' as const,
  close_date: null,
  close_premium: null,
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
    fireEvent.change(screen.getByLabelText(/expiration/i), { target: { value: '2027-07-19' } });
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
        expiration: '2027-07-19',
        premiumPerContract: 3.5,
      });
    });
  });

  it('rejects Add form with strike=0 before invoking backend', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 0, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
      });
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText(/No options tracked/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add position/i }));
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/strike/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/expiration/i), { target: { value: '2027-07-19' } });
    fireEvent.change(screen.getByLabelText(/premium/i), { target: { value: '1.0' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('Strike must be > 0', 'error'));
    const creates = invokeMock.mock.calls.filter((c) => c[0] === 'create_option_position');
    expect(creates.length).toBe(0);
  });

  it('rejects Add form with past expiration before invoking backend', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_option_positions') return Promise.resolve([]);
      if (cmd === 'get_options_summary') return Promise.resolve({
        open_count: 0, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
      });
      return Promise.resolve(null);
    });
    render(<OptionsTab portfolioName="main" />);
    await waitFor(() => expect(screen.getByText(/No options tracked/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add position/i }));
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/strike/i), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/expiration/i), { target: { value: '2020-01-01' } });
    fireEvent.change(screen.getByLabelText(/premium/i), { target: { value: '1.0' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('Expiration must be on or after today', 'error'),
    );
    const creates = invokeMock.mock.calls.filter((c) => c[0] === 'create_option_position');
    expect(creates.length).toBe(0);
  });

  it('Close Early flow invokes update_option_position with closed_early', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /close early/i }));
    fireEvent.change(screen.getByLabelText(/close debit/i), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter((c) => c[0] === 'update_option_position');
      expect(calls.length).toBe(1);
      expect(calls[0][1]).toMatchObject({
        id: 'opt-1',
        status: 'closed_early',
        closePremium: 0.5,
      });
    });
  });

  describe('Delete flow', () => {
    let originalConfirm: typeof window.confirm;
    afterEach(() => {
      window.confirm = originalConfirm;
    });

    it('calls delete_option_position when user confirms', async () => {
      originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'list_option_positions') return Promise.resolve([openCC]);
        if (cmd === 'get_options_summary') return Promise.resolve({
          open_count: 1, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
        });
        if (cmd === 'delete_option_position') return Promise.resolve();
        return Promise.resolve(null);
      });
      render(<OptionsTab portfolioName="main" />);
      await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      await waitFor(() => {
        const calls = invokeMock.mock.calls.filter((c) => c[0] === 'delete_option_position');
        expect(calls.length).toBe(1);
        expect(calls[0][1]).toEqual({ id: 'opt-1' });
      });
    });

    it('does not call backend when user cancels', async () => {
      originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(false);
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'list_option_positions') return Promise.resolve([openCC]);
        if (cmd === 'get_options_summary') return Promise.resolve({
          open_count: 1, total_cash_secured: 0, total_assignment_exposure: 0, realized_premium_ytd: 0,
        });
        return Promise.resolve(null);
      });
      render(<OptionsTab portfolioName="main" />);
      await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      const deletes = invokeMock.mock.calls.filter((c) => c[0] === 'delete_option_position');
      expect(deletes.length).toBe(0);
    });
  });

  it('History view passes statusFilter=null', async () => {
    const expired = { ...openCC, id: 'opt-2', status: 'expired' as const, close_date: '2026-07-19' };
    invokeMock.mockImplementation((cmd: string, args: Record<string, unknown> | undefined) => {
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
    await waitFor(() => {
      const listCalls = invokeMock.mock.calls.filter((c) => c[0] === 'list_option_positions');
      expect(listCalls.some((c) => (c[1] as { statusFilter: unknown }).statusFilter === null)).toBe(
        true,
      );
    });
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
  });
});
