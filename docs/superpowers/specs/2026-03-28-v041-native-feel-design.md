# FlowFolio 0.4.2 — "Native Feel" Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Author:** Brainstormed with Claude Code

---

## Overview

FlowFolio 0.4.1 shipped a responsive CSS layer that makes the desktop UI usable on mobile. This release (0.4.2) makes it feel like a mobile app — proper bottom navigation with a "More" drawer, swipe-to-navigate, pinch-to-zoom charts with touch tooltips, and polished VibeStudio sliders.

**No new features.** This release is pure mobile UX polish.

---

## Decisions

| Topic | Decision |
|---|---|
| Nav structure | 5 primary tabs in bottom bar + "More" icon grid drawer |
| Primary 5 tabs | Dashboard, Vibe Studio, Portfolio, Backtest, Settings |
| More drawer layout | 4-column Lucide icon grid, all 14 secondary tabs visible at once |
| Swipe gesture scope | All 19 tabs in sidebar order, clamped at ends (no wraparound) |
| Chart touch | Touch tooltips + pinch-to-zoom via `react-zoom-pan-pinch` |
| Icons | Lucide icons throughout — no emoji |

---

## Section 1 — Architecture & File Map

### New files

| File | Purpose |
|---|---|
| `src/components/MobileNav.tsx` | Bottom bar + More drawer, replaces sidebar on mobile |
| `src/components/MobileNav.css` | Styles scoped to MobileNav |
| `src/components/TouchableChart.tsx` | `ResponsiveContainer` wrapper with pinch-to-zoom + touch tooltips |
| `src/hooks/useSwipeNav.ts` | Pointer-event swipe detector, fires `setActiveTab` |
| ~~`src/hooks/useMediaQuery.ts`~~ | Already exists at `src/shared/hooks/index.ts` — use `useMediaQuery('(max-width: 768px)')` |

### Modified files

| File | Change |
|---|---|
| `src/App.tsx` | Add `isMobileView` via `useMediaQuery('(max-width: 768px)')` from `src/shared/hooks`; render `<MobileNav>` instead of `<nav className="sidebar">` on mobile; attach `useSwipeNav` to main content ref |
| `src/styles/mobile.css` | Remove sidebar→bottom-bar overrides (superseded by MobileNav); keep touch targets, typography scaling, table/chart scroll rules |
| `src/components/VibeStudio.tsx` | Add `touch-action: pan-y` wrapper divs; show value badge unconditionally on mobile |
| `src/components/VibeStudio.css` | Larger thumb (28px), thicker track (6px), `:active` scale, `touch-action: pan-y` |
| `BacktestTab.tsx`, `Dashboard.tsx`, `RiskDashboard.tsx`, `ComparisonMode.tsx`, `PortfolioPerformanceChart.tsx`, `WatchlistTab.tsx`, `QuantDashboard.tsx`, `ScenarioAnalysis.tsx` | Replace `<ResponsiveContainer>` with `<TouchableChart>` |

### New dependency

```
react-zoom-pan-pinch   ~13KB gzip, MIT licence
```

---

## Section 2 — MobileNav Component

### Bottom bar

- Fixed to bottom of viewport, 64px tall, `z-index: 100`
- 6 items evenly spaced: 5 primary tabs + "More" button
- Each item: Lucide icon (20px) stacked above label (9px), minimum 44×44pt tap target
- Active tab: `var(--primary)` (`#6366f1`). Inactive: `var(--text-muted)`
- "More" button highlights (`var(--primary)`) when drawer is open

**Primary tab → Lucide icon mapping:**

| Tab | Icon |
|---|---|
| Dashboard | `LayoutDashboard` |
| Vibe Studio | `Sparkles` |
| Portfolio | `Briefcase` |
| Backtest | `History` |
| Settings | `Settings` |
| More | `Grid2X2` |

### More drawer

- Slides up via `transform: translateY(100%)` → `translateY(0)`, 200ms ease-out
- Semi-transparent backdrop (`rgba(0,0,0,0.5)`) covers content; tap to close
- Drag handle: 32×3px pill, `var(--border-color)`, centered at top — visual only
- Title: "MORE" small-caps, `var(--text-muted)`
- 4-column Lucide icon grid, each cell: icon (24px) + short label (9px)
- Minimum 44×44pt per cell
- Tapping a cell: navigates to that tab, closes drawer

