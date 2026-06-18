# Vehicle Trading Cards

A collectible card per vehicle, unlocked at 10 rides and upgrading at every 10-ride milestone. Each card shows the vehicle's lifetime stats and changes tier (color/material) as the rider racks up more rides on it. Cards live in a swipeable carousel at the bottom of the Stats page.

## Tier ladder

Cards are awarded at the following ride counts on a single vehicle:

| Rides | Tier        | Look                                                       |
| ----- | ----------- | ---------------------------------------------------------- |
| 10    | Bronze      | Warm copper gradient, matte border                         |
| 25    | Silver      | Cool brushed-silver gradient                               |
| 50    | Gold        | Rich gold gradient, subtle shine sweep                     |
| 100   | Platinum    | Pale white-gold, crisp border                              |
| 200   | Diamond     | Icy cyan-white with faint sparkle dots                     |
| 300   | Ruby        | Deep red with darker bevel                                 |
| 400   | Obsidian    | Near-black with soft accent-orange edge glow               |
| 500   | Polyatomic  | Iridescent multi-stop gradient (oil-slick), slow shimmer   |
| 1000  | Orion       | Deep space gradient with star specks + accent glow pulse   |

Below 10 rides: no card yet — placeholder slot shows "X / 10 rides — first card unlocks at 10".

## Card face

Top: vehicle name (large), make/model subtitle.
Center: pixel hero photo from the garage (`bike.photos.hero`), framed.
Bottom stats grid (2×2):
- Top speed (uses `settings.speedUnit`)
- Max lean — only rendered if `settings.leanAngleEnabled` is on; otherwise that cell shows total time
- Total distance (uses `settings.distanceUnit`)
- Total rides + total time stacked in one cell

Tier name + ride count shown as a small chip in the top-right corner. Back of card is not needed for v1.

## Stat-change indicators

When a card upgrades to a new tier, any stat that improved versus the previously-stored snapshot gets:
- a small up-arrow + new value
- a one-time pulse animation the first time the user views the new tier

We store the last-seen snapshot per vehicle in localStorage (`bt.cards.v1`), keyed by `bikeId`, holding `{ lastTier, lastSeenTier, snapshot: { topSpeedMph, maxLean, totalDistanceKm, totalRides, totalDurationSec } }`. On Stats mount we recompute current tier from ride count and diff against `snapshot`; arrows render for improved stats; pulse runs once when `lastSeenTier < currentTier`, then `lastSeenTier` is updated.

## Stats page placement

Keep the existing badges + stats grid exactly as they are. Add a new section pinned to the bottom of the scroll area:

```text
┌──────────────────────────────┐
│  Badges  │  Stats grid       │
│          │                   │
├──────────────────────────────┤
│  ◀  [ Vehicle Card ]  ▶      │  ← swipeable carousel, one card per page
│           • • •              │
└──────────────────────────────┘
```

Carousel uses the existing shadcn `carousel` component (already in `src/components/ui/carousel.tsx`). One card per vehicle in the garage, ordered by most rides first. Dots underneath. Card aspect ratio ~ 5:7, max width ~280px so it sits comfortably above the safe-bottom inset without forcing scroll on tall phones.

The Stats page root must change from `overflow-hidden` to allow vertical scroll on small screens so the cards are reachable; landscape layout keeps the existing two-column split and pushes the carousel below.

## Files to add

- `src/features/cards/types.ts` — `CardTier` enum, `TIER_THRESHOLDS`, `TIER_STYLES` (gradient/border/text class strings keyed off semantic tokens), `VehicleCardSnapshot`.
- `src/features/cards/lib/tier.ts` — `getTierForRides(n)`, `getNextTier(n)`, `ridesToNext(n)`.
- `src/features/cards/hooks/useVehicleCards.ts` — joins `useGarage`, `useBikeStats` (per bike), `useSettings`, and the snapshot store; returns an array of `{ bike, stats, tier, prevTier, improved: Partial<Record<StatKey, boolean>>, isNewTier }`, plus `markTierSeen(bikeId)`.
- `src/features/cards/components/VehicleCard.tsx` — the card UI. Pure presentational. Accepts the joined object above. Tier styling via class lookup, never inline hex.
- `src/features/cards/components/VehicleCardCarousel.tsx` — wraps shadcn carousel, renders one `VehicleCard` per vehicle plus a "locked" placeholder for vehicles under 10 rides, calls `markTierSeen` on slide change.
- `src/features/cards/index.ts` — barrel export.

## Files to edit

- `src/pages/Stats.tsx` — import `VehicleCardCarousel`, render it at the bottom of the main content area, relax `overflow-hidden` to `overflow-y-auto` on the root so the carousel is always reachable.
- `src/index.css` — add a `card-shimmer` keyframe (slow diagonal highlight sweep) used by Gold+, and a `card-tier-pulse` keyframe for the new-tier reveal. Both use semantic tokens / opacity only — no hardcoded colors beyond white/black with low opacity for the sheen.

## Data model

No schema changes. Everything is derived from existing local data:
- Per-vehicle ride list: `rides.filter(r => r.endedAt && r.bikeId === bike.id)` (same as `useBikeStats`).
- Lifetime top speed / max lean / distance / duration come straight from `useBikeStats`, which already returns them.
- Tier = `getTierForRides(stats.totalRides)`.

Snapshot store (`bt.cards.v1`) is the only new persisted state and is wiped by the existing Burn button via `useLocalStorage` cleanup (add the key to the burn list in `useRideHistory.burnAllData` if it isn't picked up by the existing prefix sweep — check during build).

## Design notes

- All tier colors implemented as Tailwind class sets that reference CSS variables / `bg-gradient-to-br from-… to-…` using semantic + neutral tokens. No raw hex in components.
- Pulse + shimmer respect `prefers-reduced-motion` (disabled when set).
- Locked placeholder uses the same card frame at 60% opacity with a small lock icon and progress text — keeps the carousel visually consistent before any tier is earned.
- Cards never show fabricated stats: a brand-new vehicle with 0 rides shows the locked placeholder, not a Bronze card with zeros.
