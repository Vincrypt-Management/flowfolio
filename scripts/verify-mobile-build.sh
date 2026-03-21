#!/bin/bash
set +e

echo "=== FlowFolio Mobile Build Verification ==="
echo ""

PASS=0
FAIL=0
SKIP=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  [PASS] $name"
    ((PASS++))
  else
    echo "  [FAIL] $name"
    ((FAIL++))
  fi
}

skip() {
  local name="$1"
  local reason="$2"
  echo "  [SKIP] $name -- $reason"
  ((SKIP++))
}

# Common prerequisites
echo "--- Common Prerequisites ---"
check "Node.js installed" "node --version"
check "npm installed" "npm --version"
check "Rust installed" "rustc --version"
check "Cargo installed" "cargo --version"
check "Tauri CLI installed" "npx tauri --version"

# iOS checks (macOS only)
echo ""
echo "--- iOS Prerequisites ---"
if [[ "$(uname)" == "Darwin" ]]; then
  check "Xcode installed" "xcode-select -p"
  check "Xcode Command Line Tools" "xcode-select --install 2>&1 | grep -q 'already installed' || xcode-select -p"
  check "CocoaPods installed" "pod --version"
  check "iOS Simulator available" "xcrun simctl list devices | grep -q 'iPhone'"
  check "aarch64-apple-ios target" "rustup target list --installed | grep -q aarch64-apple-ios"
  check "aarch64-apple-ios-sim target" "rustup target list --installed | grep -q aarch64-apple-ios-sim"

  echo ""
  echo "  To add missing iOS targets:"
  echo "    rustup target add aarch64-apple-ios aarch64-apple-ios-sim"
  echo "    npm run tauri ios init"
else
  skip "iOS" "requires macOS"
fi

# Android checks
echo ""
echo "--- Android Prerequisites ---"
if [ -n "$ANDROID_HOME" ] || [ -n "$ANDROID_SDK_ROOT" ]; then
  check "ANDROID_HOME set" "test -n '$ANDROID_HOME' -o -n '$ANDROID_SDK_ROOT'"
  check "Android SDK platforms dir" "test -d '${ANDROID_HOME:-$ANDROID_SDK_ROOT}/platforms'"
  check "Android NDK installed" "test -d '${ANDROID_HOME:-$ANDROID_SDK_ROOT}/ndk'"
  check "NDK_HOME set" "test -n '$NDK_HOME'"
  check "adb available" "adb --version"
  check "aarch64-linux-android target" "rustup target list --installed | grep -q aarch64-linux-android"
  check "armv7-linux-androideabi target" "rustup target list --installed | grep -q armv7-linux-androideabi"
  check "i686-linux-android target" "rustup target list --installed | grep -q i686-linux-android"
  check "x86_64-linux-android target" "rustup target list --installed | grep -q x86_64-linux-android"

  echo ""
  echo "  To add missing Android targets:"
  echo "    rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android"
  echo "    npm run tauri android init"
else
  skip "Android" "ANDROID_HOME not set"
  echo "  Set ANDROID_HOME to your Android SDK path, e.g.:"
  echo "    export ANDROID_HOME=\$HOME/Library/Android/sdk"
  echo "    export NDK_HOME=\$ANDROID_HOME/ndk/29.0.13846066"
  echo "  Then re-run this script."
fi

# Project init checks
echo ""
echo "--- Mobile Project Init Status ---"
TAURI_GEN="$(dirname "$0")/../src-tauri/gen"

if [ -d "$TAURI_GEN/android" ]; then
  echo "  [PASS] Android project initialized (src-tauri/gen/android exists)"
  ((PASS++))
else
  echo "  [INFO] Android project not yet initialized -- run: npm run android:init"
fi

if [ -d "$TAURI_GEN/apple" ]; then
  echo "  [PASS] iOS project initialized (src-tauri/gen/apple exists)"
  ((PASS++))
else
  echo "  [INFO] iOS project not yet initialized -- run: npm run ios:init"
fi

# Summary
echo ""
echo "=== Summary ==="
echo "  Passed:  $PASS"
echo "  Failed:  $FAIL"
echo "  Skipped: $SKIP"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Fix the failures above before attempting mobile builds."
  echo "See MOBILE_SETUP.md for detailed setup instructions."
  exit 1
fi
