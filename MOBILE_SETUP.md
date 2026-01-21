# FlowFolio Mobile Development Setup

This guide covers setting up Android and iOS development for FlowFolio using Tauri 2.

## Prerequisites

### Common Requirements
- Node.js 20.x LTS
- Rust 1.75+
- FlowFolio repository cloned

### Android Requirements
1. **Android Studio** (latest version)
   - Download: https://developer.android.com/studio
   
2. **Android SDK** (API 36 or latest)
   - Open Android Studio → Settings → SDK Manager
   - Install: Android SDK Platform, Android SDK Build-Tools, NDK

3. **Environment Variables** (add to `~/.zshrc` or `~/.bashrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export NDK_HOME=$ANDROID_HOME/ndk/29.0.13846066  # Use your NDK version
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```

4. **Android Device/Emulator**
   - Physical: Enable USB debugging in Developer Options
   - Virtual: Create AVD in Android Studio

### iOS Requirements (macOS only)
1. **Xcode** (latest version from App Store)
   
2. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

3. **CocoaPods**:
   ```bash
   sudo gem install cocoapods
   ```

4. **iOS Simulator or Physical Device**
   - Simulator: Xcode → Window → Devices and Simulators
   - Physical: Apple Developer account required

## Project Setup

### 1. Initialize Mobile Targets

```bash
# Android
npm run android:init

# iOS (macOS only)
npm run ios:init
```

### 2. Development

```bash
# Run on Android device/emulator
npm run android:dev

# Run on iOS simulator
npm run ios:dev
```

### 3. Build Release

```bash
# Android APK/AAB
npm run android:build

# iOS IPA
npm run ios:build
```

## Project Structure After Init

```
flowfolio/
├── src-tauri/
│   ├── gen/
│   │   ├── android/          # Android project files
│   │   │   ├── app/
│   │   │   ├── build.gradle
│   │   │   └── ...
│   │   └── apple/            # iOS/macOS project files
│   │       ├── FlowFolio/
│   │       ├── FlowFolio.xcodeproj
│   │       └── ...
│   └── ...
└── ...
```

## Mobile-Specific Configuration

### Android (src-tauri/gen/android/)

**app/build.gradle** - Configure:
- `minSdkVersion`: 24 (Android 7.0+)
- `targetSdkVersion`: 36
- Signing config for release builds

**AndroidManifest.xml** - Permissions:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### iOS (src-tauri/gen/apple/)

**Info.plist** - Configure:
- `NSAppTransportSecurity` for HTTPS connections
- `UILaunchStoryboardName`
- App icons and launch screens

**Capabilities**:
- Network access (automatic)
- Local storage (automatic)

## Code Considerations

### Platform Detection

```typescript
// In React/TypeScript
import { platform } from '@tauri-apps/plugin-os';

const isMobile = async () => {
  const p = await platform();
  return p === 'android' || p === 'ios';
};
```

### Responsive Design

The app includes mobile-responsive CSS in `src/App.css`:
- Bottom navigation bar on mobile
- Touch-friendly tap targets (44px minimum)
- Safe area insets for notched devices
- Horizontal scroll for tables
- Stacked layouts for forms

### API Differences

Some Tauri APIs behave differently on mobile:
- File system paths use app-specific directories
- Dialogs use native mobile UI
- Window management is limited

## Troubleshooting

### Android

**"SDK not found"**
```bash
echo $ANDROID_HOME
# Should output: /Users/<user>/Library/Android/sdk
```

**"NDK not found"**
- Open Android Studio → SDK Manager → SDK Tools
- Check "NDK (Side by side)" and install

**Build fails with "cannot find -lc++"**
```bash
# Install required NDK components
sdkmanager "ndk;29.0.13846066"
```

### iOS

**"Signing requires a development team"**
- Open Xcode → Select project → Signing & Capabilities
- Select your development team

**"CocoaPods not installed"**
```bash
sudo gem install cocoapods
pod setup
```

**Simulator won't launch**
```bash
# Reset simulator
xcrun simctl shutdown all
xcrun simctl erase all
```

## Release Build

### Android Signing

1. Generate keystore:
   ```bash
   keytool -genkey -v -keystore flowfolio-release.keystore \
     -alias flowfolio -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure in `src-tauri/gen/android/app/build.gradle`:
   ```gradle
   android {
       signingConfigs {
           release {
               storeFile file("flowfolio-release.keystore")
               storePassword System.getenv("KEYSTORE_PASSWORD")
               keyAlias "flowfolio"
               keyPassword System.getenv("KEY_PASSWORD")
           }
       }
   }
   ```

### iOS Distribution

1. Create App ID in Apple Developer Portal
2. Create provisioning profile
3. Configure in Xcode
4. Archive and upload to App Store Connect

## Testing

### Android
```bash
# Install APK on connected device
adb install -r src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk

# View logs
adb logcat | grep flowfolio
```

### iOS
```bash
# Build for simulator
npm run ios:dev

# Run on specific simulator
npm run tauri ios dev -- --device "iPhone 15 Pro"
```

## Performance Tips

1. **Reduce bundle size**: Enable tree-shaking, minimize dependencies
2. **Lazy load**: Split code for routes/features
3. **Optimize images**: Use WebP, proper sizing
4. **Cache aggressively**: Leverage Tauri's multi-tier caching
5. **Test on real devices**: Simulators don't reflect real performance

## Resources

- [Tauri Mobile Guide](https://v2.tauri.app/guides/prerequisites/)
- [Android Developer Docs](https://developer.android.com/docs)
- [Apple Developer Docs](https://developer.apple.com/documentation/)
