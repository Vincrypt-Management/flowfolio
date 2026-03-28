# 0.4.3 "Fast Everywhere" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profile and fix the top performance bottlenecks — bundle size, unvirtualized lists, and SQLite full scans — so cold start on Android is ≤3s and the initial JS chunk is ≤500KB gzip.

**Architecture:** No new features. Three independent axes of improvement: (1) bundle splitting via lazy-loading the remaining heavy components, (2) virtual scrolling for long lists using `@tanstack/react-virtual`, (3) SQLite index additions via a new migration for queries that scan without an index. Each axis is independently verifiable.

**Tech Stack:** React 19, Vite 6, @tanstack/react-virtual, SQLite (sqlx), Tauri 2, Android Emulator (for startup measurement)

---

## File Map

| Action | File | Change |
|---|---|---|
| Modify | `package.json` | Add `@tanstack/react-virtual`, `rollup-plugin-visualizer` (devDep) |
| Modify | `vite.config.ts` | Add visualizer plugin (dev only) |
| Modify | `src/App.tsx` | Add `React.lazy` for any non-lazy heavy components; add `performance.mark` startup timing |
| Modify | `src/components/WatchlistTab.tsx` | Virtualize symbol rows per expanded universe |
| Modify | `src/PortfolioTab.tsx` | Virtualize holdings table rows |
| Create | `src-tauri/src/infrastructure/database/sql/002_performance_indexes.sql` | New indexes for unindexed queries |
| Modify | `src-tauri/src/infrastructure/database/mod.rs` | Run migration 002 on startup |

---

## Task 1: Install analysis tooling and capture baseline

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Install rollup-plugin-visualizer**

```bash
npm install --save-dev rollup-plugin-visualizer
```

- [ ] **Step 2: Add visualizer to vite.config.ts**

Open `vite.config.ts`. Add the import and plugin:

```typescript
// At the top, add:
import { visualizer } from 'rollup-plugin-visualizer';

// Inside defineConfig plugins array, add (after existing plugins):
visualizer({
  filename: 'dist/bundle-report.html',
  open: false,
  gzipSize: true,
  brotliSize: false,
}),
```

- [ ] **Step 3: Build and open the report**

```bash
npm run build
open dist/bundle-report.html
```

Expected: browser opens a treemap. Look for chunks larger than 100KB gzip. Note the size of the initial entry chunk (`index-*.js`). Write down the number — this is your baseline.

- [ ] **Step 4: Identify non-lazy heavy components in App.tsx**

Run:

```bash
grep -n "^import" src/App.tsx | grep -v "from 'react'" | grep -v "lazy("
```

Any component import that is NOT a `lazy(() => import(...))` call is eagerly loaded into the initial chunk. Note the list. Heavy components (QuantDashboard.tsx is 67KB, RiskDashboard, ComparisonMode, ScenarioAnalysis) must be lazy.

- [ ] **Step 5: Commit baseline**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "perf: add bundle visualizer for 0.4.3 profiling"
```

---

## Task 2: Lazy-load all remaining heavy components

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Convert eager imports to lazy**

In `src/App.tsx`, find any eager import of a heavy component (QuantDashboard, RiskDashboard, ComparisonMode, ScenarioAnalysis, ExposureChart, AlertsPanel, DividendTracker, RebalanceScheduler, NewsFeed, YearlyReview, ReportViewer, TaxLotView, TransactionHistory, StrategyShareCard) and convert them to lazy. The pattern for every one is identical:

If you see:
```typescript
import { QuantDashboard } from './components/QuantDashboard';
```

Replace with:
```typescript
const QuantDashboard = lazy(() =>
  import('./components/QuantDashboard').then(m => ({ default: m.QuantDashboard }))
);
```

If the component is a default export:
```typescript
const QuantDashboard = lazy(() => import('./components/QuantDashboard'));
```

Apply this pattern to every heavy component that is NOT already lazy. Do not change components that are already `lazy(...)`.

- [ ] **Step 2: Ensure every lazy component is inside a Suspense boundary**

Verify in `App.tsx` that the tab render section is wrapped with `<Suspense>`. Look for something like:

```tsx
<Suspense fallback={<TabLoading />}>
  {activeTab === 'quant' && <QuantDashboard ... />}
  ...
</Suspense>
```

If a lazy component is NOT inside a Suspense boundary, wrap it:

```tsx
<Suspense fallback={<div className="tab-loading">Loading…</div>}>
  <QuantDashboard {...props} />
