# Remove Supabase Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Supabase infrastructure and replace the cloud auth/credits system with a local profile shim so the app opens directly without a login gate.

**Architecture:** Rewrite `AuthContext.tsx` as a thin shim over the existing `UserProfileContext` (which already stores profile data in localStorage). Delete all Supabase files, the login gate, and the credits tab. All 7 `useAuth()` consumers continue working without modification.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust — no new dependencies added.

**Spec:** `docs/superpowers/specs/2026-03-16-remove-supabase-design.md`

---

## Chunk 1: Rust Backend — Remove AuthService

### Task 1: Remove auth_service.rs and clean mod.rs

**Files:**
- Delete: `src-tauri/src/services/auth_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Delete auth_service.rs**

```bash
rm src-tauri/src/services/auth_service.rs
```

- [ ] **Step 2: Remove the two auth_service lines from mod.rs**

In `src-tauri/src/services/mod.rs`, remove:
```
pub mod auth_service;
```
and:
```
pub use auth_service::AuthService;
```

File after edit should have no reference to `auth_service`.

- [ ] **Step 3: Verify cargo check passes so far**

```bash
cd src-tauri && cargo check 2>&1 | head -40
```

Expected: errors about `AuthService` still referenced in `lib.rs` — that is expected at this stage, not a regression.

---

### Task 2: Remove all AuthService references from lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

Six removal points, each a separate edit:

- [ ] **Step 1: Remove `AuthService` from the services import block (line ~41)**

Find and remove `AuthService,` from:
```rust
use services::{
    EnhancedMarketDataService,
    enhanced_market_service::CacheStats,
    OpenRouterService,
    AlpacaService,
    FundamentalDataService,
    FundamentalMetrics,
    openrouter_service::OpenRouterMessage,
    AuthService,          // ← remove this line
};
```

- [ ] **Step 2: Remove the AUTH_SERVICE lazy_static entry (lines ~69-71)**

Remove:
```rust
    // Auth service (Supabase PostgreSQL)
    static ref AUTH_SERVICE: Arc<Mutex<Option<AuthService>>> =
        Arc::new(Mutex::new(None));
```

- [ ] **Step 3: Remove the init_supabase_service() function (lines ~2132-2149)**

Remove the entire block:
```rust
// ==================== SUPABASE AUTH & CREDITS (backend) ====================

/// Initialize Supabase REST-based credit/subscription service
async fn init_supabase_service() -> Result<(), String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL not set — Supabase features disabled".to_string())?;

    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set — Supabase features disabled".to_string())?;

    eprintln!("[INFO] [supabase] Initializing Supabase REST service...");

    let auth = AuthService::new(supabase_url, service_role_key);
    *AUTH_SERVICE.lock().await = Some(auth);

    eprintln!("[INFO] [supabase] ✅ Supabase service initialized");
    Ok(())
}
```

- [ ] **Step 4: Remove the four auth Tauri command functions (lines ~2151-2192)**

Remove all four functions:
- `async fn auth_get_subscription(...)`
- `async fn auth_deduct_credits(...)`
- `async fn auth_get_credits(...)`
- `async fn auth_is_configured()`

- [ ] **Step 5: Remove the four commands from .invoke_handler() registration (lines ~2344-2348)**

Remove these four lines from the `.invoke_handler(tauri::generate_handler![...])` block:
```rust
            // Supabase Credits (server-side)
            auth_get_subscription,
            auth_deduct_credits,
            auth_get_credits,
            auth_is_configured,
```

- [ ] **Step 6: Remove the init_supabase_service() call from .setup() (lines ~2380-2389)**

Remove:
```rust
                // Initialize Supabase service (non-blocking — app works without it)
                match init_supabase_service().await {
                    Ok(_) => {
                        eprintln!("[INFO] [app] ✅ Supabase service connected");
                    }
                    Err(e) => {
                        eprintln!("[WARN] [app] ⚠️ Supabase not available: {}", e);
                        eprintln!("[WARN] [app] App will run in offline/local mode");
                    }
                }
