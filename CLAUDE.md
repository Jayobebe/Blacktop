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

Code is split between generic `src/components`, `src/hooks`, `src/lib`, `src/pages` and domain features under `src/features/<feature>/`, each with its own `components/`, `hooks/`, `lib/`, `types.ts`, and a barrel `index.ts` that defines the feature's public surface. Other features and pages should import from a feature's `index.ts`, not reach into its internals. Current features: `convoy`, `ride`, `voice`, `rescue`, `waypoints`, `garage`, `cards`, `profile`, `settings`, `permissions`, `proximity`, `pillion`, `logbook`, `track`, `notifications`, `speedshop`, `map`, `crew`, `blacktank`, `arcade`, `radio`, `experience`, `tips`, `hazards`, `integrations/discord`.

`src/pages/*` are route-level screens composed from features; routing lives in `src/App.tsx`. Home, onboarding, the lobbies, the ride and pillion screens load eagerly; every other screen (and the map overlay) is a `lazyPage()` that's prefetched once the app is idle, so it still opens offline. Keep heavy dependencies (MapLibre, ffmpeg) out of anything the eager screens import: a barrel that re-exports a heavy component drags it into the first load, which is why the Track Pack screens live in `@/features/track/views`, not `@/features/track`.

### Global client state via module-level stores, not Context

Cross-cutting state (e.g. convoy state in `src/features/convoy/hooks/useConvoyState.ts`) is implemented as a module-level singleton object + `Set` of listener callbacks, exposed to components through `useSyncExternalStore`. This is the established pattern for shared state in this codebase — prefer it over introducing new React Context providers or a state library. Profile/settings (`useProfile`, `useSettings`) follow the same pattern and are read at the top of `App.tsx` to gate routing (onboarding vs. main app) and to initialize the accent color.

Server data fetching/caching uses `@tanstack/react-query` (`QueryClient` set up in `App.tsx`).

### Realtime: Supabase Postgres + Realtime channels, WebRTC for voice

- Convoy membership/destination/waypoints are rows in Postgres (`convoys`, `convoy_members`, ...) read/written via `supabase.from(...)`, with the active convoy id cached in `localStorage` (`blacktop_active_convoy_id`) so a reload can restore session state.
- Ephemeral, low-latency events (rescue pings, lobby chat, live stats) go over `supabase.channel(...)` broadcast channels scoped per convoy (e.g. `rescue-${convoyId}`), not the database.
- Voice chat (`src/features/voice/hooks/useVoiceChannel.ts`) is WebRTC, using a Supabase Realtime channel purely as the signaling transport. ICE servers come from `voice/lib/iceServers.ts`: public STUN plus short-lived TURN credentials from the `turn-credentials` Edge Function (Cloudflare Realtime TURN; secrets `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`). Without TURN, riders on mobile data usually can't hear each other, so the app warns once when no relay is available. Speaking indicators are broadcast over Realtime and prove nothing about the audio path; `peerLinks` in the hook tracks real per-peer audio links and the ride member list shows "No audio link" when one is down. iOS/Safari needs special handling: audio must be "unlocked" via a user gesture (`unlockIOSAudio`) before `AudioContext`/playback will work, and audio constraints differ (no fixed `sampleRate`). Android routes to Bluetooth headsets/intercoms through the native `NativeAudioRoutePlugin` (`voice/lib/nativeAudioRoute.ts`). Voice-recording consent (mixing convoy voice into a rider's overlay video) requires both `voiceRecordingEnabled` and `rideOverlayEnabled`.

### Map and routing

`src/features/map` is the in-app map (MapLibre, `BlacktopMap` / `BlacktopMapOverlay`): place search, multi-stop routes, a direct-vs-twisty route choice (`RouteOptions`), a round-trip loop generator with Twisty/Scenic/Relaxed styles (`LoopPlannerPanel`), offline map packs (`OfflinePacksPanel`, `tileCache`), a rain radar overlay, a weather detour offer (`weatherRoute`), speed cameras and POIs. All routing, search and Overpass calls go through the `place-search` Edge Function (`kind`: `route`, `twisty`, `loop`, `search`, `reverse`, `cameras`, `overpass`, `roads`), which proxies OSRM, Nominatim-style search and Overpass; the client only ever sends coordinates. Solo routes live in the `soloRoute` store; convoy routes come from convoy waypoints.

