# FlowFolio 0.4.2 — Native Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlowFolio feel like a native mobile app — proper bottom nav with a "More" icon grid drawer, pointer-event swipe navigation, pinch-to-zoom charts with touch tooltips, and polished touch sliders.

**Architecture:** New `MobileNav` component replaces the CSS-only sidebar override on mobile. `useSwipeNav` hook attaches pointer listeners to the main content area. `TouchableChart` wraps `ResponsiveContainer` with `react-zoom-pan-pinch` on mobile and a touch-to-tooltip forwarder. All wiring goes through existing `dispatch(actions.setActiveTab(...))` — no new state needed.

**Tech Stack:** React 19, TypeScript, Lucide React (already installed), `react-zoom-pan-pinch` (new), Vitest + @testing-library/react (already installed)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/components/MobileNav.tsx` | **Create** | Bottom bar (5 tabs + More) + icon grid drawer |
| `src/components/MobileNav.css` | **Create** | All MobileNav styles |
| `src/components/TouchableChart.tsx` | **Create** | `ResponsiveContainer` wrapper: pinch-to-zoom + touch tooltip forwarder |
| `src/hooks/useSwipeNav.ts` | **Create** | Pointer-event swipe detector → calls `onNavigate` |
| `src/__tests__/hooks/useSwipeNav.test.ts` | **Create** | Tests for swipe logic |
| `src/__tests__/components/TouchableChart.test.tsx` | **Create** | Tests for TouchableChart |
| `src/App.tsx` | **Modify** | Import MobileNav + useSwipeNav, add `isMobileView`, conditional render |
| `src/styles/mobile.css` | **Modify** | Remove sidebar→bottom-bar overrides (lines 8–46) |
| `src/components/VibeStudio.css` | **Modify** | Extend existing mobile range slider CSS: border, shadow, scale, track, touch-action |
| `src/components/ScenarioAnalysis.tsx` | **Modify** | Add `style={{ touchAction: 'pan-y' }}` to slider wrapper divs |
| `src/components/Dashboard.tsx` | **Modify** | `<ResponsiveContainer>` → `<TouchableChart>` (3 instances) |
| `src/components/RiskDashboard.tsx` | **Modify** | Same (3 instances) |
| `src/components/ComparisonMode.tsx` | **Modify** | Same (3 instances) |
| `src/components/PortfolioPerformanceChart.tsx` | **Modify** | Same (3 instances) |
| `src/components/charts/QuantDashboard.tsx` | **Modify** | Same (21 instances) |
| `src/components/ScenarioAnalysis.tsx` | **Modify** | Same (3 instances) + touch-action |

---

## Tab → Icon Reference

All icons are from `lucide-react` (already installed).

**Primary bar (5 tabs):**
| Tab key | Label | Lucide icon |
|---|---|---|
| `dashboard` | Home | `LayoutDashboard` |
| `vibe-studio` | Vibe | `Sparkles` |
| `portfolio` | Portfolio | `PieChart` |
| `backtest` | Backtest | `FlaskConical` |
| `settings` | Settings | `Settings` |
| *(drawer toggle)* | More | `Grid2X2` |

**More drawer (14 tabs, in sidebar order):**
| Tab key | Short label | Lucide icon |
|---|---|---|
| `saved-portfolios` | Saved | `Save` |
| `templates` | Templates | `FileText` |
| `rankings` | Rankings | `TrendingUp` |
| `journal` | Journal | `BookOpen` |
| `watchlist` | Watchlist | `Eye` |
| `analysis` | Analysis | `TrendingUp` |
| `alerts` | Alerts | `Bell` |
| `comparison` | Compare | `GitCompare` |
| `risk` | Risk | `Shield` |
| `scheduler` | Scheduler | `Clock` |
| `news` | News | `Newspaper` |
| `yearly-review` | Review | `ClipboardCheck` |
| `universe` | Universe | `Globe` |
| `data` | Data | `Database` |

**All 19 tabs in swipe order:**
```
dashboard, vibe-studio, saved-portfolios, templates, rankings,
portfolio, backtest, journal, watchlist, analysis, alerts,
comparison, risk, scheduler, news, yearly-review, universe,
data, settings
```

---

### Task 1: Install `react-zoom-pan-pinch`

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd /path/to/flowfolio
npm install react-zoom-pan-pinch
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify installation**

```bash
grep "react-zoom-pan-pinch" package.json
```

Expected: `"react-zoom-pan-pinch": "^3.x.x"` present.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add react-zoom-pan-pinch for mobile chart pinch-to-zoom"
```

