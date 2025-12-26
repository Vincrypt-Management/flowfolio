# Reproducible Build Documentation

## Build Environment

### Required Versions

```json
{
  "rust": "1.75.0+",
  "node": "20.x LTS",
  "npm": "10.x",
  "tauri-cli": "2.x"
}
```

### System Requirements

- **macOS:** 12.0+ (Monterey or later)
- **Windows:** 10/11 (64-bit)
- **Linux:** Ubuntu 20.04+ or equivalent

---

## Build Process

### 1. Clean Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd flowfolio

# Verify commit/tag
git checkout v1.0.0  # Replace with actual version

# Verify checksums of lock files
sha256sum package-lock.json src-tauri/Cargo.lock
```

### 2. Install Dependencies

```bash
# Install Node dependencies
npm ci  # Use ci instead of install for reproducibility

# Verify Rust toolchain
rustc --version
cargo --version

# Install Tauri CLI
cargo install tauri-cli --version ^2.0.0
```

### 3. Build Application

```bash
# Production build
npm run tauri build

# Build output locations:
# - macOS: src-tauri/target/release/bundle/macos/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/appimage/
```

### 4. Verify Build

```bash
# Generate checksums
cd src-tauri/target/release/bundle
find . -type f -name "*.dmg" -o -name "*.msi" -o -name "*.AppImage" | \
  xargs sha256sum > SHA256SUMS.txt

# Display checksums
cat SHA256SUMS.txt
```

---

## Docker Build (Optional)

For maximum reproducibility, use Docker:

```dockerfile
# Dockerfile.build
FROM rust:1.75-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY src-tauri/Cargo.* src-tauri/

# Install dependencies
RUN npm ci
RUN cd src-tauri && cargo fetch

# Copy source code
COPY . .

# Build application
RUN npm run tauri build

# Output is in /app/src-tauri/target/release/bundle/
```

**Build with Docker:**

```bash
# Build image
docker build -f Dockerfile.build -t vibe-invest-builder .

# Extract artifacts
docker create --name temp-container vibe-invest-builder
docker cp temp-container:/app/src-tauri/target/release/bundle ./bundle
docker rm temp-container

# Generate checksums
cd bundle
sha256sum * > SHA256SUMS.txt
```

---

## Code Signing

### macOS

```bash
# Requirements:
# - Apple Developer account
# - Developer ID Application certificate installed

# Sign the app bundle
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --options runtime \
  --timestamp \
  src-tauri/target/release/bundle/macos/Vibe\ Invest.app

# Verify signature
codesign --verify --deep --strict --verbose=2 \
  src-tauri/target/release/bundle/macos/Vibe\ Invest.app

# Create DMG and sign it
hdiutil create -volname "Vibe Invest" \
  -srcfolder "src-tauri/target/release/bundle/macos/Vibe Invest.app" \
  -ov -format UDZO \
  "Vibe-Invest-v1.0.0.dmg"

codesign --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --timestamp \
  Vibe-Invest-v1.0.0.dmg

# Notarize (optional but recommended)
xcrun notarytool submit Vibe-Invest-v1.0.0.dmg \
  --apple-id "your-email@example.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password"

# Wait for notarization, then staple
xcrun stapler staple Vibe-Invest-v1.0.0.dmg
```

### Windows

```bash
# Requirements:
# - Code signing certificate (.pfx file)
# - Windows SDK (for signtool.exe)

# Sign the MSI
signtool sign /f certificate.pfx \
  /p "certificate-password" \
  /tr http://timestamp.digicert.com \
  /td sha256 \
  /fd sha256 \
  /d "Vibe Invest" \
  src-tauri/target/release/bundle/msi/Vibe_Invest_1.0.0_x64.msi

# Verify signature
signtool verify /pa \
  src-tauri/target/release/bundle/msi/Vibe_Invest_1.0.0_x64.msi
```

### Linux

```bash
# Sign AppImage with GPG
gpg --detach-sign --armor \
  src-tauri/target/release/bundle/appimage/vibe-invest_1.0.0_amd64.AppImage

# This creates: vibe-invest_1.0.0_amd64.AppImage.asc

# Verify signature
gpg --verify \
  vibe-invest_1.0.0_amd64.AppImage.asc \
  vibe-invest_1.0.0_amd64.AppImage
```

---

## Release Checklist

### Pre-Build

- [ ] Update version in `src-tauri/Cargo.toml`
- [ ] Update version in `package.json`
- [ ] Update CHANGELOG.md
- [ ] Run security audit: `./security_check.sh`
- [ ] Run full test suite: `npm test && cd src-tauri && cargo test`
- [ ] Review git diff for any accidental inclusions

### Build

- [ ] Clean previous builds: `rm -rf src-tauri/target/release/bundle`
- [ ] Verify lock files are committed and up-to-date
- [ ] Build: `npm run tauri build`
- [ ] Verify build completed without errors

### Post-Build

- [ ] Sign all artifacts (macOS, Windows, Linux)
- [ ] Generate SHA256 checksums
- [ ] Sign checksums with GPG
- [ ] Test installation on clean machines
- [ ] Verify no network calls in offline mode
- [ ] Test API key storage/retrieval

### Release

- [ ] Create git tag: `git tag -a v1.0.0 -m "Release 1.0.0"`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] Create GitHub Release
- [ ] Upload signed artifacts
- [ ] Upload checksums and GPG signatures
- [ ] Write release notes
- [ ] Announce release

---

## Troubleshooting

### macOS: "App is damaged and can't be opened"

**Cause:** App not signed or notarized

**Fix:**
```bash
# Temporary: Remove quarantine attribute (for testing only)
xattr -cr /Applications/Vibe\ Invest.app

# Permanent: Sign and notarize the app
```

### Windows: SmartScreen warning

**Cause:** App not signed with EV certificate

**Fix:** Sign with code signing certificate. EV certificates provide instant reputation.

### Linux: AppImage won't run

**Cause:** Missing FUSE or execute permissions

**Fix:**
```bash
# Make executable
chmod +x vibe-invest_1.0.0_amd64.AppImage

# If FUSE missing, extract and run
./vibe-invest_1.0.0_amd64.AppImage --appimage-extract
./squashfs-root/AppRun
```

---

## Verification for Users

Users can verify downloads using checksums:

```bash
# Download files
wget https://releases.vibefolio.app/v1.0.0/Vibe-Invest-v1.0.0.dmg
wget https://releases.vibefolio.app/v1.0.0/SHA256SUMS.txt
wget https://releases.vibefolio.app/v1.0.0/SHA256SUMS.txt.asc

# Verify GPG signature
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt

# Verify checksum
sha256sum -c SHA256SUMS.txt
```

**Expected output:**
```
Vibe-Invest-v1.0.0.dmg: OK
```

---

## CI/CD Integration (Post-MLP)

```yaml
# .github/workflows/release.yml
name: Release Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run tauri build
        
      - name: Generate checksums
        run: |
          cd src-tauri/target/release/bundle
          sha256sum * > SHA256SUMS.txt
          
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-${{ matrix.os }}
          path: src-tauri/target/release/bundle/*
```

---

## Security Notes

1. **Never commit signing certificates to repository**
2. **Use environment variables for sensitive data in CI/CD**
3. **Rotate signing certificates before expiration**
4. **Keep private keys in secure hardware (HSM/YubiKey)**
5. **Verify all third-party dependencies before building**

---

**Last Updated:** 2025-12-26  
**Tauri Version:** 2.x  
**Rust Version:** 1.75+  
**Node Version:** 20.x LTS
