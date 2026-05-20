import { useEffect, useState } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';

const log = createLogger('useWashSaleStatus');
const TTL_MS = 5 * 60 * 1000;

export type WashSaleStatus = 'safe' | 'window' | 'unknown';

interface CacheEntry {
  promise: Promise<WashSaleStatus>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function __resetWashSaleCache(): void {
  cache.clear();
}

async function fetchStatus(symbol: string): Promise<WashSaleStatus> {
  try {
    const v = await invokeWithResilience<{
      in_wash_sale_window: boolean;
      days_until_safe?: number;
    }>('check_wash_sale_window', { symbol });
    return v.in_wash_sale_window ? 'window' : 'safe';
  } catch (err) {
    log.error(`failed wash-sale check for ${symbol}`, err);
    return 'unknown';
  }
}

function getOrCreateCached(symbol: string): Promise<WashSaleStatus> {
  const hit = cache.get(symbol);
  if (hit && Date.now() < hit.expiresAt) return hit.promise;
  const promise = fetchStatus(symbol);
  cache.set(symbol, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

export function useWashSaleStatus(symbol: string): {
  status: WashSaleStatus;
  loading: boolean;
} {
  const [status, setStatus] = useState<WashSaleStatus>('unknown');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const settle = symbol
      ? getOrCreateCached(symbol)
      : Promise.resolve('unknown' as WashSaleStatus);
    settle.then((v) => {
      if (!cancelled) {
        setStatus(v);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { status, loading };
}