---

### Task 2: `useSwipeNav` hook (TDD)

**Files:**
- Create: `src/hooks/useSwipeNav.ts`
- Create: `src/__tests__/hooks/useSwipeNav.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/hooks/useSwipeNav.test.ts`:

```typescript
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useSwipeNav } from '../../hooks/useSwipeNav';

// Helper: fire a pointer swipe on an element
function fireSwipe(
  el: HTMLElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration = 200,
) {
  const downEvent = new PointerEvent('pointerdown', {
    clientX: startX,
    clientY: startY,
    bubbles: true,
  });
  Object.defineProperty(downEvent, 'timeStamp', { value: 0 });

  const upEvent = new PointerEvent('pointerup', {
    clientX: endX,
    clientY: endY,
    bubbles: true,
  });
  Object.defineProperty(upEvent, 'timeStamp', { value: duration });

  el.dispatchEvent(downEvent);
  el.dispatchEvent(upEvent);
}

describe('useSwipeNav', () => {
  it('calls onNavigate with the next tab on swipe left', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 200, 100, 100, 100); // swipe left: deltaX = -100
    expect(onNavigate).toHaveBeenCalledWith('vibe-studio');

    document.body.removeChild(div);
  });

  it('calls onNavigate with the previous tab on swipe right', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'vibe-studio', onNavigate, true));

    fireSwipe(div, 100, 100, 200, 100); // swipe right: deltaX = +100
    expect(onNavigate).toHaveBeenCalledWith('dashboard');

    document.body.removeChild(div);
  });

  it('does NOT navigate when swipe is more vertical than horizontal', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 130, 200); // deltaX=30, deltaY=100 → mostly vertical
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does NOT navigate when swipe distance is below threshold (60px)', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 145, 102); // deltaX=45 < 60px threshold
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does NOT navigate when enabled is false', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, false));

    fireSwipe(div, 200, 100, 100, 100);
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('clamps at the first tab — swipe right on dashboard does nothing', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 200, 100); // swipe right — already at first tab
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('clamps at the last tab — swipe left on settings does nothing', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'settings', onNavigate, true));

    fireSwipe(div, 200, 100, 100, 100); // swipe left — already at last tab
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/hooks/useSwipeNav.test.ts
```

Expected: all 7 tests fail with `Cannot find module '../../hooks/useSwipeNav'`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useSwipeNav.ts`:

```typescript
import { RefObject, useEffect } from 'react';

const TAB_ORDER = [
  'dashboard', 'vibe-studio', 'saved-portfolios', 'templates', 'rankings',
  'portfolio', 'backtest', 'journal', 'watchlist', 'analysis', 'alerts',
  'comparison', 'risk', 'scheduler', 'news', 'yearly-review', 'universe',
  'data', 'settings',
] as const;

const MIN_SWIPE_PX = 60;
const DIRECTION_RATIO = 1.5; // |deltaX| must be > |deltaY| * 1.5
const MAX_DURATION_MS = 500;

