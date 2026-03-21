# FlowFolio Product Gaps — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 25 product gaps identified in the product owner review, spanning launch readiness, revenue infrastructure, UX polish, portfolio features, and competitive differentiation.

**Architecture:** Changes span frontend (React/TypeScript), backend (Rust/Tauri), and new infrastructure (Hono auth server). Each phase groups independent tasks that can be parallelized. Frontend changes follow existing patterns (invokeWithResilience, toast notifications, createLogger). Backend changes add new Tauri commands and SQLite tables.

**Tech Stack:** React 19, TypeScript 5.8, Tauri 2, Rust, SQLite, Hono (auth server), Stripe SDK, Playwright

---

## Phase 1: Launch Readiness

### Task 1: Fix Landing Page Download Links

**Files:**
- Modify: `src/landing/components/DownloadSection.tsx`

- [ ] **Step 1: Read DownloadSection.tsx and identify placeholder URLs**

- [ ] **Step 2: Update download links to point to GitHub Releases latest**

Replace placeholder URLs with:
```typescript
const DOWNLOAD_URLS = {
  windows: 'https://github.com/vincrypt/flowfolio/releases/latest',
  macos: 'https://github.com/vincrypt/flowfolio/releases/latest',
  linux: 'https://github.com/vincrypt/flowfolio/releases/latest',
};
```

All three point to `/releases/latest` which auto-redirects to the latest release page where users pick their platform. This is correct until per-platform direct download URLs exist from actual release artifacts.

- [ ] **Step 3: Verify landing page builds**

Run: `npm run build:landing`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/landing/components/DownloadSection.tsx
git commit -m "fix: point download links to GitHub releases page"
```

---

### Task 2: Implement Stronghold Integration for API Keys

**Files:**
- Modify: `src-tauri/src/modules/security/mod.rs`
- Modify: `src-tauri/src/lib.rs` (save_api_keys and get_api_key_statuses commands)

- [ ] **Step 1: Read current security/mod.rs stubs and lib.rs API key commands**

- [ ] **Step 2: Implement SecurityManager with Stronghold**

Replace the TODO stubs in `modules/security/mod.rs` with actual Stronghold integration:

```rust
use tauri::AppHandle;
use tauri_plugin_stronghold::stronghold::Stronghold;
use std::collections::HashMap;

const STRONGHOLD_VAULT: &[u8] = b"flowfolio-api-keys";
const STRONGHOLD_RECORD: &[u8] = b"api-keys-record";

pub struct SecurityManager;

impl SecurityManager {
    pub async fn store_api_key(app: &AppHandle, key_name: &str, key_value: &str) -> Result<(), String> {
        let stronghold = app.stronghold();
        let client = stronghold
            .create_client(STRONGHOLD_VAULT)
            .or_else(|_| stronghold.load_client(STRONGHOLD_VAULT))
            .map_err(|e| format!("Stronghold client error: {}", e))?;

        let store = client.store();
        store
            .insert(key_name.as_bytes().to_vec(), key_value.as_bytes().to_vec(), None)
            .map_err(|e| format!("Stronghold store error: {}", e))?;

        stronghold.save().map_err(|e| format!("Stronghold save error: {}", e))?;
        Ok(())
    }

    pub async fn get_api_key(app: &AppHandle, key_name: &str) -> Result<Option<String>, String> {
        let stronghold = app.stronghold();
        let client = stronghold
            .load_client(STRONGHOLD_VAULT)
            .map_err(|_| "No keys stored yet".to_string());

        match client {
            Ok(client) => {
                let store = client.store();
                match store.get(key_name.as_bytes()) {
                    Ok(Some(value)) => Ok(Some(String::from_utf8_lossy(&value).to_string())),
                    Ok(None) => Ok(None),
                    Err(_) => Ok(None),
                }
            }
            Err(_) => Ok(None),
        }
    }

    pub async fn has_api_key(app: &AppHandle, key_name: &str) -> bool {
        matches!(Self::get_api_key(app, key_name).await, Ok(Some(_)))
    }
}
```

- [ ] **Step 3: Update save_api_keys command in lib.rs to use Stronghold**

Find the `save_api_keys` command and update it to use `SecurityManager::store_api_key` instead of tauri-plugin-store.

- [ ] **Step 4: Update get_api_key_statuses command to use Stronghold**

Find the `get_api_key_statuses` command and update it to use `SecurityManager::has_api_key`.

- [ ] **Step 5: Update EnhancedMarketDataService to read keys from Stronghold**

In the service initialization in `lib.rs`, after Stronghold is available, read API keys from Stronghold first, then fall back to env vars.

- [ ] **Step 6: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/security/mod.rs src-tauri/src/lib.rs
git commit -m "feat: implement Stronghold integration for encrypted API key storage"
```

---

### Task 3: Add Code Signing Configuration

**Files:**
- Modify: `.github/workflows/release.yml`
- Create: `docs/CODE_SIGNING.md`

- [ ] **Step 1: Read current release workflow**

- [ ] **Step 2: Add code signing placeholders to release workflow**

