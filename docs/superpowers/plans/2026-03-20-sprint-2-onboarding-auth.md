# Sprint 2 — Onboarding + Auth Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users see a 4-step onboarding wizard on first launch; returning users can log in via Google in Settings; tier from JWT is reflected in a PremiumGate component that gates at least one placeholder premium feature.

**Architecture:** The backend is a new Hono + Node.js server in `server/` that handles Google OAuth and issues JWTs with a `tier` claim. The Tauri app receives the OAuth callback via a deep link (`flowfolio://auth/callback?...`), stores tokens in SQLite `user_settings`, and exposes `AuthContext` + `SubscriptionContext` app-wide. The onboarding wizard is a pure-frontend overlay gated by an `onboarding_complete` flag in SQLite.

**Tech Stack:** Hono 4, Node.js 22, Postgres (pg), jose (JWT), google-auth-library, tauri-plugin-deep-link 2, React 19, TypeScript 5.8, Vitest 4

---

## File Map

### Files to Create
| Path | Purpose |
|---|---|
| `server/package.json` | Backend server dependencies (Hono, pg, jose, google-auth-library) |
| `server/tsconfig.json` | TypeScript config for server |
| `server/.env.example` | Server environment variable template |
| `server/src/index.ts` | Hono app entry point |
| `server/src/jwt.ts` | JWT sign/verify helpers |
| `server/src/db.ts` | Postgres pool + schema init |
| `server/src/routes/auth.ts` | Google OAuth + token refresh/logout routes |
| `server/src/routes/user.ts` | /user/me GET + PATCH |
| `server/src/__tests__/jwt.test.ts` | Unit tests for JWT helpers |
| `src/contexts/SubscriptionContext.tsx` | Reads tier from JWT, provides hasTier() |
| `src/components/PremiumGate.tsx` | Tier-gated wrapper with upgrade modal |
| `src/components/PremiumGate.css` | Upgrade modal styles |
| `src/features/onboarding/OnboardingWizard.tsx` | 4-step first-run wizard |
| `src/features/onboarding/OnboardingWizard.css` | Wizard styles |
| `src/features/onboarding/steps/StepWelcome.tsx` | Step 1: privacy promise + mode toggle |
| `src/features/onboarding/steps/StepUniverse.tsx` | Step 2: create first watchlist |
| `src/features/onboarding/steps/StepStrategy.tsx` | Step 3: load template plan |
| `src/features/onboarding/steps/StepApiKeys.tsx` | Step 4: set up API keys |
| `src/features/onboarding/SidebarTooltips.tsx` | One-time dismissible tooltips post-onboarding |
| `src/__tests__/contexts/SubscriptionContext.test.ts` | Tests for tier parsing and hasTier() |
| `src/__tests__/components/PremiumGate.test.tsx` | Tests for PremiumGate render logic |
| `src/__tests__/features/onboarding/OnboardingWizard.test.tsx` | Tests for wizard step progression |

### Files to Modify
| Path | What Changes |
|---|---|
| `src-tauri/Cargo.toml` | Add tauri-plugin-deep-link |
| `src-tauri/src/lib.rs` | Register deep-link plugin |
| `src-tauri/tauri.conf.json` | Add deep-link plugin config + `flowfolio://` scheme + update CSP |
| `package.json` | Add @tauri-apps/plugin-deep-link |
| `src/services/auth.ts` | Replace localStorage token storage with SQLite via invoke |
| `src/contexts/AuthContext.tsx` | Replace no-op shim with real auth.ts integration |
| `src/contexts/index.ts` | Export SubscriptionContext providers/hooks |
| `src/components/SettingsPage.tsx` | Add Account section with Google login/logout |
| `src/App.tsx` | Check onboarding_complete flag, render wizard overlay, handle deep link callback |

---

## Task 1: Backend Server Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/index.ts`
- Create: `server/src/jwt.ts`
- Create: `server/src/db.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/routes/user.ts`
- Create: `server/src/__tests__/jwt.test.ts`

- [ ] **Step 1: Write failing JWT helper tests**

```typescript
// server/src/__tests__/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, signRefreshToken } from '../jwt';

describe('signAccessToken', () => {
  it('returns a string', async () => {
    const token = await signAccessToken({ userId: 'u1', email: 'a@b.com', tier: 'free' }, 'testsecret');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });
});

describe('verifyAccessToken', () => {
  it('round-trips a token', async () => {
    const token = await signAccessToken({ userId: 'u1', email: 'a@b.com', tier: 'ai' }, 'testsecret');
    const payload = await verifyAccessToken(token, 'testsecret');
    expect(payload.userId).toBe('u1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.tier).toBe('ai');
  });

  it('throws on invalid token', async () => {
    await expect(verifyAccessToken('not.a.token', 'testsecret')).rejects.toThrow();
  });
});

describe('signRefreshToken', () => {
  it('returns a non-empty string', async () => {
    const token = await signRefreshToken('u1', 'testsecret');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Create server/package.json**

```json
{
  "name": "flowfolio-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --experimental-strip-types src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.7",
    "google-auth-library": "^9.15.1",
    "hono": "^4.7.7",
    "jose": "^5.10.0",
    "pg": "^8.14.1"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/node": "^22.14.0",
    "@types/pg": "^8.11.14",
    "tsx": "^4.19.3",
    "typescript": "^5.8.3",
    "vitest": "^4.0.18"
  }
}
```

Run `cd server && npm install`

- [ ] **Step 3: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create server/.env.example**

```bash
# Google OAuth credentials (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# JWT signing secret (generate: openssl rand -base64 32)
JWT_SECRET=

# Postgres connection string
DATABASE_URL=postgresql://localhost:5432/flowfolio_dev

# Server config
PORT=3001
NODE_ENV=development

# After OAuth success, deep-link callback base
# Development: flowfolio://auth/callback
# Keep as-is — the server appends ?access_token=...&refresh_token=...
APP_CALLBACK_URL=flowfolio://auth/callback
```

Copy to `server/.env` and fill in values for local dev.

- [ ] **Step 5: Create server/src/jwt.ts**

```typescript
// server/src/jwt.ts
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import crypto from 'node:crypto';

export type Tier = 'free' | 'ai' | 'sync' | 'pro';

export interface TokenClaims {
  userId: string;
  email: string;
  tier: Tier;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: TokenClaims, secret: string): Promise<string> {
  return new SignJWT({ userId: claims.userId, email: claims.email, tier: claims.tier })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return {
    userId: payload['userId'] as string,
    email: payload['email'] as string,
    tier: (payload['tier'] as Tier) ?? 'free',
  };
}

export async function signRefreshToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey(secret));
}

export async function verifyRefreshToken(token: string, secret: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return { userId: payload['userId'] as string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 6: Run the JWT tests — expect them to pass**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio/server && npm test
```

Expected: all 4 JWT tests pass.

- [ ] **Step 7: Create server/src/db.ts**

```typescript
// server/src/db.ts
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      name        TEXT,
      avatar_url  TEXT,
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);
}
```

- [ ] **Step 8: Create server/src/routes/auth.ts**

```typescript
// server/src/routes/auth.ts
import { Hono } from 'hono';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, type Tier
} from '../jwt.js';

export const authRouter = new Hono();

function makeOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL ?? 'http://localhost:3001'}/auth/google/callback`
  );
}

// GET /auth/google — redirect to Google
authRouter.get('/google', (c) => {
  const client = makeOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
    prompt: 'consent',
  });
  return c.redirect(url);
});

// GET /auth/google/callback — exchange code, issue tokens
authRouter.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code' }, 400);

  const client = makeOAuth2Client();

  let googleUser: { id: string; email: string; name: string; picture: string };
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token! });
    const payload = ticket.getPayload()!;
    googleUser = {
      id: payload.sub,
      email: payload.email!,
      name: payload.name ?? payload.email!,
      picture: payload.picture ?? '',
    };
  } catch {
    return c.json({ error: 'Google auth failed' }, 400);
  }

  // Upsert user
  const result = await pool.query<{ id: string; subscription_tier: string }>(
    `INSERT INTO users (id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
     RETURNING id, subscription_tier`,
    [googleUser.id, googleUser.email, googleUser.name, googleUser.picture]
  );
  const user = result.rows[0];

  // Issue tokens
  const secret = process.env.JWT_SECRET!;
  const accessToken = await signAccessToken({
    userId: user.id,
    email: googleUser.email,
    tier: user.subscription_tier as Tier,
  }, secret);
  const refreshToken = await signRefreshToken(user.id, secret);

  // Store hashed refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const tokenId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [tokenId, user.id, hashToken(refreshToken), expiresAt]
  );

  // Redirect to app deep link
  const callbackUrl = process.env.APP_CALLBACK_URL ?? 'flowfolio://auth/callback';
  return c.redirect(`${callbackUrl}?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`);
});

// POST /auth/refresh
authRouter.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  const { refresh_token } = body;
  if (!refresh_token) return c.json({ error: 'Missing refresh_token' }, 400);

  const secret = process.env.JWT_SECRET!;
  let userId: string;
  try {
    ({ userId } = await verifyRefreshToken(refresh_token, secret));
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Verify hash in DB
  const result = await pool.query<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [hashToken(refresh_token)]
  );
  const row = result.rows[0];
  if (!row || row.user_id !== userId || new Date(row.expires_at) < new Date()) {
    return c.json({ error: 'Token revoked or expired' }, 401);
  }

  // Fetch current tier
  const userResult = await pool.query<{ subscription_tier: string; email: string }>(
    `SELECT subscription_tier, email FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return c.json({ error: 'User not found' }, 401);

  const newAccessToken = await signAccessToken({
    userId,
    email: user.email,
    tier: user.subscription_tier as Tier,
  }, secret);

  return c.json({ access_token: newAccessToken });
});

// POST /auth/logout
authRouter.post('/logout', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>().catch(() => ({})) as { refresh_token?: string };
  if (body.refresh_token) {
    await pool.query(
      `DELETE FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(body.refresh_token)]
    );
  }
  return c.json({ ok: true });
});
```

- [ ] **Step 9: Create server/src/routes/user.ts**

```typescript
// server/src/routes/user.ts
import { Hono } from 'hono';
import { pool } from '../db.js';
import { verifyAccessToken } from '../jwt.js';

export const userRouter = new Hono();

// Middleware: verify Bearer token
userRouter.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const secret = process.env.JWT_SECRET!;
  try {
    const claims = await verifyAccessToken(token, secret);
    c.set('userId' as never, claims.userId);
    c.set('tier' as never, claims.tier);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// GET /user/me
userRouter.get('/me', async (c) => {
  const userId = c.get('userId' as never) as string;
  const result = await pool.query(
    `SELECT id, email, name, avatar_url, subscription_tier, created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(result.rows[0]);
});

// PATCH /user/me
userRouter.patch('/me', async (c) => {
  const userId = c.get('userId' as never) as string;
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));
  const result = await pool.query(
    `UPDATE users SET name = COALESCE($1, name) WHERE id = $2
     RETURNING id, email, name, avatar_url, subscription_tier`,
    [body.name ?? null, userId]
  );
  return c.json(result.rows[0]);
});
```

- [ ] **Step 10: Create server/src/index.ts**

```typescript
// server/src/index.ts
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';
import { initSchema } from './db.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*' })); // Tauri webview is same-origin; CORS is for dev browser

app.route('/auth', authRouter);
app.route('/user', userRouter);

app.get('/health', (c) => c.json({ ok: true }));

initSchema()
  .then(() => {
    const port = Number(process.env.PORT ?? 3001);
    serve({ fetch: app.fetch, port });
    console.log(`Server running on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
```

- [ ] **Step 11: Run full server test suite**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio/server && npm test
```

Expected: JWT tests pass. Note that DB/route tests require a real Postgres connection — those are omitted for now (integration testing requires infra setup).

- [ ] **Step 12: Commit**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio
git add server/
git commit -m "$(cat <<'EOF'
feat: scaffold Hono backend server for auth (Sprint 2)

Adds server/ directory with Hono + Node.js backend. Implements
Google OAuth flow, JWT issuance (HS256, 1h access / 30d refresh),
Postgres schema for users + refresh_tokens, and /user/me endpoints.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Auth.ts Token Storage Migration

**Context:** `src/services/auth.ts` stores access and refresh tokens in localStorage. Sprint 1 eliminated localStorage everywhere; tokens should use SQLite `user_settings` via the existing `save_setting` / `load_setting` Tauri commands. Token access becomes async (this is fine since it was already async at the call sites in AuthContext).

**Files:**
- Modify: `src/services/auth.ts`

- [ ] **Step 1: Read src/services/auth.ts fully**

Understand all uses of `localStorage.getItem(TOKEN_KEY)`, `localStorage.setItem(TOKEN_KEY, ...)`, `localStorage.removeItem(TOKEN_KEY)`.

- [ ] **Step 2: Replace localStorage token storage with async SQLite via invoke**

Replace the four sync localStorage helpers with async ones:

```typescript
// src/services/auth.ts — updated token helpers
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../core/logger';

const log = createLogger('auth');

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

// One-time migration from legacy localStorage keys
async function migrateTokensFromLocalStorage(): Promise<void> {
  const legacyAccess = localStorage.getItem('flowfolio_access_token');
  const legacyRefresh = localStorage.getItem('flowfolio_refresh_token');
  if (legacyAccess && legacyRefresh) {
    await invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: legacyAccess }).catch(() => {});
    await invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: legacyRefresh }).catch(() => {});
    localStorage.removeItem('flowfolio_access_token');
    localStorage.removeItem('flowfolio_refresh_token');
  }
}

async function getStoredToken(): Promise<string | null> {
  return invoke<string | null>('load_setting', { key: ACCESS_TOKEN_KEY }).catch(() => null);
}

async function getStoredRefreshToken(): Promise<string | null> {
  return invoke<string | null>('load_setting', { key: REFRESH_TOKEN_KEY }).catch(() => null);
}

async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: accessToken }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: refreshToken }),
  ]).catch(err => log.error('Failed to store tokens', err));
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: '' }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: '' }),
  ]).catch(() => {});
}
```

Update `authFetch`, `refreshAccessToken`, `auth.handleCallback`, `auth.getUser`, `auth.logout`, `auth.isLoggedIn` to be async and use the async helpers above. Also call `migrateTokensFromLocalStorage()` in `auth.init()` (a new exported function).

The full updated file should look like:

```typescript
// src/services/auth.ts
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../core/logger';

const log = createLogger('auth');

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

async function migrateTokensFromLocalStorage(): Promise<void> {
  const legacyAccess = localStorage.getItem('flowfolio_access_token');
  const legacyRefresh = localStorage.getItem('flowfolio_refresh_token');
  if (legacyAccess && legacyRefresh) {
    await invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: legacyAccess }).catch(() => {});
    await invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: legacyRefresh }).catch(() => {});
    localStorage.removeItem('flowfolio_access_token');
    localStorage.removeItem('flowfolio_refresh_token');
  }
}

async function getStoredToken(): Promise<string | null> {
  const v = await invoke<string | null>('load_setting', { key: ACCESS_TOKEN_KEY }).catch(() => null);
  return v || null;
}

