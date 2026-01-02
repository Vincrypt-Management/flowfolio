// Industrial-Grade Local Database Cache Service
// Uses IndexedDB for persistent local caching with LRU eviction and compression hints

const DB_NAME = 'flowfolio_cache_v2';
const DB_VERSION = 2;

interface CacheEntry<T> {
  symbol: string;
  data: T;
  updatedAt: number; // timestamp
  accessCount: number; // for LRU tracking
  lastAccessedAt: number;
  size?: number; // bytes for quota management
}

// TTL settings in milliseconds (optimized for free tier APIs)
const CACHE_TTL = {
  price: 2 * 60 * 60 * 1000,          // 2 hours (increased)
  fundamentals: 48 * 60 * 60 * 1000,  // 48 hours (increased - rarely changes)
  sentiment: 6 * 60 * 60 * 1000,      // 6 hours (increased)
  analyst: 48 * 60 * 60 * 1000,       // 48 hours (increased)
  historical: 48 * 60 * 60 * 1000,    // 48 hours (increased)
  quant: 4 * 60 * 60 * 1000,          // 4 hours (new)
};

// Cache size limits per store
const CACHE_LIMITS = {
  prices: 500,
  fundamentals: 200,
  sentiment: 200,
  analyst: 200,
  historical: 100,
  quant: 300,
};

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  storeCounts: Record<string, number>;
}

