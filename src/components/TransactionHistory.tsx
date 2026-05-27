/**
 * TransactionHistory Component
 * Displays a sortable, filterable table of portfolio transactions with
 * color-coded action badges and per-row delete support.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { History, Trash2, ChevronDown } from 'lucide-react';
import { Spinner, EmptyState, Button } from '@flowfolio/ui';
import { invokeWithResilience } from '../services/apiClient';
import { useToast } from './Toast';
import { createLogger } from '../core/logger';
import { formatCurrency } from '../shared/utils';
import './TransactionHistory.css';

const log = createLogger('TransactionHistory');

// ── Types ──────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  date: string;
  symbol: string;
  action: 'buy' | 'sell' | 'dividend';
  shares: number;
  price: number;
  total: number;
  notes?: string;
}

export interface TransactionHistoryProps {
  portfolioName: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function ActionBadge({ action }: { action: Transaction['action'] }) {
  return (
    <span className={`txn-badge txn-badge--${action}`}>
      {action.charAt(0).toUpperCase() + action.slice(1)}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function TransactionHistory({ portfolioName }: TransactionHistoryProps) {
  const { addToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load ──

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeWithResilience<Transaction[]>('list_transactions', {
        portfolioName,
      });
      // Sort newest first
      const sorted = [...data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setTransactions(sorted);
      log.info(`Loaded ${sorted.length} transactions for ${portfolioName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to load transactions', msg);
      addToast(`Failed to load transactions: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [portfolioName, addToast]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // ── Delete ──

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await invokeWithResilience('delete_transaction', { id });
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        addToast('Transaction deleted', 'success');
        log.info(`Deleted transaction ${id}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Failed to delete transaction', msg);
        addToast(`Failed to delete: ${msg}`, 'error');
      } finally {
        setDeletingId(null);
      }
    },
    [addToast]
  );

  // ── Derived ──

  const uniqueSymbols = useMemo(
    () => ['ALL', ...Array.from(new Set(transactions.map((t) => t.symbol))).sort()],
    [transactions]
  );

  const filtered = useMemo(
    () =>
      filterSymbol === 'ALL'
        ? transactions
        : transactions.filter((t) => t.symbol === filterSymbol),
    [transactions, filterSymbol]
  );

  // ── Render ──

  return (
    <div className="txn-history">
      {/* Header */}
      <div className="txn-history__header">
        <div className="txn-history__title">
          <History size={20} />
          <h2>Transaction History</h2>
          {!loading && (
            <span className="txn-history__count">{filtered.length} records</span>
          )}
        </div>

        {/* Filter */}
        {transactions.length > 0 && (
          <div className="txn-history__filter">
            <label htmlFor="txn-symbol-filter" className="sr-only">
              Filter by symbol
            </label>
            <div className="txn-history__select-wrap">
              <select
                id="txn-symbol-filter"
                className="txn-history__select"
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
              >
                {uniqueSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s === 'ALL' ? 'All Symbols' : s}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="txn-history__select-icon" />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="txn-history__loading">
          <Spinner size="lg" color="muted" />
          <span>Loading transactions…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<History size={20} />}
          title="No transactions found"
          description={filterSymbol !== 'ALL' ? `No transactions match the "${filterSymbol}" filter.` : undefined}
          action={filterSymbol !== 'ALL' ? { label: 'Clear filter', onClick: () => setFilterSymbol('ALL') } : undefined}
        />
      ) : (
        <div className="txn-history__table-wrap">
          <table className="txn-history__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Action</th>
                <th className="txn-history__num">Shares</th>
                <th className="txn-history__num">Price</th>
                <th className="txn-history__num">Total</th>
                <th>Notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((txn) => (
                <tr key={txn.id} className="txn-history__row">
                  <td className="txn-history__date">{formatDate(txn.date)}</td>
                  <td className="txn-history__symbol">{txn.symbol}</td>
                  <td>
                    <ActionBadge action={txn.action} />
                  </td>
                  <td className="txn-history__num">
                    {txn.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  </td>
                  <td className="txn-history__num">{formatCurrency(txn.price)}</td>
                  <td className="txn-history__num">{formatCurrency(txn.total)}</td>
                  <td className="txn-history__notes">{txn.notes ?? '—'}</td>
                  <td className="txn-history__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(txn.id)}
                      loading={deletingId === txn.id}
                      leftIcon={deletingId !== txn.id ? <Trash2 size={14} /> : undefined}
                      aria-label={`Delete transaction ${txn.id}`}
                    >
                      <span className="sr-only">Delete</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
