import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Hoisted mock variables (vi.hoisted runs before vi.mock factories) ---
const {
  mockUnsubscribe,
  mockOnReportGenerated,
  mockGetQueueStatus,
  mockGeneratePortfolioReport,
  mockGenerateTickerReport,
  mockGenerateOptimizationReport,
  mockGenerateRiskReport,
  mockConfigureAutoGeneration,
  mockTriggerAutoReport,
  mockQueueReport,
  mockExportToMarkdown,
  mockExportToJSON,
} = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  return {
    mockUnsubscribe,
    mockOnReportGenerated: vi.fn().mockReturnValue(mockUnsubscribe),
    mockGetQueueStatus: vi.fn().mockReturnValue({ pending: 0, processing: 0, completed: 0, failed: 0 }),
    mockGeneratePortfolioReport: vi.fn(),
    mockGenerateTickerReport: vi.fn(),
    mockGenerateOptimizationReport: vi.fn(),
    mockGenerateRiskReport: vi.fn(),
    mockConfigureAutoGeneration: vi.fn(),
    mockTriggerAutoReport: vi.fn(),
    mockQueueReport: vi.fn().mockReturnValue('queue_id_123'),
    mockExportToMarkdown: vi.fn().mockReturnValue('# Mock Report'),
    mockExportToJSON: vi.fn().mockReturnValue('{"id":"r1"}'),
  };
});

vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../../services/analysisReport', () => ({
  analysisReportService: {
    onReportGenerated: mockOnReportGenerated,
    getQueueStatus: mockGetQueueStatus,
    generatePortfolioReport: mockGeneratePortfolioReport,
    generateTickerReport: mockGenerateTickerReport,
    generateOptimizationReport: mockGenerateOptimizationReport,
    generateRiskReport: mockGenerateRiskReport,
    configureAutoGeneration: mockConfigureAutoGeneration,
    triggerAutoReport: mockTriggerAutoReport,
    queueReport: mockQueueReport,
    exportToMarkdown: mockExportToMarkdown,
    exportToJSON: mockExportToJSON,
  },
}));

vi.mock('../../services/portfolioAgent', () => ({}));

// --- Imports after mocks ---
import { useAnalysisReport } from '../../hooks/useAnalysisReport';
import type { AnalysisReport } from '../../services/analysisReport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: 'report_001',
    type: 'portfolio_analysis',
    title: 'Test Portfolio Report',
    generatedAt: new Date().toISOString(),
    executiveSummary: 'Strong portfolio.',
    sections: [],
    keyTakeaways: ['Diversified', 'Low volatility'],
    actionItems: [],
    riskWarnings: [],
    marketContext: 'Bull market',
    disclaimer: 'Not financial advice.',
    metadata: {
      dataAsOf: new Date().toISOString(),
      analysisDepth: 'standard',
      confidence: 0.85,
      generationTimeMs: 1200,
    },
    ...overrides,
  };
}

const mockPortfolio = {
  title: 'Test Portfolio',
  description: 'A sample portfolio',
  strategy: 'Growth',
  riskLevel: 'Medium' as const,
  timeHorizon: '5 years',
  holdings: [],
  expectedReturn: 0.12,
  expectedVolatility: 0.18,
  sharpeRatio: 0.67,
};

const mockTickerData = {
  symbol: 'AAPL',
  currentPrice: 175.5,
};

const mockOptimizationData = {
  portfolioName: 'Test Portfolio',
  currentHealthScore: 70,
  projectedHealthScore: 85,
  holdings: [],
  dropRecommendations: [],
  replacementOptions: [],
};