Add environment variables and signing steps for macOS (Apple Developer ID) and Windows (certificate-based signing). Use GitHub Secrets placeholders:

For macOS:
```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

For Windows:
```yaml
env:
  WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
  WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
```

- [ ] **Step 3: Add Tauri updater plugin configuration**

Add `tauri-plugin-updater` to `Cargo.toml` and configure the updater endpoint in `tauri.conf.json` pointing to GitHub Releases.

- [ ] **Step 4: Add macOS build job to release workflow**

The current workflow is missing macOS. Add a `build-macos` job with `macos-latest` runner.

- [ ] **Step 5: Write CODE_SIGNING.md with setup instructions**

Document what secrets need to be configured and how to obtain certificates.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml src-tauri/Cargo.toml src-tauri/tauri.conf.json docs/CODE_SIGNING.md
git commit -m "feat: add code signing config and auto-updater support"
```

---

### Task 4: Playwright E2E Tests

**Files:**
- Create: `e2e/landing/navigation.spec.ts`
- Create: `e2e/landing/download.spec.ts`
- Create: `e2e/app/smoke.spec.ts`
- Create: `e2e/app/dashboard.spec.ts`
- Create: `e2e/app/vibe-studio.spec.ts`
- Create: `e2e/app/portfolio.spec.ts`
- Create: `e2e/app/journal.spec.ts`
- Create: `e2e/app/settings.spec.ts`
- Create: `e2e/app/fixtures.ts`

- [ ] **Step 1: Create test fixtures with Tauri invoke mocks**

`e2e/app/fixtures.ts` — mock `window.__TAURI_INTERNALS__` for web mode:
```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args?: any) => {
          const mocks: Record<string, any> = {
            health_check: 'ok',
            list_templates: ['Growth', 'Value', 'Balanced', 'Momentum', 'Dividend', 'Quality'],
            get_default_plan: { name: 'Default', universe: {}, filters: [], ranking: { factors: [] }, portfolio: {}, cadence: {}, risk: {} },
            list_universes: [],
            list_saved_plans: [],
            load_setting: null,
            get_api_key_statuses: {},
            list_alerts: [],
            list_schedules: [],
            get_cache_stats: { memory_entries: 0, db_entries: 0 },
          };
          return mocks[cmd] ?? null;
        },
      };
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 2: Write landing page navigation tests**

```typescript
// e2e/landing/navigation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads and shows hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('navbar links are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('download section exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/download/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Write landing page download tests**

- [ ] **Step 4: Write app smoke test**

```typescript
// e2e/app/smoke.spec.ts
import { test, expect } from './fixtures';

test.describe('App Smoke Tests', () => {
  test('app loads without crash', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FlowFolio|Vibe Invest/i);
  });

  test('sidebar navigation renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('dashboard tab is default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/dashboard/i).first()).toBeVisible();
  });
});
```

- [ ] **Step 5: Write dashboard, vibe-studio, portfolio, journal, settings tests**

Each test file covers: tab loads, key UI elements visible, basic interactions work.

- [ ] **Step 6: Run all E2E tests**

Run: `npx playwright test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add e2e/
git commit -m "feat: add Playwright E2E test suite for landing page and app"
```

---

## Phase 2: Revenue Infrastructure

### Task 5: Auth Backend Server (Hono)

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/routes/user.ts`
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/client.ts`
- Create: `server/.env.example`

- [ ] **Step 1: Initialize server project**

```bash
mkdir -p server/src/routes server/src/middleware server/src/db
cd server && npm init -y
npm install hono @hono/node-server jose pg dotenv bcryptjs
npm install -D typescript @types/node @types/pg @types/bcryptjs tsx
```

- [ ] **Step 2: Create Postgres schema**

```sql
-- server/src/db/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 3: Create database client**

- [ ] **Step 4: Create auth middleware (JWT verification)**

```typescript
// server/src/middleware/auth.ts
import { Context, Next } from 'hono';
import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const { payload } = await jose.jwtVerify(header.slice(7), JWT_SECRET);
    c.set('userId', payload.user_id);
    c.set('tier', payload.tier);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}
```

- [ ] **Step 5: Create auth routes (Google OAuth, refresh, logout)**

- [ ] **Step 6: Create user routes (GET /user/me, PATCH /user/me)**

- [ ] **Step 7: Create main server entry point**

```typescript
// server/src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';

const app = new Hono();
app.use('*', cors({ origin: '*' }));
app.route('/auth', authRoutes);
app.route('/user', userRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port: 3001 });
console.log('FlowFolio API server running on :3001');
```

- [ ] **Step 8: Add start script and verify server compiles**

Run: `cd server && npx tsx src/index.ts`
Expected: Server starts on port 3001

- [ ] **Step 9: Commit**

```bash
git add server/
git commit -m "feat: add Hono auth backend server with Google OAuth and JWT"
```

---

### Task 6: Stripe Integration

**Files:**
- Modify: `server/package.json` (add stripe dependency)
- Create: `server/src/routes/stripe.ts`
- Create: `server/src/routes/checkout.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
cd server && npm install stripe
```

- [ ] **Step 2: Create checkout route**

```typescript
// server/src/routes/checkout.ts
import { Hono } from 'hono';
import Stripe from 'stripe';
import { authMiddleware } from '../middleware/auth';

