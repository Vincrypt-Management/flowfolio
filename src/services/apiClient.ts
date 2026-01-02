// Industrial-Grade API Client
// Features: Request deduplication, automatic retries, circuit breaker pattern

import { invoke } from './tauri';

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
class ApiClient {
  // Request deduplication: pending requests by key
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map();
  private readonly REQUEST_DEDUP_TTL = 100; // ms

  // Circuit breaker configuration
  private circuitBreaker: CircuitBreakerState = {
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

  /**
   * Execute a Tauri command with industrial-grade resilience
   */
  async execute<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const key = this.getRequestKey(command, args);
    
    // Check circuit breaker
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker open for ${command}. Service unavailable.`);
    }

    // Check for duplicate in-flight request
    const pending = this.pendingRequests.get(key);
    if (pending && Date.now() - pending.timestamp < this.REQUEST_DEDUP_TTL) {
      console.log(`🔄 Deduplicating request: ${command}`);
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
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
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
        console.error(`${command} failed after ${attempt} attempts:`, error);
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        this.INITIAL_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attempt - 1),
        this.MAX_DELAY
      );
      const jitter = baseDelay * 0.5 * Math.random();
      const delay = baseDelay + jitter;

      console.warn(`${command} attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
      
      await this.sleep(delay);
      return this.executeWithRetry(command, args, attempt + 1);
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'closed':
        return true;
      
      case 'open':
        // Check if recovery timeout has passed
        if (now - this.circuitBreaker.lastFailure >= this.RECOVERY_TIMEOUT) {
          console.log('🔌 Circuit breaker transitioning to half-open');
          this.circuitBreaker.state = 'half-open';
          this.circuitBreaker.failures = 0;
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
  private recordSuccess(): void {
    this.metrics.successfulRequests++;
    
    if (this.circuitBreaker.state === 'half-open') {
      // After enough successes in half-open, close the circuit
      if (this.circuitBreaker.failures === 0) {
        console.log('[INFO] Circuit breaker closed after recovery');
        this.circuitBreaker.state = 'closed';
      }
    }
    
    // Reset failure count on success
    this.circuitBreaker.failures = 0;
  }

  /**
   * Record failed request
   */
  private recordFailure(): void {
    this.metrics.failedRequests++;
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.state === 'half-open') {
      // Any failure in half-open reopens the circuit
      console.log('⚡ Circuit breaker reopened from half-open');
      this.circuitBreaker.state = 'open';
    } else if (this.circuitBreaker.failures >= this.FAILURE_THRESHOLD) {
      console.log(`⚡ Circuit breaker opened after ${this.circuitBreaker.failures} failures`);
      this.circuitBreaker.state = 'open';
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
    console.log('🔄 Circuit breaker manually reset');
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
