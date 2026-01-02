# FlowFolio Architecture

## Overview

FlowFolio follows a clean, modular architecture with clear separation of concerns. The codebase is organized using industry best practices for both frontend (React/TypeScript) and backend (Rust/Tauri).

---

## 📁 Directory Structure

### Frontend (`src/`)

```
src/
├── core/                    # Core infrastructure
│   ├── api/                 # API client with resilience patterns
│   │   ├── client.ts        # Circuit breaker, retries, deduplication
│   │   └── index.ts
│   ├── cache/               # IndexedDB cache with LRU eviction
│   │   ├── service.ts
│   │   └── index.ts
│   └── errors/              # Structured error handling
│       └── index.ts
│
├── features/                # Feature modules (domain logic)
│   ├── market-data/         # Market data feature
│   │   ├── service.ts       # Unified market data API
│   │   └── index.ts
│   ├── portfolio/           # Portfolio management (planned)
│   ├── vibe-studio/         # Vibe plan editor (planned)
│   ├── backtest/            # Backtesting (planned)
│   └── journal/             # Trading journal (planned)
│
├── shared/                  # Shared utilities
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   ├── constants/           # Application constants
│   │   └── index.ts
│   ├── hooks/               # Custom React hooks
│   │   └── index.ts
│   └── utils/               # Utility functions
│       └── index.ts
│
├── ui/                      # UI components
│   ├── components/          # Reusable components
│   ├── layouts/             # Page layouts
│   └── styles/              # Global styles
│
├── components/              # Legacy components (migrating to ui/)
├── services/                # Legacy services (migrating to features/)
├── App.tsx                  # Main application
└── main.tsx                 # Entry point
```

### Backend (`src-tauri/src/`)

```
src-tauri/src/
├── core/                    # Core infrastructure
│   ├── config/              # Configuration management
│   │   └── mod.rs           # App config, cache config, rate limits
│   ├── error/               # Error types
│   │   └── mod.rs
│   └── logging/             # Structured logging
│       └── mod.rs
│
├── infrastructure/          # External service interfaces
│   ├── http/                # HTTP client
│   │   └── mod.rs           # Pooled client with compression
│   ├── cache/               # Cache layer
│   │   └── mod.rs
│   ├── database/            # Database access
│   │   └── mod.rs
│   └── resilience/          # Circuit breaker, retry
│       └── mod.rs
│
├── domain/                  # Business logic
│   ├── market/              # Market data domain
│   │   └── mod.rs
│   ├── portfolio/           # Portfolio domain
│   │   └── mod.rs
│   ├── analysis/            # Quantitative analysis
│   │   └── mod.rs
│   └── journal/             # Trading journal
│       └── mod.rs
│
├── api/                     # Tauri API layer
│   └── commands/            # Command handlers
│       ├── market.rs
│       ├── cache.rs
│       ├── health.rs
│       └── mod.rs
│
├── modules/                 # Legacy modules
│   ├── data_provider/       # Multi-source data providers
│   ├── circuit_breaker.rs   # Circuit breaker implementation
│   ├── retry.rs             # Retry with backoff
│   ├── health.rs            # Health monitoring
│   ├── error.rs             # Error types
│   ├── cache/               # Moka cache
│   ├── worker_pool/         # Async worker pool
│   ├── rate_limiter/        # Rate limiting
│   ├── quant_analysis.rs    # Quant calculations
│   ├── scoring/             # Symbol scoring
│   ├── portfolio/           # Portfolio management
│   ├── backtest/            # Backtesting engine
│   ├── journal/             # Journal module
│   └── ...
│
├── services/                # Service layer
│   ├── enhanced_market_service.rs  # Main market data service
│   ├── db_cache.rs          # Database caching
│   └── mod.rs
│
├── lib.rs                   # Main library with Tauri commands
└── main.rs                  # Entry point
```

---

## 🏗️ Architecture Principles

### 1. **Clean Architecture**

