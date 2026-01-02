// Core Cache Service
// Industrial-grade IndexedDB cache with LRU eviction

import { CACHE_CONFIG, STORAGE_KEYS } from '../../shared/constants';
import { CacheError, handleError } from '../errors';
import type { CacheStats } from '../../shared/types';

// ============ Types ============

interface CacheEntry<T> {
  key: string;
  data: T;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number;
}

interface CacheStoreConfig {
  name: string;
  ttl: number;
  maxEntries: number;
}

// ============ Store Configurations ============

const STORES: CacheStoreConfig[] = [
  { name: 'prices', ttl: CACHE_CONFIG.TTL.PRICE, maxEntries: CACHE_CONFIG.LIMITS.PRICES },
  { name: 'fundamentals', ttl: CACHE_CONFIG.TTL.FUNDAMENTALS, maxEntries: CACHE_CONFIG.LIMITS.FUNDAMENTALS },
  { name: 'sentiment', ttl: CACHE_CONFIG.TTL.SENTIMENT, maxEntries: CACHE_CONFIG.LIMITS.SENTIMENT },
  { name: 'analyst', ttl: CACHE_CONFIG.TTL.ANALYST, maxEntries: CACHE_CONFIG.LIMITS.ANALYST },
  { name: 'historical', ttl: CACHE_CONFIG.TTL.HISTORICAL, maxEntries: CACHE_CONFIG.LIMITS.HISTORICAL },
  { name: 'quant', ttl: CACHE_CONFIG.TTL.QUANT, maxEntries: CACHE_CONFIG.LIMITS.QUANT },
];

// ============ Cache Service Class ============

class CacheService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor() {
    this.dbReady = this.initDB();
  }

  // ============ Initialization ============

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(STORAGE_KEYS.CACHE_PREFIX, 2);

      request.onerror = () => {
        handleError(new CacheError('Failed to open IndexedDB', 'indexeddb', request.error || undefined));
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[INFO] Cache service initialized');
        this.runBackgroundCleanup();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, { keyPath: 'key' });
            objectStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
            objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }

        console.log('📦 Cache stores created');
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    await this.dbReady;
    if (!this.db) {
      throw new CacheError('Database not initialized', 'indexeddb');
    }
    return this.db;
  }

  // ============ Public API ============

  async get<T>(storeName: string, key: string): Promise<T | null> {
    try {
      const db = await this.ensureDB();
      const config = STORES.find(s => s.name === storeName);
      if (!config) {
        throw new CacheError(`Unknown store: ${storeName}`, 'indexeddb');
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;
          
          if (entry && this.isValid(entry, config.ttl)) {
            // Update access stats (LRU tracking)
            entry.accessCount++;
            entry.lastAccessedAt = Date.now();
            store.put(entry);
            
            this.stats.hits++;
            resolve(entry.data);
          } else {
            this.stats.misses++;
            resolve(null);
          }
        };
      });
    } catch (error) {
      handleError(error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(storeName: string, key: string, data: T): Promise<void> {
    try {
      const db = await this.ensureDB();
      const config = STORES.find(s => s.name === storeName);
      if (!config) {
        throw new CacheError(`Unknown store: ${storeName}`, 'indexeddb');
      }

      // Check if eviction is needed
      await this.evictIfNeeded(storeName, config.maxEntries);

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        const entry: CacheEntry<T> = {
          key,
          data,
          updatedAt: Date.now(),
          accessCount: 1,
          lastAccessedAt: Date.now(),
          size: JSON.stringify(data).length,
        };

        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      handleError(error);
    }
  }

  async delete(storeName: string, key: string): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      handleError(error);
    }
  }

  async clear(storeName?: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      const storeNames = storeName ? [storeName] : STORES.map(s => s.name);

      for (const name of storeNames) {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(name, 'readwrite');
          const store = transaction.objectStore(name);
          const request = store.clear();
          
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }

      console.log('🗑️ Cache cleared');
    } catch (error) {
      handleError(error);
    }
  }

  async getStats(): Promise<CacheStats & { storeCounts: Record<string, number> }> {
    const storeCounts: Record<string, number> = {};

    try {
      const db = await this.ensureDB();

      for (const store of STORES) {
        const count = await new Promise<number>((resolve, reject) => {
          const transaction = db.transaction(store.name, 'readonly');
          const objectStore = transaction.objectStore(store.name);
          const request = objectStore.count();
          
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        storeCounts[store.name] = count;
      }
    } catch (error) {
      handleError(error);
    }

    const totalOps = this.stats.hits + this.stats.misses;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: Object.values(storeCounts).reduce((a, b) => a + b, 0),
      hitRate: totalOps > 0 ? this.stats.hits / totalOps : 0,
      storeCounts,
    };
  }

  // ============ Batch Operations ============

  async getBatch<T>(storeName: string, keys: string[]): Promise<Record<string, T>> {
    const results: Record<string, T> = {};
    
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get<T>(storeName, key);
        if (value !== null) {
          results[key] = value;
        }
      })
    );

    return results;
  }

  async setBatch<T>(storeName: string, entries: Record<string, T>): Promise<void> {
    await Promise.all(
      Object.entries(entries).map(([key, value]) => this.set(storeName, key, value))
    );
  }

  // ============ Private Methods ============

  private isValid(entry: CacheEntry<unknown>, ttl: number): boolean {
    return Date.now() - entry.updatedAt < ttl;
  }

  private async evictIfNeeded(storeName: string, maxEntries: number): Promise<void> {
    try {
      const db = await this.ensureDB();

      const count = await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      if (count >= maxEntries) {
        const toEvict = Math.ceil(maxEntries * CACHE_CONFIG.EVICTION_PERCENT);
        await this.evictOldest(storeName, toEvict);
      }
    } catch (error) {
      handleError(error);
    }
  }

  private async evictOldest(storeName: string, count: number): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('lastAccessedAt');

        let evicted = 0;
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor && evicted < count) {
            cursor.delete();
            evicted++;
            this.stats.evictions++;
            cursor.continue();
          } else {
            console.log(`🗑️ Evicted ${evicted} entries from ${storeName}`);
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      handleError(error);
    }
  }

  private async runBackgroundCleanup(): Promise<void> {
    try {
      for (const store of STORES) {
        await this.cleanupExpired(store.name, store.ttl);
      }
    } catch (error) {
      handleError(error);
    }
  }

  private async cleanupExpired(storeName: string, ttl: number): Promise<void> {
    try {
      const db = await this.ensureDB();
      const cutoff = Date.now() - ttl;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('updatedAt');

        let deleted = 0;
        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            if (deleted > 0) {
              console.log(`🧹 Cleaned ${deleted} expired entries from ${storeName}`);
            }
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      handleError(error);
    }
  }
}

// ============ Singleton Export ============

export const cacheService = new CacheService();

// ============ Convenience Functions ============

export async function getCached<T>(store: string, key: string): Promise<T | null> {
  return cacheService.get<T>(store, key);
}

export async function setCached<T>(store: string, key: string, data: T): Promise<void> {
  return cacheService.set(store, key, data);
}

export async function getCacheStats() {
  return cacheService.getStats();
}
