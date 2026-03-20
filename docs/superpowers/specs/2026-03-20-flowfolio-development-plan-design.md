# FlowFolio Development Plan Design

**Date:** 2026-03-20
**Status:** Reviewed — pending user sign-off
**Author:** Product Owner / PM session

---

## Overview

FlowFolio is a privacy-first desktop investment planning and portfolio management application built with Tauri 2, React 19, and Rust. This document defines the phased development plan from current state (v0.1.0 MLP) through full freemium product launch.

---

## Business Model

**Freemium — cost-justified premium only.**

- Everything that runs on local compute is **free forever**
- Premium gates apply **only** to features that incur real costs to operate
- Two premium pillars, each independently subscribable

| Tier | What it unlocks | Cost driver |
|---|---|---|
| Free | All local features: scoring, backtest, portfolio tracking, quant analysis, watchlist, alerts, news via free APIs | None |
| AI Suite | Portfolio Agent, NL plan builder, AI journal insights | OpenRouter API (LLM token costs) |
| Cloud Sync | Multi-device sync, optional cloud backup | Server + Postgres infrastructure |
| Pro | Both AI Suite + Cloud Sync bundled | Both of the above |

---

## Current State Assessment (v0.1.0)

### What is built and functional

- App shell: sidebar navigation, Simple/Advanced mode toggle, theme toggle, mobile responsiveness
- Dashboard: market overview, portfolio summary, quick actions
- Vibe Studio: strategy creation with factor weighting (momentum, value, quality, growth, size, volatility)
- Templates: pre-built strategy templates with category metadata
- Rankings: factor-based symbol scoring and ranking table (inline in App.tsx, ~120 lines)
- Portfolio Tab: holdings tracking, buy list generation, rebalance report, CSV import (partial)
- Backtest Lab: historical simulation with metrics
- Journal: investment journal with entry CRUD
- Watchlist: symbol universe management with price tracking (extracted component)
- Ticker Analysis: deep-dive per-symbol analysis (extracted component)
- Alerts Panel: price alerts (localStorage — not persistent across reinstalls)
- Comparison Mode: side-by-side ticker comparison
- Risk Dashboard: portfolio risk metrics, VaR, drawdown chart
- Rebalance Scheduler: automated rebalancing scheduling (localStorage — not persistent across reinstalls)
- News Feed: market news with sentiment analysis
- Yearly Review: annual portfolio review checklist
- Settings: user profile + API key management via Tauri Stronghold
- Data Sources: provider health and cache stats
- Rust backend: 8-provider market data with failover, scoring engine, backtest engine, portfolio optimizer, journal CRUD, universe management, plan compiler, quant analysis, export/import, OpenRouter AI service, Alpaca service

### Known gaps and issues

- **Epic F (Portfolio Construction) is marked partial** — optimizer.rs exists but buy list / rebalance flow has frontend-backend gaps
- **AlertsPanel uses localStorage** — data lost on reinstall
- **RebalanceScheduler uses localStorage** — data lost on reinstall
- **UserProfileContext uses localStorage** — profile data not persistent across reinstalls
- **App.tsx is 1234 lines** — Templates tab (~85 lines), Rankings tab (~120 lines), Universe tab (~150 lines) are inline
- **invokeWithResilience imported from `./services/apiClient`** — CLAUDE.md specifies it should come from `src/core/api/client` — inconsistency needs resolving
- **Zero frontend test coverage** — no Vitest setup, financial calculations untested
- **PROJECT_STATUS.md and QA_AUDIT_REPORT.md referenced in README but do not exist**
- **No onboarding flow** — new users land on Dashboard with no guidance
- **auth.ts exists (untracked)** — Google OAuth scaffolding started but not wired to UI
- **API keys partially in .env** — some VITE_* prefixed keys potentially embedded in frontend bundle

---

## Development Plan

### Sprint 1 — Foundation
**Goal:** Rock-solid, fully persistent, architecturally clean app before any monetization work.

**Done criteria for Sprint 1:** All localStorage usage eliminated from the app. Epic F buy list and rebalance flow work end-to-end. App.tsx under 700 lines. Vitest running with tests for all functions in `shared/utils/calculations.ts`. API key audit complete with findings documented.

