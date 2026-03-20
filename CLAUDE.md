# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FlowFolio (Vibe Invest)** is a privacy-first desktop investment planning and portfolio management application built with Tauri 2, React 19, and Rust. It enables users to create vibe-based investment strategies, run quantitative analysis, backtest strategies, and manage portfolios entirely offline with no cloud dependencies.

**Key Principles:**
- All data stored locally in SQLite
- Zero telemetry or cloud dependencies
- API keys secured via Tauri Stronghold
- Multi-source data aggregation with intelligent failover
- Industrial-grade performance with extensive caching

## Development Commands

### Frontend Development
```bash
# Run full Tauri app in development mode
npm run tauri dev

# Run frontend only (web mode, no Rust backend)
npm run dev:web

# Run landing page development server
npm run dev:landing

# TypeScript type checking and linting
npm run lint

# Build frontend
npm run build

# Build landing page
npm run build:landing
```

### Backend Development (Rust)
```bash
# Run Rust tests
cd src-tauri && cargo test

# Run specific test
cd src-tauri && cargo test test_name

# Run tests with output
cd src-tauri && cargo test -- --nocapture

# Build production app
npm run tauri build

# Check Rust code
cd src-tauri && cargo check

# Format Rust code
cd src-tauri && cargo fmt
```

### Security & Quality
```bash
# Run security audit (validates CSP, permissions, etc.)
./security_check.sh

# Check TypeScript compilation
npm run lint
```

## Architecture

### High-Level Structure

```
flowfolio/
├── src/                    # React/TypeScript frontend
│   ├── components/         # UI components (VibeStudio, PortfolioOptimizer, etc.)
│   ├── services/           # Frontend services (API client, caching, market data)
│   ├── features/           # Feature modules (backtest, journal, portfolio, vibe-studio)
│   ├── core/               # Core utilities (API client, logger)
│   ├── hooks/              # React custom hooks
│   ├── shared/             # Shared types and utilities
│   └── App.tsx             # Main application component
│
├── src-tauri/              # Rust backend
│   └── src/
│       ├── core/           # Configuration, errors, logging
│       ├── infrastructure/ # HTTP client, cache, database, resilience
│       ├── domain/         # Business logic (market, portfolio, analysis)
│       ├── api/            # Tauri command handlers
│       ├── modules/        # Feature modules (backtest, scoring, portfolio, etc.)
│       └── services/       # Service layer (EnhancedMarketDataService)
```

### Rust Backend Layered Architecture

The Rust backend follows a clean architecture pattern:

1. **API Layer** (`api/commands/`): Tauri command handlers that expose functionality to frontend
2. **Service Layer** (`services/`): High-level business services (e.g., `EnhancedMarketDataService`)
3. **Domain Layer** (`domain/`): Core business logic and domain models
4. **Infrastructure Layer** (`infrastructure/`):
   - `http/`: HTTP client with connection pooling
   - `cache/`: Multi-tier caching (memory + SQLite)
   - `database/`: Database connection and migrations
   - `resilience/`: Circuit breakers, retries, rate limiting
5. **Modules** (`modules/`): Feature-specific modules (being migrated to domain layer)
   - `data_provider/`: Multi-source market data fetching
   - `scoring/`: Factor-based scoring engine
   - `backtest/`: Historical simulation engine
   - `portfolio/`: Portfolio management and optimization
   - `journal/`: Investment journal
   - `quant_analysis/`: Quantitative metrics calculation

### Frontend Architecture

**Component Structure:**
- **Main Tabs**: `App.tsx` contains the main tab interface
- **VibeStudio**: Strategy creation with factor weighting (`components/VibeStudio.tsx`)
- **Portfolio Tab**: Portfolio tracking and buy list generation (`PortfolioTab.tsx`)
- **Backtest Tab**: Historical simulation interface (`BacktestTab.tsx`)
- **Journal Tab**: Investment journal UI (`JournalTab.tsx`)

**Services:**
- `apiClient.ts`: Industrial-grade API client with circuit breaker, retries, and request deduplication
- `marketData.ts`: Market data fetching with caching
- `localCache.ts`: Frontend-side caching layer
- `portfolioAgent.ts`: AI-powered portfolio analysis agent
- `quantAnalysis.ts`: Quantitative metrics calculation

### Data Flow

```
Frontend (React)
    ↓ (Tauri invoke)
Backend (Rust API Commands)
    ↓
Service Layer (EnhancedMarketDataService)
    ↓
Cache Check (Memory → SQLite)
    ↓ (cache miss)
Multi-Source Provider (8 providers with health-based failover)
    ↓
1. Alpaca (Priority Tier 1 - Free unlimited)
2. Finnhub (Tier 2 - 60 calls/min)
3. FMP (Tier 2 - 250 calls/day)
4. Tiingo (Tier 2 - 500 calls/hour)
5. Twelve Data (Tier 2 - 800 calls/day)
6. Polygon (Tier 3 - 5 calls/min)
7. Alpha Vantage (Tier 3 - 5 calls/min)
8. Yahoo Finance (fallback, no key required)
    ↓
Cache Update → Response
```

### Key Technical Features

**Multi-Tier Caching:**
1. In-memory cache (Moka - 1-5 minute TTL)
2. SQLite database cache (persistent - 1-24 hour TTL)
3. Backend provider cache (connection pooling)

**Resilience Patterns:**
- Circuit breaker: Fails fast when providers are down
- Exponential backoff retry: 3 retries with increasing delays
- Rate limiting: Respects API limits (Governor crate)
- Health-based failover: Routes to healthiest providers
- Request deduplication: Prevents duplicate concurrent requests

