#!/usr/bin/env bash
# Verify that the bundled launcher icons are NOT the default Tauri/Vite
# placeholder icons. Run in CI preflight so a forgotten `npx tauri icon`
# can't ship a Tauri-branded build to users.
#
# Returns 0 if all checks pass, non-zero on first failure.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Known SHA-256 hashes of the default Tauri "claw" launcher icons (the
# cyan + yellow circle logo). Any of these appearing in the build means the
# developer forgot to regenerate icons after a `tauri android init`.
#
# Captured 2026-05-26 from a fresh `tauri android init` output.
DEFAULT_TAURI_HASHES=(
    "dae1ff05b101efea50e4b622fe6a3af8ba8f761162fa7c4fd864adc7cb39eeac"  # mipmap-xxxhdpi/ic_launcher
    "320e552422179b81dae014ee6cc00561bd6e7455767b28f5518b8862a8c7987c"  # mipmap-hdpi/ic_launcher
)

# Paths to check (relative to repo root). Add new platform icons here as
# the app grows (iOS AppIcon-512@2x.png etc.).
ICON_PATHS=(
    "src-tauri/gen/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-hdpi/ic_launcher.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png"
    "src-tauri/gen/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"
    "src-tauri/icons/128x128.png"
    "src-tauri/icons/128x128@2x.png"
    "src-tauri/icons/32x32.png"
    "src-tauri/icons/icon.png"
)

# Cross-platform sha256 helper (Linux uses sha256sum, macOS uses shasum -a 256).
sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

is_default_tauri() {
    local hash="$1"
    for bad in "${DEFAULT_TAURI_HASHES[@]}"; do
        [ "$hash" = "$bad" ] && return 0
    done
    return 1
}

fail=0
for rel in "${ICON_PATHS[@]}"; do
    path="$ROOT/$rel"
    if [ ! -f "$path" ]; then
        echo "::warning::missing icon: $rel"
        continue
    fi
    hash=$(sha256_of "$path")
    if is_default_tauri "$hash"; then
        echo "::error::$rel is the DEFAULT TAURI ICON (cyan+yellow circle)"
        echo "::error::Run 'npx tauri icon src-tauri/icons/icon.png' from the repo root to regenerate."
        fail=1
    else
        echo "OK: $rel"
    fi
done

if [ "$fail" -ne 0 ]; then
    echo ""
    echo "Default Tauri icons detected in the build. Refusing to ship a Tauri-branded app."
    exit 1
fi

echo ""
echo "All checked icons appear customized."