#### 1A — Complete Epic F: Portfolio Construction

| Item | Current State | Fix | Acceptance Criteria |
|---|---|---|---|
| Buy list generation | UI exists, backend partial | Wire `generate_buy_list` end-to-end: equal-weight, score-weight, and manual allocation methods | User can select allocation method, enter contribution amount, and receive a buy list with symbol, shares, and dollar amounts |
| Rebalance report | UI shows report, no transaction recording | Add `record_rebalance_transaction` Tauri command + SQLite `rebalance_transactions` table | Rebalance actions are persisted and visible in transaction history after execution |
| Portfolio optimizer | `optimizer.rs` built | Expose via `optimize_portfolio` command, connect to PortfolioTab UI | User can run optimization and see suggested target allocations with explanations |
| Broker CSV import | `csvParser.ts` started | Complete parsing for Fidelity, Schwab, IBKR CSV formats | Importing a valid CSV from each broker correctly populates holdings without manual correction |

#### 1B — Data Persistence: localStorage to SQLite

| Component | Current | Fix | Acceptance Criteria |
|---|---|---|---|
| AlertsPanel | localStorage (`flowfolio_price_alerts`) | New Tauri commands: `create_alert`, `list_alerts`, `update_alert`, `delete_alert` + SQLite `price_alerts` table | Alerts survive app reinstall; existing localStorage alerts migrated on first run |
| RebalanceScheduler | localStorage | New Tauri commands: `save_schedule`, `list_schedules`, `delete_schedule` + SQLite `rebalance_schedules` table | Schedules survive app reinstall |
| UserProfileContext | localStorage | Move to SQLite `user_settings` table via `save_settings` / `load_settings` commands | Profile name, avatar, and mode preference persist across reinstalls |

#### 1C — Code Architecture Cleanup

| Item | Fix | Acceptance Criteria |
|---|---|---|
| App.tsx inline tabs | Extract Templates, Rankings, Universe tab rendering into `TemplatesTab.tsx`, `RankingsTab.tsx`, `UniverseTab.tsx` | App.tsx under 700 lines; each extracted component is independently importable |
| invokeWithResilience path | Resolve import discrepancy — either move the export to `src/core/api/client.ts` per CLAUDE.md or update CLAUDE.md to reflect actual path; do not leave both in place | Single canonical import path used consistently across all files |
| Missing docs | Create `PROJECT_STATUS.md` (epic completion status, known issues, next steps) and `QA_AUDIT_REPORT.md` (code quality findings from this audit) | Both files exist, are accurate to current state, and README links resolve |
| Frontend tests | Add Vitest; audit `shared/utils/calculations.ts` for all exported functions; write tests for each | Vitest runs in CI; all calculation functions have at least one happy path and one edge case test |
| API key security | Audit `.env` and codebase for `VITE_*` prefixed sensitive keys | All sensitive API keys (provider keys, OpenRouter) flow through Tauri Stronghold only; no secret keys embedded in frontend bundle |

---

### Sprint 2 — Onboarding + Auth Scaffolding
**Goal:** Nail first impressions for new users and lay the auth/premium infrastructure that both monetization pillars reuse.

**Done criteria for Sprint 2:** New user opening the app sees the onboarding wizard. Returning user can log in via Google in Settings and their tier is reflected in the UI. PremiumGate component exists and is wired to at least one placeholder premium feature as a proof of concept. Backend server is deployed and reachable from the Tauri app.

#### 2A — First-Run Onboarding Flow

4-step wizard shown once on first launch. `onboarding_complete` flag persisted in SQLite via the `user_settings` table added in Sprint 1B.

| Step | Content | Skippable |
|---|---|---|
| 1 — Welcome | What FlowFolio is, the privacy promise, Simple vs Advanced mode toggle | No |
| 2 — Your Universe | Create first watchlist — add tickers or pick from preset (S&P 500, Tech, Dividend) | Yes |
| 3 — Your Strategy | Load a template Vibe Plan or start blank | Yes |
| 4 — API Keys | Set up data providers, explains free tiers, Yahoo Finance works with zero setup | Yes |

After completion: Dashboard with one-time dismissible contextual tooltips on each sidebar item.

#### 2B — Auth and Premium Gate Scaffolding

**Backend server**

