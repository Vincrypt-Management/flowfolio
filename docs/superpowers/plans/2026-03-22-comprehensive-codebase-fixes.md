# Comprehensive Codebase Fixes — Round 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and medium priority issues identified in the full-stack codebase audit — covering CI, git hygiene, dead code removal, deduplication, error handling, performance, and frontend quality.

**Architecture:** Four phases of independent fixes: (1) CI & git cleanup, (2) Rust backend quality, (3) Frontend deduplication & quality, (4) Build & config optimization. Each task is self-contained and produces a working build.

**Tech Stack:** Rust, TypeScript/React, Tauri 2, Vite 7, GitHub Actions, SQLite

---

## Phase 1: CI, Git Hygiene & Critical Fixes

### Task 1: Add test steps to CI preflight + Rust cache

**Files:**
- Modify: `.github/workflows/release.yml` (preflight job, lines 15-27)

- [ ] **Step 0: Verify all tests pass locally first**

Run:
```bash
cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio
npx vitest run 2>&1 | tail -5
cd src-tauri && cargo test 2>&1 | tail -5
```
Expected: Both pass. If vitest has failures, fix them before adding to CI (or use `npx vitest run --passWithNoTests` in CI).

- [ ] **Step 1: Add cargo test and npm test to preflight job, plus Rust cache**

In `.github/workflows/release.yml`, replace the `preflight` job with:

```yaml
  preflight:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx vitest run
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            libssl-dev \
            libgtk-3-dev \
            libsoup-3.0-dev \
            libjavascriptcoregtk-4.1-dev
      - run: cd src-tauri && cargo fmt --check
      - run: cd src-tauri && cargo clippy -- -D warnings
      - run: cd src-tauri && cargo test
```

- [ ] **Step 2: Fix Android build flags**

In the same file, in the `build-android` job, change:
```yaml
      - name: Initialize Tauri Android
        run: |
          if [ ! -f src-tauri/gen/android/build.gradle.kts ]; then
            npx tauri android init
          fi
```

And change `--apk true` to `--apk`:
```yaml
      - name: Build APK
        env:
          NDK_HOME: ${{ env.ANDROID_HOME }}/ndk/27.0.12077973
        run: npx tauri android build --apk
```

Also remove unnecessary x86 targets from the `targets:` line:
```yaml
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi
```

- [ ] **Step 3: Run CI lint locally to verify YAML is valid**

Run: `cd /Users/evintleovonzko/Documents/Works/vincrypt/flowfolio && cat .github/workflows/release.yml | head -5`
Expected: valid YAML

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add cargo test, npm test, fmt check, and Rust cache to preflight"
```

---

### Task 2: Remove binary artifacts from git and fix .gitignore

**Files:**
- Modify: `.gitignore`
- Remove tracked: `flowfolio-release.apk`, `release/`

- [ ] **Step 1: Add release artifacts to .gitignore**

Append to `.gitignore`:

```
# Release artifacts (hosted on GitHub Releases, not in git)
release/
*.apk
*.aab
*.dmg
*.exe
*.msi
*.deb
*.AppImage
*.idsig
```

- [ ] **Step 2: Remove tracked binary artifacts**

```bash
git rm --cached flowfolio-release.apk
git rm -r --cached release/
```

Note: This removes them from git tracking but keeps local copies. The files are already on GitHub Releases.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: remove binary artifacts from git, add to .gitignore"
```

---

### Task 3: Remove dead Rust modules and clean up domain layer

**Files:**
- Modify: `src-tauri/src/modules/mod.rs`
- Delete: `src-tauri/src/modules/worker_pool/mod.rs` (and directory)
- Delete: `src-tauri/src/modules/cache/mod.rs` (and directory)
- Delete: `src-tauri/src/modules/security/mod.rs` (and directory)
- Delete: `src-tauri/src/modules/data_provider/sync_service.rs`
- Delete: `src-tauri/src/modules/data_provider/optimized_client.rs`
- Modify: `src-tauri/src/modules/data_provider/mod.rs` (remove sync_service and optimized_client declarations)
- Delete: `src-tauri/src/domain/` (entire directory — pure unused re-exports)
- Modify: `src-tauri/src/lib.rs` (remove `mod domain;` declaration)

- [ ] **Step 1: Verify modules are truly unused**

