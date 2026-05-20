import { useMemo, useState } from 'react';
import type { UpcomingDividend } from '../services/dividendCalendar';

interface DividendCalendarProps {
  dividends: UpcomingDividend[];
  initialMonth: string; // "YYYY-MM"
  onDayClick: (isoDate: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseMonth(m: string): { year: number; month: number } {
  const [y, mo] = m.split('-').map(Number);
  return { year: y, month: mo - 1 };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function DividendCalendar({
  dividends,
  initialMonth,
  onDayClick,
}: DividendCalendarProps) {
  const [current, setCurrent] = useState(parseMonth(initialMonth));

  const eventsByDay = useMemo(() => {
    const map = new Map<string, UpcomingDividend[]>();
    for (const d of dividends) {
      const arr = map.get(d.ex_date) ?? [];
      arr.push(d);
      map.set(d.ex_date, arr);
    }
    return map;
  }, [dividends]);

  const monthLabel = `${MONTH_NAMES[current.month]} ${current.year}`;
  const totalDays = daysInMonth(current.year, current.month);
  const offset = firstWeekday(current.year, current.month);

  const goPrev = () => {
    setCurrent(({ year, month }) =>
      month === 0
        ? { year: year - 1, month: 11 }
        : { year, month: month - 1 },
    );
  };
  const goNext = () => {
    setCurrent(({ year, month }) =>
      month === 11
        ? { year: year + 1, month: 0 }
        : { year, month: month + 1 },
    );
  };

  return (
    <section className="dividend-calendar">
      <header className="dividend-calendar__header">
        <button type="button" onClick={goPrev} aria-label="previous month">
          ‹
        </button>
        <h3>{monthLabel}</h3>
        <button type="button" onClick={goNext} aria-label="next month">
          ›
        </button>
      </header>
      <div className="dividend-calendar__weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="dividend-calendar__weekday">{d}</div>
        ))}
      </div>
      <div className="dividend-calendar__grid">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="dividend-calendar__pad" />
        ))}
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const iso = `${formatMonth(current.year, current.month)}-${String(day).padStart(2, '0')}`;
          const events = eventsByDay.get(iso) ?? [];
          const monthName = MONTH_NAMES[current.month];
          return (
            <button
              key={iso}
              type="button"
              className="dividend-calendar__day"
              aria-label={`${monthName} ${day}`}
              title={
                events.length > 0
                  ? events
                      .map((e) => `${e.symbol} $${e.amount_per_share.toFixed(2)}`)
                      .join('\n')
                  : undefined
              }
              onClick={() => onDayClick(iso)}
            >
              <span className="dividend-calendar__day-num">{day}</span>
              {events.length > 0 && (
                <span className="dividend-calendar__badge">{events.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