Framework: Node.js with Hono (lightweight, TypeScript-native, fast cold start). Deployed to a simple VPS or Railway. Database: Postgres (managed, e.g. Supabase or Railway Postgres).

The Tauri app discovers the server URL via a compile-time env var (`VITE_SERVER_URL`, already present in `auth.ts`). Development points to `localhost:3001`, production points to the deployed URL.

Server responsibilities in Sprint 2 (minimal):
- `GET /auth/google` — initiates Google OAuth flow
- `GET /auth/google/callback` — exchanges code for tokens, issues JWT + refresh token
- `POST /auth/refresh` — refreshes access token
- `POST /auth/logout` — invalidates refresh token
- `GET /user/me` — returns user profile + subscription tier
- `PATCH /user/me` — updates profile fields
- Postgres schema: `users (id, email, name, avatar_url, subscription_tier, created_at)`, `refresh_tokens (id, user_id, token_hash, expires_at)`

JWT structure:
- Access token: 1-hour expiry, contains `{ user_id, email, tier }` claim
- Refresh token: 30-day expiry, stored hashed in DB
- On app start: if access token expired, auto-refresh silently; if refresh token expired, user is logged out and tier falls back to `free`
- Tier revocation (for cancelled subscriptions): Stripe webhook (Sprint 3) updates `subscription_tier` in DB. Next time the access token refreshes (within 1 hour), the new JWT carries the downgraded tier. App checks tier on every app start via the refresh flow — so cancellation propagates within 1 hour maximum.

**AuthContext** (wire existing `auth.ts`)
- Google OAuth login/logout exposed in Settings page
- Auth state app-wide: `isLoggedIn`, `user`, `tier` (`free` | `ai` | `sync` | `pro`)
- On login: fetch user profile + subscription tier, cache tier in JWT
- On app start: silently refresh token if expired; if refresh fails, fall back to `free` tier

**PremiumGate component**
- Reusable wrapper: `<PremiumGate tier="ai">...</PremiumGate>`
- If user lacks tier: shows upgrade modal with value prop for that specific tier
- If user has tier: renders children transparently
- Modal includes: feature description, pricing, "Upgrade" CTA (links to Stripe, Sprint 3), "Maybe later" dismiss

**SubscriptionContext**
- Reads tier from cached JWT claim (no server round-trip per feature access)
- Exposes `hasTier(tier: 'ai' | 'sync' | 'pro'): boolean` helper
- `pro` tier grants both `ai` and `sync` access
- Re-verifies tier on every app start via the token refresh flow

---

### Sprint 3 — AI Suite (Premium Pillar 1)
**Goal:** Ship the first monetizable premium tier with Stripe integration.

**Note on scope:** Sprint 3 is large. If velocity is lower than expected, split into Sprint 3a (Portfolio Agent + NL Plan Builder + Stripe) and Sprint 3b (AI Journal Insights). Ship 3a first — it covers the most visible premium value.

**Done criteria for Sprint 3:** A logged-in user with an active AI Suite subscription can use all three AI features. A free user sees the PremiumGate upgrade prompt. Stripe checkout flow works end-to-end in production.

#### 3A — Portfolio Agent (polish and gate existing feature)

The agent exists in `openrouter_service.rs` and `portfolioAgent.ts`.

| Item | Detail | Acceptance Criteria |
|---|---|---|
| PremiumGate wrapper | Gate entry point with `tier="ai"` | Free users see upgrade modal; AI tier users see the agent |
| Streaming responses | Tauri does not support streaming via `invoke` — implement using Tauri event emitter pattern: Rust emits `ai-token` events, frontend listens and appends tokens to UI | Response appears word-by-word as tokens arrive; no full-response wait |
| Conversation history | Pass `Vec<{role, content}>` to OpenRouter for follow-up questions | User can ask a follow-up question in the same session and the agent retains prior context |
| Context injection | Auto-inject current portfolio holdings + active Vibe Plan into system prompt | Agent responses reference actual user holdings without user having to paste them manually |
| Local cache | Cache last response keyed on SHA256 hash of portfolio state + query | Re-opening agent for same portfolio without new entries shows cached response instantly |

#### 3B — Natural Language Plan Builder

New feature. User describes strategy in plain English → generates complete VibePlan.

