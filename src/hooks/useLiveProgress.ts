// Live Progress Hook for Tauri Events
// Provides real-time updates during long-running operations

import { useState, useEffect, useCallback, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Progress event types matching Rust structs
export interface ProgressDetail {
  symbol?: string;
  provider?: string;
  metric?: string;
  value?: number;
}

export interface ProgressEventStarted {
  type: "Started";
  data: {
    operation_id: string;
    operation_type: string;
    total_steps?: number;
    message: string;
  };
}

export interface ProgressEventProgress {
  type: "Progress";
  data: {
    operation_id: string;
    current_step: number;
    total_steps?: number;
    percentage: number;
    message: string;
    detail?: ProgressDetail;
  };
}

export interface ProgressEventRetry {
  type: "Retry";
  data: {
    operation_id: string;
    attempt: number;
    max_attempts: number;
    error: string;
    next_retry_ms: number;
  };
}

export interface ProgressEventPartialResult {
  type: "PartialResult";
  data: {
    operation_id: string;
    result_type: string;
    data: unknown;
  };
}

export interface ProgressEventCompleted {
  type: "Completed";
  data: {
    operation_id: string;
    success: boolean;
    message: string;
    duration_ms: number;
  };
}

export interface ProgressEventError {
  type: "Error";
  data: {
    operation_id: string;
    error: string;
    recoverable: boolean;
  };
}

export type ProgressEvent =
  | ProgressEventStarted
  | ProgressEventProgress
  | ProgressEventRetry
  | ProgressEventPartialResult
  | ProgressEventCompleted
  | ProgressEventError;

// Processed partial results by type
export interface PartialResults {
  holding_metrics: Map<string, HoldingMetricPartial>;
  candidate_metrics: Map<string, CandidateMetricPartial>;
}

export interface HoldingMetricPartial {
  symbol: string;
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  signal: string;
}

export interface CandidateMetricPartial {
  symbol: string;
  sharpe_ratio: number;
  annualized_return: number;
  volatility: number;
  signal: string;
  score: number;
}

// Retry state
export interface RetryState {
  symbol?: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  nextRetryMs: number;
}

// Progress state
export interface ProgressState {
  isActive: boolean;
  operationId: string | null;
  operationType: string | null;
  currentStep: number;
  totalSteps: number | null;
  percentage: number;
  message: string;
  currentSymbol: string | null;
  retryState: RetryState | null;
  errors: string[];
  partialResults: PartialResults;
  startTime: number | null;
  endTime: number | null;
  success: boolean | null;
}

const initialState: ProgressState = {
  isActive: false,
  operationId: null,
  operationType: null,
  currentStep: 0,
  totalSteps: null,
  percentage: 0,
  message: "",
  currentSymbol: null,
  retryState: null,
  errors: [],
  partialResults: {
    holding_metrics: new Map(),
    candidate_metrics: new Map(),
  },
  startTime: null,
  endTime: null,
  success: null,
};

export function useLiveProgress(eventName: string = "optimization_progress") {
  const [progress, setProgress] = useState<ProgressState>(initialState);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const reset = useCallback(() => {
    setProgress({
      ...initialState,
      partialResults: {
        holding_metrics: new Map(),
        candidate_metrics: new Map(),
      },
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      try {
        unlistenRef.current = await listen<ProgressEvent>(eventName, (event) => {
          if (!mounted) return;

          const payload = event.payload;
          
          setProgress((prev) => {
            switch (payload.type) {
              case "Started":
                return {
                  ...initialState,
                  isActive: true,
                  operationId: payload.data.operation_id,
                  operationType: payload.data.operation_type,
                  totalSteps: payload.data.total_steps ?? null,
                  message: payload.data.message,
                  startTime: Date.now(),
                  partialResults: {
                    holding_metrics: new Map(),
                    candidate_metrics: new Map(),
                  },
                };

              case "Progress":
                return {
                  ...prev,
                  currentStep: payload.data.current_step,
                  totalSteps: payload.data.total_steps ?? prev.totalSteps,
                  percentage: payload.data.percentage,
                  message: payload.data.message,
                  currentSymbol: payload.data.detail?.symbol ?? prev.currentSymbol,
                  retryState: null, // Clear retry state on progress
                };

              case "Retry":
                return {
                  ...prev,
                  retryState: {
                    symbol: prev.currentSymbol ?? undefined,
                    attempt: payload.data.attempt,
                    maxAttempts: payload.data.max_attempts,
                    error: payload.data.error,
                    nextRetryMs: payload.data.next_retry_ms,
                  },
                  message: `Retrying ${prev.currentSymbol ?? "operation"} (attempt ${payload.data.attempt}/${payload.data.max_attempts})...`,
                };

              case "PartialResult": {
                const newPartialResults = { ...prev.partialResults };
                const resultData = payload.data.data as Record<string, unknown>;

                if (payload.data.result_type === "holding_metrics") {
                  const metric: HoldingMetricPartial = {
                    symbol: resultData.symbol as string,
                    sharpe_ratio: resultData.sharpe_ratio as number,
                    annualized_return: resultData.annualized_return as number,
                    volatility: resultData.volatility as number,
                    signal: resultData.signal as string,
                  };
                  newPartialResults.holding_metrics = new Map(prev.partialResults.holding_metrics);
                  newPartialResults.holding_metrics.set(metric.symbol, metric);
                } else if (payload.data.result_type === "candidate_metrics") {
                  const metric: CandidateMetricPartial = {
                    symbol: resultData.symbol as string,
                    sharpe_ratio: resultData.sharpe_ratio as number,
                    annualized_return: resultData.annualized_return as number,
                    volatility: resultData.volatility as number,
                    signal: resultData.signal as string,
                    score: resultData.score as number,
                  };
                  newPartialResults.candidate_metrics = new Map(prev.partialResults.candidate_metrics);
                  newPartialResults.candidate_metrics.set(metric.symbol, metric);
                }

                return {
                  ...prev,
                  partialResults: newPartialResults,
                };
              }

              case "Completed":
                return {
                  ...prev,
                  isActive: false,
                  percentage: 100,
                  message: payload.data.message,
                  success: payload.data.success,
                  endTime: Date.now(),
                  retryState: null,
                };

              case "Error":
                return {
                  ...prev,
                  errors: [...prev.errors, payload.data.error],
                  ...(payload.data.recoverable
                    ? {}
                    : {
                        isActive: false,
                        success: false,
                        endTime: Date.now(),
                      }),
                };

              default:
                return prev;
            }
          });
        });
      } catch (error) {
        console.error("Failed to setup progress listener:", error);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [eventName]);

  return { progress, reset };
}

// Format duration in human-readable format
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// Calculate ETA based on progress
export function calculateETA(
  currentStep: number,
  totalSteps: number | null,
  startTime: number | null
): string | null {
  if (!totalSteps || !startTime || currentStep === 0) return null;
  
  const elapsed = Date.now() - startTime;
  const rate = currentStep / elapsed;
  const remaining = (totalSteps - currentStep) / rate;
  
  return formatDuration(remaining);
}

export default useLiveProgress;
