import { describe, it, expect } from 'vitest';
import { findReplacementPeers } from '../../services/replacementPeers';

describe('findReplacementPeers', () => {
  it('returns peers for a known ETF', () => {
    const peers = findReplacementPeers('VTI');
    expect(peers).toContain('ITOT');
    expect(peers).toContain('SCHB');
  });

  it('returns peers for a known sector ETF', () => {
    const peers = findReplacementPeers('XLK');
    expect(peers.length).toBeGreaterThan(0);
    expect(peers).toContain('VGT');
  });

  it('returns an empty array for unknown symbols', () => {
    expect(findReplacementPeers('UNKNOWN_TICKER_XYZ')).toEqual([]);
  });

  it('is case-insensitive on lookup', () => {
    expect(findReplacementPeers('vti')).toEqual(findReplacementPeers('VTI'));
  });

  it('does not include the queried symbol in its own peer list', () => {
    const peers = findReplacementPeers('VTI');
    expect(peers).not.toContain('VTI');
  });
});
