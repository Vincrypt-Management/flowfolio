import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatCurrency,
  formatCompact,
  formatPercent,
  formatNumber,
  formatDate,
  formatRelativeTime,
  truncate,
  capitalize,
  toTitleCase,
  slugify,
  chunk,
  unique,
  groupBy,
  sortBy,
  deepClone,
  pick,
  omit,
  isEmpty,
  sleep,
  debounce,
  throttle,
  isValidSymbol,
  isValidEmail,
  isNumeric,
} from '../../shared/utils/index';

// ============================================================================
// Number Formatting
// ============================================================================

describe('formatCurrency', () => {
  it('formats a positive value with default USD currency', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero as $0.00', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats a negative value and contains the amount', () => {
    const result = formatCurrency(-500.5);
    expect(result).toContain('500.50');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatCurrency(1)).toBe('$1.00');
    expect(formatCurrency(1.1)).toBe('$1.10');
    expect(formatCurrency(1.999)).toBe('$2.00');
  });

  it('accepts a custom currency code', () => {
    const result = formatCurrency(100, 'EUR', 'de-DE');
    expect(result).toContain('100');
  });

  it('formats large values with thousands separators', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });
});

// ============================================================================

describe('formatCompact', () => {
  it('formats thousands with K suffix', () => {
    expect(formatCompact(1500)).toBe('1.5K');
  });

  it('formats exact millions with M suffix', () => {
    expect(formatCompact(1000000)).toBe('1M');
  });

  it('formats billions with B suffix', () => {
    expect(formatCompact(2000000000)).toBe('2B');
  });

  it('handles small numbers without a suffix', () => {
    expect(formatCompact(42)).toBe('42');
  });

  it('handles zero', () => {
    expect(formatCompact(0)).toBe('0');
  });
});

// ============================================================================

describe('formatPercent', () => {
  it('prefixes positive values with a + sign', () => {
    expect(formatPercent(12.34)).toBe('+12.34%');
  });

  it('formats negative values without + sign', () => {
    expect(formatPercent(-5.1)).toBe('-5.10%');
  });

  it('formats zero with + sign', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });

  it('respects custom decimal places', () => {
    expect(formatPercent(7.5, 0)).toBe('+8%');
    expect(formatPercent(7.5, 1)).toBe('+7.5%');
    expect(formatPercent(-3.14159, 3)).toBe('-3.142%');
  });
});

// ============================================================================

describe('formatNumber', () => {
  it('formats large integers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('respects custom decimal places', () => {
    expect(formatNumber(1234.5, 2)).toBe('1,234.50');
  });

  it('rounds to the specified number of decimals', () => {
    expect(formatNumber(1.005, 2)).toBe('1.01');
  });
});

// ============================================================================
// Date Formatting
// ============================================================================

describe('formatDate', () => {
  it('returns short format with abbreviated month and year', () => {
    const result = formatDate('2024-01-15', 'short');
    expect(result).toContain('Jan');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('returns long format with full month name and weekday', () => {
    const result = formatDate('2024-01-15', 'long');
    expect(result).toContain('January');
    expect(result).toContain('2024');
  });

  it('defaults to short format when no format is supplied', () => {
    const result = formatDate('2024-06-01');
    expect(result).toContain('2024');
  });

  it('accepts a Date object as input', () => {
    const date = new Date('2024-03-10');
    const result = formatDate(date, 'short');
    expect(result).toContain('2024');
  });

  it('returns a relative string for the relative format', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatDate(fiveMinutesAgo, 'relative');
    expect(result).toContain('minute');
  });
});

// ============================================================================

describe('formatRelativeTime', () => {
  it('returns "just now" for dates within the last 60 seconds', () => {
    const recentDate = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(recentDate)).toBe('just now');
  });

  it('returns singular "minute" for exactly 1 minute ago', () => {
    const oneMinuteAgo = new Date(Date.now() - 61 * 1000);
    expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
  });

  it('returns plural "minutes" for several minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
  });

  it('returns singular "hour" for exactly 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns plural "hours" for several hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
  });

  it('returns singular "day" for exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
  });

  it('returns plural "days" for several days within a week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
  });

  it('falls back to short date format for dates older than 7 days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(tenDaysAgo);
    // Should be formatted as a short date, not relative text
    expect(result).not.toContain('day');
    expect(result).not.toContain('ago');
  });
});