async function getStoredRefreshToken(): Promise<string | null> {
  const v = await invoke<string | null>('load_setting', { key: REFRESH_TOKEN_KEY }).catch(() => null);
  return v || null;
}

async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: accessToken }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: refreshToken }),
  ]).catch(err => log.error('Failed to store tokens', err));
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: '' }),
    invoke('save_setting', { key: REFRESH_TOKEN_KEY, value: '' }),
  ]).catch(() => {});
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${SERVER_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) { await clearTokens(); return false; }
    const data = await res.json();
    await invoke('save_setting', { key: ACCESS_TOKEN_KEY, value: data.access_token }).catch(() => {});
    return true;
  } catch (e) {
    log.error('Token refresh failed', e);
    await clearTokens();
    return false;
  }
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getStoredToken();
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && (await getStoredRefreshToken())) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = await getStoredToken();
      return fetch(`${SERVER_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          ...options.headers,
        },
      });
    }
  }
  return res;
}

export const auth = {
  async init(): Promise<void> {
    await migrateTokensFromLocalStorage();
  },

  getLoginUrl(): string {
    return `${SERVER_URL}/auth/google`;
  },

  async handleCallback(params: URLSearchParams): Promise<void> {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      await storeTokens(accessToken, refreshToken);
    }
  },

  async getUser(): Promise<User | null> {
    const token = await getStoredToken();
    if (!token) return null;
    try {
      const res = await authFetch('/user/me');
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async updateProfile(data: { name?: string }): Promise<User | null> {
    try {
      const res = await authFetch('/user/me', { method: 'PATCH', body: JSON.stringify(data) });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async logout(): Promise<void> {
    const refreshToken = await getStoredRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${SERVER_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch { /* best effort */ }
    }
    await clearTokens();
  },

  async isLoggedIn(): Promise<boolean> {
    const token = await getStoredToken();
    return !!token;
  },

  async getAccessToken(): Promise<string | null> {
    return getStoredToken();
  },

  /** Silently refresh if access token present but optionally expired. Returns true if still authenticated. */
  async refreshIfNeeded(): Promise<boolean> {
    const token = await getStoredToken();
    if (!token) return false;
    // Try to use token as-is; if 401, refresh
    const res = await authFetch('/user/me');
    if (res.ok) return true;
    return refreshAccessToken();
  },
};
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio && npm run lint
```

Fix any new type errors. Pre-existing `phoenix`/`ws` errors are OK.

- [ ] **Step 4: Run tests**

```bash
npm run test
```

All 603+ tests must pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.ts
git commit -m "$(cat <<'EOF'
feat: migrate auth token storage from localStorage to SQLite

auth.ts now uses save_setting/load_setting Tauri commands for
access and refresh tokens. Adds one-time migration from legacy
localStorage keys. All auth operations are async.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tauri Deep-Link Plugin Setup

**Context:** Google OAuth needs to redirect back to the Tauri app. `tauri-plugin-deep-link` registers the `flowfolio://` URL scheme so the OS routes `flowfolio://auth/callback?...` back to the app.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`

- [ ] **Step 1: Read current Cargo.toml and lib.rs invoke_handler**

```bash
grep -n "tauri-plugin\|invoke_handler\|generate_handler" /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio/src-tauri/Cargo.toml
grep -n "plugin\|invoke_handler" /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio/src-tauri/src/lib.rs | tail -30
```

- [ ] **Step 2: Add tauri-plugin-deep-link to Cargo.toml**

In the `[dependencies]` section of `src-tauri/Cargo.toml`, add:
```toml
tauri-plugin-deep-link = "2"
```

- [ ] **Step 3: Register the deep-link plugin in lib.rs**

In the `tauri::Builder::default()` chain in `lib.rs`, add the plugin:

```rust
.plugin(tauri_plugin_deep_link::init())
```

Place it alongside the other `.plugin(...)` calls (after `tauri_plugin_opener::init()` for example).

- [ ] **Step 4: Configure flowfolio:// scheme in tauri.conf.json**

Add the `plugins` section to `tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "FlowFolio",
  "...existing fields...": "...",
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["flowfolio"]
      }
    }
  }
}
```

Also update the CSP `connect-src` in `app.security.csp` to include `http://localhost:3001` for development:

Find the existing `connect-src` value and append `http://localhost:3001` at the end.

- [ ] **Step 5: Add frontend deep-link package**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio && npm install @tauri-apps/plugin-deep-link
```

- [ ] **Step 6: Run cargo check**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio/src-tauri && cargo check
```

Expected: no errors. If `tauri-plugin-deep-link` version is not found, check crates.io for the latest 2.x version and use that exact version.

- [ ] **Step 7: Run frontend tests**

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio && npm run test
```

All tests must pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/tauri.conf.json package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: register flowfolio:// deep link scheme for OAuth callback

Adds tauri-plugin-deep-link to receive Google OAuth callback via
flowfolio://auth/callback?access_token=...&refresh_token=...
Updates CSP to allow localhost:3001 in development.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AuthContext — Real Google Auth Wiring

**Context:** `src/contexts/AuthContext.tsx` is currently a no-op shim that marks everyone as permanently authenticated with tier=null. Replace it with a real implementation that uses `src/services/auth.ts` and handles the deep-link OAuth callback.

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/App.tsx` (handle deep link callback)

- [ ] **Step 1: Write failing tests for AuthContext**

Create `src/__tests__/contexts/AuthContext.test.tsx`:

```typescript
// src/__tests__/contexts/AuthContext.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

// Mock auth service
vi.mock('../../services/auth', () => ({
  auth: {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockResolvedValue(false),
    getUser: vi.fn().mockResolvedValue(null),
    getLoginUrl: vi.fn().mockReturnValue('http://localhost:3001/auth/google'),
    handleCallback: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshIfNeeded: vi.fn().mockResolvedValue(false),
    getAccessToken: vi.fn().mockResolvedValue(null),
  },
}));

describe('AuthContext', () => {
  it('starts with loading=true then resolves to not authenticated', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });
    // After initialization
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('exposes loginWithGoogle that opens the Google URL', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    // loginWithGoogle should not throw (browser open is mocked elsewhere)
    await act(async () => { await result.current.loginWithGoogle(); });
    // No assertion needed beyond not throwing
  });
});
```

Run tests — expect them to fail (AuthContext is currently a no-op that always returns `isAuthenticated: true`):

```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio && npm run test -- --reporter=verbose src/__tests__/contexts/AuthContext.test.tsx
```

- [ ] **Step 2: Rewrite AuthContext.tsx**

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { auth, type User } from '../services/auth';
import { open } from '@tauri-apps/plugin-opener';

export type Tier = 'free' | 'ai' | 'sync' | 'pro';