export function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  activeTab: string,
  onNavigate: (tab: string) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;

    const el = ref.current;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const onDown = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      startTime = e.timeStamp;
    };

    const onUp = (e: PointerEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const elapsed = e.timeStamp - startTime;

      if (
        Math.abs(deltaX) < MIN_SWIPE_PX ||
        Math.abs(deltaX) <= Math.abs(deltaY) * DIRECTION_RATIO ||
        elapsed > MAX_DURATION_MS
      ) {
        return;
      }

      const currentIndex = TAB_ORDER.indexOf(activeTab as typeof TAB_ORDER[number]);
      if (currentIndex === -1) return;

      if (deltaX < 0) {
        // Swipe left → next tab
        if (currentIndex < TAB_ORDER.length - 1) {
          onNavigate(TAB_ORDER[currentIndex + 1]);
        }
      } else {
        // Swipe right → previous tab
        if (currentIndex > 0) {
          onNavigate(TAB_ORDER[currentIndex - 1]);
        }
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [ref, activeTab, onNavigate, enabled]);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/hooks/useSwipeNav.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSwipeNav.ts src/__tests__/hooks/useSwipeNav.test.ts
git commit -m "feat(mobile): add useSwipeNav hook — pointer-event swipe detection for tab navigation"
```

---

### Task 3: `TouchableChart` component (TDD)

**Files:**
- Create: `src/components/TouchableChart.tsx`
- Create: `src/__tests__/components/TouchableChart.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/TouchableChart.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useMediaQuery to control desktop vs mobile mode
vi.mock('../../shared/hooks/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/hooks/index')>();
  return { ...actual, useMediaQuery: vi.fn(() => false) }; // default: desktop
});

// Mock react-zoom-pan-pinch
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="transform-wrapper">{children}</div>
  ),
  TransformComponent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}));

// Mock recharts ResponsiveContainer (jsdom has no layout)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height }: { children: React.ReactNode; height: number }) => (
    <div data-testid="responsive-container" data-height={height}>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
}));

import { TouchableChart } from '../../components/TouchableChart';
import { useMediaQuery } from '../../shared/hooks/index';

