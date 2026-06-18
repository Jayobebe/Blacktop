## Goal
All distance and speed values everywhere in the app must respect the user's chosen `speedUnit` (mph/kph) and `distanceUnit` (miles/km) from Settings, and use a single consistent label style.

## Single source of truth
Continue to use the existing helpers in `src/lib/format.ts`:
- `formatSpeed(mph, unit)` → number
- `formatDistance(miles, unit)` → string
- `getSpeedLabel(unit)` → `"MPH"` / `"KPH"`
- `getDistanceLabel(unit)` → `"mi"` / `"km"`

No screen may hardcode `mph`, `kph`, `mi`, `km`, or do its own conversion. All UI surfaces will route through these helpers with `useSettings().settings`.

## Issues to fix

### Wrong / inconsistent labels
- `src/pages/History.tsx` (lines 145–146) — prints lowercase `settings.speedUnit` ("mph") instead of `getSpeedLabel(...)` → swap to label helper.
- `src/pages/ActiveRide.tsx` (line 857) — member row prints raw `settings.speedUnit` → swap to `getSpeedLabel(...)`.

### Hardcoded "mph" / inline conversions
- `src/features/waypoints/components/DestinationSearch.tsx` (lines 716–722) — uses inline `* 0.621371` and writes `"mi"` / `"km"` literals. Replace with `formatDistance(milesValue, distanceUnit) + getDistanceLabel(distanceUnit)`. `result.distance` is already in km; convert km → miles before passing to `formatDistance`.
- `src/pages/Garage.tsx` (line 32) — unused `KM_TO_MI` constant; remove.
- `src/features/garage/components/StatsPanel.tsx` (lines 10, 14) — `KM_TO_MI` + unused `odoMi`; remove.

### Demo screens still locked to mph
- `src/pages/DemoShowcase.tsx` and `src/pages/DemoRide.tsx` — every "mph"/"MPH" string and hardcoded number gets routed through `getSpeedLabel(settings.speedUnit)` and `formatSpeed(...)` so demos match the user's chosen units. The DemoRide toggle that flips between mph/kph locally will be removed; the demo will follow Settings instead. Numeric demo values are already in mph, so `formatSpeed` handles conversion.

### Speed-threshold consistency (ActiveRide colour zones)
- `src/pages/ActiveRide.tsx` (lines 622–624) — colour zone comparison currently uses `formatSpeed(currentSpeed, speedUnit)` against the raw threshold, which is correct only because thresholds are stored in the user's chosen unit. To prevent confusion when the user toggles units later, store thresholds canonically in **mph** and convert for display + comparison.
  - In `useSettings`, treat `amberSpeedThreshold` / `redSpeedThreshold` as mph internally.
  - In `Settings.tsx`, when rendering the slider: show `formatSpeed(threshold, speedUnit) + getSpeedLabel(speedUnit)`, and on change convert input (in displayed unit) back to mph before storing. Slider min/max also presented in the chosen unit.
  - In `ActiveRide.tsx`, compare `rideState.currentSpeed` (mph) directly to the stored mph thresholds — no unit math needed.

### Settings copy polish
- `src/pages/Settings.tsx` line 301 — replace static "MPH or KPH" subtitle with dynamic `Currently {getSpeedLabel(settings.speedUnit)}` for clarity. Same treatment for distance subtitle.

## Already correct (no change needed)
- `src/pages/Home.tsx`, `src/pages/Stats.tsx`, `src/pages/RideDetail.tsx`, `src/features/ride/components/RideSummary.tsx`, `src/features/streaming/components/LiveStreamViewer.tsx`, `src/hooks/useLiveOverlayRecorder.ts`, `src/hooks/usePictureInPicture.ts` — already consume settings via the helpers.
- `src/features/ride/hooks/useActiveRide.ts` — constants are internal computation thresholds in mph, never displayed; leave as-is.
- `src/types/blacktop.ts` — storage canonical units stay mph / miles; only the display layer converts.

## Acceptance check
After the fix, searching the codebase for hardcoded `mph`, `kph`, `' mi'`, `' km'`, `1.60934`, or `0.621` returns only:
- `src/lib/format.ts` (the helpers themselves)
- `src/features/settings/hooks/useSettings.ts` (type definitions)
- `src/features/garage/hooks/useBikeStats.ts` (canonical-unit storage math, not display)
- `src/features/ride/hooks/useActiveRide.ts` (internal mph thresholds)
- `src/types/blacktop.ts` (storage unit comments)

Manually toggling Speed and Distance units in Settings updates every value and label across Home, Stats, History, Ride Detail, Active Ride (incl. member list and colour zones), Lobby (destination search), Ride Summary, Garage Stats, Demo Showcase, Demo Ride, and Live Stream overlay — without restarting the app.
