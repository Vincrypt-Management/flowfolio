import { useMemo, useState } from 'react';

export interface OptionsCloseEarlyPosition {
  id: string;
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: number;
  contracts: number;
  premium_per_contract: number;
}

interface Props {
  position: OptionsCloseEarlyPosition;
  onCancel: () => void;
  onConfirm: (closeDebitPerContract: number, closeDate: string) => Promise<void>;
}

export function OptionsCloseEarlyModal({ position, onCancel, onConfirm }: Props) {
  const [debit, setDebit] = useState('0');
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const realized = useMemo(() => {
    const d = Number.parseFloat(debit);
    const debitNum = Number.isFinite(d) ? d : 0;
    return (position.premium_per_contract - debitNum) * position.contracts * 100;
  }, [debit, position]);

  const strategyLabel = position.strategy === 'covered_call' ? 'CC' : 'CSP';

  return (
    <div className="options-tab__modal" role="dialog" aria-label="Close option early">
      <h3>
        Close Early — {position.symbol} {strategyLabel} ${position.strike.toFixed(2)}
      </h3>
      <p>
        Contracts: <strong>{position.contracts}</strong>
        &nbsp;|&nbsp; Open premium: <strong>${position.premium_per_contract.toFixed(2)}</strong>
      </p>

      <label>
        Close debit (per contract)
        <input
          type="number"
          min="0"
          step="0.01"
          value={debit}
          aria-label="close debit"
          onChange={(e) => setDebit(e.target.value)}
        />
      </label>

      <label>
        Close date
        <input
          type="date"
          value={closeDate}
          aria-label="close date"
          onChange={(e) => setCloseDate(e.target.value)}
        />
      </label>

      <p>
        Realized P&amp;L: <strong>${realized.toFixed(2)}</strong>
      </p>

      <div className="options-tab__modal-actions">
        <button
          type="button"
          disabled={submitting}
          onClick={async () => {
            const d = Number.parseFloat(debit);
            if (!Number.isFinite(d) || d < 0) return;
            setSubmitting(true);
            try {
              await onConfirm(d, closeDate);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Confirm
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
