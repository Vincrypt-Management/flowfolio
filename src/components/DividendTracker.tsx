/**
 * DividendTracker Component
 * Tracks dividend income with summary cards, a history table, and an
 * "Add Dividend" form for manual entry.
 */

import { useState, useEffect, useCallback, useReducer } from 'react';
import { DollarSign, Plus, X, RefreshCw } from 'lucide-react';
import { Spinner, EmptyState, Button } from '@flowfolio/ui';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import { formatCurrency } from '../shared/utils';
import './DividendTracker.css';

const log = createLogger('DividendTracker');

// ── Types ─────────────────────────────────────────────────────────────────

interface DividendEntry {
  id: string;
  date: string;
  symbol: string;
  amount_per_share: number;
  shares: number;
  total: number;
  ex_date: string;
  pay_date: string;
  reinvested: boolean;
}

interface DividendSummary {
  ytd_income: number;
  all_time_income: number;
}

export interface DividendTrackerProps {
  portfolioName: string;
}

// ── Form state using useReducer ───────────────────────────────────────────

interface FormState {
  symbol: string;
  amountPerShare: string;
  shares: string;
  exDate: string;
  payDate: string;
  reinvested: boolean;
}

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: string | boolean }
  | { type: 'RESET' };

const INITIAL_FORM: FormState = {
  symbol: '',
  amountPerShare: '',
  shares: '',
  exDate: '',
  payDate: '',
  reinvested: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return INITIAL_FORM;
    default:
      return state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────

export function DividendTracker({ portfolioName }: DividendTrackerProps) {
  const { addToast } = useToast();

  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, dispatch] = useReducer(formReducer, INITIAL_FORM);

  // ── Load data ──

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entries, summaryData] = await Promise.all([
        invokeWithResilience<DividendEntry[]>('list_dividends', { portfolioName }),
        invokeWithResilience<DividendSummary>('get_dividend_summary', { portfolioName }),
      ]);

      const sorted = [...entries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setDividends(sorted);
      setSummary(summaryData);
      log.info(`Loaded ${sorted.length} dividends for ${portfolioName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to load dividends', msg);
      addToast(`Failed to load dividends: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [portfolioName, addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Form submit ──

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const symbol = form.symbol.trim().toUpperCase();
      const amountPerShare = parseFloat(form.amountPerShare);
      const shares = parseFloat(form.shares);

      if (!symbol) {
        addToast('Symbol is required', 'warning');
        return;
      }
      if (isNaN(amountPerShare) || amountPerShare <= 0) {
        addToast('Amount per share must be a positive number', 'warning');
        return;
      }
      if (isNaN(shares) || shares <= 0) {
        addToast('Shares must be a positive number', 'warning');
        return;
      }
      if (!form.exDate) {
        addToast('Ex-date is required', 'warning');
        return;
      }
      if (!form.payDate) {
        addToast('Pay-date is required', 'warning');
        return;
      }

      setSubmitting(true);
      try {
        await invokeWithResilience('record_dividend', {
          portfolioName,
          symbol,
          amountPerShare,
          shares,
          exDate: form.exDate,
          payDate: form.payDate,
          reinvested: form.reinvested,
        });
        addToast(`Dividend for ${symbol} added`, 'success');
        dispatch({ type: 'RESET' });
        setShowForm(false);
        void loadData();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Failed to add dividend', msg);
        addToast(`Failed to add dividend: ${msg}`, 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [form, portfolioName, addToast, loadData]
  );

  // ── Render ──

  return (
    <div className="div-tracker">
      {/* Page Header */}
      <div className="div-tracker__header">
        <div className="div-tracker__title">
          <DollarSign size={20} />
          <h2>Dividend Tracker</h2>
        </div>
        <div className="div-tracker__header-actions">
          <button
            className="div-tracker__btn div-tracker__btn--ghost"
            onClick={() => void loadData()}
            disabled={loading}
            aria-label="Refresh dividends"
          >
            <RefreshCw size={15} className={loading ? 'div-tracker__spinner' : ''} />
          </button>
          <button
            className="div-tracker__btn div-tracker__btn--primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? 'Cancel' : 'Add Dividend'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary !== null && (
        <div className="div-tracker__summary-cards">
          <div className="div-tracker__summary-card">
            <span className="div-tracker__summary-label">YTD Income</span>
            <span className="div-tracker__summary-value">{formatCurrency(summary.ytd_income)}</span>
          </div>
          <div className="div-tracker__summary-card">
            <span className="div-tracker__summary-label">All-Time Income</span>
            <span className="div-tracker__summary-value">{formatCurrency(summary.all_time_income)}</span>
          </div>
        </div>
      )}

      {/* Add Dividend Form */}
      {showForm && (
        <form className="div-tracker__form" onSubmit={(e) => void handleSubmit(e)}>
          <h3 className="div-tracker__form-title">Add Dividend</h3>
          <div className="div-tracker__form-grid">
            <div className="div-tracker__form-field">
              <label htmlFor="div-symbol">Symbol</label>
              <input
                id="div-symbol"
                type="text"
                placeholder="e.g. AAPL"
                value={form.symbol}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'symbol', value: e.target.value })}
                maxLength={10}
              />
            </div>
            <div className="div-tracker__form-field">
              <label htmlFor="div-amount">Amount / Share ($)</label>
              <input
                id="div-amount"
                type="number"
                placeholder="0.00"
                step="0.0001"
                min="0"
                value={form.amountPerShare}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'amountPerShare', value: e.target.value })}
              />
            </div>
            <div className="div-tracker__form-field">
              <label htmlFor="div-shares">Shares Held</label>
              <input
                id="div-shares"
                type="number"
                placeholder="0"
                step="0.0001"
                min="0"
                value={form.shares}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'shares', value: e.target.value })}
              />
            </div>
            <div className="div-tracker__form-field">
              <label htmlFor="div-exdate">Ex-Date</label>
              <input
                id="div-exdate"
                type="date"
                value={form.exDate}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'exDate', value: e.target.value })}
              />
            </div>
            <div className="div-tracker__form-field">
              <label htmlFor="div-paydate">Pay-Date</label>
              <input
                id="div-paydate"
                type="date"
                value={form.payDate}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'payDate', value: e.target.value })}
              />
            </div>
            <div className="div-tracker__form-field div-tracker__form-field--toggle">
              <label className="div-tracker__reinvest-label">
                <input
                  type="checkbox"
                  checked={form.reinvested}
                  onChange={(e) =>
                    dispatch({ type: 'SET_FIELD', field: 'reinvested', value: e.target.checked })
                  }
                />
                <span>Reinvested (DRIP)</span>
              </label>
            </div>
          </div>
          <div className="div-tracker__form-actions">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
              leftIcon={!submitting ? <Plus size={14} /> : undefined}
            >
              {submitting ? 'Saving…' : 'Save Dividend'}
            </Button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="div-tracker__table-section">
        {loading ? (
          <div className="div-tracker__loading">
            <Spinner size="lg" color="muted" />
            <span>Loading dividends…</span>
          </div>
        ) : dividends.length === 0 ? (
          <EmptyState
            icon={<DollarSign size={20} />}
            title="No dividends recorded yet"
            description='Use the "Add Dividend" button to record your first dividend.'
          />
        ) : (
          <div className="div-tracker__table-wrap">
            <table className="div-tracker__table">
              <thead>
                <tr>
                  <th>Pay Date</th>
                  <th>Symbol</th>
                  <th className="div-tracker__num">Amt/Share</th>
                  <th className="div-tracker__num">Shares</th>
                  <th className="div-tracker__num">Total</th>
                  <th>Reinvested?</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((div) => (
                  <tr key={div.id} className="div-tracker__row">
                    <td className="div-tracker__date">{formatDate(div.pay_date)}</td>
                    <td className="div-tracker__symbol">{div.symbol}</td>
                    <td className="div-tracker__num">{formatCurrency(div.amount_per_share)}</td>
                    <td className="div-tracker__num">
                      {div.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="div-tracker__num div-tracker__total">{formatCurrency(div.total)}</td>
                    <td>
                      <span
                        className={`div-tracker__reinvest-badge${div.reinvested ? ' div-tracker__reinvest-badge--yes' : ''}`}
                      >
                        {div.reinvested ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