The dark basemap is OpenFreeMap's with the contrast lifted (`lib/basemapContrast.ts`); load it through `loadDarkMapStyle()` (`lib/darkStyle.ts`) in any map with the real-world dark look (the Blacktop map, ride flyovers) so they match. The map opens at the rider's last known position (`lib/lastView.ts`), not London. Water is drawn as the backdrop's BLACKTOP wordmark in a faint accent tint (`lib/waterWordmark.ts`, a static `fill-pattern`). Pins (`lib/mapPins.ts`): nearby places come straight from the basemap tiles' `poi` layer (no requests; fewer when zoomed out, by the tiles' rank), plus saved places and recent destinations; category colour + the style's icon recoloured white; hidden while the rider is moving. Tapping one orbits the camera round it (GPS follow holds off via `orbitingRef`) with Back / Navigate. Phones in landscape use the `short:` Tailwind screen (`tailwind.config.ts`): narrow search, chips only while searching, no zoom buttons, bottom cards and the speed card in a left-hand column. MapLibre's own geolocate dot is off (Blacktop draws the rider marker) and the compass doesn't visualise pitch. The map overlay reports `ready` after its first full draw (or 6 s): until then the app backdrop is the loading screen.

MapLibre is v6 (ESM only): `import * as maplibregl from 'maplibre-gl'` (no default export), and any file that creates a map also imports `@/lib/maplibreWorker`, which points MapLibre at the worker Vite builds (without it the map stays blank in production). Missing style images are supplied with `map.setMissingStyleImageResolver`; the `styleimagemissing` event can't add them any more.

Adding sources/layers: use `lib/whenStyleReady.ts`, never `isStyleLoaded()` + `map.once('load')`. `isStyleLoaded()` is false whenever tiles are loading (constantly mid-ride) and `load` fires only once, so layers added later never drew.

Turn-by-turn: `BlacktopMap` asks for the route with `steps: true` (OSRM manoeuvres per leg) once from the rider's position, then only re-plans when the stops change, the rider is off the line (`useTurnByTurn`: >45 m for 4 s, at most every 12 s) or a request failed. Don't reintroduce polling: the router is the public OSRM demo server behind a 60 req/min per-rider limit. `lib/navigation.ts` places manoeuvres on the line, matches GPS fixes to it (windowed so loops don't jump to the finish) and writes the instructions; `lib/speech.ts` speaks them (Web Speech, unlocked on the first tap for iOS) when the `navVoiceEnabled` setting is on, and `src/lib/audioDuck.ts` lowers voice chat and Blacktop Radio while it talks. `TurnBanner` takes the search bar's slot at the top of the map while guiding (for any guided route; it shows "Follow the route" when the router returned no manoeuvres), stays up regardless of the voice setting, and replaces the bottom destination card (destination, time/distance left, ETA, leader Skip). Its X ends a solo route, or just this rider's directions in a convoy; the destination card's Go button starts guidance before moving. Passed solo stops and weather detours drop off the plan; a convoy leader reaching the current waypoint completes it. `useNavigation.openNavigation` (Google/Apple/Waze hand-off) exists but nothing calls it; the preferred-nav-app setting only decides whether the Blacktop map toggles show in Settings.

### Track Pack builder (`src/features/track`)

Tracks (`TrackDef`: start/finish gate, sector split gates in running order, `outline` = the lap starting at the start/finish) are built two ways, both ending in `ChaseCamPlacer`:

- Map: `RoadPicker` frames the circuit with a box, `place-search {kind:'roads'}` returns the OSM roads inside it (cut at the box edge, with node ids), and `lib/roadLoop.ts` splits them at junctions, trims dead ends and offers every distinct lap (`lapOptions`, e.g. a circuit's GP and Indy layouts). On a circuit (`highway=raceway`) only the race track is kept up front, minus pit lanes. The rider taps roads to drop/restore them and can reverse the direction.
- GPS: `startWalk` records until `LoopCloser` (`lib/walker.ts`) sees the trail come back onto itself heading the same way (so hairpins and figure-of-eight crossovers don't count), or the rider finishes by hand; the smoothed lap is `walkLoop`.
- Library: `npm run tracks:build` (scripts/build-circuit-library.ts) turns every OpenStreetMap circuit relation (`type=circuit`, one per layout) into a lap through the same `roadLoop` code and writes static files to `public/circuits/` (`index.json` + `<relation id>.json`), so search (`TrackSearch`, `lib/circuitLibrary.ts`) is instant and offline and nothing hits Overpass at runtime. Direction comes from how the ways are drawn; start/finish and sectors are never imported (the only open sector data, lovely-track-data, is non-commercial): the racer places them in the chase cam. The files are ODbL: keep the "© OpenStreetMap contributors" credit and keep them openly available. The script caches Overpass answers in `node_modules/.cache/circuit-library` and resumes; `-- --fresh` re-downloads.
- `ChaseCamPlacer` runs a camera round the lap (chase / bird's-eye / whole lap; play, pause, rewind, speed, scrub, reverse direction). Markers are distances along `lib/centerline.ts`'s `Centerline`, so gates are always on the lap and square to it; sectors fill themselves in from start/finish round to start/finish. `TrackEditor` routes between them and re-opens saved tracks on their outline.
- Track Pack home (`RacerView`): search, the two builder buttons, the selected track (sent to the pit crew as soon as it's picked, `selectTrack`) with Ready up (arms timing; the launch starts it), then three horizontally scrolling shelves: Previous (by `lastUsedAt`/sessions), Custom (built by the racer) and Favourite (starred). Pit board calls and rider calls are spoken as well as shown (`lib/pitCalls.ts`, via the map's `speak`, which ducks voice chat and radio).

### Battery

The screen stays on for a whole ride, so anything that runs per frame, per sensor event or per GPS fix is multiplied by hours. Rules that keep a ride cheap:

- Ride state (`useActiveRide`) is saved at most every 10 s, straight away on start/pause/resume/end and when the app goes to the background; lean/G-force samples are stored packed and appended in place. Never go back to serialising the whole ride on every change.
- Sensors: `useLeanAngle(active, displayIntervalMs)` and `useGForce(active, { display, displayIntervalMs, onSample })` sample at full rate but only re-render at the display interval, and G-force not at all unless the gauge is shown; crash detection is fed through `onSample` and runs its stop-window check on its own timer.
- The live overlay recorder (1080p canvas + MediaRecorder) only runs when `rideOverlayEnabled` is on, and draws at 30 fps.
- The ride screens' backdrop has no lens (see UI layer).
- The map overlay stays mounted after its first open: `BlacktopMap` only watches GPS while visible or guiding, does no camera work while hidden, and skips the follow animation when the rider hasn't moved or turned.

### Ride tracking domain model

Core ride/convoy types live in `src/types/blacktop.ts` (`RideSession`, `GpsPoint`, `LeanSample`, `ActiveRideState`, `RideStats`, badges) and `src/types/convoy.ts` (`ConvoyState`, `ConvoyMemberInfo`, waypoints, `calculateBadges`). A `RideSession` accumulates GPS points and (optionally) 10Hz lean-angle samples for crash detection and lean-angle visualization; convoy badges (Speed Demon, Journeyman, Lean Fiend, G-Lock, Corner Carver, Fallback) are computed client-side from member stats via `calculateBadges`; solo threshold badges (Night Owl, Hard Ass, Always Out) come from `soloBadgesForRide`. Both are banked in the badge wallet (`ride/lib/badgeWallet.ts`). The receipt reports convoy badges after `endRide()` has reset ride state, so `ActiveRide` gates saving them on the captured `finalMembers`, not `rideState.isConvoyMode`. Badge display is filtered by the rider's setup (`experience/lib/badges.ts`).

Crash/rescue flow: `useCrashDetection` (ride feature) watches device motion + speed to detect a crash, surfaces a confirmation prompt, and on confirmation/timeout calls into `useRescue` (rescue feature). `rescue_request` goes over the convoy's realtime channel to every member (membership checked server-side before it's shown): everyone gets the `RescueAlert` card and a burn-coloured rescue route on the map (`rescueBridge` → `BlacktopMap`). Any member can answer with "I'm on my way" (`rescue_responding`), which names them to the rider in distress (persistent banner on the ride screen) and to the convoy; the leader's "Add Waypoint" sends `rescue_acknowledged`. Rescue also notifies Discord (`discord-announce-*` Edge Functions) and push (`send-push` `{action:'rescue'}`). Who a call reaches is the rider's choice (Settings → Safety: convoy, crew, Discord, riders nearby within 5–50 km); every send path goes through `rescue/lib/reach.ts` (`rescueReach(settings)`). "Riders nearby" reaches devices that opted in to the `rescue_nearby` push category, which keeps their position rounded to 0.1° like weather alerts (`register_push_subscription`, migration `20261001100000_rescue_nearby.sql`).

### Hazard reports (`src/features/hazards`)

Waze-style: the Report button (bottom-left on the map, above the speed card in landscape) opens a two-step picker (category → hazard; 17 types in `types.ts`, lifetimes mirrored in `public.hazard_ttl()`). "Hi-vis" is the police report and is never called police. Reports are anonymous: `hazards` / `hazard_votes` have RLS on and no policies, everything goes through `hazards_in_bbox` / `report_hazard` (rate-limited, merges the same kind within 50 m) / `vote_hazard` / `remove_my_hazard` (migration `20261001090000_hazards.sql`; an hourly `pg_cron` job drops expired rows). `HazardAlerts` (mounted once in `App.tsx`) runs on ride GPS (`subscribeRawFixes`) or the map's GPS (`pushHazardFix`): a report ahead within ~20 s shows a banner (in the map's search-bar slot when the map is open) and is spoken if `hazardVoiceEnabled`; after passing it asks "Still there?". A `hazards:live` broadcast (position only) nudges other riders to refetch.

### Burn

Burn must remove everything. Server: `burn-account` deletes the auth user (every user column in the schema cascades from `auth.users`; new tables must too), plus what doesn't cascade: card photos in storage (`card-photos/<uid>/`) and `edge_rate_limits`. Device: the feature burns in Settings, then `lib/burnLocal.ts` sweeps every `blacktop*` / `bt.` key and the app's IndexedDB databases (keep new storage keys on those prefixes), and the app reloads under full flame cover so in-memory stores start empty; `BurnReveal` finishes the animation (`components/BurnFlameOverlay.tsx`, DuckDuckGo-style rising fire).

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

### Translations (`src/lib/i18n`)

18 languages (English + `LANGUAGES` in `lib/i18n/index.ts`); the picker is on the BT logo in Settings. The English text is the key: `tr("Join Convoy")`, with `{0}`, `{1}` filled from params (`tr("{0} rides", [n])`). Dictionaries are `lib/i18n/locales/<code>.json`, loaded before the app is imported (so module-level data can call `tr()`), each its own lazy chunk; a missing entry falls back to English. Changing language saves `blacktop_language` and reloads.

- Every user-facing string goes through `tr()`, including toasts, aria labels, errors, spoken prompts (`map/lib/navigation.ts`, `lib/speech.ts` picks a voice for the app language) and module-level copy. Never wrap classNames, colours, ids or anything sent over the network: pit board presets travel as English ids and are shown/said per phone (`track/lib/pitCalls.ts` `pitLabel`).
- Whole sentences, never fragments: no `tr("Start your")` + word, no English `'s'`/`'rider' : 'riders'` suffixes; use one key per case (`tr("1 rider")` / `tr("{0} riders", [n])`). `terms` (ride/drive, rider, vehicle nouns) are translated nouns; where ride/drive is a verb, pick between two whole sentences on `terms.car`. `lowerName()` lower-cases a name mid-sentence (not in German).
- Keep product and badge names in English (Blacktop, Blacktank, Speed Demon…), except Track Pack, which has a local name per language (keep it consistent in every string that mentions it); "Hi-vis" is never translated as police.
- Workflow: `npm run i18n:check` re-extracts `scripts/i18n/keys.json` and lists what each language is missing (`--missing de` as JSON). Translation work files are `<dir>/<lang>/*.txt` lines `N<TAB>text` (N = index in keys.json) merged with `node scripts/i18n/merge.mjs <dir>`, which rejects lines whose placeholders don't match. Re-extracting shifts the indices, so merge before changing code.

### Native device integration

Capacitor plugins (`@capacitor/geolocation`, `@capacitor/filesystem`) and browser device APIs are wrapped in small hooks rather than called ad hoc: `useWakeLock` (re-takes the lock after the browser drops it, until released; held by the ride, pillion, lobby and solo lobby screens and by the map overlay during a ride or from a lobby), `useOrientationLock`, `useLeanAngle` (device orientation → lean angle), `useBackgroundAudio`, `usePictureInPicture`, `useLiveOverlayRecorder` (records a live ride overlay video, with `convertToMp4`/ffmpeg.wasm for conversion). New native-device features should follow this hook-wrapper pattern.

### UI layer

shadcn/ui components (generated into `src/components/ui`, configured via `components.json`) plus Tailwind (`tailwind.config.ts`, near-black neutral palette in `src/index.css`). Path alias `@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative `../../` imports.

- Backdrop: `components/AppBackdrop.tsx` is mounted once in `App.tsx` behind every screen: slow "lava" accent blobs, a tightly packed `BLACKTOP` wordmark in the background colour (only the blobs' light reveals it) seen through an SVG fish-eye displacement lens larger than the viewport, and a mist layer. Each wordmark row is a slow conveyor belt (alternate rows run opposite ways), and the rows form an endless vertical loop that follows any scroll in the app (window or inner scrollers) through the lens. `lib/backdropMotion.ts` drives it all from one rAF loop: `surgeBackdrop(strength)` spins the belts up via `playbackRate` and lets them coast back (`BackdropHost` in `App.tsx` calls it on taps of interactive elements and on route changes), `scrollBackdrop` moves the rows, and `setBackdropPull` is used by `components/PullToRefresh` (app-wide, touch only: rows follow the finger, belts slow, the lens bulges; release past the threshold refetches active react-query queries and fires `blacktop:refresh` on window; mark areas `data-no-pull` to opt out). While the map loads, the backdrop moves in front of the page as the loading screen (belts at a fast cruise, `setBackdropCruise`) and pauses once the map has drawn. On the ride and pillion screens the backdrop runs `flat` (no fish-eye lens: the lens is an SVG filter recomputed on the CPU every frame, too costly with the screen on all ride), and the belts cruise faster past the amber speed threshold and faster again past red (`BackdropHost` reads `useRideSpeed`). Don't call `useActiveRide` app-wide: it resumes GPS for a restored ride (`useRideSpeed` is the side-effect-free read). Pull-to-refresh is off on the ride screen and the map. Page roots must not paint an opaque background.
- Frost: any `bg-card*` surface is frosted automatically (a global rule in `index.css`; opt out with `.no-frost`). Overlays (dialogs, sheets, menus, selects, tooltips, toasts), outline/secondary buttons and header buttons use `.frost-accent` (frost + thin accent border + accent icons). Primary CTAs stay solid.
- Screens use `components/PageHeader` (`PageHeader`, `HeaderButton`) for their header. Settings sections are `settings/components/CollapsibleSection` tiles in a two-column grid; pass `index` so an opened section drops down full width under its row (tiles never move, no half-empty rows).
- Numbers use `.font-mono`, which is Inter with tabular figures (not a monospace stack). Page transitions, `.pressable`, `.stagger-in` and skeletons (`components/skeletons.tsx`) are the shared motion primitives; all respect `prefers-reduced-motion`.
- Burn UI uses the fixed `--burn` colour, never the accent.
- Colour roles (home screen and new UI): icons in the accent colour, headings white (`text-foreground`), subheadings grey (`text-muted-foreground`).
