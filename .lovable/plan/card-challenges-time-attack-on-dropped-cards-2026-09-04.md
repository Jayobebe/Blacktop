# Card Challenges — Time Attack on Dropped Cards

Turn any dropped card into a time-attack challenge. The owner sets a route by riding it; anyone who finds the card can race it.

## Setting a challenge (owner)

1. On the "Place card here?" prompt, add a third option: **Yes + Challenge**.
2. Choosing it drops the card as normal, then opens Blacktop World with the drop point as the start line and a 5-second countdown.
3. The rider rides wherever they want. A **Finish challenge** button is pinned on the map.
4. Tapping it sets the finish line and saves the recorded track (GPS trace, distance, elapsed time) against the card drop.
5. Cancelling before finishing leaves the card dropped with no challenge attached.

## Taking on a challenge (challenger)

- Cards with a challenge render with a distinct stopwatch marker on the map and a "Challenge" tag in the card sheet / hot-spot list.
- The sheet shows the route preview, distance and time to beat, plus two actions: **Scan card** (existing collect) and **Take challenge**.
- Take challenge requires being inside the existing 120 m pick-up radius. It shows a **Ready up** button; pressing it starts a 5-second countdown and then a tracked ride with the challenge route drawn and a live delta against the target time.
- Crossing the finish line (within ~40 m of the finish point):
  - Faster than the setter: **won** — 3 Speed Demon badges into the badge wallet.
  - Slower: **lost** — 1 Fallback badge.
- Deviating more than 120 m from the challenge route for over 15 s: challenge is voided and counted as a loss (1 Fallback badge), with a toast.
- Collecting the card itself is unaffected — it can be scanned before or after the attempt, win or lose.

## Ride history

Time-attack rides are saved to ride history like any other ride, flagged as a challenge ride, and rendered with a **time-attack receipt** variant:

- All existing receipt content (distance, duration, speeds, lean, G, badges).
- A "Challenge" block: the trading card that hosted it, the setter's name, target time, your time, the delta, and WON / LOST / VOID.
- Overlay video, recap card and 3D flyover all keep working unchanged on these rides.

## Demo

Add a **Card Challenges** slide to the demo walkthrough (after Trading Cards) with an animated mockup: card drop → 5-second countdown → route drawn → finish line → challenger racing a ghost delta → WON with 3x Speed Demon. Info cards kept to an even count, last one full width per existing layout rule.

## Technical notes

- Migration: add nullable challenge columns to `public.card_drops` (`challenge_route jsonb`, `challenge_time_sec`, `challenge_distance_mi`, `challenge_finish_lat/lng`, `challenge_set_at`) plus a `card_challenge_attempts` table (drop_id, challenger_id, name, time_sec, result) with GRANTs, RLS (own-row insert/select, owner reads attempts) and an `attempt_card_challenge` RPC for validated writes. `list_card_drops` extended to return the challenge fields.
- New `src/features/cards/lib/challenge.ts`: route capture, deviation check (point-to-polyline distance), finish detection, result scoring.
- New `src/features/cards/hooks/useCardChallenge.ts`: module-level store for the active challenge run (setting vs. attempting), mirroring the `soloRoute` store pattern.
- `BlacktopMap.tsx`: challenge markers, countdown overlay, finish button, live delta HUD, route polyline, deviation warning.
- `RideSession` gains an optional `challenge` field; `useRideHistory` persists it; `RideDetail` / `RideSummary` render the time-attack variant.
- Badges routed through existing `recordBadges()` so wallet totals and the copy economy stay consistent.
- Whole feature is gated behind Blacktop World opt-in, like all card drops.
