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

Code is split between generic `src/components`, `src/hooks`, `src/lib`, `src/pages` and domain features under `src/features/<feature>/`, each with its own `components/`, `hooks/`, `lib/`, `types.ts`, and a barrel `index.ts` that defines the feature's public surface. Other features and pages should import from a feature's `index.ts`, not reach into its internals. Current features: `convoy`, `ride`, `voice`, `rescue`, `waypoints`, `garage`, `cards`, `profile`, `settings`, `permissions`, `integrations/discord`.

`src/pages/*` are route-level screens composed from features; routing lives in `src/App.tsx`.

### Global client state via module-level stores, not Context

Cross-cutting state (e.g. convoy state in `src/features/convoy/hooks/useConvoyState.ts`) is implemented as a module-level singleton object + `Set` of listener callbacks, exposed to components through `useSyncExternalStore`. This is the established pattern for shared state in this codebase — prefer it over introducing new React Context providers or a state library. Profile/settings (`useProfile`, `useSettings`) follow the same pattern and are read at the top of `App.tsx` to gate routing (onboarding vs. main app) and to initialize the accent color.

Server data fetching/caching uses `@tanstack/react-query` (`QueryClient` set up in `App.tsx`).

### Realtime: Supabase Postgres + Realtime channels, WebRTC for voice

- Convoy membership/destination/waypoints are rows in Postgres (`convoys`, `convoy_members`, ...) read/written via `supabase.from(...)`, with the active convoy id cached in `localStorage` (`blacktop_active_convoy_id`) so a reload can restore session state.
- Ephemeral, low-latency events (rescue pings, lobby chat, live stats) go over `supabase.channel(...)` broadcast channels scoped per convoy (e.g. `rescue-${convoyId}`), not the database.
- Voice chat (`src/features/voice/hooks/useVoiceChannel.ts`) is peer-to-peer WebRTC (`RTCPeerConnection` with public STUN servers), using a Supabase Realtime channel purely as the signaling transport. iOS/Safari needs special handling: audio must be "unlocked" via a user gesture (`unlockIOSAudio`) before `AudioContext`/playback will work, and audio constraints differ (no fixed `sampleRate`).

### Ride tracking domain model

Core ride/convoy types live in `src/types/blacktop.ts` (`RideSession`, `GpsPoint`, `LeanSample`, `ActiveRideState`, `RideStats`, badges) and `src/types/convoy.ts` (`ConvoyState`, `ConvoyMemberInfo`, waypoints, `calculateBadges`). A `RideSession` accumulates GPS points and (optionally) 10Hz lean-angle samples for crash detection and lean-angle visualization; convoy-only "badges" (Speed Demon / Journeyman / Fallback) are computed client-side from member stats via `calculateBadges`.

Crash/rescue flow: `useCrashDetection` (ride feature) watches device motion + speed to detect a crash, surfaces a confirmation prompt, and on confirmation/timeout calls into `useRescue` (rescue feature), which broadcasts a `rescue_request` over the convoy's realtime channel to the leader and can also notify a Discord webhook via `src/features/integrations/discord` and the `discord-announce-*` Supabase Edge Functions.

### Native device integration

Capacitor plugins (`@capacitor/geolocation`, `@capacitor/filesystem`) and browser device APIs are wrapped in small hooks rather than called ad hoc: `useWakeLock`, `useOrientationLock`, `useLeanAngle` (device orientation → lean angle), `useBackgroundAudio`, `usePictureInPicture`, `useLiveOverlayRecorder` (records a live ride overlay video, with `convertToMp4`/ffmpeg.wasm for conversion). New native-device features should follow this hook-wrapper pattern.

### UI layer

shadcn/ui components (generated into `src/components/ui`, configured via `components.json`) plus Tailwind (`tailwind.config.ts`, dark-themed: app background `#0a0a0a`). Path alias `@/*` maps to `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`) — use it instead of relative `../../` imports.
