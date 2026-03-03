import { describe, it, expect, vi } from 'vitest';
import {
  AppError,
  NetworkError,
  RateLimitError,
  CacheError,
  CircuitBreakerError,
  ValidationError,
  handleError,
  isAppError,
  toAppError,
} from '../../core/errors/index';

describe('AppError', () => {
  it('has message, code, and recoverable flag', () => {
    const err = new AppError('test error', 'TEST_CODE', { recoverable: true });
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.recoverable).toBe(true);
  });

  it('is instanceof Error', () => {
    expect(new AppError('x', 'X')).toBeInstanceOf(Error);
  });

  it('defaults recoverable to false', () => {
    const err = new AppError('x', 'X');
    expect(err.recoverable).toBe(false);
  });

  it('toApiError returns serialisable object', () => {
    const err = new AppError('msg', 'CODE', { recoverable: true, retryAfterMs: 1000 });
    const api = err.toApiError();
    expect(api).toEqual({ code: 'CODE', message: 'msg', recoverable: true, retryAfterMs: 1000 });
  });
});

describe('NetworkError', () => {
  it('includes URL and status code', () => {
    const err = new NetworkError('fail', 'https://api.example.com', { statusCode: 503 });
    expect(err.url).toBe('https://api.example.com');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('is instanceof Error and AppError', () => {
    const err = new NetworkError('fail', '/url');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('is recoverable for 5xx status codes', () => {
    expect(new NetworkError('x', '/u', { statusCode: 500 }).recoverable).toBe(true);
    expect(new NetworkError('x', '/u', { statusCode: 503 }).recoverable).toBe(true);
  });

  it('is not recoverable for 4xx status codes (except 429)', () => {
    expect(new NetworkError('x', '/u', { statusCode: 404 }).recoverable).toBe(false);
    expect(new NetworkError('x', '/u', { statusCode: 429 }).recoverable).toBe(true);
  });
});

describe('RateLimitError', () => {
  it('is recoverable and has retryAfter', () => {
    const err = new RateLimitError('provider-a', 5000);
    expect(err.recoverable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.provider).toBe('provider-a');
  });

  it('is instanceof Error', () => {
    expect(new RateLimitError('p')).toBeInstanceOf(Error);
  });
});

describe('CacheError', () => {
  it('has proper error type and cache type', () => {
    const err = new CacheError('cache fail', 'indexeddb');
    expect(err.code).toBe('CACHE_ERROR');
    expect(err.cacheType).toBe('indexeddb');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('CircuitBreakerError', () => {
  it('has proper service name and is recoverable', () => {
    const err = new CircuitBreakerError('market-data');
    expect(err.serviceName).toBe('market-data');
    expect(err.recoverable).toBe(true);
    expect(err.code).toBe('CIRCUIT_BREAKER_OPEN');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('includes field information', () => {
    const err = new ValidationError('invalid symbol', 'symbol');
    expect(err.field).toBe('symbol');
    expect(err.message).toBe('invalid symbol');
    expect(err.recoverable).toBe(false);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('handleError', () => {
  it('does not throw', () => {
    expect(() => handleError(new Error('boom'))).not.toThrow();
    expect(() => handleError('string error')).not.toThrow();
    expect(() => handleError(null)).not.toThrow();
  });
});

describe('isAppError', () => {
  it('returns true for AppError instances', () => {
    expect(isAppError(new AppError('x', 'X'))).toBe(true);
    expect(isAppError(new NetworkError('x', '/u'))).toBe(true);
  });

  it('returns false for plain errors', () => {
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError('string')).toBe(false);
  });
});

describe('toAppError', () => {
  it('wraps plain Error into AppError', () => {
    const result = toAppError(new Error('plain'));
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('plain');
  });

  it('passes through AppError unchanged', () => {
    const original = new AppError('orig', 'CODE');
    expect(toAppError(original)).toBe(original);
  });

  it('wraps non-error values', () => {
    const result = toAppError('string error');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('string error');
  });
});