// ============================================================================
// String Utilities
// ============================================================================

describe('truncate', () => {
  it('truncates a long string and appends ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('does not truncate a string that fits within maxLength', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('does not truncate a string whose length is exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('handles a string that is exactly one character over the limit', () => {
    // 'hello!!' has length 7, maxLength=6, so slice(0,3) + '...' = 'hel...'
    expect(truncate('hello!!', 6)).toBe('hel...');
  });

  it('handles an empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

// ============================================================================

describe('capitalize', () => {
  it('capitalizes the first letter and lowercases the rest', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('lowercases an all-caps string except the first letter', () => {
    expect(capitalize('hELLO')).toBe('Hello');
  });

  it('handles a single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles an empty string without throwing', () => {
    expect(capitalize('')).toBe('');
  });
});

// ============================================================================

describe('toTitleCase', () => {
  it('capitalizes the first letter of every word', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });

  it('handles a single word', () => {
    expect(toTitleCase('foo')).toBe('Foo');
  });

  it('handles mixed case input', () => {
    expect(toTitleCase('the QUICK brown FOX')).toBe('The Quick Brown Fox');
  });

  it('handles an empty string', () => {
    expect(toTitleCase('')).toBe('');
  });
});

// ============================================================================

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(slugify('  foo   bar  ')).toBe('foo-bar');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('handles an empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles a string with only special characters', () => {
    expect(slugify('!!!')).toBe('');
  });
});

// ============================================================================
// Array Utilities
// ============================================================================

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size is larger than the array', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('returns individual element arrays when size is 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('works with string arrays', () => {
    expect(chunk(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

// ============================================================================

describe('unique', () => {
  it('removes duplicate numbers', () => {
    expect(unique([1, 2, 2, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('returns the same array when all elements are already unique', () => {
    expect(unique([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it('preserves insertion order', () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });
});

// ============================================================================

describe('groupBy', () => {
  it('groups items by the specified string key', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ];
    const result = groupBy(items, 'type');
    expect(result['a']).toHaveLength(2);
    expect(result['b']).toHaveLength(1);
  });

  it('groups items by a numeric key (coerced to string)', () => {
    const items = [
      { score: 1, label: 'x' },
      { score: 2, label: 'y' },
      { score: 1, label: 'z' },
    ];
    const result = groupBy(items, 'score');
    expect(result['1']).toHaveLength(2);
    expect(result['2']).toHaveLength(1);
  });

  it('returns an empty object for an empty array', () => {
    expect(groupBy([], 'type' as never)).toEqual({});
  });
});

// ============================================================================

describe('sortBy', () => {
  const items = [
    { name: 'c', age: 30 },
    { name: 'a', age: 10 },
    { name: 'b', age: 20 },
  ];

  it('sorts strings ascending by default', () => {
    const result = sortBy(items, 'name');
    expect(result.map((i) => i.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts strings ascending explicitly', () => {
    const result = sortBy(items, 'name', 'asc');
    expect(result.map((i) => i.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts numbers descending', () => {
    const result = sortBy(items, 'age', 'desc');
    expect(result.map((i) => i.age)).toEqual([30, 20, 10]);
  });

  it('does not mutate the original array', () => {
    sortBy(items, 'name', 'asc');
    expect(items[0].name).toBe('c');
  });

  it('returns a new array reference', () => {
    const result = sortBy(items, 'age');
    expect(result).not.toBe(items);
  });
});

// ============================================================================
// Object Utilities
// ============================================================================

describe('deepClone', () => {
  it('creates an independent deep copy of a nested object', () => {
    const original = { a: { b: 1 } };
    const cloned = deepClone(original);
    cloned.a.b = 99;
    expect(original.a.b).toBe(1);
  });

  it('creates an independent deep copy of a nested array', () => {
    const original = [1, [2, 3]] as [number, number[]];
    const cloned = deepClone(original);
    cloned[1][0] = 99;
    expect(original[1][0]).toBe(2);
  });

  it('handles null without throwing', () => {
    expect(deepClone(null)).toBeNull();
  });

  it('clones primitive values as-is', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(true)).toBe(true);
  });

  it('clones an array of objects deeply', () => {
    const original = [{ x: 1 }, { x: 2 }];
    const cloned = deepClone(original);
    cloned[0].x = 99;
    expect(original[0].x).toBe(1);
  });
});

// ============================================================================

describe('pick', () => {
  it('returns only the specified keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('returns an empty object when given an empty keys array', () => {
    expect(pick({ a: 1, b: 2 }, [])).toEqual({});
  });

  it('silently ignores keys that are not present on the object', () => {
    const obj = { a: 1 } as { a: number; z?: number };
    const result = pick(obj, ['a', 'z' as keyof typeof obj]);
    expect(result).toEqual({ a: 1 });
  });

  it('picks a single key', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ b: 2 });
  });
});

// ============================================================================

describe('omit', () => {
  it('removes the specified keys from the object', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('removes multiple keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ b: 2 });
  });

  it('returns the original shape when keys array is empty', () => {
    expect(omit({ a: 1, b: 2 }, [])).toEqual({ a: 1, b: 2 });
  });

  it('does not mutate the original object', () => {
    const original = { a: 1, b: 2, c: 3 };
    omit(original, ['b']);
    expect(original).toEqual({ a: 1, b: 2, c: 3 });
  });
});

// ============================================================================

describe('isEmpty', () => {
  it('returns true for an empty object literal', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns false for an object with at least one key', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it('returns false for an object with undefined values', () => {
    expect(isEmpty({ key: undefined })).toBe(false);
  });
});

// ============================================================================
// Async Utilities — fake timers
// ============================================================================

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay using fake timers', async () => {
    let resolved = false;
    sleep(100).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(true);
  });

  it('does not resolve before the delay has elapsed', async () => {
    let resolved = false;
    sleep(200).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });
});

// ============================================================================

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the function before the delay has elapsed', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function once after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on each call — only fires once after the last invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the most recent arguments to the underlying function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('second');
  });

  it('can fire multiple times when calls are spaced beyond the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the function immediately on the first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores subsequent calls within the throttle window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows a new call after the throttle window expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not allow a new call before the throttle window expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(99);
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Validation Utilities
// ============================================================================

describe('isValidSymbol', () => {
  it('accepts a single uppercase letter', () => {
    expect(isValidSymbol('A')).toBe(true);
  });

  it('accepts standard 4-letter ticker symbols', () => {
    expect(isValidSymbol('AAPL')).toBe(true);
    expect(isValidSymbol('MSFT')).toBe(true);
  });

  it('accepts the maximum 5-letter symbol', () => {
    expect(isValidSymbol('GOOGL')).toBe(true);
  });

  it('accepts lowercase input by uppercasing internally', () => {
    expect(isValidSymbol('aapl')).toBe(true);
    expect(isValidSymbol('googl')).toBe(true);
  });

  it('rejects symbols longer than 5 characters', () => {
    expect(isValidSymbol('TOOLONG')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidSymbol('')).toBe(false);
  });

  it('rejects symbols containing digits', () => {
    expect(isValidSymbol('AAP1')).toBe(false);
  });

  it('rejects symbols containing special characters', () => {
    expect(isValidSymbol('AA.PL')).toBe(false);
  });
});

// ============================================================================

describe('isValidEmail', () => {
  it('accepts a simple valid email address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts an email with subdomain', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
  });

  it('accepts an email with plus sign in the local part', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects a string without @', () => {
    expect(isValidEmail('invalid')).toBe(false);
  });

  it('rejects a string missing the local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects a string missing the domain TLD', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects an email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

// ============================================================================

describe('isNumeric', () => {
  it('returns true for a positive integer', () => {
    expect(isNumeric(42)).toBe(true);
  });

  it('returns true for zero', () => {
    expect(isNumeric(0)).toBe(true);
  });

  it('returns true for a negative float', () => {
    expect(isNumeric(-3.14)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isNumeric(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isNumeric(Infinity)).toBe(false);
    expect(isNumeric(-Infinity)).toBe(false);
  });

  it('returns false for a numeric string', () => {
    expect(isNumeric('42')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNumeric(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNumeric(undefined)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isNumeric(true)).toBe(false);
    expect(isNumeric(false)).toBe(false);
  });
});
