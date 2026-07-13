export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  attemptTimeoutMs: number | null;
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  backoffMultiplier: 2.0,
  jitter: true,
  attemptTimeoutMs: 30_000,
};

export const aggressiveRetryConfig: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 50,
  maxDelayMs: 2_000,
  backoffMultiplier: 1.5,
  jitter: true,
  attemptTimeoutMs: 10_000,
};

export const conservativeRetryConfig: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 3.0,
  jitter: true,
  attemptTimeoutMs: 60_000,
};

export const networkRetryConfig: RetryConfig = {
  maxRetries: 4,
  initialDelayMs: 500,
  maxDelayMs: 15_000,
  backoffMultiplier: 2.0,
  jitter: true,
  attemptTimeoutMs: 30_000,
};

export type RetryOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface RetryResult<T> {
  result: RetryOutcome<T>;
  attempts: number;
  totalDelayMs: number;
}

class TimeoutMarker {}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number | null): Promise<T> {
  if (timeoutMs === null) return fn();
  const timeout = new Promise<TimeoutMarker>((resolve) =>
    setTimeout(() => resolve(new TimeoutMarker()), timeoutMs)
  );
  const result = await Promise.race([fn(), timeout]);
  if (result instanceof TimeoutMarker) {
    throw new Error(`Attempt timed out after ${timeoutMs}ms`);
  }
  return result;
}

function jitteredDelay(delayMs: number, jitter: boolean): number {
  if (!jitter) return delayMs;
  const factor = 0.5 + Math.random() * 0.5; // 0.5 to 1.0
  return Math.round(delayMs * factor);
}

export class RetryExecutor {
  #config: RetryConfig;

  constructor(config: RetryConfig) {
    this.#config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    return await this.executeWithPredicate(fn, () => true);
  }

  async executeWithPredicate<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
  ): Promise<RetryResult<T>> {
    let attempts = 0;
    let totalDelayMs = 0;
    let currentDelay = this.#config.initialDelayMs;

    for (;;) {
      attempts += 1;
      try {
        const value = await withTimeout(fn, this.#config.attemptTimeoutMs);
        return { result: { ok: true, value }, attempts, totalDelayMs };
      } catch (error) {
        if (attempts >= this.#config.maxRetries || !shouldRetry(error)) {
          return { result: { ok: false, error }, attempts, totalDelayMs };
        }

        const delay = jitteredDelay(currentDelay, this.#config.jitter);
        await new Promise((resolve) => setTimeout(resolve, delay));
        totalDelayMs += delay;

        currentDelay = Math.min(
          currentDelay * this.#config.backoffMultiplier,
          this.#config.maxDelayMs,
        );
      }
    }
  }
}

export async function retry<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return await new RetryExecutor(defaultRetryConfig).execute(fn);
}

export async function retryNetwork<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return await new RetryExecutor(networkRetryConfig).execute(fn);
}

export async function retryRateLimited<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
  return await new RetryExecutor(conservativeRetryConfig).execute(fn);
}