// Helper: start an async generation, advance the 100ms internal timer, await completion.
// This two-act split is required: the timer must be created BEFORE we advance time.
async function runGeneration(
  resultRef: { current: ReturnType<typeof useAnalysisReport> },
  genFn: () => Promise<void>,
) {
  let p!: Promise<void>;
  act(() => {
    p = genFn();
  });
  await act(async () => {
    vi.advanceTimersByTime(200);
    await p;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAnalysisReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Default: onReportGenerated returns a no-op unsubscribe
    mockOnReportGenerated.mockReturnValue(mockUnsubscribe);
    mockGetQueueStatus.mockReturnValue({ pending: 0, processing: 0, completed: 0, failed: 0 });
    mockQueueReport.mockReturnValue('queue_id_123');
    mockExportToMarkdown.mockReturnValue('# Mock Report');
    mockExportToJSON.mockReturnValue('{"id":"r1"}');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Initial state
  // -------------------------------------------------------------------------
  it('returns correct initial state', () => {
    const { result } = renderHook(() => useAnalysisReport());

    expect(result.current.report).toBeNull();
    expect(result.current.reports).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe('');
    expect(result.current.queueStatus).toEqual({ pending: 0, processing: 0, completed: 0, failed: 0 });
  });

  // -------------------------------------------------------------------------
  // 2. Subscribes to event listeners on mount and unsubscribes on unmount
  // -------------------------------------------------------------------------
  it('subscribes to all 5 event types on mount', () => {
    const { unmount } = renderHook(() => useAnalysisReport());

    const expectedEventTypes = [
      'portfolio_created',
      'optimization_complete',
      'ticker_analyzed',
      'significant_change',
      'scheduled',
    ];

    const calledWith = mockOnReportGenerated.mock.calls.map((c: unknown[]) => c[0]);
    expect(calledWith).toEqual(expect.arrayContaining(expectedEventTypes));
    expect(mockOnReportGenerated).toHaveBeenCalledTimes(5);

    unmount();
  });

  it('calls all unsubscribe functions when unmounted', () => {
    const unsubA = vi.fn();
    const unsubB = vi.fn();
    const unsubC = vi.fn();
    const unsubD = vi.fn();
    const unsubE = vi.fn();
    const unsubs = [unsubA, unsubB, unsubC, unsubD, unsubE];
    let callCount = 0;
    mockOnReportGenerated.mockImplementation(() => unsubs[callCount++]);

    const { unmount } = renderHook(() => useAnalysisReport());
    unmount();

    [unsubA, unsubB, unsubC, unsubD, unsubE].forEach(fn => {
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // 3. generatePortfolioReport — happy path
  // -------------------------------------------------------------------------
  it('sets isLoading, then resolves with report added to history', async () => {
    const report = makeReport();
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    // Start generation (isLoading becomes true synchronously)
    let p!: Promise<void>;
    act(() => {
      p = result.current.generatePortfolioReport(mockPortfolio);
    });

    expect(result.current.isLoading).toBe(true);

    // Advance past the 100ms UI-settle delay inside the hook, then await completion
    await act(async () => {
      vi.advanceTimersByTime(200);
      await p;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.report).toEqual(report);
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toEqual(report);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe('');
  });

  // -------------------------------------------------------------------------
  // 4. generatePortfolioReport — error path
  // -------------------------------------------------------------------------
  it('captures error message when generatePortfolioReport rejects', async () => {
    mockGeneratePortfolioReport.mockRejectedValue(new Error('LLM unavailable'));

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('LLM unavailable');
    expect(result.current.report).toBeNull();
    expect(result.current.progress).toBe('');
  });

  // -------------------------------------------------------------------------
  // 5. generateTickerReport
  // -------------------------------------------------------------------------
  it('generates a ticker report and appends it to history', async () => {
    const report = makeReport({ id: 'ticker_001', type: 'ticker_deep_dive' });
    mockGenerateTickerReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generateTickerReport(mockTickerData));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.report?.type).toBe('ticker_deep_dive');
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. generateOptimizationReport
  // -------------------------------------------------------------------------
  it('generates an optimization report and appends it to history', async () => {
    const report = makeReport({ id: 'opt_001', type: 'optimization_report' });
    mockGenerateOptimizationReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generateOptimizationReport(mockOptimizationData));

    expect(result.current.report?.type).toBe('optimization_report');
    expect(result.current.reports).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 7. generateRiskReport
  // -------------------------------------------------------------------------
  it('generates a risk report and appends it to history', async () => {
    const report = makeReport({ id: 'risk_001', type: 'risk_assessment' });
    mockGenerateRiskReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generateRiskReport(mockPortfolio));

    expect(result.current.report?.type).toBe('risk_assessment');
    expect(result.current.reports).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 8. Queue status polling while isLoading
  // -------------------------------------------------------------------------
  it('polls queue status every 1 second while isLoading is true', async () => {
    // Start generation, advance past 100ms delay so hook calls the never-resolving mock
    let p!: Promise<void>;
    mockGetQueueStatus.mockReturnValue({ pending: 2, processing: 1, completed: 0, failed: 0 });

    const { result } = renderHook(() => useAnalysisReport());

    // Set up mock AFTER renderHook so the never-resolving promise is in place
    mockGeneratePortfolioReport.mockReturnValue(new Promise(() => {}));

    act(() => {
      p = result.current.generatePortfolioReport(mockPortfolio);
    });

    // isLoading is true from the synchronous setIsLoading(true) call
    expect(result.current.isLoading).toBe(true);

    // Advance past the 100ms internal delay so isLoading effect runs the interval
    await act(async () => {
      vi.advanceTimersByTime(100);
      // Allow any microtasks to flush (p is still pending)
      await Promise.resolve();
    });

    // Before any interval tick
    const callsBefore = mockGetQueueStatus.mock.calls.length;

    // Advance 1 second — interval fires once
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockGetQueueStatus.mock.calls.length).toBe(callsBefore + 1);

    // Advance another second
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockGetQueueStatus.mock.calls.length).toBe(callsBefore + 2);

    expect(result.current.queueStatus).toEqual({ pending: 2, processing: 1, completed: 0, failed: 0 });
  });

  // -------------------------------------------------------------------------
  // 9. triggerAutoReport — when service returns a report
  // -------------------------------------------------------------------------
  it('adds report from triggerAutoReport to history', async () => {
    const report = makeReport({ id: 'auto_001' });
    mockTriggerAutoReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await act(async () => {
      await result.current.triggerAutoReport({ type: 'portfolio_created', portfolio: mockPortfolio });
    });

    expect(result.current.report).toEqual(report);
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles triggerAutoReport returning null (auto-gen disabled)', async () => {
    mockTriggerAutoReport.mockResolvedValue(null);

    const { result } = renderHook(() => useAnalysisReport());

    await act(async () => {
      await result.current.triggerAutoReport({ type: 'portfolio_created', portfolio: mockPortfolio });
    });

    expect(result.current.report).toBeNull();
    expect(result.current.reports).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. queueReport delegates to service
  // -------------------------------------------------------------------------
  it('queueReport returns the id from service', () => {
    const { result } = renderHook(() => useAnalysisReport());

    let id: string;
    act(() => {
      id = result.current.queueReport(
        { type: 'portfolio_created', portfolio: mockPortfolio },
        'high'
      );
    });

    expect(mockQueueReport).toHaveBeenCalledWith(
      { type: 'portfolio_created', portfolio: mockPortfolio },
      'high'
    );
    expect(id!).toBe('queue_id_123');
  });

  // -------------------------------------------------------------------------
  // 11. exportMarkdown / exportJSON
  // -------------------------------------------------------------------------
  it('exportMarkdown returns null when no report is set', () => {
    const { result } = renderHook(() => useAnalysisReport());
    expect(result.current.exportMarkdown()).toBeNull();
  });

  it('exportMarkdown calls service after report is loaded', async () => {
    const report = makeReport();
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    act(() => {
      const md = result.current.exportMarkdown();
      expect(mockExportToMarkdown).toHaveBeenCalledWith(report);
      expect(md).toBe('# Mock Report');
    });
  });

  it('exportJSON returns null when no report is set', () => {
    const { result } = renderHook(() => useAnalysisReport());
    expect(result.current.exportJSON()).toBeNull();
  });

  it('exportJSON calls service after report is loaded', async () => {
    const report = makeReport();
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    act(() => {
      const json = result.current.exportJSON();
      expect(mockExportToJSON).toHaveBeenCalledWith(report);
      expect(json).toBe('{"id":"r1"}');
    });
  });

  // -------------------------------------------------------------------------
  // 12. exportAllReportsMarkdown
  // -------------------------------------------------------------------------
  it('exportAllReportsMarkdown returns placeholder when reports array is empty', () => {
    const { result } = renderHook(() => useAnalysisReport());
    expect(result.current.exportAllReportsMarkdown()).toBe('# No Reports Generated\n');
  });

  it('exportAllReportsMarkdown combines all reports after multiple generations', async () => {
    const r1 = makeReport({ id: 'r1', title: 'Report 1' });
    const r2 = makeReport({ id: 'r2', title: 'Report 2' });
    mockGeneratePortfolioReport
      .mockResolvedValueOnce(r1)
      .mockResolvedValueOnce(r2);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));
    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio, 'basic'));

    const combined = result.current.exportAllReportsMarkdown();
    expect(combined).toContain('# Analysis Reports Collection');
    expect(combined).toContain('2 reports generated');
    expect(mockExportToMarkdown).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 13. clearReport / clearAllReports
  // -------------------------------------------------------------------------
  it('clearReport resets report, error and progress but keeps history', async () => {
    const report = makeReport();
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    act(() => {
      result.current.clearReport();
    });

    expect(result.current.report).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe('');
    // History should still contain the report
    expect(result.current.reports).toHaveLength(1);
  });

  it('clearAllReports resets everything including history', async () => {
    const report = makeReport();
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    act(() => {
      result.current.clearAllReports();
    });

    expect(result.current.report).toBeNull();
    expect(result.current.reports).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBe('');
  });

  // -------------------------------------------------------------------------
  // 14. selectReport
  // -------------------------------------------------------------------------
  it('selectReport switches the active report by id', async () => {
    const r1 = makeReport({ id: 'r1', title: 'First' });
    const r2 = makeReport({ id: 'r2', title: 'Second' });
    mockGeneratePortfolioReport
      .mockResolvedValueOnce(r1)
      .mockResolvedValueOnce(r2);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));
    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    // Most recent (r2) is active; select the older one
    act(() => {
      result.current.selectReport('r1');
    });

    expect(result.current.report?.id).toBe('r1');
  });

  it('selectReport does nothing when given an unknown id', async () => {
    const report = makeReport({ id: 'r1' });
    mockGeneratePortfolioReport.mockResolvedValue(report);

    const { result } = renderHook(() => useAnalysisReport());

    await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));

    act(() => {
      result.current.selectReport('does_not_exist');
    });

    // Active report should remain unchanged
    expect(result.current.report?.id).toBe('r1');
  });

  // -------------------------------------------------------------------------
  // 15. Auto-generated reports via event subscription callback
  // -------------------------------------------------------------------------
  it('updates report and history when an auto-generated report arrives via event', () => {
    // Capture the callback registered for 'portfolio_created'
    let capturedCallback: ((report: AnalysisReport) => void) | null = null;
    mockOnReportGenerated.mockImplementation((eventType: string, cb: (r: AnalysisReport) => void) => {
      if (eventType === 'portfolio_created') {
        capturedCallback = cb;
      }
      return mockUnsubscribe;
    });

    const { result } = renderHook(() => useAnalysisReport());

    expect(capturedCallback).not.toBeNull();

    const autoReport = makeReport({ id: 'auto_event_001' });

    act(() => {
      capturedCallback!(autoReport);
    });

    expect(result.current.report).toEqual(autoReport);
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toEqual(autoReport);
  });

  // -------------------------------------------------------------------------
  // 16. configureAutoGeneration delegates to service
  // -------------------------------------------------------------------------
  it('configureAutoGeneration passes config to service', () => {
    const { result } = renderHook(() => useAnalysisReport());

    act(() => {
      result.current.configureAutoGeneration({ enabled: true, depth: 'comprehensive' });
    });

    expect(mockConfigureAutoGeneration).toHaveBeenCalledWith({ enabled: true, depth: 'comprehensive' });
  });

  // -------------------------------------------------------------------------
  // 17. Reports history is capped at 20 entries
  // -------------------------------------------------------------------------
  it('caps report history at 20 items', async () => {
    const reports = Array.from({ length: 22 }, (_, i) =>
      makeReport({ id: `r${i}`, title: `Report ${i}` })
    );

    let callIndex = 0;
    mockGeneratePortfolioReport.mockImplementation(async () => reports[callIndex++]);

    const { result } = renderHook(() => useAnalysisReport());

    for (let i = 0; i < 22; i++) {
      await runGeneration(result, () => result.current.generatePortfolioReport(mockPortfolio));
    }

    expect(result.current.reports.length).toBeLessThanOrEqual(20);
  });
});