describe('TouchableChart', () => {
  it('renders ResponsiveContainer with correct height on desktop', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(
      <TouchableChart height={300}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    const container = screen.getByTestId('responsive-container');
    expect(container).toBeInTheDocument();
    expect(container.getAttribute('data-height')).toBe('300');
    expect(screen.queryByTestId('transform-wrapper')).not.toBeInTheDocument();
  });

  it('renders TransformWrapper on mobile', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(
      <TouchableChart height={200}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    expect(screen.getByTestId('transform-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('transform-component')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders children in both modes', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(
      <TouchableChart height={300}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    expect(screen.getByTestId('chart-child')).toBeInTheDocument();
  });

  it('accepts optional className', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    const { container } = render(
      <TouchableChart height={300} className="my-chart">
        <div />
      </TouchableChart>
    );
    expect(container.firstChild).toHaveClass('my-chart');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/__tests__/components/TouchableChart.test.tsx
```

Expected: fail with `Cannot find module '../../components/TouchableChart'`.

- [ ] **Step 3: Implement `TouchableChart`**

Create `src/components/TouchableChart.tsx`:

```tsx
import React, { useRef } from 'react';
import { ResponsiveContainer } from 'recharts';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useMediaQuery } from '../shared/hooks/index';

interface TouchableChartProps {
  height: number;
  className?: string;
  children: React.ReactNode;
}

function forwardTouchAsMouseMove(e: React.TouchEvent<HTMLDivElement>) {
  const touch = e.touches[0];
  if (!touch) return;
  const syntheticEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY,
    bubbles: true,
  });
  e.currentTarget.dispatchEvent(syntheticEvent);
}

export function TouchableChart({ height, className, children }: TouchableChartProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!isMobile) {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={className}>
      <TransformWrapper
        panning={{ disabled: false }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        limitToBounds={false}
      >
        <TransformComponent>
          <div onTouchMove={forwardTouchAsMouseMove}>
            <ResponsiveContainer width="100%" height={height}>
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/__tests__/components/TouchableChart.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TouchableChart.tsx src/__tests__/components/TouchableChart.test.tsx
git commit -m "feat(mobile): add TouchableChart — pinch-to-zoom + touch tooltip forwarding for Recharts"
```

---

### Task 4: `MobileNav` component + CSS

**Files:**
- Create: `src/components/MobileNav.tsx`
- Create: `src/components/MobileNav.css`

- [ ] **Step 1: Create `MobileNav.css`**

Create `src/components/MobileNav.css`:

```css
/* ─── Bottom bar ─── */
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--sidebar-bg, #141824);
  border-top: 1px solid var(--border-color, #2d3748);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 100;
  padding: 0 4px;
  padding-bottom: env(safe-area-inset-bottom, 0); /* iPhone notch */
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 44px;
  min-height: 44px;
  padding: 4px 6px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-muted, #64748b);
  font-size: 9px;
  font-family: inherit;
  border-radius: 8px;
  transition: color 0.15s;
  flex: 1;
  -webkit-tap-highlight-color: transparent;
}

.mobile-nav-item.active,
.mobile-nav-item.drawer-open {
  color: var(--primary, #6366f1);
}

.mobile-nav-item:active {
  background: rgba(99, 102, 241, 0.08);
}

.mobile-nav-label {
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

/* ─── Drawer backdrop ─── */
.mobile-nav-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 98;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ─── Drawer panel ─── */
.mobile-nav-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 64px; /* sits above the bottom bar */
  background: var(--sidebar-bg, #141824);
  border-top: 1px solid var(--border-color, #2d3748);
  border-radius: 14px 14px 0 0;
  z-index: 99;
  padding: 10px 12px 16px;
  transform: translateY(100%);
  transition: transform 0.2s ease-out;
}

.mobile-nav-drawer.open {
  transform: translateY(0);
}

.mobile-nav-drawer-handle {
  width: 32px;
  height: 3px;
  background: var(--border-color, #2d3748);
  border-radius: 2px;
  margin: 0 auto 12px;
}

.mobile-nav-drawer-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #64748b);
  margin-bottom: 10px;
  padding: 0 2px;
}

/* ─── Icon grid ─── */
.mobile-nav-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.mobile-nav-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 64px;
  padding: 8px 4px;
  border: none;
  background: var(--card-bg, #1a1f2e);
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-muted, #64748b);
  font-size: 9px;
  font-family: inherit;
  font-weight: 500;
  text-align: center;
  transition: background 0.12s, color 0.12s;
  -webkit-tap-highlight-color: transparent;
}

.mobile-nav-grid-item:active,
.mobile-nav-grid-item:hover {
  background: rgba(99, 102, 241, 0.12);
  color: var(--primary, #6366f1);
}

.mobile-nav-grid-label {
  font-size: 9px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 56px;
}
```

- [ ] **Step 2: Create `MobileNav.tsx`**

Create `src/components/MobileNav.tsx`:

```tsx
import { useState } from 'react';
import {
  LayoutDashboard, Sparkles, PieChart, FlaskConical, Settings, Grid2X2,
  Save, FileText, TrendingUp, BookOpen, Eye, Bell, GitCompare,
  Shield, Clock, Newspaper, ClipboardCheck, Globe, Database,
} from 'lucide-react';
import './MobileNav.css';

interface MobileNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

const PRIMARY_TABS = [
  { key: 'dashboard',   label: 'Home',     Icon: LayoutDashboard },
  { key: 'vibe-studio', label: 'Vibe',     Icon: Sparkles },
  { key: 'portfolio',   label: 'Portfolio', Icon: PieChart },
  { key: 'backtest',    label: 'Backtest',  Icon: FlaskConical },
  { key: 'settings',    label: 'Settings',  Icon: Settings },
] as const;

const DRAWER_TABS = [
  { key: 'saved-portfolios', label: 'Saved',     Icon: Save },
  { key: 'templates',        label: 'Templates', Icon: FileText },
  { key: 'rankings',         label: 'Rankings',  Icon: TrendingUp },
  { key: 'journal',          label: 'Journal',   Icon: BookOpen },
  { key: 'watchlist',        label: 'Watchlist', Icon: Eye },
  { key: 'analysis',         label: 'Analysis',  Icon: TrendingUp },
  { key: 'alerts',           label: 'Alerts',    Icon: Bell },
  { key: 'comparison',       label: 'Compare',   Icon: GitCompare },
  { key: 'risk',             label: 'Risk',      Icon: Shield },
  { key: 'scheduler',        label: 'Scheduler', Icon: Clock },
  { key: 'news',             label: 'News',      Icon: Newspaper },
  { key: 'yearly-review',    label: 'Review',    Icon: ClipboardCheck },
  { key: 'universe',         label: 'Universe',  Icon: Globe },
  { key: 'data',             label: 'Data',      Icon: Database },
] as const;

export function MobileNav({ activeTab, onNavigate }: MobileNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handlePrimaryNav = (key: string) => {
    onNavigate(key);
    setDrawerOpen(false);
  };

  const handleDrawerNav = (key: string) => {
    onNavigate(key);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* More drawer */}
      <div
        className={`mobile-nav-drawer ${drawerOpen ? 'open' : ''}`}
        role="dialog"
        aria-label="More navigation options"
        aria-hidden={!drawerOpen}
      >
        <div className="mobile-nav-drawer-handle" />
        <div className="mobile-nav-drawer-title">More</div>
        <div className="mobile-nav-grid">
          {DRAWER_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className="mobile-nav-grid-item"
              onClick={() => handleDrawerNav(key)}
              aria-label={label}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <Icon size={24} aria-hidden="true" />
              <span className="mobile-nav-grid-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <nav className="mobile-nav" aria-label="Primary navigation">
        {PRIMARY_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`mobile-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => handlePrimaryNav(key)}
            aria-label={label}
            aria-current={activeTab === key ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="mobile-nav-label">{label}</span>
          </button>
        ))}

        <button
          className={`mobile-nav-item ${drawerOpen ? 'drawer-open' : ''}`}
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="More navigation options"
          aria-expanded={drawerOpen}
        >
          <Grid2X2 size={20} aria-hidden="true" />
          <span className="mobile-nav-label">More</span>
        </button>
      </nav>
    </>
  );
}
```

- [ ] **Step 3: Run lint to confirm no TypeScript errors**

```bash
npm run lint 2>&1 | grep -E "error TS|MobileNav" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileNav.tsx src/components/MobileNav.css
git commit -m "feat(mobile): add MobileNav component — bottom bar + More icon grid drawer"
```

---

### Task 5: Wire `MobileNav` into `App.tsx` + clean `mobile.css`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/mobile.css`

- [ ] **Step 1: Remove the sidebar→bottom-bar overrides from `mobile.css`**

Open `src/styles/mobile.css`. Delete the entire first `@media (max-width: 768px)` block — the one that has `.app-layout`, `.sidebar`, `.sidebar-item`, `.sidebar-item-label`, and `.main-content` rules. It spans from the comment `/* ─── Layout: sidebar becomes bottom nav ─── */` to the closing `}` of `.main-content`. Keep all blocks after it (cards, touch targets, typography, charts, tables).

After editing, verify:

```bash
grep -n "sidebar" src/styles/mobile.css
```

Expected: zero results.

- [ ] **Step 2: Add `isMobileView` and `useSwipeNav` to `App.tsx`**

At the top of `src/App.tsx`, add these two imports after the existing hook imports:

```tsx
import { useMediaQuery } from './shared/hooks/index';
import { useSwipeNav } from './hooks/useSwipeNav';
import { MobileNav } from './components/MobileNav';
```

Inside the `App` function, after the existing `const { isAdvanced, toggleMode } = useUserMode();` line, add:

```tsx
const isMobileView = useMediaQuery('(max-width: 768px)');
const mainContentRef = useRef<HTMLDivElement>(null);
useSwipeNav(
  mainContentRef,
  state.activeTab,
  (tab) => dispatch(actions.setActiveTab(tab)),
  isMobileView,
);
```

- [ ] **Step 3: Attach `mainContentRef` to the `<main>` element**

Find this line in `App.tsx`:

```tsx
<main id="main-content" className="main-content" role="main">
```

Change it to:

```tsx
<main id="main-content" className="main-content" role="main" ref={mainContentRef}>
```

- [ ] **Step 4: Conditionally render `MobileNav` vs `renderSidebar()`**

Find the line in the JSX that calls `{renderSidebar()}`. Replace it with:

```tsx
{isMobileView
  ? <MobileNav
      activeTab={state.activeTab}
      onNavigate={(tab) => dispatch(actions.setActiveTab(tab))}
    />
  : renderSidebar()
}
```

Also add bottom padding to `<main>` so content isn't hidden behind the mobile nav bar. Find the `<main>` element and add a style:

```tsx
<main
  id="main-content"
  className="main-content"
  role="main"
  ref={mainContentRef}
  style={isMobileView ? { paddingBottom: '72px' } : undefined}
>
```

- [ ] **Step 5: Run lint**

```bash
npm run lint 2>&1 | grep "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 6: Visual check in browser**

```bash
npm run dev:web
```

Open browser DevTools → device toolbar → iPhone SE (375×667). Confirm:
- MobileNav bottom bar visible with 6 items
- Tapping primary tabs navigates
- Tapping "More" opens the icon grid drawer
- Tapping a drawer item navigates and closes the drawer
- Desktop (no device emulation): sidebar renders as normal

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: all existing tests pass (739+), no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/styles/mobile.css
git commit -m "feat(mobile): wire MobileNav into App.tsx, add useSwipeNav, remove old sidebar CSS overrides"
```

---

### Task 6: Replace `ResponsiveContainer` with `TouchableChart` in chart files

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/RiskDashboard.tsx`
- Modify: `src/components/ComparisonMode.tsx`
- Modify: `src/components/PortfolioPerformanceChart.tsx`
- Modify: `src/components/charts/QuantDashboard.tsx`
- Modify: `src/components/ScenarioAnalysis.tsx`

The pattern is the same for every file:

1. Add import: `import { TouchableChart } from '../TouchableChart';` (adjust path for `charts/QuantDashboard.tsx` → `import { TouchableChart } from '../TouchableChart';`)
2. Remove `ResponsiveContainer` from the `recharts` import (or leave it if it's used elsewhere in the file — check first)
3. Replace every:
   ```tsx
   <ResponsiveContainer width="100%" height={N}>
     ...children...
   </ResponsiveContainer>
   ```
   With:
   ```tsx
   <TouchableChart height={N}>
     ...children...
   </TouchableChart>
   ```

Do each file one at a time. After each file, run lint to catch errors immediately.

- [ ] **Step 1: Update `Dashboard.tsx` (3 instances)**

```bash
grep -n "ResponsiveContainer" src/components/Dashboard.tsx
```

Note the line numbers. For each occurrence replace `<ResponsiveContainer width="100%" height={N}>` with `<TouchableChart height={N}>` and `</ResponsiveContainer>` with `</TouchableChart>`. Add the import at the top.

```bash
npm run lint 2>&1 | grep "Dashboard" | head -5
```

Expected: no errors.

- [ ] **Step 2: Update `RiskDashboard.tsx` (3 instances)**

Same pattern as Step 1. Import path: `import { TouchableChart } from './TouchableChart';`

```bash
npm run lint 2>&1 | grep "RiskDashboard" | head -5
```

- [ ] **Step 3: Update `ComparisonMode.tsx` (3 instances)**

Same pattern.

```bash
npm run lint 2>&1 | grep "ComparisonMode" | head -5
```

- [ ] **Step 4: Update `PortfolioPerformanceChart.tsx` (3 instances)**

Same pattern.

```bash
npm run lint 2>&1 | grep "PortfolioPerformance" | head -5
```

- [ ] **Step 5: Update `QuantDashboard.tsx` (21 instances)**

This file has many charts. Use your editor's find-and-replace or:

```bash
# Verify count before
grep -c "ResponsiveContainer" src/components/charts/QuantDashboard.tsx
```

Replace all `<ResponsiveContainer width="100%" height={` with `<TouchableChart height={` and `</ResponsiveContainer>` with `</TouchableChart>`. The `width="100%"` attribute is absorbed into `TouchableChart` — don't keep it.

Import path for this file: `import { TouchableChart } from '../TouchableChart';`

```bash
npm run lint 2>&1 | grep "QuantDashboard" | head -5
```

- [ ] **Step 6: Update `ScenarioAnalysis.tsx` (3 instances)**

Same pattern.

```bash
npm run lint 2>&1 | grep "ScenarioAnalysis" | head -5
```

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard.tsx src/components/RiskDashboard.tsx \
  src/components/ComparisonMode.tsx src/components/PortfolioPerformanceChart.tsx \
  src/components/charts/QuantDashboard.tsx src/components/ScenarioAnalysis.tsx
git commit -m "feat(mobile): replace ResponsiveContainer with TouchableChart in all chart files"
```

---

### Task 7: Slider polish — CSS + touch-action

**Files:**
- Modify: `src/components/VibeStudio.css`
- Modify: `src/components/ScenarioAnalysis.tsx`

- [ ] **Step 1: Extend mobile slider CSS in `VibeStudio.css`**

Find the existing `@media (max-width: 768px)` block in `VibeStudio.css` that contains `/* Mobile: larger range slider thumb and track for touch */`. It currently has basic height and thumb size. Replace the entire block with this extended version:

```css
/* Mobile: native-feel range slider */
@media (max-width: 768px) {
  input[type="range"] {
    height: 44px;
    -webkit-appearance: none;
    appearance: none;
    padding: 10px 0;
    touch-action: pan-y;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: var(--border-color, #2d3748);
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary, #6366f1);
    border: 2px solid var(--primary, #6366f1);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
    cursor: pointer;
    transition: transform 0.1s ease;
    margin-top: -11px; /* center on track: (28 - 6) / 2 = 11 */
  }

  input[type="range"]:active::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  input[type="range"]::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--border-color, #2d3748);
  }

  input[type="range"]::-moz-range-thumb {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary, #6366f1);
    border: 2px solid var(--primary, #6366f1);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
    cursor: pointer;
  }
}
```

- [ ] **Step 2: Add `touch-action: pan-y` to slider wrapper divs in `ScenarioAnalysis.tsx`**

```bash
grep -n "scenario-custom-slider-wrap\|type=\"range\"" src/components/ScenarioAnalysis.tsx | head -10
```

Find every `<div className="scenario-custom-slider-wrap">` (there are 2). Add `style={{ touchAction: 'pan-y' }}` to each:

```tsx
<div className="scenario-custom-slider-wrap" style={{ touchAction: 'pan-y' }}>
```

- [ ] **Step 3: Run lint**

```bash
npm run lint 2>&1 | grep "error TS" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/VibeStudio.css src/components/ScenarioAnalysis.tsx
git commit -m "feat(mobile): polish touch sliders — border, shadow, scale, track, touch-action pan-y"
```

---

### Task 8: Final verification + version bump

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Check all done criteria**

```bash
# No sidebar rules left in mobile.css
grep "sidebar" src/styles/mobile.css
# Expected: zero results

# No ResponsiveContainer in chart files
grep -rn "ResponsiveContainer" src/components/Dashboard.tsx src/components/RiskDashboard.tsx \
  src/components/ComparisonMode.tsx src/components/PortfolioPerformanceChart.tsx \
  src/components/charts/QuantDashboard.tsx src/components/ScenarioAnalysis.tsx
# Expected: zero results (only import lines removed)
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass, test count ≥ 747 (739 existing + 7 swipe + 4 TouchableChart).

- [ ] **Step 3: Run Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | grep "test result:"
```

Expected: `test result: ok. 624 passed; 0 failed`.

- [ ] **Step 4: Run lint**

```bash
npm run lint 2>&1 | grep "error TS" | head -10
```

Expected: zero errors.

- [ ] **Step 5: Bump version to 0.4.2 in all three version files**

In `package.json`:
```json
"version": "0.4.2",
```

In `src-tauri/Cargo.toml` (line 3):
```toml
version = "0.4.2"
```

In `src-tauri/tauri.conf.json` (line 4):
```json
"version": "0.4.2",
```

Then update `Cargo.lock`:
```bash
cd src-tauri && cargo check
```

- [ ] **Step 6: Commit and tag**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore(release): bump version to 0.4.2"

git tag -a v0.4.2 -m "FlowFolio 0.4.2 — Native Feel

MobileNav: 5-tab bottom bar + More icon grid drawer
useSwipeNav: pointer-event swipe through all 19 tabs
TouchableChart: pinch-to-zoom + touch tooltips on all Recharts
Slider polish: border, shadow, active scale, touch-action pan-y"

git push origin main
git push origin v0.4.2
```
