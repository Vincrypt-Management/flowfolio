import { describe, it, expect, beforeEach, vi } from 'vitest';

// The service uses IndexedDB internally. We mock the module so tests
// exercise the public API without a real IndexedDB implementation.
// We create a lightweight in-memory fake that satisfies the service.

// We need to mock IndexedDB before the module loads
const stores: Record<string, Map<string, unknown>> = {};

function resetStores() {
  for (const k of Object.keys(stores)) delete stores[k];
}

function getStore(name: string) {
  if (!stores[name]) stores[name] = new Map();
  return stores[name];
}

// Minimal IDBRequest-like helper
function fakeRequest<T>(result: T) {
  const req: Record<string, unknown> = { result, error: null };
  setTimeout(() => {
    if (typeof req.onsuccess === 'function') (req.onsuccess as (e: unknown) => void)({ target: req });
  }, 0);
  return req;
}

function fakeStore(name: string) {
  const data = getStore(name);
  return {
    get(key: string) { return fakeRequest(data.get(key)); },
    put(entry: { symbol: string }) { data.set(entry.symbol, entry); return fakeRequest(undefined); },
    clear() { data.clear(); return fakeRequest(undefined); },
    count() { return fakeRequest(data.size); },
    createIndex() {},
    index() {
      return {
        openCursor(range?: unknown) {
          const entries = [...data.entries()];
          let idx = 0;
          const req: Record<string, unknown> = { result: null, error: null };
          setTimeout(() => {
            const advance = () => {
              if (idx < entries.length) {
                const [key, value] = entries[idx++];
                req.result = {
                  value,
                  delete() { data.delete(key); },
                  continue() { setTimeout(advance, 0); },
                };
              } else {
                req.result = null;
              }
              if (typeof req.onsuccess === 'function') (req.onsuccess as (e: unknown) => void)({ target: req });
            };
            advance();
          }, 0);
          return req;
        },
      };
    },
  };
}

function fakeTransaction(storeNames: string | string[]) {
  const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
  return { objectStore: () => fakeStore(name) };
}

const fakeDb = {
  transaction: (name: string | string[]) => fakeTransaction(name),
  objectStoreNames: { contains: () => false },
  createObjectStore: (name: string) => fakeStore(name),
};

// Mock IDBKeyRange globally
Object.defineProperty(globalThis, 'IDBKeyRange', {
  value: {
    upperBound: (value: unknown) => ({ upper: value, lowerOpen: true, upperOpen: false }),
    lowerBound: (value: unknown) => ({ lower: value, lowerOpen: false, upperOpen: true }),
    bound: (lower: unknown, upper: unknown) => ({ lower, upper, lowerOpen: false, upperOpen: false }),
  },
  writable: true,
});

// Mock indexedDB globally before module import
Object.defineProperty(globalThis, 'indexedDB', {
  value: {
    open() {
      const req: Record<string, unknown> = { result: fakeDb, error: null };
      setTimeout(() => {
        if (typeof req.onupgradeneeded === 'function')
          (req.onupgradeneeded as (e: unknown) => void)({ target: req });
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as () => void)();
      }, 0);
      return req;
    },
  },
  writable: true,
});

// Now import the service (it will use our fake indexedDB)
const { localCacheService } = await import('../../services/localCache');

describe('LocalCacheService', () => {
  beforeEach(() => {
    resetStores();
  });

  it('set and get round-trip for prices', async () => {
    await localCacheService.setPrice('AAPL', 185.5);
    const result = await localCacheService.getPrice('AAPL');
    expect(result).toBe(185.5);
  });

  it('get returns null for missing keys', async () => {
    const result = await localCacheService.getPrice('MISSING');
    expect(result).toBeNull();
  });

  it('clearAll removes all entries', async () => {
    await localCacheService.setPrice('AAPL', 100);
    await localCacheService.clearAll();
    const result = await localCacheService.getPrice('AAPL');
    expect(result).toBeNull();
  });

  it('getCacheStats returns stats with hitRate', async () => {
    const stats = await localCacheService.getCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('hitRate');
    expect(typeof stats.hitRate).toBe('number');
  });

  it('set and get round-trip for fundamentals', async () => {
    const data = { pe: 25, eps: 6.5 };
    await localCacheService.setFundamentals('MSFT', data);
    const result = await localCacheService.getFundamentals('MSFT');
    expect(result).toEqual(data);
  });
});
