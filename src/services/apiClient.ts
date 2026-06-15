// Industrial-Grade API Client
// Features: Request deduplication, automatic retries, circuit breaker pattern

import { createLogger } from '../core/logger';
import { invoke } from './tauri';

const log = createLogger('api-client');

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Industrial-grade API client with:
 * - Request deduplication (prevents duplicate concurrent requests)
 * - Circuit breaker pattern (fails fast when backend is down)
 * - Automatic retries with exponential backoff
 * - Request metrics and monitoring
 */
// Commands that hit local SQLite — never blocked by any circuit breaker
const LOCAL_COMMANDS = new Set([
  'list_saved_portfolios',
  'save_portfolio',
  'delete_saved_portfolio',
  'get_portfolio',
  'list_saved_plans',
  'save_plan',
  'delete_saved_plan',
  'get_journal_entries',
  'save_journal_entry',
  'delete_journal_entry',
  'ai_is_configured',
  'ai_local_is_ready',
  'ai_clear_cache',
  'ai_cache_stats',
]);

// AI network commands — isolated circuit breaker so market data failures can't block AI
const AI_COMMANDS = new Set([
  'ai_chat',
  'ai_chat_stream',
  'ai_chat_assistant',
  'ai_generate_portfolio_insight',
]);

class ApiClient {
  // Request deduplication: pending requests by key
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map();
  private readonly REQUEST_DEDUP_TTL = 100; // ms