class LocalCacheService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    storeCounts: {},
  };

  constructor() {
    this.dbReady = this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[INFO] IndexedDB cache initialized (v2)');
        this.cleanupExpiredEntries(); // Background cleanup
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores with indexes for LRU eviction
        const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical', 'quant'];
        
        for (const storeName of storeNames) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'symbol' });
            store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }

        console.log('📦 IndexedDB stores created with indexes');
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    await this.dbReady;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  private isCacheValid(entry: CacheEntry<unknown>, ttl: number): boolean {
    const now = Date.now();
    return (now - entry.updatedAt) < ttl;
  }

  // ========== GENERIC CACHE OPERATIONS WITH LRU ==========

  private async getFromStore<T>(storeName: string, symbol: string, ttl: number): Promise<T | null> {
    try {
      const db = await this.ensureDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.get(symbol);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;
          if (entry && this.isCacheValid(entry, ttl)) {
            // Update access stats for LRU
            entry.accessCount = (entry.accessCount || 0) + 1;
            entry.lastAccessedAt = Date.now();
            store.put(entry); // Update in background
            
            this.stats.hits++;
            console.log(`Cache hit [${storeName}]: ${symbol}`);
            resolve(entry.data);
          } else {
            this.stats.misses++;
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn(`Cache read error [${storeName}]:`, error);
      this.stats.misses++;
      return null;
    }
  }

  private async setInStore<T>(storeName: string, symbol: string, data: T): Promise<void> {
    try {
      const db = await this.ensureDB();
      
      // Check if eviction is needed
      await this.evictIfNeeded(storeName);
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const entry: CacheEntry<T> = {
          symbol,
          data,
          updatedAt: Date.now(),
          accessCount: 1,
          lastAccessedAt: Date.now(),
          size: JSON.stringify(data).length,
        };

        const request = store.put(entry);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log(`💾 Cached [${storeName}]: ${symbol}`);
          resolve();
        };
      });
    } catch (error) {
      console.warn(`Cache write error [${storeName}]:`, error);
    }
  }

  // ========== LRU EVICTION ==========

  private async evictIfNeeded(storeName: string): Promise<void> {
    const limit = CACHE_LIMITS[storeName as keyof typeof CACHE_LIMITS] || 100;
    
    try {
      const db = await this.ensureDB();
      
      const count = await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      if (count >= limit) {
        // Evict 10% of oldest entries
        const toEvict = Math.ceil(limit * 0.1);
        await this.evictOldest(storeName, toEvict);
      }
    } catch (error) {
      console.warn(`Eviction check failed for ${storeName}:`, error);
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
      console.warn(`Eviction failed for ${storeName}:`, error);
    }
  }

  // ========== BACKGROUND CLEANUP ==========

  private async cleanupExpiredEntries(): Promise<void> {
    const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical', 'quant'];
    
    for (const storeName of storeNames) {
      const ttl = CACHE_TTL[storeName as keyof typeof CACHE_TTL] || 3600000;
      await this.cleanupStore(storeName, ttl);
    }
  }

  private async cleanupStore(storeName: string, ttl: number): Promise<void> {
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
              console.log(`[INFO] Cleaned up ${deleted} expired entries from ${storeName}`);
            }
            resolve();
          }
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn(`Cleanup failed for ${storeName}:`, error);
    }
  }

  // ========== PRICE CACHE ==========

  async getPrice(symbol: string): Promise<number | null> {
    return this.getFromStore<number>('prices', symbol, CACHE_TTL.price);
  }

  async setPrice(symbol: string, price: number): Promise<void> {
    return this.setInStore('prices', symbol, price);
  }

  async getPricesBatch(symbols: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    
    // Batch get for better performance
    const promises = symbols.map(async (symbol) => {
      const price = await this.getPrice(symbol);
      if (price !== null) {
        results[symbol] = price;
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  // ========== FUNDAMENTALS CACHE ==========

  async getFundamentals(symbol: string): Promise<unknown | null> {
    return this.getFromStore<unknown>('fundamentals', symbol, CACHE_TTL.fundamentals);
  }

  async setFundamentals(symbol: string, data: unknown): Promise<void> {
    return this.setInStore('fundamentals', symbol, data);
  }

  // ========== SENTIMENT CACHE ==========

  async getSentiment(symbol: string): Promise<unknown | null> {
    return this.getFromStore<unknown>('sentiment', symbol, CACHE_TTL.sentiment);
  }

  async setSentiment(symbol: string, data: unknown): Promise<void> {
    return this.setInStore('sentiment', symbol, data);
  }

  // ========== ANALYST CACHE ==========

  async getAnalyst(symbol: string): Promise<unknown | null> {
    return this.getFromStore<unknown>('analyst', symbol, CACHE_TTL.analyst);
  }

  async setAnalyst(symbol: string, data: unknown): Promise<void> {
    return this.setInStore('analyst', symbol, data);
  }

  // ========== HISTORICAL DATA CACHE ==========

  async getHistorical(symbol: string): Promise<unknown[] | null> {
    return this.getFromStore<unknown[]>('historical', symbol, CACHE_TTL.historical);
  }

  async setHistorical(symbol: string, data: unknown[]): Promise<void> {
    return this.setInStore('historical', symbol, data);
  }

  // ========== QUANT METRICS CACHE ==========

  async getQuant(symbol: string): Promise<unknown | null> {
    return this.getFromStore<unknown>('quant', symbol, CACHE_TTL.quant);
  }

  async setQuant(symbol: string, data: unknown): Promise<void> {
    return this.setInStore('quant', symbol, data);
  }

  // ========== UTILITY METHODS ==========

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical', 'quant'];
    
    for (const storeName of storeNames) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
    
    // Reset stats
    this.stats = { hits: 0, misses: 0, evictions: 0, storeCounts: {} };
    console.log('🗑️ Cache cleared');
  }

  async getCacheStats(): Promise<CacheStats & { hitRate: number }> {
    const db = await this.ensureDB();
    const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical', 'quant'];
    
    for (const storeName of storeNames) {
      const count = await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      this.stats.storeCounts[storeName] = count;
    }
    
    const totalOps = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: totalOps > 0 ? this.stats.hits / totalOps : 0,
    };
  }

  // Force garbage collection of expired entries
  async gc(): Promise<void> {
    console.log('[INFO] Running cache garbage collection...');
    await this.cleanupExpiredEntries();
  }
}

// Singleton instance
export const localCacheService = new LocalCacheService();
