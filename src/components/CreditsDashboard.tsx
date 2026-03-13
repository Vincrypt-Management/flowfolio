import { useState, useEffect, useMemo, useCallback } from 'react';
import { auth, CreditTransaction } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import { createLogger } from '../core/logger';
import './CreditsDashboard.css';

const log = createLogger('credits-dashboard');

interface CreditsDashboardProps {
  onNavigate?: (tab: string) => void;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

function CreditsDashboard({ onNavigate }: CreditsDashboardProps) {
  const { user, subscription } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await auth.getCredits();
      if (result) {
        setTransactions(result.transactions);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load credits';
      log.error('Failed to fetch credits', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Credit ring calculation
  const ringData = useMemo(() => {
    if (!subscription) return { offset: 283, pct: 0 };
    const max = subscription.monthly_credits || 1;
    const pct = Math.min(1, subscription.credits / max);
    const circumference = 2 * Math.PI * 45; // r=45
    const offset = circumference * (1 - pct);
    return { offset, pct, circumference };
  }, [subscription]);

  // Tier badge class
  const tierClass = subscription ? `tier-${subscription.tier}` : 'tier-free';
  const tierLabel = subscription?.tier
    ? subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)
    : 'Free';

  if (!user) {
    return (
      <div className="credits-dashboard">
        <div className="credits-error">Please log in to view your credits dashboard.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="credits-dashboard">
        <div className="credits-loading">
          <div className="credits-spinner" />
          Loading credits...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="credits-dashboard">
        <div className="credits-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="credits-dashboard">
      {/* Credit Balance Card */}
      <div className="credits-balance-card">
        <div className="credits-ring-wrapper">
          <svg className="credits-ring-svg" viewBox="0 0 100 100">
            <circle className="credits-ring-bg" cx="50" cy="50" r="45" />
            <circle
              className="credits-ring-fg"
              cx="50"
              cy="50"
              r="45"
              strokeDasharray={ringData.circumference}
              strokeDashoffset={ringData.offset}
            />
          </svg>
          <div className="credits-ring-label">
            <span className="credits-ring-value">
              {Math.round(ringData.pct * 100)}%
            </span>
            <span className="credits-ring-text">remaining</span>
          </div>
        </div>

        <div className="credits-balance-info">
          <div className="credits-balance-title">Credit Balance</div>
          <div className="credits-balance-amount">
            {subscription?.credits ?? 0}
            <span> / {subscription?.monthly_credits ?? 0}</span>
          </div>
          <div className="credits-monthly-note">
            {subscription?.monthly_credits ?? 0} credits renew monthly
          </div>
        </div>
      </div>

      {/* Tier Info Card */}
      <div className="credits-tier-card">
        <div className="credits-tier-header">
          <span className={`credits-tier-badge ${tierClass}`}>
            {tierLabel}
          </span>
          <span className="credits-tier-label">Current Plan</span>
        </div>

        {/* Usage Meters */}
        <div className="credits-meters">
          <UsageMeter
            label="Portfolios"
            current={0}
            max={subscription?.max_portfolios ?? 1}
          />
          <UsageMeter
            label="Watchlist Items"
            current={0}
            max={subscription?.max_watchlist_items ?? 5}
          />
          <UsageMeter
            label="Backtests"
            current={0}
            max={subscription?.backtest_limit ?? 1}
          />
          <UsageMeter
            label="AI Queries"
            current={0}
            max={subscription?.ai_queries_limit ?? 2}
          />
        </div>
      </div>

      {/* Transaction History */}
      <div className="credits-transactions-card">
        <div className="credits-transactions-title">Recent Transactions</div>
        <div className="credits-transactions-list">
          {transactions.length === 0 ? (
            <div className="credits-tx-empty">No transactions yet</div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="credits-tx-row">
                <span className={`credits-tx-type type-${tx.type}`}>
                  {tx.type}
                </span>
                <span className="credits-tx-desc">
                  {tx.description || 'Credit transaction'}
                </span>
                <span
                  className={`credits-tx-amount ${
                    tx.amount >= 0 ? 'amount-positive' : 'amount-negative'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}{tx.amount}
                </span>
                <div className="credits-tx-meta">
                  <span className="credits-tx-balance">bal: {tx.balance}</span>
                  <span className="credits-tx-time">
                    {formatTimeAgo(tx.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Upgrade CTA for free tier */}
      {subscription?.tier === 'free' && (
        <div className="credits-upgrade-card">
          <div className="credits-upgrade-title">Unlock More Power</div>
          <div className="credits-upgrade-desc">
            Upgrade to Starter or Pro for more portfolios, backtests, AI queries,
            and monthly credits.
          </div>
          <button
            className="credits-upgrade-btn"
            onClick={() => onNavigate?.('settings')}
          >
            View Plans
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Usage Meter Sub-component ───────────────── */

function UsageMeter({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  let fillClass = '';
  if (pct >= 90) fillClass = 'meter-danger';
  else if (pct >= 70) fillClass = 'meter-warning';

  return (
    <div className="credits-meter">
      <div className="credits-meter-header">
        <span className="credits-meter-label">{label}</span>
        <span className="credits-meter-value">
          {current}/{max}
        </span>
      </div>
      <div className="credits-meter-bar">
        <div
          className={`credits-meter-fill ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export { CreditsDashboard };
