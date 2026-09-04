# Badges as a currency for card copies

Today there are only three ride badges (Speed Demon, Journeyman, Fallback) and they are cosmetic — awarded at the end of a convoy ride and shown on the receipt. This plan expands the badge set so every weekly challenge metric has a matching badge, then turns badges into a spendable currency that buys card copies.

## New badge set

One badge per challenge metric, plus the existing three:

| Badge | Emoji | Earned by | Points |
|---|---|---|---|
| Speed Demon | ⚡ | highest top speed in the ride | +1 |
| Journeyman | 🛣️ | most distance in the ride | +1 |
| Lean Fiend | 🏍️ | deepest lean angle | +1 |
| G-Lock | 🌀 | highest g-force pulled | +1 |
| Corner Carver | 🌊 | best corner score | +1 |
| Night Owl | 🌙 | ride started after 8pm or before 5am | +1 |
| Hard Ass | 🪑 | single ride over 150 mi | +1 |
| Always Out | 📅 | 3+ rides in a day | +1 |
| Fallback | 🪨 | longest time stopped | −1 |

Convoy-relative badges (Speed Demon, Journeyman, Lean Fiend, G-Lock, Corner Carver, Fallback) go to the best/worst member of that ride as they do now. Solo-achievable badges (Night Owl, Hard Ass, Always Out) are threshold-based so solo riders can still earn currency.

## Badge economy

- Every badge earned is written to a badge wallet with its point value; Fallback subtracts a point.
- Balance never goes below zero.
- **10 badge points = 1 card copy.** Spending is manual: a "Trade 10 badges → card copy" button, so a rider can bank badges instead.
- Badge-bought copies are **not** subject to the 9-per-month grant cap (they are earned effort, like tier copies) and feed the same `copyLedger` total, so they become droppable copies on the Blacktop map.
- Wallet shows: total earned, spent, current balance, and progress to the next copy.

## Where it appears

- **Stats page** — a Badges section: grid of every badge with times earned, the balance, and the trade button.
- **Ride summary / receipt** — already renders earned badges; picks up the new types automatically via the shared badge info map.
- **Blacktop World card-drops panel** — adds "10 badges → 1 copy" to the list of ways to earn copies.
- **Demo showcase** — the badge slide updated to describe the new badges and the trade economy.

## Technical notes

- `src/types/convoy.ts`: widen `BadgeType`, extend `BADGE_INFO` with a `points` field, extend `calculateBadges` for the new convoy-relative badges (needs max lean / max g / corner score on `ConvoyMemberInfo`, falling back to skipping the badge when the value is absent).
- New `src/features/ride/lib/badgeWallet.ts`: localStorage-backed wallet (`bt.badge_wallet.v1`) holding per-badge counts and a spent counter; `recordBadges()`, `badgeBalance()`, `spendBadgesForCopy()`, plus a `blacktop-badges` event so UI re-renders.
- Solo/threshold badges computed at ride end in `useRideHistory.addRide` from the `RideSession` (lean, g-force, start hour, distance, rides-that-day) and recorded to the wallet; convoy badges recorded from the existing end-of-ride `calculateBadges` result.
- `src/features/cards/lib/dropEconomy.ts`: new `BADGES_PER_COPY = 10` and a `bt.card_badge_copies.v1` counter added to `copyLedger.total`, uncapped.
- New `BadgeWallet` component under `src/features/ride/components/`, rendered on Stats.
