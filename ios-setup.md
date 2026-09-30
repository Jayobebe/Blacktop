# iOS app

The Xcode project lives in `ios/` (Capacitor 8, Swift Package Manager: no CocoaPods).
Like the Android app, the native shell loads the deployed site (`server.url` in
`capacitor.config.ts`), so web changes reach phones without an App Store update; only
native changes (Swift, Info.plist, plugins) need a new build.

Already set up in the repo:

- `ios/App/App/Info.plist`: location (when in use and always), microphone, camera,
  motion and photo-library prompts, and background modes (location, fetch, audio).
- `ios/App/App/AlarmSoundPlugin.swift`: the anti-theft and auto-rescue sirens and chirps
  on the phone's own loudspeaker (the twin of `android/.../AlarmSoundPlugin.java`).
- `ios/App/App/MainViewController.swift`: registers the app's own plugins; it's the
  Bridge View Controller's class in `Main.storyboard`.
- Bundle id `com.blacktoplive.app`, iOS 15+, iPhone and iPad.

## Building (needs a Mac with Xcode 16 or later)

1. Clone the repo and install: `git clone …`, then `cd convoy-comms` and `npm install`.
2. `npm run build`, then `npm run cap:sync` (copies the web build and plugin list into `ios/`).
3. `npx cap open ios` opens `ios/App/App.xcodeproj` in Xcode. Wait for "Resolving
   package graph" to finish in the top bar (the first time downloads Capacitor).
4. Select the **App** target → **Signing & Capabilities**:
   - Team: your Apple Developer team (a free personal team works for your own phone).
   - "Automatically manage signing" on. If the bundle id is taken on a personal team,
     change it to something unique for testing, e.g. `com.yourname.blacktop`.
   - **+ Capability → Background Modes**, tick Location updates, Background fetch and
     Audio, AirPlay, and Picture in Picture (they're in Info.plist already; the
     capability makes Xcode show and sign them).
5. Plug in the iPhone, pick it as the run destination, press **Run** (⌘R). The first time,
   on the phone: Settings → General → VPN & Device Management → trust your developer
   profile, and Settings → Privacy & Security → Developer Mode on (then restart).

## Windows note

`npx cap sync` on Windows writes the Swift package's plugin paths with backslashes, which
Xcode can't read. Always use `npm run cap:sync` (it fixes them straight after).

## App Store

- App icon: a 1024×1024 PNG with no transparency in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.
- Product → Archive, then Distribute App → App Store Connect → TestFlight before review.
