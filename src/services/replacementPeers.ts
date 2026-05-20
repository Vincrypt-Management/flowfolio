// Static peer map for tax-loss harvest replacements. Peers are chosen to
// preserve sector/asset-class exposure while avoiding wash-sale similarity
// (different issuer, different index, but comparable economic exposure).
//
// To add a new entry: pick 1–2 peers from a DIFFERENT fund family that
// tracks a similar (but not identical) index, or for individual stocks,
// pick a same-sector ETF.

const PEERS: Record<string, string[]> = {
  // Broad US market ETFs
  VTI: ['ITOT', 'SCHB'],
  ITOT: ['VTI', 'SCHB'],
  SCHB: ['VTI', 'ITOT'],
  // S&P 500
  SPY: ['VOO', 'IVV'],
  VOO: ['SPY', 'IVV'],
  IVV: ['SPY', 'VOO'],
  // Dividend
  SCHD: ['VYM', 'DGRO'],
  VYM: ['SCHD', 'DGRO'],
  DGRO: ['SCHD', 'VYM'],
  // Tech sector
  XLK: ['VGT', 'FTEC'],
  VGT: ['XLK', 'FTEC'],
  FTEC: ['XLK', 'VGT'],
  // Healthcare
  XLV: ['VHT', 'FHLC'],
  VHT: ['XLV', 'FHLC'],
  // Financials
  XLF: ['VFH', 'FNCL'],
  VFH: ['XLF', 'FNCL'],
  // Energy
  XLE: ['VDE', 'FENY'],
  VDE: ['XLE', 'FENY'],
  // Bonds
  BND: ['AGG', 'SCHZ'],
  AGG: ['BND', 'SCHZ'],
  // International
  VXUS: ['IXUS', 'ACWX'],
  IXUS: ['VXUS', 'ACWX'],
  // Real estate
  VNQ: ['SCHH', 'IYR'],
  SCHH: ['VNQ', 'IYR'],
};

export function findReplacementPeers(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  return PEERS[upper] ?? [];
}