</Suspense>
```

- [ ] **Step 3: Rebuild and measure**

```bash
npm run build
open dist/bundle-report.html
```

The initial entry chunk should shrink. Verify that previously-eager components are now in their own split chunks in the treemap. Record the new initial chunk size.

- [ ] **Step 4: Verify the app still works**

```bash
npm run dev:web
```

Open in browser. Navigate to every tab that was made lazy. Each should load without errors. If you see `"The above error occurred in the <Suspense> component"` check the component name — it likely has a named export that the lazy import didn't unwrap correctly. Fix with `.then(m => ({ default: m.ComponentName }))`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "perf: lazy-load all heavy tab components to reduce initial chunk"
```

---

## Task 3: Add startup timing instrumentation

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Mark app init start in main.tsx**

Open `src/main.tsx`. Add a performance mark at the very top (before any import side effects):

```typescript
performance.mark('app-init-start');
```

- [ ] **Step 2: Mark first paint in App.tsx**

In `src/App.tsx`, add a `useEffect` that fires once on mount:

```typescript
useEffect(() => {
  performance.mark('app-first-render');
  const measure = performance.measure('startup', 'app-init-start', 'app-first-render');
  console.info(`[perf] startup: ${measure.duration.toFixed(0)}ms`);
}, []);
```

Place this as the first `useEffect` in the App component body.

- [ ] **Step 3: Verify timing appears in dev console**

```bash
npm run dev:web
```

Open browser devtools console. You should see `[perf] startup: NNNms`. Note the number — this is your web baseline (actual Android will be slower).

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx src/App.tsx
git commit -m "perf: add startup timing instrumentation"
```

---

## Task 4: Install @tanstack/react-virtual

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the library**

```bash
npm install @tanstack/react-virtual
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@tanstack/react-virtual'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "perf: add @tanstack/react-virtual for list virtualization"
```

---

## Task 5: Virtualize WatchlistTab symbol rows

**Files:**
- Modify: `src/components/WatchlistTab.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/WatchlistTab.tsx`, add:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
```

- [ ] **Step 2: Extract the symbol list into its own component**

Find the section in `WatchlistTab.tsx` where `universe.symbols.map(symbol => ...)` renders symbol rows. Extract it into an inline component just above the main component or as a local function. This isolates the virtualizer logic cleanly.

Create this component just before the `WatchlistTab` function definition:

```typescript
interface SymbolListProps {
  symbols: string[];
  prices: Record<string, SymbolPriceData>;
  onRemove: (symbol: string) => void;
  onAnalyze: (symbol: string) => void;
}

function VirtualSymbolList({ symbols, prices, onRemove, onAnalyze }: SymbolListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: symbols.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="watchlist-symbol-list"
      style={{ height: Math.min(symbols.length * 44, 352), overflowY: 'auto' }}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const symbol = symbols[virtualItem.index];
          const priceData = prices[symbol];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="symbol-row"
            >
              <span className="symbol-name">{symbol}</span>
              <span className="symbol-price">
                {priceData?.loading ? '…' : priceData?.price ? `$${priceData.price.toFixed(2)}` : '—'}
              </span>
              <button onClick={() => onAnalyze(symbol)}>Analyze</button>
              <button onClick={() => onRemove(symbol)}>Remove</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

> **Note:** Match the class names (`symbol-row`, `symbol-name`, `symbol-price`) and button labels exactly to what already exists in the file. If the existing row markup has more fields (e.g., percentage change, alert button), copy them into the `VirtualSymbolList` row.

- [ ] **Step 3: Replace the existing symbol map with VirtualSymbolList**

Find the existing:
```tsx
<div className="watchlist-symbol-list">
  {universe.symbols.map(symbol => (
    <div key={symbol} className="symbol-row">
      ...
    </div>
  ))}
</div>
```

Replace with:
```tsx
<VirtualSymbolList
  symbols={universe.symbols}
  prices={prices}
  onRemove={(symbol) => handleRemoveSymbol(universe.id, symbol)}
  onAnalyze={(symbol) => handleAnalyzeSymbol(symbol)}
/>
```

Adjust the prop names to match the actual handler names in `WatchlistTab`.

- [ ] **Step 4: Verify it renders correctly**

```bash
npm run dev:web
```

Open the Watchlist tab, expand a universe. Symbols should render as before. Scroll a list with many symbols — DOM should show only ~10 rows instead of all of them (verify in browser devtools Elements panel).

- [ ] **Step 5: Commit**

```bash
git add src/components/WatchlistTab.tsx
git commit -m "perf: virtualize WatchlistTab symbol rows with @tanstack/react-virtual"
```

---

## Task 6: Virtualize PortfolioTab holdings table

**Files:**
- Modify: `src/PortfolioTab.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/PortfolioTab.tsx`, add:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
```