const checkout = new Hono();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_IDS: Record<string, string> = {
  ai_monthly: process.env.STRIPE_AI_MONTHLY_PRICE_ID!,
  ai_annual: process.env.STRIPE_AI_ANNUAL_PRICE_ID!,
  sync_monthly: process.env.STRIPE_SYNC_MONTHLY_PRICE_ID!,
  sync_annual: process.env.STRIPE_SYNC_ANNUAL_PRICE_ID!,
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
  pro_annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
};

checkout.post('/create-session', authMiddleware, async (c) => {
  const { plan } = await c.req.json();
  const priceId = PRICE_IDS[plan];
  if (!priceId) return c.json({ error: 'Invalid plan' }, 400);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_URL}/settings?checkout=success`,
    cancel_url: `${process.env.APP_URL}/settings?checkout=cancel`,
    client_reference_id: c.get('userId'),
  });

  return c.json({ url: session.url });
});

export { checkout as checkoutRoutes };
```

- [ ] **Step 3: Create Stripe webhook handler**

Handle `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated` events. Update `subscription_tier` in Postgres.

- [ ] **Step 4: Register routes in server/src/index.ts**

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: add Stripe checkout and webhook integration"
```

---

### Task 7: Privacy Disclosure for AI Features

**Files:**
- Create: `src/components/PrivacyDisclosure.tsx`
- Modify: `src/components/VibeStudio.tsx` (wrap AI chat mode entry)

- [ ] **Step 1: Create PrivacyDisclosure component**

```typescript
// src/components/PrivacyDisclosure.tsx
import React, { useState, useEffect } from 'react';
import { invokeWithResilience } from '@/services/apiClient';
import { ShieldAlert } from 'lucide-react';

interface Props {
  featureName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const PrivacyDisclosure: React.FC<Props> = ({ featureName, onAccept, onDecline }) => {
  const [accepted, setAccepted] = useState(false);
  const settingKey = `privacy_accepted_${featureName}`;

  useEffect(() => {
    invokeWithResilience<string | null>('load_setting', { key: settingKey })
      .then(val => { if (val === 'true') { setAccepted(true); onAccept(); } });
  }, []);

  if (accepted) return null;

  const handleAccept = async () => {
    await invokeWithResilience('save_setting', { key: settingKey, value: 'true' });
    setAccepted(true);
    onAccept();
  };

  return (
    <div className="privacy-disclosure-overlay">
      <div className="privacy-disclosure-modal">
        <ShieldAlert size={32} />
        <h3>Privacy Notice</h3>
        <p>This feature sends data to OpenRouter's API for AI analysis. Your data is:</p>
        <ul>
          <li>Sent encrypted over HTTPS</li>
          <li>Not stored on FlowFolio's servers</li>
          <li>Subject to <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">OpenRouter's privacy policy</a></li>
        </ul>
        <p>No data leaves your device without this explicit consent.</p>
        <div className="privacy-actions">
          <button className="btn-secondary" onClick={onDecline}>Decline</button>
          <button className="btn-primary" onClick={handleAccept}>I Understand, Continue</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add CSS for privacy disclosure modal**

- [ ] **Step 3: Wire into VibeStudio.tsx before AI chat mode**

Show `PrivacyDisclosure` before allowing AI chat. If already accepted, skip.

- [ ] **Step 4: Commit**

```bash
git add src/components/PrivacyDisclosure.tsx src/components/VibeStudio.tsx
git commit -m "feat: add privacy disclosure for AI features"
```

---

### Task 8: Backend Tier Validation for AI Commands

**Files:**
- Modify: `src-tauri/src/lib.rs` (ai_chat, ai_generate_portfolio_insight, ai_chat_assistant commands)

- [ ] **Step 1: Add tier validation helper**

Add a helper function in lib.rs that reads the user's tier from settings:
```rust
async fn get_user_tier() -> String {
    let pool = DB_POOL.lock().await;
    if let Some(pool) = pool.as_ref() {
        if let Ok(row) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM user_settings WHERE key = 'subscription_tier'"
        ).fetch_optional(pool).await {
            return row.unwrap_or_else(|| "free".to_string());
        }
    }
    "free".to_string()
}
```

- [ ] **Step 2: Add tier check to AI commands**

At the top of `ai_chat`, `ai_generate_portfolio_insight`, `ai_chat_assistant`:
```rust
let tier = get_user_tier().await;
if tier != "ai" && tier != "pro" {
    return Err("AI features require an AI Suite or Pro subscription".to_string());
}
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add backend tier validation for AI commands"
```

---

## Phase 3: AI Improvements

### Task 9: AI Streaming via Tauri Events

**Files:**
- Modify: `src-tauri/src/services/openrouter_service.rs` (add streaming method)
- Modify: `src-tauri/src/lib.rs` (add streaming command)
- Modify: `src/services/openrouter.ts` (listen to events)
- Modify: `src/components/VibeStudio.tsx` (use streaming)

- [ ] **Step 1: Add streaming chat method to OpenRouterService in Rust**

```rust
pub async fn chat_stream(
    app: &tauri::AppHandle,
    messages: Vec<OpenRouterMessage>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let model = model.unwrap_or_else(|| "anthropic/claude-3-sonnet-20240229".to_string());
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.7),
        "max_tokens": max_tokens.unwrap_or(4096),
        "stream": true,
    });

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", Self::get_api_key()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    let mut full_response = String::new();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" { break; }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_response.push_str(content);
                        let _ = app.emit("ai-token", content);
                    }
                }
            }
        }
    }

    Ok(full_response)
}
```

- [ ] **Step 2: Add futures-util to Cargo.toml**

```toml
futures-util = "0.3"
```

- [ ] **Step 3: Add ai_chat_stream command in lib.rs**

```rust
#[tauri::command]
async fn ai_chat_stream(
    app: tauri::AppHandle,
    messages: Vec<serde_json::Value>,
    model: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    // Tier check
    let tier = get_user_tier().await;
    if tier != "ai" && tier != "pro" {
        return Err("AI features require an AI Suite or Pro subscription".to_string());
    }
    // Convert and stream
    OPENROUTER_SERVICE.chat_stream(&app, messages, model, temperature, max_tokens).await
}
```

Register in invoke_handler.

- [ ] **Step 4: Update frontend openrouter.ts to use event-based streaming**

```typescript
import { listen } from '@tauri-apps/api/event';

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const unlisten = await listen<string>('ai-token', (event) => {
    onToken(event.payload);
  });

  try {
    const result = await invokeWithResilience<string>('ai_chat_stream', {
      messages,
      model: options?.model,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    });
    return result;
  } finally {
    unlisten();
  }
}
```

- [ ] **Step 5: Update VibeStudio.tsx to use streaming**

Replace the synchronous AI chat call with `streamChat`, updating `streamingMessage` state on each token.

- [ ] **Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check && cd .. && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/ src/services/openrouter.ts src/components/VibeStudio.tsx
git commit -m "feat: implement AI streaming via Tauri events"
```

---

## Phase 4: UX Polish

### Task 10: Keyboard Shortcuts

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/App.tsx` (wire shortcuts)

- [ ] **Step 1: Create keyboard shortcut hook**

```typescript
// src/hooks/useKeyboardShortcuts.ts
import { useEffect, useCallback } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handler = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    let combo = '';
    if (meta) combo += 'mod+';
    if (e.shiftKey) combo += 'shift+';
    combo += key;

    if (shortcuts[combo]) {
      e.preventDefault();
      shortcuts[combo]();
    }

    // Escape always closes modals/overlays
    if (key === 'escape' && shortcuts['escape']) {
      shortcuts['escape']();
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
```

- [ ] **Step 2: Wire shortcuts in App.tsx**

```typescript
useKeyboardShortcuts({
  'mod+k': () => setShowCommandPalette(true),  // Task 11
  'mod+1': () => handleNavClick('dashboard'),
  'mod+2': () => handleNavClick('vibe-studio'),
  'mod+3': () => handleNavClick('portfolio'),
  'mod+4': () => handleNavClick('backtest'),
  'mod+5': () => handleNavClick('journal'),
  'mod+6': () => handleNavClick('watchlist'),
  'mod+7': () => handleNavClick('settings'),
  'escape': () => { setShowCommandPalette(false); },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/App.tsx
git commit -m "feat: add keyboard shortcuts for tab navigation"
```

---

### Task 11: Command Palette

**Files:**
- Create: `src/components/CommandPalette.tsx`
- Create: `src/components/CommandPalette.css`
- Modify: `src/App.tsx` (add state and render)

- [ ] **Step 1: Create CommandPalette component**

Features:
- `Cmd+K` to open
- Fuzzy search across: tabs, symbols, actions
- Arrow keys to navigate, Enter to select, Escape to close
- Recent items section
- Categories: Navigation, Actions, Symbols

```typescript
// src/components/CommandPalette.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import './CommandPalette.css';

interface Command {
  id: string;
  label: string;
  category: 'navigation' | 'action' | 'symbol';
  icon?: React.ReactNode;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<Props> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 10);
    const q = query.toLowerCase();
    return commands
      .filter(c => c.label.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, commands]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[selectedIndex]) { filtered[selectedIndex].action(); onClose(); }
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-input-wrapper">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search tabs, symbols, actions..."
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`command-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-label">{cmd.label}</span>
              <span className="command-category">{cmd.category}</span>
              <ArrowRight size={14} />
            </button>
          ))}
          {filtered.length === 0 && <div className="command-empty">No results found</div>}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create CommandPalette.css**

Style: centered modal, blurred backdrop, dark card, rounded inputs, keyboard-highlighted selected item.

- [ ] **Step 3: Wire into App.tsx**

Add `showCommandPalette` state, generate command list from tabs + symbol universes, render `<CommandPalette>`.

- [ ] **Step 4: Commit**

```bash
git add src/components/CommandPalette.tsx src/components/CommandPalette.css src/App.tsx
git commit -m "feat: add command palette (Cmd+K) for quick navigation"
```

---

### Task 12: Rate Limit UX Feedback

**Files:**
- Modify: `src/services/apiClient.ts` (expose rate limit state)
- Create: `src/components/RateLimitBanner.tsx`
- Modify: `src/App.tsx` (render banner)

- [ ] **Step 1: Extend ApiClient to track rate limit hits**

Add to ApiClient class:
```typescript
private rateLimitedUntil: number = 0;
private rateLimitProvider: string = '';

isRateLimited(): boolean { return Date.now() < this.rateLimitedUntil; }
getRateLimitInfo(): { provider: string; retryAfter: number } | null {
  if (!this.isRateLimited()) return null;
  return { provider: this.rateLimitProvider, retryAfter: Math.ceil((this.rateLimitedUntil - Date.now()) / 1000) };
}
```

In `recordFailure`, detect rate limit errors and set `rateLimitedUntil`.

- [ ] **Step 2: Create RateLimitBanner component**

A slim banner at the top of the app: "Data may be delayed - rate limit reached for {provider}. Refreshing in {countdown}s"

- [ ] **Step 3: Wire into App.tsx with 1-second interval check**

- [ ] **Step 4: Commit**

```bash
git add src/services/apiClient.ts src/components/RateLimitBanner.tsx src/App.tsx
git commit -m "feat: add rate limit UX feedback banner"
```

---

### Task 13: App.tsx State Management Refactor

**Files:**
- Create: `src/hooks/useAppState.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extract app state into useReducer hook**

Move the 20+ useState calls in App.tsx into a single `useReducer` in `useAppState.ts`:

```typescript
// src/hooks/useAppState.ts
import { useReducer } from 'react';

interface AppState {
  activeTab: string;
  status: string;
  plan: any;
  templates: string[];
  selectedTemplate: string;
  rankingsSymbols: string;
  scores: any[];
  isScoring: boolean;
  selectedScore: any;
  universes: any[];
  selectedUniverse: any;
  savedPlans: string[];
  marketPrices: Record<string, number>;
  isLoadingMarket: boolean;
  portfolioHoldings: any[];
  portfolioValue: number;
  analysisSymbol: string;
  showCommandPalette: boolean;
  isSidebarCollapsed: boolean;
  isMobileMenuOpen: boolean;
}

type AppAction =
  | { type: 'SET_TAB'; tab: string }
  | { type: 'SET_PLAN'; plan: any }
  | { type: 'SET_TEMPLATES'; templates: string[] }
  | { type: 'SET_SCORES'; scores: any[] }
  | { type: 'SET_SCORING'; isScoring: boolean }
  | { type: 'SET_UNIVERSES'; universes: any[] }
  | { type: 'SET_HOLDINGS'; holdings: any[]; value: number }
  | { type: 'SET_ANALYSIS_SYMBOL'; symbol: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  // ... etc

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_TAB': return { ...state, activeTab: action.tab };
    case 'SET_PLAN': return { ...state, plan: action.plan };
    case 'SET_TEMPLATES': return { ...state, templates: action.templates };
    case 'SET_SCORES': return { ...state, scores: action.scores };
    case 'SET_SCORING': return { ...state, isScoring: action.isScoring };
    case 'SET_UNIVERSES': return { ...state, universes: action.universes };
    case 'SET_HOLDINGS': return { ...state, portfolioHoldings: action.holdings, portfolioValue: action.value };
    case 'SET_ANALYSIS_SYMBOL': return { ...state, analysisSymbol: action.symbol };
    case 'TOGGLE_SIDEBAR': return { ...state, isSidebarCollapsed: !state.isSidebarCollapsed };
    case 'TOGGLE_COMMAND_PALETTE': return { ...state, showCommandPalette: !state.showCommandPalette };
    default: return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return { state, dispatch };
}
```

- [ ] **Step 2: Refactor App.tsx to use useAppState**

Replace individual useState calls with dispatch calls.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppState.ts src/App.tsx
git commit -m "refactor: extract App.tsx state into useReducer"
```

---

## Phase 5: Portfolio Features

### Task 14: Transaction History

**Files:**
- Modify: `src-tauri/src/lib.rs` (new table + commands)
- Create: `src/components/TransactionHistory.tsx`
- Modify: `src/PortfolioTab.tsx` (integrate)

- [ ] **Step 1: Add transactions table to SQLite schema**

In `init_local_database()`:
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'buy', 'sell', 'dividend'
  shares REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  fees REAL DEFAULT 0,
  notes TEXT,
  executed_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)