```

- [ ] **Step 7: Verify Rust compiles cleanly**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: zero errors, zero warnings about auth/supabase.

- [ ] **Step 8: Commit Rust changes**

```bash
git add src-tauri/src/services/mod.rs src-tauri/src/services/auth_service.rs src-tauri/src/lib.rs
git commit -m "feat: remove Supabase auth service from Rust backend"
```

---

## Chunk 2: Delete Frontend Supabase Files

### Task 3: Delete Supabase service files and components

**Files:**
- Delete: `src/services/supabase.ts`
- Delete: `src/services/auth.ts`
- Delete: `src/components/AuthPage.tsx`
- Delete: `src/components/AuthPage.css` (if exists)
- Delete: `src/components/CreditsDashboard.tsx`
- Delete: `src/components/CreditsDashboard.css` (if exists)
- Delete: `supabase/` directory

- [ ] **Step 1: Delete the files**

```bash
rm src/services/supabase.ts
rm src/services/auth.ts
rm src/components/AuthPage.tsx
rm -f src/components/AuthPage.css
rm src/components/CreditsDashboard.tsx
rm -f src/components/CreditsDashboard.css
rm -rf supabase/
```

- [ ] **Step 2: Remove @supabase/supabase-js from package.json**

In `package.json`, remove the line:
```json
"@supabase/supabase-js": "^2.99.1",
```

- [ ] **Step 3: Run npm install to update lockfile**

```bash
npm install
```

Expected: package removed from node_modules, package-lock.json updated.

- [ ] **Step 4: Commit deletions**

```bash
git add -A
git commit -m "feat: delete Supabase frontend files and remove @supabase/supabase-js package"
```

---

## Chunk 3: Rewrite AuthContext as Local Profile Shim

### Task 4: Rewrite AuthContext.tsx

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

The current file has 161 lines. Replace the entire content with a shim that wraps `useUserProfile()`.

Key design points:
- `AuthProvider` calls `useUserProfile()` internally — so it must run inside `UserProfileProvider` (we fix `main.tsx` in the next task)
- `user` is always non-null (derived from `profile.displayName` etc.)
- `isAuthenticated` is always `true`
- `subscription` and `session` are always `null`
- `loading` is always `false`
- All action methods (`login`, `register`, `loginWithGoogle`, `logout`, `refreshUser`) are no-ops

- [ ] **Step 1: Rewrite AuthContext.tsx**

Replace the entire file content with:

```typescript
import { createContext, useContext, ReactNode } from 'react';
import { useUserProfile } from './UserProfileContext';

interface LocalUser {
  id: 'local';
  name: string;
  username: string;
  avatar_url: string;
  email: string;
}

interface AuthContextType {
  user: LocalUser | null;
  subscription: null;
  session: null;
  loading: false;
  isAuthenticated: true;
  login: () => Promise<void>;
  register: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();

  const name = profile.displayName || 'Investor';

  const user: LocalUser = {
    id: 'local',
    name,
    username: name,
    avatar_url: profile.avatarUrl || '',
    email: profile.email || '',
  };

  const noop = () => Promise.resolve();

