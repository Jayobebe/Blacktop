# Legacy Derez — real-world Tron lightcycles for Blacktop Arcade

A multiplayer arcade mode where riders ride real tarmac inside a drawn arena. Each rider trails a line in their accent colour; cross anyone's line (or your own) and you lose a life. Last rider standing wins.

## Flow

```text
Arcade  ->  Legacy Derez tile
              |
   Create lobby (leader)          Join lobby (code / QR)
              |                            |
              +----------- Lobby ----------+
                 leader: lives 1-5, draw arena on map popup
                 players: ready up
                            |
                   5s countdown -> LIVE
                            |
        zoomed map, your dot + everyone's trails
        collision / out-of-bounds -> lose a life -> respawn
                            |
                    Winner screen -> leader taps Reset
                            |
                 back to lobby (re-ready) or Arcade
```

## Lobby

- Leader creates a lobby and gets a 6-character code plus a QR (same look and share flow as convoy join).
- Players join by code or QR scan. Max 8 riders, matching the convoy cap.
- Each player is shown in their own accent colour, taken from their settings. If two players share a colour, the second joiner is auto-shifted to the nearest free accent so trails stay distinguishable.
- Leader controls: lives per player (1-5, default 3) and the arena.
- Everyone must tap Ready before the leader can start. Ready state clears whenever the arena or lives change.

## Arena

- Leader taps "Draw arena", which opens the Blacktop map popup centred on their location.
- Freehand drawing: drag a finger to trace the boundary of the play space (e.g. the outline of a car park). The shape auto-closes on release, is simplified, and is shown as a glowing polygon with its area in m².
- Undo / redo the last stroke, or clear and redraw. Confirm locks it in and broadcasts it to all players, who see the same outline on their lobby map.
- Start is blocked until an arena exists, at least 2 players have joined, and all are ready.

## The round

- After a 5-second countdown, the game view opens: a zoomed, north-up map locked to the arena bounds, dark-styled with the arena outline glowing.
- GPS is switched to high-frequency mode for the duration of the round (`enableHighAccuracy`, no throttling, target ~4-10 fixes/second where the device allows), far more often than normal ride tracking.
- Every fix appends a point to your trail, drawn as a bright line in your accent colour with a soft glow and a bike head marker. Other riders' trails stream in over realtime and render identically in their colours.
- Death conditions:
  - Your head segment crosses any existing trail segment, including your own (a short grace tail behind your own head is ignored so GPS jitter does not self-kill).
  - Out of bounds: leaving the arena starts a visible 5-second countdown; get back inside to cancel it, otherwise you lose a life.
- On death: screen flashes, you lose a life, your trail is wiped, and you respawn (as a live rider again) if you have lives left. At zero lives you are out and switch to spectator view.
- Round ends when one rider remains, or when everyone is out (declared a draw).

## After the round

- Winner screen: name, accent colour, lives remaining, and per-player kill/death tally.
- Winner's "Legacy Wins" counter increments locally.
- Leader taps Reset -> back to the lobby with trails cleared and ready flags off, same arena and lives retained. Anyone can leave to return to the Arcade screen.
- If the leader disconnects, the longest-present remaining player is promoted, mirroring convoy leader auto-promotion.

## Stats

- Legacy Wins is shown on the Legacy Derez tile in the Arcade lobby ("Wins: N"), stored locally alongside the other arcade high scores. Not added to the Statistics page.

## Technical notes

**Database (new tables, RLS + grants, realtime enabled):**
- `derez_lobbies` — `code`, `leader_id`, `lives`, `arena` (GeoJSON polygon as jsonb), `state` (`lobby` | `countdown` | `live` | `finished`), `winner_id`, `started_at`, timestamps.
- `derez_players` — `lobby_id`, `user_id`, `display_name`, `accent_color`, `is_ready`, `lives_left`, `is_alive`, `joined_at`.
- Membership helper `is_derez_member(_lobby_id, _user_id)` (security definer) mirroring `is_convoy_member`, used by all policies; `lookup_derez_by_code` RPC for joining without exposing other lobbies.
- Trail points are **not** stored in Postgres. They stream over a `derez-{lobbyId}` Supabase Realtime broadcast channel (`pos` events, batched ~5/s), the same ephemeral pattern used for rescue pings and live stats.

**Client (`src/features/arcade/`):**
- `hooks/useDerezLobby.ts` — module-level singleton store + `useSyncExternalStore` (the established pattern), owning lobby row, players, realtime subscription, ready/lives/arena mutations, leader promotion.
- `hooks/useDerezGame.ts` — high-frequency geolocation watch, trail accumulation, broadcast batching, segment-intersection collision test, out-of-bounds countdown, life/death state.
- `lib/derezGeo.ts` — segment intersection, point-in-polygon, freehand stroke simplification, metre-space projection helpers.
- `components/DerezLobbyPanel.tsx`, `DerezArenaDrawer.tsx` (map popup with freehand drawing), `DerezGameView.tsx` (zoomed game map + HUD), `DerezResult.tsx`.
- New route `/arcade/legacy-derez` plus `/arcade/legacy-derez/:code` for QR joins, registered in `App.tsx`; new tile in `ArcadeLobby.tsx`.
- Arena drawing and the game map use a lightweight dedicated MapLibre instance rather than the 2000-line `BlacktopMap`, keeping game rendering (trails as GeoJSON line sources updated per frame) isolated and fast.
- Wake lock held for the whole round so the screen never dims mid-game.
- `ArcadeGame` / `ArcadeScores` types extended with `legacy-derez` (wins) so the existing local score store handles it.

**Safety:** a one-time notice before the first round — ride slowly, private property only, keep eyes up. The game refuses to start above a walking/parking-lot speed threshold is not enforced, but the notice is shown each session.
