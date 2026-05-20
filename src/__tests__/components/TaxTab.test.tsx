import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaxTab } from '../../components/TaxTab';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

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
  applied_rate: 0.24,
};

describe('TaxTab', () => {
  it('renders empty state when no opportunities', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'load_setting') return Promise.resolve('0.24');
      if (cmd === 'get_tax_loss_harvest_opportunities') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<TaxTab portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() =>
      expect(screen.getByText(/No unrealized losses/i)).toBeInTheDocument(),
    );
  });

  it('renders opportunities table with peer suggestion', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'load_setting') return Promise.resolve('0.24');
      if (cmd === 'get_tax_loss_harvest_opportunities')
        return Promise.resolve([sampleOpp]);
      return Promise.resolve(null);
    });

    render(<TaxTab portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() => expect(screen.getByText('XLK')).toBeInTheDocument());
    // tax benefit at 24% — appears in both summary line and table row
    expect(screen.getAllByText(/\$240/).length).toBeGreaterThanOrEqual(1);
    // suggested peer (XLK → VGT or FTEC per replacementPeers)
    expect(screen.getByText(/VGT/)).toBeInTheDocument();
  });

  it('reissues opportunity fetch when slider changes', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'load_setting') return Promise.resolve('0.24');
      if (cmd === 'get_tax_loss_harvest_opportunities')
        return Promise.resolve([sampleOpp]);
      return Promise.resolve(null);
    });

    render(<TaxTab portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() => expect(screen.getByText('XLK')).toBeInTheDocument());

    const slider = screen.getByRole('slider', { name: /marginal tax rate/i });
    fireEvent.change(slider, { target: { value: '0.35' } });

    await waitFor(() => {
      const harvestCalls = invokeMock.mock.calls.filter(
        (c) => c[0] === 'get_tax_loss_harvest_opportunities',
      );
      expect(harvestCalls.length).toBeGreaterThanOrEqual(2);
      // Last call has override_rate=0.35
      const lastCall = harvestCalls[harvestCalls.length - 1];
      expect(lastCall[1]).toMatchObject({ overrideRate: 0.35 });
    });
  });

  it('fires record_wash_sale_event when Mark Harvested clicked', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'load_setting') return Promise.resolve('0.24');
      if (cmd === 'get_tax_loss_harvest_opportunities')
        return Promise.resolve([sampleOpp]);
      if (cmd === 'record_wash_sale_event') return Promise.resolve();
      return Promise.resolve(null);
    });

    render(<TaxTab portfolioName="default" currentPrices={{ XLK: 180 }} />);
    await waitFor(() => expect(screen.getByText('XLK')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /mark harvested/i }));
    await waitFor(() => {
      const harvestEvents = invokeMock.mock.calls.filter(
        (c) => c[0] === 'record_wash_sale_event',
      );
      expect(harvestEvents.length).toBe(1);
      expect(harvestEvents[0][1]).toMatchObject({
        portfolioName: 'default',
        symbol: 'XLK',
        harvestedLoss: -1000,
      });
    });
  });
});
