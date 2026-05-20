import { invoke } from '@tauri-apps/api/core';

export interface UpcomingDividend {
  symbol: string;
  ex_date: string;
  pay_date: string | null;
  amount_per_share: number;
}

export interface ProjectedIncome {
  portfolio_name: string;
  total_projected_annual: number;
  by_symbol: Array<{ symbol: string; trailing_12mo: number; projected_annual: number }>;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute in-process cache
const cache = new Map<string, { at: number; result: UpcomingDividend[] }>();

function cacheKey(symbols: string[], lookahead: number): string {
  return `${[...symbols].sort().join(',')}|${lookahead}`;
}

export function _resetCacheForTests(): void {
  cache.clear();
}

export async function fetchUpcomingDividends(
  symbols: string[],
  lookaheadDays = 90,
): Promise<UpcomingDividend[]> {
  const key = cacheKey(symbols, lookaheadDays);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.result;
  }
  const result = await invoke<UpcomingDividend[]>('get_upcoming_dividends', {
    symbols,
    lookaheadDays,
  });
  cache.set(key, { at: Date.now(), result: result ?? [] });
  return result ?? [];
}

export async function fetchProjectedIncome(
  portfolioName: string,
): Promise<ProjectedIncome> {
  return invoke<ProjectedIncome>('get_projected_annual_income', { portfolioName });
}
