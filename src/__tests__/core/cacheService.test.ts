import { describe, it, expect, vi } from 'vitest';

// ============ Mock logger and errors before any module import ============

vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

vi.mock('../../core/errors', () => ({
  handleError: vi.fn(),
  CacheError: class CacheError extends Error {
    constructor(message: string, _store?: string, _cause?: unknown) {
      super(message);
      this.name = 'CacheError';
    }
  },
}));

// ============ Minimal IndexedDB fake (must be in place before module import) ============

function makeObjectStore(data: Map<string, unknown>) {
  return {
    get(key: string) {
      const req: Record<string, unknown> = { result: data.get(key) ?? undefined, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    },
    put(entry: { key: string }) {
      data.set(entry.key, entry);
      const req: Record<string, unknown> = { result: undefined, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    },
    delete(key: string) {
      data.delete(key);
      const req: Record<string, unknown> = { result: undefined, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    },
    clear() {
      data.clear();
      const req: Record<string, unknown> = { result: undefined, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    },
    count() {
      const req: Record<string, unknown> = { result: data.size, error: null };
      setTimeout(() => {
        if (typeof req.onsuccess === 'function')
          (req.onsuccess as (e: unknown) => void)({ target: req });
      }, 0);
      return req;
    },
    createIndex() { return {}; },
    index() {
      return {
        openCursor(_range?: unknown) {
          const entries = [...data.entries()];
          let idx = 0;
          const req: Record<string, unknown> = { result: null, error: null };
          setTimeout(() => {
            const advance = () => {
              if (idx < entries.length) {
                const [key] = entries[idx++];
                req.result = {
                  value: data.get(key),
                  delete() { data.delete(key); },
                  continue() { setTimeout(advance, 0); },
                };
              } else {
                req.result = null;
              }
              if (typeof req.onsuccess === 'function')
                (req.onsuccess as (e: unknown) => void)({ target: req });
            };
            advance();
          }, 0);
          return req;
        },
      };
    },
  };
}

const storeData: Record<string, Map<string, unknown>> = {};

function getStoreData(name: string) {
  if (!storeData[name]) storeData[name] = new Map();
  return storeData[name];
}

const fakeDb = {
  transaction(names: string | string[]) {
    const name = Array.isArray(names) ? names[0] : names;
    return { objectStore: () => makeObjectStore(getStoreData(name)) };
  },
  objectStoreNames: { contains: () => false },
  createObjectStore(name: string) { return makeObjectStore(getStoreData(name)); },
};

Object.defineProperty(globalThis, 'IDBKeyRange', {
  value: {
    upperBound: (val: unknown) => ({ upper: val, upperOpen: false }),
    lowerBound: (val: unknown) => ({ lower: val, lowerOpen: false }),
    bound: (l: unknown, u: unknown) => ({ lower: l, upper: u }),
  },
  writable: true,
  configurable: true,
});

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
  configurable: true,
});

// ============ Import service AFTER globals are set ============

const { cacheService } = await import('../../core/cache/service');

// ============ Tests ============

describe('CacheService – isValid', () => {
  it('returns true for a fresh entry', () => {
    const entry = {
      key: 'x', data: 1,
      updatedAt: Date.now(),
      accessCount: 0, lastAccessedAt: Date.now(), size: 10,
    };
    expect((cacheService as any).isValid(entry, 60000)).toBe(true);
  });

  it('returns false for an expired entry (updatedAt 70 s ago, ttl 60 s)', () => {
    const entry = {
      key: 'x', data: 1,
      updatedAt: Date.now() - 70000,
      accessCount: 0, lastAccessedAt: Date.now(), size: 10,
    };
    expect((cacheService as any).isValid(entry, 60000)).toBe(false);
  });

  it('returns true at the exact boundary (updatedAt = now - ttl + 1)', () => {
    const entry = {
      key: 'x', data: 1,
      updatedAt: Date.now() - 60000 + 1,
      accessCount: 0, lastAccessedAt: Date.now(), size: 10,
    };
    expect((cacheService as any).isValid(entry, 60000)).toBe(true);
  });
});

describe('CacheService – stats', () => {
  it('stats object starts at { hits: 0, misses: 0, evictions: 0 }', () => {
    const stats = (cacheService as any).stats;
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);
  });

  it('getStats() returns an object with hits, misses, and evictions properties', async () => {
    const stats = await cacheService.getStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('evictions');
  });
});
