# FlowFolio Design Standards

This document defines the UI/UX design standards, rules, and requirements for FlowFolio. Follow these guidelines to maintain visual consistency and a professional user experience across the application.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Standards](#component-standards)
6. [Interaction Patterns](#interaction-patterns)
7. [Responsive Design](#responsive-design)
8. [Accessibility](#accessibility)
9. [Animation Guidelines](#animation-guidelines)
10. [Landing Page Design](#landing-page-design)

---

## Design Philosophy

FlowFolio follows a **Token Terminal x Augment Code** hybrid design philosophy:

- **Dark-first**: Deep, technical dark mode optimized for extended use
- **Minimal**: Clean interfaces with purposeful visual hierarchy
- **Terminal-inspired**: Monospace fonts for data, high-contrast accents
- **Professional**: Financial application aesthetic with precision
- **Privacy-focused**: No external trackers, local-first data

---

## Color System

### CSS Custom Properties

All colors must be defined as CSS custom properties in `:root`. Never use hardcoded color values.

```css
:root {
  /* Backgrounds - Deep, Technical Dark Mode */
  --bg-app: #050505;      /* Almost Black - Main background */
  --bg-sidebar: #000000;  /* Pure Black - Sidebar */
  --bg-card: #0a0a0a;     /* Very Dark Gray - Cards */
  --bg-hover: #121212;    /* Subtle Hover state */
  --bg-active: #1a1a1a;   /* Active State */
  
  /* Primary Accent - Token Terminal Electric Green */
  --primary: #00e599;
  --primary-hover: #00c281;
  --primary-dim: rgba(0, 229, 153, 0.1);
  
  /* Secondary Accent - AI/Augment Purple */
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --accent-dim: rgba(99, 102, 241, 0.1);
  
  /* Text Hierarchy */
  --text-main: #ffffff;
  --text-muted: #a1a1aa;  /* Zinc 400 */
  --text-dim: #52525b;    /* Zinc 600 */
  
  /* Borders */
  --border: #27272a;      /* Zinc 800 */
  --border-light: #3f3f46;
  
  /* Functional Colors */
  --success: #00e599;     /* Same as primary */
  --error: #ef4444;       /* Red 500 */
  --warning: #f59e0b;     /* Amber 500 */
}
```

### Color Usage Rules

| Element | Color Variable | Usage |
|---------|----------------|-------|
| Main background | `--bg-app` | Page/app background |
| Cards/panels | `--bg-card` | Card components, modals |
| Hover states | `--bg-hover` | Interactive element hover |
| Primary actions | `--primary` | Primary buttons, key highlights |
| Secondary actions | `--accent` | AI features, secondary highlights |
| Positive values | `--success` | Gains, success states |
| Negative values | `--error` | Losses, error states |
| Warnings | `--warning` | Alerts, caution states |

### Semantic Color Classes

```css
/* Status badges */
.meta-badge.success { background: rgba(0, 229, 153, 0.15); color: #00e599; }
.meta-badge.warning { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.meta-badge.danger  { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.meta-badge.info    { background: rgba(99, 102, 241, 0.15); color: #6366f1; }

/* Metric values */
.metric-value.good    { color: #10b981; }
.metric-value.neutral { color: #f59e0b; }
.metric-value.bad     { color: #ef4444; }

/* Text states */
.positive { color: var(--success); }
.negative { color: var(--error); }
```

---

## Typography

### Font Stack

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

Load fonts from Google Fonts:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

### Font Usage Rules

| Use Case | Font | Example |
|----------|------|---------|
| Body text, UI labels | `--font-sans` | Navigation, descriptions |
| Data, numbers, code | `--font-mono` | Prices, percentages, symbols |
| Table headers | `--font-mono` | Column headers |
| Status badges | `--font-mono` | Labels with uppercase |

### Type Scale

| Element | Size | Weight | Letter Spacing |
|---------|------|--------|----------------|
| Page title | `2rem` | 600 | `-0.03em` |
| Section title | `1.5rem` | 600-700 | `-0.02em` |
| Card title | `1rem` | 600 | `-0.01em` |
| Body text | `0.9rem` | 400-500 | normal |
| Table header | `0.75-0.8rem` | 600 | `0.05em` |
| Caption/hint | `0.75rem` | 400 | normal |
| Badge text | `0.75rem` | 500-600 | `0.05em` |

### Typography Patterns

```css
/* Page title */
.page-title {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--text-main);
}

/* Section headers - uppercase terminal style */
.table-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Data values */
.stat-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

---

## Spacing & Layout

### Design Tokens

```css
:root {
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  
  /* Layout */
  --sidebar-width: 240px;
  --sidebar-width-collapsed: 64px;
  
  /* Transitions */
  --transition: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Spacing Scale

Use consistent spacing values:

| Token | Value | Usage |
|-------|-------|-------|
| `0.25rem` | 4px | Inline spacing, tight gaps |
| `0.5rem` | 8px | Small gaps, badge padding |
| `0.75rem` | 12px | Component padding |
| `1rem` | 16px | Standard gap |
| `1.5rem` | 24px | Card padding, section gaps |
| `2rem` | 32px | Large section spacing |
| `3rem` | 48px | Page-level spacing |

### Grid Layouts

```css
/* Dashboard grid - auto-fit responsive */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 1.5rem;
}

/* Metrics grid - fixed columns */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.5rem;
}

/* Config grid - responsive columns */
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}
```

---

## Component Standards

### Cards

Cards are the primary container component.

```css
.card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  border: 1px solid var(--border);
  transition: border-color var(--transition);
}

.card:hover {
  border-color: var(--border-light);
}

.card h3 {
  margin-top: 0;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.card h3 svg {
  color: var(--text-muted);
}
```

**Card Rules:**
- Always use `--bg-card` background
- Include 1px border with `--border`
- Use `--radius-lg` (8px) border radius
- Standard padding of `1.5rem`
- Headers should include icon + text pattern

### Buttons

#### Primary Button

```css
.btn-primary {
  background-color: var(--primary);
  color: #000000;  /* Black text for contrast */
  border: 1px solid transparent;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary:hover {
  background-color: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 0 12px var(--primary-dim);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### Secondary Button

```css
.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-main);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
}

.btn-secondary:hover {
  background: var(--bg-active);
  border-color: var(--primary);
}
```

#### Danger Button

```css
.btn-danger {
  background: var(--error);
  color: white;
  border: none;
}

.btn-danger:hover {
  background: #dc2626;
}
```

**Button Rules:**
- Primary buttons: Green background, black text
- Secondary buttons: Dark background, light border
- Always include disabled state styling
- Use flex with `gap` for icon + text
- Include hover lift effect (`translateY(-1px)`)

### Form Inputs

```css
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-main);
  font-family: var(--font-sans);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
}

/* Monospace input for data */
.symbol-input {
  font-family: var(--font-mono);
  font-size: 0.9rem;
}
```

**Input Rules:**
- Use `--bg-hover` background
- Focus state: green border, no outline
- Use monospace font for symbol/data inputs
- Labels should be `0.875rem`, `--text-muted`

### Tables

```css
/* Table container */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.data-table th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--bg-hover);
  font-family: var(--font-mono);
}

.data-table tbody tr:hover {
  background: var(--bg-hover);
}
```

**Table Rules:**
- Headers: uppercase, monospace, muted color
- Rows: bottom border only
- Hover state on rows
- Use tabular-nums for number columns

### Badges & Tags

```css
/* Status badge */
.meta-badge {
  padding: 0.25rem 0.75rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Symbol tag */
.symbol-tag {
  padding: 0.25rem 0.75rem;
  background: var(--accent-dim);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--accent);
  font-family: var(--font-mono);
}

/* Action badge */
.action-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.action-badge.buy {
  background: rgba(0, 229, 153, 0.15);
  color: var(--success);
}

.action-badge.sell {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error);
}
```

### Progress Indicators

```css
/* Progress bar */
.progress-bar-container {
  height: 8px;
  background: var(--bg-card);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--accent));
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Spinner */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## Interaction Patterns

