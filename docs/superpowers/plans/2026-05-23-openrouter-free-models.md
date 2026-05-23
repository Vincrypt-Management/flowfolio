# OpenRouter Free Models Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all AI calls to use OpenRouter free models only, expose a global model selector in Settings persisted to SQLite, and fix known bugs in the AI service layer.

**Architecture:** A new `freeModels.ts` catalog and `aiModel.ts` caching service replace env-var model config; frontend services call `getSelectedModel()` before each AI call; SettingsPage gets a new "AI Configuration" card; Rust backend receives the model on every call and no longer hardcodes it.

**Tech Stack:** TypeScript/React, Rust/Tauri 2, SQLite (`save_setting`/`load_setting` commands already exist), lucide-react icons, `invokeWithResilience` from `src/services/apiClient.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `src/constants/freeModels.ts` | Catalog of free models + default constant |
| **Create** | `src/services/aiModel.ts` | Cached model preference read/write |
| **Modify** | `src/services/portfolioAgent.ts` | Replace `this.vibeModel` with `await this.getModel()` |
| **Modify** | `src/services/analysisReport.ts` | Replace `REPORT_MODEL` with `await getSelectedModel()` |
| **Modify** | `src/services/openrouter.ts` | Fix error messages; wire model into `chatWithAssistant` + `generatePortfolioInsight` |
| **Modify** | `src/components/SettingsPage.tsx` | Add AI Configuration card + reducer state |
| **Modify** | `src-tauri/src/services/openrouter_service.rs` | Add `model` param to `chat_with_assistant` + `generate_portfolio_insight` |
| **Modify** | `src-tauri/src/api/commands/ai.rs` | Add `model` param to `ai_chat_assistant` + `ai_generate_portfolio_insight`; fix hardcoded fallback in `ai_chat_stream` |

---

## Task 1: Create the Free Models Catalog

**Files:**
- Create: `src/constants/freeModels.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/constants/freeModels.ts
export interface FreeModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  recommended?: boolean;
}

export const FREE_MODELS: FreeModel[] = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B',
    description: 'Meta\'s flagship open model. Best balance of quality and reliability.',
    contextWindow: 131072,
    recommended: true,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    description: 'Google\'s fast model with a massive 1M token context.',
    contextWindow: 1048576,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    description: 'Strong chain-of-thought reasoning for complex analysis.',
    contextWindow: 163840,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3',
    description: 'Fast and capable instruction-following model.',
    contextWindow: 163840,
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B',
    description: 'Lightweight and fast. Good for quick analyses.',
    contextWindow: 32768,
  },
  {
    id: 'qwen/qwen3-8b:free',
    name: 'Qwen3 8B',
    description: 'Alibaba\'s compact model with solid instruction following.',
    contextWindow: 131072,
  },
  {
    id: 'microsoft/phi-4-reasoning:free',
    name: 'Phi-4 Reasoning',
    description: 'Microsoft\'s reasoning-focused small model.',
    contextWindow: 16384,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B',
    description: 'Google\'s open-weights model, strong general performance.',
    contextWindow: 131072,
  },
];

export const DEFAULT_FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

export function isValidFreeModel(id: string): boolean {
  return FREE_MODELS.some(m => m.id === id);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/freeModels.ts
git commit -m "feat: add OpenRouter free models catalog"
```

---

## Task 2: Create the aiModel Service

**Files:**
- Create: `src/services/aiModel.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/services/aiModel.ts
import { invokeWithResilience } from './apiClient';
import { DEFAULT_FREE_MODEL, isValidFreeModel } from '../constants/freeModels';

let cached: string | null = null;

export async function getSelectedModel(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await invokeWithResilience<string | null>('load_setting', { key: 'ai_model' });
    cached = stored && isValidFreeModel(stored) ? stored : DEFAULT_FREE_MODEL;
  } catch {
    cached = DEFAULT_FREE_MODEL;
  }
  return cached;
}

export async function setSelectedModel(id: string): Promise<void> {
  await invokeWithResilience('save_setting', { key: 'ai_model', value: id });
  cached = id;
}