| Layer | Implementation | Acceptance Criteria |
|---|---|---|
| UI | "Describe your strategy" tab in Vibe Studio alongside existing manual builder | Tab is visible and accessible from Vibe Studio |
| Backend command | `generate_plan_from_nl` → sends prompt + factor schema to OpenRouter → parses response into `VibePlan` struct | Command returns a valid VibePlan or a structured error |
| Validation | Generated plan runs through existing `plan_compiler` before presenting to user | Invalid plans (e.g. weights not summing to 1.0) are caught and surfaced as user-readable errors, not crashes |
| UX | Shows generated factor weights as editable preview — user can tweak before saving | User can adjust weights after generation before committing to save |
| Fallback | If JSON parse fails, show raw OpenRouter response with retry CTA | User is never shown a blank screen or unhandled error on parse failure |

#### 3C — AI Journal Insights

New feature. Analyzes journal entries and surfaces behavioral patterns.

| Item | Detail | Acceptance Criteria |
|---|---|---|
| Entry point | "Insights" button in JournalTab, gated by `PremiumGate tier="ai"` | Button is visible; free users see upgrade modal |
| Analysis types | Win/loss pattern themes, emotional triggers, decision consistency score | At least these three analysis dimensions returned per insight generation |
| Backend command | `generate_journal_insights` → batches up to last 50 entries → OpenRouter → structured JSON response | Command returns parseable insights or a structured error |
| Caching | Results cached in SQLite `ai_insights` table with `generated_at` timestamp | If no new journal entries since last generation, cached result is returned without an API call |
| Privacy disclosure | In-UI note before first use: "Your journal entries will be sent to OpenRouter's API for analysis. They are not stored on FlowFolio's servers." | Disclosure shown and user must acknowledge before first insights generation |

#### 3D — Stripe Integration

| Item | Detail | Acceptance Criteria |
|---|---|---|
| Plans | AI Suite (monthly + annual), Pro bundle (monthly + annual) | Both plans visible in upgrade modal with correct pricing |
| Checkout flow | PremiumGate "Upgrade" CTA → Stripe hosted checkout → success redirect → tier updated | User completing checkout sees their tier update in the app within 1 minute |
| Webhook | `POST /webhooks/stripe` (Stripe-signed) → verifies signature → updates `subscription_tier` in Postgres | Webhook handles `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated` |
| Cancellation | Tier downgrades to `free` within 1 hour of subscription end (via JWT refresh cycle) | Cancelled user loses AI features within 1 hour; no extended grace period |

---

### Sprint 4 — Cloud Sync (Premium Pillar 2)
**Goal:** Multi-device sync as a second independently subscribable premium tier. Offline-first.

**Done criteria for Sprint 4:** A Cloud Sync subscriber can install FlowFolio on a second device, log in, and restore all their data. Changes made on device A appear on device B within 5 minutes when both are online.

#### 4A — What Gets Synced

| Data | Synced | Rationale |
|---|---|---|
| Vibe Plans | Yes | Core strategy — user wants this everywhere |
| Portfolios + Holdings | Yes | Track performance across devices |
| Journal entries | Yes | High personal value |
| Watchlists / Universes | Yes | Curated symbol lists |
| Alerts | Yes | Should fire regardless of which device is open |
| Rebalance schedules | Yes | Recurring actions must be consistent |
| User profile / avatar | Yes | Consistent identity across devices |
| API keys | No | Security — stays local in Tauri Stronghold only |
| Market data cache | No | Cheap to re-fetch, large, no value syncing |

#### 4B — Sync Architecture

**Conflict resolution: Last-Write-Wins by client `updated_at` timestamp**

The device with the most recent `updated_at` timestamp wins. This is resolved on the server: when two devices push conflicting records, the server stores the one with the later `updated_at` and discards the other. The "server timestamp wins" language in earlier drafts was incorrect and has been removed.

Each syncable record gets:
- `updated_at` timestamp (already on most models — verify and add where missing)
- `device_id` — UUID generated on first app launch, stored in `user_settings`
- `deleted_at` — soft delete tombstone (prevents resurrection on pull after local delete)