### Hover Effects

```css
/* Card hover - border highlight */
.card:hover {
  border-color: var(--border-light);
}

/* Interactive card - lift + border */
.template-card:hover {
  border-color: var(--primary);
  background-color: var(--bg-hover);
}

/* Button lift */
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 12px var(--primary-dim);
}

/* Enhanced lift for important cards */
.template-card-enhanced:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}
```

### Focus States

```css
/* Input focus */
input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--primary);
}

/* Button focus (keyboard) */
button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

### Active States

```css
/* Nav item active */
.nav-item.active {
  background-color: var(--bg-active);
  color: var(--text-main);
  border-color: var(--border);
}

.nav-item.active .nav-icon {
  color: var(--primary);
}

/* Tab active */
.view-tabs button.active {
  color: var(--primary);
  background: var(--primary-dim);
}
```

### Loading States

```css
/* Loading spinner with text */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 2rem;
  color: var(--text-muted);
}

/* Skeleton loading (optional) */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-hover) 25%,
    var(--bg-active) 50%,
    var(--bg-hover) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Empty States

```css
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted);
}

.empty-state svg {
  color: var(--text-dim);
  margin-bottom: 1rem;
}

.empty-state h4 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  color: var(--text-main);
}

.empty-state p {
  max-width: 400px;
  margin: 0 auto;
}
```

---

## Responsive Design

### Breakpoints

```css
/* Mobile first approach */
@media (max-width: 480px) { /* Small mobile */ }
@media (max-width: 768px) { /* Tablet/large mobile */ }
@media (max-width: 900px) { /* Small desktop */ }
@media (max-width: 1200px) { /* Standard desktop */ }
@media (max-width: 1400px) { /* Large desktop */ }
```

### Layout Adaptations

