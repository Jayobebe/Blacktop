# Thermal Receipt Ride Summary

Replace the current card-style `RideSummary` with a stylised thermal-roll receipt that prints out after every ride (solo and convoy). Bike model and per-bike garage data are stubbed for later.

## Visual direction

- Paper-white receipt strip on a dark blurred backdrop, centered, max-width ~360px, with torn/zig-zag top and bottom edges.
- Subtle paper texture (noise overlay) + soft drop shadow + faint vertical print streaks.
- Dot-matrix font (Google Font: `VT323` or `Share Tech Mono` — I'll use `VT323` for the strong dot-print feel, with `JetBrains Mono` fallback). All receipt text in near-black on off-white.
- "Print-in" entrance animation: receipt slides down from the top as if being printed (translateY + clip-path reveal), ~600ms.
- Slight paper curl at the bottom edge (CSS skew/rotate on last block).

## Receipt layout (top → bottom)

1. **Header row**: Blacktop BT logo (left, mono-inverted) + right-aligned timestamp (`18 JUN 2026 · 14:32`).
2. **Title**: `BLACKTOP STORE` centered, larger dot-matrix.
3. **Bike line**: `BIKE .............. —` (placeholder dash for now; comment hook for future bike model).
4. **Divider**: dashed line `- - - - - - - - -`.
5. **Stat rows** (label left, dotted leader, value right):
   - `MAX SPD ........ 142 KM/H`
   - `MAX LEAN ....... 38°` (only if lean data present; otherwise `—`)
   - `DISTANCE ....... 84.2 KM`
   - `DURATION ....... 01:24:08`
   - `AVG SPD ........ 62 KM/H`
   Units respect `useSettings()` (km/h vs mph, km vs mi).
6. **Bike model block**: bordered box with corner brackets `⌐ ¬ / L ⌡` containing `BIKE MODEL` placeholder text (greyed, italic-mono "—  add in garage").
7. **Badges block** (convoy only, ≥1 badge): row of small bracketed cells, each containing the badge emoji + 2-line micro caption (badge label + member name truncated). Hidden entirely on solo rides.
8. **Footer**: barcode-style stripe (CSS lines), then `THANK YOU FOR RIDING` + ride id short hash.
9. **Continue button** lives OUTSIDE the receipt, below it, as a normal app button (keeps the receipt looking like a real artifact).

## Implementation

- Rewrite `src/features/ride/components/RideSummary.tsx` — same props, same call sites, no API changes.
- Add `VT323` via Google Fonts link in `index.html` and a `.font-receipt` utility class in `src/index.css`. Add receipt-specific tokens (paper bg, ink color, torn edge mask, noise) scoped to a `.receipt` class so it stays consistent in light/dark mode (receipt is always light paper, even in dark theme — intentional artifact look).
- Add a small `ReceiptRow` helper inside the file for the dotted-leader rows (uses flex + dashed border-bottom on a spacer span, or character-leader with `mask-image` for crispness).
- Bike model: render placeholder block with a TODO comment + data-attribute `data-bike-slot` so the future garage feature can target it.
- Reuse existing `formatDuration`, `formatDistance`, `formatSpeed`, `getSpeedLabel`, `getDistanceLabel`.
- Keep `onBadgesEarned` effect unchanged.
- Lean angle: read from settings/active ride if available; otherwise show `—`. I'll thread an optional `maxLean?: number` into `RideStats` (default omitted, so existing callers unaffected) and pass it through from `useActiveRide` if it exposes lean data — confirmed via `useLeanAngle` hook usage; if not currently tracked into the summary, the row simply shows `—` until wired.

## Out of scope (per your note)

- Garage page / per-bike stats — separate follow-up.
- Bike picker UI — separate follow-up.
- Demo page receipt mockup — can update after if you want.

## Files touched

- `src/features/ride/components/RideSummary.tsx` (rewrite)
- `src/index.css` (add `.receipt`, `.font-receipt`, torn-edge + noise utilities)
- `index.html` (preconnect + VT323 Google Font link)