**Drawer tab order (14 tabs, matches sidebar order):**

Saved Portfolios · Templates · Rankings · Journal · Watchlist · Analysis · Alerts · Comparison · Risk · Scheduler · News · Yearly Review · Universe · Data Sources

---

## Section 3 — `useSwipeNav` Hook

```ts
// Signature
function useSwipeNav(
  ref: RefObject<HTMLElement>,
  activeTab: string,
  onNavigate: (tab: string) => void,
  enabled: boolean,
): void
```

**Detection thresholds:**
- Minimum horizontal distance: 60px
- Directionality ratio: `|deltaX| > |deltaY| * 1.5`
- Maximum elapsed time: 500ms

**Behaviour:**
- Swipe left → next tab in order array (clamped — no action on last tab)
- Swipe right → previous tab in order array (clamped — no action on first tab)
- `enabled` is `false` on desktop (`!isMobileView`) — hook attaches no listeners

**Tab order array** (all 19, mirrors desktop sidebar):
```
dashboard · vibe-studio · saved-portfolios · templates · rankings ·
portfolio · backtest · journal · watchlist · analysis · alerts ·
comparison · risk · scheduler · news · yearly-review · universe ·
data · settings
```

---

## Section 4 — `TouchableChart` Component

```tsx
// Usage
<TouchableChart height={300}>
  <LineChart data={data}>...</LineChart>
</TouchableChart>
```

**Props:** `height: number`, `className?: string`

**Desktop:** renders `<ResponsiveContainer width="100%" height={height}>` directly — no library overhead.

**Mobile (`useMediaQuery('(max-width: 768px)')`):**
- `<TransformWrapper>` config: `panning={{ disabled: false }}`, `pinch={{ step: 5 }}`, `doubleClick={{ disabled: true }}`, `limitToBounds={false}`
- Inside: `<TransformComponent>` → `<div onTouchMove={forwardTouchAsMouseMove}>` → `<ResponsiveContainer>`
- `forwardTouchAsMouseMove`: reads `touch.clientX/Y` from `TouchEvent`, synthesises and dispatches a `MouseEvent` on the same element — enables Recharts tooltip on touch drag

---

## Section 5 — VibeStudio Slider Polish

### `VibeStudio.css` additions (inside existing `@media (max-width: 768px)`)

```css
input[type="range"] {
  height: 44px;
  padding: 10px 0;
  touch-action: pan-y;
}
input[type="range"]::-webkit-slider-thumb {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--primary);
  box-shadow: 0 2px 8px rgba(99,102,241,0.4);
  transition: transform 0.1s;
}
input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.15);
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
}
/* Firefox */
input[type="range"]::-moz-range-thumb {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--primary);
}
input[type="range"]::-moz-range-track {
  height: 6px;
  border-radius: 3px;
}
```

### `VibeStudio.tsx` changes

- Each factor slider row div gets `style={{ touchAction: 'pan-y' }}`
- The numeric value badge (currently hover-only) renders unconditionally when `isMobileDevice` is true — displayed as a small pill next to the slider label

---

## Done Criteria

- `grep -r "sidebar" src/styles/mobile.css` → zero sidebar override rules (removed)
- Bottom bar visible on iPhone SE viewport (375px), all 5 tabs + More button fit without overflow
- Tapping "More" opens icon grid drawer; tapping a cell navigates and closes
- Horizontal swipe on main content area switches tabs; vertical scroll is not accidentally triggered
- Pinch gesture on any chart zooms in/out; single-finger drag shows tooltip
- VibeStudio sliders show value badge on mobile and respond to touch without fighting vertical scroll
- `npm test` exits 0, `cargo test` exits 0

---

## What Does NOT Ship in This Release

- Swipe-to-open the More drawer (gesture conflicts with content swipe)
- Animated tab transition (slide content left/right on swipe) — deferred to 0.4.3
- App Store / Play Store submission
- Physical device testing (simulator only for this release)