- [ ] **Step 2: Add a scroll ref to the holdings table container**

Find the `<tbody>` or the scroll container wrapping `portfolio.holdings.map(...)`. Add a ref to its parent container:

```typescript
const holdingsScrollRef = useRef<HTMLDivElement>(null);
```

Wrap the existing `<table>` in a div with the ref and fixed height if not already wrapped:

```tsx
<div
  ref={holdingsScrollRef}
  style={{ height: Math.min(portfolio.holdings.length * 48, 384), overflowY: 'auto' }}
  className="holdings-scroll-container"
>
  <table className="holdings-table">
    <thead>
      {/* keep existing thead exactly as-is */}
    </thead>
    <tbody>
      {/* will be replaced in next step */}
    </tbody>
  </table>
</div>
```

- [ ] **Step 3: Set up the virtualizer**

Add the virtualizer inside the component, after the `holdingsScrollRef` declaration:

```typescript
const holdingsVirtualizer = useVirtualizer({
  count: holdingsWithPct.length,
  getScrollElement: () => holdingsScrollRef.current,
  estimateSize: () => 48,
  overscan: 5,
});
```

- [ ] **Step 4: Replace the holdings map with virtual rows**

Replace:
```tsx
{portfolio.holdings.map((holding) => (
  <tr key={holding.symbol}>
    ...
  </tr>
))}
```

With:
```tsx
<tr style={{ height: holdingsVirtualizer.getTotalSize(), padding: 0 }}>
  <td colSpan={99} style={{ padding: 0 }}>
    <div style={{ position: 'relative', height: holdingsVirtualizer.getTotalSize() }}>
      {holdingsVirtualizer.getVirtualItems().map(virtualRow => {
        const holding = holdingsWithPct[virtualRow.index];
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={holdingsVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
              display: 'table',
              tableLayout: 'fixed',
            }}
          >
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  {/* Copy the exact existing <td> content for each holding row here */}
                  <td>{holding.symbol}</td>
                  <td>${holding.value.toLocaleString()}</td>
                  <td>{holding.weight.toFixed(1)}%</td>
                  {/* ... all other existing tds ... */}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  </td>
</tr>
```

> **Note:** Copy the exact `<td>` content from the original holdings row. Do not guess the column layout — read what was there and replicate it exactly inside the virtual row.

- [ ] **Step 5: Verify**

```bash
npm run dev:web
```

Open Portfolio tab, add several holdings. Table should render, scroll correctly, and show all holding data. Check devtools — tbody should contain only ~10 rendered rows regardless of total count.

- [ ] **Step 6: Commit**

```bash
git add src/PortfolioTab.tsx
git commit -m "perf: virtualize PortfolioTab holdings table rows"
```

---

## Task 7: SQLite EXPLAIN QUERY PLAN audit

**Files:**
- Read: `src-tauri/src/infrastructure/database/sql/001_initial.sql`
- Create: `src-tauri/src/infrastructure/database/sql/002_performance_indexes.sql`

- [ ] **Step 1: Start the app and locate the database file**

```bash
npm run dev:web
```

Let it initialize. Then find the database:

```bash
# macOS
ls ~/Library/Application\ Support/com.vincrypt.flowfolio/*.db 2>/dev/null || \
ls ~/Library/Application\ Support/flowfolio/*.db 2>/dev/null
```

Note the path. You'll use it for SQLite queries.

- [ ] **Step 2: Run EXPLAIN QUERY PLAN on the 5 most frequent queries**

```bash
DB=~/Library/Application\ Support/com.vincrypt.flowfolio/flowfolio_cache.db

sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM prices_daily WHERE symbol_id = 1 ORDER BY date DESC LIMIT 100;"
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM symbols WHERE status = 'active' ORDER BY ticker LIMIT 100;"
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM portfolio_snapshots WHERE portfolio_name = 'x' ORDER BY snapshot_date DESC LIMIT 100;"
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM journal_events WHERE plan_id = 1 ORDER BY timestamp DESC LIMIT 50;"
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM historical_prices_cache WHERE symbol = 'AAPL' AND date BETWEEN '2024-01-01' AND '2025-01-01';"
```

For each query, look at the output line that mentions the table. If it says `SCAN TABLE <name>` with no `USING INDEX` — it's a full scan, needs an index. If it says `SEARCH TABLE <name> USING INDEX ...` — it's fine.

- [ ] **Step 3: Create the performance indexes migration**

Create `src-tauri/src/infrastructure/database/sql/002_performance_indexes.sql`.

