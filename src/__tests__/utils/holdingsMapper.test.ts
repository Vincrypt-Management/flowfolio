import { describe, it, expect } from 'vitest';

// The mapping function will live inline in PortfolioTab — test its logic here
function mapToRiskHoldings(holdings: Array<{
  symbol: string; shares: number; current_price: number;
  market_value: number; current_pct: number;
}>) {
  return holdings.map(h => ({
    symbol: h.symbol,
    shares: h.shares,
    currentPrice: h.current_price,
    value: h.market_value,
    weight: h.current_pct / 100,
  }));
}

describe('mapToRiskHoldings', () => {
  it('maps PortfolioTab holding shape to RiskDashboard shape', () => {
    const input = [{
      symbol: 'AAPL', shares: 10, current_price: 150,
      market_value: 1500, current_pct: 30,
    }];
    const result = mapToRiskHoldings(input);
    expect(result).toEqual([{
      symbol: 'AAPL', shares: 10, currentPrice: 150,
      value: 1500, weight: 0.3,
    }]);
  });

  it('converts current_pct percentage to 0-1 weight', () => {
    const input = [{ symbol: 'X', shares: 1, current_price: 100, market_value: 100, current_pct: 100 }];
    expect(mapToRiskHoldings(input)[0].weight).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(mapToRiskHoldings([])).toEqual([]);
  });
});
