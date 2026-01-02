// Core Error Handling
// Structured error types for the frontend application

// ============ Error Classes ============

export class AppError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly retryAfterMs?: number;
  public readonly context?: Record<string, unknown>;
  public readonly errorCause?: Error;

  constructor(
    message: string,
    code: string,
    options: {
      recoverable?: boolean;
      retryAfterMs?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.context = options.context;
    this.errorCause = options.cause;
  }

  toApiError() {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

export class NetworkError extends AppError {
  public readonly url: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    url: string,
    options: {
      statusCode?: number;
      cause?: Error;
    } = {}
  ) {
    const recoverable = isRecoverableStatus(options.statusCode);
    super(message, 'NETWORK_ERROR', {
      recoverable,
      retryAfterMs: recoverable ? 5000 : undefined,
      context: { url, statusCode: options.statusCode },
      cause: options.cause,
    });
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = options.statusCode;
  }
}

export class RateLimitError extends AppError {
  public readonly provider: string;

  constructor(provider: string, retryAfterMs: number = 60000) {
    super(`Rate limit exceeded for ${provider}`, 'RATE_LIMIT_ERROR', {
      recoverable: true,
      retryAfterMs,
      context: { provider },
    });
    this.name = 'RateLimitError';
    this.provider = provider;
  }
}

export class CacheError extends AppError {
  public readonly cacheType: 'memory' | 'indexeddb' | 'localstorage';

  constructor(
    message: string,
    cacheType: 'memory' | 'indexeddb' | 'localstorage',
    cause?: Error
  ) {
    super(message, 'CACHE_ERROR', {
      recoverable: true,
      context: { cacheType },
      cause,
    });
    this.name = 'CacheError';
    this.cacheType = cacheType;
  }
}

export class CircuitBreakerError extends AppError {
  public readonly serviceName: string;

  constructor(serviceName: string) {
    super(`Circuit breaker open for ${serviceName}`, 'CIRCUIT_BREAKER_OPEN', {
      recoverable: true,
      retryAfterMs: 30000,
      context: { serviceName },
    });
    this.name = 'CircuitBreakerError';
    this.serviceName = serviceName;
  }
}

export class ValidationError extends AppError {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message, 'VALIDATION_ERROR', {
      recoverable: false,
      context: { field },
    });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} '${resourceId}' not found`, 'NOT_FOUND', {
      recoverable: false,
      context: { resourceType, resourceId },
    });
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

// ============ Helper Functions ============

function isRecoverableStatus(statusCode?: number): boolean {
  if (!statusCode) return true;
  return [429, 500, 502, 503, 504].includes(statusCode);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR', {
      recoverable: false,
      cause: error,
    });
  }

  return new AppError(String(error), 'UNKNOWN_ERROR', {
    recoverable: false,
  });
}

// ============ Error Handler ============

export type ErrorHandler = (error: AppError) => void;

let globalErrorHandler: ErrorHandler | null = null;

export function setGlobalErrorHandler(handler: ErrorHandler): void {
  globalErrorHandler = handler;
}

export function handleError(error: unknown): void {
  const appError = toAppError(error);
  
  // Log to console in development
  if (import.meta.env.DEV) {
    console.error('[AppError]', {
      code: appError.code,
      message: appError.message,
      recoverable: appError.recoverable,
      context: appError.context,
    });
  }

  // Call global handler if set
  if (globalErrorHandler) {
    globalErrorHandler(appError);
  }
}