| Layer | Implementation |
|---|---|
| Push | On any local write → insert into `sync_queue` SQLite table (record type, record id, updated_at) → background worker batches and pushes to server when online |
| Pull | On app start + every 5 minutes → `GET /sync/pull?since=<last_sync_at>` → apply received changes to local SQLite → update `last_sync_at` |
| Conflict | Server compares `updated_at` of incoming vs stored record; stores the one with later timestamp |
| Offline | All writes go to local SQLite first; `sync_queue` drains when connectivity returns |
| First restore | On first login on a new device: `GET /sync/pull?since=0` (full restore) |

#### 4C — Server Sync Endpoints (Sprint 4 additions)

| Endpoint | Purpose |
|---|---|
| `POST /sync/push` | Receive batch of changed records; apply LWW conflict resolution per record |
| `GET /sync/pull?since=<unix_ms>` | Return all records updated after timestamp for this user |
| `DELETE /sync/record/:type/:id` | Tombstone a deleted record (sets `deleted_at`) |
| `GET /sync/status` | Return `last_updated_at` per data type for status display |

Storage: Postgres tables per syncable entity type, mirroring local SQLite schema. Add `user_id`, `device_id`, `deleted_at` columns to each.

#### 4D — Sync UX

| Element | Detail |
|---|---|
| Sync status indicator | Icon in sidebar footer: green checkmark (synced), spinning (syncing), grey dot (offline / not logged in) |
| Last synced display | Settings → Account section: "Last synced 3 minutes ago" |
| Manual sync button | "Sync now" button in Settings → Account |
| Selective sync toggles | Per data type in Settings → Sync: toggle off to exclude from sync (e.g. "don't sync journal") |
| First login on new device | Modal: "Found your cloud data — restore now? (X plans, Y portfolios, Z journal entries)" with Restore / Skip options |
| PremiumGate | All sync UI gated behind `tier="sync"` or `tier="pro"` |

#### 4E — Stripe Plan (Sprint 4 addition)

| Plan | Includes | Suggested Price |
|---|---|---|
| AI Suite | Portfolio Agent + NL plan builder + AI journal insights | $9/mo or $79/yr |
| Cloud Sync | Multi-device sync + backup | $4/mo or $35/yr |
| Pro | AI Suite + Cloud Sync bundled | $12/mo or $99/yr |

Add Cloud Sync plan to Stripe in Sprint 4. Add `checkout.session.completed` webhook handling for the new plan. Existing webhook handler from Sprint 3 handles `subscription_tier` updates — extend to map Cloud Sync product to `sync` tier.

---

## Sprint Summary

| Sprint | Focus | Key Deliverables |
|---|---|---|
| 1 | Foundation | Epic F complete, localStorage migrated to SQLite, App.tsx refactored, invokeWithResilience path resolved, tests added, docs created |
| 2 | Onboarding + Auth scaffolding | First-run wizard, PremiumGate component, AuthContext wired, Hono backend server deployed, SubscriptionContext, JWT + refresh token flow |
| 3 | AI Suite (Premium Pillar 1) | Portfolio Agent polished + gated (Tauri event streaming), NL plan builder, AI journal insights, Stripe integration |
| 4 | Cloud Sync (Premium Pillar 2) | LWW sync engine, server sync endpoints, selective sync UX, Cloud Sync Stripe plan |

---

## Architecture Decisions

- **Offline-first throughout** — every feature works locally; cloud is additive, never required
- **JWT tier claim with 1-hour expiry** — tier travels in the token, no per-feature server check; revocation propagates within 1 hour via refresh cycle
- **PremiumGate is the single enforcement point** — no scattered tier checks in business logic
- **Last-Write-Wins sync by client `updated_at`** — simple, predictable, correct for personal finance data with rare true conflicts
- **Tauri Stronghold for all secrets** — API keys never leave the device, never synced
- **OpenRouter for AI** — abstracts model selection, single API key for all AI features
- **Tauri event emitter for AI streaming** — `invoke` does not support streaming; Rust emits token events, frontend listens
- **Hono on Node.js for backend** — lightweight, TypeScript-native, fast to build; avoids adding a second Rust service while the team is already maintaining a Rust desktop backend
- **Server URL via `VITE_SERVER_URL`** — already present in `auth.ts`; dev defaults to `localhost:3001`, prod set at build time
