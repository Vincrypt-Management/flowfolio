// Core API Client
// Industrial-grade API client with circuit breaker, retries, and metrics

import { invoke } from '@tauri-apps/api/core';
import { API_CONFIG, FEATURES } from '../../shared/constants';
import { 
  AppError, 
  NetworkError, 
  CircuitBreakerError, 
  handleError 
} from '../errors';

// ============ Types ============

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

interface ClientMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  circuitBreakerState: string;
  latencyP95: number;
  latencyP99: number;
}

// ============ API Client Class ============

class ApiClient {
  // Request deduplication
  private pendingRequests = new Map<string, PendingRequest<unknown>>();
  
  // Circuit breaker per service
  private circuitBreakers = new Map<string, CircuitState>();
  
  // Metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  private latencies: number[] = [];

  // ============ Public API ============

  /**
   * Execute a Tauri command with full resilience
   */
  async invoke<T>(
    command: string,
    args?: Record<string, unknown>,
    options: {
      service?: string;
      skipDedup?: boolean;
      skipCircuitBreaker?: boolean;
    } = {}
  ): Promise<T> {
    const service = options.service || 'default';
    const key = this.getRequestKey(command, args);

    // Request deduplication
    if (FEATURES.ENABLE_REQUEST_DEDUP && !options.skipDedup) {
      const pending = this.pendingRequests.get(key);
      if (pending && Date.now() - pending.timestamp < API_CONFIG.DEDUP_WINDOW_MS) {
        if (FEATURES.ENABLE_DEBUG_LOGGING) {
          console.log(`🔄 Deduplicating request: ${command}`);
        }
        return pending.promise as Promise<T>;
      }
    }

    // Circuit breaker check
    if (FEATURES.ENABLE_CIRCUIT_BREAKER && !options.skipCircuitBreaker) {
      if (!this.canExecute(service)) {
        throw new CircuitBreakerError(service);
      }
    }

    // Create request with retry logic
    const requestPromise = this.executeWithRetry<T>(command, args, service);
    
    if (FEATURES.ENABLE_REQUEST_DEDUP && !options.skipDedup) {
      this.pendingRequests.set(key, {
        promise: requestPromise,
        timestamp: Date.now(),
      });
    }

    try {
      const result = await requestPromise;
      this.recordSuccess(service);
      return result;
    } catch (error) {
      this.recordFailure(service);
      throw error;
    } finally {
      // Cleanup after dedup window
      setTimeout(() => {
        this.pendingRequests.delete(key);
      }, API_CONFIG.DEDUP_WINDOW_MS);
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Get client metrics
   */
  getMetrics(): ClientMetrics {
    return {
      ...this.metrics,
      avgLatencyMs: this.calculateAvgLatency(),
      circuitBreakerState: this.getCircuitBreakerState('default'),
      latencyP95: this.getLatencyPercentile(95),
      latencyP99: this.getLatencyPercentile(99),
    };
  }

  /**
   * Reset circuit breaker for a service
   */
  resetCircuitBreaker(service: string = 'default'): void {
    this.circuitBreakers.set(service, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
    });
    console.log(`🔄 Circuit breaker reset for ${service}`);
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this.latencies = [];
  }

  // ============ Private Methods ============

  private async executeWithRetry<T>(
    command: string,
    args?: Record<string, unknown>,
    service: string = 'default',
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

      if (attempt >= API_CONFIG.RETRY.MAX_RETRIES) {
        handleError(error);
        throw this.wrapError(error, command);
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        API_CONFIG.RETRY.INITIAL_DELAY_MS * Math.pow(API_CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1),
        API_CONFIG.RETRY.MAX_DELAY_MS
      );
      const jitter = baseDelay * 0.5 * Math.random();
      const delay = baseDelay + jitter;

      if (FEATURES.ENABLE_DEBUG_LOGGING) {
        console.warn(`⚠️ ${command} attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
      }

      await this.sleep(delay);
      return this.executeWithRetry(command, args, service, attempt + 1);
    }
  }

  private canExecute(service: string): boolean {
    const circuit = this.circuitBreakers.get(service) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const,
    };

    switch (circuit.state) {
      case 'closed':
        return true;
      
      case 'open':
        if (Date.now() - circuit.lastFailure >= API_CONFIG.CIRCUIT_BREAKER.RECOVERY_TIMEOUT_MS) {
          circuit.state = 'half-open';
          circuit.failures = 0;
          this.circuitBreakers.set(service, circuit);
          console.log(`🔌 Circuit breaker transitioning to half-open for ${service}`);
          return true;
        }
        return false;
      
      case 'half-open':
        return true;
      
      default:
        return true;
    }
  }

  private recordSuccess(service: string): void {
    this.metrics.successfulRequests++;
    
    const circuit = this.circuitBreakers.get(service);
    if (circuit) {
      if (circuit.state === 'half-open') {
        circuit.state = 'closed';
        console.log(`✅ Circuit breaker closed for ${service}`);
      }
      circuit.failures = 0;
      this.circuitBreakers.set(service, circuit);
    }
  }

  private recordFailure(service: string): void {
    this.metrics.failedRequests++;
    
    let circuit = this.circuitBreakers.get(service) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const,
    };

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'half-open') {
      circuit.state = 'open';
      console.log(`⚡ Circuit breaker reopened for ${service}`);
    } else if (circuit.failures >= API_CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      circuit.state = 'open';
      console.log(`⚡ Circuit breaker opened for ${service} after ${circuit.failures} failures`);
    }

    this.circuitBreakers.set(service, circuit);
  }

  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-500);
    }
  }

  private calculateAvgLatency(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  private getLatencyPercentile(percentile: number): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private getCircuitBreakerState(service: string): string {
    return this.circuitBreakers.get(service)?.state || 'closed';
  }

  private getRequestKey(command: string, args?: Record<string, unknown>): string {
    return `${command}:${JSON.stringify(args || {})}`;
  }

  private wrapError(error: unknown, command: string): AppError {
    if (error instanceof AppError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new NetworkError(error.message, command, { cause: error });
    }
    
    return new AppError(String(error), 'INVOKE_ERROR', {
      context: { command },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ Singleton Export ============

export const apiClient = new ApiClient();

// ============ Convenience Functions ============

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return apiClient.invoke<T>(command, args);
}

export function getApiMetrics(): ClientMetrics {
  return apiClient.getMetrics();
}
