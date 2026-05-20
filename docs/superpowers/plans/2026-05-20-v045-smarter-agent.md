# 0.4.5 "Smarter Agent" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land end-to-end token streaming for AI responses in the UI and add three new "Ask AI" surfaces (Backtest, VibeStudio, RiskDashboard) backed by pure prompt builders.

**Architecture:** React hook (`useAiStream`) wraps the existing Tauri `ai_chat_stream` command and its `ai-token` events. A module-level `aiStreamCoordinator` enforces single-stream-at-a-time. `AiInlinePanel` is the shared presentation component. Pure functions in `agentSurfaces.ts` build prompts from each tab's existing data. Zero new Rust code.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, Tauri 2 (`invoke`, `listen` from `@tauri-apps/api`).

**Spec:** `docs/superpowers/specs/2026-05-20-v045-smarter-agent-design.md`

---

## Context

**What already exists:**
- Backend `ai_chat_stream` command in `src-tauri/src/api/commands/ai.rs:101` — emits `ai-token` events with content payload, returns full concatenated response. Already works.
- Frontend `openrouter.ts` `chatStream` method (line ~100) — **broken**: claims to stream but just calls non-streaming `chat()` and yields the whole string in one chunk.
- Tier-gated AI: every AI command requires `tier == "ai" || tier == "pro"`. `get_user_tier()` defaults to `"pro"` when DB is empty, so this isn't a blocker today.
- `src/hooks/` has 6 hooks; `useAnalysisReport.ts` uses `listen` for a similar event pattern — use as reference but don't copy.

**Type shape reality:**
- `BacktestTab.tsx` has its own local `BacktestResult` interface (line 38). It reflects the Rust struct: `start_date, end_date, duration_months, metrics: {cagr, total_return, max_drawdown, volatility, sharpe_ratio, turnover, num_trades, final_value, total_invested}, timeline, trades, summary`.
- `shared/types/index.ts:223` has a DIFFERENT, idealized `BacktestResult` (camelCase) — DO NOT use it; it's not what the component renders.
- `VibePlan` in `shared/types/index.ts:74` is also idealized — does not match the Rust `VibePlanScript`. Use the actual shape that VibeStudio holds in state (inspect it before writing `buildVibePlanPrompt`).
- `RiskDashboard.tsx` has local `QuantMetrics` and `SymbolMetrics`, no shared risk type. The builder takes a narrow record of what the dashboard already has on screen.

**Strategy:** each prompt builder declares its own narrow input type close to what its consuming component already has. No type consolidation in this plan — that's a separate refactor.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/hooks/aiStreamCoordinator.ts` | Create | Module-level singleton: single concurrent stream. |
| `src/hooks/useAiStream.ts` | Create | React hook: invoke + listen + state machine. |
| `src/components/AiInlinePanel.tsx` | Create | UI shell: trigger, output, states. |
| `src/services/agentSurfaces.ts` | Create | Three pure prompt builders. |
| `src/__tests__/hooks/aiStreamCoordinator.test.ts` | Create | Coordinator tests. |
| `src/__tests__/hooks/useAiStream.test.tsx` | Create | Hook tests (RTL + mocked Tauri APIs). |
| `src/__tests__/components/AiInlinePanel.test.tsx` | Create | Panel tests. |
| `src/__tests__/services/agentSurfaces.test.ts` | Create | Builder tests. |
| `src/BacktestTab.tsx` | Modify | Add `<AiInlinePanel />` below results. |
| `src/components/VibeStudio.tsx` | Modify | Add `<AiInlinePanel />` below compiled plan. |
| `src/components/RiskDashboard.tsx` | Modify | Add `<AiInlinePanel />` below risk metrics. |
| `src/services/openrouter.ts` | Modify | Rewrite `chatStream` to actually stream. |
| `vitest.config.ts` | Modify | Extend coverage thresholds to cover `agentSurfaces.ts`. |

---

## Task 1: Stream coordinator

**Files:**
- Create: `src/hooks/aiStreamCoordinator.ts`
- Create: `src/__tests__/hooks/aiStreamCoordinator.test.ts`

- [ ] **Step 1: Write the failing test file**

`src/__tests__/hooks/aiStreamCoordinator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claim, release, _resetForTests } from '../../hooks/aiStreamCoordinator';

describe('aiStreamCoordinator', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('claim with no active stream stores the new stop fn (no cancel)', () => {
    const stopA = vi.fn();
    claim(stopA);
    expect(stopA).not.toHaveBeenCalled();
  });

  it('claim while another is active cancels the prior one', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    claim(stopB);
    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).not.toHaveBeenCalled();
  });

  it('claim with the same stop fn does not cancel itself', () => {
    const stopA = vi.fn();
    claim(stopA);
    claim(stopA);
    expect(stopA).not.toHaveBeenCalled();
  });

  it('release of the active stop clears the slot', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    release(stopA);
    claim(stopB);
    expect(stopA).not.toHaveBeenCalled();
    expect(stopB).not.toHaveBeenCalled();
  });

  it('release of a non-active stop is a no-op', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claim(stopA);
    release(stopB);
    // stopA is still the active one — claiming again should cancel it
    const stopC = vi.fn();
    claim(stopC);
    expect(stopA).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails (module does not exist)**

```bash
npx vitest run src/__tests__/hooks/aiStreamCoordinator.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../hooks/aiStreamCoordinator'`.

- [ ] **Step 3: Implement the coordinator**

