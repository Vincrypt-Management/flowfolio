# Flowfolio

**Privacy-first investment planning and portfolio management for Desktop**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8D8?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-CE422B?logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Overview

Flowfolio is a **privacy-first desktop app** for building explainable investment strategies and managing your portfolio entirely offline:

- Create vibe-based strategies with factor-driven allocation
- Score and rank symbols against your active plan
- Generate monthly buy lists based on target allocations
- Run historical backtests with cadence-based rebalancing
- Maintain an investment journal for decisions and reflections
- Track news sentiment, dividends, tax impact, and options flow

**Privacy Promise:** All data stored locally in SQLite. No cloud. Zero telemetry.

**Platforms:** macOS, Windows, Linux

---

## Features

### Vibe Studio
- Pre-built strategy templates (Growth, Value, Dividend, Momentum, Balanced)
- Custom factor weighting: momentum, value, quality, growth, volatility
- AI-powered portfolio generation with real market data

### Stock Rankings
- Multi-factor scoring with contribution breakdown
- Score any list of symbols against your active plan
- Universe management for curated symbol sets

### Portfolio Management
- Holdings tracking with live P&L
- Target vs actual allocation with drift calculation
- Monthly buy list generation
- Saved portfolios with load/export

### Backtest Lab
- Historical simulation with configurable rebalance cadence
- Performance metrics: returns, Sharpe, Sortino, max drawdown
- Offline operation on cached data

### Analysis & Intelligence
- Deep-dive ticker analysis with quant metrics and fundamentals
- News & sentiment feed
- Dividend calendar
- Tax impact estimation
- Options flow overview
- Risk dashboard (VaR, beta, correlation)

### Investment Journal
- Log decisions, trades, strategy changes, and reflections
- Timeline view with type filtering
- Statistics view (advanced mode)

### Utilities
- Rebalance Scheduler with frequency options
- Price Alerts
- Watchlists
- Data Sources management with cache stats
- Settings (API keys, user mode, thresholds)

---

## Quick Start

### Prerequisites

- **Rust** 1.75+ — [Install](https://www.rust-lang.org/tools/install)
- **Node.js** 20.x LTS — [Install](https://nodejs.org/)

### Installation

```bash
git clone <repository-url>
cd flowfolio
npm install
```

### Run in development mode

```bash
npm run tauri dev
```

> **Port conflict?** If you see `Error: Port 1420 is already in use`, a previous
> dev or test server is still running. Kill it and retry:
> ```bash
> lsof -ti:1420 | xargs kill -9
> npm run tauri dev
> ```

### Web-only mode (no Rust backend, mocked data)

```bash
npm run dev:web
```

Serves the frontend at `http://localhost:1420`. Useful for rapid UI iteration without compiling Rust.

### Landing page

```bash
npm run dev:landing   # dev server at http://localhost:3100/flowfolio/landing.html
npm run build:landing # builds to dist-landing/
```

### Production build

```bash
npm run tauri build
# macOS:   src-tauri/target/release/bundle/macos/
# Windows: src-tauri/target/release/bundle/msi/
# Linux:   src-tauri/target/release/bundle/appimage/
```

---

## Environment Setup

Copy `.env.example` to `.env` and add API keys (at least 2–3 recommended):

```bash
# Tier 1 — free, high limits
ALPACA_API_KEY=...
ALPACA_API_SECRET=...

# Tier 2 — generous free limits
FINNHUB_API_KEY=...
FMP_API_KEY=...
TIINGO_API_KEY=...
TWELVE_DATA_API_KEY=...

# Tier 3 — use sparingly
POLYGON_API_KEY=...
ALPHA_VANTAGE_API_KEY=...

# AI features (portfolio agent, analysis reports)
OPENROUTER_API_KEY=...
```

Yahoo Finance is used as a no-key fallback automatically.

---

## Testing

### End-to-end tests (Playwright)

```bash
# Full suite — Chrome, Firefox, WebKit; app + landing
npx playwright test

# App only (Chrome)
npx playwright test --project=app

# Watch HTML report
npx playwright show-report
```

> The default Playwright run builds the app (`npm run build`) and starts a
> preview server on port 1420 plus the landing server on port 3100. Both ports
> must be free before running. If they are occupied:
> ```bash
> lsof -ti:1420,3100 | xargs kill -9
> ```
>
> To use the dev server instead of the preview build:
> ```bash
> USE_DEV=1 npx playwright test --project=app
> ```

### TypeScript / lint

```bash
npm run lint
```

### Rust tests

```bash
cd src-tauri && cargo test
```

### Security audit

```bash
./security_check.sh
```

---

## Architecture

```
flowfolio/
├── src/                     # React/TypeScript frontend
│   ├── components/          # Shared UI components
│   ├── features/            # Feature modules (rankings, backtest, universe…)
│   ├── services/            # API client, market data, portfolio agent
│   ├── hooks/               # Custom React hooks
│   ├── shared/              # Types, utilities
│   ├── landing/             # Landing page React app
│   └── App.tsx
│
├── src-tauri/               # Rust backend
│   └── src/
│       ├── api/             # Tauri command handlers
│       ├── domain/          # Business logic
│       ├── infrastructure/  # HTTP, cache, DB, resilience
│       ├── modules/         # Feature modules (backtest, scoring, portfolio…)
│       └── services/        # EnhancedMarketDataService
│
├── e2e/                     # Playwright tests
│   ├── app/                 # App tests (all tabs + interactions)
│   └── landing/             # Landing page tests
│
├── landing.html             # Landing page entry point
└── vite.landing.config.ts   # Landing page Vite config (port 3100)
```

### Data flow

```
Frontend (React)
    ↓  Tauri invoke
Rust API Commands
    ↓
EnhancedMarketDataService
    ↓
Cache (Memory → SQLite)
    ↓  cache miss
Multi-Source Provider (8 providers, health-based failover)
  1. Alpaca        (Tier 1 — free, unlimited basic)
  2. Finnhub       (Tier 2 — 60 req/min)
  3. FMP           (Tier 2 — 250 req/day)
  4. Tiingo        (Tier 2 — 500 req/hour)
  5. Twelve Data   (Tier 2 — 800 req/day)
  6. Polygon       (Tier 3 — 5 req/min)
  7. Alpha Vantage (Tier 3 — 5 req/min)
  8. Yahoo Finance (fallback, no key required)
    ↓
Cache update → Response
```

### Resilience patterns
- Circuit breaker — fails fast when providers are down
- Exponential backoff retry — 3 retries with jitter
- Rate limiting — respects per-provider API limits
- Request deduplication — prevents duplicate in-flight calls
- Health-based routing — always uses the healthiest provider first

---

## Security

- All data stored locally in SQLite (WAL mode)
- API keys stored in Tauri Stronghold (encrypted)
- Content Security Policy enforced
- Minimal capability model (no unnecessary Tauri permissions)
- No telemetry, no analytics, no external calls except market data APIs

Run `./security_check.sh` to verify the security baseline.

---

## Documentation

- [CODE_STANDARDS.md](CODE_STANDARDS.md) — TypeScript and React coding standards
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — Development status and roadmap
- [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) — Security requirements
- [QA_AUDIT_REPORT.md](QA_AUDIT_REPORT.md) — Code quality audit findings

---

## Contributing

1. Fork the repository
2. Create a feature branch off `main`
3. Follow the standards in [CODE_STANDARDS.md](CODE_STANDARDS.md)
4. Run `npm run lint` and `./security_check.sh` before submitting
5. Open a pull request

---

## License

MIT

---

**Made for privacy-conscious investors**
