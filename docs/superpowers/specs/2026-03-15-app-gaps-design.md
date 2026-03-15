# FlowFolio App Gaps — Design Spec
**Date:** 2026-03-15
**Status:** Approved for implementation

---

## Overview

Eight gaps identified across the FlowFolio desktop app: two broken features (data never wired up), three incomplete features (working but weak), and three missing features (not yet built). Grouped into implementation batches by dependency order.

---

## Group A — Bug Fixes

### A1: Risk Dashboard — Wire Real Holdings

**Problem:** `App.tsx:1138` calls `<RiskDashboard holdings={[]} portfolioValue={0} />` with hardcoded empty data. The component auto-generates demo analysis because it never receives real portfolio state. Portfolio holdings live inside `PortfolioTab`'s local `useState`, invisible to `App.tsx`.

**Fix:** Lift the portfolio holdings state up to `App.tsx`.

**Architecture:**
- Add `portfolioHoldings` state to `App.tsx`: `useState<RiskHolding[]>([])`
- Add `portfolioValue` state to `App.tsx`: `useState<number>(0)`
- Pass `onHoldingsChange={(h, v) => { setPortfolioHoldings(h); setPortfolioValue(v); }}` prop to `<PortfolioTab />`
- `PortfolioTab` calls `onHoldingsChange` whenever holdings or prices update, mapping its internal `Holding` type to the `RiskHolding` shape
- Pass real state to `<RiskDashboard holdings={portfolioHoldings} portfolioValue={portfolioValue} />`

**Holding type incompatibility — use a transform at the call site:**

`PortfolioTab.Holding` and `RiskDashboard.Holding` are structurally different and must NOT be merged into one shared type:

- `PortfolioTab.Holding`: `{ symbol, shares, cost_basis, current_price, market_value, target_pct, current_pct, drift_pct }`
- `RiskDashboard.Holding` (rename to `RiskHolding` in App.tsx for clarity): `{ symbol, shares, currentPrice, value, weight }`

Map at the `onHoldingsChange` call site inside `PortfolioTab`:
```typescript
// Called whenever PortfolioTab's holdings/prices update:
const riskHoldings = holdings.map(h => ({
  symbol: h.symbol,
  shares: h.shares,
  currentPrice: h.current_price,
  value: h.market_value,
  weight: h.current_pct / 100,
}));
onHoldingsChange(riskHoldings, totalValue);
```

Both local `Holding` type definitions stay where they are — no shared type file needed.

**No Rust changes required.**

---

### A2: News Feed → Journal — Actually Create the Entry

**Problem:** `App.tsx:1169` handles `onLogToJournal` with only `addToast(...)`. The `create_journal_entry` Tauri command is never called.

**Fix:** Call `invoke("create_journal_entry", { ... })` in the handler.

**Key detail:** `NewsFeed.handleLogToJournal` already constructs the content string as `"News: '${title}' (Source: ${source}) - Symbol: ${activeSymbol}"` before passing it up. `App.tsx` receives a pre-formatted `content` string — do not reformat it.

**Command signature uses snake_case (Tauri 2 Rust convention):**
```typescript
invoke("create_journal_entry", {
  event_type: "observation",
  title: string,        // article title, passed from NewsFeed
  content: string,      // pre-built string from NewsFeed, pass through as-is
  plan_version: null,
  tags: ["news"],
})
```

**Requires adding import to `App.tsx`:**
```typescript
import { invokeWithResilience } from '@/core/api/client';
```

**Change:** One handler in `App.tsx`. Replace:
```typescript
onLogToJournal={(title, _content) => {
  addToast(`Logged "${title}" to journal`, "success");
}}
```
With:
```typescript
onLogToJournal={async (title, content) => {
  try {
    await invokeWithResilience("create_journal_entry", {
      event_type: "observation",
      title,
      content,
      plan_version: null,
      tags: ["news"],
    });
    addToast(`Logged "${title}" to journal`, "success");
  } catch {
    addToast("Failed to log to journal", "error");
  }
}}
```

**No Rust changes required.**

---

## Group B — Feature Improvements

### B1: Rankings — Use the Real Scoring Engine