```

- [ ] **Step 2: Add Tauri commands**

```rust
#[tauri::command]
async fn record_transaction(id: String, portfolio_name: String, symbol: String,
    action: String, shares: f64, price: f64, total: f64, fees: f64,
    notes: Option<String>, executed_at: String) -> Result<(), String>

#[tauri::command]
async fn list_transactions(portfolio_name: String) -> Result<Vec<serde_json::Value>, String>

#[tauri::command]
async fn delete_transaction(id: String) -> Result<(), String>
```

- [ ] **Step 3: Register commands in invoke_handler**

- [ ] **Step 4: Create TransactionHistory.tsx component**

Table with: Date, Symbol, Action (buy/sell/dividend), Shares, Price, Total, Notes. Sortable by date. Filter by symbol.

- [ ] **Step 5: Integrate into PortfolioTab.tsx**

Add a collapsible "Transaction History" section. When user adds/removes holdings, auto-record a transaction.

- [ ] **Step 6: Verify it compiles**

Run: `cd src-tauri && cargo check && cd .. && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs src/components/TransactionHistory.tsx src/PortfolioTab.tsx
git commit -m "feat: add transaction history tracking for portfolio"
```

---

### Task 15: Portfolio Performance Tracking Over Time

**Files:**
- Modify: `src-tauri/src/lib.rs` (new table + commands)
- Create: `src/components/PortfolioPerformanceChart.tsx`
- Modify: `src/PortfolioTab.tsx`

- [ ] **Step 1: Add portfolio_snapshots table**

```sql
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  total_value REAL NOT NULL,
  cash REAL NOT NULL,
  holdings_json TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(portfolio_name, snapshot_date)
)
```

- [ ] **Step 2: Add Tauri commands**

```rust
#[tauri::command]
async fn save_portfolio_snapshot(portfolio_name: String, total_value: f64,
    cash: f64, holdings_json: String) -> Result<(), String>

