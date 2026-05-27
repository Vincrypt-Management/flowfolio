import { useCallback, useEffect, useState } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';
import { useToast } from './Toast';
import {
  OptionsCloseEarlyModal,
  type OptionsCloseEarlyPosition,
} from './OptionsCloseEarlyModal';
import { Button, Input, Select } from '@flowfolio/ui';

const log = createLogger('OptionsTab');

interface OptionPosition {
  id: string;
  portfolio_name: string;
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: number;
  expiration: string;
  contracts: number;
  premium_per_contract: number;
  open_date: string;
  status: 'open' | 'expired' | 'assigned' | 'closed_early';
  close_date: string | null;
  close_premium: number | null;
}

interface OptionsSummary {
  open_count: number;
  total_cash_secured: number;
  total_assignment_exposure: number;
  realized_premium_ytd: number;
}

type View = 'open' | 'history';

interface OptionsTabProps {
  portfolioName: string;
}

interface AddPositionForm {
  symbol: string;
  strategy: 'covered_call' | 'cash_secured_put';
  strike: string;
  expiration: string;
  contracts: string;
  premiumPerContract: string;
}

const EMPTY_FORM: AddPositionForm = {
  symbol: '',
  strategy: 'covered_call',
  strike: '',
  expiration: '',
  contracts: '1',
  premiumPerContract: '',
};

function validateForm(form: AddPositionForm): string | null {
  if (!form.symbol.trim()) return 'Symbol is required';
  if (!form.expiration) return 'Expiration is required';
  const strike = parseFloat(form.strike);
  const contracts = parseInt(form.contracts, 10);
  const premium = parseFloat(form.premiumPerContract);
  if (!Number.isFinite(strike) || strike <= 0) return 'Strike must be > 0';
  if (!Number.isFinite(contracts) || contracts <= 0) return 'Contracts must be > 0';
  if (!Number.isFinite(premium) || premium < 0) return 'Premium cannot be negative';
  const today = new Date().toISOString().slice(0, 10);
  if (form.expiration < today) return 'Expiration must be on or after today';
  return null;
}

