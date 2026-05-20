import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export function OptionsTab({ portfolioName }: OptionsTabProps) {
  const [view, setView] = useState<View>('open');
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [summary, setSummary] = useState<OptionsSummary | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddPositionForm>(EMPTY_FORM);

  const reload = useCallback(async () => {
    const filter = view === 'open' ? 'open' : undefined;
    const list = await invoke<OptionPosition[]>('list_option_positions', {
      portfolioName,
      statusFilter: filter,
    });
    const sum = await invoke<OptionsSummary>('get_options_summary', { portfolioName });
    setPositions(view === 'history' ? list.filter((p) => p.status !== 'open') : list);
    setSummary(sum);
  }, [portfolioName, view]);

  useEffect(() => {
    let cancelled = false;
    const filter = view === 'open' ? 'open' : undefined;
    invoke<OptionPosition[]>('list_option_positions', {
      portfolioName,
      statusFilter: filter,
    })
      .then(async (list) => {
        const sum = await invoke<OptionsSummary>('get_options_summary', { portfolioName });
        if (cancelled) return;
        setPositions(view === 'history' ? list.filter((p) => p.status !== 'open') : list);
        setSummary(sum);
      })
      .catch(() => { /* swallow — empty state will render */ });
    return () => { cancelled = true; };
  }, [portfolioName, view]);

  const transition = useCallback(
    async (id: string, status: OptionPosition['status']) => {
      await invoke('update_option_position', {
        id,
        status,
        closeDate: new Date().toISOString().slice(0, 10),
        closePremium: null,
      });
      await reload();
    },
    [reload],
  );

  const submitAdd = useCallback(async () => {
    const strike = parseFloat(form.strike);
    const contracts = parseInt(form.contracts, 10);
    const premium = parseFloat(form.premiumPerContract);
    if (
      !form.symbol ||
      !form.expiration ||
      Number.isNaN(strike) ||
      Number.isNaN(contracts) ||
      Number.isNaN(premium) ||
      contracts <= 0
    ) {
      return;
    }
    await invoke('create_option_position', {
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
    await reload();
  }, [form, portfolioName, reload]);

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
          <button type="button" aria-pressed={view === 'open'} onClick={() => setView('open')}>
            Open Positions
          </button>
          <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>
            History
          </button>
          <button type="button" onClick={() => setShowAdd(true)}>
            Add Position
          </button>
        </div>
      </header>

      {showAdd && (
        <div className="options-tab__modal" role="dialog" aria-label="Add option position">
          <h3>Add Position</h3>
          <label>
            Strategy
            <select
              value={form.strategy}
              onChange={(e) =>
                setForm((f) => ({ ...f, strategy: e.target.value as AddPositionForm['strategy'] }))
              }
            >
              <option value="covered_call">Covered Call</option>
              <option value="cash_secured_put">Cash-Secured Put</option>
            </select>
          </label>
          <label>
            Symbol
            <input
              type="text"
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            />
          </label>
          <label>
            Strike
            <input
              type="number"
              step="0.01"
              value={form.strike}
              onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value }))}
            />
          </label>
          <label>
            Expiration
            <input
              type="date"
              value={form.expiration}
              onChange={(e) => setForm((f) => ({ ...f, expiration: e.target.value }))}
            />
          </label>
          <label>
            Contracts
            <input
              type="number"
              min={1}
              step={1}
              value={form.contracts}
              onChange={(e) => setForm((f) => ({ ...f, contracts: e.target.value }))}
            />
          </label>
          <label>
            Premium per contract
            <input
              type="number"
              step="0.01"
              value={form.premiumPerContract}
              onChange={(e) => setForm((f) => ({ ...f, premiumPerContract: e.target.value }))}
            />
          </label>
          <div className="options-tab__modal-actions">
            <button type="button" onClick={submitAdd}>Create</button>
            <button type="button" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <p className="empty-state">
          No options tracked. Add a covered call or cash-secured put to start tracking premium income.
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
              {view === 'open' && <th>Actions</th>}
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
                {view === 'open' && (
                  <td>
                    <button type="button" onClick={() => transition(p.id, 'expired')}>
                      Mark Expired
                    </button>
                    <button type="button" onClick={() => transition(p.id, 'assigned')}>
                      Mark Assigned
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