Run these greps and confirm no results (each must return empty):
```bash
cd src-tauri
grep -r "worker_pool\|WorkerPool" src/ --include="*.rs" | grep -v "mod.rs" | grep -v "#\[allow"
grep -r "modules::cache\|CacheManager" src/ --include="*.rs" | grep -v "mod.rs" | grep -v "#\[allow"
grep -r "modules::security\|store_api_key\b\|retrieve_api_key" src/ --include="*.rs" | grep -v "mod.rs" | grep -v "security/mod.rs"
grep -r "DataSyncService\|sync_service" src/ --include="*.rs" | grep -v "mod.rs" | grep -v "sync_service.rs"
grep -r "OptimizedDataClient\|optimized_client" src/ --include="*.rs" | grep -v "mod.rs" | grep -v "optimized_client.rs"
grep -r "crate::domain" src/ --include="*.rs" | grep -v "domain/"
```

Expected: No results for any (confirming they are dead code).

- [ ] **Step 2: Remove dead module files**

```bash
cd src-tauri
rm -f src/modules/worker_pool/mod.rs && rmdir src/modules/worker_pool
rm -f src/modules/cache/mod.rs && rmdir src/modules/cache
rm -f src/modules/security/mod.rs && rmdir src/modules/security
rm -f src/modules/data_provider/sync_service.rs
rm -f src/modules/data_provider/optimized_client.rs
rm -rf src/domain/
```

- [ ] **Step 3: Update modules/mod.rs — remove dead module declarations and all #[allow(dead_code)] blankets**

Replace `src-tauri/src/modules/mod.rs` with:

```rust
pub mod store;
pub mod data_provider;
pub mod rate_limiter;
pub mod plan_compiler;
pub mod scoring;
pub mod portfolio;
pub mod backtest;
pub mod journal;
pub mod quant_analysis;

// Infrastructure modules
pub mod error;
pub mod circuit_breaker;
pub mod retry;
pub mod health;
pub mod progress;
```

- [ ] **Step 4: Update data_provider/mod.rs — remove sync_service and optimized_client**

Remove the `pub mod sync_service;` and `pub mod optimized_client;` lines from `src-tauri/src/modules/data_provider/mod.rs`.

- [ ] **Step 5: Remove `mod domain;` from lib.rs**

In `src-tauri/src/lib.rs`, find and remove the line `mod domain;` (or `pub mod domain;`).

- [ ] **Step 6: Verify build**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Expected: Compiles successfully (warnings OK, no errors).

- [ ] **Step 7: Run tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A src-tauri/src/modules/ src-tauri/src/lib.rs src-tauri/src/domain/
git commit -m "refactor: remove dead modules (worker_pool, cache, security, sync_service, optimized_client, domain layer)"
```

---

### Task 4: Remove unused deps and migrate lazy_static to once_cell

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: All files using `lazy_static!` macro

- [ ] **Step 1: Find all lazy_static usages**

Run: `cd src-tauri && grep -rn "lazy_static" src/ --include="*.rs"`

Expected files (verified):
- `src/lib.rs` (line 38)
- `src/core/config/mod.rs` (line 138)
- `src/modules/health.rs` (line 339)
- `src/modules/progress.rs` (line 190)

- [ ] **Step 2: In each file, replace `lazy_static! { ... }` with `once_cell::sync::Lazy`**

Pattern change:
```rust
// Before:
use lazy_static::lazy_static;
lazy_static! {
    static ref FOO: Type = expression;
}

// After:
use once_cell::sync::Lazy;
static FOO: Lazy<Type> = Lazy::new(|| expression);
```

In `lib.rs`:
```rust
use once_cell::sync::Lazy;

pub(crate) static DB_POOL: Lazy<Arc<Mutex<Option<sqlx::Pool<sqlx::Sqlite>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

pub(crate) static SAVED_PLANS: Lazy<Arc<Mutex<HashMap<String, VibePlanScript>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

