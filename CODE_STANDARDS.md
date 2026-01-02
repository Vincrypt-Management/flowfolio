# Code Standards & Best Practices

This document defines coding standards for FlowFolio based on QA audit findings. Follow these guidelines to maintain code quality and prevent regressions.

---

## Table of Contents

1. [TypeScript Guidelines](#typescript-guidelines)
2. [React Patterns](#react-patterns)
3. [Error Handling](#error-handling)
4. [API & Data Fetching](#api--data-fetching)
5. [Security Practices](#security-practices)
6. [Logging](#logging)
7. [Testing Requirements](#testing-requirements)

---

## TypeScript Guidelines

### Avoid `any` Type

```typescript
// BAD - Loses type safety
function processData(data: any): any {
  return data.value;
}

// GOOD - Explicit types
interface DataItem {
  value: number;
  label: string;
}

function processData(data: DataItem): number {
  return data.value;
}
```

### Use Type Guards

```typescript
// BAD - Unchecked type assertion
const result = response as ApiResponse;

// GOOD - Runtime type checking
function isApiResponse(obj: unknown): obj is ApiResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'data' in obj &&
    'status' in obj
  );
}

if (isApiResponse(response)) {
  // TypeScript knows response is ApiResponse here
  console.log(response.data);
}
```

### Prefer Interfaces for Objects

```typescript
// GOOD - Use interface for object shapes
interface PortfolioHolding {
  symbol: string;
  shares: number;
  currentPrice: number;
  costBasis: number;
}

// GOOD - Use type for unions/primitives
type RebalanceCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';
```

### Generic Functions

```typescript
// GOOD - Type-safe generic function
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Usage
const data = safeJsonParse<UserConfig>(stored, defaultConfig);
```

---

## React Patterns

### State Management

**For Simple Components (1-3 states):**
```typescript
const [isLoading, setIsLoading] = useState(false);
```

**For Complex Components (4+ related states):**
```typescript
// GOOD - Use useReducer for related state
interface DashboardState {
  isLoading: boolean;
  error: string | null;
  data: DashboardData | null;
  lastUpdated: Date | null;
}

type DashboardAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DashboardData }
  | { type: 'FETCH_ERROR'; payload: string };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, isLoading: false, data: action.payload, lastUpdated: new Date() };
    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.payload };
  }
}
```

### Memoization

```typescript
// GOOD - Memoize expensive computations
const portfolioMetrics = useMemo(() => {
  return calculateMetrics(holdings, prices);
}, [holdings, prices]);

// GOOD - Memoize callbacks passed to children
const handleSymbolChange = useCallback((symbol: string) => {
  setSelectedSymbol(symbol);
}, []);

// GOOD - Memoize components that receive objects/arrays as props
const MemoizedChart = React.memo(ChartComponent);
```

### Effect Cleanup

```typescript
// GOOD - Cleanup subscriptions and timers
useEffect(() => {
  const controller = new AbortController();

  fetchData(controller.signal);

  return () => {
    controller.abort();
  };
}, [dependency]);
```

---

## Error Handling

### Never Use alert()

```typescript
// BAD - Blocks UI, poor UX
catch (error) {
  alert("Error: " + error);
}

// GOOD - Use toast notifications
catch (error) {
  toast.error(getErrorMessage(error));
}
```

### Typed Error Handling

```typescript
// BAD - Generic catch
catch (error) {
  console.error(error);
}

// GOOD - Type-narrowed catch
catch (error) {
  if (error instanceof NetworkError) {
    // Handle network-specific error
    retry();
  } else if (error instanceof ValidationError) {
    // Handle validation error
    showValidationMessage(error.field, error.message);
  } else {
    // Unknown error
    logger.error('Unexpected error', { error: getErrorMessage(error) });
  }
}
```

### Error Message Extraction

```typescript
// Utility function for safe error message extraction
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}
```

### Safe JSON Parsing

```typescript
// ALWAYS wrap JSON.parse in try-catch
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    logger.warn('JSON parse failed', { json: json.substring(0, 100) });
    return fallback;
  }
}

// Usage
const cached = safeJsonParse<CacheEntry>(stored, { data: null, timestamp: 0 });
```

---

## API & Data Fetching

### Use the Resilient API Client

```typescript
// BAD - Direct Tauri invoke without resilience
const data = await invoke('get_market_data', { symbols });

// GOOD - Use the resilient client with circuit breaker
import { invokeWithResilience } from '../core/api/client';

const data = await invokeWithResilience('get_market_data', { symbols });
```

### Validate API Responses

```typescript
// BAD - Assume response structure
const price = response.data.quote.price;

// GOOD - Validate before accessing
interface QuoteResponse {
  data?: {
    quote?: {
      price?: number;
    };
  };
}

function isValidQuoteResponse(response: unknown): response is QuoteResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response
  );
}

const price = isValidQuoteResponse(response)
  ? response.data?.quote?.price ?? 0
  : 0;
```

### Request Cancellation

```typescript
// GOOD - Cancel in-flight requests on unmount
useEffect(() => {
  const controller = new AbortController();

  async function fetchData() {
    try {
      const response = await fetch(url, { signal: controller.signal });
      setData(await response.json());
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      throw error;
    }
  }

  fetchData();
  return () => controller.abort();
}, [url]);
```

---

## Security Practices

### Never Expose API Keys in Frontend

```typescript
// BAD - Key in frontend code
const apiKey = import.meta.env.VITE_API_KEY;
await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });

// GOOD - Proxy through Tauri backend
await invoke('fetch_market_data', { symbols });
// Backend handles API key securely
```

### Environment Variables

```bash
# Frontend-safe (embedded in bundle, public)
VITE_APP_NAME=FlowFolio
VITE_DEFAULT_THEME=dark

# Backend-only (NEVER prefix with VITE_)
OPENROUTER_API_KEY=secret
ALPACA_API_SECRET=secret
```

### Sanitize Error Logs

```typescript
// BAD - Logs sensitive data
console.error('API Error:', {
  headers: error.response.headers,  // May contain auth tokens
  config: error.config              // Contains API keys
});

// GOOD - Log only safe information
console.error('API Error:', {
  status: error.response?.status,
  message: error.message,
  endpoint: sanitizeUrl(error.config?.url)
});
```

### Input Validation

```typescript
// Validate stock symbols
const SYMBOL_REGEX = /^[A-Z]{1,5}$/;

function isValidSymbol(symbol: string): boolean {
  return SYMBOL_REGEX.test(symbol.toUpperCase());
}

// Validate numeric inputs
function isValidPercentage(value: number): boolean {
  return !isNaN(value) && value >= 0 && value <= 100;
}

// Validate allocations sum to 100%
function isValidAllocation(allocations: number[]): boolean {
  const sum = allocations.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) < 0.01;  // Allow floating point tolerance
}
```

---

## Logging

### Use the Logger, Not Console

```typescript
// BAD - Direct console usage
console.log('Fetching data...');
console.error('Failed:', error);

// GOOD - Use centralized logger
import { logger } from '../core/logger';

logger.debug('Fetching data', { symbols });
logger.error('Fetch failed', { error: getErrorMessage(error) });
```

### Logger Implementation

```typescript
// src/core/logger/frontend.ts
const isDev = import.meta.env.DEV;

export const logger = {
  debug: (message: string, context?: object) => {
    if (isDev) console.log(`[DEBUG] ${message}`, context ?? '');
  },

  info: (message: string, context?: object) => {
    if (isDev) console.info(`[INFO] ${message}`, context ?? '');
  },

  warn: (message: string, context?: object) => {
    console.warn(`[WARN] ${message}`, context ?? '');
  },

  error: (message: string, context?: object) => {
    console.error(`[ERROR] ${message}`, context ?? '');
  },
};
```

### Logging Levels

| Level | When to Use | Production |
|-------|-------------|------------|
| `debug` | Verbose debugging info | Disabled |
| `info` | Operational milestones | Disabled |
| `warn` | Recoverable issues | Enabled |
| `error` | Failures requiring attention | Enabled |

---

## Testing Requirements

### What Must Be Tested

1. **Financial Calculations** - All functions in `shared/utils/calculations.ts`
2. **API Client** - Circuit breaker, retry logic, deduplication
3. **Data Parsing** - JSON parsing, API response validation
4. **Input Validation** - Symbol validation, numeric ranges

### Test Structure

```typescript
// src/shared/utils/calculations.test.ts
import { describe, it, expect } from 'vitest';
import { rsi, sma, macd } from './calculations';

describe('RSI calculation', () => {
  it('returns 50 for flat prices', () => {
    const prices = Array(20).fill(100);
    expect(rsi(prices, 14)).toBe(50);
  });

  it('returns >70 for strong uptrend', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    expect(rsi(prices, 14)).toBeGreaterThan(70);
  });

  it('returns <30 for strong downtrend', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
    expect(rsi(prices, 14)).toBeLessThan(30);
  });

  it('handles empty array', () => {
    expect(rsi([], 14)).toBe(50);  // or throws, document expected behavior
  });
});
```

### Minimum Coverage Targets

| Category | Target |
|----------|--------|
| Financial calculations | 90% |
| API client | 80% |
| Utility functions | 80% |
| React components | 60% |

---

## Code Review Checklist

Before merging any PR, verify:

- [ ] No `any` types introduced (or justified in comments)
- [ ] No `console.log/warn/error` (use logger instead)
- [ ] No `alert()` calls (use toast notifications)
- [ ] All `JSON.parse` wrapped in try-catch
- [ ] No API keys in frontend code
- [ ] Input validation for user inputs
- [ ] Tests added for new functionality
- [ ] TypeScript compiles without errors (`npm run lint`)

---

*Last updated: January 2, 2026*