`src/hooks/aiStreamCoordinator.ts`:

```typescript
let activeStop: (() => void) | null = null;

export function claim(stop: () => void): void {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}

export function release(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}

/** Test-only: reset module state between tests. Not exported from index. */
export function _resetForTests(): void {
  activeStop = null;
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
npx vitest run src/__tests__/hooks/aiStreamCoordinator.test.ts 2>&1 | tail -5
```

Expected: `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/aiStreamCoordinator.ts src/__tests__/hooks/aiStreamCoordinator.test.ts
git commit -m "feat(ai): add aiStreamCoordinator for single-stream policy"
```

---

## Task 2: `useAiStream` hook

**Files:**
- Create: `src/hooks/useAiStream.ts`
- Create: `src/__tests__/hooks/useAiStream.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/__tests__/hooks/useAiStream.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAiStream } from '../../hooks/useAiStream';
import { _resetForTests as resetCoord } from '../../hooks/aiStreamCoordinator';

// Mock Tauri APIs
const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

interface FakeListener {
  fire: (payload: string) => void;
  unlisten: ReturnType<typeof vi.fn>;
}

function setupListener(): FakeListener {
  const unlisten = vi.fn();
  let handler: ((evt: { payload: string }) => void) | null = null;
  listenMock.mockImplementation(async (_name: string, cb: typeof handler) => {
    handler = cb;
    return unlisten;
  });
  return {
    fire: (payload) => handler?.({ payload }),
    unlisten,
  };
}

describe('useAiStream', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    resetCoord();
  });

  it('starts in idle phase', () => {
    const { result } = renderHook(() => useAiStream());
    expect(result.current.state.phase).toBe('idle');
  });

  it('transitions idle → streaming → done, accumulating tokens', async () => {
    const listener = setupListener();
    let resolveInvoke!: (v: string) => void;
    invokeMock.mockImplementation(
      () => new Promise<string>((res) => { resolveInvoke = res; })
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await Promise.resolve(); // allow listen() to install
      const startPromise = result.current.start('hello');
      await waitFor(() => expect(result.current.state.phase).toBe('streaming'));
      listener.fire('Hello ');
      listener.fire('world.');
      resolveInvoke('Hello world.');
      await startPromise;
    });

    expect(result.current.state.phase).toBe('done');
    if (result.current.state.phase === 'done') {
      expect(result.current.state.tokens).toBe('Hello world.');
    }
  });

  it('flips to error phase when invoke rejects, keeping partial tokens', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(async () => {
      // Simulate a short stream before failure
      listener.fire('partial ');
      throw new Error('boom');
    });

    const { result } = renderHook(() => useAiStream());
    await act(async () => {
      await result.current.start('p');
    });

    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase === 'error') {
      expect(result.current.state.error).toContain('boom');
      expect(result.current.state.tokens).toContain('partial');
    }
  });

  it('stop() returns hook to idle and unsubscribes', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(() => new Promise<string>(() => { /* never resolves */ }));

    const { result } = renderHook(() => useAiStream());
    await act(async () => {
      void result.current.start('p');
      await waitFor(() => expect(result.current.state.phase).toBe('streaming'));
      result.current.stop();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(listener.unlisten).toHaveBeenCalled();
  });

  it('unmount during streaming calls unlisten', async () => {
    const listener = setupListener();
    invokeMock.mockImplementation(() => new Promise<string>(() => {}));

    const { result, unmount } = renderHook(() => useAiStream());
    await act(async () => {
      void result.current.start('p');
      await waitFor(() => expect(result.current.state.phase).toBe('streaming'));
    });
    unmount();
    expect(listener.unlisten).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails (module missing)**

```bash
npx vitest run src/__tests__/hooks/useAiStream.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../hooks/useAiStream'`.

- [ ] **Step 3: Implement the hook**

`src/hooks/useAiStream.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { claim, release } from './aiStreamCoordinator';

export type AiStreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; tokens: string }
  | { phase: 'done'; tokens: string }
  | { phase: 'error'; tokens: string; error: string };

export interface UseAiStreamReturn {
  state: AiStreamState;
  start: (prompt: string) => Promise<void>;
  stop: () => void;
}

export function useAiStream(): UseAiStreamReturn {
  const [state, setState] = useState<AiStreamState>({ phase: 'idle' });
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const cancelledRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    cancelledRef.current = true;
    unlistenRef.current?.();
    unlistenRef.current = null;
    release(stopRef.current);
    setState({ phase: 'idle' });
  }, []);

  // Keep the ref pointing at the latest stop closure (stable identity for coordinator).
  stopRef.current = stop;

  const start = useCallback(async (prompt: string) => {
    cancelledRef.current = false;
    claim(stopRef.current);
    setState({ phase: 'streaming', tokens: '' });

    unlistenRef.current = await listen<string>('ai-token', (event) => {
      if (cancelledRef.current) return;
      setState((prev) =>
        prev.phase === 'streaming'
          ? { phase: 'streaming', tokens: prev.tokens + event.payload }
          : prev,
      );
    });

    try {
      await invoke('ai_chat_stream', {
        messages: [{ role: 'user', content: prompt }],
      });
      if (!cancelledRef.current) {
        setState((prev) =>
          prev.phase === 'streaming'
            ? { phase: 'done', tokens: prev.tokens }
            : { phase: 'done', tokens: '' },
        );
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setState((prev) => ({
          phase: 'error',
          tokens: prev.phase === 'streaming' ? prev.tokens : '',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      release(stopRef.current);
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
      release(stopRef.current);
    };
  }, []);

  return { state, start, stop };
}
```

