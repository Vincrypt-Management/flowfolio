# Security Policy

## Overview

FlowFolio is a desktop-first, privacy-focused investment portfolio manager. This document outlines security considerations, known vulnerabilities, and best practices for secure deployment.

---

## Security Architecture

### Design Principles

1. **Local-First Data Storage** - All portfolio data stored in local SQLite database
2. **No Cloud Dependencies** - No external servers for data storage
3. **No Telemetry** - No usage tracking or analytics
4. **Minimal Permissions** - Tauri capability model restricts system access

### Technology Stack Security

| Component | Security Feature |
|-----------|------------------|
| Tauri 2 | Capability-based permissions, CSP enforcement |
| SQLite | Local storage, no network exposure |
| Rust Backend | Memory safety, no buffer overflows |
| React Frontend | XSS protection via JSX escaping |

---

## Known Vulnerabilities

### CRITICAL: API Keys in Frontend Bundle

**Status:** OPEN - Requires remediation

**Description:**
All market data API keys are currently stored as `VITE_` prefixed environment variables, which are embedded directly into the compiled JavaScript bundle.

**Affected Keys:**
- `VITE_OPENROUTER_API_KEY`
- `VITE_ALPACA_API_KEY`
- `VITE_ALPACA_API_SECRET`
- `VITE_FINNHUB_API_KEY`
- `VITE_FMP_API_KEY`
- `VITE_TIINGO_API_KEY`
- `VITE_TWELVE_DATA_API_KEY`
- `VITE_POLYGON_API_KEY`
- `VITE_ALPHAVANTAGE_API_KEY`

**Risk:**
- Keys visible in browser DevTools
- Keys extractable from compiled binaries
- Unauthorized API usage possible

**Mitigation (Planned):**
1. Move all API calls to Rust backend
2. Store keys in backend-only environment variables
3. Implement Tauri Stronghold for encrypted key storage

---

## Secure Configuration Guide

### Environment Variables

**DO NOT** use `VITE_` prefix for sensitive values. These are embedded in the client bundle.

```bash
# WRONG - Exposed in client bundle
VITE_API_KEY=secret123

# CORRECT - Only accessible in Rust backend
API_KEY=secret123
```

### Recommended .env Structure

```bash
# Frontend (safe to expose)
VITE_APP_NAME=FlowFolio
VITE_DEFAULT_LLM_MODEL=anthropic/claude-3-sonnet

# Backend only (NOT prefixed with VITE_)
OPENROUTER_API_KEY=your-key-here
ALPACA_API_KEY=your-key-here
ALPACA_API_SECRET=your-secret-here
FINNHUB_API_KEY=your-key-here
```

### File Permissions

Ensure `.env` file has restricted permissions:

```bash
# Unix/macOS
chmod 600 .env

# Windows (PowerShell)
icacls .env /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

---

## Data Protection

### Local Storage

| Data Type | Storage Location | Encryption |
|-----------|------------------|------------|
| Portfolio data | SQLite database | None (planned) |
| API keys | Environment vars | None (planned: Stronghold) |
| Cache data | IndexedDB | None |
| Session state | React state | N/A (memory only) |

### Data at Rest

Currently, portfolio data is stored unencrypted in SQLite. Users should:
1. Use full-disk encryption (BitLocker, FileVault)
2. Secure physical access to device
3. Use strong OS user passwords

### Data in Transit

- All API calls use HTTPS
- No unencrypted HTTP connections
- Certificate validation enabled

---

## Third-Party Services

### Market Data Providers

| Provider | Data Accessed | Privacy Impact |
|----------|---------------|----------------|
| Alpaca | Account info, positions | High - broker access |
| Yahoo Finance | Price data | Low - public data |
| Finnhub | Price data, news | Low - public data |
| Tiingo | Price data | Low - public data |
| Polygon.io | Price data | Low - public data |
| Alpha Vantage | Price data | Low - public data |
| Twelve Data | Price data | Low - public data |
| FMP | Financial data | Low - public data |

### AI/LLM Services

| Service | Data Sent | Privacy Consideration |
|---------|-----------|----------------------|
| OpenRouter | Portfolio prompts | AI provider sees strategy text |

**Recommendation:** Review OpenRouter's data retention policy before sending portfolio details.

---

## Incident Response

### If API Keys Are Compromised

1. **Immediately rotate** affected API keys at provider dashboards
2. **Audit API usage** for unauthorized activity
3. **Update** `.env` file with new keys
4. **Review** any unexpected charges

### Reporting Security Issues

For security vulnerabilities, please:
1. **Do NOT** open a public GitHub issue
2. Email security concerns to: [repository maintainer]
3. Include: description, reproduction steps, impact assessment

---

## Security Checklist

### Before First Run

- [ ] Create `.env` file from `.env.example`
- [ ] Never commit `.env` to version control
- [ ] Verify `.gitignore` includes `.env`
- [ ] Use unique API keys (don't share across projects)

### Periodic Review

- [ ] Rotate API keys every 90 days
- [ ] Audit API usage at provider dashboards
- [ ] Update dependencies (`npm audit`, `cargo audit`)
- [ ] Review Tauri capability permissions

### Development

- [ ] Run `npm audit` before releases
- [ ] Run `cargo audit` before releases
- [ ] Review any new `VITE_` environment variables
- [ ] Test circuit breaker behavior

---

## Dependency Security

### Automated Scanning

```bash
# Frontend vulnerabilities
npm audit

# Rust vulnerabilities
cargo audit

# Full security check (if available)
./security_check.sh
```

### Key Dependencies

| Package | Purpose | Security Notes |
|---------|---------|----------------|
| axios | HTTP client | Keep updated for CVE fixes |
| @tauri-apps/api | Tauri bridge | Official, maintained |
| reqwest | Rust HTTP | Mature, well-audited |
| sqlx | Database | Parameterized queries |

---

## Compliance Notes

### Data Residency

- All data stored locally on user's device
- No data transmitted to FlowFolio servers
- User controls all data retention

### GDPR Considerations

- No personal data collected by application
- User can delete all data by removing app directory
- No third-party analytics or tracking

---

## Future Security Improvements

### Planned Enhancements

1. **Tauri Stronghold Integration**
   - Encrypted storage for API keys
   - Hardware security module support

2. **Database Encryption**
   - SQLite encryption at rest
   - User-provided encryption key

3. **API Key Migration**
   - Move all API calls to Rust backend
   - Remove frontend key exposure

4. **Audit Logging**
   - Track portfolio modifications
   - Log API access patterns

---

*Last updated: January 2, 2026*
