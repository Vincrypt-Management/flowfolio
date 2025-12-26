# Security Checklist for Vibe Invest (Flowfolio)

## Epic H — Packaging, Updates, and Hardening

### ✅ CSP (Content Security Policy) Configuration

**Status:** ✅ Configured

**Location:** `src-tauri/tauri.conf.json`

**Requirements:**
- [x] No remote scripts/CDNs allowed
- [x] `script-src 'self' 'wasm-unsafe-eval'` (for Vite HMR in dev)
- [x] `style-src 'self' 'unsafe-inline'` (for styled components)
- [x] `connect-src 'self'` only
- [x] No `unsafe-eval` in production
- [x] `img-src 'self' data: blob:`

**Verification:**
```bash
# Check CSP headers in production build
grep -r "Content-Security-Policy" src-tauri/tauri.conf.json
```

---

### ✅ Capabilities Minimal and Reviewed

**Status:** ✅ Configured

**Location:** `src-tauri/capabilities/` directory

**Registered Commands (Whitelist):**
- [x] `get_universe` - Fetch symbol universe
- [x] `save_plan` - Save investment plan
- [x] `load_plans` - Load saved plans
- [x] `compile_plan` - Compile vibe plan
- [x] `compute_rankings` - Calculate rankings
- [x] `get_market_data` - Fetch market data
- [x] `calculate_allocations` - Portfolio allocation
- [x] `get_holdings` - Current holdings
- [x] `save_holdings` - Save holdings
- [x] `generate_buy_list` - Monthly buy list
- [x] `run_backtest` - Backtest simulation
- [x] `get_journal_entries` - Journal access
- [x] `save_api_key` - Secure key storage (Stronghold)
- [x] `get_api_key` - Secure key retrieval

**Verification:**
```bash
# All commands must be explicitly registered
grep -r "invoke_handler" src-tauri/src/lib.rs
```

**Security Review:**
- [x] No filesystem write access outside app data directory
- [x] No shell command execution capability
- [x] No arbitrary HTTP requests (only provider module)
- [x] No IPC bypass or eval capabilities

---

### 🔐 Stronghold Integration for Secret Storage

**Status:** ✅ Implemented

**Location:** `src-tauri/src/modules/secrets.rs`

**Features:**
- [x] Encrypted storage for API keys
- [x] No plaintext secrets in memory longer than needed
- [x] Automatic key derivation from app identifier
- [x] Secure cleanup on app exit

**Verification:**
```bash
# Check Stronghold usage
grep -r "stronghold" src-tauri/Cargo.toml src-tauri/src/modules/secrets.rs
```

---

### 🔒 Network Access Restrictions

**Status:** ✅ Configured

**Allowed Outbound:**
- [x] Provider APIs only (Alpha Vantage, Yahoo Finance, etc.)
- [x] Rate limiting enforced (12 API calls/minute for free tier)
- [x] No telemetry or analytics

**Blocked:**
- [x] No CDN requests
- [x] No third-party tracking
- [x] No auto-update servers (manual updates only for MLP)

**Location:** `src-tauri/src/modules/provider.rs`

**Verification:**
```bash
# Check for any HTTP client usage outside provider module
grep -r "reqwest\|http" src-tauri/src/ --exclude-dir=modules/provider.rs
```

---

### 📦 Build and Release Process

**Status:** ⚠️ To be configured

**Requirements:**

#### 1. Reproducible Builds
- [ ] Document exact build environment (Rust version, Node version, OS)
- [ ] Lock all dependencies (Cargo.lock, package-lock.json committed)
- [ ] Use Docker for reproducible builds (optional)

**Build Command:**
```bash
# Production build
npm run tauri build

# Verify reproducibility
sha256sum target/release/bundle/*/vibe-invest*
```

#### 2. Code Signing
- [ ] macOS: Sign with Apple Developer certificate
- [ ] Windows: Sign with Authenticode certificate
- [ ] Linux: GPG sign AppImage

**macOS Signing:**
```bash
codesign --sign "Developer ID Application: Your Name" \
  --options runtime \
  --entitlements src-tauri/Info.plist \
  target/release/bundle/macos/Vibe\ Invest.app
```

**Windows Signing:**
```bash
signtool sign /f certificate.pfx /p password \
  /t http://timestamp.digicert.com \
  target/release/bundle/msi/Vibe_Invest.msi
```

#### 3. Release Distribution
- [ ] Host on GitHub Releases or self-hosted server
- [ ] Provide checksums (SHA256) for all artifacts
- [ ] GPG sign release notes

**Checksum Generation:**
```bash
cd target/release/bundle
sha256sum * > SHA256SUMS.txt
gpg --clearsign SHA256SUMS.txt
```

---

### 🔄 Update Strategy

**Status:** Manual Updates (MLP)

**Decision:** Manual updates for MLP to maintain zero-network-dependency promise

**Process:**
1. User downloads new version from website/GitHub
2. Verifies checksum against published hash
3. Installs new version manually
4. Optional: In-app "Check for Updates" button (user-initiated only)

