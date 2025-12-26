#!/bin/bash
# Security Audit Script for Vibe Invest (Flowfolio)
# Run this before each release

set -e

echo "🔍 Running Security Checks for Vibe Invest..."
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Function to report test result
report() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        FAILURES=$((FAILURES + 1))
    fi
}

# 1. Check Rust dependencies
echo -e "\n📦 Checking Rust dependencies..."
cd src-tauri
if command -v cargo-audit &> /dev/null; then
    cargo audit
    report $? "Cargo audit"
else
    echo -e "${YELLOW}⚠️  cargo-audit not installed. Run: cargo install cargo-audit${NC}"
    FAILURES=$((FAILURES + 1))
fi
cd ..

# 2. Check Node dependencies
echo -e "\n📦 Checking Node dependencies..."
npm audit --audit-level=moderate
report $? "NPM audit"

# 3. Run Clippy
echo -e "\n🔍 Running Rust Clippy..."
cd src-tauri
cargo clippy -- -D warnings 2>&1 | head -20
report ${PIPESTATUS[0]} "Cargo clippy"
cd ..

# 4. Run ESLint
echo -e "\n🔍 Running ESLint..."
if [ -f "package.json" ] && grep -q "\"lint\"" package.json; then
    npm run lint
    report $? "ESLint"
else
    echo -e "${YELLOW}⚠️  No lint script found in package.json${NC}"
fi

# 5. Check CSP configuration
echo -e "\n🔒 Checking CSP configuration..."
if grep -q "script-src.*'self'" src-tauri/tauri.conf.json; then
    report 0 "CSP properly configured"
else
    report 1 "CSP not properly configured"
fi

# 6. Verify no unrestricted allowlist
echo -e "\n🔒 Checking for unrestricted capabilities..."
if grep -r "allowlist.*all.*true" src-tauri/tauri.conf.json > /dev/null; then
    report 1 "Found unrestricted allowlist - SECURITY RISK"
else
    report 0 "No unrestricted allowlist found"
fi

# 7. Check for hardcoded secrets
echo -e "\n🔐 Checking for hardcoded secrets..."
if grep -rE "(api[_-]?key|password|secret|token).*=.*['\"][a-zA-Z0-9]{16,}" src/ src-tauri/src/ --exclude-dir=node_modules 2>/dev/null; then
    report 1 "Found potential hardcoded secrets"
else
    report 0 "No hardcoded secrets found"
fi

# 8. Check Stronghold integration
echo -e "\n🔐 Verifying Stronghold integration..."
if grep -q "tauri-plugin-stronghold" src-tauri/Cargo.toml; then
    report 0 "Stronghold dependency present"
else
    report 1 "Stronghold dependency missing"
fi

# 9. Check for network calls outside provider module
echo -e "\n🌐 Checking network access restrictions..."
NETWORK_CALLS=$(grep -r "reqwest\|http::Client" src-tauri/src/ --exclude-dir=modules 2>/dev/null | grep -v "provider.rs" | wc -l)
if [ "$NETWORK_CALLS" -eq 0 ]; then
    report 0 "Network access properly restricted"
else
    report 1 "Found network calls outside provider module"
fi

# 10. Verify Cargo.lock and package-lock.json exist
echo -e "\n📋 Checking dependency locks..."
if [ -f "src-tauri/Cargo.lock" ]; then
    report 0 "Cargo.lock present"
else
    report 1 "Cargo.lock missing"
fi

if [ -f "package-lock.json" ]; then
    report 0 "package-lock.json present"
else
    report 1 "package-lock.json missing"
fi

# 11. Check for console.log in production code
echo -e "\n🐛 Checking for debug statements..."
DEBUG_COUNT=$(grep -r "console\.log\|println!" src/ src-tauri/src/ --exclude-dir=node_modules 2>/dev/null | wc -l)
if [ "$DEBUG_COUNT" -gt 10 ]; then
    echo -e "${YELLOW}⚠️  Found $DEBUG_COUNT debug statements - consider removing for production${NC}"
else
    report 0 "Minimal debug statements found"
fi

# 12. Check TypeScript strict mode
echo -e "\n📝 Checking TypeScript configuration..."
if [ -f "tsconfig.json" ]; then
    if grep -q "\"strict\": true" tsconfig.json; then
        report 0 "TypeScript strict mode enabled"
    else
        echo -e "${YELLOW}⚠️  TypeScript strict mode not enabled${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  tsconfig.json not found${NC}"
fi

# Summary
echo -e "\n=============================================="
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILURES security check(s) failed${NC}"
    echo -e "${YELLOW}Please review and fix the issues above before release.${NC}"
    exit 1
fi
