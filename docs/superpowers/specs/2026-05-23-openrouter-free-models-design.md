# OpenRouter Free Models Migration & User Settings

**Date:** 2026-05-23  
**Status:** Approved

---

## Problem

AI model selection is currently controlled by env vars (`VITE_VIBE_STUDIO_MODEL`, `VITE_REPORT_MODEL`, `DEFAULT_LLM_MODEL`). Users cannot change models at runtime. The Vibe Studio default (`minimax/minimax-01`) is not a free model. Error messages still reference `.env` files. Several backend AI commands ignore the model parameter entirely.

## Goal

- Limit AI model selection to OpenRouter free models only
- Expose a single global model selector in user Settings, persisted to SQLite
- Remove env var model config as the source of truth
- Fix known bugs in the AI service layer discovered during the audit

---

## Architecture

Three layers of change:

1. **Free Model Catalog** — compile-time constant list of valid free models  
2. **Persisted Model Selection** — SQLite-backed read/write with in-memory cache  
3. **Settings UI** — dropdown in SettingsPage.tsx, single global selection

---

## Components

### `src/constants/freeModels.ts` (new)

Typed catalog of ~8 curated OpenRouter free models:

```ts
export interface FreeModel {
  id: string;           // OpenRouter model ID (e.g. "meta-llama/llama-3.3-70b-instruct:free")
  name: string;         // Human display name
  description: string;  // One-line capability summary
  contextWindow: number; // Max context in tokens
  recommended?: boolean;
}

export const FREE_MODELS: FreeModel[] = [ … ];
export const DEFAULT_FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
```

Initial model list (from openrouter.ai/collections/free-models):
- `meta-llama/llama-3.3-70b-instruct:free` — Llama 3.3 70B (recommended, 131k ctx)
- `google/gemini-2.0-flash-exp:free` — Gemini 2.0 Flash (1M ctx)
- `deepseek/deepseek-r1:free` — DeepSeek R1 (163k ctx, strong reasoning)
- `deepseek/deepseek-chat-v3-0324:free` — DeepSeek V3 (163k ctx)
- `mistralai/mistral-7b-instruct:free` — Mistral 7B (32k ctx, fast)
- `qwen/qwen3-8b:free` — Qwen3 8B (131k ctx)
- `microsoft/phi-4-reasoning:free` — Phi-4 Reasoning (16k ctx)
- `google/gemma-3-27b-it:free` — Gemma 3 27B (131k ctx)

### `src/services/aiModel.ts` (new)

Thin caching wrapper over `load_setting` / `save_setting`:

```ts
let cached: string | null = null;

export async function getSelectedModel(): Promise<string> {
  if (cached) return cached;
  const stored = await invokeWithResilience<string | null>('load_setting', { key: 'ai_model' });
  // Validate stored value is in FREE_MODELS catalog; fall back if not
  const valid = FREE_MODELS.find(m => m.id === stored);
  cached = valid ? stored! : DEFAULT_FREE_MODEL;
  return cached;
}

export async function setSelectedModel(id: string): Promise<void> {
  await invokeWithResilience('save_setting', { key: 'ai_model', value: id });
  cached = id;
}
```

### `src/components/SettingsPage.tsx` (modified)

Add to `SettingsState`:
```ts
selectedAiModel: string;
```

Add `SET_AI_MODEL` action to reducer.

Add new "AI Configuration" section above the API Keys section:
- `<select>` populated from `FREE_MODELS`
- Shows selected model's context window and description below the dropdown
- Save button calls `setSelectedModel(selected)` then fires existing success toast
- Loads current value from `getSelectedModel()` in `useEffect` on mount

### `src/services/portfolioAgent.ts` (modified)

- Remove `private vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01'`
- At the start of each method that calls OpenRouter, `const model = await getSelectedModel()`
- Pass `model` to all `openRouterService.chat()` and `openRouterService.chatStream()` calls

### `src/services/analysisReport.ts` (modified)

- Remove `REPORT_MODEL` env var usage
- Use `await getSelectedModel()` before each AI call

### Backend: `src-tauri/src/api/commands/ai.rs` (modified)

**`ai_chat_stream`** (line 116):
- After the frontend refactor, the frontend always passes the model (since `getSelectedModel()` always resolves). Replace the hardcoded string fallback with a shared constant:
  ```rust
  const DEFAULT_FREE_MODEL: &str = "meta-llama/llama-3.3-70b-instruct:free";
  let model = model.unwrap_or_else(|| DEFAULT_FREE_MODEL.to_string());
  ```
- No SQLite lookup needed in the backend — the frontend is the authoritative source of the user's selection.

**`ai_chat_assistant`**:
- Currently calls `OPENROUTER_SERVICE.chat_with_assistant(message, history)` with no model param
- Add `model: Option<String>` parameter to `ai_chat_assistant` command
- Pass through to service

### Backend: `src-tauri/src/services/openrouter_service.rs` (modified)

- `chat_with_assistant` should accept `model: Option<String>` and forward it to `chat()`
- `generate_portfolio_insight` should accept `model: Option<String>` and forward it

---

## Bug Fixes (broader audit)

| Location | Bug | Fix |
|----------|-----|-----|
| `src/services/openrouter.ts:67` | Error message says "check your .env file" | Change to "check your OpenRouter key in Settings" |
| `src/services/portfolioAgent.ts:661` | Default model `minimax/minimax-01` is not free | Replace with `DEFAULT_FREE_MODEL` (removed entirely by refactor) |
| `src-tauri/src/api/commands/ai.rs:116` | Model fallback hardcoded | Read from SQLite or accept from caller |
| `ai_chat_assistant` | Model param not accepted or forwarded | Add `model: Option<String>` param, forward to service |
| `OpenRouterService::chat_with_assistant` | No model param | Accept and forward |
| `OpenRouterService::generate_portfolio_insight` | No model param | Accept and forward |

---

## Constraints & Non-Changes

- **Subscription tier gate** (`tier == "ai" || tier == "pro"`) is left in place — removing it is a separate product decision
- **`.env.example`** — `VITE_VIBE_STUDIO_MODEL` and `VITE_REPORT_MODEL` kept as comments marked "deprecated — use Settings instead"
- **Local Qwen fallback** (`local_ai_service.rs`) — unaffected; still used when OpenRouter fails
- **No new Tauri commands** — `save_setting` / `load_setting` already exist
- **No schema migration** — `user_settings` table already exists

---

## Data Flow (runtime)

```
App startup
  → SettingsPage mounts
  → getSelectedModel() → load_setting("ai_model") → SQLite
  → cached in aiModel.ts module scope

User runs Vibe Studio / Report / Chat
  → portfolioAgent / analysisReport calls getSelectedModel()
  → returns cached value (no SQLite hit if already loaded)
  → passes model id to openRouterService.chat(messages, model)
  → backend ai_chat receives model, sends to OpenRouter

User changes model in Settings
  → setSelectedModel(newId) → save_setting("ai_model") → SQLite
  → cache updated immediately
  → next AI call uses new model with no restart required
```

---

## Success Criteria

1. User can open Settings, see an "AI Model" dropdown with free models only
2. Selected model persists across app restarts
3. All AI features (Vibe Studio, Reports, Chat Assistant, Portfolio Insight) use the globally selected model
4. No AI call ever uses `minimax/minimax-01` or any non-free model as default
5. Error messages in UI reference Settings, not `.env` files
6. `cargo test` and `npm run lint` pass
