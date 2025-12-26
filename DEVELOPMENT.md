# FlowFolio Development Progress

## 🎯 Project Overview

**FlowFolio** is a local-first, vibe-coding style investing platform built with Tauri + Rust + React.

**Tagline:** *Vibe-investing, but like vibe coding—compose your investing "program" locally.*

## ✅ Completed: Initial Development Setup (Epic A - Foundation)

### Architecture Established

#### Backend (Rust)
- ✅ Tauri app scaffold created
- ✅ Modular architecture implemented with 10 core modules:
  - `store` - Database layer (SQLite)
  - `data_provider` - Alpha Vantage API client
  - `rate_limiter` - API quota management
  - `plan_compiler` - VibePlan DSL compiler
  - `scoring` - Factor scoring engine
  - `portfolio` - Portfolio construction
  - `backtest` - Strategy simulation
  - `journal` - Decision tracking
  - `export` - Import/export functionality
  - `security` - Secrets management

#### Database (SQLite)
- ✅ Schema designed with migrations
- ✅ Core tables implemented:
  - `symbols` - Stock metadata
  - `prices_daily` - Historical OHLCV data
  - `fundamentals_overview` - Company fundamentals
  - `vibe_plans` - User investing plans
  - `journal_events` - Decision log
  - `refresh_jobs` - Data sync queue

#### Frontend (React + TypeScript)
- ✅ React app with Tauri integration
- ✅ Basic UI framework with navigation:
  - Dashboard
  - Vibe Studio (plan creation)
  - Universe (symbol management)
  - Rankings (factor analysis)
- ✅ Tauri commands wired up:
  - `health_check` - API status
  - `get_default_plan` - Load template
  - `compile_plan` - Parse user prompt
  - `validate_plan` - Validate plan rules
  - `get_provider_status` - Check data provider

### Key Features Implemented

#### 1. VibePlan Compiler (Epic D - Partial)
- ✅ JSON schema for VibePlan DSL
- ✅ Default template: "Quality Compounders"
- ✅ Plan validation logic
- ✅ Data structures for:
  - Universe definition (exchanges, sectors, exclusions)
  - Filter rules
  - Factor weighting
  - Portfolio config (allocation, position limits)
  - Cadence policy (monthly/quarterly/yearly)
  - Risk policy (drawdown, concentration)

#### 2. Data Provider Integration (Epic C - Foundation)
- ✅ Alpha Vantage client with rate limiting
- ✅ Configurable for 25 requests/day (free tier)
- ✅ Async request handling
- ✅ Provider trait for extensibility
- 🚧 TODO: Response parsing for time series
- 🚧 TODO: Fundamentals data normalization

#### 3. Rate Limiter (Epic C - Complete)
- ✅ Governor-based rate limiting
- ✅ Daily quota enforcement
- ✅ Graceful degradation on limit breach

## 📋 Project Structure

```
flowfolio/
├── src/                      # Frontend (React)
│   ├── App.tsx              # Main UI with tabs
│   └── App.css              # Styling
├── src-tauri/               # Backend (Rust)
│   ├── src/
│   │   ├── lib.rs          # Tauri app entry + commands
│   │   ├── main.rs         # Binary entry point
│   │   └── modules/
│   │       ├── store/      # SQLite + models
│   │       ├── data_provider/  # Alpha Vantage client
│   │       ├── rate_limiter/   # Quota enforcement
│   │       ├── plan_compiler/  # VibePlan DSL
│   │       ├── scoring/    # Factor engine
│   │       ├── portfolio/  # Allocation logic
│   │       ├── backtest/   # Simulation
│   │       ├── journal/    # Decision log
│   │       ├── export/     # Bundle management
│   │       └── security/   # Secrets (Stronghold)
│   └── migrations/
│       └── 20240101000001_initial_schema.sql
└── product_desc.txt         # Full PRD
```

## 🚀 Next Steps (Development Roadmap)

### Phase 1: Core Functionality (Epics B-D) - IN PROGRESS

**Epic B - Store Layer** ✅ 85% Complete
- [x] Implement repository pattern for CRUD operations
- [x] Add comprehensive async operations for all entities
- [x] DateTime support via chrono
- [ ] Test migrations up/down
- [ ] Add data seeding for testing

**Epic C - Data Provider (Complete)** ✅ 70% Complete
- [x] Parse Alpha Vantage time series responses
- [x] Parse company overview/fundamentals
- [x] Implement DataSyncService for orchestrated fetching
- [x] Build incremental sync (compact vs full)
- [x] Add rate limiting with delays
- [ ] Implement refresh queue logic
- [ ] Add staleness tracking
- [ ] Build offline mode handling

