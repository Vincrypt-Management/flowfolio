# FlowFolio 0.4.5 — "Smarter Agent" Design

**Date:** 2026-05-20
**Status:** Approved (brainstorming)
**Author:** Brainstormed with Claude Code

---

## Overview

0.4.5 polishes the cloud (OpenRouter) AI path that was just defaulted to the free Llama 3.3 70B model in 0.4.4. The release ships two user-visible wins:

1. **Streaming end-to-end** — tokens visibly stream into the UI as the model produces them. Today the backend emits `ai-token` Tauri events but no frontend code subscribes, and `openrouter.ts` `chatStream` is a lie (it just calls non-streaming `chat()`).
2. **Three new "Ask AI" surfaces** — the agent moves beyond portfolio generation to also explain backtest results, describe vibe plans, and summarize portfolio risk.

Deliberately deferred to 0.4.6+: prompt-quality overhaul, conversation history, local Qwen model upgrade, llama.cpp thread tuning, in-app model swap UI, markdown rendering, per-stream event channels.

---

## Scope decisions

The four-axis plan in `2026-03-28-v043-v046-release-design.md` (model / speed / coverage / quality) was tightened during brainstorming to keep the release shippable:

| Decision | Choice |
|---|---|
| AI focus | Cloud-first (free OpenRouter). Local Qwen stays as offline fallback unchanged. |
| Top priority | Fix streaming end-to-end. Visible UX win first. |
| Release scope | Streaming + three new agent surfaces. Prompt/history work deferred. |
| Surface UX | Inline panel below the tab's existing result content. No drawer, no modal. |
| Concurrency | Single-stream policy enforced in the frontend coordinator. |
| Architecture | Reusable React hook + presentation component + pure prompt builders. No new Rust. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend                                                    │
│                                                              │
│  BacktestTab.tsx / VibeStudio.tsx / RiskDashboard.tsx        │
│    ↓ passes structured result                                │
│  <AiInlinePanel prompt={builder(data)} />                    │
│    ├─ useAiStream(prompt)                                    │
│    └─ renders tokens, states                                 │
│                                                              │
│  agentSurfaces.ts          useAiStream.ts                    │
│    buildBacktestPrompt       invoke("ai_chat_stream")        │
│    buildVibePlanPrompt       listen("ai-token")              │
│    buildRiskPrompt           cleanup on unmount              │
│                              ↓ uses aiStreamCoordinator      │
└──────────────────────────────────┼───────────────────────────┘
                                   ↓ Tauri IPC
┌──────────────────────────────────────────────────────────────┐
│  Backend (unchanged)                                         │
│  ai_chat_stream — emits ai-token events → OpenRouter SSE     │
└──────────────────────────────────────────────────────────────┘
```

**New files (all TypeScript, all frontend):**
- `src/hooks/useAiStream.ts` — streaming primitive (~80 LoC)
- `src/hooks/aiStreamCoordinator.ts` — single-stream policy (~15 LoC)
- `src/components/AiInlinePanel.tsx` — UI shell (~120 LoC)
- `src/services/agentSurfaces.ts` — three prompt builders (~150 LoC)

**Modified files:**
- `src/components/BacktestTab.tsx` — add `<AiInlinePanel />` below results (~10 LoC)
- `src/components/VibeStudio.tsx` — add `<AiInlinePanel />` below compiled plan (~10 LoC)
- `src/components/RiskDashboard.tsx` — add `<AiInlinePanel />` below risk metrics (~10 LoC)
- `src/services/openrouter.ts` — rewrite `chatStream` to actually stream (bug fix, ~30 LoC delta)
- `vitest.config.ts` — extend coverage gate to cover `agentSurfaces.ts`

**Zero new Rust.** The backend `ai_chat_stream` command already emits `ai-token` events and is functional — 0.4.5 wires up what was already there.

---

## Components

### `useAiStream` hook

React adapter around the existing Tauri streaming command. Discriminated-union state, owns its own listener lifecycle.

```typescript
export type AiStreamState =
  | { phase: 'idle' }
  | { phase: 'streaming'; tokens: string }
  | { phase: 'done'; tokens: string }
  | { phase: 'error'; tokens: string; error: string };

export function useAiStream(): {
  state: AiStreamState;
  start: (prompt: string) => Promise<void>;
  stop: () => void;
};
```

**Contract:**
- `start(prompt)` claims the global stream slot (cancels any other active stream), invokes `ai_chat_stream`, subscribes to `ai-token`, accumulates payload into `state.tokens`.
- The invoke's return value (full concatenated response from `ai.rs`) is ignored. The event stream is the canonical source — keeps a single source of truth for the rendered text.
- `stop()` is best-effort: unsubscribes the listener and flips state to `idle`. The backend continues to completion but no further tokens reach React.
- Listener cleaned up on success, error, stop, and component unmount.

### `aiStreamCoordinator` module

Module-level singleton enforcing single-stream policy:

```typescript
let activeStop: (() => void) | null = null;

export function claim(stop: () => void): void {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}

