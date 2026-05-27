import { useEffect, useMemo, useState } from 'react';
import { DividendCalendar } from './DividendCalendar';
import { EmptyState } from '@flowfolio/ui';
import {
  fetchUpcomingDividends,
  fetchProjectedIncome,
  type UpcomingDividend,
  type ProjectedIncome,
} from '../services/dividendCalendar';

type View = 'calendar' | 'list' | 'income';

interface DividendsTabProps {
  portfolioName: string;
  heldSymbols: string[];
}

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Initial calendar month: earliest upcoming dividend's month if any, else today.
function pickInitialMonth(dividends: UpcomingDividend[]): string {
  if (dividends.length === 0) return todayMonth();
  const earliest = [...dividends].sort((a, b) => a.ex_date.localeCompare(b.ex_date))[0];
  return earliest.ex_date.slice(0, 7);
}

export function DividendsTab({ portfolioName, heldSymbols }: DividendsTabProps) {
  const [view, setView] = useState<View>('calendar');
  const [dividends, setDividends] = useState<UpcomingDividend[]>([]);
  const [income, setIncome] = useState<ProjectedIncome | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUpcomingDividends(heldSymbols, 90, portfolioName).then((d) => {
      if (!cancelled) setDividends(d);
    });
    fetchProjectedIncome(portfolioName).then((p) => {
      if (!cancelled) setIncome(p);
    });
    return () => { cancelled = true; };
  }, [portfolioName, heldSymbols]);

  const listRows = useMemo(() => {
    if (selectedDay) {
      return dividends.filter((d) => d.ex_date === selectedDay);
    }
    return [...dividends].sort((a, b) => a.ex_date.localeCompare(b.ex_date));
  }, [dividends, selectedDay]);

  const initialMonth = useMemo(() => pickInitialMonth(dividends), [dividends]);

  return (
    <section className="dividends-tab">
      <header className="dividends-tab__header">
        <h2>Dividends</h2>
        <div className="dividends-tab__income-card">
          Projected annual income:{' '}
          <strong>
            ${income ? income.total_projected_annual.toLocaleString() : '—'}
          </strong>
          {income && (
            <span className="dividends-tab__income-meta">
              {' '}across {income.by_symbol.length} held dividend payer
              {income.by_symbol.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="dividends-tab__view-toggle" role="tablist">
          <button
            type="button"
            aria-pressed={view === 'calendar'}
            onClick={() => { setView('calendar'); setSelectedDay(null); }}
          >Calendar</button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >List</button>
          <button
            type="button"
            aria-pressed={view === 'income'}
            onClick={() => setView('income')}
          >Income</button>
        </div>
      </header>

      {dividends.length === 0 && view !== 'income' && (
        <EmptyState
          title="No upcoming dividends"
          description="No ex-dates within the next 90 days for held symbols."
        />
      )}

      {view === 'calendar' && dividends.length > 0 && (
        <DividendCalendar
          dividends={dividends}
          initialMonth={initialMonth}
          onDayClick={(iso) => { setSelectedDay(iso); setView('list'); }}
        />
      )}

      {view === 'list' && dividends.length > 0 && (
        <table className="dividends-tab__table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Ex-date</th>
              <th>Pay-date</th>
              <th>$/share</th>
              <th>Projected payout</th>
            </tr>
          </thead>
          <tbody>
            {listRows.map((d) => (
              <tr key={`${d.symbol}-${d.ex_date}`}>
                <td>{d.symbol}</td>
                <td>{d.ex_date}</td>
                <td>{d.pay_date ?? '—'}</td>
                <td>${d.amount_per_share.toFixed(2)}</td>
                <td>{d.projected_payout != null ? `$${d.projected_payout.toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'income' && income && (
        <table className="dividends-tab__income-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Trailing 12mo</th>
              <th>Projected annual</th>
            </tr>
          </thead>
          <tbody>
            {income.by_symbol.map((s) => (
              <tr key={s.symbol}>
                <td>{s.symbol}</td>
                <td>${s.trailing_12mo.toFixed(0)}</td>
                <td>${s.projected_annual.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
