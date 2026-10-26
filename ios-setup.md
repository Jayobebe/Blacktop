# iOS app

The Xcode project lives in `ios/` (Capacitor 8, Swift Package Manager: no CocoaPods).
`npm run cap:sync` points the shell at the deployed site (`server.url` in `capacitor.config.ts`),
for testing on a phone: web changes reach it without a new build. The store build
(`npm run cap:sync:store`, what the workflow builds) bundles the app's own files instead, so it
opens offline and changes only with a new upload.

Already set up in the repo:

- `ios/App/App/Info.plist`: location (when in use and always), microphone, camera,
  motion and photo-library prompts, and background modes (location, fetch, audio).
- `ios/App/App/AlarmSoundPlugin.swift`: the anti-theft and auto-rescue sirens and chirps
  on the phone's own loudspeaker (the twin of `android/.../AlarmSoundPlugin.java`).
- `ios/App/App/MainViewController.swift`: registers the app's own plugins; it's the
  Bridge View Controller's class in `Main.storyboard`.
- Bundle id `com.blacktoplive.app`, iOS 15+, iPhone and iPad.
- `ios/App/App/PrivacyInfo.xcprivacy`: the privacy manifest Apple requires (no tracking; the data
  that reaches Blacktop's server, by type). Keep it in step with the App Store Connect privacy
  answers and the Privacy Policy.
- `ios/App/App/App.entitlements`: push notifications (APNs) and universal links
  (`applinks:blacktoplive.com`). Automatic signing turns both on for the app id.
- `ITSAppUsesNonExemptEncryption` = false in Info.plist (only standard HTTPS), so uploads don't
  stop for export compliance.
- The version is What's new's newest (`scripts/app-version.mjs`), the build number the workflow's run number.

## Without a Mac

GitHub compiles the app on every change to the native projects (`.github/workflows/native.yml`, the "Native apps"
workflow under the repo's Actions tab; it can also be run by hand there). The iOS job builds for the simulator,
unsigned: it proves the project, the plugins and the Swift code compile. Its log is in the run's Artifacts.

### TestFlight from GitHub

The same workflow signs the app and uploads it to App Store Connect when it's run by hand with
**Upload to TestFlight** ticked. Signing is automatic through an App Store Connect API key, so no
certificates or profiles are kept anywhere. Once:

1. An Apple Developer Program membership (paid). Its team id is under Membership details.
2. App Store Connect → Apps → **+** → New App: iOS, name Blacktop, bundle id `com.blacktoplive.app`
   (register it under Certificates, Identifiers & Profiles → Identifiers first if it isn't offered),
   any SKU.
3. App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with
   the **Admin** role (Admin can create the signing certificate; App Manager can't). Download the
   `.p8` (only once), note the key id and the issuer id above the list.
4. GitHub → the repo → Settings → Secrets and variables → Actions, add:
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_P8_BASE64` (the `.p8` file base64:
   `certutil -encode AuthKey_XXXX.p8 out.txt` on Windows, then paste out.txt without its BEGIN / END lines).
5. Actions → Native apps → Run workflow → tick Upload to TestFlight → Run. The build shows in
   App Store Connect's TestFlight tab after Apple processes it (10 to 30 minutes).

Then: fill `APPLE_TEAM_ID` in `scripts/make-app-links.mjs` and run `npm run app-links`, so the site
serves `/.well-known/apple-app-site-association` and blacktoplive.com links open the app.
For push on iPhones, the `send-push` function needs the APNs secrets (`APNS_KEY_ID`, `APNS_TEAM_ID`,
`APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_SANDBOX`; an APNs key from Certificates, Identifiers &
Profiles → Keys). The TestFlight build registers for push either way.

## Building (needs a Mac with Xcode 16 or later)

1. Clone the repo and install: `git clone …`, then `cd convoy-comms` and `npm install`.
2. `npm run build`, then `npm run cap:sync` (copies the web build and plugin list into `ios/`).
3. `npx cap open ios` opens `ios/App/App.xcodeproj` in Xcode. Wait for "Resolving
   package graph" to finish in the top bar (the first time downloads Capacitor).
4. Select the **App** target → **Signing & Capabilities**:
   - Team: your Apple Developer team (a free personal team works for your own phone).
   - "Automatically manage signing" on. If the bundle id is taken on a personal team,
     change it to something unique for testing, e.g. `com.yourname.blacktop`.
   - **+ Capability → Background Modes**, tick Location updates and Audio, AirPlay,
     and Picture in Picture (they're in Info.plist already; the capability makes Xcode
     show and sign them). Push Notifications and Associated Domains come from
     `App.entitlements`.
5. Plug in the iPhone, pick it as the run destination, press **Run** (⌘R). The first time,
   on the phone: Settings → General → VPN & Device Management → trust your developer
   profile, and Settings → Privacy & Security → Developer Mode on (then restart).

## Windows note

`npx cap sync` on Windows writes the Swift package's plugin paths with backslashes, which
Xcode can't read. Always use `npm run cap:sync` (it fixes them straight after).

## App Store

- App icon: a 1024×1024 PNG with no transparency in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.
- Product → Archive, then Distribute App → App Store Connect → TestFlight before review
  (or the workflow's TestFlight upload above).
- App Review notes: say what the app does that a website can't (ride GPS with the screen locked,
  native speech, motion sensors for lean and crash check, the alarm on the loudspeaker), and why
  it runs in the background (location during a ride; audio for convoy voice chat and the radio).
