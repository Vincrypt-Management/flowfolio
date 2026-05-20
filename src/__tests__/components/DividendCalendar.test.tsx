import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DividendCalendar } from '../../components/DividendCalendar';

describe('DividendCalendar', () => {
  const dividends = [
    { symbol: 'VTI', ex_date: '2026-06-05', pay_date: '2026-06-20', amount_per_share: 0.85 },
    { symbol: 'SCHD', ex_date: '2026-06-15', pay_date: '2026-06-30', amount_per_share: 0.70 },
    { symbol: 'BND', ex_date: '2026-07-01', pay_date: '2026-07-10', amount_per_share: 0.15 },
  ];

  it('renders the month name in the header', () => {
    render(<DividendCalendar dividends={dividends} initialMonth="2026-06" onDayClick={vi.fn()} />);
    expect(screen.getByText(/June 2026/i)).toBeInTheDocument();
  });

  it('shows event counts on days with dividends', () => {
    render(<DividendCalendar dividends={dividends} initialMonth="2026-06" onDayClick={vi.fn()} />);
    // June 5 should have 1 event, June 15 should have 1.
    const cells = screen.getAllByText('1');
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it('fires onDayClick with ISO date when a day cell is clicked', () => {
    const onDayClick = vi.fn();
    render(<DividendCalendar dividends={dividends} initialMonth="2026-06" onDayClick={onDayClick} />);
    fireEvent.click(screen.getByRole('button', { name: /june 5/i }));
    expect(onDayClick).toHaveBeenCalledWith('2026-06-05');
  });

  it('advances to next month on next-month button', () => {
    render(<DividendCalendar dividends={dividends} initialMonth="2026-06" onDayClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText(/July 2026/i)).toBeInTheDocument();
  });

  it('goes back to previous month on prev-month button', () => {
    render(<DividendCalendar dividends={dividends} initialMonth="2026-06" onDayClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText(/May 2026/i)).toBeInTheDocument();
  });
});