export function clearModelCache(): void {
  cached = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/aiModel.ts
git commit -m "feat: add aiModel service with SQLite-backed caching"
```

---

## Task 3: Fix portfolioAgent.ts — Replace vibeModel

**Files:**
- Modify: `src/services/portfolioAgent.ts:1,661`

- [ ] **Step 1: Add import at top of file (after existing imports)**

In `src/services/portfolioAgent.ts`, add this import after the existing import block (after line 9 or wherever the imports end):

```typescript
import { getSelectedModel } from './aiModel';
```

- [ ] **Step 2: Replace the vibeModel field with a private getter**

Find line 661:
```typescript
  private vibeModel = import.meta.env.VITE_VIBE_STUDIO_MODEL || 'minimax/minimax-01';
```

Replace it with:
```typescript
  private async getModel(): Promise<string> {
    return getSelectedModel();
  }
```

- [ ] **Step 3: Replace all `this.vibeModel` references**

There are 9 occurrences at lines 889, 1758, 1865, 2187, 2197, 3387, 3430, 3495, 3530. In each async method body, `this.vibeModel` is passed as the second argument to `openRouterService.chat(...)` or `openRouterService.chatStream(...)`.

For each occurrence, replace `this.vibeModel` with `await this.getModel()`. Example — line 889 before:
```typescript
      const response = await openRouterService.chat(messages, this.vibeModel, {
```
After:
```typescript
      const response = await openRouterService.chat(messages, await this.getModel(), {
```

Apply the same replacement to all 9 occurrences. Run a search to confirm none remain:

```bash
grep -n "this\.vibeModel" src/services/portfolioAgent.ts
```

Expected: no output (zero matches).

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no new errors related to portfolioAgent.ts.

- [ ] **Step 5: Commit**

```bash
git add src/services/portfolioAgent.ts
git commit -m "fix: replace env-var vibeModel with dynamic getSelectedModel() in portfolioAgent"
```

---

## Task 4: Fix analysisReport.ts — Replace REPORT_MODEL

**Files:**
- Modify: `src/services/analysisReport.ts:14,21`

- [ ] **Step 1: Replace the import and constant**

Find in `src/services/analysisReport.ts`:
```typescript
import { openRouterService, OpenRouterMessage } from './openrouter';
```
Replace with:
```typescript
import { openRouterService, OpenRouterMessage } from './openrouter';
import { getSelectedModel } from './aiModel';
```

Find line 21:
```typescript
const REPORT_MODEL = import.meta.env.VITE_REPORT_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
```
Delete this line entirely.

- [ ] **Step 2: Replace REPORT_MODEL usages**

There are 5 occurrences at lines 415, 459, 502, 545, 603. Each is the second argument to `openRouterService.chat(...)` or `openRouterService.chatStream(...)`.

For each occurrence, replace `REPORT_MODEL` with `await getSelectedModel()`. Example before:
```typescript
      const response = await openRouterService.chat(messages, REPORT_MODEL, {
```
After:
```typescript
      const response = await openRouterService.chat(messages, await getSelectedModel(), {
```

Confirm no occurrences remain:
```bash
grep -n "REPORT_MODEL" src/services/analysisReport.ts
```
Expected: no output.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: passes cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/services/analysisReport.ts
git commit -m "fix: replace REPORT_MODEL env var with dynamic getSelectedModel() in analysisReport"
```

---

## Task 5: Fix openrouter.ts — Error messages + model wiring

**Files:**
- Modify: `src/services/openrouter.ts:14,67,163,167`

- [ ] **Step 1: Add aiModel import**

In `src/services/openrouter.ts`, add to the existing import block:
```typescript
import { getSelectedModel } from './aiModel';
```

- [ ] **Step 2: Fix the error message on line 67**

Find:
```typescript
        throw new Error('AI service not configured. Please set up your OpenRouter API key in the .env file.');
```
Replace with:
```typescript
        throw new Error('AI service not configured. Please add your OpenRouter API key in Settings → API Keys.');
```

- [ ] **Step 3: Fix generatePortfolioInsight to pass model**

Find:
```typescript
  async generatePortfolioInsight(portfolioData: unknown): Promise<string> {
    return invokeWithResilience<string>('ai_generate_portfolio_insight', { portfolioData });
  }
```
Replace with:
```typescript
  async generatePortfolioInsight(portfolioData: unknown): Promise<string> {
    const model = await getSelectedModel();
    return invokeWithResilience<string>('ai_generate_portfolio_insight', { portfolioData, model });
  }
```

- [ ] **Step 4: Fix chatWithAssistant to pass model**

Find:
```typescript
  async chatWithAssistant(userMessage: string, conversationHistory: OpenRouterMessage[] = []): Promise<string> {
    return invokeWithResilience<string>('ai_chat_assistant', {
      message: userMessage,
      history: conversationHistory,
    });
  }
```
Replace with:
```typescript
  async chatWithAssistant(userMessage: string, conversationHistory: OpenRouterMessage[] = []): Promise<string> {
    const model = await getSelectedModel();
    return invokeWithResilience<string>('ai_chat_assistant', {
      message: userMessage,
      history: conversationHistory,
      model,
    });
  }
```

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: passes cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/services/openrouter.ts
git commit -m "fix: wire model into chatWithAssistant/generatePortfolioInsight; fix error messages"
```

---

## Task 6: Fix Rust backend — openrouter_service.rs model params

**Files:**
- Modify: `src-tauri/src/services/openrouter_service.rs:175-211`

- [ ] **Step 1: Add model param to generate_portfolio_insight**

Find in `src-tauri/src/services/openrouter_service.rs`:
```rust
    /// Generate portfolio insight
    pub async fn generate_portfolio_insight(
        &self,
        portfolio_data: serde_json::Value,
    ) -> Result<String, String> {
```
Replace with:
```rust
    /// Generate portfolio insight
    pub async fn generate_portfolio_insight(
        &self,
        portfolio_data: serde_json::Value,
        model: Option<String>,
    ) -> Result<String, String> {
```

Find the call at the end of that function (line ~190):
```rust
        self.chat(messages, None, Some(0.7), Some(2000)).await
```
Replace with:
```rust
        self.chat(messages, model, Some(0.7), Some(2000)).await
```

- [ ] **Step 2: Add model param to chat_with_assistant**

Find:
```rust
    /// Chat with assistant
    pub async fn chat_with_assistant(
        &self,
        user_message: String,
        conversation_history: Vec<OpenRouterMessage>,
    ) -> Result<String, String> {
```
Replace with:
```rust
    /// Chat with assistant
    pub async fn chat_with_assistant(
        &self,
        user_message: String,
        conversation_history: Vec<OpenRouterMessage>,
        model: Option<String>,
    ) -> Result<String, String> {
```

Find the `self.chat(...)` call at the end of `chat_with_assistant` (line ~211):
```rust
        self.chat(messages, None, Some(0.7), Some(2000)).await
```
Replace with:
```rust
        self.chat(messages, model, Some(0.7), Some(2000)).await
```

- [ ] **Step 3: Fix .env error message in chat()**

Find in the `chat()` method (around line 94-96):
```rust
        let api_key = self.api_key.as_ref().ok_or_else(|| {
            "OpenRouter API key not configured. Set OPENROUTER_API_KEY in .env file.".to_string()
        })?;
```
Replace with:
```rust
        let api_key = self.api_key.as_ref().ok_or_else(|| {
            "OpenRouter API key not configured. Add it in Settings → API Keys.".to_string()
        })?;
```

- [ ] **Step 4: Cargo check**

```bash
cd src-tauri && cargo check 2>&1 | head -40
```

Expected: errors only for callers of the changed functions (in `ai.rs`) — that's expected and fixed in the next task.

---

## Task 7: Fix Rust backend — ai.rs model params + hardcoded fallback

**Files:**
- Modify: `src-tauri/src/api/commands/ai.rs`

- [ ] **Step 1: Add DEFAULT_FREE_MODEL constant at top of file**

After the existing `use` statements in `src-tauri/src/api/commands/ai.rs`, add:
```rust
const DEFAULT_FREE_MODEL: &str = "meta-llama/llama-3.3-70b-instruct:free";
```

- [ ] **Step 2: Add model param to ai_generate_portfolio_insight**

Find:
```rust
#[tauri::command]
pub async fn ai_generate_portfolio_insight(
    portfolio_data: serde_json::Value,
) -> Result<String, String> {
```
Replace with:
```rust
#[tauri::command]
pub async fn ai_generate_portfolio_insight(
    portfolio_data: serde_json::Value,
    model: Option<String>,
) -> Result<String, String> {
```

Find the call inside that function:
```rust
    match OPENROUTER_SERVICE
        .generate_portfolio_insight(portfolio_data.clone())
        .await
```
Replace with:
```rust
    match OPENROUTER_SERVICE
        .generate_portfolio_insight(portfolio_data.clone(), model)
        .await
```

- [ ] **Step 3: Add model param to ai_chat_assistant**

Find:
```rust
#[tauri::command]
pub async fn ai_chat_assistant(
    message: String,
    history: Vec<OpenRouterMessage>,
) -> Result<String, String> {
```
Replace with:
```rust
#[tauri::command]
pub async fn ai_chat_assistant(
    message: String,
    history: Vec<OpenRouterMessage>,
    model: Option<String>,
) -> Result<String, String> {
```

Find the call inside that function:
```rust
    match OPENROUTER_SERVICE
        .chat_with_assistant(message.clone(), history.clone())
        .await
```
Replace with:
```rust
    match OPENROUTER_SERVICE
        .chat_with_assistant(message.clone(), history.clone(), model)
        .await
```

- [ ] **Step 4: Fix hardcoded model in ai_chat_stream**

Find in `ai_chat_stream` (around line 116):
```rust
    let model = model.unwrap_or_else(|| "meta-llama/llama-3.3-70b-instruct:free".to_string());
```
Replace with:
```rust
    let model = model.unwrap_or_else(|| DEFAULT_FREE_MODEL.to_string());
```

- [ ] **Step 5: Cargo check — should now be clean**

```bash
cd src-tauri && cargo check 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Run Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/openrouter_service.rs src-tauri/src/api/commands/ai.rs
git commit -m "fix: add model param to Rust AI commands; fix hardcoded fallback and error messages"
```

---

## Task 8: Add AI Configuration Card to SettingsPage.tsx

**Files:**
- Modify: `src/components/SettingsPage.tsx`

- [ ] **Step 1: Add Bot icon to lucide import**

Find line 8:
```typescript
import { User, Camera, Briefcase, MapPin, Globe, Mail, Shield, Trash2, Save, CheckCircle, Eye, EyeOff, CheckCircle2, LogIn, LogOut, User as UserIcon, Crown, Lock, Unlock, KeyRound, Receipt } from 'lucide-react';
```
Replace with:
```typescript
import { User, Camera, Briefcase, MapPin, Globe, Mail, Shield, Trash2, Save, CheckCircle, Eye, EyeOff, CheckCircle2, LogIn, LogOut, User as UserIcon, Crown, Lock, Unlock, KeyRound, Receipt, Bot } from 'lucide-react';
```

- [ ] **Step 2: Add freeModels imports after the CSS import (line 23)**

Find:
```typescript
import './SettingsPage.css';
```
Replace with:
```typescript
import './SettingsPage.css';
import { FREE_MODELS, DEFAULT_FREE_MODEL } from '../constants/freeModels';
import { getSelectedModel, setSelectedModel } from '../services/aiModel';
```

- [ ] **Step 3: Add selectedAiModel to SettingsState interface**

Find:
```typescript
interface SettingsState {
  saved: boolean;
  apiKeys: Record<string, string>;
  apiKeyStatuses: Record<string, boolean>;
  showKeys: Record<string, boolean>;
  apiKeysSaved: boolean;
  vaultExists: boolean;
  vaultUnlocked: boolean;
  vaultPassword: string;
  vaultConfirm: string;
  vaultError: string;
  vaultLoading: boolean;
  form: UserProfile;
}
```
Replace with:
```typescript
interface SettingsState {
  saved: boolean;
  apiKeys: Record<string, string>;
  apiKeyStatuses: Record<string, boolean>;
  showKeys: Record<string, boolean>;
  apiKeysSaved: boolean;
  vaultExists: boolean;
  vaultUnlocked: boolean;
  vaultPassword: string;
  vaultConfirm: string;
  vaultError: string;
  vaultLoading: boolean;
  form: UserProfile;
  selectedAiModel: string;
  aiModelSaved: boolean;
}
```

- [ ] **Step 4: Add new action types**

Find:
```typescript
type SettingsAction =
  | { type: 'SET_SAVED'; payload: boolean }
```
Replace with:
```typescript
type SettingsAction =
  | { type: 'SET_SAVED'; payload: boolean }
  | { type: 'SET_AI_MODEL'; payload: string }
  | { type: 'SET_AI_MODEL_SAVED'; payload: boolean }
```

- [ ] **Step 5: Add cases to reducer**

Find:
```typescript
    case 'SET_FORM_FIELD':
      return { ...state, form: { ...state.form, [action.payload.field]: action.payload.value } };
    default:
      return state;
```
Replace with:
```typescript
    case 'SET_FORM_FIELD':
      return { ...state, form: { ...state.form, [action.payload.field]: action.payload.value } };
    case 'SET_AI_MODEL':
      return { ...state, selectedAiModel: action.payload };
    case 'SET_AI_MODEL_SAVED':
      return { ...state, aiModelSaved: action.payload };
    default:
      return state;
```

- [ ] **Step 6: Add initial state fields**

Find in `makeInitialSettingsState`:
```typescript
  return {
    saved: false,
    apiKeys: {},
    apiKeyStatuses: {},
    showKeys: {},
    apiKeysSaved: false,
    vaultExists: false,
    vaultUnlocked: false,
    vaultPassword: '',
    vaultConfirm: '',
    vaultError: '',
    vaultLoading: false,
    form: { ...profile },
  };
```
Replace with:
```typescript
  return {
    saved: false,
    apiKeys: {},
    apiKeyStatuses: {},
    showKeys: {},
    apiKeysSaved: false,
    vaultExists: false,
    vaultUnlocked: false,
    vaultPassword: '',
    vaultConfirm: '',
    vaultError: '',
    vaultLoading: false,
    form: { ...profile },
    selectedAiModel: DEFAULT_FREE_MODEL,
    aiModelSaved: false,
  };
```

- [ ] **Step 7: Destructure new state fields in component**

Find the destructure block in `SettingsPage()`:
```typescript
  const {
    saved,
    apiKeys,
    apiKeyStatuses,
    showKeys,
    apiKeysSaved,
    vaultExists,
    vaultUnlocked,
    vaultPassword,
    vaultConfirm,
    vaultError,
    vaultLoading,
    form,
  } = state;
```
Replace with:
```typescript
  const {
    saved,
    apiKeys,
    apiKeyStatuses,
    showKeys,
    apiKeysSaved,
    vaultExists,
    vaultUnlocked,
    vaultPassword,
    vaultConfirm,
    vaultError,
    vaultLoading,
    form,
    selectedAiModel,
    aiModelSaved,
  } = state;
```

- [ ] **Step 8: Load selectedAiModel in useEffect**

Find the `useEffect` block ending with:
```typescript
    invokeWithResilience<string | null>('load_setting', { key: 'marginal_tax_rate' })
      .then(v => {
        const parsed = v ? parseFloat(v) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0.6) {
          setMarginalRatePct(parsed * 100);
        }
      })
      .catch(() => {});
  }, []);
```
Replace with:
```typescript
    invokeWithResilience<string | null>('load_setting', { key: 'marginal_tax_rate' })
      .then(v => {
        const parsed = v ? parseFloat(v) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0.6) {
          setMarginalRatePct(parsed * 100);
        }
      })
      .catch(() => {});
    getSelectedModel()
      .then(model => dispatch({ type: 'SET_AI_MODEL', payload: model }))
      .catch(() => {});
  }, []);
```

- [ ] **Step 9: Add handleSaveAiModel callback**

After the `handleSaveApiKeys` callback, add:
```typescript
  const handleSaveAiModel = useCallback(async () => {
    try {
      await setSelectedModel(selectedAiModel);
      dispatch({ type: 'SET_AI_MODEL_SAVED', payload: true });
      setTimeout(() => dispatch({ type: 'SET_AI_MODEL_SAVED', payload: false }), 2000);
    } catch {
      // silent — model stays in state, next call will retry
    }
  }, [selectedAiModel]);
```

- [ ] **Step 10: Add AI Configuration card to JSX**

Find the Tax Settings closing `</div>` followed by the Account section comment:
```tsx
        </div>

        {/* Account Section */}
```
Insert the new card between them:
```tsx
        </div>

        {/* AI Configuration Section */}
        <div className="card settings-card">
          <h3><Bot size={20} /> AI Model</h3>
          <p className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>
            Choose the AI model used for portfolio generation, reports, and chat. All models are free via OpenRouter.
          </p>
          <div className="form-group">
            <label htmlFor="ai-model">Model</label>
            <select
              id="ai-model"
              value={selectedAiModel}
              onChange={e => dispatch({ type: 'SET_AI_MODEL', payload: e.target.value })}
              style={{ width: '320px' }}
            >
              {FREE_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.recommended ? ' (recommended)' : ''} — {(m.contextWindow / 1000).toFixed(0)}k ctx
                </option>
              ))}
            </select>
          </div>
          {(() => {
            const m = FREE_MODELS.find(fm => fm.id === selectedAiModel);
            return m ? (
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '6px' }}>
                {m.description}
              </p>
            ) : null;
          })()}
          <button
            className="btn btn-primary"
            onClick={handleSaveAiModel}
            style={{ marginTop: '12px' }}
          >
            {aiModelSaved ? <><CheckCircle2 size={16} /> Saved!</> : <><Save size={16} /> Save Model</>}
          </button>
        </div>

        {/* Account Section */}
```

- [ ] **Step 11: Run lint**

```bash
npm run lint
```

Expected: passes cleanly.

- [ ] **Step 12: Commit**

```bash
git add src/components/SettingsPage.tsx
git commit -m "feat: add AI Model selector to Settings with SQLite persistence"
```

---

## Task 9: Final verification

- [ ] **Step 1: TypeScript lint — full pass**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 2: Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -20
```

Expected: all tests pass, `populate_runtime_keys` tests still green.

- [ ] **Step 3: Rust check (full)**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: no errors or warnings about unused variables from our changes.

- [ ] **Step 4: Confirm no old model references remain**

```bash
grep -rn "minimax/minimax-01\|VITE_VIBE_STUDIO_MODEL\|VITE_REPORT_MODEL\|this\.vibeModel\|REPORT_MODEL" src/
```

Expected: no output (all removed).

- [ ] **Step 5: Confirm DEFAULT_FREE_MODEL is the only fallback**

```bash
grep -rn "meta-llama/llama-3.3-70b-instruct:free" src/ src-tauri/src/
```

Expected: appears only in `freeModels.ts` (as the recommended/default entry) and `ai.rs` via `DEFAULT_FREE_MODEL` constant. Not hardcoded elsewhere.

- [ ] **Step 6: Final commit**

```bash
git add -u
git commit -m "chore: final verification — OpenRouter free models migration complete"
```

---

## Self-Review Notes

| Spec requirement | Covered by |
|-----------------|------------|
| Limit to free models only | Task 1 (catalog) + Task 8 (dropdown restricted to catalog) |
| Global model selector in Settings | Task 8 |
| Persisted to SQLite | Task 2 (`setSelectedModel`) + Task 8 (`handleSaveAiModel`) |
| All AI features use selected model | Tasks 3, 4, 5 (frontend services) + Tasks 6, 7 (backend) |
| No `minimax/minimax-01` default | Task 3 removes `vibeModel` field |
| Error messages reference Settings | Tasks 5, 6 |
| No env vars as source of truth | Tasks 3, 4 remove env var usage |
| `cargo test` passes | Task 9 |
| `npm run lint` passes | Tasks 3, 4, 5, 8 each run lint |
| `.env.example` env vars kept as deprecated comments | Not yet done — add note to `.env.example` |

**Gap found:** `.env.example` should have `VITE_VIBE_STUDIO_MODEL` and `VITE_REPORT_MODEL` commented out with a deprecation note. Add this to Task 3 or 4's commit. Specifically, find those vars in `.env.example` and prefix comments: `# DEPRECATED — model is now configured in Settings → AI Model`.
