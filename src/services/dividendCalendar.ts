import { invokeWithResilience } from './apiClient';

export interface UpcomingDividend {
  symbol: string;
  ex_date: string;
  pay_date: string | null;
  amount_per_share: number;
  shares_held?: number;
  projected_payout?: number;
}

export interface ProjectedIncome {
  portfolio_name: string;
  total_projected_annual: number;
  by_symbol: Array<{
    symbol: string;
    trailing_12mo: number;
    trailing_per_share?: number;
    current_shares?: number;
    projected_annual: number;
  }>;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute in-process cache
const cache = new Map<string, { at: number; result: UpcomingDividend[] }>();

function cacheKey(symbols: string[], lookahead: number, portfolio?: string): string {
  return `${portfolio ?? ''}|${[...symbols].sort().join(',')}|${lookahead}`;
}

export function _resetCacheForTests(): void {
  cache.clear();
}

export async function fetchUpcomingDividends(
  symbols: string[],
  lookaheadDays = 90,
  portfolioName?: string,
): Promise<UpcomingDividend[]> {
  const key = cacheKey(symbols, lookaheadDays, portfolioName);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.result;
  }
  const result = await invokeWithResilience<UpcomingDividend[]>('get_upcoming_dividends', {
    symbols,
    lookaheadDays,
    portfolioName: portfolioName ?? null,
  });
  cache.set(key, { at: Date.now(), result: result ?? [] });
  return result ?? [];
}

export async function fetchProjectedIncome(
  portfolioName: string,
): Promise<ProjectedIncome> {
  return invokeWithResilience<ProjectedIncome>('get_projected_annual_income', { portfolioName });
}
