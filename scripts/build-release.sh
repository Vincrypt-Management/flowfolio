#!/usr/bin/env bash
# Build all release artifacts with versioned filenames.
# Usage: ./scripts/build-release.sh
# Reads version from package.json automatically.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="$ROOT/release/v$VERSION"

echo "╔══════════════════════════════════════╗"
echo "║  FlowFolio Release Build v$VERSION        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Ensure .env.encrypted exists (required for embedded env)
if [ ! -f "$ROOT/.env.encrypted" ]; then
  echo "Error: .env.encrypted not found. Run encrypt-env first."
  exit 1
fi

mkdir -p "$RELEASE_DIR"

# ── 1. Frontend build ───────────────────────────────────
echo "► Building frontend..."
npm run build --silent
echo "  ✓ Frontend built ($(du -sh dist | awk '{print $1}'))"
echo ""

# ── 2. macOS build ──────────────────────────────────────
echo "► Building macOS release..."
npm run tauri build -- --bundles app dmg 2>&1 | tail -5
DMG_SRC="$ROOT/src-tauri/target/release/bundle/dmg/FlowFolio_${VERSION}_aarch64.dmg"
if [ -f "$DMG_SRC" ]; then
  cp "$DMG_SRC" "$RELEASE_DIR/FlowFolio-${VERSION}-macos-aarch64.dmg"
  echo "  ✓ macOS DMG: $(ls -lh "$RELEASE_DIR/FlowFolio-${VERSION}-macos-aarch64.dmg" | awk '{print $5}')"
fi
echo ""

# ── 3. Android build ───────────────────────────────────
echo "► Building Android release..."
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk/" 2>/dev/null | sort -V | tail -1)}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools/" 2>/dev/null | sort -V | tail -1):$PATH"

npx tauri android build -t aarch64 armv7 2>&1 | tail -5

APK_SRC="$ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
AAB_SRC="$ROOT/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab"

if [ -f "$APK_SRC" ]; then
  # Zipalign + sign
  ALIGNED="/tmp/flowfolio-aligned-$VERSION.apk"
  zipalign -f -p 4 "$APK_SRC" "$ALIGNED"
  apksigner sign \
    --ks "$ROOT/flowfolio.keystore" \
    --ks-key-alias flowfolio \
    --ks-pass pass:flowfolio2026 \
    --key-pass pass:flowfolio2026 \
    --out "$RELEASE_DIR/FlowFolio-${VERSION}-android.apk" \
    "$ALIGNED"
  rm -f "$ALIGNED"
  apksigner verify "$RELEASE_DIR/FlowFolio-${VERSION}-android.apk" >/dev/null
  echo "  ✓ Android APK (signed): $(ls -lh "$RELEASE_DIR/FlowFolio-${VERSION}-android.apk" | awk '{print $5}')"
fi

if [ -f "$AAB_SRC" ]; then
  cp "$AAB_SRC" "$RELEASE_DIR/FlowFolio-${VERSION}-android.aab"
  echo "  ✓ Android AAB: $(ls -lh "$RELEASE_DIR/FlowFolio-${VERSION}-android.aab" | awk '{print $5}')"
fi
echo ""

# ── 4. Generate checksums ──────────────────────────────
echo "► Generating checksums..."
cd "$RELEASE_DIR"
shasum -a 256 FlowFolio-${VERSION}-* > "checksums-sha256.txt" 2>/dev/null || true
echo "  ✓ checksums-sha256.txt"
echo ""

# ── 5. Summary ──────────────────────────────────────────
echo "╔══════════════════════════════════════╗"
echo "║  Release v$VERSION complete               ║"
echo "╠══════════════════════════════════════╣"
echo "║  Artifacts in: release/v$VERSION/        ║"
echo "╚══════════════════════════════════════╝"
echo ""
ls -lh "$RELEASE_DIR/"
echo ""
echo "Next steps:"
echo "  git tag v$VERSION"
echo "  git push origin v$VERSION   # triggers CI for Linux + Windows builds"
