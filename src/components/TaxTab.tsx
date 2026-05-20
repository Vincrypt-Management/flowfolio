import { useCallback, useEffect, useMemo, useState } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';
import { useToast } from './Toast';
import { findReplacementPeers } from '../services/replacementPeers';

const log = createLogger('TaxTab');

interface HarvestOpportunity {
  lot_id: string;
  symbol: string;
  shares: number;
  cost_basis: number;
  current_price: number;
  unrealized_loss: number;
  days_held: number;
  is_long_term: boolean;
  tax_benefit_estimate: number;
  applied_rate: number;
}

interface TaxTabProps {
  portfolioName: string;
  currentPrices: Record<string, number>;
}

export function TaxTab({ portfolioName, currentPrices }: TaxTabProps) {
  const [rate, setRate] = useState<number>(0.24);
  const [opportunities, setOpportunities] = useState<HarvestOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  // Load default rate from settings on mount.
  useEffect(() => {
    let cancelled = false;
    invokeWithResilience<string | null>('load_setting', { key: 'marginal_tax_rate' })
      .then((v) => {
        if (cancelled) return;
        const parsed = v ? parseFloat(v) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0.6) {
          setRate(parsed);
        }
      })
      .catch((err) => {
        log.warn('marginal_tax_rate load failed, keeping default', err);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch opportunities whenever rate or prices change.
  useEffect(() => {
    let cancelled = false;
    invokeWithResilience<HarvestOpportunity[]>('get_tax_loss_harvest_opportunities', {
      portfolioName,
      currentPrices,
      overrideRate: rate,
    })
      .then((res) => {
        if (!cancelled) {
          setOpportunities(res ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          log.error('failed to load harvest opportunities', err);
          setOpportunities([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [portfolioName, currentPrices, rate]);

  const onMarkHarvested = useCallback(
    async (opp: HarvestOpportunity) => {
      try {
        await invokeWithResilience('record_wash_sale_event', {
          id: `wash-${opp.lot_id}-${Date.now()}`,
          portfolioName,
          symbol: opp.symbol,
          saleDate: new Date().toISOString().slice(0, 10),
          harvestedLoss: opp.unrealized_loss,
        });
        setOpportunities((prev) => prev.filter((o) => o.lot_id !== opp.lot_id));
        addToast('Loss harvested', 'success');
      } catch (err) {
        log.error('record_wash_sale_event failed', err);
        addToast('Failed to record harvest', 'error');
      }
    },
    [portfolioName, addToast],
  );

  const onSaveRateAsDefault = useCallback(async () => {
    try {
      await invokeWithResilience('save_setting', {
        key: 'marginal_tax_rate',
        value: rate.toString(),
      });
      addToast('Default rate saved', 'success');
    } catch (err) {
      log.error('save_setting failed', err);
      addToast('Failed to save rate', 'error');
    }
  }, [rate, addToast]);

  const totalSavings = useMemo(
    () => opportunities.reduce((s, o) => s + o.tax_benefit_estimate, 0),
    [opportunities],
  );

  return (
    <section className="tax-tab">
      <header className="tax-tab__header">
        <h2>Tax-Loss Harvesting</h2>
        <div className="tax-tab__rate-control">
          <label htmlFor="marginal-rate">
            Marginal tax rate: {(rate * 100).toFixed(0)}%
          </label>
          <input
            id="marginal-rate"
            aria-label="marginal tax rate"
            type="range"
            min="0"
            max="0.6"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
          />
          <button type="button" onClick={onSaveRateAsDefault}>
            Save as default
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : opportunities.length === 0 ? (
        <p className="empty-state">
          No unrealized losses found. Tax-loss harvesting only flags positions
          where current price is below cost basis.
        </p>
      ) : (
        <>
          <p className="tax-tab__summary">
            Potential savings: <strong>${totalSavings.toFixed(0)}</strong> across{' '}
            {opportunities.length} position{opportunities.length !== 1 ? 's' : ''} at{' '}
            {(rate * 100).toFixed(0)}% marginal rate.
          </p>
          <table className="tax-tab__table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th>Cost</th>
                <th>Current</th>
                <th>Loss</th>
                <th>Days held</th>
                <th>Est. savings</th>
                <th>Replacement</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => {
                const peers = findReplacementPeers(o.symbol);
                const replacement = peers.length > 0 ? peers[0] : 'pick manually';
                return (
                  <tr key={o.lot_id}>
                    <td>{o.symbol}</td>
                    <td>{o.shares}</td>
                    <td>${o.cost_basis.toFixed(2)}</td>
                    <td>${o.current_price.toFixed(2)}</td>
                    <td className="negative">${o.unrealized_loss.toFixed(2)}</td>
                    <td>
                      {o.days_held}
                      {o.is_long_term ? ' (LT)' : ''}
                    </td>
                    <td>${o.tax_benefit_estimate.toFixed(0)}</td>
                    <td>{replacement}</td>
                    <td>
                      <button type="button" onClick={() => onMarkHarvested(o)}>
                        Mark Harvested
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
