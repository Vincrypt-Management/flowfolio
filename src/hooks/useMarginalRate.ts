import { useEffect, useState } from 'react';
import { invokeWithResilience } from '../services/apiClient';
import { createLogger } from '../core/logger';

const log = createLogger('useMarginalRate');
const TTL_MS = 5 * 60 * 1000;
const DEFAULT_RATE = 0.25;

let cached: { promise: Promise<number>; expiresAt: number } | null = null;

export function __resetMarginalRateCache(): void {
  cached = null;
}

async function fetchRate(): Promise<number> {
  try {
    const v = await invokeWithResilience<string | null>('load_setting', {
      key: 'marginal_tax_rate',
    });
    const parsed = v == null ? DEFAULT_RATE : Number.parseFloat(v);
    return Number.isFinite(parsed) ? parsed : DEFAULT_RATE;
  } catch (err) {
    log.error('failed to load marginal_tax_rate', err);
    return DEFAULT_RATE;
  }
}

function getOrCreateCached(): Promise<number> {
  if (cached && Date.now() < cached.expiresAt) {
    return cached.promise;
  }
  const promise = fetchRate();
  cached = { promise, expiresAt: Date.now() + TTL_MS };
  return promise;
}

export function useMarginalRate(): { rate: number; loading: boolean } {
  const [rate, setRate] = useState<number>(DEFAULT_RATE);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    getOrCreateCached().then((v) => {
      if (!cancelled) {
        setRate(v);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rate, loading };
}