**Performance Optimizations:**
- `moka`: High-performance concurrent cache
- `dashmap`: Lock-free concurrent HashMap
- `rayon`: Data parallelism for CPU-bound tasks
- `parking_lot`: Fast synchronization primitives

## Code Standards (from CODE_STANDARDS.md)

### TypeScript Best Practices

1. **No `any` types** - Use proper typing with interfaces and type guards
2. **Avoid `alert()`** - Use toast notifications instead
3. **Wrap `JSON.parse` in try-catch** - Always use safe parsing utilities
4. **Use the logger** - Import from `src/core/logger`, not `console.log`
5. **Use `invokeWithResilience`** - From `src/services/apiClient.ts` instead of direct Tauri invoke

### React Patterns

1. **Use `useReducer` for complex state** - When managing 4+ related states
2. **Memoize expensive computations** - `useMemo` for calculations, `useCallback` for event handlers
3. **Cleanup effects** - Always return cleanup functions for subscriptions and timers
4. **Validate API responses** - Don't assume response structure, use type guards

### Security Requirements

1. **Never expose API keys in frontend** - All keys go through Tauri backend
2. **Environment variables**:
   - `VITE_*` prefix: Safe for frontend (embedded in bundle)
   - No `VITE_` prefix: Backend-only secrets
3. **Validate user input** - Symbols, percentages, allocations
4. **Sanitize error logs** - Don't log sensitive data (tokens, keys)

## Important Tauri Commands

The backend exposes these key commands (invoke from frontend):

**Market Data:**
- `get_current_prices` - Fetch current prices for symbols
- `get_historical_prices` - Fetch historical price data
- `calculate_quant_metrics` - Calculate quantitative metrics
- `get_cache_stats` - Get caching statistics

**Vibe Studio:**
- `compile_plan` - Compile vibe plan script
- `save_vibe_plan` - Save vibe plan to database
- `list_vibe_plans` - List all saved plans
- `run_scoring` - Run factor scoring on symbols

**Portfolio:**
- `create_portfolio` - Create new portfolio
- `update_holdings` - Update portfolio holdings
- `generate_buy_list` - Generate buy list based on strategy
- `optimize_portfolio` - Run portfolio optimization
- `generate_yearly_review` - Generate portfolio review

**Backtest:**
- `run_backtest` - Run historical simulation
- `get_backtest_results` - Retrieve backtest results

**Journal:**
- `create_journal_entry` - Create journal entry
- `list_journal_entries` - List entries with filters
- `get_journal_stats` - Get journal statistics

## Testing

Currently the project has minimal test coverage. When adding tests:

**Frontend (TypeScript):**
- Framework: Would use Vitest (not yet configured)
- Priority: Financial calculations in `shared/utils/calculations.ts`
- Target coverage: 90% for financial calculations, 80% for utilities

**Backend (Rust):**
```bash
# Run all tests
cd src-tauri && cargo test

# Run specific module tests
cd src-tauri && cargo test scoring::

# Run with output
cd src-tauri && cargo test -- --nocapture
```

## Configuration

### Environment Setup

1. Copy `.env.example` to `.env`
2. Configure at least 2-3 market data API keys (Alpaca + Finnhub recommended)
3. OpenRouter API key required for AI features (Portfolio Agent)

### Database

- **Location**: `{app_data_dir}/flowfolio_cache.db`
- **Type**: SQLite with WAL mode
- **Tables**: `price_cache`, `quant_metrics_cache`, `historical_prices_cache`, etc.
- **Auto-created on first run**

## Documentation References

- **[README.md](README.md)**: Project overview, quick start, features
- **[CODE_STANDARDS.md](CODE_STANDARDS.md)**: Detailed coding standards and patterns
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)**: Development status and roadmap
- **[SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md)**: Security requirements
- **[QA_AUDIT_REPORT.md](QA_AUDIT_REPORT.md)**: Code quality audit findings

## Common Development Patterns

### Adding a New Tauri Command

1. **Create command in Rust** (`src-tauri/src/api/commands/`)
2. **Register in `lib.rs`** (add to `.invoke_handler()`)
3. **Call from frontend** using `invokeWithResilience()`:
```typescript
import { invokeWithResilience } from '@/services/apiClient';

const result = await invokeWithResilience<ReturnType>('command_name', {
  param: value
});
```

### Adding a New Feature Module

**Frontend:**
1. Create feature directory in `src/features/{feature-name}/`
2. Add types to `src/shared/types/`
3. Create service in `src/services/` if needed
4. Add component to `src/components/`

**Backend:**
1. Create module in `src-tauri/src/modules/{module-name}/`
2. Add business logic to `src-tauri/src/domain/`
3. Add Tauri commands to `src-tauri/src/api/commands/`
4. Register in `src-tauri/src/lib.rs`

### Working with Market Data

Always use the `EnhancedMarketDataService` which handles:
- Multi-source failover
- Caching (memory + SQLite)
- Rate limiting
- Health monitoring

Access via Tauri commands like `get_current_prices`, `get_historical_prices`.

## Troubleshooting

**Build Issues:**
- Run `npm install` to update dependencies
- Check Rust version: `rustc --version` (need 1.75+)
- Check Node version: `node --version` (need 20.x LTS)

**Database Issues:**
- Delete `{app_data_dir}/flowfolio_cache.db` to reset cache
- Check database logs in console output

**API Rate Limits:**
- Configure multiple API providers in `.env`
- Check cache stats with `get_cache_stats` command
- Increase cache TTL if needed

**Type Errors:**
- Run `npm run lint` to see all TypeScript errors
- Check `tsconfig.json` for strict mode settings