#[tauri::command]
async fn get_portfolio_snapshots(portfolio_name: String,
    days: Option<i32>) -> Result<Vec<serde_json::Value>, String>
```

- [ ] **Step 3: Create PortfolioPerformanceChart.tsx**

Line chart (Recharts) showing portfolio value over time. Options: 1W, 1M, 3M, 6M, 1Y, ALL. Shows total return % and annualized return.

- [ ] **Step 4: Auto-snapshot on portfolio update**

In PortfolioTab, after `updatePrices()` completes, call `save_portfolio_snapshot` once per day (check last snapshot date).

- [ ] **Step 5: Integrate chart into PortfolioTab**

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/components/PortfolioPerformanceChart.tsx src/PortfolioTab.tsx
git commit -m "feat: add portfolio performance tracking with historical chart"
```

---

### Task 16: Benchmark Comparison

**Files:**
- Modify: `src/components/PortfolioPerformanceChart.tsx` (add benchmark overlay)

- [ ] **Step 1: Fetch benchmark historical prices**

When portfolio chart loads, also fetch SPY historical prices via `get_historical_prices` command for the same date range.

- [ ] **Step 2: Normalize both series to percentage returns from start date**

```typescript
const normalizeToPercent = (prices: number[]) =>
  prices.map(p => ((p - prices[0]) / prices[0]) * 100);
```