```css
/* Sidebar collapse on mobile */
@media (max-width: 768px) {
  .sidebar {
    position: absolute;
    height: 100%;
    transform: translateX(-100%);
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .main-content {
    padding: 1.5rem;
  }
}

/* Grid columns reduction */
@media (max-width: 1200px) {
  .metrics-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-summary-grid {
    grid-template-columns: 1fr;
  }
}
```

### Responsive Component Patterns

```css
/* Stack buttons on mobile */
@media (max-width: 768px) {
  .header-actions {
    flex-direction: column;
    width: 100%;
  }
  
  .btn-generate {
    width: 100%;
  }
}

/* Table horizontal scroll */
.table-container {
  overflow-x: auto;
}

.data-table {
  min-width: 800px;  /* Force scroll on small screens */
}
```

---

## Accessibility

### Color Contrast

- Text on dark backgrounds: minimum 4.5:1 contrast ratio
- Large text (18px+): minimum 3:1 contrast ratio
- Interactive elements: clearly distinguishable states

### Focus Management

```css
/* Visible focus indicators */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Skip hidden focus outlines for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Screen Reader Support

- Use semantic HTML (`<nav>`, `<main>`, `<section>`, `<button>`)
- Include `aria-label` for icon-only buttons
- Use `role="status"` for live updates
- Include `aria-live="polite"` for loading states

### Motion Preferences

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Animation Guidelines

### Transition Timing

```css
:root {
  --transition: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Standard Animations

```css
/* Fade in with slide */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide down */
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide in */
@keyframes slideIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Spin */
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### Animation Usage

| Animation | Duration | Use Case |
|-----------|----------|----------|
| Fade in | 0.3-0.5s | Page/section entrance |
| Slide down | 0.3s | Dropdown/expand |
| Spin | 0.8s | Loading spinner |
| Pulse | 1.5s | Live/streaming indicator |

### Staggered Animations

```css
/* Stagger chart card animations */
.chart-card {
  animation: fadeIn 0.3s ease forwards;
}

.chart-card:nth-child(1) { animation-delay: 0.05s; }
.chart-card:nth-child(2) { animation-delay: 0.1s; }
.chart-card:nth-child(3) { animation-delay: 0.15s; }
```

---

## Landing Page Design

The landing page uses a distinct **Navy Blue + Liquid Glass** design system.

### Landing Color Palette

```css
:root {
  /* Navy Blue Color Scheme */
  --landing-bg-darkest: #020617;     /* slate-950 */
  --landing-bg-dark: #0f172a;        /* slate-900 */
  --landing-bg-mid: #1e293b;         /* slate-800 */
  
  /* Blue Accents */
  --landing-accent-primary: #3b82f6;  /* blue-500 */
  --landing-accent-light: #60a5fa;    /* blue-400 */
  
  /* Text */
  --landing-text-white: #f8fafc;      /* slate-50 */
  --landing-text-gray: #94a3b8;       /* slate-400 */
  
  /* Liquid Glass */
  --landing-glass-bg: rgba(15, 23, 42, 0.6);
  --landing-glass-border: rgba(148, 163, 184, 0.1);
}
```

### Liquid Glass Effect

```css
/* Liquid Glass Button */
.landing-glass-btn {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.05) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* Hover enhancement */
.landing-glass-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.15) 0%,
    rgba(255, 255, 255, 0.08) 100%
  );
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.4),
    0 0 30px rgba(59, 130, 246, 0.2);
}
```

### Landing Animations

```css
/* Shiny text animation */
.shiny-text {
  background: linear-gradient(
    135deg,
    var(--landing-text-white) 0%,
    var(--landing-text-white) 45%,
    var(--landing-accent-light) 50%,
    var(--landing-text-white) 55%,
    var(--landing-text-white) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shineText 4s ease-in-out infinite;
}

@keyframes shineText {
  0%, 100% { background-position: 200% center; }
  50% { background-position: 0% center; }
}

/* Badge shine effect */
.landing-badge::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.15),
    transparent
  );
  animation: badgeShine 3s ease-in-out infinite;
}
```

---

## Code Review Checklist

Before merging UI changes, verify:

- [ ] Uses CSS custom properties (no hardcoded colors)
- [ ] Follows font usage rules (sans vs mono)
- [ ] Includes hover, focus, and disabled states
- [ ] Responsive breakpoints handled
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Loading and empty states implemented
- [ ] Consistent spacing from the scale
- [ ] Accessible focus indicators present

---

## Quick Reference

### Common Patterns

```css
/* Card with header */
.card h3 { display: flex; align-items: center; gap: 0.75rem; }
.card h3 svg { color: var(--text-muted); }

/* Stat row */
.stat-row { display: flex; justify-content: space-between; }
.stat-label { color: var(--text-muted); }
.stat-value { font-family: var(--font-mono); }

/* Badge */
.badge { font-family: var(--font-mono); text-transform: uppercase; }

/* Grid auto-fit */
grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr));
```

### Icon Integration

- Use Lucide React icons (`lucide-react` package)
- Default icon size: 18-20px
- Icon color: `var(--text-muted)` for decorative
- Icon color: `var(--primary)` for active/highlight

---

*Last updated: January 20, 2026*