**Future (Post-MLP):**
- Consider Tauri updater with signature verification
- User must approve all updates
- No silent/automatic updates

**Configuration:**
```json
// src-tauri/tauri.conf.json
{
  "updater": {
    "active": false  // Disabled for MLP
  }
}
```

---

### 🛡️ Dependency Audit

**Status:** ✅ Initial audit complete

**Process:**

#### Rust Dependencies
```bash
# Install cargo-audit
cargo install cargo-audit

# Run audit
cd src-tauri
cargo audit

# Update vulnerable dependencies
cargo update
```

#### Node Dependencies
```bash
# Audit npm packages
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```

**Cadence:**
- [ ] Weekly: Run `cargo audit` and `npm audit`
- [ ] Monthly: Review and update dependencies
- [ ] Before each release: Full security audit

**Automation (optional):**
```bash
# Add to CI/CD pipeline
- name: Security Audit
  run: |
    cargo audit
    npm audit --audit-level=moderate
```

---

### 🔍 Static Analysis

**Status:** ⚠️ To be configured

**Tools:**

#### Rust
```bash
# Clippy (linting)
cargo clippy -- -D warnings

# Rustfmt (formatting)
cargo fmt --check

# Miri (unsafe code detection)
cargo +nightly miri test
```

#### TypeScript/React
```bash
# ESLint
npm run lint

# TypeScript strict checks
tsc --noEmit --strict
```

**CI Integration:**
```yaml
# .github/workflows/security.yml
name: Security Checks
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Cargo Audit
        run: cargo audit
      - name: NPM Audit
        run: npm audit
```

---

### 📋 Pre-Release Checklist

**Before Each Release:**

- [ ] Run full security audit (`cargo audit` + `npm audit`)
- [ ] Verify CSP headers in production build
- [ ] Review all registered Tauri commands
- [ ] Check no accidental remote access capabilities
- [ ] Test Stronghold secret storage
- [ ] Verify no plaintext API keys in logs or memory dumps
- [ ] Test offline mode (disconnect internet, verify app works)
- [ ] Review all network calls (should only be provider APIs)
- [ ] Sign all release artifacts
- [ ] Generate and publish checksums
- [ ] Update CHANGELOG.md with security notes
- [ ] Document known issues/limitations

---

### 🚨 Incident Response Plan

**If Security Issue Discovered:**

1. **Assess Severity:**
   - Critical: Remote code execution, data exfiltration
   - High: API key leakage, CSP bypass
   - Medium: DoS, information disclosure
   - Low: Minor information leak

2. **Immediate Actions:**
   - Privately disclose to maintainers
   - Patch vulnerability in private branch
   - Test fix thoroughly

3. **Disclosure:**
   - Coordinate disclosure timeline (e.g., 90 days)
   - Prepare security advisory
   - Release patched version
   - Notify users via GitHub Security Advisory

4. **Post-Incident:**
   - Document root cause
   - Update security checklist
   - Add test coverage for vulnerability

---

### 📝 Security Contact

**Report vulnerabilities to:**
- Email: security@vibefolio.app (to be configured)
- GitHub Security Advisory: Use "Report a vulnerability" button

**PGP Key:** (to be added)

---

## Verification Commands

### Full Security Check Script
```bash
#!/bin/bash
# security_check.sh

echo "🔍 Running Security Checks..."

echo "\n📦 Checking Rust dependencies..."
cd src-tauri
cargo audit || exit 1

echo "\n📦 Checking Node dependencies..."
cd ..
npm audit --audit-level=moderate || exit 1

echo "\n🔍 Running Clippy..."
cd src-tauri
cargo clippy -- -D warnings || exit 1

echo "\n🔍 Running ESLint..."
cd ..
npm run lint || exit 1

echo "\n✅ Checking CSP configuration..."
grep -q "script-src 'self'" src-tauri/tauri.conf.json || {
  echo "❌ CSP not properly configured"
  exit 1
}

echo "\n✅ Verifying no remote access..."
! grep -r "allowlist.*all.*true" src-tauri/tauri.conf.json || {
  echo "❌ Found unrestricted allowlist"
  exit 1
}

echo "\n✅ All security checks passed!"
```

**Usage:**
```bash
chmod +x security_check.sh
./security_check.sh
```

---

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| CSP Configuration | ✅ | Configured in tauri.conf.json |
| Capability Restrictions | ✅ | Commands explicitly registered |
| Stronghold Integration | ✅ | Implemented for API keys |
| Network Restrictions | ✅ | Provider module only |
| Dependency Audit | ✅ | Initial audit complete |
| Code Signing | ⚠️ | To be configured for production |
| Reproducible Builds | ⚠️ | Documentation needed |
| CI/CD Security | ⚠️ | Optional for MLP |

**MLP Readiness:** 🟢 Core security requirements met. Code signing and CI/CD can be added post-MLP.

---

**Last Updated:** 2025-12-26  
**Reviewed By:** Development Team  
**Next Review:** Before production release