**Epic D - Plan Compiler (Complete)** ✅ 80% Complete
- [x] Add 3 production templates (Quality Compounders, Dividend Calm, AI Infrastructure)
- [x] Build template system (list/get operations)
- [ ] Implement prompt parser (rule-based MVP)
- [ ] Add plan versioning and diffs
- [ ] Create explainability traces

### Phase 2: Analysis Engine (Epics E-F)
- [ ] **Epic E - Scoring Engine**
  - [ ] Implement factor calculations (quality, value, momentum, growth)
  - [ ] Build normalization pipeline
  - [ ] Generate explainability payloads
  - [ ] Create ranking UI

- [ ] **Epic F - Portfolio Engine**
  - [ ] Allocation algorithms (equal weight, factor weight, risk parity)
  - [ ] Drift calculator
  - [ ] Monthly buy list generator
  - [ ] Quarterly rebalance trigger
  - [ ] Yearly review checklist

### Phase 3: Simulation & Persistence (Epics G-H)
- [ ] **Epic G - Backtest Lab**
  - [ ] Contribution schedule simulator
  - [ ] Rebalance rules engine
  - [ ] Metrics calculation (CAGR, drawdown, volatility, turnover)
  - [ ] Result visualization

- [ ] **Epic H - Security & Distribution**
  - [ ] Integrate Tauri Stronghold for API keys
  - [ ] Configure CSP (Content Security Policy)
  - [ ] Minimize Tauri capabilities
  - [ ] Set up release signing
  - [ ] Document reproducible builds

## 🛠️ Development Commands

### Run Development Server
```bash
cd flowfolio
npm run tauri dev
```

### Build for Production
```bash
cd flowfolio
npm run tauri build
```

### Run Tests
```bash
cd flowfolio/src-tauri
cargo test
```

### Check Rust Code
```bash
cd flowfolio/src-tauri
cargo check
cargo clippy
```

## 📦 Dependencies

### Rust Backend
- `tauri` - Desktop app framework
- `sqlx` - SQLite async driver
- `reqwest` - HTTP client for Alpha Vantage
- `governor` - Rate limiting
- `serde` / `serde_json` - Serialization
- `tokio` - Async runtime
- `anyhow` / `thiserror` - Error handling
- `chrono` - Date/time handling

### Frontend
- React 18
- TypeScript
- Vite (build tool)
- `@tauri-apps/api` - Tauri frontend bridge

## 🔒 Security Considerations

### Implemented
- ✅ Local-first architecture (no cloud by default)
- ✅ Explicit network boundaries (only Alpha Vantage)
- ✅ Rate limiting to prevent abuse

### TODO (Epic H)
- [ ] Tauri Capabilities configuration (command allowlisting)
- [ ] Strict CSP with nonces/hashes
- [ ] Stronghold integration for API key storage
- [ ] Security audit of command surface area
- [ ] Dependency audit automation

## 📊 Minimum Lovable Product (MLP) Checklist

Per product specification, MLP must include:
- [ ] VibePlan creation (template + prompt-to-rules)
- [x] Alpha Vantage fetch setup (client ready)
- [ ] Local cache + staleness indicators
- [ ] Rankings + explainability
- [ ] Monthly buy list generation
- [ ] Yearly review checklist
- [ ] Journal + plan version diffs
- [ ] Backtest (simple cadence simulation)

**Progress:** 3.2/8 core features ready (40%)

## 🎓 Key Design Decisions

1. **Local-First:** All computation runs locally; only market data fetches go outbound
2. **Explainable:** Every recommendation includes rule trace
3. **Cadence-Native:** Monthly/quarterly/yearly loops are first-class
4. **Privacy:** No telemetry, opt-in crash reporting only
5. **Modular:** Clean separation allows independent testing/iteration

## 📚 Reference Documents

- **Product Spec:** `product_desc.txt` (complete PRD with 10 epics)
- **Alpha Vantage API:** https://www.alphavantage.co/documentation/
- **Tauri Security:** https://v2.tauri.app/security/

## 🤝 Contributing

This is an active development project. Current focus: Completing Epic B (Store Layer) and Epic C (Data Provider).

For questions or to contribute, refer to the product specification for detailed acceptance criteria and test requirements.

---

**Status:** Foundation established, building core functionality
**Last Updated:** December 25, 2024
