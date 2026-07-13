export class RateLimitExceededError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

/** Simple fixed-capacity daily quota tracker (no refill within a process lifetime — matches how the app is actually used: one quota allocation per day, replenished on next launch/day boundary handled by the caller). */
export class RateLimiter {
  #capacity: number;
  #remaining: number;

  private constructor(capacity: number) {
    this.#capacity = capacity;
    this.#remaining = capacity;
  }

  static newDaily(requestsPerDay: number): RateLimiter {
    return new RateLimiter(requestsPerDay);
  }

  check(): void {
    if (this.#remaining <= 0) {
      throw new RateLimitExceededError();
    }
    this.#remaining -= 1;
  }

  remainingCapacity(): number {
    return Math.max(0, this.#remaining);
  }
}