- [ ] **Step 3: Add SPY line to the Recharts LineChart**

Second `<Line>` with dashed style, different color, labeled "S&P 500".

- [ ] **Step 4: Add benchmark selector**

Dropdown: SPY, QQQ, DIA, IWM. Default: SPY.

- [ ] **Step 5: Commit**

```bash
git add src/components/PortfolioPerformanceChart.tsx
git commit -m "feat: add benchmark comparison overlay to portfolio chart"
```

---

### Task 17: Dividend Tracking

**Files:**
- Modify: `src-tauri/src/lib.rs` (dividend commands)
- Create: `src/components/DividendTracker.tsx`
- Modify: `src/PortfolioTab.tsx`

- [ ] **Step 1: Add dividends table**

```sql
CREATE TABLE IF NOT EXISTS dividends (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount_per_share REAL NOT NULL,
  total_amount REAL NOT NULL,
  shares_held REAL NOT NULL,
  ex_date TEXT NOT NULL,
  pay_date TEXT,
  reinvested INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)
```

- [ ] **Step 2: Add Tauri commands**

```rust
#[tauri::command]
async fn record_dividend(id: String, portfolio_name: String, symbol: String,
    amount_per_share: f64, total_amount: f64, shares_held: f64,
    ex_date: String, pay_date: Option<String>, reinvested: bool) -> Result<(), String>

#[tauri::command]
async fn list_dividends(portfolio_name: String) -> Result<Vec<serde_json::Value>, String>

#[tauri::command]
async fn get_dividend_summary(portfolio_name: String) -> Result<serde_json::Value, String>
// Returns: total_dividends_ytd, total_dividends_all_time, yield_on_cost, monthly_breakdown
```

- [ ] **Step 3: Create DividendTracker component**

Shows: YTD dividend income, all-time income, yield on cost, monthly bar chart, per-symbol breakdown.

