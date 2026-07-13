// packages/core/market-data/health-tracker.ts

export const PROVIDER_TIER: Record<string, number> = {
  alpaca: 10,
  yahoo: 9,
  nasdaq: 8,
  tiingo: 7,
  finnhub: 6,
  twelve_data: 4,
  fmp: 3,
  alphavantage: 2,
  polygon: 1,
};

interface HealthCounts {
  successes: number;
  failures: number;
}

export class HealthTracker {
  #counts = new Map<string, HealthCounts>();

  trackSuccess(provider: string): void {
    const c = this.#counts.get(provider) ?? { successes: 0, failures: 0 };
    c.successes += 1;
    this.#counts.set(provider, c);
  }

  trackFailure(provider: string): void {
    const c = this.#counts.get(provider) ?? { successes: 0, failures: 0 };
    c.failures += 1;
    this.#counts.set(provider, c);
  }

  getHealth(provider: string): number {
    const c = this.#counts.get(provider);
    if (!c || c.successes + c.failures === 0) return 100;
    return Math.floor((c.successes * 100) / (c.successes + c.failures));
  }

  getProviderOrder(providers: string[]): string[] {
    return [...providers].sort((a, b) => {
      const tierA = PROVIDER_TIER[a] ?? 0;
      const tierB = PROVIDER_TIER[b] ?? 0;
      if (tierA !== tierB) return tierB - tierA;
      return this.getHealth(b) - this.getHealth(a);
    });
  }

  snapshot(): Record<string, HealthCounts> {
    return Object.fromEntries(this.#counts);
  }
}
