# iOS Native Setup (requires macOS)

Run these commands on a Mac from the project root:

```bash
npm install
npx cap add ios
npx cap sync ios
```

Then open Xcode:
```bash
npx cap open ios
```

---

## Required Info.plist entries

Add the following keys inside the `<dict>` of `ios/App/App/Info.plist`.
Xcode will show a permission dialog for each one the first time it is triggered.

```xml
<!-- Location — GPS during rides and convoy sync -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Blacktop uses your location during rides to track distance, speed, and your position within the convoy. Your location is never shared outside an active ride.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Blacktop can continue tracking your ride in the background so distance and speed stay accurate even when the app is minimised.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Blacktop can continue tracking your ride in the background so distance and speed stay accurate even when the app is minimised.</string>

<!-- Microphone — convoy voice chat (WebRTC, peer-to-peer) -->
<key>NSMicrophoneUsageDescription</key>
<string>Blacktop uses the microphone for push-to-talk voice chat within your convoy. Audio is never recorded or stored.</string>

<!-- Camera — QR code scanning for convoy join and card collection -->
<key>NSCameraUsageDescription</key>
<string>Blacktop uses the camera to scan QR codes when joining a convoy or collecting another rider's card.</string>

<!-- Motion — lean angle visualisation and crash detection -->
<key>NSMotionUsageDescription</key>
<string>Blacktop uses motion sensors to measure lean angle during rides and to detect a potential crash so it can alert your emergency contact.</string>

<!-- Photo library — attaching photos to ride history entries -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Blacktop can attach a photo from your library to a ride entry in your history. Photos are stored locally on your device.</string>

<!-- Background modes — keep GPS running while minimised -->
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
    <string>fetch</string>
    <string>audio</string>
</array>

<!-- Disable zoom / bounce scroll so the app feels native -->
<key>UIWebViewBounce</key>
<false/>
<key>KeyboardDisplayRequiresUserAction</key>
<false/>
```

---

## Xcode project settings

| Setting | Value |
|---|---|
| Bundle Identifier | `com.blacktoplive.app` |
| Display Name | `Blacktop` |
| Deployment Target | iOS 14.0+ |
| Device | iPhone + iPad |
| Signing Team | Your Apple Developer team |

---

## App Store submission checklist

- [ ] Add app icon set (1024×1024 PNG, no alpha) in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [ ] Add launch screen / splash in Xcode (or use Capacitor's splash screen plugin)
- [ ] Enable **Background Modes** capability in Xcode: Location updates, Background fetch, Audio
- [ ] Enable **Push Notifications** capability if local crash alerts are added
- [ ] Set correct signing certificate and provisioning profile
- [ ] Archive → Distribute via TestFlight before submitting to review