export function release(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}
```

Hook calls `claim(stop)` in `start()` and `release(stop)` in the finally clause. Starting a stream from any panel auto-stops the previous active one — eliminates the bleed risk from multiple panels listening to the same global `ai-token` event.

### `AiInlinePanel` component

Renders trigger button + token output + states. `<pre>` for output (preserves newlines, defers markdown to 0.4.6). `aria-live="polite"` for screen-reader updates.

```tsx
interface Props {
  prompt: string;
  triggerLabel?: string;        // default "Ask AI"
  disabled?: boolean;
  emptyHint?: string;
}
```

State-driven rendering:
- `idle` → trigger button + optional hint
- `streaming` → "Stop" button + accumulating `<pre>`
- `done` → "Ask Again" button + final `<pre>`
- `error` → "Ask Again" button + error message + partial tokens

### Prompt builders (`agentSurfaces.ts`)

Three pure functions:

```typescript
buildBacktestPrompt(r: BacktestResult): string
buildVibePlanPrompt(p: VibePlanScript): string
buildRiskPrompt(d: RiskData): string
```

Each builds a single user-message string containing instructions + structured data. No system prompt parameter (the backend doesn't accept one today — that's the 0.4.6 polish). Missing optional fields fall back to `'n/a'` so the prompt is always valid input.

Prompt structure:
1. Role + task line ("You are a financial analyst. Explain...")
2. Specific coverage bullets (1, 2, 3, 4 — what to address)
3. Style constraints ("No disclaimers. Three short paragraphs.")
4. Empty line, then the structured data as key: value lines

Implementation step 1 of `agentSurfaces.ts` is verifying whether `BacktestResult`, `VibePlanScript`, and a `RiskData` type already exist in `src/shared/types/`. Any missing type is added in that step before the builder that consumes it.

---

## Surface wiring

Each tab gets a conditional `<AiInlinePanel />` after its existing result section. Panel only renders when underlying data exists, so there's no orphan "Ask AI" button on empty states.

```tsx
// BacktestTab.tsx
{results && (
  <AiInlinePanel
    prompt={buildBacktestPrompt(results)}
    emptyHint="Get an AI explanation of what this backtest tells you."
  />
)}

// VibeStudio.tsx
{compiledPlan && (
  <AiInlinePanel
    prompt={buildVibePlanPrompt(compiledPlan)}
    triggerLabel="Explain this plan"
    emptyHint="Have AI describe what this VibePlan favors and where it could fail."
  />
)}

// RiskDashboard.tsx
{riskData && (
  <AiInlinePanel
    prompt={buildRiskPrompt(riskData)}
    triggerLabel="Summarize risk"
    emptyHint="Get a plain-English read on this portfolio's risk profile."
  />
)}
```

Trigger labels are localized — "Explain this plan", "Summarize risk" — because generic "Ask AI" on every surface tells the user nothing about what will happen.

---

## Bug fix: `openrouter.ts` `chatStream`

Today's `chatStream(messages, model, options)` claims to stream but its body just calls the non-streaming `chat()` and returns the full string. Rewrite it to invoke `ai_chat_stream` and yield tokens via an async generator matching the documented signature.

Not required by the new panels (they use the hook directly), but the public API in `openrouter.ts` should not lie to any future caller. Trivial scope (~30 LoC).

---

## Error handling

| Failure | Behavior |
|---|---|
| No OpenRouter key | Backend returns `"OpenRouter API key not configured"`. Hook → `error` phase. Panel shows the message. User configures key in `.env` or Settings → DataSources. |
| Rate limit / API error | Backend returns `"OpenRouter API error 429: ..."`. Same error path. No retry — user clicks "Ask Again". |
| Network drop mid-stream | Backend returns partial response + error. Hook keeps accumulated tokens, flips to `error` phase, panel shows both. |
| User clicks Stop | `stop()` unsubscribes + flips to `idle`. Backend stream finishes but is ignored. |
| Tab unmount during stream | `useEffect` cleanup runs `stop()`. No leaked listeners. |
| Tier gate (`tier != "ai" && tier != "pro"`) | Backend returns subscription-required error. Default tier is `"pro"` today so this won't fire in practice. |

---

## Testing

| Layer | Strategy |
|---|---|
| `agentSurfaces.ts` builders | Pure-function tests. Sample fixtures per type, assert key facts in output string. Edge cases: empty universe, undefined optional fields, zero metrics. **Coverage gate ≥80%.** |
| `aiStreamCoordinator.ts` | Unit tests. Verify claim cancels prior, release only clears if owner, double-claim, release-of-non-active. ~6 tests. |
| `useAiStream` hook | RTL + mocked Tauri APIs (`invoke`, `listen`). State transitions: idle → streaming → done, error, stop, unmount cleanup. ~5 tests. |
| `AiInlinePanel` component | RTL render tests. Trigger renders, disabled state respects prop, click calls start with prompt, streaming shows tokens, error shows message + partial. ~6 tests. |
| Surface integration | Manual smoke test in dev with a real OpenRouter key, verified by the implementer before the final commit on each surface. Not automated — network-dependent. |

**CI gate change:** add `src/services/agentSurfaces.ts` to the per-file thresholds in `vitest.config.ts` (lines/branches/funcs/stmts ≥ 80, same as `calculations.ts`). The hook/coordinator/panel are tested for behavior but not gated by coverage — they're integration code, not financial primitives.

---

## Done criteria

- Click "Ask AI" on **BacktestTab** → tokens visibly stream into an inline panel below the result.
- Same on **VibeStudio** (compiled plan view) and **RiskDashboard**.
- Switching between tabs cancels any in-flight stream (no leak, no bleed).
- `npm test` exits 0 with all new test files passing.
- `cargo test` still exits 0 (no Rust changes, but verify nothing broke).
- `npm run test:coverage` shows `agentSurfaces.ts` ≥ 80% on all four metrics, gate enforced.
- `openrouter.ts` `chatStream` actually streams when called (not a lie anymore).

---

## Out of scope (0.4.6 or later)

- Conversation history / follow-up questions
- System-prompt overhaul (separate system role, output format, tool use)
- Local Qwen model upgrade (move from 1.5B to 3B / Llama 3.2)
- llama.cpp thread / temperature config in Settings
- In-app model swap UI (cloud vs local per session)
- Markdown rendering of AI responses (currently `<pre>` for newlines)
- Per-stream event channels (would unlock concurrent panels; needs `ai.rs` changes)
- E2E Playwright tests for the AI surfaces (flaky against real APIs)
