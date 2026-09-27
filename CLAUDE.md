# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Blacktop" (repo name `convoy-comms`) is a ride companion app for motorcycles, cars, bicycles, e-bikes and e-scooters: ride tracking and stats, GPS-synced convoys, in-ride voice chat, crash/rescue detection, an in-app map with turn-by-turn, a vehicle garage and logbook, plus opt-in community features (Blacktop World, crews, cards, arcade). Onboarding personalises the whole app to the rider (see "Personalisation" below). It's a Vite + React + TypeScript SPA wrapped with Capacitor for iOS/Android, backed by Supabase (Postgres, Auth, Realtime, Edge Functions). The project originates from and is synced with Lovable (`lovable-tagger` dev plugin, `.lovable/` folder) — changes pushed here also flow back into the Lovable project.

## Commands

```sh
npm run dev        # Vite dev server on port 8080
npm run build      # production build
npm run build:dev  # build in development mode (used for preview/debug builds)
npm run preview    # preview a production build
npm run lint        # eslint .
```

There is no test suite and no `tsc --noEmit`-style typecheck script configured — `npm run lint` and `npm run build` are the main correctness checks. TypeScript is configured non-strict (`strictNullChecks`, `noImplicitAny`, `noUnusedLocals` etc. are off in `tsconfig.json`), so don't assume strict-null guarantees.

Mobile shells (Capacitor) are not built/run from this repo's npm scripts; `capacitor.config.ts` points the native shells at the deployed web app (`https://convoy-comms.lovable.app`), not a local dev server.

Supabase Edge Functions live in `supabase/functions/*` and are deployed via the Supabase CLI, not via npm scripts. Every function has an entry in `supabase/config.toml`; all use `verify_jwt = true` except `send-push` (called by the database; rider actions check the session in code). Add a config entry when you add a function.

## Environment