```
┌─────────────────────────────────────────────────┐
│                    UI Layer                      │
│         (React Components, Pages)                │
├─────────────────────────────────────────────────┤
│                 Feature Layer                    │
│      (Business Logic, Use Cases)                 │
├─────────────────────────────────────────────────┤
│                   Core Layer                     │
│    (API Client, Cache, Error Handling)           │
├─────────────────────────────────────────────────┤
│              Infrastructure Layer                │
│     (HTTP, Database, External APIs)              │
└─────────────────────────────────────────────────┘
```

### 2. **Dependency Flow**

```
UI → Features → Core → Infrastructure
     ↓
   Shared (Types, Utils, Hooks)
```

### 3. **Module Boundaries**

- **Core**: Infrastructure concerns (no business logic)
- **Features**: Business logic (no UI concerns)
- **Shared**: Cross-cutting utilities
- **UI**: Presentation (no business logic)

---

## 🔧 Key Patterns

### Frontend

| Pattern | Location | Description |
|---------|----------|-------------|
| Circuit Breaker | `core/api/client.ts` | Fails fast when backend is down |
| Request Deduplication | `core/api/client.ts` | Prevents duplicate requests |
| LRU Cache | `core/cache/service.ts` | IndexedDB with eviction |
| Structured Errors | `core/errors/index.ts` | Type-safe error handling |
| Custom Hooks | `shared/hooks/index.ts` | Reusable React patterns |

### Backend

| Pattern | Location | Description |
|---------|----------|-------------|
| Circuit Breaker | `modules/circuit_breaker.rs` | Provider failover |
| Retry with Backoff | `modules/retry.rs` | Transient failure handling |
| Health Monitoring | `modules/health.rs` | Metrics and health checks |
| Multi-tier Cache | `services/enhanced_market_service.rs` | Memory → DB → API |
| Worker Pool | `modules/worker_pool/` | Concurrent data fetching |

---

## 📦 Import Conventions

### Frontend

```typescript
// Core imports
import { apiClient, invokeCommand } from '@/core/api';
import { cacheService } from '@/core/cache';
import { AppError, handleError } from '@/core/errors';

// Feature imports
import { marketDataService } from '@/features/market-data';

// Shared imports
import type { QuantMetrics, Portfolio } from '@/shared/types';
import { CACHE_CONFIG, API_CONFIG } from '@/shared/constants';
import { useDebounce, useAsync } from '@/shared/hooks';
import { formatCurrency, formatPercent } from '@/shared/utils';
```

### Backend

```rust
// Core imports
use crate::core::config::CONFIG;
use crate::core::logging::log;

// Infrastructure imports
use crate::infrastructure::http::HTTP_CLIENT;
use crate::infrastructure::resilience::{CircuitBreakerManager, RetryExecutor};

// Domain imports
use crate::domain::market::*;
use crate::domain::analysis::*;
```

---

## 🚀 Getting Started

### Adding a New Feature

1. Create feature directory: `src/features/my-feature/`
2. Create service: `src/features/my-feature/service.ts`
3. Export from index: `src/features/my-feature/index.ts`
4. Add types to `shared/types/index.ts`

### Adding a New Backend Module

1. Create module in `src-tauri/src/modules/` or appropriate domain
2. Add to `mod.rs` exports
3. Create Tauri command in `lib.rs`
4. Register in `invoke_handler`

---

## 📋 Migration Status

### Frontend
- [x] Core API client
- [x] Core cache service
- [x] Core error handling
- [x] Market data feature
- [x] Shared types
- [x] Shared constants
- [x] Shared hooks
- [x] Shared utils
- [ ] Portfolio feature
- [ ] Vibe studio feature
- [ ] Backtest feature
- [ ] Journal feature
- [ ] UI components reorganization

### Backend
- [x] Core config
- [x] Core logging
- [x] Infrastructure HTTP
- [x] Infrastructure resilience
- [x] Domain structure
- [x] API commands structure
- [ ] Full command migration to api/commands
- [ ] Legacy module cleanup