**Problem:** The Rankings tab's `scoreSymbols()` in `App.tsx` calls `get_scoring_config` (already correct) then calls `get_quant_metrics_batch` and manually converts metrics into a 3-factor score. The actual multi-factor Rust scoring engine (`score_symbols_batch`) is ignored.

**Fix:** Keep the `get_scoring_config` call. Remove the `get_quant_metrics_batch` call and the entire `metrics.map(...)` manual conversion block. Replace that section with a single `score_symbols_batch` call.

**Requires adding import to `App.tsx`** (same import as A2 — add once):
```typescript
import { invokeWithResilience } from '@/core/api/client';
```

**Replacement logic in `scoreSymbols()`:**
```typescript
// Step 1 — already exists, keep as-is
const config = await invokeWithResilience<ScoringConfig>("get_scoring_config", { plan });

// Step 2 — replace get_quant_metrics_batch + manual map with this:
const results = await invokeWithResilience<SymbolScore[]>("score_symbols_batch", {
  symbols: symbolsList,
  config,
});
results.sort((a, b) => b.total_score - a.total_score);
setScores(results);
```

**Types to add to `App.tsx` (replacing the existing `SymbolScore` interface):**
```typescript
interface ScoringConfig {
  factor_weights: Record<string, number>;
}

interface SymbolScore {
  symbol: string;
  total_score: number;
  factors: Array<{
    name: string;
    raw_value: number | null;
    normalized_value: number;
    weight: number;
    contribution: number;
  }>;
  explanation: string;
}
```

The results table already renders `score.factors` dynamically, so the UI works correctly with any number of factors from the real engine.

**No Rust changes required.**

---

### B2: Templates Tab — Add Descriptions and Factor Previews

**Problem:** Template cards show only the name with "Click to load this template configuration." No description, no factor preview, no category grouping.

**Fix:** Add a `TEMPLATE_METADATA` map in a new `src/shared/constants/templates.ts` keyed by template name, providing: description, category, and factor weights for the mini preview.

**Metadata structure:**
```typescript
interface TemplateMetadata {
  description: string;
  category: "growth" | "value" | "balanced" | "momentum" | "defensive";
  factors: Array<{ name: string; weight: number; color: string }>;
}
```

