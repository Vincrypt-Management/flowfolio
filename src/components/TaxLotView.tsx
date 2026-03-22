/**
 * TaxLotView Component
 * Displays tax lots for a portfolio with FIFO/LIFO visibility, short/long-term
 * classification, unrealized gain/loss colouring, and tax-loss harvest opportunities.
 */

import { useState, useEffect, useCallback } from 'react';
import { Receipt, Loader2, TrendingDown } from 'lucide-react';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import { formatCurrency } from '../shared/utils';
import './TaxLotView.css';

const log = createLogger('TaxLotView');

// ── Types ──────────────────────────────────────────────────────────────────

interface TaxLot {
  id: string;
  portfolio_name: string;
  symbol: string;
  shares: number;
  cost_basis_per_share: number;
  purchase_date: string;
  is_closed: boolean;
  close_date: string | null;
  close_price: number | null;
  created_at: string;
  days_held: number;
  is_long_term: boolean;
}

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
}

export interface TaxLotViewProps {
  portfolioName: string;
  currentPrices: Record<string, number>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function unrealizedGain(lot: TaxLot, currentPrices: Record<string, number>): number | null {
  const price = currentPrices[lot.symbol];
  if (price === undefined) return null;
  return (price - lot.cost_basis_per_share) * lot.shares;
}

function GainBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="tax-lot-gain--unknown">—</span>;
  const cls = value >= 0 ? 'tax-lot-gain--positive' : 'tax-lot-gain--negative';
  return <span className={`tax-lot-gain ${cls}`}>{formatCurrency(value)}</span>;
}

function TermBadge({ isLongTerm }: { isLongTerm: boolean }) {
  return (
    <span className={`tax-lot-term ${isLongTerm ? 'tax-lot-term--long' : 'tax-lot-term--short'}`}>
      {isLongTerm ? 'Long-term' : 'Short-term'}
    </span>
  );
}

function StatusBadge({ isClosed }: { isClosed: boolean }) {
  return (
    <span className={`tax-lot-status ${isClosed ? 'tax-lot-status--closed' : 'tax-lot-status--open'}`}>
      {isClosed ? 'Closed' : 'Open'}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaxLotView({ portfolioName, currentPrices }: TaxLotViewProps) {
  const [lots, setLots] = useState<TaxLot[]>([]);
  const [opportunities, setOpportunities] = useState<HarvestOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const loadData = useCallback(async () => {
    if (!portfolioName) return;
    setLoading(true);
    try {
      const [lotsResult, opportunitiesResult] = await Promise.all([
        invokeWithResilience<TaxLot[]>('list_tax_lots', {
          portfolioName,
          symbol: null,
        }),
        invokeWithResilience<HarvestOpportunity[]>('get_tax_loss_harvest_opportunities', {
          portfolioName,
          currentPrices,
        }),
      ]);
      setLots(lotsResult);
      setOpportunities(opportunitiesResult);
      log.debug('Tax lots loaded', { count: lotsResult.length, opportunities: opportunitiesResult.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load tax lots', { error: message });
      addToast(`Failed to load tax lots: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [portfolioName, currentPrices, addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="tax-lot-loading">
        <Loader2 className="tax-lot-spinner" size={24} />
        <span>Loading tax lots…</span>
      </div>
    );
  }

  return (
    <div className="tax-lot-view">
      {/* Header */}
      <div className="tax-lot-header">
        <Receipt size={20} className="tax-lot-header__icon" />
        <h2 className="tax-lot-header__title">Tax Lot Tracking</h2>
        <span className="tax-lot-header__subtitle">{portfolioName}</span>
      </div>

      {/* Tax Lots Table */}
      <section className="tax-lot-section">
        <h3 className="tax-lot-section__title">Tax Lots</h3>
        {lots.length === 0 ? (
          <p className="tax-lot-empty">No tax lots recorded for this portfolio.</p>
        ) : (
          <div className="tax-lot-table-wrapper">
            <table className="tax-lot-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Shares</th>
                  <th>Cost Basis / Share</th>
                  <th>Purchase Date</th>
                  <th>Days Held</th>
                  <th>Term</th>
                  <th>Unrealized Gain / Loss</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const gain = unrealizedGain(lot, currentPrices);
                  return (
                    <tr key={lot.id} className={lot.is_closed ? 'tax-lot-row--closed' : ''}>
                      <td className="tax-lot-symbol">{lot.symbol}</td>
                      <td>{lot.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                      <td>{formatCurrency(lot.cost_basis_per_share)}</td>
                      <td>{formatDate(lot.purchase_date)}</td>
                      <td>{lot.days_held.toLocaleString()}</td>
                      <td><TermBadge isLongTerm={lot.is_long_term} /></td>
                      <td><GainBadge value={lot.is_closed ? null : gain} /></td>
                      <td><StatusBadge isClosed={lot.is_closed} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tax-Loss Harvest Opportunities */}
      <section className="tax-lot-section">
        <div className="tax-lot-section__header-row">
          <TrendingDown size={18} className="tax-lot-section__icon--loss" />
          <h3 className="tax-lot-section__title">Tax-Loss Harvest Opportunities</h3>
        </div>
        {opportunities.length === 0 ? (
          <p className="tax-lot-empty">No harvest opportunities found — all open lots are currently at a gain.</p>
        ) : (
          <div className="tax-lot-opportunities">
            {opportunities.map((opp) => (
              <div key={opp.lot_id} className="tax-lot-opportunity-card">
                <div className="tax-lot-opportunity-card__top">
                  <span className="tax-lot-symbol">{opp.symbol}</span>
                  <TermBadge isLongTerm={opp.is_long_term} />
                </div>
                <div className="tax-lot-opportunity-card__grid">
                  <div className="tax-lot-opportunity-card__field">
                    <span className="tax-lot-opportunity-card__label">Shares</span>
                    <span>{opp.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                  </div>
                  <div className="tax-lot-opportunity-card__field">
                    <span className="tax-lot-opportunity-card__label">Cost Basis</span>
                    <span>{formatCurrency(opp.cost_basis)}</span>
                  </div>
                  <div className="tax-lot-opportunity-card__field">
                    <span className="tax-lot-opportunity-card__label">Current Price</span>
                    <span>{formatCurrency(opp.current_price)}</span>
                  </div>
                  <div className="tax-lot-opportunity-card__field">
                    <span className="tax-lot-opportunity-card__label">Unrealized Loss</span>
                    <span className="tax-lot-gain--negative">{formatCurrency(opp.unrealized_loss)}</span>
                  </div>
                  <div className="tax-lot-opportunity-card__field">
                    <span className="tax-lot-opportunity-card__label">Days Held</span>
                    <span>{opp.days_held.toLocaleString()}</span>
                  </div>
                  <div className="tax-lot-opportunity-card__field tax-lot-opportunity-card__field--highlight">
                    <span className="tax-lot-opportunity-card__label">Est. Tax Benefit (25%)</span>
                    <span className="tax-lot-benefit">{formatCurrency(opp.tax_benefit_estimate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default TaxLotView;
