# Camera markers on the Blacktop map (open data)

## What

Add an optional map layer showing speed cameras and ANPR/surveillance cameras sourced from OpenStreetMap (Overpass API) — free, no key, already proxied through our `place-search` backend function.

## Data source

- `highway=speed_camera` — fixed speed/red-light cameras (good coverage in UK/EU, decent US)
- `man_made=surveillance` with `surveillance:type=ALPR` / `camera:mount` / `surveillance` on poles — ANPR / Flock-style cameras (sparser, US coverage growing)
- All queried through the existing `place-search` edge function Overpass pipeline, viewport-bounded, so it works on web + native with no new secrets.

## Changes

1. **Backend (`supabase/functions/place-search/index.ts`)**
   - New request `kind: 'cameras'` with bbox + zoom params.
   - Overpass query: `node["highway"="speed_camera"]` and `node["man_made"="surveillance"]["surveillance:type"~"ALPR|anpr"]` (plus `camera:type=fixed`) within the bbox.
   - Guard: only run when zoom >= 13 (below that, return empty — avoids huge queries).
   - Returns `[{id, lat, lng, type: 'speed'|'alpr'}]`, capped (~500).
   - Rate-limit bucketed like existing `place-search` calls.

2. **Map data (`src/features/map/lib/cameraStore.ts`, new)**
   - Fetches cameras for the current viewport on `moveend`/`zoomend`, debounced (~800ms).
   - Small in-memory cache keyed by tile-ish bbox buckets so panning around doesn't refetch.
   - Graceful failure: on error just show no cameras.

3. **Map rendering (`src/features/map/components/BlacktopMap.tsx`)**
   - MapLibre circle markers / custom styled dot markers (existing Marker pattern): orange-tinted icon for speed cameras, distinct muted color for ANPR.
   - Render only when zoom >= 13.
   - Not included in the action-cam recorded overlay mini-map (keep that clean).

4. **Settings toggle (`src/features/settings` + Settings page)**
   - "Show traffic cameras" toggle (default off), persisted with existing settings store.
   - When off, no markers and no queries.

## Notes / limits

- OSM camera data is crowd-sourced — incomplete and not guaranteed accurate; label the toggle description accordingly (informational only).
- Speed camera alerts are restricted in a few jurisdictions (e.g. some EU countries); this plan only *displays* static map markers, no proximity alerts. Proximity/alert logic is out of scope unless you want it.

## Verification

- Unit-level: query builder output; store cache behavior.
- Browser: load map, enable toggle, zoom to a camera-dense area (e.g. London), confirm markers appear, confirm none below zoom 13, confirm toggle-off hides them and stops network calls.
