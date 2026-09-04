# More ways to earn card copies

New copy-earning triggers, all feeding the existing `copyLedger` in `src/features/cards/lib/dropEconomy.ts`, with a hard economy cap of **4 copies per calendar month (~1 per week)** so drops stay scarce.

## New triggers

1. **Card collecting** — every 5 unique card drops you collect (from `card_drop_collections` rows where you're the collector) earns 1 copy of your own card. People collecting *your* drops grants you nothing.
2. **Ride streaks** — ride on 3+ consecutive days → 1 copy. Re-earnable only after the streak resets (one copy per streak run).
3. **Crew challenges** — keep the existing weekly-challenge copy; extend so completing *any* crew challenge (not only the first per week) counts toward the ledger, still subject to the monthly cap.

## Monthly cap (economy)

- Ledger gains a `monthlyBudget`: max 4 earned copies per calendar month across **all** triggers (tier milestones keep their historical copies already earned, but new grants of any kind stop once the month budget is spent).
- When a trigger fires but the monthly budget is exhausted, show a toast: "Copy bank full — 4/month max. Resets on the 1st."
- Cap state tracked in a new localStorage bucket keyed by month (`bt.card_copy_month.v1`), counting grants per month. Crew challenge grants get folded into the same counter.

## Implementation

**Client (`src/features/cards/lib/dropEconomy.ts`)**
- Add `grantCollectCopy(count)` (idempotent per 5-collect threshold: thresholds 5, 10, 15… persisted like challenge copies), `grantStreakCopy(streakKey)`, and a shared `monthlyGrantsRemaining()` gate that all three triggers check before granting.
- `copyLedger()` total becomes `1 + tierCopies + claimedChallengeWeeks + claimedCollectMilestones + claimedStreaks`, with all claim lists filtered into months that had budget.
- Fix the `copyIndex: placedCount + 3` placeholder in `BlacktopMap.tsx:1018` to derive from the actual ledger sequence.

**Streak tracking (new, `src/features/ride/lib/rideStreak.ts`)**
- On ride end (existing ride-session completion path), append the ride's local date to a persisted day set; compute current consecutive-day run; when run length hits 3, call `grantStreakCopy` keyed by streak start date.

**Collections count (`src/features/cards/hooks/useCardDrops.ts`)**
- After a successful `collect_card_drop` call, read the collector's own collection count (RPC or count query on `card_drop_collections` filtered to `collector_id = auth.uid()` — SELECT policy already allows own rows) and call `grantCollectCopy` when crossing a multiple of 5.

**Server (migration)**
- Small RPC `my_card_collection_count()` (security definer, returns count of `card_drop_collections` for `auth.uid()`) so the client gets the true server-side count in one call. GRANT execute to authenticated. No new tables.

**UI**
- Vault / World view: small "copies this month: X/4" indicator near the drop counter.
- Toast copy on each grant states the source: "Collector's bonus — card copy earned", "3-day streak — card copy earned".

## Verification

- Lint + build clean.
- Simulated flows: collect 5 drops → copy granted; 3 consecutive ride days → copy granted; 5th grant attempt in one month → blocked with toast.