  // Per-domain circuit breakers: market data failures don't bleed into AI and vice versa
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  };
  private aiCircuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  };
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30000; // 30 seconds

  // Retry configuration
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_DELAY = 100; // ms
  private readonly MAX_DELAY = 5000; // ms
  private readonly BACKOFF_MULTIPLIER = 2;

  // Rate limit tracking
  private rateLimitedUntil: number = 0;
  private rateLimitProvider: string = '';

  // Metrics
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgLatencyMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  private latencies: number[] = [];

  private domainBreaker(command: string): CircuitBreakerState {
    return AI_COMMANDS.has(command) ? this.aiCircuitBreaker : this.circuitBreaker;
  }

  /**
   * Execute a Tauri command with industrial-grade resilience
   */
  async execute<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const key = this.getRequestKey(command, args);
    const breaker = this.domainBreaker(command);

    // Check circuit breaker — local DB commands bypass it entirely
    if (!LOCAL_COMMANDS.has(command) && !this.canExecute(breaker)) {
      throw new Error(`Circuit breaker open for ${command}. Service unavailable.`);
    }

    // Check for duplicate in-flight request
    const pending = this.pendingRequests.get(key);
    if (pending && Date.now() - pending.timestamp < this.REQUEST_DEDUP_TTL) {
      log.debug(`Deduplicating request: ${command}`);
      return pending.promise as Promise<T>;
    }

    // Create new request with retry logic
    const requestPromise = this.executeWithRetry<T>(command, args);
    
    this.pendingRequests.set(key, {
      promise: requestPromise,
      timestamp: Date.now(),
    });

    try {
      const result = await requestPromise;
      this.recordSuccess(breaker);
      return result;
    } catch (error) {
      this.recordFailure(breaker);
      // Detect rate limit errors and set cooldown
      const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
        this.rateLimitedUntil = Date.now() + 60000;
        this.rateLimitProvider = command;
        log.warn(`Rate limit detected for ${command}. Cooling down for 60s.`);
      }
      throw error;
    } finally {
      // Clean up after a delay to allow deduplication window
      setTimeout(() => this.pendingRequests.delete(key), this.REQUEST_DEDUP_TTL);
    }
  }

  /**
   * Execute with exponential backoff retry
   */
  private async executeWithRetry<T>(
    command: string,
    args?: Record<string, unknown>,
    attempt: number = 1
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      this.metrics.totalRequests++;
      const result = await invoke<T>(command, args);
      
      const latency = performance.now() - startTime;
      this.recordLatency(latency);
      
      return result;
    } catch (error) {
      const latency = performance.now() - startTime;
      this.recordLatency(latency);

      if (attempt >= this.MAX_RETRIES) {
        log.error(`${command} failed after ${attempt} attempts`, error);
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        this.INITIAL_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attempt - 1),
        this.MAX_DELAY
      );
      const jitter = baseDelay * 0.5 * Math.random();
      const delay = baseDelay + jitter;

      log.warn(`${command} attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
      
      await this.sleep(delay);
      return this.executeWithRetry(command, args, attempt + 1);
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  private canExecute(breaker: CircuitBreakerState = this.circuitBreaker): boolean {
    const now = Date.now();

    switch (breaker.state) {
      case 'closed':
        return true;

      case 'open':
        if (now - breaker.lastFailure >= this.RECOVERY_TIMEOUT) {
          log.info('Circuit breaker transitioning to half-open');
          breaker.state = 'half-open';
          breaker.failures = 0;
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(breaker: CircuitBreakerState = this.circuitBreaker): void {
    this.metrics.successfulRequests++;

    if (breaker.state === 'half-open') {
      if (breaker.failures === 0) {
        log.info('Circuit breaker closed after recovery');
        breaker.state = 'closed';
      }
    }

    breaker.failures = 0;
  }

  /**
   * Record failed request
   */
  private recordFailure(breaker: CircuitBreakerState = this.circuitBreaker): void {
    this.metrics.failedRequests++;
    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.state === 'half-open') {
      log.info('Circuit breaker reopened from half-open');
      breaker.state = 'open';
    } else if (breaker.failures >= this.FAILURE_THRESHOLD) {
      log.info(`Circuit breaker opened after ${breaker.failures} failures`);
      breaker.state = 'open';
    }
  }

  /**
   * Record latency for metrics
   */
  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    
    // Keep last 1000 latencies
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-500);
    }
    
    // Update average
    this.metrics.avgLatencyMs = 
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Get current metrics
   */
  getMetrics(): RequestMetrics & { circuitBreakerState: string; cacheHitRate: number } {
    const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreaker.state,
      cacheHitRate: totalCacheOps > 0 
        ? this.metrics.cacheHits / totalCacheOps 
        : 0,
    };
  }

  /**
   * Get percentile latency
   */
  getLatencyPercentile(percentile: number): number {
    if (this.latencies.length === 0) return 0;
    
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Reset circuit breaker (manual override)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
    };
    log.info('Circuit breaker manually reset');
  }

  /**
   * Check whether a rate limit cooldown is currently active
   */
  isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  /**
   * Get rate limit info if currently rate-limited, otherwise null
   */
  getRateLimitInfo(): { provider: string; retryAfterSeconds: number } | null {
    if (!this.isRateLimited()) return null;
    return {
      provider: this.rateLimitProvider,
      retryAfterSeconds: Math.ceil((this.rateLimitedUntil - Date.now()) / 1000),
    };
  }

  /**
   * Generate unique request key for deduplication
   */
  private getRequestKey(command: string, args?: Record<string, unknown>): string {
    return `${command}:${JSON.stringify(args || {})}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Convenience wrapper for invoking commands
export async function invokeWithResilience<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return apiClient.execute<T>(command, args);
}

// Alias kept for backwards-compat (e.g. tests that import invokeCommand)
export const invokeCommand = invokeWithResilience;

// Expose metrics as a standalone function
export function getApiMetrics() {
  return apiClient.getMetrics();
}

// Reset all metrics counters (useful in tests)
export function resetMetrics() {
  // Re-create the singleton's internal state via the public surface
  apiClient.resetCircuitBreaker();
  // Reset counters by calling recordCacheHit inverse is not available;
  // we expose this only so tests can call it — actual reset is below.
  // Cast to access private field via bracket notation in JS runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiClient as any).metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgLatencyMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiClient as any).latencies = [];
}