export function OptionsTab({ portfolioName }: OptionsTabProps) {
  const [view, setView] = useState<View>('open');
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [summary, setSummary] = useState<OptionsSummary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddPositionForm>(EMPTY_FORM);
  const [closeTarget, setCloseTarget] = useState<OptionsCloseEarlyPosition | null>(null);
  const { addToast } = useToast();

  const reload = useCallback(async () => {
    const statusFilter = view === 'open' ? 'open' : null;
    try {
      const list = await invokeWithResilience<OptionPosition[]>('list_option_positions', {
        portfolioName,
        statusFilter,
      });
      const sum = await invokeWithResilience<OptionsSummary>('get_options_summary', {
        portfolioName,
      });
      setPositions(list ?? []);
      setSummary(sum ?? null);
    } catch (err) {
      log.error('failed to load options', err);
      addToast('Failed to load options', 'error');
    }
  }, [portfolioName, view, addToast]);

  useEffect(() => {
    let cancelled = false;
    const statusFilter = view === 'open' ? 'open' : null;
    invokeWithResilience<OptionPosition[]>('list_option_positions', {
      portfolioName,
      statusFilter,
    })
      .then(async (list) => {
        const sum = await invokeWithResilience<OptionsSummary>('get_options_summary', {
          portfolioName,
        });
        if (cancelled) return;
        setPositions(list ?? []);
        setSummary(sum ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          log.error('failed to load options', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioName, view]);

  const transition = useCallback(
    async (id: string, status: OptionPosition['status']) => {
      try {
        await invokeWithResilience('update_option_position', {
          id,
          status,
          closeDate: new Date().toISOString().slice(0, 10),
          closePremium: null,
        });
        await reload();
      } catch (err) {
        log.error('failed to update option position', err);
        addToast('Failed to update position', 'error');
      }
    },
    [reload, addToast],
  );

  const deletePosition = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this option position? This cannot be undone.')) return;
      try {
        await invokeWithResilience('delete_option_position', { id });
        addToast('Position deleted', 'success');
        await reload();
      } catch (err) {
        log.error('failed to delete option position', err);
        addToast('Failed to delete position', 'error');
      }
    },
    [reload, addToast],
  );

  const confirmClose = useCallback(
    async (closeDebitPerContract: number, closeDate: string) => {
      if (!closeTarget) return;
      try {
        await invokeWithResilience('update_option_position', {
          id: closeTarget.id,
          status: 'closed_early',
          closeDate,
          closePremium: closeDebitPerContract,
        });
        addToast('Position closed', 'success');
        setCloseTarget(null);
        await reload();
      } catch (err) {
        log.error('failed to close option position', err);
        addToast('Failed to close position', 'error');
      }
    },
    [closeTarget, reload, addToast],
  );

  const submitAdd = useCallback(async () => {
    const err = validateForm(form);
    if (err) {
      addToast(err, 'error');
      return;
    }
    const strike = parseFloat(form.strike);
    const contracts = parseInt(form.contracts, 10);
    const premium = parseFloat(form.premiumPerContract);
    try {
      await invokeWithResilience('create_option_position', {
        id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        portfolioName,
        symbol: form.symbol.toUpperCase(),
        strategy: form.strategy,
        strike,
        expiration: form.expiration,
        contracts,
        premiumPerContract: premium,
        openDate: new Date().toISOString().slice(0, 10),
        notes: null,
      });
      setForm(EMPTY_FORM);
      setShowAdd(false);
      addToast('Position added', 'success');
      await reload();
    } catch (e) {
      log.error('create_option_position failed', e);
      addToast(typeof e === 'string' ? e : 'Failed to add position', 'error');
    }
  }, [form, portfolioName, reload, addToast]);

  return (
    <section className="options-tab">
      <header className="options-tab__header">
        <h2>Options</h2>
        {summary && (
          <div className="options-tab__summary">
            <span>Open: <strong>{summary.open_count}</strong></span>
            <span>Cash secured: <strong>${summary.total_cash_secured.toLocaleString()}</strong></span>
            <span>Assignment exposure: <strong>${summary.total_assignment_exposure.toLocaleString()}</strong></span>
            <span>YTD premium: <strong>${summary.realized_premium_ytd.toLocaleString()}</strong></span>
          </div>
        )}
        <div className="options-tab__view-toggle">
          <Button
            variant={view === 'open' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={view === 'open'}
            onClick={() => setView('open')}
          >
            Open Positions
          </Button>
          <Button
            variant={view === 'history' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={view === 'history'}
            onClick={() => setView('history')}
          >
            History
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            Add Position
          </Button>
        </div>
      </header>

      {showAdd && (
        <div className="options-tab__modal" role="dialog" aria-label="Add option position">
          <h3>Add Position</h3>
          <label>
            Strategy
            <Select
              value={form.strategy}
              onChange={(v) =>
                setForm((f) => ({ ...f, strategy: v as AddPositionForm['strategy'] }))
              }
              options={[
                { value: 'covered_call', label: 'Covered Call' },
                { value: 'cash_secured_put', label: 'Cash-Secured Put' },
              ]}
            />
          </label>
          <label>
            Symbol
            <Input
              type="text"
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            />
          </label>
          <label>
            Strike
            <Input
              type="number"
              step="0.01"
              value={form.strike}
              onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value }))}
            />
          </label>
          <label>
            Expiration
            <Input
              type="date"
              value={form.expiration}
              onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))}
            />
          </label>
          <label>
            Contracts
            <Input
              type="number"
              min={1}
              step={1}
              value={form.contracts}
              onChange={(e) => setForm((f) => ({ ...f, contracts: e.target.value }))}
            />
          </label>
          <label>
            Premium per contract
            <Input
              type="number"
              step="0.01"
              value={form.premiumPerContract}
              onChange={(e) => setForm((f) => ({ ...f, premiumPerContract: e.target.value }))}
            />
          </label>
          <div className="options-tab__modal-actions">
            <Button type="button" variant="primary" onClick={submitAdd}>Create</Button>
            <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {closeTarget && (
        <OptionsCloseEarlyModal
          position={closeTarget}
          onCancel={() => setCloseTarget(null)}
          onConfirm={confirmClose}
        />
      )}

      {positions.length === 0 ? (
        <p className="empty-state">
          {view === 'open'
            ? 'No options tracked. Add a covered call or cash-secured put to start tracking premium income.'
            : 'No historical positions yet.'}
        </p>
      ) : (
        <table className="options-tab__table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Strategy</th>
              <th>Strike</th>
              <th>Expiration</th>
              <th>Contracts</th>
              <th>Premium</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id}>
                <td>{p.symbol}</td>
                <td>{p.strategy === 'covered_call' ? 'Covered Call' : 'Cash-Secured Put'}</td>
                <td>${p.strike.toFixed(2)}</td>
                <td>{p.expiration}</td>
                <td>{p.contracts}</td>
                <td>${p.premium_per_contract.toFixed(2)}</td>
                <td>{p.status}</td>
                <td>
                  {p.status === 'open' && (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => transition(p.id, 'expired')}>
                        Mark Expired
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => transition(p.id, 'assigned')}>
                        Mark Assigned
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setCloseTarget({
                            id: p.id,
                            symbol: p.symbol,
                            strategy: p.strategy,
                            strike: p.strike,
                            contracts: p.contracts,
                            premium_per_contract: p.premium_per_contract,
                          })
                        }
                      >
                        Close Early
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => deletePosition(p.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
