import {
  formatCurrency,
  formatCompact,
  formatPercent,
  formatNumber,
  formatDate,
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
  retry,
  debounce,
  throttle,
  isValidSymbol,
  isValidEmail,
  isNumeric,
} from '../../shared/utils/index';

// ============================================================================
// Formatting
// ============================================================================

describe('formatCurrency', () => {
  it('formats positive values', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative values', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500.00');
  });
});

describe('formatCompact', () => {
  it('formats thousands', () => {
    expect(formatCompact(1500)).toBe('1.5K');
  });

  it('formats millions', () => {
    expect(formatCompact(1000000)).toBe('1M');
  });

  it('formats billions', () => {
    expect(formatCompact(1000000000)).toBe('1B');
  });

  it('handles small numbers', () => {
    expect(formatCompact(42)).toBe('42');
  });
});

describe('formatPercent', () => {
  it('formats positive percent with + sign', () => {
    expect(formatPercent(12.34)).toBe('+12.34%');
  });

  it('formats negative percent', () => {
    expect(formatPercent(-5.1)).toBe('-5.10%');
  });

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });
});

describe('formatNumber', () => {
  it('formats with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatDate', () => {
  it('short format', () => {
    const result = formatDate('2024-01-15', 'short');
    expect(result).toContain('2024');
    expect(result).toContain('Jan');
  });

  it('long format', () => {
    const result = formatDate('2024-01-15', 'long');
    expect(result).toContain('January');
    expect(result).toContain('2024');
  });

  it('relative format returns a string', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const result = formatDate(recent, 'relative');
    expect(result).toContain('minute');
  });
});

// ============================================================================
// String utilities
// ============================================================================

describe('truncate', () => {
  it('truncates long strings and adds ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('does not truncate when short enough', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('exact length is not truncated', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('handles single char', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('lowercases the rest', () => {
    expect(capitalize('hELLO')).toBe('Hello');
  });
});

describe('toTitleCase', () => {
  it('converts to title case', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(toTitleCase('foo')).toBe('Foo');
  });
});

describe('slugify', () => {
  it('converts to slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('handles multiple spaces', () => {
    expect(slugify('  foo   bar  ')).toBe('foo-bar');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

// ============================================================================
// Array utilities
// ============================================================================

describe('chunk', () => {
  it('chunks array into groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('handles empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('handles chunk size > array length', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});

describe('unique', () => {
  it('removes duplicates', () => {
    expect(unique([1, 2, 2, 3, 3])).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    expect(unique([])).toEqual([]);
  });

  it('handles strings', () => {
    expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('groupBy', () => {
  it('groups array items by key', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ];
    const result = groupBy(items, 'type');
    expect(result['a']).toHaveLength(2);
    expect(result['b']).toHaveLength(1);
  });
});

describe('sortBy', () => {
  const items = [
    { name: 'c', age: 3 },
    { name: 'a', age: 1 },
    { name: 'b', age: 2 },
  ];

  it('sorts ascending', () => {
    const result = sortBy(items, 'name', 'asc');
    expect(result.map((i) => i.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending', () => {
    const result = sortBy(items, 'age', 'desc');
    expect(result.map((i) => i.age)).toEqual([3, 2, 1]);
  });

  it('does not mutate original', () => {
    sortBy(items, 'name', 'asc');
    expect(items[0].name).toBe('c');
  });
});

// ============================================================================
// Object utilities
// ============================================================================

describe('deepClone', () => {
  it('creates a deep copy', () => {
    const obj = { a: { b: 1 } };
    const cloned = deepClone(obj);
    cloned.a.b = 99;
    expect(obj.a.b).toBe(1);
  });

  it('handles arrays', () => {
    const arr = [1, [2, 3]];
    const cloned = deepClone(arr);
    (cloned[1] as number[])[0] = 99;
    expect((arr[1] as number[])[0]).toBe(2);
  });

  it('handles null', () => {
    expect(deepClone(null)).toBeNull();
  });
});

describe('pick', () => {
  it('picks specified keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores missing keys', () => {
    const result = pick({ a: 1 } as Record<string, number>, ['a', 'z' as never]);
    expect(result).toEqual({ a: 1 });
  });
});

describe('omit', () => {
  it('omits specified keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
  });
});

describe('isEmpty', () => {
  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns false for non-empty object', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });
});

// ============================================================================
// Async utilities
// ============================================================================

describe('sleep', () => {
  it('resolves after approximately the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('retry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3, initialDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on retry', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3, initialDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fails after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(retry(fn, { maxRetries: 2, initialDelay: 1 })).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('debounce', () => {
  it('only calls function once after delay', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();
    await sleep(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  it('limits call frequency', async () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
    await sleep(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Validation utilities
// ============================================================================

describe('isValidSymbol', () => {
  it('accepts valid uppercase symbols', () => {
    expect(isValidSymbol('AAPL')).toBe(true);
    expect(isValidSymbol('A')).toBe(true);
    expect(isValidSymbol('GOOGL')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidSymbol('')).toBe(false);
  });

  it('rejects too-long symbols', () => {
    expect(isValidSymbol('TOOLONG')).toBe(false);
  });

  it('accepts lowercase (uppercased internally)', () => {
    // The implementation calls .toUpperCase() before testing
    expect(isValidSymbol('aapl')).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('test@test.com')).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('@no-local.com')).toBe(false);
  });
});

describe('isNumeric', () => {
  it('returns true for numbers', () => {
    expect(isNumeric(42)).toBe(true);
    expect(isNumeric(0)).toBe(true);
    expect(isNumeric(-3.14)).toBe(true);
  });

  it('returns false for non-numbers', () => {
    expect(isNumeric('42')).toBe(false);
    expect(isNumeric(NaN)).toBe(false);
    expect(isNumeric(Infinity)).toBe(false);
  });
});