- [ ] **Step 4: Integrate into PortfolioTab as collapsible section**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/components/DividendTracker.tsx src/PortfolioTab.tsx
git commit -m "feat: add dividend tracking with yield and income analytics"
```

---

### Task 18: Sector/Geographic Exposure

**Files:**
- Create: `src/components/ExposureChart.tsx`
- Modify: `src/components/RiskDashboard.tsx`

- [ ] **Step 1: Create ExposureChart component**

Uses FundamentalMetrics data (already fetched via `get_fundamentals_batch`) which includes `sector` and `industry` fields.

```typescript
// src/components/ExposureChart.tsx
// Pie chart showing portfolio allocation by sector
// Uses Recharts PieChart
// Groups holdings by sector from fundamentals data
// Shows: sector name, % allocation, dollar value
```

- [ ] **Step 2: Fetch fundamentals for all holdings on RiskDashboard load**

Call `get_fundamentals_batch` with all holding symbols. Extract sector/industry.

- [ ] **Step 3: Add sector pie chart and industry breakdown table to RiskDashboard**

- [ ] **Step 4: Commit**

```bash
git add src/components/ExposureChart.tsx src/components/RiskDashboard.tsx
git commit -m "feat: add sector and industry exposure visualization to risk dashboard"
```

---

### Task 19: Tax Lot Tracking

**Files:**
- Modify: `src-tauri/src/lib.rs` (tax_lots table + commands)
- Create: `src/components/TaxLotView.tsx`
- Modify: `src/PortfolioTab.tsx`

- [ ] **Step 1: Add tax_lots table**

```sql
CREATE TABLE IF NOT EXISTS tax_lots (
  id TEXT PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  shares REAL NOT NULL,
  cost_basis_per_share REAL NOT NULL,
  purchase_date TEXT NOT NULL,
  is_closed INTEGER DEFAULT 0,
  close_date TEXT,
  close_price REAL,
  created_at TEXT DEFAULT (datetime('now'))
)
```

- [ ] **Step 2: Add Tauri commands**

```rust
#[tauri::command]
async fn list_tax_lots(portfolio_name: String, symbol: Option<String>) -> Result<Vec<serde_json::Value>, String>

#[tauri::command]
async fn get_tax_loss_harvest_opportunities(portfolio_name: String,
    current_prices: HashMap<String, f64>) -> Result<Vec<serde_json::Value>, String>
// Returns lots with unrealized losses, days held, short-term vs long-term status
```

- [ ] **Step 3: Create TaxLotView component**

Table: Symbol, Shares, Cost Basis, Current Value, Gain/Loss, Holding Period (short/long-term), Harvest button. Highlight lots with losses as harvest opportunities.

- [ ] **Step 4: Auto-create tax lots from transactions**

When a buy transaction is recorded, auto-create a tax lot. When a sell is recorded, close lots FIFO.

- [ ] **Step 5: Integrate into PortfolioTab**

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/components/TaxLotView.tsx src/PortfolioTab.tsx
git commit -m "feat: add tax lot tracking with tax-loss harvesting suggestions"
```

---

## Phase 6: Competitive Differentiation

### Task 20: Multi-Currency Support

**Files:**
- Modify: `src-tauri/src/lib.rs` (currency setting + conversion command)
- Create: `src/contexts/CurrencyContext.tsx`
- Modify: `src/shared/utils/calculations.ts` (currency formatting)

- [ ] **Step 1: Add currency setting and conversion**

Store preferred currency in `user_settings`. Add command:
```rust
#[tauri::command]
async fn get_exchange_rate(from: String, to: String) -> Result<f64, String>
// Uses Alpaca or free forex API
```

- [ ] **Step 2: Create CurrencyContext**

```typescript
interface CurrencyContextType {
  currency: string;           // 'USD', 'EUR', 'GBP', etc.
  setCurrency: (c: string) => void;
  formatAmount: (amount: number) => string;
  convertFromUSD: (amount: number) => number;
  exchangeRate: number;
}
```

- [ ] **Step 3: Update calculations.ts formatCurrency to use context**

- [ ] **Step 4: Add currency selector to Settings page**

