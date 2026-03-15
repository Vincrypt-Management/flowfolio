# Remove Supabase — Replace with Local Profile

**Date:** 2026-03-16
**Status:** Approved

---

## Goal

Remove all Supabase dependencies and replace the cloud auth/credits system with a local user profile. The app opens directly without a login gate. User identity comes from the existing `UserProfileContext` (already stores `displayName` etc. in `localStorage` under key `flowfolio-user-profile`).

---

## Key Insight: UserProfileContext Already Exists

`src/contexts/UserProfileContext.tsx` already provides exactly the local profile store needed:
- Stores `{ displayName, email, avatarUrl, accountType, bio, company, location, website }` in `localStorage('flowfolio-user-profile')`
- Provides `updateProfile()` and `resetProfile()`
- Already consumed by `SettingsPage.tsx`

**Strategy:** Rewrite `AuthContext.tsx` as a thin shim over `UserProfileContext`. It preserves the `useAuth()` interface so all 7 consumers work without changes. Do NOT create a new `LocalUserContext.tsx` — that would create a duplicate store.

---

## Architecture

### What Gets Deleted

| File/Dir | Reason |
|---|---|
| `src/services/supabase.ts` | Supabase client init |
| `src/services/auth.ts` | All auth methods (register, login, logout, credits) |
| `src/components/AuthPage.tsx` + `AuthPage.css` | Login/register/reset UI |
| `src/components/CreditsDashboard.tsx` + `CreditsDashboard.css` | Cloud credits — nothing to show locally |
| `src-tauri/src/services/auth_service.rs` | Supabase REST client in Rust |
| `supabase/` (directory) | Local dev config and migrations |

### AuthContext.tsx — Rewrite as Shim

Rewrite (not delete) `AuthContext.tsx` to:
- Import and call `useUserProfile()` from `UserProfileContext`
- Provide the same `useAuth()` hook with this interface:

```typescript
interface AuthContextType {
  user: {
    id: 'local';
    name: string;        // = profile.displayName
    username: string;    // = profile.displayName (fallback)
    avatar_url: string;  // = profile.avatarUrl
    email: string;       // = profile.email
  } | null;
  subscription: null;
  session: null;
  loading: false;
  isAuthenticated: true;
  login: () => Promise<void>;           // no-op, resolves immediately
  register: () => Promise<void>;        // no-op, resolves immediately
  loginWithGoogle: () => Promise<void>; // no-op, resolves immediately
  logout: () => void;                   // no-op (does NOT clear profile) — changed from `() => Promise<void>`
  refreshUser: () => Promise<void>;     // no-op, resolves immediately
}
```

**Breaking change note:** `logout` changes from `() => Promise<void>` to `() => void`. Verify no consumer `await`s it — currently `UserProfileCard.tsx` calls it without `await` so it is safe.

`user` is always non-null (derived from `useUserProfile().profile`). `isAuthenticated` is always `true`. `subscription` is always `null`. No async loading — profile is read synchronously from localStorage.

`logout()` is a **no-op** — it does not clear the profile. There is no re-authentication flow so clearing the profile would be a destructive accident.

### What Gets Updated

| File | Changes |
|---|---|
| `src/contexts/AuthContext.tsx` | Full rewrite as shim over `UserProfileContext` (see above) |
| `src/main.tsx` | Move `AuthProvider` inside `UserProfileProvider` (shim calls `useUserProfile()` internally, so it must be a child of `UserProfileProvider`). Do NOT delete `AuthProvider` — it still provides `useAuth()` to all 7 consumers. Corrected nesting: `<UserProfileProvider><AuthProvider>…</AuthProvider></UserProfileProvider>` |
| `src/App.tsx` | (1) Remove `AuthPage` login gate — render app directly; (2) Remove `isAuthenticated`/`authLoading` check; (3) Remove the `"credits"` tab from the sidebar nav array; (4) Remove the `activeTab === "credits"` render branch; (5) Remove `CreditCard` icon import if unused after removal |
| `src/components/UserProfileCard.tsx` | Use `user.name` and `user.avatar_url` from `useAuth()` — these now come from local profile. Remove tier badge. **Remove the logout button entirely** (a settings button already exists on the card; a no-op logout button would confuse users). |
| `src/components/Dashboard.tsx` | Delete the fourth "Credits" summary card (`CreditCard` icon, showing `subscription?.credits`). Remove the card entirely. Remove the `subscription` destructure from `useAuth()`. Remove the `CreditCard` import from lucide-react. |
| `src/components/WatchlistTab.tsx` | Remove `subscription` destructure and `max_watchlist_items` limit check. Remove the limit badge. Lists are unlimited. |
| `src/components/CreditsDashboard.tsx` | Deleted (see above) |
| `src/components/AuthPage.tsx` | Deleted (see above) |
| `package.json` | Remove `@supabase/supabase-js` dependency |
| `.env` | Remove `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` if present |
| `.env.example` | No changes needed — file already has no Supabase keys |

### Rust Backend — Complete Removal Checklist

All changes are in two files:

**`src-tauri/src/services/mod.rs`:**
- Remove line `pub mod auth_service;`
- Remove line `pub use auth_service::AuthService;`

**`src-tauri/src/lib.rs`:**
- Remove `AuthService` from the `use services::{...}` import block
- Remove the `lazy_static` entry for `AUTH_SERVICE`
- Remove the `init_supabase_service()` async function
- Remove the `init_supabase_service()` call inside the `.setup()` block
- Remove these four Tauri commands from both their function bodies and from the `.invoke_handler()` registration: `auth_get_subscription`, `auth_deduct_credits`, `auth_get_credits`, `auth_is_configured`
- Remove any remaining reference to `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` env vars

**`src-tauri/src/services/auth_service.rs`:** Delete the file.

---

## Data Flow (After)

```
App launches
  ↓
UserProfileProvider reads localStorage("flowfolio-user-profile")
  ↓ (if missing, uses DEFAULT_PROFILE: { displayName: "Investor", ... })
AuthContext shim reads from UserProfileContext — no async, no network
  ↓
App renders Dashboard directly (no login gate)
  ↓
useAuth() returns local user everywhere — always authenticated
```

---

## Settings Integration

`SettingsPage.tsx` already uses `useUserProfile()` directly to update `displayName`, `email`, `avatarUrl`, etc. No changes needed there. The `AuthContext` shim re-reads the profile on every render via `useUserProfile()`, so updates in Settings are instantly reflected in `UserProfileCard`.

---

## Initials Derivation

Initials are **not stored** — they are derived on read from `displayName`:
```typescript
const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'I';
```
This prevents stored-vs-derived inconsistency.

---

## Error Handling

- If `localStorage` is unavailable, `UserProfileContext` already falls back to `DEFAULT_PROFILE` in-memory.
- No network calls, no async auth state — eliminates auth-loading flicker entirely.

---

## Out of Scope

- Re-adding auth later (future spec)
- Migrating credits to a local system (future spec)
- OAuth / social login (removed entirely for now)
