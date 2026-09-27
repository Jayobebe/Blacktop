# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Blacktop" (repo name `convoy-comms`) is a motorcycle group-ride coordination app: GPS-synced convoy tracking, in-ride voice chat, crash/rescue detection, ride stats, and a vehicle "garage". It's a Vite + React + TypeScript SPA wrapped with Capacitor for iOS/Android, backed by Supabase (Postgres, Auth, Realtime, Edge Functions). The project originates from and is synced with Lovable (`lovable-tagger` dev plugin, `.lovable/` folder) — changes pushed here also flow back into the Lovable project.

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

Supabase Edge Functions live in `supabase/functions/*` and are deployed via the Supabase CLI, not via npm scripts. `supabase/config.toml` only configures `create-tip` to require JWT verification.

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
- Voice chat (`src/features/voice/hooks/useVoiceChannel.ts`) is peer-to-peer WebRTC (`RTCPeerConnection` with public STUN servers), using a Supabase Realtime channel purely as the signaling transport. iOS/Safari needs special handling: audio must be "unlocked" via a user gesture (`unlockIOSAudio`) before `AudioContext`/playback will work, and audio constraints differ (no fixed `sampleRate`).

### Map and routing

`src/features/map` is the in-app map (MapLibre, `BlacktopMap` / `BlacktopMapOverlay`): place search, multi-stop routes, a direct-vs-twisty route choice (`RouteOptions`), a round-trip loop generator with Twisty/Scenic/Relaxed styles (`LoopPlannerPanel`), offline map packs (`OfflinePacksPanel`, `tileCache`), a rain radar overlay, a weather detour offer (`weatherRoute`), speed cameras and POIs. All routing, search and Overpass calls go through the `place-search` Edge Function (`kind`: `route`, `twisty`, `loop`, `search`, `reverse`, `cameras`, `overpass`), which proxies OSRM, Nominatim-style search and Overpass; the client only ever sends coordinates. Solo routes live in the `soloRoute` store; convoy routes come from convoy waypoints.

Turn-by-turn: `BlacktopMap` asks for the route with `steps: true` (OSRM manoeuvres per leg) once from the rider's position, then only re-plans when the stops change, the rider is off the line (`useTurnByTurn`: >45 m for 4 s, at most every 12 s) or a request failed. Don't reintroduce polling: the router is the public OSRM demo server behind a 60 req/min per-rider limit. `lib/navigation.ts` places manoeuvres on the line, matches GPS fixes to it (windowed so loops don't jump to the finish) and writes the instructions; `lib/speech.ts` speaks them (Web Speech, unlocked on the first tap for iOS) when the `navVoiceEnabled` setting is on, and `src/lib/audioDuck.ts` lowers voice chat and Blacktop Radio while it talks. `TurnBanner` takes the search bar's slot at the top of the map while guiding and stays up regardless of the voice setting. Passed solo stops and weather detours drop off the plan; a convoy leader reaching the current waypoint completes it. `useNavigation.openNavigation` (Google/Apple/Waze hand-off) exists but nothing calls it; the preferred-nav-app setting only decides whether the Blacktop map toggles show in Settings.

### Ride tracking domain model

Core ride/convoy types live in `src/types/blacktop.ts` (`RideSession`, `GpsPoint`, `LeanSample`, `ActiveRideState`, `RideStats`, badges) and `src/types/convoy.ts` (`ConvoyState`, `ConvoyMemberInfo`, waypoints, `calculateBadges`). A `RideSession` accumulates GPS points and (optionally) 10Hz lean-angle samples for crash detection and lean-angle visualization; convoy-only "badges" (Speed Demon / Journeyman / Fallback) are computed client-side from member stats via `calculateBadges`.

Crash/rescue flow: `useCrashDetection` (ride feature) watches device motion + speed to detect a crash, surfaces a confirmation prompt, and on confirmation/timeout calls into `useRescue` (rescue feature), which broadcasts a `rescue_request` over the convoy's realtime channel to the leader and can also notify a Discord webhook via `src/features/integrations/discord` and the `discord-announce-*` Supabase Edge Functions.

### Push notifications

`src/features/notifications` + `public/push-sw.js` + the `send-push` Edge Function (Web Push, VAPID; needs the `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` secrets; `verify_jwt = false` because the database calls it, rider actions check the session in code). The worker only handles push and notification taps (no caching; the old app-shell worker in `public/sw.js` stays retired).

- Devices live in `push_subscriptions` (per-kind `categories`, `crew_code`, weather location rounded to 0.1°) via the `register_push_subscription` / `unregister_push_subscription` RPCs; the app re-registers on launch, crew change, switch change and after rides.
- Database events are queued into `push_outbox` by triggers (card attempts/pickups, Blacktank, crew scores, weekly scores, crew convoys); `pg_net` calls `send-push {action:'drain'}` straight away, and the app also nudges it after those actions as a fallback. `pg_cron` calls `{action:'tick'}` every 30 min for weather (Open-Meteo), dated reminders (`push_reminders`, used for time-based maintenance), weekly/monthly crew results and the 5-days-left reminder. `push_sent` de-duplicates.
- Rescue calls go straight to `{action:'rescue'}` (convoy + crew).
- All notification text is written in `send-push/events.ts`, never taken from a caller. `send-push/crew.ts` mirrors `src/features/crew/challenges.ts`; keep them in sync.
- Mileage-based maintenance is checked on the phone (`MaintenanceNotifier`) and shown as a local notification.

### Native device integration

Capacitor plugins (`@capacitor/geolocation`, `@capacitor/filesystem`) and browser device APIs are wrapped in small hooks rather than called ad hoc: `useWakeLock`, `useOrientationLock`, `useLeanAngle` (device orientation → lean angle), `useBackgroundAudio`, `usePictureInPicture`, `useLiveOverlayRecorder` (records a live ride overlay video, with `convertToMp4`/ffmpeg.wasm for conversion). New native-device features should follow this hook-wrapper pattern.

### UI layer

shadcn/ui components (generated into `src/components/ui`, configured via `components.json`) plus Tailwind (`tailwind.config.ts`, dark-themed: app background `#0a0a0a`). Path alias `@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative `../../` imports.
