# 3D Ride Flyover (Strava-style overview)

Yes — this is possible with the mapping stack already in the app (MapLibre GL is
already a dependency), using free data sources. No paid Mapbox account needed.

## What you get

A new **Overview** button next to "Download Overlay Video" in ride history.
It opens a full-screen 3D flyover of the ride:

- Real terrain relief (hills/valleys) under the route
- Extruded 3D buildings in built-up areas
- The route drawn as a glowing line that "draws itself" as the camera follows it
- A chase camera that pans/tilts/rotates along the route
- Time compressed to a fixed clip length (default 10s, selectable 10 / 15 / 30s)
- A floating stat card hovering above the rider pin (speed, distance, time,
  lean, G — only the ones toggled on in settings)
- For convoy rides: one pin + stat card per member, using their member colour
- A **Download** button that saves the flyover as an MP4

## Data sources (all free, no keys)

- **Elevation:** AWS Terrain Tiles (`elevation-tiles-prod`, Terrarium encoding) —
  public, free, used as a MapLibre `raster-dem` source for 3D terrain.
- **Building heights:** the OpenFreeMap vector tiles the map already uses carry
  the OpenMapTiles `building` layer with `render_height` / `render_min_height`,
  so a `fill-extrusion` layer gives real 3D buildings with no extra source.
- Route geometry and stats come from the stored ride (`gpsPoints`,
  `leanSamples`, `gForceSamples`) — nothing new is fetched or uploaded.

## Honest limitations

- Building footprints only exist where OSM has them (dense in cities, sparse
  rural). Heights are often OSM estimates, not survey data.
- Terrain tiles are ~30m resolution — great for hills, not for kerb detail.
- Recording happens in real time in the browser: a 10s clip takes ~10s to
  render, plus a few seconds for the existing WebM→MP4 conversion.
- Convoy member trails are only as complete as the position history stored on
  this device for that ride; members who joined late will have shorter trails.

## Technical outline

1. `src/features/ride/lib/flyover.ts` — resample the ride's GPS track to N
   camera keyframes for the target clip duration, compute bearing/pitch per
   frame, and interpolate stats at each frame.
2. `src/features/ride/components/RideFlyover.tsx` — MapLibre map with:
   - `raster-dem` terrain source + `setTerrain({ exaggeration: 1.4 })`
   - `fill-extrusion` buildings layer from the existing vector tiles
   - route `line` source updated per frame (progressive draw)
   - `map.jumpTo()` per animation frame driven by the keyframe list
   - DOM markers for rider pin(s) + hovering stat card(s), one per member
3. Recording: `map.getCanvas().captureStream(30)` composited with an overlay
   canvas (reuse the stat-card drawing style already in
   `useLiveOverlayRecorder`), `MediaRecorder` → WebM → existing
   `convertWebmToMp4` → download. Map is created with
   `preserveDrawingBuffer: true` so frames capture reliably.
4. `src/pages/RideDetail.tsx` — add the Overview button beside the existing
   overlay download button; opens the flyover as a full-screen sheet.
5. Stat visibility follows the same settings flags used by the ride overlay
   (lean / G-force / units); voice-glow is intentionally excluded.
