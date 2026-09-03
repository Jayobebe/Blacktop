# What competitors have that Blacktop doesn't

Scan of Rever, calimoto, Cardo Ride (RISER), EatSleepRIDE, Detecht, Apex Rider, GripRoute, Zavoy, ApexTracker.

Blacktop already matches or beats them on: live convoy tracking, in-ride voice mesh, crash detection + rescue, lean/G telemetry, ride overlay video, 3D flyover, garage + maintenance, trading cards, privacy-first burn model, tile caching.

Below is what they have and we don't, ranked by fit with Blacktop's positioning (privacy-first, ephemeral, ride-focused — not a social feed).

## Tier 1 — strongest fit

1. **Twisty route generator ("give me a 90-minute loop")**
   Every serious competitor has this (GripRoute, Zavoy, calimoto, MotoVibe). Pick a vibe (curvy / scenic / relaxed), a distance and a start point; we generate a loop back home. Buildable on OSRM + Overpass road-curvature scoring in the existing `place-search` edge function; no new paid service.

2. **Offline map packs**
   `tileCache.ts` already caches tiles opportunistically. Add explicit "download this area / this route for offline" with a size estimate and a manage/delete screen. Matches Apex Rider's offline-first pitch and is a real safety feature in signal dead zones.

3. **Fuel / range planning**
   Tank size + observed consumption per bike in the garage, a range ring on the map, and a "fuel stop needed" prompt with 24h fuel POIs (we already have the 24h Overpass category). Nobody in the convoy runs dry.

4. **Ride weather along the route**
   Not just the current radar overlay: rain/temp/wind forecast at each waypoint for the estimated arrival time, plus a pre-ride "rain in 40 min at stop 2" warning. Free via Open-Meteo, no key.

## Tier 2 — good fit, more scope

5. **Corner/curve scoring and a ride "grade"**
   Post-ride analysis of smoothness, lean consistency, braking harshness from the existing 10 Hz lean + G samples — a coaching score rather than a leaderboard. Feeds the flyover and history pages with no new sensors.

6. **Gear & service reminders with mileage triggers**
   Extend garage maintenance to auto-tick off distance from rides (chain lube, oil, tyres) and warn before a ride when something is overdue.

7. **Crew challenges / seasonal goals**
   EatSleepRIDE and Rever both lean on this. Kept privacy-safe: crew-scoped only (distance this month, most rides, most stops), no global feed.

8. **Ride reports / shareable recap card**
   A single image recap (route thumbnail, distance, top speed, badges, crew names) for sharing outside the app — lighter than the MP4 overlay.

## Tier 3 — worth noting, weaker fit

9. **Public route discovery library** — conflicts with the ephemeral/no-social-feed positioning unless crew-scoped.
10. **Track day / lap timer mode** — ApexTracker-style; a niche but sticky mode.
11. **Android Auto / CarPlay native surfaces** — previously deferred; still the biggest platform gap versus calimoto/Rever.
12. **Tyre pressure / OBD & TPMS sensor pairing** — hardware dependent.

## Technical notes

- Route generation, offline packs, fuel POIs and weather all run on free/open sources (OSRM, Overpass, Open-Meteo, existing tile provider) through the existing `place-search` edge function pattern — no new paid keys.
- Curve scoring and ride grading reuse `leanSamples` / `gForceSamples` already stored on `RideSession`; no schema change beyond an optional score field.
- Fuel and service triggers extend `src/features/garage` types and the existing `MaintenanceList`.
- Everything above keeps local-first storage; nothing needs new persistent server-side ride data.

## Suggested first build

Twisty route generator + offline map packs — the two features every rider-facing competitor markets first, and the two Blacktop is closest to being able to ship on existing infrastructure.