Dropdown with common currencies: USD, EUR, GBP, JPY, CAD, AUD, CHF.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/contexts/CurrencyContext.tsx src/shared/utils/calculations.ts src/components/SettingsPage.tsx
git commit -m "feat: add multi-currency support with exchange rate conversion"
```

---

### Task 21: What-If Scenario Analysis

**Files:**
- Create: `src/components/ScenarioAnalysis.tsx`
- Modify: `src/components/RiskDashboard.tsx` (add tab/section)

- [ ] **Step 1: Create ScenarioAnalysis component**

Predefined scenarios + custom:
```typescript
const SCENARIOS = [
  { name: 'Market Crash (-20%)', factor: -0.20 },
  { name: 'Tech Selloff (-30% tech, -10% others)', sectorFactors: { Technology: -0.30, _default: -0.10 } },
  { name: 'Rising Rates (-15% growth, +5% value)', sectorFactors: { Technology: -0.15, Financials: 0.05 } },
  { name: 'Recession (-25%)', factor: -0.25 },
  { name: 'Bull Run (+20%)', factor: 0.20 },
];
```

For each scenario, calculate:
- Portfolio impact ($ and %)
- Per-holding impact
- Which holdings are most affected
- Comparison to current allocation

Uses holdings data + fundamentals (for sector info).

- [ ] **Step 2: Add custom scenario builder**

Slider-based: "What if market moves X%?" with per-sector overrides.

- [ ] **Step 3: Add to RiskDashboard as a new section**

- [ ] **Step 4: Commit**

```bash
git add src/components/ScenarioAnalysis.tsx src/components/RiskDashboard.tsx
git commit -m "feat: add what-if scenario analysis with predefined and custom scenarios"
```

---

### Task 22: Shareable Strategy Cards (Privacy-Preserving)

**Files:**
- Create: `src/components/StrategyShareCard.tsx`
- Modify: `src/components/VibeStudio.tsx` (add share button)

- [ ] **Step 1: Create StrategyShareCard component**

Generates a shareable image/card showing:
- Strategy name
- Factor weights (visual bar chart)
- Performance metrics (if backtested)
- Created date
- NO personal data, NO holdings, NO portfolio values

Uses HTML Canvas to generate a downloadable PNG.

- [ ] **Step 2: Add "Share Strategy" button to VibeStudio**

Opens a modal with the generated card + "Download Image" and "Copy to Clipboard" buttons.

- [ ] **Step 3: Commit**

```bash
git add src/components/StrategyShareCard.tsx src/components/VibeStudio.tsx
git commit -m "feat: add shareable strategy cards (privacy-preserving, no portfolio data)"
```

---

## Phase 7: Testing

### Task 23: Integration Tests

**Files:**
- Create: `src/__tests__/integration/tauri-commands.test.ts`
- Create: `src/__tests__/integration/portfolio-flow.test.ts`
- Create: `src/__tests__/integration/journal-flow.test.ts`

- [ ] **Step 1: Create Tauri command mock infrastructure**

```typescript
// src/__tests__/integration/tauri-mock.ts
// Mock the invoke function with a map of command -> handler
// Each handler validates input types and returns realistic data
```

- [ ] **Step 2: Write portfolio flow integration test**

Test the full flow: add holding -> update prices -> generate buy list -> record rebalance -> check transaction history.

- [ ] **Step 3: Write journal flow integration test**

Test: create entry -> filter entries -> calculate stats -> export markdown.

- [ ] **Step 4: Run tests**

Run: `npm run test`

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/
git commit -m "test: add integration tests for portfolio and journal flows"
```

---

### Task 24: Mobile Build Verification Script

**Files:**
- Create: `scripts/verify-mobile-build.sh`

- [ ] **Step 1: Create verification script**

```bash
#!/bin/bash
# Checks prerequisites for mobile builds
# Verifies: Xcode (iOS), Android Studio, NDK, SDKs
# Runs: npm run tauri ios init / npm run tauri android init
# Reports: what's ready, what's missing
```

- [ ] **Step 2: Commit**

```bash
git add scripts/verify-mobile-build.sh
git commit -m "chore: add mobile build verification script"
```

---

## Implementation Order & Dependencies

```
Phase 1 (Launch) ──────────── can start immediately, all independent
  Task 1: Download links (5 min)
  Task 2: Stronghold (30 min)
  Task 3: Code signing (20 min)
  Task 4: E2E tests (45 min)

Phase 2 (Revenue) ─────────── can start immediately, all independent
  Task 5: Auth backend (60 min)
  Task 6: Stripe (30 min) ── depends on Task 5
  Task 7: Privacy disclosure (15 min)
  Task 8: Backend tier validation (15 min)

Phase 3 (AI) ──────────────── can start immediately
  Task 9: AI streaming (45 min)

Phase 4 (UX) ──────────────── can start immediately, all independent
  Task 10: Keyboard shortcuts (15 min)
  Task 11: Command palette (30 min) ── depends on Task 10
  Task 12: Rate limit UX (20 min)
  Task 13: App.tsx refactor (30 min)

Phase 5 (Portfolio) ────────── can start immediately, mostly independent
  Task 14: Transaction history (30 min)
  Task 15: Portfolio performance (30 min)
  Task 16: Benchmark comparison (20 min) ── depends on Task 15
  Task 17: Dividend tracking (30 min)
  Task 18: Sector exposure (20 min)
  Task 19: Tax lot tracking (30 min) ── depends on Task 14

Phase 6 (Differentiation) ─── can start immediately, all independent
  Task 20: Multi-currency (30 min)
  Task 21: What-if scenarios (25 min)
  Task 22: Shareable strategies (20 min)

Phase 7 (Testing) ─────────── should run last
  Task 23: Integration tests (30 min)
  Task 24: Mobile verification (10 min)
```

**Maximum parallelization:** Tasks 1-5, 7-10, 12-15, 17-18, 20-22 can all run in parallel (16 tasks simultaneously).

**Sequential dependencies:**
- Task 6 after Task 5
- Task 11 after Task 10
- Task 16 after Task 15
- Task 19 after Task 14
- Phase 7 after all others
