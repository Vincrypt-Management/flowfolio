interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  #ttlMs: number;
  #store = new Map<string, Entry<V>>();

  constructor(ttlMs: number) {
    this.#ttlMs = ttlMs;
  }

  get(key: string): V | undefined {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.#store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.#store.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }

  delete(key: string): void {
    this.#store.delete(key);
  }

  clear(): void {
    this.#store.clear();
  }

  size(): number {
    return this.#store.size;
  }

  sweepExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.#store) {
      if (now >= entry.expiresAt) {
        this.#store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
