import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

// Import after mocks so the hook module-level cache picks up the mock.
import { TaxLotView } from '../../components/TaxLotView';
import { __resetMarginalRateCache } from '../../hooks/useMarginalRate';

const sampleOpp = {
  lot_id: 'lot-1',
  symbol: 'XLK',
  shares: 50,
  cost_basis: 200,
  current_price: 180,
  unrealized_loss: -1000,
  days_held: 120,
  is_long_term: false,
  tax_benefit_estimate: 240,
};

describe('TaxLotView', () => {
  it('renders the user marginal rate in the Est. Tax Benefit label (not hardcoded 25%)', async () => {
    __resetMarginalRateCache();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_tax_lots') return Promise.resolve([]);
      if (cmd === 'get_tax_loss_harvest_opportunities') return Promise.resolve([sampleOpp]);
      if (cmd === 'load_setting') return Promise.resolve('0.40');
      return Promise.resolve(null);
    });
    render(<TaxLotView portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() => expect(screen.getByText(/Est\. Tax Benefit \(40%\)/)).toBeInTheDocument());
  });

  it('falls back to 25% default when marginal rate setting is absent', async () => {
    __resetMarginalRateCache();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'list_tax_lots') return Promise.resolve([]);
      if (cmd === 'get_tax_loss_harvest_opportunities') return Promise.resolve([sampleOpp]);
      if (cmd === 'load_setting') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    render(<TaxLotView portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() => expect(screen.getByText(/Est\. Tax Benefit \(25%\)/)).toBeInTheDocument());
  });
});