**Card redesign:** Each template card shows:
- Category badge (colored pill)
- Name (h3)
- Description (1–2 sentences)
- Factor bar chart (mini horizontal bars showing each factor's weight %)
- "Load Template →" button

**Categories and descriptions:** Defined statically in frontend constants — no backend change needed. If a template name has no metadata entry, fall back to the current minimal card.

**Loading state:** Templates are fetched async via `list_templates` on App mount. The `TEMPLATE_METADATA` map is static and available immediately. Template cards render as soon as `templates` state is populated — show a skeleton loader while the list loads. Template cards with metadata entries render enriched; those without fall back to the minimal card. Both states render in the same grid.

**No Rust changes required.**

---

### B3: Ticker Analysis — Sidebar Tab + Contextual Buttons

**Problem:** `TickerAnalysis.tsx` (1,045 lines) is only accessible deep inside VibeStudio. There is no standalone entry point.

**Decision:** Option C — own sidebar tab AND "Analyze →" buttons on Watchlist/Portfolio rows.

**Architecture:**

**Actual `TickerAnalysisProps` interface (from `TickerAnalysis.tsx:42`):**
```typescript
interface TickerAnalysisProps {
  symbol: string;              // required — pass "" as default; component handles empty gracefully
  onClose: () => void;         // required — pass a no-op () => {} from the tab render
  inline?: boolean;            // pass true to suppress the modal/overlay wrapper
  availableTickers?: string[];
  onTickerChange?: (ticker: string) => void;  // NOT onSymbolChange
}
```

**New sidebar tab:**
- Add `"analysis"` to the nav between Watchlist and Alerts
- Import `TickerAnalysis` lazily in `App.tsx`
- Add `analysisSymbol` state to `App.tsx`: `useState<string>("")`
- Render:
```typescript
<TickerAnalysis
  symbol={analysisSymbol}
  onClose={() => {}}
  inline={true}
  onTickerChange={setAnalysisSymbol}
/>
```

**Contextual routing from WatchlistTab:**
`WatchlistTab` already has a `handleAnalyzeSymbol` function that calls `onNavigate?.('ticker-analysis', { symbol })`. The problem is `handleNavClick` in `App.tsx` has signature `(tab: string)` and drops the second argument.

Fix: expand `handleNavClick` to `(tab: string, data?: Record<string, unknown>)`. When `tab === "analysis"` and `data?.symbol` is a string, call `setAnalysisSymbol(data.symbol as string)` before navigating.

No changes to `WatchlistTab.tsx` needed — it already calls `onNavigate('ticker-analysis', { symbol })` correctly. The only fix is in `App.tsx`'s `handleNavClick` to handle the data payload and map `'ticker-analysis'` to the `'analysis'` tab key.

**Contextual "Analyze →" buttons for PortfolioTab:**
`PortfolioTab` has no existing routing to Ticker Analysis. Add `onAnalyze?: (symbol: string) => void` prop to `PortfolioTab`. Each holding row gets an "Analyze →" button: `onClick={() => onAnalyze?.(holding.symbol)}`. In `App.tsx`, pass: `onAnalyze={(symbol) => { setAnalysisSymbol(symbol); handleNavClick("analysis"); }}`.

**No Rust changes required.**

---

## Group C — New Features

### C1: API Key Management in Settings

**Problem:** Market data provider API keys and the OpenRouter key can only be set via `.env` file. No UI exists.

**Important:** `tauri-plugin-stronghold` is present in `Cargo.toml` but NOT initialized in `lib.rs` — `modules/security/mod.rs` has stub no-ops. Do not use Stronghold here. Use `tauri-plugin-store` instead (simpler key-value persistence with file-based storage in the app data directory).

**Architecture:**

**Add `tauri-plugin-store`:**
```toml
# src-tauri/Cargo.toml
tauri-plugin-store = "2"
```
```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_store::Builder::default().build())
```
```json
// src-tauri/capabilities/default.json — add to the permissions array:
"store:default"
```

**New Tauri commands (Rust — `src-tauri/src/lib.rs`):**
```rust
// Returns which keys are configured (true/false) — never returns key values
#[tauri::command]
async fn get_api_key_statuses(app: tauri::AppHandle) -> Result<HashMap<String, bool>, String>

// Saves non-empty values to the store; skips empty strings (leave unchanged)
#[tauri::command]
async fn save_api_keys(app: tauri::AppHandle, keys: HashMap<String, String>) -> Result<(), String>
```

Both commands use `tauri_plugin_store::StoreExt` on `app` to access a persistent store at `api-keys.json` in the app data directory.

**Frontend (`SettingsPage.tsx`):**
- Add a new "API Keys" section below the existing profile form
- One masked `<input type="password">` per provider: Alpaca Key, Alpaca Secret, Finnhub, FMP, Tiingo, Twelve Data, Polygon, Alpha Vantage, OpenRouter
- Show/hide toggle per field (eye icon)
- "Save API Keys" button
- On mount: call `get_api_key_statuses` — show a green checkmark next to each configured key (value not shown)
- On save: call `save_api_keys` with only the fields the user typed (empty string = skip)

**Key names:** `alpaca_key`, `alpaca_secret`, `finnhub_key`, `fmp_key`, `tiingo_key`, `twelve_data_key`, `polygon_key`, `alpha_vantage_key`, `openrouter_key`

**Security:** Key values are never sent to the frontend. `get_api_key_statuses` returns only booleans. On app startup, `EnhancedMarketDataService` checks the store first, falling back to `.env`.

**Rust changes required:** 2 new commands + plugin registration.

---

### C2: OS-Level Price Alert Notifications

**Problem:** Price alerts fire only an in-app toast. If the app is minimized, alerts are missed. `tauri-plugin-notification` is not yet installed.

**Architecture:**

**Add Tauri notification plugin:**
```toml
# src-tauri/Cargo.toml
tauri-plugin-notification = "2"
```
```rust
// src-tauri/src/lib.rs — register plugin
.plugin(tauri_plugin_notification::init())
```
```json
// src-tauri/capabilities/default.json — add to the permissions array:
"notification:default"
```
Note: `tauri.conf.json` does NOT need a `"plugins"` block for Tauri 2 — plugin registration is done only in `lib.rs` + capabilities.

**New Tauri command:**
```rust
#[tauri::command]
fn send_price_alert_notification(
    app: tauri::AppHandle,
    symbol: String,
    message: String,
) -> Result<(), String>
```

**Frontend (`AlertsPanel.tsx`):**
- When an alert threshold is crossed, call `invokeWithResilience("send_price_alert_notification", { symbol, message })` in addition to `onAlertTriggered`
- Add a "Desktop notifications" toggle in AlertsPanel settings (stored in localStorage) so users can opt out

---

### C3: Portfolio Import — Broker CSV

**Problem:** The Portfolio tab only supports manual entry. Users can't import from brokers.

**Location decision:** Inside the Portfolio tab — collapsible "Import from Broker" section above the manual "Add Holding" form.

**Architecture:**

**Supported formats (CSV column detection):**
| Broker | Detection | Columns used |
|--------|-----------|--------------|
| Fidelity | Header contains `"Symbol"` + `"Quantity"` + `"Last Price"` | Symbol, Quantity, Last Price, Average Cost Basis |
| Schwab | Header contains `"Symbol"` + `"Quantity"` + `"Price"` | Symbol, Quantity, Price, Cost Basis |
| Vanguard | Header contains `"Symbol"` + `"Shares"` + `"Share Price"` | Symbol, Shares, Share Price, Average Cost |
| Generic | Any CSV with Symbol + Shares/Quantity columns | Symbol, Quantity/Shares, Price/Last Price |

**Frontend flow:**
1. Collapsible "Import from Broker" section in `PortfolioTab` (collapsed by default)
2. File picker (`.csv` files) via `<input type="file" accept=".csv">`
3. Parse CSV in frontend using `parseBrokerCSV()` (pure TS, no deps)
4. Detect broker format from headers
5. Show preview table: Symbol | Shares | Cost Basis | Action (✓ keep / ✗ skip)
6. User reviews, can toggle rows, then clicks "Import X Holdings"
7. Each accepted row is added to local portfolio state using the same `addHolding()` path that manual entry uses — no Tauri command needed
8. Success: show count toast, portfolio state updates immediately

**New helper:** `src/shared/utils/csvParser.ts` — pure TS, no deps.
```typescript
interface ParsedHolding {
  symbol: string;
  shares: number;
  costBasis: number | null;
}

export function parseBrokerCSV(text: string): { holdings: ParsedHolding[]; broker: string; errors: string[] }
```

**No Rust changes required.**

---

## Implementation Order

| Step | Item | Files changed | Rust? |
|------|------|---------------|-------|
| 1 | A1: Risk Dashboard wiring | `App.tsx`, `PortfolioTab.tsx`, `RiskDashboard.tsx` (map types at call site) | No |
| 2 | A2: News → Journal | `App.tsx` (add `invokeWithResilience` import + fix handler) | No |
| 3 | B1: Rankings real engine | `App.tsx` (replace `scoreSymbols` body, update types) | No |
| 4 | B2: Templates better UI | `App.tsx`, new `src/shared/constants/templates.ts` | No |
| 5 | B3: Ticker Analysis tab + buttons | `App.tsx` (expand `handleNavClick`, add tab, add state), `PortfolioTab.tsx` (add `onAnalyze` prop) | No |
| 6 | C1: API Key Settings | `SettingsPage.tsx`, `lib.rs`, `Cargo.toml`, `capabilities/default.json` | Yes (2 commands + plugin) |
| 7 | C2: OS Notifications | `AlertsPanel.tsx`, `lib.rs`, `Cargo.toml`, `capabilities/default.json` | Yes (1 command + plugin) |
| 8 | C3: Broker CSV Import | `PortfolioTab.tsx`, new `src/shared/utils/csvParser.ts` | No |

Steps 1–5 are frontend-only. Steps 6–8 include Rust changes. No step blocks any other.

---

## What Is Not Changing

- `WatchlistTab` internals — `handleAnalyzeSymbol` already works; only `handleNavClick` in `App.tsx` needs updating
- `TickerAnalysis` component internals — only wiring a new route
- `PortfolioTab` and `RiskDashboard` local `Holding` type definitions — kept separate, mapped at call site
- `upload.ts`, `scheduler.ts`, Instagram pipeline — entirely out of scope
- Remotion compositions — untouched
- `tauri-plugin-stronghold` — not touched; C1 uses `tauri-plugin-store` instead
