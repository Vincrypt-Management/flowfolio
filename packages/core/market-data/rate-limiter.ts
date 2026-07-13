export class RateLimitedError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`Rate limit exceeded for provider '${provider}'`);
    this.name = "RateLimitedError";
    this.provider = provider;
  }
}

interface WindowState {
  count: number;
  windowStart: number;
}

/** Sliding 60-second window per provider, matching the Rust source's check_rate_limit. */
export class SlidingWindowRateLimiter {
  #windows = new Map<string, WindowState>();

  checkAndConsume(provider: string, limitPerMinute: number, now: number = Date.now()): boolean {
    let state = this.#windows.get(provider);
    if (!state || now - state.windowStart > 60_000) {
      state = { count: 0, windowStart: now };
      this.#windows.set(provider, state);
    }
    if (state.count >= limitPerMinute) {
      return false;
    }
    state.count += 1;
    return true;
  }
}
