# Code Signing & Auto-Update Configuration

This document describes the GitHub Secrets required to enable code signing and auto-updates for FlowFolio release builds.

## GitHub Secrets Reference

### macOS Code Signing

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Apple Developer ID Application certificate exported as a base64-encoded `.p12` file |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` certificate |
| `APPLE_SIGNING_IDENTITY` | Signing identity string, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Apple ID email address used for notarization |
| `APPLE_PASSWORD` | App-specific password for the Apple ID (generated at appleid.apple.com) |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10-character string, e.g. `ABCD1234EF`) |

To export your certificate as base64:
```sh
base64 -i certificate.p12 | pbcopy
```

### Windows Code Signing

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE` | Code signing certificate exported as a base64-encoded `.pfx` file |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password used when exporting the `.pfx` certificate |

To export your certificate as base64:
```sh
certutil -encode certificate.pfx certificate.b64 && type certificate.b64
```

Or on Linux/macOS:
```sh
base64 -i certificate.pfx | pbcopy
```

## Auto-Update Keypair

FlowFolio uses Tauri's built-in updater, which requires a signing keypair so clients can verify update authenticity.

Generate a keypair with:
```sh
npx tauri signer generate -w ~/.tauri/flowfolio.key
```

This outputs a **private key** (keep secret) and a **public key**.

- Store the **private key** as the `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret.
- Store the **private key password** (if set) as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Paste the **public key** into the `pubkey` field in `src-tauri/tauri.conf.json` under `plugins.updater`.

The release workflow must sign the update bundles. Pass the private key to the build step:
```yaml
env:
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

## Further Reading

- [Tauri Code Signing (macOS & Windows)](https://tauri.app/distribute/sign/)
- [Tauri Updater Plugin](https://tauri.app/plugin/updater/)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
