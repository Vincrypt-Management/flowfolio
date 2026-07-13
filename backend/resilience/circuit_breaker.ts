export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  openDurationMs: number;
  successThreshold: number;
}

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30_000,
  successThreshold: 3,
};

export interface CircuitStats {
  name: string;
  state: CircuitState;
  totalRequests: number;
  totalFailures: number;
  currentFailureCount: number;
  successRate: number;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is open`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  #name: string;
  #config: CircuitBreakerConfig;
  #state: CircuitState = "closed";
  #failureCount = 0;
  #successCount = 0;
  #openedAt: number | null = null;
  #totalRequests = 0;
  #totalFailures = 0;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.#name = name;
    this.#config = config;
  }

  canExecute(): boolean {
    if (this.#state === "closed") return true;
    if (this.#state === "half_open") return true;
    // open
    if (this.#openedAt !== null && Date.now() - this.#openedAt >= this.#config.openDurationMs) {
      this.#state = "half_open";
      this.#successCount = 0;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.#totalRequests += 1;
    if (this.#state === "closed") {
      this.#failureCount = 0;
    } else if (this.#state === "half_open") {
      this.#successCount += 1;
      if (this.#successCount >= this.#config.successThreshold) {
        this.#state = "closed";
        this.#failureCount = 0;
      }
    }
    // "open": no-op, matching the Rust source's graceful handling
  }

  recordFailure(): void {
    this.#totalRequests += 1;
    this.#totalFailures += 1;

    if (this.#state === "closed") {
      this.#failureCount += 1;
      if (this.#failureCount >= this.#config.failureThreshold) {
        this.#state = "open";
        this.#openedAt = Date.now();
      }
    } else if (this.#state === "half_open") {
      this.#state = "open";
      this.#openedAt = Date.now();
      this.#successCount = 0;
    } else {
      // already open: refresh the timestamp
      this.#openedAt = Date.now();
    }
  }

  state(): CircuitState {
    return this.#state;
  }

  stats(): CircuitStats {
    const successRate = this.#totalRequests === 0
      ? 1
      : 1 - this.#totalFailures / this.#totalRequests;
    return {
      name: this.#name,
      state: this.#state,
      totalRequests: this.#totalRequests,
      totalFailures: this.#totalFailures,
      currentFailureCount: this.#failureCount,
      successRate,
    };
  }

  reset(): void {
    this.#state = "closed";
    this.#failureCount = 0;
    this.#successCount = 0;
    this.#openedAt = null;
  }
}

export class CircuitBreakerManager {
  #breakers = new Map<string, CircuitBreaker>();
  #defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: CircuitBreakerConfig = defaultCircuitBreakerConfig) {
    this.#defaultConfig = defaultConfig;
  }

  getOrCreate(name: string): CircuitBreaker {
    let breaker = this.#breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, this.#defaultConfig);
      this.#breakers.set(name, breaker);
    }
    return breaker;
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getOrCreate(name);
    if (!breaker.canExecute()) {
      throw new CircuitOpenError(name);
    }
    try {
      const result = await fn();
      breaker.recordSuccess();
      return result;
    } catch (err) {
      breaker.recordFailure();
      throw err;
    }
  }

  allStats(): CircuitStats[] {
    return Array.from(this.#breakers.values()).map((b) => b.stats());
  }

  resetAll(): void {
    for (const breaker of this.#breakers.values()) {
      breaker.reset();
    }
  }
}
