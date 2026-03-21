/**
 * Integration tests for portfolio management flow.
 *
 * These tests exercise the full path from a mock Tauri command handler
 * through in-memory storage and back, simulating what the real Rust backend
 * does without requiring a running Tauri process.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriCommand, clearTauriMocks } from './tauri-mock';
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// In-memory store types (mirror the Rust structs)
// ---------------------------------------------------------------------------

interface Transaction {
  id: string;
  symbol: string;
  transaction_type: string; // "BUY" | "SELL"
  shares: number;
  price: number;
  total_value: number;
  date: string;
  notes?: string;
}

interface PortfolioSnapshot {
  id: string;
  date: string;
  total_value: number;
  cash: number;
  holdings_count: number;
  metadata?: Record<string, string>;
}

interface Dividend {
  id: string;
  symbol: string;
  amount: number;
  date: string;
  shares_held: number;
}

interface DividendSummary {
  total_dividends: number;
  by_symbol: Record<string, number>;
  count: number;
}

interface TaxLot {
  id: string;
  symbol: string;
  shares: number;
  cost_basis: number;
  purchase_date: string;
  days_held: number;
}

// ---------------------------------------------------------------------------
// Helper: generate a stable ISO timestamp for a given days-ago offset
// ---------------------------------------------------------------------------
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Portfolio Flow Integration', () => {
  // In-memory stores reset before every test
  let transactions: Transaction[] = [];
  let snapshots: PortfolioSnapshot[] = [];
  let dividends: Dividend[] = [];
  let taxLots: TaxLot[] = [];

  beforeEach(() => {
    clearTauriMocks();
    transactions = [];
    snapshots = [];
    dividends = [];
    taxLots = [];

    // ---- transaction commands ----
    mockTauriCommand('record_transaction', (args) => {
      const { symbol, transaction_type, shares, price, date, notes } = args as {
        symbol: string;
        transaction_type: string;
        shares: number;
        price: number;
        date: string;
        notes?: string;
      };
      const tx: Transaction = {
        id: `tx-${transactions.length + 1}`,
        symbol,
        transaction_type,
        shares,
        price,
        total_value: shares * price,
        date,
        notes,
      };
      transactions.push(tx);
      return tx;
    });

    mockTauriCommand('list_transactions', (args) => {
      const { symbol } = (args ?? {}) as { symbol?: string };
      if (symbol) return transactions.filter((t) => t.symbol === symbol);
      return transactions;
    });

    // ---- snapshot commands ----
    mockTauriCommand('save_portfolio_snapshot', (args) => {
      const { date, total_value, cash, holdings_count, metadata } = args as {
        date: string;
        total_value: number;
        cash: number;
        holdings_count: number;
        metadata?: Record<string, string>;
      };
      const snapshot: PortfolioSnapshot = {
        id: `snap-${snapshots.length + 1}`,
        date,
        total_value,
        cash,
        holdings_count,
        metadata,
      };
      snapshots.push(snapshot);
      return snapshot;
    });

    mockTauriCommand('get_portfolio_snapshots', () => snapshots);

    // ---- dividend commands ----
    mockTauriCommand('record_dividend', (args) => {
      const { symbol, amount, date, shares_held } = args as {
        symbol: string;
        amount: number;
        date: string;
        shares_held: number;
      };
      const dividend: Dividend = {
        id: `div-${dividends.length + 1}`,
        symbol,
        amount,
        date,
        shares_held,
      };
      dividends.push(dividend);
      return dividend;
    });

    mockTauriCommand('list_dividends', (args) => {
      const { symbol } = (args ?? {}) as { symbol?: string };
      if (symbol) return dividends.filter((d) => d.symbol === symbol);
      return dividends;
    });

    mockTauriCommand('get_dividend_summary', () => {
      const by_symbol: Record<string, number> = {};
      let total = 0;
      for (const div of dividends) {
        by_symbol[div.symbol] = (by_symbol[div.symbol] ?? 0) + div.amount;
        total += div.amount;
      }
      const summary: DividendSummary = {
        total_dividends: total,
        by_symbol,
        count: dividends.length,
      };
      return summary;
    });

    // ---- tax lot commands ----
    mockTauriCommand('create_tax_lot', (args) => {
      const { symbol, shares, cost_basis, purchase_date } = args as {
        symbol: string;
        shares: number;
        cost_basis: number;
        purchase_date: string;
      };
      const purchaseMs = new Date(purchase_date).getTime();
      const nowMs = Date.now();
      const days_held = Math.floor((nowMs - purchaseMs) / (1000 * 60 * 60 * 24));
      const lot: TaxLot = {
        id: `lot-${taxLots.length + 1}`,
        symbol,
        shares,
        cost_basis,
        purchase_date,
        days_held,
      };
      taxLots.push(lot);
      return lot;
    });

    mockTauriCommand('list_tax_lots', (args) => {
      const { symbol } = (args ?? {}) as { symbol?: string };
      if (symbol) return taxLots.filter((l) => l.symbol === symbol);
      return taxLots;
    });
  });

  // =========================================================================
  // Transaction flow
  // =========================================================================

  describe('record_transaction -> list_transactions', () => {
    it('recorded transaction appears in the list', async () => {
      await invoke('record_transaction', {
        symbol: 'AAPL',
        transaction_type: 'BUY',
        shares: 10,
        price: 150,
        date: todayISO(),
        notes: 'Initial purchase',
      });

      const list = await invoke<Transaction[]>('list_transactions', {});
      expect(list).toHaveLength(1);
      expect(list[0].symbol).toBe('AAPL');
      expect(list[0].transaction_type).toBe('BUY');
      expect(list[0].shares).toBe(10);
      expect(list[0].price).toBe(150);
      expect(list[0].total_value).toBe(1500);
      expect(list[0].notes).toBe('Initial purchase');
    });

    it('multiple transactions accumulate correctly', async () => {
      await invoke('record_transaction', {
        symbol: 'AAPL',
        transaction_type: 'BUY',
        shares: 5,
        price: 140,
        date: todayISO(),
      });
      await invoke('record_transaction', {
        symbol: 'MSFT',
        transaction_type: 'BUY',
        shares: 3,
        price: 300,
        date: todayISO(),
      });
      await invoke('record_transaction', {
        symbol: 'AAPL',
        transaction_type: 'SELL',
        shares: 2,
        price: 160,
        date: todayISO(),
      });

      const all = await invoke<Transaction[]>('list_transactions', {});
      expect(all).toHaveLength(3);

      const aaplTxns = await invoke<Transaction[]>('list_transactions', { symbol: 'AAPL' });
      expect(aaplTxns).toHaveLength(2);
      expect(aaplTxns.every((t) => t.symbol === 'AAPL')).toBe(true);
    });

    it('returned transaction has the assigned id', async () => {
      const tx = await invoke<Transaction>('record_transaction', {
        symbol: 'GOOGL',
        transaction_type: 'BUY',
        shares: 1,
        price: 2800,
        date: todayISO(),
      });
      expect(tx.id).toBeTruthy();
      expect(typeof tx.id).toBe('string');
    });

    it('throws when command is not mocked', async () => {
      await expect(invoke('unmocked_command', {})).rejects.toThrow('Unmocked Tauri command: unmocked_command');
    });
  });

  // =========================================================================
  // Portfolio snapshot flow
  // =========================================================================

  describe('save_portfolio_snapshot -> get_portfolio_snapshots', () => {
    it('saved snapshot appears in the list', async () => {
      const snapDate = todayISO();
      await invoke('save_portfolio_snapshot', {
        date: snapDate,
        total_value: 50000,
        cash: 5000,
        holdings_count: 8,
      });

      const snaps = await invoke<PortfolioSnapshot[]>('get_portfolio_snapshots', {});
      expect(snaps).toHaveLength(1);
      expect(snaps[0].total_value).toBe(50000);
      expect(snaps[0].cash).toBe(5000);
      expect(snaps[0].holdings_count).toBe(8);
      expect(snaps[0].date).toBe(snapDate);
    });

    it('snapshot preserves optional metadata', async () => {
      await invoke('save_portfolio_snapshot', {
        date: todayISO(),
        total_value: 100000,
        cash: 10000,
        holdings_count: 12,
        metadata: { strategy: 'growth', rebalanced: 'true' },
      });

      const snaps = await invoke<PortfolioSnapshot[]>('get_portfolio_snapshots', {});
      expect(snaps[0].metadata?.strategy).toBe('growth');
      expect(snaps[0].metadata?.rebalanced).toBe('true');
    });

    it('multiple snapshots are all returned', async () => {
      for (let i = 0; i < 3; i++) {
        await invoke('save_portfolio_snapshot', {
          date: daysAgoISO(i),
          total_value: 50000 + i * 1000,
          cash: 5000,
          holdings_count: 10,
        });
      }

      const snaps = await invoke<PortfolioSnapshot[]>('get_portfolio_snapshots', {});
      expect(snaps).toHaveLength(3);
      // Values should reflect each snapshot individually
      const values = snaps.map((s) => s.total_value).sort((a, b) => a - b);
      expect(values).toEqual([50000, 51000, 52000]);
    });
  });

  // =========================================================================
  // Dividend flow
  // =========================================================================

  describe('record_dividend -> list_dividends -> get_dividend_summary', () => {
    it('recorded dividend appears in the list', async () => {
      await invoke('record_dividend', {
        symbol: 'VTI',
        amount: 45.5,
        date: todayISO(),
        shares_held: 100,
      });

      const list = await invoke<Dividend[]>('list_dividends', {});
      expect(list).toHaveLength(1);
      expect(list[0].symbol).toBe('VTI');
      expect(list[0].amount).toBe(45.5);
      expect(list[0].shares_held).toBe(100);
    });

    it('dividend summary totals are correct across multiple symbols', async () => {
      await invoke('record_dividend', { symbol: 'VTI', amount: 45.5, date: todayISO(), shares_held: 100 });
      await invoke('record_dividend', { symbol: 'SCHD', amount: 32.0, date: todayISO(), shares_held: 80 });
      await invoke('record_dividend', { symbol: 'VTI', amount: 46.0, date: daysAgoISO(90), shares_held: 100 });

      const summary = await invoke<DividendSummary>('get_dividend_summary', {});
      expect(summary.count).toBe(3);
      expect(summary.total_dividends).toBeCloseTo(123.5, 2);
      expect(summary.by_symbol['VTI']).toBeCloseTo(91.5, 2);
      expect(summary.by_symbol['SCHD']).toBeCloseTo(32.0, 2);
    });

    it('list_dividends can filter by symbol', async () => {
      await invoke('record_dividend', { symbol: 'VTI', amount: 45.5, date: todayISO(), shares_held: 100 });
      await invoke('record_dividend', { symbol: 'SCHD', amount: 32.0, date: todayISO(), shares_held: 80 });

      const vtiOnly = await invoke<Dividend[]>('list_dividends', { symbol: 'VTI' });
      expect(vtiOnly).toHaveLength(1);
      expect(vtiOnly[0].symbol).toBe('VTI');
    });

    it('summary is empty when no dividends recorded', async () => {
      const summary = await invoke<DividendSummary>('get_dividend_summary', {});
      expect(summary.total_dividends).toBe(0);
      expect(summary.count).toBe(0);
      expect(Object.keys(summary.by_symbol)).toHaveLength(0);
    });
  });

  // =========================================================================
  // Tax lot flow
  // =========================================================================

  describe('create_tax_lot -> list_tax_lots', () => {
    it('created tax lot appears in the list', async () => {
      await invoke('create_tax_lot', {
        symbol: 'AAPL',
        shares: 10,
        cost_basis: 1500,
        purchase_date: daysAgoISO(30),
      });

      const lots = await invoke<TaxLot[]>('list_tax_lots', {});
      expect(lots).toHaveLength(1);
      expect(lots[0].symbol).toBe('AAPL');
      expect(lots[0].shares).toBe(10);
      expect(lots[0].cost_basis).toBe(1500);
    });

    it('days_held is calculated from purchase_date to today', async () => {
      const purchaseDaysAgo = 45;
      await invoke('create_tax_lot', {
        symbol: 'MSFT',
        shares: 5,
        cost_basis: 1500,
        purchase_date: daysAgoISO(purchaseDaysAgo),
      });

      const lots = await invoke<TaxLot[]>('list_tax_lots', {});
      // Allow ±1 day tolerance for test execution timing
      expect(lots[0].days_held).toBeGreaterThanOrEqual(purchaseDaysAgo - 1);
      expect(lots[0].days_held).toBeLessThanOrEqual(purchaseDaysAgo + 1);
    });

    it('long-term lot has days_held > 365', async () => {
      await invoke('create_tax_lot', {
        symbol: 'GOOGL',
        shares: 2,
        cost_basis: 5000,
        purchase_date: daysAgoISO(400),
      });

      const lots = await invoke<TaxLot[]>('list_tax_lots', {});
      expect(lots[0].days_held).toBeGreaterThan(365);
    });

    it('list_tax_lots can filter by symbol', async () => {
      await invoke('create_tax_lot', {
        symbol: 'AAPL',
        shares: 10,
        cost_basis: 1500,
        purchase_date: daysAgoISO(60),
      });
      await invoke('create_tax_lot', {
        symbol: 'MSFT',
        shares: 5,
        cost_basis: 2000,
        purchase_date: daysAgoISO(30),
      });

      const aaplLots = await invoke<TaxLot[]>('list_tax_lots', { symbol: 'AAPL' });
      expect(aaplLots).toHaveLength(1);
      expect(aaplLots[0].symbol).toBe('AAPL');
    });

    it('lot purchased today has days_held of 0', async () => {
      await invoke('create_tax_lot', {
        symbol: 'NVDA',
        shares: 3,
        cost_basis: 1200,
        purchase_date: todayISO(),
      });

      const lots = await invoke<TaxLot[]>('list_tax_lots', {});
      expect(lots[0].days_held).toBe(0);
    });
  });
});