pub(crate) static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("Failed to create shared HTTP client")
});
```

Apply the same pattern to all other files:

In `src/core/config/mod.rs` (line 138), `src/modules/health.rs` (line 339), and `src/modules/progress.rs` (line 190): replace `lazy_static::lazy_static! { static ref FOO: T = expr; }` with `static FOO: Lazy<T> = Lazy::new(|| expr);` and add `use once_cell::sync::Lazy;`.

Also remove any `use lazy_static::lazy_static;` imports from all files.

- [ ] **Step 3: Remove lazy_static from Cargo.toml and remove tauri-plugin-updater**

In `src-tauri/Cargo.toml`, remove:
```toml
lazy_static = "1.4"
tauri-plugin-updater = "2"
```

- [ ] **Step 4: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -5`
Expected: Compiles and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/
git commit -m "refactor: migrate lazy_static to once_cell::sync::Lazy, remove unused deps"
```

---

### Task 5: Consolidate HTTP clients to shared HTTP_CLIENT

**Files:**
- Modify: `src-tauri/src/services/openrouter_service.rs`
- Modify: `src-tauri/src/services/alpaca_service.rs`
- Modify: `src-tauri/src/services/fundamental_service.rs`
- Modify: `src-tauri/src/modules/data_provider/multi_source_provider.rs`
- Modify: `src-tauri/src/modules/data_provider/free_sources.rs`

- [ ] **Step 1: In each service, remove the private client field and use crate::HTTP_CLIENT**

For each of the 5 files:

1. Remove the `client: reqwest::Client` (or `client: Client`) field from the struct definition
2. Remove the `Client::builder()...build().expect(...)` from the constructor (replace with nothing — don't construct a client)
3. Replace all `self.client` references with `crate::HTTP_CLIENT.clone()` or `(*crate::HTTP_CLIENT)` depending on context. For most `reqwest` calls, `crate::HTTP_CLIENT.get(url)` works directly since `Lazy<Client>` derefs to `Client`.

Example transformation for `openrouter_service.rs`:
```rust
// Before:
pub struct OpenRouterService {
    client: reqwest::Client,
    base_url: String,
}
impl OpenRouterService {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(...)
            .build()
            .expect("...");
        Self { client, base_url: "...".to_string() }
    }
    async fn call_api(&self, ...) {
        let response = self.client.post(&url)...
    }
}

// After:
pub struct OpenRouterService {
    base_url: String,
}
impl OpenRouterService {
    pub fn new() -> Self {
        Self { base_url: "...".to_string() }
    }
    async fn call_api(&self, ...) {
        let response = crate::HTTP_CLIENT.post(&url)...
    }
}
```

- [ ] **Step 2: Check if infrastructure/http/mod.rs is now dead**

If `src-tauri/src/infrastructure/http/mod.rs` only provides HTTP client construction that is no longer used, remove it and its `mod` declaration.

- [ ] **Step 3: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -5`
Expected: Compiles and all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "perf: consolidate 7 HTTP clients into shared HTTP_CLIENT"
```

---

### Task 6: Fix partial_cmp().unwrap() NaN panics in production code

**Files:**
- Modify: `src-tauri/src/modules/scoring/mod.rs:175`

- [ ] **Step 1: Fix the unwrap**

At line 175, change:
```rust
sorted_factors.sort_by(|a, b| b.contribution.partial_cmp(&a.contribution).unwrap());
```
To:
```rust
sorted_factors.sort_by(|a, b| b.contribution.partial_cmp(&a.contribution).unwrap_or(std::cmp::Ordering::Equal));
```

- [ ] **Step 2: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/modules/scoring/mod.rs
git commit -m "fix: handle NaN in partial_cmp sort to prevent panics"
```

---

### Task 7: Parallelize sequential network calls in get_detailed_ticker_analysis

**Files:**
- Modify: `src-tauri/src/api/commands/market.rs:286-290`

- [ ] **Step 1: Replace sequential awaits with tokio::join!**

Change lines 287-290:
```rust
    let quant_result = ENHANCED_MARKET_SERVICE.get_quant_metrics(&symbol).await;
    let price_result = ENHANCED_MARKET_SERVICE.get_current_price(&symbol).await;

    let fundamentals_result = FUNDAMENTAL_SERVICE.get_fundamentals(&symbol).await;
```

To:
```rust
    let (quant_result, price_result, fundamentals_result) = tokio::join!(
        ENHANCED_MARKET_SERVICE.get_quant_metrics(&symbol),
        ENHANCED_MARKET_SERVICE.get_current_price(&symbol),
        FUNDAMENTAL_SERVICE.get_fundamentals(&symbol),
    );
```