interface AuthContextType {
  user: User | null;
  tier: Tier;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  handleOAuthCallback: (url: string) => Promise<void>;
  // Legacy compatibility
  login: () => Promise<void>;
  register: () => Promise<void>;
  subscription: null;
  session: null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Parse tier from a JWT access token payload (base64 decode middle segment). */
function parseTierFromToken(token: string): Tier {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const tier = payload?.tier as string;
    if (tier === 'ai' || tier === 'sync' || tier === 'pro') return tier;
  } catch { /* ignore */ }
  return 'free';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tier, setTier] = useState<Tier>('free');
  const [loading, setLoading] = useState(true);

  const loadAuth = useCallback(async () => {
    await auth.init();
    const loggedIn = await auth.isLoggedIn();
    if (!loggedIn) { setLoading(false); return; }

    // Silently refresh if needed
    await auth.refreshIfNeeded();

    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));

    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
    setLoading(false);
  }, []);

  useEffect(() => { loadAuth(); }, [loadAuth]);

  const loginWithGoogle = useCallback(async () => {
    const url = auth.getLoginUrl();
    await open(url);
  }, []);

  const handleOAuthCallback = useCallback(async (deepLinkUrl: string) => {
    const url = new URL(deepLinkUrl);
    await auth.handleCallback(url.searchParams);
    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));
    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
    setTier('free');
  }, []);

  const refreshUser = useCallback(async () => {
    const fetchedUser = await auth.getUser();
    setUser(fetchedUser);
    const token = await auth.getAccessToken();
    if (token) setTier(parseTierFromToken(token));
  }, []);

  const noop = () => Promise.resolve();

  return (
    <AuthContext.Provider value={{
      user,
      tier,
      loading,
      isAuthenticated: !!user,
      loginWithGoogle,
      logout,
      refreshUser,
      handleOAuthCallback,
      login: noop,
      register: noop,
      subscription: null,
      session: null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Audit and update all useAuth() consumers for new user shape**

The previous `AuthContext` had a `LocalUser` type with `username` and `avatar_url` (snake_case). The new `User` type from `auth.ts` uses `name` and `avatarUrl` (camelCase). The old shim always returned `isAuthenticated: true`; the new one returns `false` when unauthenticated (`user` will be `null`).

Run:

```bash
grep -rn "useAuth\(\)\|user\.username\|user\.avatar_url\|\.logout()" src/ --include="*.tsx" --include="*.ts" | grep -v "__tests__"
```

For each result:
- `user.username` → `user?.name`
- `user.avatar_url` → `user?.avatarUrl`
- `user` accessed without null check → guard with `user &&` or optional chaining
- `logout()` called without `await` in an async context → add `await`

The `loading` state (new) means the app may briefly show `isAuthenticated: false` before the init resolves. Verify components that previously assumed `isAuthenticated: true` don't show an error or redirect during loading — they should wait for `loading === false` before making decisions.

- [ ] **Step 4: Handle deep-link callback in App.tsx**

In `src/App.tsx`, add the deep-link handler in a `useEffect`. Import `useAuth` and `onOpenUrl`:

```typescript
// At the top of App.tsx, add imports:
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useAuth } from './contexts/AuthContext';
```

In the `App` function body, after `const { addToast } = useToast()`:

```typescript
const { handleOAuthCallback } = useAuth();

// Handle deep-link OAuth callback
useEffect(() => {
  let unlisten: (() => void) | undefined;
  onOpenUrl(async (urls) => {
    for (const url of urls) {
      if (url.startsWith('flowfolio://auth/callback')) {
        await handleOAuthCallback(url);
        addToast('Logged in successfully!', 'success');
      }
    }
  }).then(fn => { unlisten = fn; });
  return () => { unlisten?.(); };
}, [handleOAuthCallback, addToast]);
```

**Note:** `onOpenUrl` returns a cleanup function. Make sure the import is correct for the version of `@tauri-apps/plugin-deep-link` installed.

- [ ] **Step 5: Run failing tests — expect them to pass now**

```bash
npm run test -- src/__tests__/contexts/AuthContext.test.tsx
```

Expected: both tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm run test
```

All tests pass.

- [ ] **Step 7: TypeScript check**

```bash
npm run lint
```

Fix any new errors.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/AuthContext.tsx src/App.tsx src/__tests__/contexts/AuthContext.test.tsx
git commit -m "$(cat <<'EOF'
feat: wire AuthContext to real Google OAuth via auth.ts

Replaces no-op AuthContext shim. AuthProvider initializes from stored
tokens on mount, opens Google OAuth in browser via loginWithGoogle(),
and handles flowfolio:// deep-link callback to store tokens and set tier.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: SubscriptionContext

**Context:** Components need to check if the user has a specific premium tier. `SubscriptionContext` reads the tier from `AuthContext` and exposes a `hasTier()` helper. `pro` tier grants both `ai` and `sync` access.

**Files:**
- Create: `src/contexts/SubscriptionContext.tsx`
- Create: `src/__tests__/contexts/SubscriptionContext.test.ts`
- Modify: `src/contexts/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/contexts/SubscriptionContext.test.ts
import { describe, it, expect } from 'vitest';
import { hasTierAccess } from '../../contexts/SubscriptionContext';

describe('hasTierAccess', () => {
  it('free tier has no premium access', () => {
    expect(hasTierAccess('free', 'ai')).toBe(false);
    expect(hasTierAccess('free', 'sync')).toBe(false);
    expect(hasTierAccess('free', 'pro')).toBe(false);
  });

  it('ai tier grants ai access only', () => {
    expect(hasTierAccess('ai', 'ai')).toBe(true);
    expect(hasTierAccess('ai', 'sync')).toBe(false);
    expect(hasTierAccess('ai', 'pro')).toBe(false);
  });

  it('sync tier grants sync access only', () => {
    expect(hasTierAccess('sync', 'sync')).toBe(true);
    expect(hasTierAccess('sync', 'ai')).toBe(false);
  });

  it('pro tier grants both ai and sync', () => {
    expect(hasTierAccess('pro', 'ai')).toBe(true);
    expect(hasTierAccess('pro', 'sync')).toBe(true);
    expect(hasTierAccess('pro', 'pro')).toBe(true);
  });
});
```

Run: `npm run test -- src/__tests__/contexts/SubscriptionContext.test.ts`
Expected: FAIL (function not defined yet)

- [ ] **Step 2: Create src/contexts/SubscriptionContext.tsx**

```typescript
// src/contexts/SubscriptionContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { useAuth, type Tier } from './AuthContext';

type PremiumTier = 'ai' | 'sync' | 'pro';

/** Pure function — export for unit testing. */
export function hasTierAccess(userTier: Tier, required: PremiumTier): boolean {
  if (userTier === 'pro') return true;
  return userTier === required;
}

interface SubscriptionContextType {
  tier: Tier;
  hasTier: (required: PremiumTier) => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { tier } = useAuth();

  return (
    <SubscriptionContext.Provider value={{
      tier,
      hasTier: (required) => hasTierAccess(tier, required),
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextType {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm run test -- src/__tests__/contexts/SubscriptionContext.test.ts
```

Expected: all 4 describe groups pass.

- [ ] **Step 4: Export from contexts/index.ts**

Add to `src/contexts/index.ts`:

```typescript
export { SubscriptionProvider, useSubscription, hasTierAccess } from './SubscriptionContext';
export { AuthProvider, useAuth } from './AuthContext';
export type { Tier } from './AuthContext';
```

- [ ] **Step 5: Wire SubscriptionProvider into the app**

Check where `AuthProvider` is mounted (likely in `src/main.tsx` or wrapping `App`). Add `SubscriptionProvider` as a child of `AuthProvider`:

Read `src/main.tsx` first to find the provider tree, then wrap:

```tsx
<AuthProvider>
  <SubscriptionProvider>
    <App />
  </SubscriptionProvider>
</AuthProvider>
```

- [ ] **Step 6: Run full test suite + TypeScript check**

```bash
npm run lint && npm run test
```

All pass.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/SubscriptionContext.tsx src/contexts/index.ts src/__tests__/contexts/SubscriptionContext.test.ts src/main.tsx
git commit -m "$(cat <<'EOF'
feat: add SubscriptionContext with hasTier() access control helper

Reads tier from AuthContext JWT claim. pro grants both ai and sync.
Pure hasTierAccess() function exported for unit testing.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: PremiumGate Component

**Context:** `<PremiumGate tier="ai">` wraps content that requires a premium tier. Free users see an upgrade modal. In Sprint 2 the modal shows pricing preview with "Coming in Sprint 3" note (Stripe is Sprint 3). Sprint 3 will replace the CTA with a real Stripe checkout link.

**Files:**
- Create: `src/components/PremiumGate.tsx`
- Create: `src/components/PremiumGate.css`
- Create: `src/__tests__/components/PremiumGate.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/components/PremiumGate.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PremiumGate } from '../../components/PremiumGate';

// Mock useSubscription
vi.mock('../../contexts/SubscriptionContext', () => ({
  useSubscription: vi.fn(),
}));

import { useSubscription } from '../../contexts/SubscriptionContext';

describe('PremiumGate', () => {
  it('renders children when user has required tier', () => {
    vi.mocked(useSubscription).mockReturnValue({ tier: 'ai', hasTier: () => true });
    render(
      <PremiumGate tier="ai">
        <span data-testid="protected">Secret Content</span>
      </PremiumGate>
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
  });

  it('renders upgrade prompt when user lacks required tier', () => {
    vi.mocked(useSubscription).mockReturnValue({ tier: 'free', hasTier: () => false });
    render(
      <PremiumGate tier="ai">
        <span data-testid="protected">Secret Content</span>
      </PremiumGate>
    );
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByText(/AI Suite/i)).toBeInTheDocument();
  });
});
```

Run: `npm run test -- src/__tests__/components/PremiumGate.test.tsx`
Expected: FAIL

- [ ] **Step 2: Create src/components/PremiumGate.tsx**

```typescript
// src/components/PremiumGate.tsx
import { ReactNode, useState } from 'react';
import { Sparkles, X, Lock } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import type { Tier } from '../contexts/AuthContext';
import './PremiumGate.css';

type PremiumTier = 'ai' | 'sync' | 'pro';

const TIER_INFO: Record<PremiumTier, { name: string; description: string; price: string; features: string[] }> = {
  ai: {
    name: 'AI Suite',
    description: 'Unlock AI-powered portfolio analysis, natural language strategy building, and journal insights.',
    price: '$9/mo or $79/yr',
    features: [
      'Portfolio Agent — ask questions about your holdings',
      'NL Plan Builder — describe strategy in plain English',
      'AI Journal Insights — behavioral pattern analysis',
    ],
  },
  sync: {
    name: 'Cloud Sync',
    description: 'Sync your portfolios, plans, and journal across all your devices.',
    price: '$4/mo or $35/yr',
    features: [
      'Multi-device sync',
      'Automatic cloud backup',
      'Restore on new device in seconds',
    ],
  },
  pro: {
    name: 'Pro Bundle',
    description: 'Everything in AI Suite and Cloud Sync at a discounted bundle price.',
    price: '$12/mo or $99/yr',
    features: [
      'All AI Suite features',
      'All Cloud Sync features',
      'Best value',
    ],
  },
};

interface PremiumGateProps {
  tier: PremiumTier;
  children: ReactNode;
  /** If true, show a locked preview instead of hiding content entirely. Default: false */
  preview?: boolean;
}

export function PremiumGate({ tier, children, preview = false }: PremiumGateProps) {
  const { hasTier } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);

  if (hasTier(tier)) {
    return <>{children}</>;
  }

  const info = TIER_INFO[tier];

  return (
    <>
      {/* Locked placeholder / preview */}
      <div className="premium-gate-locked" onClick={() => setModalOpen(true)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setModalOpen(true)}>
        {preview && <div className="premium-gate-preview-blur">{children}</div>}
        <div className="premium-gate-overlay">
          <Lock size={24} />
          <span>{info.name}</span>
          <span className="premium-gate-cta">Upgrade to unlock</span>
        </div>
      </div>

      {/* Upgrade modal */}
      {modalOpen && (
        <div className="premium-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="premium-modal" onClick={(e) => e.stopPropagation()}>
            <button className="premium-modal-close" onClick={() => setModalOpen(false)}>
              <X size={16} />
            </button>
            <div className="premium-modal-header">
              <Sparkles size={28} className="premium-modal-icon" />
              <h2>{info.name}</h2>
              <p className="premium-modal-price">{info.price}</p>
            </div>
            <p className="premium-modal-description">{info.description}</p>
            <ul className="premium-modal-features">
              {info.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="premium-modal-actions">
              <button className="btn-primary" disabled>
                Upgrade — Coming Soon
              </button>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Maybe later
              </button>
            </div>
            <p className="premium-modal-note">
              Stripe integration coming in the next update.
              Sign in to be notified when it launches.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create src/components/PremiumGate.css**

```css
/* src/components/PremiumGate.css */
.premium-gate-locked {
  position: relative;
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  outline: none;
}

.premium-gate-locked:focus-visible {
  box-shadow: 0 0 0 2px var(--accent-primary, #6366f1);
}

.premium-gate-preview-blur {
  filter: blur(4px);
  pointer-events: none;
  user-select: none;
}

.premium-gate-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  border-radius: inherit;
}

.premium-gate-cta {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.8;
  text-decoration: underline;
}

/* Modal */
.premium-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.premium-modal {
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 16px;
  padding: 32px;
  max-width: 400px;
  width: 90%;
  position: relative;
}

.premium-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #888);
  display: flex;
  align-items: center;
}

.premium-modal-header {
  text-align: center;
  margin-bottom: 16px;
}

.premium-modal-icon {
  color: var(--accent-primary, #6366f1);
  margin-bottom: 8px;
}

.premium-modal-header h2 {
  margin: 4px 0;
  font-size: 20px;
}

.premium-modal-price {
  font-size: 13px;
  color: var(--text-muted, #888);
  margin: 0;
}

.premium-modal-description {
  font-size: 14px;
  color: var(--text-secondary, #ccc);
  margin-bottom: 16px;
  line-height: 1.5;
}

.premium-modal-features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.premium-modal-features li {
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary, #ccc);
}

.premium-modal-features li::before {
  content: '✓ ';
  color: var(--accent-primary, #6366f1);
  font-weight: 700;
}

.premium-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.premium-modal-actions button {
  width: 100%;
}

.premium-modal-note {
  font-size: 11px;
  color: var(--text-muted, #888);
  text-align: center;
  margin-top: 12px;
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm run test -- src/__tests__/components/PremiumGate.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```

All pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/PremiumGate.tsx src/components/PremiumGate.css src/__tests__/components/PremiumGate.test.tsx
git commit -m "$(cat <<'EOF'
feat: add PremiumGate component for tier-gated features

Wraps content requiring ai/sync/pro tier. Free users see an upgrade
modal with feature list and pricing preview. Stripe CTA is stubbed
(enabled in Sprint 3).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Settings Page — Account Section + PremiumGate Proof-of-Concept

**Context:** Add a "Account" section to SettingsPage with Google login/logout button and account info. Also wire PremiumGate to the Portfolio Agent entry point in App.tsx as proof-of-concept.

**Files:**
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/App.tsx` (gate one AI feature)

- [ ] **Step 1: Read current SettingsPage.tsx**

Read the full file to understand the existing section structure (it has profile form + API keys sections). Identify where to add the Account section.

- [ ] **Step 2: Add Account section to SettingsPage.tsx**

Import `useAuth` and add an Account section before the API keys section:

```typescript
// Add to imports at top
import { useAuth } from '../contexts/AuthContext';
import { LogIn, LogOut, User as UserIcon, Crown } from 'lucide-react';

// Inside SettingsPage function, after existing state:
const { user, isAuthenticated, tier, loginWithGoogle, logout, loading: authLoading } = useAuth();
```

Add the Account section JSX (find a good insertion point in the return statement, before the API keys section):

```tsx
{/* Account Section */}
<section className="settings-section">
  <h2 className="settings-section-title">Account</h2>
  {authLoading ? (
    <div className="text-muted">Loading...</div>
  ) : isAuthenticated && user ? (
    <div className="account-card">
      <div className="account-info">
        {user.avatarUrl && (
          <img src={user.avatarUrl} alt="Avatar" className="account-avatar" />
        )}
        <div>
          <div className="account-name">{user.name ?? user.email}</div>
          <div className="account-email text-muted">{user.email}</div>
          <div className="account-tier">
            <Crown size={12} />
            <span>{tier === 'free' ? 'Free' : tier === 'ai' ? 'AI Suite' : tier === 'sync' ? 'Cloud Sync' : 'Pro'}</span>
          </div>
        </div>
      </div>
      <button
        className="btn-secondary"
        onClick={() => logout().catch(console.error)}
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  ) : (
    <div className="account-login-prompt">
      <p className="text-muted">Sign in to unlock AI Suite and Cloud Sync premium features.</p>
      <button
        className="btn-primary"
        onClick={() => loginWithGoogle().catch(console.error)}
      >
        <LogIn size={14} /> Sign in with Google
      </button>
    </div>
  )}
</section>
```

Add minimal CSS for the account card to `SettingsPage.css`:

```css
.account-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--bg-hover);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.account-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.account-name {
  font-weight: 600;
  font-size: 14px;
}

.account-email {
  font-size: 12px;
}

.account-tier {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--accent-primary);
  margin-top: 2px;
}

.account-login-prompt {
  padding: 16px;
  background: var(--bg-hover);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
```

- [ ] **Step 3: Add PremiumGate around Portfolio Agent entry in App.tsx**

Search App.tsx for where the Portfolio Agent is mentioned or where an "AI" tab might live. If there is a "portfolio agent" button or tab, wrap it with PremiumGate:

```tsx
import { PremiumGate } from './components/PremiumGate';

// Around any AI Portfolio Agent entry point:
{activeTab === 'portfolio' && (
  <PremiumGate tier="ai">
    {/* existing portfolio agent component or just a placeholder */}
    <div className="card">
      <h3>AI Portfolio Agent</h3>
      <p>Ask questions about your portfolio in plain English.</p>
    </div>
  </PremiumGate>
)}
```

If App.tsx doesn't have a clear portfolio agent entry point, add it as a new sub-section in an existing tab or create a simple `"ai"` tab entry. The requirement is one gated feature exists — keep it minimal.

- [ ] **Step 4: TypeScript check + tests**

```bash
npm run lint && npm run test
```

All pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPage.tsx src/components/SettingsPage.css src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add Account section to Settings with Google login/logout

Shows user name, email, and tier when logged in. Sign-in button
opens Google OAuth flow. PremiumGate wired to AI Portfolio Agent
as proof-of-concept for tier gating.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Onboarding Wizard

**Context:** First-run users should see a 4-step wizard before the main UI. The completion flag `onboarding_complete` is stored in SQLite `user_settings` via the existing `save_setting`/`load_setting` commands. Steps 2-4 are skippable; Step 1 (Welcome) is not.

**Files:**
- Create: `src/features/onboarding/OnboardingWizard.tsx`
- Create: `src/features/onboarding/OnboardingWizard.css`
- Create: `src/features/onboarding/steps/StepWelcome.tsx`
- Create: `src/features/onboarding/steps/StepUniverse.tsx`
- Create: `src/features/onboarding/steps/StepStrategy.tsx`
- Create: `src/features/onboarding/steps/StepApiKeys.tsx`
- Create: `src/__tests__/features/onboarding/OnboardingWizard.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing onboarding wizard tests**

```typescript
// src/__tests__/features/onboarding/OnboardingWizard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from '../../../features/onboarding/OnboardingWizard';

// Mock invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

describe('OnboardingWizard', () => {
  const onComplete = vi.fn();

  beforeEach(() => { onComplete.mockClear(); });

  it('shows step 1 (Welcome) first', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    expect(screen.getByText(/Welcome to FlowFolio/i)).toBeInTheDocument();
  });

  it('advances to step 2 when Next is clicked on step 1', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/Your Universe/i)).toBeInTheDocument();
  });

  it('allows skipping step 2', () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // → step 2
    fireEvent.click(screen.getByRole('button', { name: /skip/i })); // skip step 2
    expect(screen.getByText(/Your Strategy/i)).toBeInTheDocument();
  });

  it('calls onComplete after step 4', async () => {
    render(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));  // → 2
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));  // skip 2 → 3
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));  // skip 3 → 4
    fireEvent.click(screen.getByRole('button', { name: /get started|finish|done/i })); // complete
    // onComplete may be async
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
```

Run: `npm run test -- src/__tests__/features/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL (component not created yet)

- [ ] **Step 2: Create StepWelcome.tsx**

```typescript
// src/features/onboarding/steps/StepWelcome.tsx
import { useUserMode } from '../../../contexts/UserModeContext';
import { Shield, Wifi } from 'lucide-react';

interface Props { onNext: () => void; }

export function StepWelcome({ onNext }: Props) {
  const { isAdvanced, toggleMode } = useUserMode();
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-icon">🌊</div>
      <h1 className="onboarding-step-title">Welcome to FlowFolio</h1>
      <p className="onboarding-step-subtitle">
        Your privacy-first investment planning workspace.
      </p>

      <div className="onboarding-feature-list">
        <div className="onboarding-feature">
          <Shield size={18} />
          <div>
            <strong>100% offline by default</strong>
            <p>All data stays on your device. No account needed for core features.</p>
          </div>
        </div>
        <div className="onboarding-feature">
          <Wifi size={18} />
          <div>
            <strong>Market data from free APIs</strong>
            <p>Yahoo Finance works with zero setup. Add more providers for higher limits.</p>
          </div>
        </div>
      </div>

      <div className="onboarding-mode-toggle">
        <span>Experience mode:</span>
        <button className="mode-toggle-btn" onClick={toggleMode}>
          {isAdvanced ? 'Advanced' : 'Simple'} ↕
        </button>
        <p className="text-muted onboarding-mode-hint">
          {isAdvanced
            ? 'Full access to quant tools, risk metrics, and scoring engine.'
            : 'Simplified view — essentials only. Switch anytime in Settings.'}
        </p>
      </div>

      <button className="btn-primary onboarding-next-btn" onClick={onNext}>
        Next →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create StepUniverse.tsx**

```typescript
// src/features/onboarding/steps/StepUniverse.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus } from 'lucide-react';

const PRESETS: Record<string, string[]> = {
  'S&P 500 Sample': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'UNH'],
  'Tech Growth':    ['NVDA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM'],
  'Dividend Focus': ['JNJ', 'PG', 'KO', 'MCD', 'PEP', 'MMM', 'T', 'VZ', 'XOM', 'CVX'],
};

interface Props { onNext: () => void; onSkip: () => void; }

export function StepUniverse({ onNext, onSkip }: Props) {
  const [name, setName] = useState('My First Universe');
  const [symbols, setSymbols] = useState('AAPL, MSFT, GOOGL, AMZN, NVDA');
  const [created, setCreated] = useState(false);
  const [error, setError] = useState('');

  const handlePreset = (preset: string) => {
    setSymbols(PRESETS[preset].join(', '));
  };

  const handleCreate = async () => {
    setError('');
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!name.trim() || symbolList.length === 0) {
      setError('Enter a name and at least one symbol.');
      return;
    }
    try {
      await invoke('create_universe', { name: name.trim(), description: 'Created during onboarding', symbols: symbolList });
      setCreated(true);
      setTimeout(onNext, 800);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">Your Universe</h2>
      <p className="onboarding-step-subtitle">Create your first watchlist of stocks to track and score.</p>

      <div className="onboarding-presets">
        <span className="text-muted" style={{ fontSize: '12px' }}>Quick presets:</span>
        {Object.keys(PRESETS).map(p => (
          <button key={p} className="btn-secondary btn-sm" onClick={() => handlePreset(p)}>{p}</button>
        ))}
      </div>

      <div className="form-group">
        <label>Universe name</label>
        <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="My First Universe" />
      </div>
      <div className="form-group">
        <label>Tickers (comma-separated)</label>
        <input className="form-control" value={symbols} onChange={e => setSymbols(e.target.value)} placeholder="AAPL, MSFT, GOOGL" />
      </div>

      {error && <p className="text-error">{error}</p>}
      {created && <p className="text-success">Universe created!</p>}

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleCreate} disabled={created}>
          <Plus size={14} /> Create Universe
        </button>
        <button className="btn-ghost" onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create StepStrategy.tsx**

```typescript
// src/features/onboarding/steps/StepStrategy.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles } from 'lucide-react';

interface Props { onNext: () => void; onSkip: () => void; }

export function StepStrategy({ onNext, onSkip }: Props) {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    invoke<string[]>('list_templates').then(setTemplates).catch(() => {});
  }, []);

  const handleLoad = async () => {
    if (!selected) { onSkip(); return; }
    try {
      await invoke('get_template', { name: selected });
    } catch { /* ignore */ }
    onNext();
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">Your Strategy</h2>
      <p className="onboarding-step-subtitle">
        Start with a pre-built Vibe Plan template or explore Vibe Studio to build your own.
      </p>

      <div className="onboarding-template-list">
        {templates.length === 0 && <p className="text-muted">Loading templates…</p>}
        {templates.slice(0, 6).map(t => (
          <button
            key={t}
            className={`onboarding-template-item ${selected === t ? 'selected' : ''}`}
            onClick={() => setSelected(t)}
          >
            <Sparkles size={14} />
            {t}
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleLoad}>
          {selected ? `Load "${selected}"` : 'Continue'}
        </button>
        <button className="btn-ghost" onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create StepApiKeys.tsx**

```typescript
// src/features/onboarding/steps/StepApiKeys.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, CheckCircle } from 'lucide-react';

interface Props { onFinish: () => void; }

const PROVIDERS = [
  { key: 'alpaca_key', label: 'Alpaca API Key', hint: 'Free tier. alpaca.markets' },
  { key: 'finnhub_key', label: 'Finnhub Key', hint: '60 calls/min free. finnhub.io' },
  { key: 'openrouter_key', label: 'OpenRouter Key', hint: 'Required for AI features. openrouter.ai' },
];

export function StepApiKeys({ onFinish }: Props) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      const filtered = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim()));
      if (Object.keys(filtered).length > 0) {
        await invoke('save_api_keys', { keys: filtered });
      }
      setSaved(true);
      setTimeout(onFinish, 600);
    } catch { onFinish(); }
  };

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title">API Keys (Optional)</h2>
      <p className="onboarding-step-subtitle">
        Yahoo Finance works with zero setup. Add keys for higher rate limits and AI features.
      </p>

      <div className="onboarding-key-list">
        {PROVIDERS.map(({ key, label, hint }) => (
          <div key={key} className="form-group">
            <label>
              <Key size={12} /> {label}
              <span className="text-muted" style={{ fontSize: '11px', marginLeft: '6px' }}>{hint}</span>
            </label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter key… (optional)"
              value={keys[key] ?? ''}
              onChange={e => setKeys(prev => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {saved && <p className="text-success"><CheckCircle size={14} /> Keys saved!</p>}

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleSave}>
          {Object.values(keys).some(v => v.trim()) ? 'Save & Get Started' : 'Get Started →'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create OnboardingWizard.tsx**

```typescript
// src/features/onboarding/OnboardingWizard.tsx
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StepWelcome } from './steps/StepWelcome';
import { StepUniverse } from './steps/StepUniverse';
import { StepStrategy } from './steps/StepStrategy';
import { StepApiKeys } from './steps/StepApiKeys';
import './OnboardingWizard.css';

const STEP_LABELS = ['Welcome', 'Universe', 'Strategy', 'API Keys'];

interface Props { onComplete: () => void; }

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep(s => Math.min(s + 1, 3)), []);
  const skip = useCallback(() => setStep(s => Math.min(s + 1, 3)), []);

  const finish = useCallback(async () => {
    await invoke('save_setting', { key: 'onboarding_complete', value: 'true' }).catch(() => {});
    onComplete();
  }, [onComplete]);

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {/* Progress dots */}
        <div className="onboarding-progress">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <span className="onboarding-dot-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 0 && <StepWelcome onNext={next} />}
        {step === 1 && <StepUniverse onNext={next} onSkip={skip} />}
        {step === 2 && <StepStrategy onNext={next} onSkip={skip} />}
        {step === 3 && <StepApiKeys onFinish={finish} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create OnboardingWizard.css**

```css
/* src/features/onboarding/OnboardingWizard.css */
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary, #13131f);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.onboarding-container {
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 20px;
  padding: 40px;
  max-width: 560px;
  width: 100%;
  min-height: 460px;
  display: flex;
  flex-direction: column;
}

.onboarding-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  margin-bottom: 32px;
}

.onboarding-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--bg-hover, #333);
  transition: background 0.3s;
}

.onboarding-dot.active {
  background: var(--accent-primary, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
}

.onboarding-dot.done {
  background: var(--success, #22c55e);
}

.onboarding-dot-label {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  white-space: nowrap;
  color: var(--text-muted, #888);
}

.onboarding-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.onboarding-step-icon {
  font-size: 40px;
  text-align: center;
}

.onboarding-step-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  margin: 0;
}

.onboarding-step-subtitle {
  font-size: 14px;
  color: var(--text-muted, #888);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

.onboarding-feature-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0;
}

.onboarding-feature {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-hover, #333);
  border-radius: 8px;
  font-size: 13px;
}

.onboarding-feature strong {
  display: block;
  margin-bottom: 2px;
}

.onboarding-feature p {
  margin: 0;
  color: var(--text-muted, #888);
}

.onboarding-mode-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  flex-wrap: wrap;
}

.mode-toggle-btn {
  background: var(--accent-primary, #6366f1);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.onboarding-mode-hint {
  width: 100%;
  font-size: 11px;
  margin: 0;
}

.onboarding-next-btn {
  margin-top: auto;
  align-self: flex-end;
}

.onboarding-actions {
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding-top: 8px;
}

.onboarding-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}

.onboarding-template-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 8px 0;
}

.onboarding-template-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-hover, #333);
  border: 1px solid var(--border-color, #444);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  color: var(--text-primary, #fff);
  transition: border-color 0.2s;
}

.onboarding-template-item.selected {
  border-color: var(--accent-primary, #6366f1);
  background: rgba(99, 102, 241, 0.1);
}

.onboarding-key-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 8: Run failing tests — expect them to pass**

```bash
npm run test -- src/__tests__/features/onboarding/OnboardingWizard.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 9: Wire onboarding into App.tsx**

In `src/App.tsx`, add the onboarding check:

```typescript
// Add import at top
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';

// Inside App function, add state:
const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null); // null = loading

// Add useEffect to check flag on mount:
useEffect(() => {
  invoke<string | null>('load_setting', { key: 'onboarding_complete' })
    .then(val => setOnboardingComplete(val === 'true'))
    .catch(() => setOnboardingComplete(true)); // default to complete on error
}, []);
```

At the top of the App's return statement, before the main UI, add:

```tsx
// Show loading state while checking flag
if (onboardingComplete === null) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <div className="tab-loading-spinner" />
  </div>;
}

// Show onboarding wizard for first-time users
if (!onboardingComplete) {
  return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />;
}
```

- [ ] **Step 10: Run full test suite**

```bash
npm run test
```

All tests pass.

- [ ] **Step 11: TypeScript check**

```bash
npm run lint
```

Fix any new errors.

- [ ] **Step 12: Commit**

```bash
git add src/features/onboarding/ src/App.tsx src/__tests__/features/onboarding/
git commit -m "$(cat <<'EOF'
feat: add 4-step first-run onboarding wizard

Shown once on first launch. Steps: Welcome (mode toggle), Universe
(create watchlist), Strategy (load template), API Keys (optional).
Completion flagged in SQLite user_settings. Steps 2-4 are skippable.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Post-Onboarding Sidebar Tooltips

**Context:** After onboarding completes, first-time users see one-time dismissible tooltips on each sidebar item. Each tooltip is dismissed independently. Dismissed state is stored in `user_settings` as `tooltip_dismissed_<tab_name>`.

**Files:**
- Create: `src/features/onboarding/SidebarTooltips.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create SidebarTooltips.tsx**

```typescript
// src/features/onboarding/SidebarTooltips.tsx
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';

const TOOLTIP_CONTENT: Record<string, string> = {
  dashboard: 'Your portfolio snapshot — prices, P&L, and market overview at a glance.',
  vibe_studio: 'Build your investment strategy using factor weights: momentum, value, quality, and more.',
  templates: 'Start with a pre-built strategy instead of building from scratch.',
  rankings: 'Score and rank any list of stocks against your active Vibe Plan.',
  portfolio: 'Track holdings, generate buy lists, run rebalance reports, and import CSV.',
  backtest: 'Simulate your strategy against historical data to see how it would have performed.',
  journal: 'Record your investment decisions and track your thinking over time.',
  watchlist: 'Your curated universe of stocks to track, tag, and analyze.',
  alerts: 'Set price alerts — get notified when a stock hits your target.',
};

interface TooltipState {
  [tab: string]: boolean; // true = dismissed
}

export function useSidebarTooltips(onboardingComplete: boolean) {
  const [dismissed, setDismissed] = useState<TooltipState>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!onboardingComplete) return;
    const tabs = Object.keys(TOOLTIP_CONTENT);
    Promise.all(
      tabs.map(tab =>
        invoke<string | null>('load_setting', { key: `tooltip_dismissed_${tab}` })
          .then(val => [tab, val === 'true'] as [string, boolean])
          .catch(() => [tab, false] as [string, boolean])
      )
    ).then(entries => {
      setDismissed(Object.fromEntries(entries));
      setLoaded(true);
    });
  }, [onboardingComplete]);

  const dismiss = useCallback((tab: string) => {
    setDismissed(prev => ({ ...prev, [tab]: true }));
    invoke('save_setting', { key: `tooltip_dismissed_${tab}`, value: 'true' }).catch(() => {});
  }, []);

  const isShown = useCallback((tab: string) => {
    if (!loaded || !onboardingComplete) return false;
    return !dismissed[tab] && !!TOOLTIP_CONTENT[tab];
  }, [loaded, dismissed, onboardingComplete]);

  const getContent = (tab: string) => TOOLTIP_CONTENT[tab] ?? '';

  return { isShown, dismiss, getContent };
}

interface SidebarTooltipProps {
  tab: string;
  isShown: boolean;
  content: string;
  onDismiss: (tab: string) => void;
}

export function SidebarTooltip({ tab, isShown, content, onDismiss }: SidebarTooltipProps) {
  if (!isShown) return null;
  return (
    <div className="sidebar-tooltip" role="tooltip">
      <span className="sidebar-tooltip-text">{content}</span>
      <button
        className="sidebar-tooltip-close"
        onClick={(e) => { e.stopPropagation(); onDismiss(tab); }}
        aria-label="Dismiss tooltip"
      >
        <X size={10} />
      </button>
    </div>
  );
}
```

Add CSS to `OnboardingWizard.css` (or a new `SidebarTooltips.css`):

```css
/* Add to src/features/onboarding/OnboardingWizard.css */
.sidebar-tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--accent-primary, #6366f1);
  color: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.4;
  max-width: 200px;
  z-index: 100;
  white-space: normal;
  pointer-events: auto;
  display: flex;
  gap: 6px;
  align-items: flex-start;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.sidebar-tooltip::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-right-color: var(--accent-primary, #6366f1);
}

.sidebar-tooltip-text { flex: 1; }

.sidebar-tooltip-close {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255,255,255,0.8);
  padding: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
```

- [ ] **Step 2: Wire tooltip hook into App.tsx**

In `src/App.tsx`:

```typescript
// Add import
import { useSidebarTooltips, SidebarTooltip } from './features/onboarding/SidebarTooltips';

// Inside App function:
const { isShown: isTooltipShown, dismiss: dismissTooltip, getContent: getTooltipContent } =
  useSidebarTooltips(!!onboardingComplete);
```

In the sidebar navigation JSX, for each nav item that has a tooltip, wrap the item in a `position: relative` container and add the tooltip. Example for the dashboard nav item:

```tsx
<div style={{ position: 'relative' }}>
  <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
    onClick={() => setActiveTab('dashboard')}>
    <LayoutDashboard size={18} />
    {!isSidebarCollapsed && <span>Dashboard</span>}
  </button>
  <SidebarTooltip
    tab="dashboard"
    isShown={isTooltipShown('dashboard')}
    content={getTooltipContent('dashboard')}
    onDismiss={dismissTooltip}
  />
</div>
```

**Do this for all sidebar items that have tooltip content.** Read the sidebar JSX in App.tsx first to understand its structure and apply consistently.

- [ ] **Step 3: TypeScript check + tests**

```bash
npm run lint && npm run test
```

All pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/onboarding/SidebarTooltips.tsx src/features/onboarding/OnboardingWizard.css src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add one-time dismissible sidebar tooltips post-onboarding

Shows contextual hints for each sidebar tab after first onboarding.
Each tooltip dismissed independently, state persisted in user_settings.
Tooltips only shown once onboarding is complete.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Sprint 2 Done Checklist

Before declaring Sprint 2 complete, verify:

- [ ] `npm run test` passes with no failures (all tests including new ones)
- [ ] `npm run lint` has 0 new errors
- [ ] `cd src-tauri && cargo check` has 0 errors
- [ ] `cd server && npm test` passes JWT tests
- [ ] **Manual test — First run:** Delete `onboarding_complete` from SQLite (or test with a clean DB), restart app. Onboarding wizard appears.
- [ ] **Manual test — Onboarding completion:** Complete all 4 steps (or skip 2-4). Dashboard loads. Sidebar tooltips visible. Dismiss one, reload → that tooltip stays dismissed.
- [ ] **Manual test — Auth flow:** Start server locally (`cd server && npm run dev`). In Settings → Account, click "Sign in with Google". Browser opens. After completing OAuth: app receives callback, Settings shows user name and tier.
- [ ] **Manual test — PremiumGate:** Navigate to gated feature. Free user sees upgrade modal with AI Suite pricing. Close modal works.
- [ ] `grep -rn "localStorage" src/contexts src/components src/services --include="*.tsx" --include="*.ts"` — only migration shims (all inside `if (legacy...)` guards)
