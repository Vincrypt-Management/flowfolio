# FlowFolio QA Audit Report

**Audit Date:** 2026-03-20
**Scope:** Sprint 1 Foundation

## Summary

Sprint 1 resolved all critical findings from the pre-sprint codebase audit.

## Findings Resolved in Sprint 1

| Finding | Severity | Resolution |
|---|---|---|
| AlertsPanel used localStorage for primary storage | High | Migrated to SQLite price_alerts table |
| RebalanceScheduler used localStorage for primary storage | High | Migrated to SQLite rebalance_schedules table |
| UserProfileContext, UserModeContext used localStorage | High | Migrated to SQLite user_settings table |
| Universe storage was in-memory HashMap (lost on restart) | High | Migrated to SQLite universes table |
| App.tsx was 1234 lines with three tabs inlined | Medium | Extracted to TemplatesTab, RankingsTab, UniverseTab |
| CLAUDE.md referenced wrong invokeWithResilience path | Medium | Corrected to src/services/apiClient.ts |
| No Vitest config or financial calculation test coverage | Medium | Added vitest.config.ts + 59 calculations tests |
| IBKR CSV format not supported in broker CSV parser | Low | Added IBKR Flex Query detection and parsing |
| Epic F buy list missing allocation method selector | High | Wired equal_weight / score_weighted selector |
| Rebalance checks not persisted | Medium | Added record_rebalance + rebalance history UI |

## Remaining Technical Debt

| Item | Priority | Sprint |
|---|---|---|
| No integration tests for Tauri commands | Medium | Backlog |
| Mobile (iOS/Android) builds untested | Medium | Backlog |
| Rate limiting for API keys not surfaced to user | Low | Backlog |
| `batchAnalysis` export has no tests | Low | Sprint 2 |
