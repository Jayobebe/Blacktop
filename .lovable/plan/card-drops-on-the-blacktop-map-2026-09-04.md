# Card Drops on the Blacktop Map

Riders earn spare copies of their trading card, drop them at real places on the map, and other riders travel to those spots to collect them into their vault.

## How it works

**Earning drops**
- Your card always keeps one copy locked in Stats — it can never be dropped.
- Copies are earned, not given: hitting a card tier milestone (Bronze, Silver, Gold, …) grants a copy, and completing a weekly crew challenge grants a copy.
- Copy 2 can be stashed in your own vault. From copy 3 onward, copies become droppable.
- Each droppable copy can be planted once, anywhere you choose on the map. Picking it back up returns it to your unplaced stack.

**Dropping**
- A "Drop card" action on the Blacktop map places a copy at the chosen point (drag pin, confirm).
- Only riders with Blacktop World enabled can drop or see drops.
- A Blacktop World toggle controls reach: **Crew only** or **Worldwide**.

**Collecting**
- A card is collectable when you are within ~100 m and stationary (speed under walking pace) — no camera, no owner present.
- Collect adds the full card (photo, placement, zoom, stats snapshot at drop time) to your vault, exactly as a scanned QR would.
- Once collected, that card renders in your vault and on the map with a thin green border and a green tick in the corner.
- A drop can be collected by many riders; each rider collects it once.

**Where cards appear**
- **Home Blacktop map:** cards show as landmark glyphs at all reasonable zooms (not clustered away). Tapping one shows owner name, vehicle, tier, distance and ETA, plus "Go for it" which sets it as the destination through the normal routing stack (twisty/direct, weather routing).
- **Search bars** (lobby destination search, add stop / waypoint search): a **Nearby cards** toggle switches the result list from place search to nearby card drops; normal location search stays the default.
- **Ride maps** (convoy/solo overlay): cards are NOT drawn, to keep the ride map clean.
- **Ride with no destination:** if a drop comes within 10 distance units, a one-time ping surfaces a small prompt — "Card nearby" with owner/vehicle and a "Go scan it" button that routes to it.

## Technical notes

Backend (new table `card_drops`): owner id, crew code, payload fields mirroring the existing v2 card codec (vehicle, tier, stats, photo path, placement, zoom), lat/lng, visibility (`crew` | `world`), active flag, created_at. Plus `card_drop_collections` (drop id, collector id) so a green tick is per-collector and per-device restore works. RLS: owners manage their own drops; reads allowed for worldwide drops or drops whose crew code matches the reader's crew (via a security-definer RPC `list_card_drops(_lat, _lng, _radius_km, _crew_code)` returning only drops in the requested viewport). GRANTs issued in the same migration. Collections insert-only by the collector; server-side distance check in the RPC `collect_card_drop(_drop_id, _lat, _lng)` so proximity can't be faked from the client.

Frontend:
- `src/features/cards/hooks/useCardDrops.ts` — viewport query (react-query, debounced on map idle), drop/pickup mutations, collect mutation.
- `src/features/cards/lib/dropEconomy.ts` — copy accounting from tier milestones + completed crew challenges, minus placed copies; keeps one copy locked to Stats.
- `BlacktopMap.tsx` — card landmark markers (home map only), tap sheet with distance/ETA + "Go for it", drop-placement mode, collected styling, proximity watcher (10 units, stationary gate) reusing the existing camera-ping infrastructure for the alert.
- `MapSearchBar.tsx` — "Nearby cards" toggle producing card results in the existing `MapSearchResult` shape so routing/waypoints work unchanged.
- Blacktop World page — drop-reach toggle (Crew only / Worldwide) and an unplaced-copies counter.
- Vault (`useCollectedCards`) — accepts collected drops through the same path as QR scans, storing the drop id so the tick persists.
- Demo showcase — a card-drop slide added to the World/Cards group.