  const value: AuthContextType = {
    user,
    subscription: null,
    session: null,
    loading: false,
    isAuthenticated: true,
    login: noop,
    register: noop,
    loginWithGoogle: noop,
    logout: () => {},
    refreshUser: noop,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: rewrite AuthContext as local profile shim over UserProfileContext"
```

---

### Task 5: Fix provider nesting in main.tsx

**Files:**
- Modify: `src/main.tsx`

Currently `AuthProvider` wraps `UserProfileProvider` — the shim calls `useUserProfile()` so it must be the other way around.

- [ ] **Step 1: Move AuthProvider inside UserProfileProvider**

Current `main.tsx`:
```tsx
<ThemeProvider>
  <AuthProvider>
  <UserModeProvider>
  <UserProfileProvider>
  <ToastProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ToastProvider>
  </UserProfileProvider>
  </UserModeProvider>
  </AuthProvider>
</ThemeProvider>
```

Replace with:
```tsx
<ThemeProvider>
  <UserProfileProvider>
  <AuthProvider>
  <UserModeProvider>
  <ToastProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ToastProvider>
  </UserModeProvider>
  </AuthProvider>
  </UserProfileProvider>
</ThemeProvider>
```

- [ ] **Step 2: Commit**

```bash
git add src/main.tsx
git commit -m "feat: move AuthProvider inside UserProfileProvider for local shim"
```

---

## Chunk 4: Update Consuming Components

### Task 6: Update App.tsx

**Files:**
- Modify: `src/App.tsx`

Five changes needed:

- [ ] **Step 1: Remove the CreditsDashboard lazy import (line ~61)**

Remove:
```typescript
const CreditsDashboard = lazy(() => import("./components/CreditsDashboard").then(m => ({ default: m.CreditsDashboard })));
```

- [ ] **Step 2: Remove CreditCard from the lucide-react import (line ~45)**

Remove `CreditCard,` from the lucide-react import block.

- [ ] **Step 3: Remove the auth gate (lines ~669-679)**

Remove these blocks:
```tsx
  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
        <div className="tab-loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }
```

Also remove the `AuthPage` import at line ~8:
```typescript
import { AuthPage } from "./components/AuthPage";
```

Remove the entire `useAuth()` destructure at line ~111:
```typescript
const { isAuthenticated, loading: authLoading } = useAuth();
```

Then remove the `useAuth` import at line ~7:
```typescript
import { useAuth } from './contexts/AuthContext';
```

`useAuth` is not used anywhere else in App.tsx after these removals.

- [ ] **Step 4: Remove the "credits" nav item from the sidebar (lines ~586-595)**

Remove:
```tsx
        <button
          className={`nav-item ${activeTab === "credits" ? "active" : ""}`}
          onClick={() => handleNavClick("credits")}
          title={isSidebarCollapsed ? "Credits" : ""}
          role="menuitem"
          aria-current={activeTab === "credits" ? "page" : undefined}
        >
          <CreditCard className="nav-icon" size={20} />
          {!isSidebarCollapsed && <span>Credits</span>}
        </button>
```

- [ ] **Step 5: Remove the "credits" tab render branch (lines ~1246-1256)**

Remove:
```tsx
        {activeTab === "credits" && (
          <div className="animate-fade-in">
            <header className="page-header">
              <h1 className="page-title">Credits & Subscription</h1>
              <p className="page-subtitle">Manage your credits and account tier</p>
            </header>
            <Suspense fallback={<TabLoading />}>
              <CreditsDashboard onNavigate={handleNavClick} />
            </Suspense>
          </div>
        )}
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: remove auth gate, credits tab, and CreditsDashboard from App"
```

---

### Task 7: Update UserProfileCard.tsx

**Files:**
- Modify: `src/components/UserProfileCard.tsx`

Remove tier badge, logout button, and tier-related logic. The `user` now comes from the local shim.

- [ ] **Step 1: Rewrite UserProfileCard.tsx**

Replace the entire file:

```typescript
import { useAuth } from '../contexts/AuthContext';
import { User, Settings } from 'lucide-react';
import './UserProfileCard.css';

interface UserProfileCardProps {
  collapsed: boolean;
  onSettingsClick: () => void;
}

export function UserProfileCard({ collapsed, onSettingsClick }: UserProfileCardProps) {
  const { user } = useAuth();

  const displayName = user?.name || 'Investor';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'I';

  return (
    <div className={`user-profile-card ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="user-profile-btn"
        onClick={onSettingsClick}
        title={collapsed ? `${displayName} — Settings` : ''}
        aria-label="Open account settings"
      >
        <div className="user-avatar">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={displayName} className="user-avatar-img" />
          ) : (
            <span className="user-avatar-initials">{initials || <User size={16} />}</span>
          )}
        </div>
        {!collapsed && (
          <div className="user-info">
            <span className="user-name">{displayName}</span>
          </div>
        )}
      </button>
      {!collapsed && (
        <div className="user-actions">
          <button className="user-action-btn" onClick={onSettingsClick} title="Settings" aria-label="Settings">
            <Settings size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UserProfileCard.tsx
git commit -m "feat: remove tier badge and logout button from UserProfileCard"
```

---

### Task 8: Update Dashboard.tsx

**Files:**
- Modify: `src/components/Dashboard.tsx`

Remove the Credits summary card, the `subscription` destructure, and the `CreditCard` import.

- [ ] **Step 1: Remove CreditCard from the lucide-react import (line ~21)**

In `Dashboard.tsx`, remove `CreditCard,` from the lucide-react import block.

- [ ] **Step 2: Remove the subscription destructure (line ~96)**

Change:
```typescript
  const { subscription } = useAuth();
```
to remove it entirely (or if `useAuth` is still used for something else, just remove `subscription` from the destructure).

- [ ] **Step 3: Remove the `credits` variable (line ~176)**

Remove:
```typescript
  const credits = subscription?.credits ?? 0;
```

- [ ] **Step 4: Remove the fourth summary card (lines ~308-317)**

Remove:
```tsx
        <div className="summary-card">
          <div className="summary-card-header">
            <CreditCard size={18} className="summary-icon accent" />
            <span className="summary-label">Credits</span>
          </div>
          <div className="value">{credits.toLocaleString()}</div>
          <div className="change muted">
            {subscription?.tier ?? "free"} plan
          </div>
        </div>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: remove Credits summary card from Dashboard"
```

---

### Task 9: Update WatchlistTab.tsx

**Files:**
- Modify: `src/components/WatchlistTab.tsx`

Remove subscription limit enforcement.

- [ ] **Step 1: Remove the subscription destructure (line ~56)**

Change:
```typescript
  const { subscription } = useAuth();
```
Remove this line entirely (verify `useAuth` import at top of file — if `subscription` was the only thing used, remove the whole destructure; if nothing else from useAuth is used, remove the import too).

- [ ] **Step 2: Remove the maxItems variable (line ~93)**

Remove:
```typescript
  const maxItems = subscription?.max_watchlist_items ?? 50;
```

- [ ] **Step 3: Remove all four maxItems call sites**

There are four usages of `maxItems` to remove:

**Line ~202** — remove the entire if-block that blocks adding symbols over the limit:
```typescript
if (totalSymbolCount + symbols.length > maxItems) { ... }
```

**Line ~244** — remove the entire if-block that blocks adding symbols over the limit:
```typescript
if (totalSymbolCount + uniqueNew.length > maxItems) { ... }
```

**Line ~374** — simplify the symbol count badge from `{totalSymbolCount} / {maxItems} symbols` to just `{totalSymbolCount} symbols`

- [ ] **Step 4: Remove the useAuth import**

After removing `subscription` (Step 1), `useAuth` is no longer used in this file. Remove:
```typescript
import { useAuth } from '../contexts/AuthContext';
```
and the destructure line:
```typescript
const { subscription } = useAuth();
```

- [ ] **Step 4: Commit**

```bash
git add src/components/WatchlistTab.tsx
git commit -m "feat: remove subscription limit enforcement from WatchlistTab"
```

---

## Chunk 5: Final Cleanup & Verification

### Task 10: Clean .env and verify TypeScript

- [ ] **Step 1: Remove Supabase keys from .env if present**

Open `.env` and remove these lines if present:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`.env.example` needs no changes (already has no Supabase keys).

- [ ] **Step 2: Run TypeScript lint to confirm no errors**

```bash
npm run lint
```

Expected: zero TypeScript errors. Common things to check if errors appear:
- Any remaining `import ... from '../services/auth'` → remove the import
- Any remaining `import ... from '../services/supabase'` → remove the import
- Any remaining `import { AuthPage }` in App.tsx → should already be removed

- [ ] **Step 3: Check for any remaining Supabase references**

```bash
grep -r "supabase\|@supabase\|AuthPage\|CreditsDashboard\|auth_service" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: no files found.

- [ ] **Step 4: Run Rust check one final time**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: zero errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: remove Supabase — app now runs fully local with no auth gate"
```

---

## Verification

After all tasks complete, manually verify:

1. `npm run dev:web` starts without errors
2. App opens directly to Dashboard (no login page)
3. `UserProfileCard` shows "Investor" (default name) with no tier badge, no logout button
4. Dashboard has 3 summary cards (no Credits card)
5. Watchlist has no limit badge
6. No console errors about missing Supabase keys
7. Settings → Profile section still works (name change reflects in sidebar)
