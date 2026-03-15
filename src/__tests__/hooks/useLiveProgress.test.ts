import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

// Capture the event listener callback so tests can fire events manually
type ListenerCallback = (event: { payload: unknown }) => void;

const mockUnlisten = vi.fn();
let capturedEventName = '';
let capturedCallback: ListenerCallback | null = null;

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation(
    (eventName: string, callback: ListenerCallback) => {
      capturedEventName = eventName;
      capturedCallback = callback;
      return Promise.resolve(mockUnlisten);
    }
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {
  useLiveProgress,
  formatDuration,
  calculateETA,
  type ProgressEvent,
} from '../../hooks/useLiveProgress';
import { listen } from '@tauri-apps/api/event';

// ---------------------------------------------------------------------------
// Helper: fire a Tauri event into the hook
// ---------------------------------------------------------------------------
function fireEvent(payload: ProgressEvent): void {
  if (!capturedCallback) throw new Error('Event listener not yet set up');
  act(() => {
    capturedCallback!({ payload });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLiveProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventName = '';
    capturedCallback = null;

    // Default: listen resolves immediately with the unlisten stub
    vi.mocked(listen).mockImplementation(
      (eventName: string, callback: ListenerCallback) => {
        capturedEventName = eventName;
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Initial state
  // -------------------------------------------------------------------------
  it('returns correct initial state', async () => {
    const { result } = renderHook(() => useLiveProgress());

    // Allow the async setupListener to run
    await act(async () => {});

    const { progress } = result.current;
    expect(progress.isActive).toBe(false);
    expect(progress.operationId).toBeNull();
    expect(progress.operationType).toBeNull();
    expect(progress.currentStep).toBe(0);
    expect(progress.totalSteps).toBeNull();
    expect(progress.percentage).toBe(0);
    expect(progress.message).toBe('');
    expect(progress.currentSymbol).toBeNull();
    expect(progress.retryState).toBeNull();
    expect(progress.errors).toEqual([]);
    expect(progress.startTime).toBeNull();
    expect(progress.endTime).toBeNull();
    expect(progress.success).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Registers listener with the supplied event name
  // -------------------------------------------------------------------------
  it('registers a Tauri listener for the default event name', async () => {
    renderHook(() => useLiveProgress());
    await act(async () => {});

    expect(listen).toHaveBeenCalledWith('optimization_progress', expect.any(Function));
  });

  it('registers listener using a custom event name', async () => {
    renderHook(() => useLiveProgress('my_custom_event'));
    await act(async () => {});

    expect(capturedEventName).toBe('my_custom_event');
  });

  // -------------------------------------------------------------------------
  // 3. Unlisten is called on unmount
  // -------------------------------------------------------------------------
  it('calls unlisten when unmounted', async () => {
    const { unmount } = renderHook(() => useLiveProgress());
    await act(async () => {});

    unmount();
    expect(mockUnlisten).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 4. "Started" event
  // -------------------------------------------------------------------------
  it('transitions to active state on Started event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: {
        operation_id: 'op_001',
        operation_type: 'portfolio_optimization',
        total_steps: 10,
        message: 'Starting optimization…',
      },
    });

    const { progress } = result.current;
    expect(progress.isActive).toBe(true);
    expect(progress.operationId).toBe('op_001');
    expect(progress.operationType).toBe('portfolio_optimization');
    expect(progress.totalSteps).toBe(10);
    expect(progress.message).toBe('Starting optimization…');
    expect(progress.startTime).toBeTypeOf('number');
    expect(progress.partialResults.holding_metrics.size).toBe(0);
    expect(progress.partialResults.candidate_metrics.size).toBe(0);
  });

  it('resets previous state when a new Started event arrives', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    // First operation
    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'First op' },
    });

    // Accumulate some state
    fireEvent({
      type: 'Progress',
      data: {
        operation_id: 'op_001',
        current_step: 3,
        percentage: 30,
        message: 'Step 3',
      },
    });

    // Second operation resets
    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_002', operation_type: 'new_op', message: 'Second op' },
    });

    expect(result.current.progress.currentStep).toBe(0);
    expect(result.current.progress.percentage).toBe(0);
    expect(result.current.progress.operationId).toBe('op_002');
  });

  // -------------------------------------------------------------------------
  // 5. "Progress" event
  // -------------------------------------------------------------------------
  it('updates step, percentage, message and currentSymbol on Progress event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });

    fireEvent({
      type: 'Progress',
      data: {
        operation_id: 'op_001',
        current_step: 5,
        total_steps: 20,
        percentage: 25,
        message: 'Fetching AAPL…',
        detail: { symbol: 'AAPL', provider: 'finnhub' },
      },
    });

    const { progress } = result.current;
    expect(progress.currentStep).toBe(5);
    expect(progress.totalSteps).toBe(20);
    expect(progress.percentage).toBe(25);
    expect(progress.message).toBe('Fetching AAPL…');
    expect(progress.currentSymbol).toBe('AAPL');
    expect(progress.retryState).toBeNull(); // cleared on progress
  });

  // -------------------------------------------------------------------------
  // 6. "Retry" event
  // -------------------------------------------------------------------------
  it('sets retryState and updates message on Retry event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });

    fireEvent({
      type: 'Progress',
      data: {
        operation_id: 'op_001',
        current_step: 2,
        percentage: 20,
        message: 'Fetching TSLA…',
        detail: { symbol: 'TSLA' },
      },
    });

    fireEvent({
      type: 'Retry',
      data: {
        operation_id: 'op_001',
        attempt: 2,
        max_attempts: 3,
        error: 'Rate limit exceeded',
        next_retry_ms: 1500,
      },
    });

    const { progress } = result.current;
    expect(progress.retryState).not.toBeNull();
    expect(progress.retryState?.attempt).toBe(2);
    expect(progress.retryState?.maxAttempts).toBe(3);
    expect(progress.retryState?.error).toBe('Rate limit exceeded');
    expect(progress.retryState?.nextRetryMs).toBe(1500);
    expect(progress.retryState?.symbol).toBe('TSLA');
    expect(progress.message).toContain('Retrying TSLA');
    expect(progress.message).toContain('2/3');
  });

  it('clears retryState after a subsequent Progress event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'a', message: 'Begin' },
    });
    fireEvent({
      type: 'Retry',
      data: { operation_id: 'op_001', attempt: 1, max_attempts: 3, error: 'err', next_retry_ms: 500 },
    });
    expect(result.current.progress.retryState).not.toBeNull();

    fireEvent({
      type: 'Progress',
      data: { operation_id: 'op_001', current_step: 3, percentage: 30, message: 'Resumed' },
    });
    expect(result.current.progress.retryState).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 7. "PartialResult" event — holding_metrics
  // -------------------------------------------------------------------------
  it('accumulates holding_metrics partial results keyed by symbol', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });

    fireEvent({
      type: 'PartialResult',
      data: {
        operation_id: 'op_001',
        result_type: 'holding_metrics',
        data: {
          symbol: 'AAPL',
          sharpe_ratio: 1.2,
          annualized_return: 0.15,
          volatility: 0.18,
          signal: 'BUY',
        },
      },
    });

    const metrics = result.current.progress.partialResults.holding_metrics;
    expect(metrics.has('AAPL')).toBe(true);
    expect(metrics.get('AAPL')?.sharpe_ratio).toBe(1.2);
    expect(metrics.get('AAPL')?.signal).toBe('BUY');
  });

  // -------------------------------------------------------------------------
  // 8. "PartialResult" event — candidate_metrics
  // -------------------------------------------------------------------------
  it('accumulates candidate_metrics partial results keyed by symbol', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });

    fireEvent({
      type: 'PartialResult',
      data: {
        operation_id: 'op_001',
        result_type: 'candidate_metrics',
        data: {
          symbol: 'NVDA',
          sharpe_ratio: 1.8,
          annualized_return: 0.32,
          volatility: 0.28,
          signal: 'STRONG_BUY',
          score: 92,
        },
      },
    });

    const candidates = result.current.progress.partialResults.candidate_metrics;
    expect(candidates.has('NVDA')).toBe(true);
    expect(candidates.get('NVDA')?.score).toBe(92);
  });

  it('merges multiple PartialResult events without overwriting others', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });

    const symbols = ['AAPL', 'MSFT', 'GOOG'];
    symbols.forEach(sym => {
      fireEvent({
        type: 'PartialResult',
        data: {
          operation_id: 'op_001',
          result_type: 'holding_metrics',
          data: { symbol: sym, sharpe_ratio: 1.0, annualized_return: 0.1, volatility: 0.2, signal: 'HOLD' },
        },
      });
    });

    const metrics = result.current.progress.partialResults.holding_metrics;
    expect(metrics.size).toBe(3);
    symbols.forEach(sym => expect(metrics.has(sym)).toBe(true));
  });

  // -------------------------------------------------------------------------
  // 9. "Completed" event
  // -------------------------------------------------------------------------
  it('marks operation as completed with success on Completed event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Completed',
      data: {
        operation_id: 'op_001',
        success: true,
        message: 'Optimization finished.',
        duration_ms: 4800,
      },
    });

    const { progress } = result.current;
    expect(progress.isActive).toBe(false);
    expect(progress.percentage).toBe(100);
    expect(progress.success).toBe(true);
    expect(progress.message).toBe('Optimization finished.');
    expect(progress.endTime).toBeTypeOf('number');
    expect(progress.retryState).toBeNull();
  });

  it('marks operation as failed on Completed event with success=false', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Completed',
      data: { operation_id: 'op_001', success: false, message: 'Partial failure.', duration_ms: 2000 },
    });

    expect(result.current.progress.success).toBe(false);
    expect(result.current.progress.isActive).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. "Error" event — non-recoverable
  // -------------------------------------------------------------------------
  it('deactivates and records error on non-recoverable Error event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Error',
      data: { operation_id: 'op_001', error: 'Network timeout', recoverable: false },
    });

    const { progress } = result.current;
    expect(progress.errors).toContain('Network timeout');
    expect(progress.isActive).toBe(false);
    expect(progress.success).toBe(false);
    expect(progress.endTime).toBeTypeOf('number');
  });

  // -------------------------------------------------------------------------
  // 11. "Error" event — recoverable
  // -------------------------------------------------------------------------
  it('keeps operation active and records error on recoverable Error event', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Error',
      data: { operation_id: 'op_001', error: 'Temporary rate limit', recoverable: true },
    });

    const { progress } = result.current;
    expect(progress.errors).toContain('Temporary rate limit');
    expect(progress.isActive).toBe(true); // still active
    expect(progress.success).toBeNull();  // not yet decided
    expect(progress.endTime).toBeNull();  // operation hasn't ended
  });

  it('accumulates multiple recoverable errors', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Error',
      data: { operation_id: 'op_001', error: 'Error 1', recoverable: true },
    });
    fireEvent({
      type: 'Error',
      data: { operation_id: 'op_001', error: 'Error 2', recoverable: true },
    });

    expect(result.current.progress.errors).toHaveLength(2);
    expect(result.current.progress.errors).toEqual(['Error 1', 'Error 2']);
  });

  // -------------------------------------------------------------------------
  // 12. reset() restores initial state
  // -------------------------------------------------------------------------
  it('reset() restores initial state after an active operation', async () => {
    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    fireEvent({
      type: 'Started',
      data: { operation_id: 'op_001', operation_type: 'analysis', message: 'Begin' },
    });
    fireEvent({
      type: 'Progress',
      data: { operation_id: 'op_001', current_step: 7, percentage: 70, message: 'Step 7' },
    });

    act(() => {
      result.current.reset();
    });

    const { progress } = result.current;
    expect(progress.isActive).toBe(false);
    expect(progress.currentStep).toBe(0);
    expect(progress.percentage).toBe(0);
    expect(progress.message).toBe('');
    expect(progress.errors).toEqual([]);
    expect(progress.partialResults.holding_metrics.size).toBe(0);
    expect(progress.partialResults.candidate_metrics.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 13. Re-mounts use a fresh listener when eventName changes
  // -------------------------------------------------------------------------
  it('re-registers listener when eventName prop changes', async () => {
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useLiveProgress(name),
      { initialProps: { name: 'event_a' } }
    );
    await act(async () => {});
    expect(capturedEventName).toBe('event_a');

    rerender({ name: 'event_b' });
    await act(async () => {});
    expect(capturedEventName).toBe('event_b');
    // Previous listener was cleaned up
    expect(mockUnlisten).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 14. listen failure is handled gracefully (no crash)
  // -------------------------------------------------------------------------
  it('handles listen rejection without crashing', async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error('Tauri not available'));

    const { result } = renderHook(() => useLiveProgress());
    await act(async () => {});

    // Hook should still return an object with the initial progress state
    expect(result.current.progress.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDuration utility
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('returns ms for durations under 1 second', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('returns seconds for durations between 1s and 60s', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(5500)).toBe('5.5s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('returns minutes and seconds for durations over 60s', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

// ---------------------------------------------------------------------------
// calculateETA utility
// ---------------------------------------------------------------------------
describe('calculateETA', () => {
  it('returns null when totalSteps is null', () => {
    expect(calculateETA(5, null, Date.now() - 5000)).toBeNull();
  });

  it('returns null when startTime is null', () => {
    expect(calculateETA(5, 10, null)).toBeNull();
  });

  it('returns null when currentStep is 0 (avoid division by zero)', () => {
    expect(calculateETA(0, 10, Date.now() - 1000)).toBeNull();
  });

  it('returns a formatted ETA string when progress is underway', () => {
    const startTime = Date.now() - 5000; // started 5 seconds ago
    const result = calculateETA(5, 10, startTime); // 50% done in 5s → ~5s remaining
    expect(result).toBeTypeOf('string');
    expect(result!.length).toBeGreaterThan(0);
  });
});
