import { describe, it, expect } from 'vitest';
import { parseBrokerCSV } from '../../shared/utils/csvParser';

const FIDELITY_CSV = `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
X12345,Individual,AAPL,APPLE INC,10,$150.00,+$1.00,$1500.00,+$10.00,+0.67%,+$200.00,+15.38%,30.00%,$1300.00,$130.00,Cash
X12345,Individual,MSFT,MICROSOFT CORP,5,$300.00,+$2.00,$1500.00,+$10.00,+0.67%,+$300.00,+25.00%,30.00%,$1200.00,$240.00,Cash`;

const SCHWAB_CSV = `"Positions for account All-Accounts as of 01/01/2026"
"Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %","Day Change $","Cost Basis","Gain/Loss %","Gain/Loss $","Ratings","Reinvest Dividends?","Capital Gains?","% Of Account","Security Type"
"AAPL","Apple Inc","10","$150.00","+0.67%","+$1.00","$1,500.00","+0.67%","+$10.00","$1,300.00","+15.38%","+$200.00","","Yes","Yes","30%","Stock"`;

const GENERIC_CSV = `Symbol,Shares,Price
AAPL,10,150
MSFT,5,300`;

describe('parseBrokerCSV', () => {
  describe('Fidelity format', () => {
    it('detects Fidelity broker', () => {
      const result = parseBrokerCSV(FIDELITY_CSV);
      expect(result.broker).toBe('Fidelity');
    });

    it('parses symbol and shares correctly', () => {
      const result = parseBrokerCSV(FIDELITY_CSV);
      expect(result.holdings[0].symbol).toBe('AAPL');
      expect(result.holdings[0].shares).toBe(10);
    });

    it('parses cost basis from Average Cost Basis column', () => {
      const result = parseBrokerCSV(FIDELITY_CSV);
      expect(result.holdings[0].costBasis).toBe(130);
    });

    it('parses multiple holdings', () => {
      const result = parseBrokerCSV(FIDELITY_CSV);
      expect(result.holdings).toHaveLength(2);
      expect(result.holdings[1].symbol).toBe('MSFT');
    });
  });

  describe('Schwab format', () => {
    it('detects Schwab broker', () => {
      const result = parseBrokerCSV(SCHWAB_CSV);
      expect(result.broker).toBe('Schwab');
    });

    it('parses holdings from Schwab CSV', () => {
      const result = parseBrokerCSV(SCHWAB_CSV);
      expect(result.holdings[0].symbol).toBe('AAPL');
      expect(result.holdings[0].shares).toBe(10);
    });
  });

  describe('Generic format', () => {
    it('detects generic format', () => {
      const result = parseBrokerCSV(GENERIC_CSV);
      expect(result.broker).toBe('Generic');
    });

    it('parses symbol and shares from generic CSV', () => {
      const result = parseBrokerCSV(GENERIC_CSV);
      expect(result.holdings[0].symbol).toBe('AAPL');
      expect(result.holdings[0].shares).toBe(10);
    });

    it('returns null costBasis when not available', () => {
      const result = parseBrokerCSV(GENERIC_CSV);
      expect(result.holdings[0].costBasis).toBeNull();
    });
  });

  describe('error handling', () => {
    it('returns empty holdings for empty CSV', () => {
      expect(parseBrokerCSV('').holdings).toEqual([]);
    });

    it('returns errors array for malformed rows', () => {
      const bad = `Symbol,Quantity\nAAPL,not-a-number`;
      const result = parseBrokerCSV(bad);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('skips rows where symbol is missing', () => {
      const csv = `Symbol,Quantity\n,10\nMSFT,5`;
      const result = parseBrokerCSV(csv);
      expect(result.holdings.every(h => h.symbol.length > 0)).toBe(true);
    });
  });
});