- [ ] **Step 2: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/api/commands/market.rs
git commit -m "perf: parallelize network calls in get_detailed_ticker_analysis"
```

---

### Task 8: Fix _days parameter silently ignored + remove dead code in App/BacktestTab

**Files:**
- Modify: `src-tauri/src/api/commands/market.rs:172-176`
- Modify: `src/App.tsx`
- Modify: `src/BacktestTab.tsx`

- [ ] **Step 1: Fix _days parameter in Rust**

In `api/commands/market.rs`, change:
```rust
    let _days = days.unwrap_or(365);

    match ENHANCED_MARKET_SERVICE.get_historical_prices(&symbol).await {
        Ok(prices) => {
            let result: Vec<serde_json::Value> = prices.into_iter()
```

To:
```rust
    let days = days.unwrap_or(365);

    match ENHANCED_MARKET_SERVICE.get_historical_prices(&symbol).await {
        Ok(prices) => {
            // Truncate to requested number of days
            let truncated: Vec<_> = if prices.len() > days {
                prices[prices.len() - days..].to_vec()
            } else {
                prices
            };
            let result: Vec<serde_json::Value> = truncated.into_iter()
```

- [ ] **Step 2: Remove loadCacheStats from App.tsx**

Remove the `loadCacheStats` function (lines ~154-157) and any calls to it in useEffect.

- [ ] **Step 3: Remove dead BacktestTab state variables**

In `src/BacktestTab.tsx`, remove:
```typescript
const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");
const [riskFreeRate, setRiskFreeRate] = useState(4.0);
const [transactionCost, setTransactionCost] = useState(0.0);
```

Also remove the corresponding JSX inputs in the advanced settings panel that reference `benchmarkSymbol`, `riskFreeRate`, and `transactionCost`. Keep the `showAdvanced` toggle and any other advanced settings that are actually used.

- [ ] **Step 4: Verify both Rust and TS compile**

Run:
```bash
cd src-tauri && cargo check
cd .. && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/api/commands/market.rs src/App.tsx src/BacktestTab.tsx
git commit -m "fix: respect days param in historical prices, remove dead code in App/BacktestTab"
```

---

## Phase 2: Frontend Deduplication & Quality

### Task 9: Deduplicate formatCurrency — use shared import everywhere

**Files:**
- Modify: `src/BacktestTab.tsx`
- Modify: `src/components/TaxLotView.tsx`
- Modify: `src/components/DividendTracker.tsx`
- Modify: `src/components/PortfolioOptimizer.tsx`
- Modify: `src/components/TickerAnalysis.tsx`
- Modify: `src/components/TransactionHistory.tsx`
- Modify: `src/components/PortfolioPerformanceChart.tsx`

- [ ] **Step 1: In each of the 7 files, delete the local formatCurrency definition and add an import**

The canonical `formatCurrency(value, currency?, locale?)` from `src/shared/utils/index.ts` accepts `(number, string='USD', string='en-US')` and uses `minimumFractionDigits: 2, maximumFractionDigits: 2`.

In each file:
1. Add `import { formatCurrency } from '../shared/utils';  // adjust relative path per file location` at the top
2. Delete the local `function formatCurrency(...)` or `const formatCurrency = (...)` definition

For files where the local version uses `maximumFractionDigits: 0` (like `BacktestTab.tsx`), replace those specific calls with inline `Intl.NumberFormat` or create a `formatCurrencyCompact` in shared/utils that uses 0 decimal places. Do NOT redefine `formatCurrency` locally.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/BacktestTab.tsx src/components/TaxLotView.tsx src/components/DividendTracker.tsx src/components/PortfolioOptimizer.tsx src/components/TickerAnalysis.tsx src/components/TransactionHistory.tsx src/components/PortfolioPerformanceChart.tsx src/shared/utils/index.ts
git commit -m "refactor: deduplicate formatCurrency — single import from shared/utils"
```

---

### Task 10: Deduplicate Holding and Universe interfaces

**Files:**
- Modify: `src/shared/types/index.ts` (canonical Holding)
- Modify: `src/PortfolioTab.tsx`
- Modify: `src/components/ExposureChart.tsx`
- Modify: `src/components/RiskDashboard.tsx`
- Modify: `src/components/ScenarioAnalysis.tsx`
- Modify: `src/features/universe/UniverseTab.tsx`
- Modify: `src/components/WatchlistTab.tsx`

- [ ] **Step 1: Check all Holding variants and create a superset**

Read the 5 `Holding` definitions. The canonical (`shared/types`) uses camelCase. If `PortfolioTab.tsx` uses different field names from the backend, create a `PortfolioHolding` that matches the backend shape and keep it in `PortfolioTab.tsx` or `shared/types`.

For the components that just need `{ symbol, shares, currentPrice, value, weight? }`, the canonical `Holding` should work.

Update `src/shared/types/index.ts` Holding to include optional fields used by some components:
```typescript
export interface Holding {
  symbol: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  value: number;
  gain: number;
  gainPercent: number;
  weight?: number;
  targetPct?: number;
}
```

- [ ] **Step 2: Replace local Holding definitions with import**

In `ExposureChart.tsx`, `RiskDashboard.tsx`, `ScenarioAnalysis.tsx`: remove local `interface Holding` and add `import { Holding } from '../shared/types';  // adjust relative path per file location`.

For `PortfolioTab.tsx`, if it uses snake_case fields from the Rust backend, keep its own `PortfolioHolding` interface or rename the canonical fields. The important thing is to not have 5 separate definitions.

- [ ] **Step 3: Deduplicate Universe interface**

In `src/features/universe/UniverseTab.tsx` and `src/components/WatchlistTab.tsx`, remove local `interface Universe` and add:
```typescript
import { Universe } from '../hooks/useAppState';  // adjust relative path per file location
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/index.ts src/PortfolioTab.tsx src/components/ExposureChart.tsx src/components/RiskDashboard.tsx src/components/ScenarioAnalysis.tsx src/features/universe/UniverseTab.tsx src/components/WatchlistTab.tsx
git commit -m "refactor: deduplicate Holding and Universe interfaces"
```

---

### Task 11: Extract useIsMounted hook

**Files:**
- Create: `src/hooks/useIsMounted.ts`
- Modify: `src/App.tsx`, `src/PortfolioTab.tsx`, `src/BacktestTab.tsx`, `src/JournalTab.tsx`, `src/components/VibeStudio.tsx`, `src/components/SavedPortfoliosTab.tsx`, `src/components/PortfolioOptimizer.tsx`, `src/components/WatchlistTab.tsx`, `src/components/TickerAnalysis.tsx`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useIsMounted.ts`:

```typescript
import { useRef, useEffect } from 'react';

/**
 * Returns a ref that tracks whether the component is currently mounted.
 * Use to guard async state updates after unmount.
 */
export function useIsMounted() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
```

- [ ] **Step 2: In each of the 9 files, replace the inline pattern with the hook**

In each file, replace:
```typescript
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []);
```

With:
```typescript
import { useIsMounted } from '../hooks/useIsMounted';  // adjust relative path per file location

// Inside the component:
const isMountedRef = useIsMounted();
```

Also remove the now-unused `useRef` import if no other refs are used in that file. All existing `isMountedRef.current` checks remain unchanged.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useIsMounted.ts src/App.tsx src/PortfolioTab.tsx src/BacktestTab.tsx src/JournalTab.tsx src/components/VibeStudio.tsx src/components/SavedPortfoliosTab.tsx src/components/PortfolioOptimizer.tsx src/components/WatchlistTab.tsx src/components/TickerAnalysis.tsx
git commit -m "refactor: extract useIsMounted hook, replace 9 duplicated patterns"
```

---

### Task 12: Replace inline file download with saveFile utility in VibeStudio

**Files:**
- Modify: `src/components/VibeStudio.tsx`

- [ ] **Step 1: Import saveFile and replace both inline download patterns**

Add import:
```typescript
import { saveFile } from '../shared/utils/fileSystem';  // adjust relative path per file location
```

Replace the JSON export block (~lines 610-619):
```typescript
// Before:
const blob = new Blob([dataStr], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = fileName;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

// After:
await saveFile(dataStr, fileName, 'application/json');
```

Replace the CSV export block (~lines 772-780) similarly:
```typescript
await saveFile(csvContent, fileName, 'text/csv');
```

Make the containing functions `async` if not already.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/VibeStudio.tsx
git commit -m "refactor: use saveFile utility instead of inline download pattern"
```

---

### Task 13: Migrate PortfolioTab from 26 useState to useReducer

**Files:**
- Modify: `src/PortfolioTab.tsx`

- [ ] **Step 1: Read the full component to understand all state variables**

Read `src/PortfolioTab.tsx` fully to catalog all 26 `useState` calls and their usage patterns.

- [ ] **Step 2: Define state interface and reducer**

Add before the component:

```typescript
interface PortfolioLocalState {
  showPerformance: boolean;
  showTransactions: boolean;
  showDividends: boolean;
  showTaxLots: boolean;
  showRebalanceHistory: boolean;
  showImport: boolean;
  importPreview: unknown | null;
  importBroker: string;
  importSkipped: unknown[];
  importErrors: string[];
  newSymbol: string;
  newShares: string;
  newCostBasis: string;
  newTargetPct: string;
  cashAmount: string;
  rebalanceThreshold: number;
  maxPosition: number;
  cashBuffer: number;
  selectedView: string;
  isLoading: boolean;
  error: string | null;
}

type PortfolioAction =
  | { type: 'TOGGLE_PANEL'; panel: string }
  | { type: 'SET_FIELD'; field: string; value: unknown }
  | { type: 'RESET_NEW_HOLDING' }
  | { type: 'SET_IMPORT'; preview: unknown | null; skipped: unknown[]; errors: string[] };

function portfolioReducer(state: PortfolioLocalState, action: PortfolioAction): PortfolioLocalState {
  switch (action.type) {
    case 'TOGGLE_PANEL':
      return { ...state, [action.panel]: !state[action.panel as keyof PortfolioLocalState] };
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET_NEW_HOLDING':
      return { ...state, newSymbol: '', newShares: '', newCostBasis: '', newTargetPct: '' };
    case 'SET_IMPORT':
      return { ...state, importPreview: action.preview, importSkipped: action.skipped, importErrors: action.errors };
    default:
      return state;
  }
}
```

Note: The actual types for `importPreview`, `importSkipped`, etc. should match whatever types are used in the component. Read the file to determine the exact types.

- [ ] **Step 3: Replace useState calls with useReducer**

Replace all `const [foo, setFoo] = useState(...)` with the reducer, and update all setter calls to use `dispatch()`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/PortfolioTab.tsx
git commit -m "refactor: migrate PortfolioTab from 26 useState to useReducer"
```

---

### Task 14: Add React.memo to large frequently-rendered components

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/AlertsPanel.tsx`
- Modify: `src/components/ScenarioAnalysis.tsx`
- Modify: `src/components/RiskDashboard.tsx`
- Modify: `src/components/WatchlistTab.tsx`
- Modify: `src/components/ComparisonMode.tsx`
- Modify: `src/components/RebalanceScheduler.tsx`

- [ ] **Step 1: Wrap each component's default export with React.memo**

For each file, wrap the export. If the file looks like:
```typescript
export default function Dashboard(props: Props) { ... }
```

Change to:
```typescript
import { memo } from 'react';

function Dashboard(props: Props) { ... }

export default memo(Dashboard);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx src/components/AlertsPanel.tsx src/components/ScenarioAnalysis.tsx src/components/RiskDashboard.tsx src/components/WatchlistTab.tsx src/components/ComparisonMode.tsx src/components/RebalanceScheduler.tsx
git commit -m "perf: wrap 7 large components with React.memo"
```

---

## Phase 3: Rust Backend Quality

### Task 15: Remove blanket #[allow(dead_code)] and clean up surfaced dead code

**Files:**
- Modify: `src-tauri/src/modules/mod.rs` (verify clean after Task 3)
- Modify: `src-tauri/src/services/enhanced_market_service.rs` (remove dead fields/methods)
- Modify: `src-tauri/src/services/db_cache.rs` (remove unused structs/methods)
- Modify: `src-tauri/src/core/logging/mod.rs` (remove unused as_str)

- [ ] **Step 1: Build and catalog actual dead code warnings**

Run: `cd src-tauri && cargo check 2>&1 | grep "warning:"`

- [ ] **Step 2: For each dead code warning, remove the dead item**

Expected items to remove:
- `EnhancedMarketDataService::new()` if not called anywhere
- `retry_executor` field in `EnhancedMarketDataService` if never read
- `get_full_market_data()` method and `FullMarketData` struct
- `FundamentalService::has_alpha_vantage()` if unused
- `LogLevel::as_str()` if unused
- `CachedFundamentals`, `CachedSentiment`, `CachedAnalystRating` structs and their getter/setter methods in `db_cache.rs` if unused
- `fundamentals_ttl_hours` field in `DatabaseCacheService` if unused

For each: grep to confirm it's unused, then remove it.

- [ ] **Step 3: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -10`
Expected: Significantly fewer warnings. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "refactor: remove dead code surfaced by removing #[allow(dead_code)] blankets"
```

---

### Task 16: Deduplicate ETF arrays and move shared types out of lib.rs

**Files:**
- Modify: `src-tauri/src/api/commands/market.rs:528-565`
- Create: `src-tauri/src/shared_types.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Extract shared bond ETF list as a constant**

In `api/commands/market.rs`, above the two functions, add:

```rust
const BOND_ETFS: &[&str] = &[
    "BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "VCIT", "VCSH",
    "BNDX", "VGIT", "VGLT", "SCHO", "SCHZ", "IGSB", "IGLB", "EMB", "BWX",
    "TIP", "STIP", "SCHP", "VTIP", "MUB", "SUB", "CMF", "PZA", "HYMB",
    "GOVT", "SPTL", "SPTS", "SPAB", "SPLB", "SPIB", "BIV", "BSV", "BLV",
];
```

In `is_bond_etf_symbol`, use `BOND_ETFS` instead of the inline array.

In `is_etf_symbol`, keep the full `etf_patterns` array (which includes both bond and equity ETFs) but note the bond subset is now in `BOND_ETFS` for the `is_bond_etf_symbol` function.

- [ ] **Step 2: Move shared types from lib.rs to shared_types.rs**

Create `src-tauri/src/shared_types.rs` with `PriceAlert`, `RebalanceSchedule`, `Universe`, `ExportBundle` (moved from `lib.rs` lines 82-133).

In `lib.rs`, replace the type definitions block with:
```rust
mod shared_types;
pub use shared_types::*;
```

- [ ] **Step 3: Verify build + tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/shared_types.rs src-tauri/src/lib.rs src-tauri/src/api/commands/market.rs
git commit -m "refactor: deduplicate ETF arrays, move shared types out of lib.rs"
```

---

## Phase 4: Build & Config Optimization

### Task 17: Configure Vite manual chunks for code splitting

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Replace manualChunks: undefined with proper chunk splitting**

In `vite.config.ts`, replace:
```typescript
rollupOptions: {
  output: {
    manualChunks: undefined,
  },
},
```

With:
```typescript
rollupOptions: {
  output: {
    manualChunks: {
      'vendor-react': ['react', 'react-dom'],
      'vendor-charts': ['recharts'],
      'vendor-icons': ['lucide-react'],
      'vendor-pdf': ['jspdf', 'html2canvas'],
    },
  },
},
```

- [ ] **Step 2: Build and check chunk sizes**

Run: `npm run build 2>&1 | tail -20`
Expected: Multiple chunks instead of one 1.5MB bundle.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "perf: enable Vite code splitting — split vendor chunks from 1.5MB monolith"
```

---

### Task 18: Update README version and fix broken doc links

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read README.md**

Read the full file to find version references and broken links.

- [ ] **Step 2: Update version**

Change `Current Version: 0.1.0 MLP` (or similar) to `Current Version: 0.3.2`.

- [ ] **Step 3: Remove or fix broken doc links**

Remove links to files excluded by `.gitignore`:
- `MOBILE_SETUP.md`, `BUILD_REPRODUCIBILITY.md`, `EPIC_H_COMPLETION.md`, `ARCHITECTURE.md`, `SECURITY.md`, `QA_AUDIT_REPORT.md`, `AUDIT_FIXES_CHECKLIST.md`, `PROJECT_STATUS.md`, `SECURITY_CHECKLIST.md`

Either remove the references entirely or replace them with inline descriptions.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README version to 0.3.2, remove broken doc links"
```

---

### Task 19: Remove unused devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove ts-node and bare playwright**

```bash
npm uninstall ts-node playwright
```

- [ ] **Step 2: Verify playwright still works without bare package**

Run: `npx playwright test --list 2>&1 | head -5`
Expected: Lists test files without errors. If it fails, re-add `playwright` and only remove `ts-node`.

- [ ] **Step 3: Verify install and build**

Run: `npm install && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused devDeps (ts-node, bare playwright)"
```

---

## Verification

After all tasks are complete:

- [ ] **Final Step 1: Full Rust build + test**
```bash
cd src-tauri && cargo check && cargo test
```

- [ ] **Final Step 2: Full frontend build + test**
```bash
npm run lint && npx vitest run && npm run build
```

- [ ] **Final Step 3: Verify bundle size improved**
```bash
ls -lh dist/assets/*.js
```
Expected: Multiple JS chunks, largest under 500KB.

- [ ] **Final Step 4: Git log review**
```bash
git log --oneline -25
```
Expected: ~19 clean commits, each with a focused message.