- [ ] **Step 4: Run the test, confirm pass**

```bash
npx vitest run src/__tests__/hooks/useAiStream.test.tsx 2>&1 | tail -8
```

Expected: `Tests  5 passed (5)`. If any test fails, read the error carefully — most likely the listener mock setup needs to install before the listener is consulted; adjust by yielding control via `await Promise.resolve()`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAiStream.ts src/__tests__/hooks/useAiStream.test.tsx
git commit -m "feat(ai): add useAiStream hook wired to ai_chat_stream + ai-token events"
```

---

## Task 3: `AiInlinePanel` component

**Files:**
- Create: `src/components/AiInlinePanel.tsx`
- Create: `src/__tests__/components/AiInlinePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/__tests__/components/AiInlinePanel.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiInlinePanel } from '../../components/AiInlinePanel';

const invokeMock = vi.fn();
const listenMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

describe('AiInlinePanel', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn()); // default: noop unlisten
  });

  it('renders the default trigger label', () => {
    render(<AiInlinePanel prompt="hello" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });

  it('honors a custom trigger label', () => {
    render(<AiInlinePanel prompt="hello" triggerLabel="Explain this" />);
    expect(screen.getByRole('button', { name: /explain this/i })).toBeInTheDocument();
  });

  it('shows empty hint when in idle phase', () => {
    render(<AiInlinePanel prompt="hello" emptyHint="Click to learn more" />);
    expect(screen.getByText(/click to learn more/i)).toBeInTheDocument();
  });

  it('disables the trigger when disabled prop is true', () => {
    render(<AiInlinePanel prompt="hello" disabled />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeDisabled();
  });

  it('disables the trigger when prompt is empty string', () => {
    render(<AiInlinePanel prompt="" />);
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeDisabled();
  });

  it('invokes ai_chat_stream with the prompt on click', () => {
    invokeMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AiInlinePanel prompt="explain backtest" />);
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_chat_stream',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'explain backtest' }],
      }),
    );
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npx vitest run src/__tests__/components/AiInlinePanel.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement the component**

`src/components/AiInlinePanel.tsx`:

```tsx
import { useAiStream } from '../hooks/useAiStream';

interface AiInlinePanelProps {
  prompt: string;
  triggerLabel?: string;
  disabled?: boolean;
  emptyHint?: string;
}

export function AiInlinePanel({
  prompt,
  triggerLabel = 'Ask AI',
  disabled = false,
  emptyHint,
}: AiInlinePanelProps) {
  const { state, start, stop } = useAiStream();
  const isStreaming = state.phase === 'streaming';
  const hasOutput = state.phase === 'streaming' || state.phase === 'done';
  const isError = state.phase === 'error';
  const triggerDisabled = disabled || prompt.length === 0;

  const buttonLabel =
    state.phase === 'done' || state.phase === 'error' ? 'Ask Again' : triggerLabel;

  return (
    <section className="ai-inline-panel" aria-live="polite">
      <header className="ai-inline-panel__header">
        {isStreaming ? (
          <button
            type="button"
            onClick={stop}
            className="ai-inline-panel__stop"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => start(prompt)}
            disabled={triggerDisabled}
            className="ai-inline-panel__trigger"
          >
            {buttonLabel}
          </button>
        )}
      </header>

      {state.phase === 'idle' && emptyHint && (
        <p className="ai-inline-panel__hint muted">{emptyHint}</p>
      )}

      {hasOutput && (
        <pre className="ai-inline-panel__output">{state.tokens}</pre>
      )}

      {isError && (
        <div className="ai-inline-panel__error">
          <p>AI request failed: {state.error}</p>
          {state.tokens && (
            <pre className="ai-inline-panel__partial muted">{state.tokens}</pre>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/__tests__/components/AiInlinePanel.test.tsx 2>&1 | tail -8
```

Expected: `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add src/components/AiInlinePanel.tsx src/__tests__/components/AiInlinePanel.test.tsx
git commit -m "feat(ai): add AiInlinePanel component with streaming state machine"
```

---

## Task 4: `agentSurfaces.ts` prompt builders

**Files:**
- Create: `src/services/agentSurfaces.ts`
- Create: `src/__tests__/services/agentSurfaces.test.ts`

