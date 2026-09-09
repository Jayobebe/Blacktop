# Blacktop

Blacktop is a mobile-first motorcycle ride tracker and convoy communications app. Riders can record solo rides, create or join live convoys, share locations and ride statistics, coordinate destinations, talk over voice, and request help when something goes wrong.

## Features

- Solo and group ride tracking with GPS distance, speed, route, lean angle, and G-force data
- Convoy creation and joining with six-character codes or QR scanning
- Live member locations, readiness state, ride statistics, chat, and waypoint planning
- Peer-to-peer convoy voice chat with push-to-talk and reconnect handling
- Crash detection, rescue requests, leader acknowledgement, and optional Discord alerts
- Ride history, badges, statistics, vehicle garage, odometer, and maintenance reminders
- Map search, nearby points of interest, routing, and external navigation handoff
- Anonymous Supabase authentication with local ride recovery after reload
- Capacitor Android and iOS shells alongside the web app

## Stack

- React 18, TypeScript, Vite, React Router, and TanStack Query
- Tailwind CSS, shadcn/ui, and Radix UI
- Supabase Auth, Postgres, Realtime, and Edge Functions
- MapLibre GL, OpenStreetMap/Nominatim, Overpass, and OSRM
- WebRTC for convoy voice communication
- Capacitor for native device capabilities

## Getting started

Requirements: Node.js 20 or newer and npm.

```sh
git clone https://github.com/Jayobebe/convoy-comms.git
cd convoy-comms
npm install
copy .env.example .env
npm run dev
```

The development server runs on port `8080` by default. Set the Supabase values in `.env` when using a different project:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

The Supabase migrations and Edge Functions are in `supabase/`. Place search, Discord alerts, account deletion, dashboard statistics, and tip checkout require their corresponding Supabase configuration and secrets.

## Useful commands

```sh
npm run dev          # Start the Vite development server
npm run build        # Create a production build
npm run build:dev    # Create a development-mode build
npm run lint         # Run ESLint
npm run preview      # Preview the production build locally
```

## Project structure

```text
src/
	pages/             Route-level screens
	features/          Convoy, ride, map, voice, rescue, garage, and settings modules
	components/        Shared UI components
	hooks/             Cross-cutting browser and native behavior
	integrations/      Supabase client and generated database types
	lib/               Persistence, formatting, media, haptics, and utility code
supabase/
	migrations/        Database schema and row-level security changes
	functions/         Authenticated Edge Functions
```

The active ride and completed ride history are primarily stored locally for fast recovery and privacy. Convoy membership, messages, waypoints, and live member state use Supabase.

## Native builds

The app is configured as `com.blacktoplive.app` with Capacitor. Android sources are checked in. iOS setup requires macOS and Xcode; see [ios-setup.md](ios-setup.md) for the required permissions and capabilities.

For a local native build, create the web build and sync Capacitor before opening the platform project:

```sh
npm run build
npx cap sync
npx cap open android
```

## Testing and limitations

There is currently no automated test suite. GPS behavior, background execution, WebRTC voice, native permissions, Supabase Realtime, and external service integrations need device or integration testing. Local ride media can also consume significant browser or device storage over time.