Add an index for every full scan found in Step 2. Common ones expected (add only what Step 2 confirmed as full scans):

```sql
-- Index for prices_daily symbol+date lookups and ordering
CREATE INDEX IF NOT EXISTS idx_prices_daily_symbol_id_date
    ON prices_daily (symbol_id, date DESC);

-- Index for portfolio snapshots by name + date
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_name_date
    ON portfolio_snapshots (portfolio_name, snapshot_date DESC);

-- Index for journal events by plan
CREATE INDEX IF NOT EXISTS idx_journal_events_plan_id
    ON journal_events (plan_id, timestamp DESC);

-- Index for symbols status (already has ticker PK but status filter may scan)
CREATE INDEX IF NOT EXISTS idx_symbols_status
    ON symbols (status);
```

Only include indexes for tables that actually had full scans in Step 2.

- [ ] **Step 4: Wire the migration in the database module**

Open `src-tauri/src/infrastructure/database/mod.rs`. Find where migrations are run (look for `sqlx::migrate!` or a manual SQL execution loop). Add `002_performance_indexes.sql` to the migration sequence after `001_initial.sql`.

If the migration runner uses `sqlx::migrate!("./sql")` it will pick up new `.sql` files automatically. If it manually lists files, add:

```rust
sqlx::query(include_str!("./sql/002_performance_indexes.sql"))
    .execute(&pool)
    .await?;
```

- [ ] **Step 5: Re-run EXPLAIN QUERY PLAN to verify**

```bash
# Delete the DB so migrations re-run fresh
rm "$DB"
# Run the app again to recreate with new schema
npm run dev:web &
sleep 5

# Re-run the same 5 queries from Step 2
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM prices_daily WHERE symbol_id = 1 ORDER BY date DESC LIMIT 100;"
# ... repeat for all 5 queries
```

Each query that had a full scan in Step 2 should now show `SEARCH TABLE ... USING INDEX ...`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/infrastructure/database/sql/002_performance_indexes.sql
git add src-tauri/src/infrastructure/database/mod.rs
git commit -m "perf: add SQLite indexes to eliminate full table scans on 5 hot queries"
```

---

## Task 8: Verify done criteria

- [ ] **Step 1: Check bundle initial chunk ≤500KB gzip**

```bash
npm run build 2>&1 | grep "index-"
```

Look for the line like:
```
dist/assets/index-CuZ1234.js   412.30 kB │ gzip: 138.20 kB
```

The **gzip** number must be ≤500. If it's over, open `dist/bundle-report.html`, find the largest contributors, and add them to the lazy-load list in Task 2.

- [ ] **Step 2: Confirm no full table scans**

Repeat the 5 EXPLAIN QUERY PLAN commands from Task 7. Every output must contain `USING INDEX`. If any still shows `SCAN TABLE`, go back to Task 7 Step 3 and add the missing index.

- [ ] **Step 3: Measure Android cold start**

```bash
# Start Android emulator (replace emulator name with yours)
emulator -avd Medium_Phone_API_36 &
sleep 30

# Build and install
npm run tauri android build -- --debug
adb install -r src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk

# Cold start timing: force-stop then launch, capture logcat
adb shell am force-stop com.vincrypt.flowfolio
adb logcat -c
adb shell am start -n com.vincrypt.flowfolio/.MainActivity
adb logcat -d | grep -E "perf.*startup|Displayed com.vincrypt"
```

The `Displayed com.vincrypt.flowfolio/.MainActivity` line in logcat shows the actual cold start time in ms. Target: ≤3000ms.

If startup exceeds 3s, look at the `[perf] startup: NNNms` log from Task 3 to determine how much is JS vs native. If JS startup is >2s, look for synchronous work in `useEffect` calls in `App.tsx` that can be deferred.

- [ ] **Step 4: Confirm npm run build passes**

```bash
npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 5: Confirm cargo test passes**

```bash
cd src-tauri && cargo test
```

Expected: exits 0.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(release): 0.4.3 Fast Everywhere — bundle, virtualization, SQLite indexes"
```

---

## Done Criteria Checklist

- [ ] Cold start on Android Emulator ≤3000ms (from `adb logcat` Displayed line)
- [ ] Initial JS chunk ≤500KB gzip (from `npm run build` output)
- [ ] All 5 EXPLAIN QUERY PLAN outputs show `USING INDEX` (no `SCAN TABLE`)
- [ ] `npm run build` exits 0
- [ ] `cargo test` exits 0
- [ ] WatchlistTab symbol list renders ≤10 DOM rows for a 100-symbol universe
- [ ] PortfolioTab holdings table renders ≤10 DOM rows for 50+ holdings