Each builder declares its own narrow input type. The shapes mirror what each component already passes around — DO NOT use `shared/types/index.ts` `BacktestResult` (it's a different/idealized shape).

- [ ] **Step 1: Write the failing test**

`src/__tests__/services/agentSurfaces.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildBacktestPrompt,
  buildVibePlanPrompt,
  buildRiskPrompt,
  type BacktestInput,
  type VibePlanInput,
  type RiskInput,
} from '../../services/agentSurfaces';

describe('buildBacktestPrompt', () => {
  const sample: BacktestInput = {
    start_date: '2020-01-01',
    end_date: '2024-01-01',
    duration_months: 48,
    metrics: {
      cagr: 8.4,
      total_return: 38.2,
      max_drawdown: 12.1,
      volatility: 14.5,
      sharpe_ratio: 0.91,
      turnover: 22.0,
      num_trades: 47,
      final_value: 138_200,
      total_invested: 100_000,
    },
  };

  it('includes the period and duration', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('2020-01-01');
    expect(p).toContain('2024-01-01');
    expect(p).toContain('48');
  });

  it('formats each metric with two-decimal precision', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('CAGR: 8.40%');
    expect(p).toContain('Sharpe ratio: 0.91');
    expect(p).toContain('Max drawdown: 12.10%');
  });

  it('includes capital values in dollar form', () => {
    const p = buildBacktestPrompt(sample);
    expect(p).toContain('$138200');
    expect(p).toContain('$100000');
  });

  it('starts with the analyst role and ends with structured data', () => {
    const p = buildBacktestPrompt(sample);
    expect(p.startsWith('You are a financial analyst.')).toBe(true);
    expect(p).toMatch(/No disclaimers/);
  });
});

describe('buildVibePlanPrompt', () => {
  const sample: VibePlanInput = {
    name: 'Quality Compounders',
    universe: {
      exchanges: ['NYSE', 'NASDAQ'],
      regions: ['US'],
      sectors: [],
    },
    filters: [
      { name: 'Market Cap', operator: 'greater_than', value: 1_000_000_000 },
      { name: 'ROE', operator: 'greater_than', value: 15 },
    ],
    ranking: {
      factors: [
        { name: 'quality', weight: 0.4 },
        { name: 'value', weight: 0.3 },
        { name: 'momentum', weight: 0.3 },
      ],
    },
    portfolio: {
      allocation_method: 'equal_weight',
      max_position_pct: 10,
      cash_buffer_pct: 5,
    },
    cadence: {
      quarterly_rebalance: true,
      rebalance_threshold_pct: 5,
    },
    risk: {
      max_drawdown_pct: 20,
      max_concentration_pct: 30,
    },
  };

  it('lists each factor with its weight as a percentage', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('quality (40%)');
    expect(p).toContain('value (30%)');
    expect(p).toContain('momentum (30%)');
  });

  it('renders the universe exchanges and falls back to (any) for empty sectors', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('NYSE, NASDAQ');
    expect(p).toContain('sectors (any)');
  });

  it('joins filters with semicolons', () => {
    const p = buildVibePlanPrompt(sample);
    expect(p).toContain('Market Cap greater_than');
    expect(p).toContain(';');
  });

  it('reports max_drawdown_pct unset as "unset" when missing', () => {
    const p = buildVibePlanPrompt({
      ...sample,
      risk: { max_concentration_pct: 30 },
    });
    expect(p).toContain('max DD unset%');
  });
});

describe('buildRiskPrompt', () => {
  const sample: RiskInput = {
    compositeScore: 62,
    volatility: 18.4,
    maxDrawdown: 14.2,
    var95: 4.1,
    topConcentrations: [
      { symbol: 'AAPL', weight: 22.5 },
      { symbol: 'MSFT', weight: 15.0 },
    ],
    avgCorrelation: 0.48,
  };

  it('includes the composite score in N/100 form', () => {
    const p = buildRiskPrompt(sample);
    expect(p).toContain('62 / 100');
  });

  it('formats each top concentration', () => {
    const p = buildRiskPrompt(sample);
    expect(p).toContain('AAPL 22.5%');
    expect(p).toContain('MSFT 15.0%');
  });

  it('emits "n/a" placeholders for missing optional fields', () => {
    const p = buildRiskPrompt({});
    expect(p).toContain('Composite score: n/a / 100');
    expect(p).toContain('Volatility: n/a%');
    expect(p).toContain('Concentration risk (top 3): n/a');
  });

  it('starts with risk-analyst framing', () => {
    const p = buildRiskPrompt(sample);
    expect(p.startsWith('You are a risk analyst.')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npx vitest run src/__tests__/services/agentSurfaces.test.ts 2>&1 | tail -10
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the builders**

`src/services/agentSurfaces.ts`:

```typescript
// Pure prompt builders for the three AI surfaces. Each declares its own
// narrow input type — DO NOT couple to shared/types/index.ts (its shapes
// drifted from what the components actually hold).

// ─── Backtest ────────────────────────────────────────────────────

export interface BacktestMetricsInput {
  cagr: number;
  total_return: number;
  max_drawdown: number;
  volatility: number;
  sharpe_ratio: number;
  turnover: number;
  num_trades: number;
  final_value: number;
  total_invested: number;
}

export interface BacktestInput {
  start_date: string;
  end_date: string;
  duration_months: number;
  metrics: BacktestMetricsInput;
}

export function buildBacktestPrompt(r: BacktestInput): string {
  const m = r.metrics;
  return [
    'You are a financial analyst. Explain the backtest result below in 3–4 short paragraphs.',
    'Cover: (1) headline performance, (2) risk profile, (3) anything unusual (drawdowns, Sharpe, turnover) worth flagging, (4) whether the result is suggestive or noisy given the duration.',
    'Be specific. No generic platitudes. No disclaimers.',
    '',
    `Period: ${r.start_date} → ${r.end_date} (${r.duration_months} months)`,
    `CAGR: ${m.cagr.toFixed(2)}%`,
    `Total return: ${m.total_return.toFixed(2)}%`,
    `Max drawdown: ${m.max_drawdown.toFixed(2)}%`,
    `Volatility: ${m.volatility.toFixed(2)}%`,
    `Sharpe ratio: ${m.sharpe_ratio.toFixed(2)}`,
    `Turnover: ${m.turnover.toFixed(2)}%`,
    `Trades: ${m.num_trades}`,
    `Final value: $${m.final_value.toFixed(0)} on $${m.total_invested.toFixed(0)} invested`,
  ].join('\n');
}

// ─── Vibe plan ────────────────────────────────────────────────────

export interface VibePlanFilter {
  name: string;
  operator: string;
  value: unknown;
}

export interface VibePlanFactor {
  name: string;
  weight: number;
}

export interface VibePlanInput {
  name: string;
  universe: {
    exchanges: string[];
    regions: string[];
    sectors: string[];
  };
  filters: VibePlanFilter[];
  ranking: {
    factors: VibePlanFactor[];
  };
  portfolio: {
    allocation_method: string;
    max_position_pct: number;
    cash_buffer_pct: number;
  };
  cadence: {
    quarterly_rebalance: boolean;
    rebalance_threshold_pct: number;
  };
  risk: {
    max_drawdown_pct?: number;
    max_concentration_pct: number;
  };
}

export function buildVibePlanPrompt(p: VibePlanInput): string {
  const factors = p.ranking.factors
    .map((f) => `${f.name} (${(f.weight * 100).toFixed(0)}%)`)
    .join(', ');
  const filters =
    p.filters.length > 0
      ? p.filters
          .map((f) => `${f.name} ${f.operator} ${JSON.stringify(f.value)}`)
          .join('; ')
      : '(none)';
  const drawdownReport = p.risk.max_drawdown_pct ?? 'unset';

  return [
    'You are a portfolio strategist. Describe what this VibePlan will favor and where it could go wrong.',
    'Cover: (1) the kind of companies the universe + filters select for, (2) what the factor weights tilt toward, (3) concentration or sector risk, (4) one situation where this plan would underperform.',
    'Be concise (3–4 short paragraphs). No disclaimers.',
    '',
    `Name: ${p.name}`,
    `Universe: exchanges ${p.universe.exchanges.join(', ') || '(any)'}, regions ${p.universe.regions.join(', ') || '(any)'}, sectors ${p.universe.sectors.join(', ') || '(any)'}`,
    `Filters: ${filters}`,
    `Ranking factors: ${factors}`,
    `Portfolio: ${p.portfolio.allocation_method}, max ${p.portfolio.max_position_pct}% per position, ${p.portfolio.cash_buffer_pct}% cash buffer`,
    `Cadence: ${p.cadence.quarterly_rebalance ? 'quarterly' : 'manual'} rebalance, threshold ${p.cadence.rebalance_threshold_pct}%`,
    `Risk: max DD ${drawdownReport}%, max concentration ${p.risk.max_concentration_pct}%`,
  ].join('\n');
}

// ─── Risk dashboard ───────────────────────────────────────────────

export interface RiskConcentration {
  symbol: string;
  weight: number;
}

export interface RiskInput {
  compositeScore?: number;
  volatility?: number;
  maxDrawdown?: number;
  var95?: number;
  topConcentrations?: RiskConcentration[];
  avgCorrelation?: number;
}

export function buildRiskPrompt(d: RiskInput): string {
  const composite = d.compositeScore !== undefined
    ? d.compositeScore.toFixed(0)
    : 'n/a';
  const vol = d.volatility !== undefined ? d.volatility.toFixed(2) : 'n/a';
  const maxDD = d.maxDrawdown !== undefined ? d.maxDrawdown.toFixed(2) : 'n/a';
  const var95 = d.var95 !== undefined ? d.var95.toFixed(2) : 'n/a';
  const corr = d.avgCorrelation !== undefined ? d.avgCorrelation.toFixed(2) : 'n/a';
  const conc = d.topConcentrations && d.topConcentrations.length > 0
    ? d.topConcentrations.map((c) => `${c.symbol} ${c.weight.toFixed(1)}%`).join(', ')
    : 'n/a';

  return [
    'You are a risk analyst. Summarize this portfolio risk snapshot in plain English.',
    'Cover: (1) overall risk level vs typical equity exposure, (2) the single biggest concentration or correlation risk, (3) what a 95% VaR loss would look like in dollar terms, (4) one practical action to lower risk if needed.',
    'Three short paragraphs. No disclaimers.',
    '',
    `Composite score: ${composite} / 100`,
    `Volatility: ${vol}%`,
    `Max drawdown: ${maxDD}%`,
    `VaR 95: ${var95}%`,
    `Concentration risk (top 3): ${conc}`,
    `Avg correlation: ${corr}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/__tests__/services/agentSurfaces.test.ts 2>&1 | tail -8
```

Expected: `Tests  12 passed (12)`.

- [ ] **Step 5: Commit**

```bash
git add src/services/agentSurfaces.ts src/__tests__/services/agentSurfaces.test.ts
git commit -m "feat(ai): add agentSurfaces.ts with pure prompt builders for 3 surfaces"
```

---

## Task 5: Fix `openrouter.ts` `chatStream` — actual streaming

**Files:**
- Modify: `src/services/openrouter.ts`

The current `chatStream` returns the full string in one chunk after calling non-streaming `chat()`. Replace its body with the real streaming path so the public API stops lying.

- [ ] **Step 1: Read the current implementation**

```bash
grep -n "chatStream\|isTauriContext" src/services/openrouter.ts | head -10
```

Confirm the method spans roughly lines 89–116 with the comment `TODO: Implement proper streaming via Tauri events`. The signature is `async *chatStream(messages, model?, options?): AsyncGenerator<StreamChunk>`.

- [ ] **Step 2: Replace the method body**

Find the `chatStream` method and replace its body. The new implementation invokes `ai_chat_stream`, listens for `ai-token` events, and yields each as `{ content, done: false }`, then yields a terminal `{ content: '', done: true }`:

```typescript
  async *chatStream(
    messages: OpenRouterMessage[],
    model?: string,
    options?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    }
  ): AsyncGenerator<StreamChunk> {
    log.debug(`chatStream called with model: ${model}`);

    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let finished = false;
    let error: Error | null = null;

    const unlisten = await listen<string>('ai-token', (event) => {
      queue.push(event.payload);
      resolveNext?.();
      resolveNext = null;
    });

    const invokePromise = invokeWithResilience<string>('ai_chat_stream', {
      messages,
      model,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
    })
      .then(() => { finished = true; resolveNext?.(); resolveNext = null; })
      .catch((e) => {
        error = e instanceof Error ? e : new Error(String(e));
        finished = true;
        resolveNext?.();
        resolveNext = null;
      });

    try {
      while (true) {
        while (queue.length > 0) {
          const content = queue.shift()!;
          yield { content, done: false };
        }
        if (finished) break;
        await new Promise<void>((res) => { resolveNext = res; });
      }
      // Drain any tokens that arrived between the queue check and finished flag.
      while (queue.length > 0) {
        yield { content: queue.shift()!, done: false };
      }
      if (error) throw error;
      yield { content: '', done: true };
    } finally {
      unlisten();
      await invokePromise; // ensure the invoke promise settles
    }
  }
```

Note: `listen` and `invoke` are already imported at the top of the file (line 2 has `listen`). Add `invoke` to the import from `@tauri-apps/api/core` if it's not already there.

- [ ] **Step 3: Verify imports**

```bash
grep -n "^import" src/services/openrouter.ts | head -10
```

If `invoke` is not imported, add it. The function uses `invokeWithResilience` from `apiClient`, so `invoke` may not be needed directly — re-read the new code: it uses `invokeWithResilience`. Confirm `listen` is imported. If missing, add `import { listen } from '@tauri-apps/api/event';`.

- [ ] **Step 4: Run all existing tests to verify no regression**

```bash
npm test 2>&1 | tail -6
```

Expected: `Tests  N passed (N)` where N > previous count (new tests from Tasks 1-4 are now included). Zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/services/openrouter.ts
git commit -m "fix(ai): openrouter.ts chatStream now actually streams via Tauri events"
```

---

## Task 6: Wire BacktestTab

**Files:**
- Modify: `src/BacktestTab.tsx`

BacktestTab has a local `BacktestResult` interface (line 38) that matches `BacktestInput`. The wiring is purely additive — drop the panel below the existing results render.

- [ ] **Step 1: Find where backtest results are rendered**

```bash
grep -n "backtestResult\|results\|summary\b" src/BacktestTab.tsx | head -20
```

Identify the JSX block that displays the results section (look for where `results.summary` or `results.metrics` is rendered).

- [ ] **Step 2: Add imports at the top of the file**

After existing imports:

```tsx
import { AiInlinePanel } from './components/AiInlinePanel';
import { buildBacktestPrompt } from './services/agentSurfaces';
```

(Adjust the path if `BacktestTab.tsx` lives somewhere other than `src/` directly. From `src/BacktestTab.tsx`, the imports above are correct.)

- [ ] **Step 3: Add the panel below the results block**

The state variable is `result` (declared at line 123: `const [result, setResult] = useState<BacktestResult | null>(null);`). The results render block starts with `<div className="backtest-results">` around line 436. Insert the panel as the last child of that wrapping `<div>`, just before its closing `</div>`:

```tsx
{result && (
  <AiInlinePanel
    prompt={buildBacktestPrompt(result)}
    emptyHint="Get an AI explanation of what this backtest tells you."
  />
)}
```

The local `BacktestResult` interface in this file (line 38) has `start_date, end_date, duration_months, metrics, timeline, trades, summary`. `BacktestInput` only requires `start_date, end_date, duration_months, metrics` — the wider local shape satisfies the narrower input. TypeScript should accept this assignment. If it complains, the local interface and `BacktestInput` have drifted; reconcile by adjusting `BacktestInput` (and its test) to match what BacktestTab actually has.

- [ ] **Step 4: Type-check the change**

```bash
npx tsc --noEmit 2>&1 | grep -E "BacktestTab|agentSurfaces" | head -10
```

Expected: no errors related to these files. If errors appear, the local `BacktestResult` shape in `BacktestTab.tsx` doesn't match `BacktestInput`. Update `BacktestInput` in `agentSurfaces.ts` to match (and update its test), OR add a narrow adapter in BacktestTab.

- [ ] **Step 5: Manual smoke test**

```bash
npm run tauri dev
```

In the app: open Backtest tab → run a backtest → wait for results → click "Ask AI" → confirm tokens stream into the inline panel below the results. Stop the dev server (Ctrl+C) when verified.

**Verification gate:** if tokens don't stream, do NOT proceed. Likely causes:
- OpenRouter key not configured (check `.env` for `OPENROUTER_API_KEY`)
- Backend `ai-token` event name mismatch — grep for `"ai-token"` in `ai.rs:158` to confirm
- Hook subscribed after the first tokens were already emitted — race condition in the hook's `start()`. The current implementation installs the listener before invoking, so this should not happen.

- [ ] **Step 6: Commit**

```bash
git add src/BacktestTab.tsx
git commit -m "feat(ai): add Ask-AI streaming panel to BacktestTab"
```

---

## Task 7: Wire VibeStudio

**Files:**
- Modify: `src/components/VibeStudio.tsx`

- [ ] **Step 1: Find the compiled plan state and the post-compile render block**

```bash
grep -n "compiledPlan\|VibePlanScript\|compile_plan\|plan\b" src/components/VibeStudio.tsx | head -30
```

Identify (a) the state variable holding the compiled plan and (b) the JSX block that displays it (preview, breakdown, etc.).

- [ ] **Step 2: Add imports at the top of the file**

```tsx
import { AiInlinePanel } from './AiInlinePanel';
import { buildVibePlanPrompt, type VibePlanInput } from '../services/agentSurfaces';
```

- [ ] **Step 3: Inspect the compiled plan's actual shape**

Insert a temporary `console.log(compiledPlan)` (or check via React DevTools) and confirm the field names. The Rust backend's `VibePlanScript` uses snake_case (`max_position_pct`, `cash_buffer_pct`); the frontend may have converted to camelCase. If the shape differs from `VibePlanInput`, write a small adapter:

```tsx
function toVibePlanInput(plan: unknown): VibePlanInput | null {
  if (!plan || typeof plan !== 'object') return null;
  // Cast based on actual observed shape. Adjust field accesses to match.
  const p = plan as Record<string, unknown>;
  // ... build out the VibePlanInput
  return p as unknown as VibePlanInput;
}
```

If the shape matches as-is, skip the adapter and pass `compiledPlan` directly.

- [ ] **Step 4: Add the panel**

Below the existing compiled-plan render block:

```tsx
{compiledPlan && (
  <AiInlinePanel
    prompt={buildVibePlanPrompt(compiledPlan)}
    triggerLabel="Explain this plan"
    emptyHint="Have AI describe what this VibePlan favors and where it could fail."
  />
)}
```

Use the adapter result if you needed one. Remove the temporary console.log before committing.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "VibeStudio|agentSurfaces" | head -10
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test**

```bash
npm run tauri dev
```

Build a plan in VibeStudio (compile a template or write a vibe), wait for the compiled view to render, click "Explain this plan", confirm tokens stream. Stop dev server when verified.

- [ ] **Step 7: Commit**

```bash
git add src/components/VibeStudio.tsx
git commit -m "feat(ai): add Ask-AI streaming panel to VibeStudio"
```

---

## Task 8: Wire RiskDashboard

**Files:**
- Modify: `src/components/RiskDashboard.tsx`

- [ ] **Step 1: Find the risk data state**

```bash
grep -n "compositeScore\|riskMetrics\|riskData\|var95\|concentration" src/components/RiskDashboard.tsx | head -25
```

Identify the state variables holding composite score, volatility, max drawdown, VaR, concentrations, avg correlation. The component likely doesn't have a single `riskData` object — it has separate variables (or local types `QuantMetrics`, `SymbolMetrics`).

- [ ] **Step 2: Add imports**

```tsx
import { AiInlinePanel } from './AiInlinePanel';
import { buildRiskPrompt, type RiskInput } from '../services/agentSurfaces';
```

- [ ] **Step 3: Assemble a `RiskInput` from the dashboard's local state**

The dashboard already computes `riskScore`, `portfolioVolatility`, `portfolioMaxDrawdown`, `var95` (in dollars), `symbolMetrics`, and `correlationPairs` via `useMemo` (see `RiskDashboard.tsx` lines 303–357). Build the input below those memos, above the JSX return:

```tsx
const riskInput: RiskInput = useMemo(() => {
  // var95 in the dashboard is dollars (portfolioValue * dailyVol * VAR_Z_SCORE).
  // The prompt builder formats var95 as percent, so compute the daily VaR
  // percent (dailyVol * VAR_Z_SCORE * 100) for the AI prompt.
  const dailyVol = portfolioVolatility / Math.sqrt(252);
  const var95Pct =
    symbolMetrics.length > 0 ? dailyVol * VAR_Z_SCORE * 100 : undefined;

  // Top 3 concentrations by weight, expressed as percentages.
  const topConcentrations =
    symbolMetrics.length > 0
      ? [...symbolMetrics]
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3)
          .map((sm) => ({ symbol: sm.symbol, weight: sm.weight * 100 }))
      : undefined;

  // Average pairwise correlation from the existing pseudo-correlation pairs.
  const avgCorrelation =
    correlationPairs.length > 0
      ? correlationPairs.reduce((sum, p) => sum + p.correlation, 0) /
        correlationPairs.length
      : undefined;

  return {
    compositeScore: symbolMetrics.length > 0 ? riskScore : undefined,
    volatility: symbolMetrics.length > 0 ? portfolioVolatility : undefined,
    maxDrawdown: symbolMetrics.length > 0 ? portfolioMaxDrawdown : undefined,
    var95: var95Pct,
    topConcentrations,
    avgCorrelation,
  };
}, [
  riskScore,
  portfolioVolatility,
  portfolioMaxDrawdown,
  symbolMetrics,
  correlationPairs,
]);
```

Note: `symbolMetrics[i].weight` in this codebase is a fraction (0–1), so multiplying by 100 gives a percentage that matches the prompt format. If observed values are already percent-form, drop the `* 100`.

- [ ] **Step 4: Add the panel**

Below the existing risk metrics blocks (after correlation heatmap or last metric card):

```tsx
{riskInput.compositeScore !== undefined && (
  <AiInlinePanel
    prompt={buildRiskPrompt(riskInput)}
    triggerLabel="Summarize risk"
    emptyHint="Get a plain-English read on this portfolio's risk profile."
  />
)}
```

The gate `riskInput.compositeScore !== undefined` ensures the panel only renders once at least one real metric exists.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "RiskDashboard|agentSurfaces" | head -10
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test**

```bash
npm run tauri dev
```

Open Risk Dashboard with the demo portfolio or your own. Wait for metrics to populate. Click "Summarize risk". Confirm tokens stream. Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/RiskDashboard.tsx
git commit -m "feat(ai): add Ask-AI streaming panel to RiskDashboard"
```

---

## Task 9: Coverage gate extension

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Open and update the coverage config**

The current config has thresholds for `src/shared/utils/calculations.ts` only. Add `agentSurfaces.ts` to both `include` and `thresholds`:

Replace:

```typescript
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/shared/utils/calculations.ts'],
      thresholds: {
        'src/shared/utils/calculations.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
      },
    },
```

With:

```typescript
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/shared/utils/calculations.ts',
        'src/services/agentSurfaces.ts',
      ],
      thresholds: {
        'src/shared/utils/calculations.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'src/services/agentSurfaces.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
      },
    },
```

- [ ] **Step 2: Run coverage, confirm both files clear thresholds**

```bash
npm run test:coverage 2>&1 | tail -15
```

Expected output includes:
```
 calculations.ts |   ≥80 |   ≥80 |   ≥80 |   ≥80 |
 agentSurfaces.ts |  ≥80 |   ≥80 |   ≥80 |   ≥80 |
```

If `agentSurfaces.ts` falls below 80% on any metric, expand `agentSurfaces.test.ts` to cover the missing branches (most likely the optional-field fallbacks in `buildRiskPrompt` or the empty-filters branch in `buildVibePlanPrompt`).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "ci: extend coverage gate to cover agentSurfaces.ts (≥80% all metrics)"
```

---

## Task 10: Final verification + release marker

- [ ] **Step 1: Full Rust test suite**

```bash
cd /Users/evintleovonzko/Documents/projects/vincrypt/flowfolio/src-tauri && cargo test --lib 2>&1 | tail -3
```

Expected: `test result: ok. 637 passed; 0 failed; 1 ignored` (no change — no Rust modified).

- [ ] **Step 2: Full Rust clippy + fmt**

```bash
cd /Users/evintleovonzko/Documents/projects/vincrypt/flowfolio/src-tauri && cargo clippy -- -D warnings && cargo fmt --check
echo "EXIT: $?"
```

Expected: `EXIT: 0`.

- [ ] **Step 3: Full frontend test suite + coverage**

```bash
cd /Users/evintleovonzko/Documents/projects/vincrypt/flowfolio && npm test 2>&1 | tail -4
npm run test:coverage 2>&1 | grep -E "calculations|agentSurfaces"
```

Expected: all suites pass, both coverage lines clear ≥80%.

- [ ] **Step 4: Sanity smoke (one last time)**

```bash
npm run tauri dev
```

Open Backtest, click Ask AI, see streaming. Stop dev server.

- [ ] **Step 5: Release marker commit (allow-empty)**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(release): 0.4.5 Smarter Agent — streaming + 3 AI surfaces

Verified gates (all fresh, exit 0):
- cargo test --lib: 637 passed, 0 failed (no Rust change, regression-free)
- cargo clippy + fmt --check: clean
- npm test: all suites pass with ~28 new tests (coordinator/hook/panel/builders)
- npm run test:coverage: calculations.ts and agentSurfaces.ts ≥80% on all four metrics
- Manual smoke: streaming visible on BacktestTab, VibeStudio, RiskDashboard

Ships:
- useAiStream hook + aiStreamCoordinator (single-stream policy)
- AiInlinePanel component
- agentSurfaces.ts with three prompt builders
- Ask-AI buttons on three tabs
- openrouter.ts chatStream actually streams (was a lie)

Deferred to 0.4.6+:
- Conversation history / follow-up
- System prompt overhaul
- Local Qwen upgrade, llama.cpp thread config
- Model swap UI in Settings
- Markdown rendering
- Per-stream event channels (would unlock concurrent panels)
EOF
)"
```

---

## Summary of new tests

| File | Tests | Coverage gate |
|---|---|---|
| `aiStreamCoordinator.test.ts` | 5 | None (integration logic, behavior-tested only) |
| `useAiStream.test.tsx` | 5 | None |
| `AiInlinePanel.test.tsx` | 6 | None |
| `agentSurfaces.test.ts` | 12 | ≥80% all four metrics on `agentSurfaces.ts` |

Total new frontend tests: **28**. Expected total after this plan: 761 + 28 = **789**.

---

## Out of scope (do NOT do)

These belong to 0.4.6+ and should NOT be added to this plan even if tempting:

- Conversation history / follow-up question input box on the panel
- System-prompt parameter on `ai_chat_stream` (would need Rust changes)
- Local Qwen model upgrade
- llama.cpp thread tuning, Settings UI for local AI
- Model swap dropdown in Settings (cloud vs local per session)
- Markdown rendering of AI responses (panel uses `<pre>`)
- Per-stream event channels (would let multiple panels stream concurrently)
- E2E Playwright tests for AI surfaces (flaky against real APIs)
- Refactoring `portfolioAgent.ts` (3575 lines — separate effort)
- Updating the stale shared `BacktestResult` / `VibePlan` types in `shared/types/index.ts`

If any of these come up during implementation, write them down for the 0.4.6 brainstorming and keep going.
