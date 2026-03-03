#!/usr/bin/env bash
# Bump version across all config files in the FlowFolio project.
# Usage: ./scripts/bump-version.sh <new_version>
# Example: ./scripts/bump-version.sh 1.0.0

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new_version>"
  echo "Example: $0 1.0.0"
  exit 1
fi

NEW_VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g. 1.0.0)"
  exit 1
fi

# Compute Android versionCode from semver: major*10000 + minor*100 + patch
IFS='.' read -r MAJOR MINOR PATCH <<< "$NEW_VERSION"
VERSION_CODE=$(( MAJOR * 10000 + MINOR * 100 + PATCH ))

echo "Bumping version to $NEW_VERSION (Android versionCode: $VERSION_CODE)"
echo ""

# 1. package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$ROOT/package.json"
echo "✓ package.json"

# 2. package-lock.json (top-level)
cd "$ROOT" && npm install --package-lock-only --silent 2>/dev/null
echo "✓ package-lock.json"

# 3. tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
echo "✓ src-tauri/tauri.conf.json"

# 4. Cargo.toml
sed -i '' "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$ROOT/src-tauri/Cargo.toml"
echo "✓ src-tauri/Cargo.toml"

# 5. Cargo.lock (via cargo update)
cd "$ROOT/src-tauri" && cargo update -p flowfolio --quiet 2>/dev/null || true
echo "✓ src-tauri/Cargo.lock"

echo ""
echo "Version bumped to $NEW_VERSION across all files."
echo "Android versionCode will be set to $VERSION_CODE automatically by Tauri."
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
