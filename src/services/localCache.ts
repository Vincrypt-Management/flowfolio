// Local Database Cache Service for Frontend
// Uses IndexedDB for persistent local caching of market data

const DB_NAME = 'flowfolio_cache';
const DB_VERSION = 1;

interface CacheEntry<T> {
  symbol: string;
  data: T;
  updatedAt: number; // timestamp
}

// TTL settings in milliseconds
const CACHE_TTL = {
  price: 1 * 60 * 60 * 1000,          // 1 hour
  fundamentals: 24 * 60 * 60 * 1000,  // 24 hours
  sentiment: 4 * 60 * 60 * 1000,      // 4 hours
  analyst: 24 * 60 * 60 * 1000,       // 24 hours
  historical: 24 * 60 * 60 * 1000,    // 24 hours
};

class LocalCacheService {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

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
        console.log('✅ IndexedDB cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores for each data type
        if (!db.objectStoreNames.contains('prices')) {
          db.createObjectStore('prices', { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains('fundamentals')) {
          db.createObjectStore('fundamentals', { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains('sentiment')) {
          db.createObjectStore('sentiment', { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains('analyst')) {
          db.createObjectStore('analyst', { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains('historical')) {
          db.createObjectStore('historical', { keyPath: 'symbol' });
        }

        console.log('📦 IndexedDB stores created');
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

  private isCacheValid(entry: CacheEntry<any>, ttl: number): boolean {
    const now = Date.now();
    return (now - entry.updatedAt) < ttl;
  }

  // ========== GENERIC CACHE OPERATIONS ==========

  private async getFromStore<T>(storeName: string, symbol: string, ttl: number): Promise<T | null> {
    try {
      const db = await this.ensureDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(symbol);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;
          if (entry && this.isCacheValid(entry, ttl)) {
            console.log(`✅ Cache hit [${storeName}]: ${symbol}`);
            resolve(entry.data);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn(`Cache read error [${storeName}]:`, error);
      return null;
    }
  }

  private async setInStore<T>(storeName: string, symbol: string, data: T): Promise<void> {
    try {
      const db = await this.ensureDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const entry: CacheEntry<T> = {
          symbol,
          data,
          updatedAt: Date.now(),
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

  // ========== PRICE CACHE ==========

  async getPrice(symbol: string): Promise<number | null> {
    return this.getFromStore<number>('prices', symbol, CACHE_TTL.price);
  }

  async setPrice(symbol: string, price: number): Promise<void> {
    return this.setInStore('prices', symbol, price);
  }

  async getPricesBatch(symbols: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    
    for (const symbol of symbols) {
      const price = await this.getPrice(symbol);
      if (price !== null) {
        results[symbol] = price;
      }
    }
    
    return results;
  }

  // ========== FUNDAMENTALS CACHE ==========

  async getFundamentals(symbol: string): Promise<any | null> {
    return this.getFromStore<any>('fundamentals', symbol, CACHE_TTL.fundamentals);
  }

  async setFundamentals(symbol: string, data: any): Promise<void> {
    return this.setInStore('fundamentals', symbol, data);
  }

  // ========== SENTIMENT CACHE ==========

  async getSentiment(symbol: string): Promise<any | null> {
    return this.getFromStore<any>('sentiment', symbol, CACHE_TTL.sentiment);
  }

  async setSentiment(symbol: string, data: any): Promise<void> {
    return this.setInStore('sentiment', symbol, data);
  }

  // ========== ANALYST CACHE ==========

  async getAnalyst(symbol: string): Promise<any | null> {
    return this.getFromStore<any>('analyst', symbol, CACHE_TTL.analyst);
  }

  async setAnalyst(symbol: string, data: any): Promise<void> {
    return this.setInStore('analyst', symbol, data);
  }

  // ========== HISTORICAL DATA CACHE ==========

  async getHistorical(symbol: string): Promise<any[] | null> {
    return this.getFromStore<any[]>('historical', symbol, CACHE_TTL.historical);
  }

  async setHistorical(symbol: string, data: any[]): Promise<void> {
    return this.setInStore('historical', symbol, data);
  }

  // ========== UTILITY METHODS ==========

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical'];
    
    for (const storeName of storeNames) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
    
    console.log('🗑️ Cache cleared');
  }

  async getCacheStats(): Promise<Record<string, number>> {
    const db = await this.ensureDB();
    const storeNames = ['prices', 'fundamentals', 'sentiment', 'analyst', 'historical'];
    const stats: Record<string, number> = {};
    
    for (const storeName of storeNames) {
      const count = await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      stats[storeName] = count;
    }
    
    return stats;
  }
}

// Singleton instance
export const localCacheService = new LocalCacheService();