Vite env vars required at build time (see local `.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. The Supabase client is auto-generated at `src/integrations/supabase/client.ts` — treat it and `src/integrations/supabase/types.ts` as generated (regenerated from the Supabase schema), not hand-edited.

## Architecture

### Feature-based organization

Code is split between generic `src/components`, `src/hooks`, `src/lib`, `src/pages` and domain features under `src/features/<feature>/`, each with its own `components/`, `hooks/`, `lib/`, `types.ts`, and a barrel `index.ts` that defines the feature's public surface. Other features and pages should import from a feature's `index.ts`, not reach into its internals. Current features: `convoy`, `ride`, `voice`, `rescue`, `waypoints`, `garage`, `cards`, `profile`, `settings`, `permissions`, `proximity`, `pillion`, `logbook`, `track`, `notifications`, `speedshop`, `map`, `crew`, `blacktank`, `arcade`, `radio`, `experience`, `tips`, `integrations/discord`.

`src/pages/*` are route-level screens composed from features; routing lives in `src/App.tsx`.

### Global client state via module-level stores, not Context

Cross-cutting state (e.g. convoy state in `src/features/convoy/hooks/useConvoyState.ts`) is implemented as a module-level singleton object + `Set` of listener callbacks, exposed to components through `useSyncExternalStore`. This is the established pattern for shared state in this codebase — prefer it over introducing new React Context providers or a state library. Profile/settings (`useProfile`, `useSettings`) follow the same pattern and are read at the top of `App.tsx` to gate routing (onboarding vs. main app) and to initialize the accent color.

Server data fetching/caching uses `@tanstack/react-query` (`QueryClient` set up in `App.tsx`).

### Realtime: Supabase Postgres + Realtime channels, WebRTC for voice

- Convoy membership/destination/waypoints are rows in Postgres (`convoys`, `convoy_members`, ...) read/written via `supabase.from(...)`, with the active convoy id cached in `localStorage` (`blacktop_active_convoy_id`) so a reload can restore session state.
- Ephemeral, low-latency events (rescue pings, lobby chat, live stats) go over `supabase.channel(...)` broadcast channels scoped per convoy (e.g. `rescue-${convoyId}`), not the database.
- Voice chat (`src/features/voice/hooks/useVoiceChannel.ts`) is WebRTC, using a Supabase Realtime channel purely as the signaling transport. ICE servers come from `voice/lib/iceServers.ts`: public STUN plus short-lived TURN credentials from the `turn-credentials` Edge Function (Cloudflare Realtime TURN; secrets `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`). Without TURN, riders on mobile data usually can't hear each other, so the app warns once when no relay is available. Speaking indicators are broadcast over Realtime and prove nothing about the audio path; `peerLinks` in the hook tracks real per-peer audio links and the ride member list shows "No audio link" when one is down. iOS/Safari needs special handling: audio must be "unlocked" via a user gesture (`unlockIOSAudio`) before `AudioContext`/playback will work, and audio constraints differ (no fixed `sampleRate`). Android routes to Bluetooth headsets/intercoms through the native `NativeAudioRoutePlugin` (`voice/lib/nativeAudioRoute.ts`). Voice-recording consent (mixing convoy voice into a rider's overlay video) requires both `voiceRecordingEnabled` and `rideOverlayEnabled`.

### Map and routing

`src/features/map` is the in-app map (MapLibre, `BlacktopMap` / `BlacktopMapOverlay`): place search, multi-stop routes, a direct-vs-twisty route choice (`RouteOptions`), a round-trip loop generator with Twisty/Scenic/Relaxed styles (`LoopPlannerPanel`), offline map packs (`OfflinePacksPanel`, `tileCache`), a rain radar overlay, a weather detour offer (`weatherRoute`), speed cameras and POIs. All routing, search and Overpass calls go through the `place-search` Edge Function (`kind`: `route`, `twisty`, `loop`, `search`, `reverse`, `cameras`, `overpass`), which proxies OSRM, Nominatim-style search and Overpass; the client only ever sends coordinates. Solo routes live in the `soloRoute` store; convoy routes come from convoy waypoints.

Adding sources/layers: use `lib/whenStyleReady.ts`, never `isStyleLoaded()` + `map.once('load')`. `isStyleLoaded()` is false whenever tiles are loading (constantly mid-ride) and `load` fires only once, so layers added later never drew.

Turn-by-turn: `BlacktopMap` asks for the route with `steps: true` (OSRM manoeuvres per leg) once from the rider's position, then only re-plans when the stops change, the rider is off the line (`useTurnByTurn`: >45 m for 4 s, at most every 12 s) or a request failed. Don't reintroduce polling: the router is the public OSRM demo server behind a 60 req/min per-rider limit. `lib/navigation.ts` places manoeuvres on the line, matches GPS fixes to it (windowed so loops don't jump to the finish) and writes the instructions; `lib/speech.ts` speaks them (Web Speech, unlocked on the first tap for iOS) when the `navVoiceEnabled` setting is on, and `src/lib/audioDuck.ts` lowers voice chat and Blacktop Radio while it talks. `TurnBanner` takes the search bar's slot at the top of the map while guiding (for any guided route; it shows "Follow the route" when the router returned no manoeuvres), stays up regardless of the voice setting, and replaces the bottom destination card (destination, time/distance left, ETA, leader Skip). Its X ends a solo route, or just this rider's directions in a convoy; the destination card's Go button starts guidance before moving. Passed solo stops and weather detours drop off the plan; a convoy leader reaching the current waypoint completes it. `useNavigation.openNavigation` (Google/Apple/Waze hand-off) exists but nothing calls it; the preferred-nav-app setting only decides whether the Blacktop map toggles show in Settings.

### Ride tracking domain model

Core ride/convoy types live in `src/types/blacktop.ts` (`RideSession`, `GpsPoint`, `LeanSample`, `ActiveRideState`, `RideStats`, badges) and `src/types/convoy.ts` (`ConvoyState`, `ConvoyMemberInfo`, waypoints, `calculateBadges`). A `RideSession` accumulates GPS points and (optionally) 10Hz lean-angle samples for crash detection and lean-angle visualization; convoy badges (Speed Demon, Journeyman, Lean Fiend, G-Lock, Corner Carver, Fallback) are computed client-side from member stats via `calculateBadges`; solo threshold badges (Night Owl, Hard Ass, Always Out) come from `soloBadgesForRide`. Both are banked in the badge wallet (`ride/lib/badgeWallet.ts`). The receipt reports convoy badges after `endRide()` has reset ride state, so `ActiveRide` gates saving them on the captured `finalMembers`, not `rideState.isConvoyMode`. Badge display is filtered by the rider's setup (`experience/lib/badges.ts`).

Crash/rescue flow: `useCrashDetection` (ride feature) watches device motion + speed to detect a crash, surfaces a confirmation prompt, and on confirmation/timeout calls into `useRescue` (rescue feature). `rescue_request` goes over the convoy's realtime channel to every member (membership checked server-side before it's shown): everyone gets the `RescueAlert` card and a burn-coloured rescue route on the map (`rescueBridge` → `BlacktopMap`). Any member can answer with "I'm on my way" (`rescue_responding`), which names them to the rider in distress (persistent banner on the ride screen) and to the convoy; the leader's "Add Waypoint" sends `rescue_acknowledged`. Rescue also notifies Discord (`discord-announce-*` Edge Functions) and push (`send-push` `{action:'rescue'}`).

### Push notifications

`src/features/notifications` + `public/push-sw.js` + the `send-push` Edge Function (Web Push, VAPID; needs the `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` secrets; `verify_jwt = false` because the database calls it, rider actions check the session in code). The worker only handles push and notification taps (no caching; the old app-shell worker in `public/sw.js` stays retired).

- Devices live in `push_subscriptions` (per-kind `categories`, `crew_code`, weather location rounded to 0.1°) via the `register_push_subscription` / `unregister_push_subscription` RPCs; the app re-registers on launch, crew change, switch change and after rides.
- Database events are queued into `push_outbox` by triggers (card attempts/pickups, Blacktank, crew scores, weekly scores, crew convoys); `pg_net` calls `send-push {action:'drain'}` straight away, and the app also nudges it after those actions as a fallback. `pg_cron` calls `{action:'tick'}` every 30 min for weather (Open-Meteo), dated reminders (`push_reminders`, used for time-based maintenance), weekly/monthly crew results and the 5-days-left reminder. `push_sent` de-duplicates.
- Rescue calls go straight to `{action:'rescue'}` (convoy + crew).
- All notification text is written in `send-push/events.ts`, never taken from a caller. `send-push/crew.ts` mirrors `src/features/crew/challenges.ts`; keep them in sync.
- Mileage-based maintenance is checked on the phone (`MaintenanceNotifier`) and shown as a local notification.

### Personalisation (`src/features/experience`)

Onboarding (`pages/Onboarding.tsx`: welcome → consent → setup flow → name) and `/setup` (redo from Settings) run `SetupFlow`: vehicles (multi-select, first is the main one), ride mode (solo / group / both), ride style, then a swipeable "Do you care about…" deck (`CareDeck`), then a live preview.

- Vehicles, ride mode and style live in the experience store (`lib/profile.ts`, `blacktop-experience` in localStorage, module-level store). `useExperience()` derives `terms` (ride/drive wording), `VehicleIcon`, `canLean`, `motorised`, `showSolo`/`showGroup`. Vehicles also seed settings (speed-alert and lean thresholds, car display, cameras off for non-motorised) via `vehiclesPatch`.
- The care answers are not stored separately: each question (`lib/questions.ts`) owns `AppSettings` feature flags (`speedFocusEnabled`, `garageEnabled`, `collectiblesEnabled`, `blacktopWorldEnabled`, lean/G, weather, overlay/flyover, radio, auto-rescue) and counts as "yes" when any of them is on. Settings → Your Blacktop edits the same flags.
- Screens read these to change shape: Home tiles, stats and nav, the active ride's hero number (speed vs distance), receipts and share cards, Stats, History, badges, garage presets and mechanic lines, map quick searches (`lib/places.ts`). New UI should respect them: don't show speed without `speedFocusEnabled`, lean without `canLean && leanAngleEnabled`, garage/vehicle content without `garageEnabled`, badges/cards without `collectiblesEnabled`, and use `terms` for ride/drive wording.
- Existing users without a stored profile default to the full app (motorcycle, both modes, everything on).

### Native device integration

Capacitor plugins (`@capacitor/geolocation`, `@capacitor/filesystem`) and browser device APIs are wrapped in small hooks rather than called ad hoc: `useWakeLock` (re-takes the lock after the browser drops it, until released; held by the ride, pillion, lobby and solo lobby screens and by the map overlay during a ride or from a lobby), `useOrientationLock`, `useLeanAngle` (device orientation → lean angle), `useBackgroundAudio`, `usePictureInPicture`, `useLiveOverlayRecorder` (records a live ride overlay video, with `convertToMp4`/ffmpeg.wasm for conversion). New native-device features should follow this hook-wrapper pattern.

### UI layer

shadcn/ui components (generated into `src/components/ui`, configured via `components.json`) plus Tailwind (`tailwind.config.ts`, near-black neutral palette in `src/index.css`). Path alias `@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative `../../` imports.

- Backdrop: `components/AppBackdrop.tsx` is mounted once in `App.tsx` behind every screen: slow "lava" accent blobs, a tightly packed `BLACKTOP` wordmark in the background colour (only the blobs' light reveals it) seen through an SVG fish-eye displacement lens larger than the viewport, and a mist layer. Blobs pause during an active ride and while the map is open. Page roots must not paint an opaque background.
- Frost: any `bg-card*` surface is frosted automatically (a global rule in `index.css`; opt out with `.no-frost`). Overlays (dialogs, sheets, menus, selects, tooltips, toasts), outline/secondary buttons and header buttons use `.frost-accent` (frost + thin accent border + accent icons). Primary CTAs stay solid.
- Screens use `components/PageHeader` (`PageHeader`, `HeaderButton`) for their header. Settings sections are `settings/components/CollapsibleSection` tiles in a two-column grid; pass `index` so an opened section drops down full width under its row (tiles never move, no half-empty rows).
- Numbers use `.font-mono`, which is Inter with tabular figures (not a monospace stack). Page transitions, `.pressable`, `.stagger-in` and skeletons (`components/skeletons.tsx`) are the shared motion primitives; all respect `prefers-reduced-motion`.
- Burn UI uses the fixed `--burn` colour, never the accent.
