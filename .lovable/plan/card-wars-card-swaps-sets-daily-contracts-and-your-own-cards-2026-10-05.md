# Card Wars: card swaps, sets, daily contracts, and your own cards

## 1. Card-for-card trading
- A trade has up to 5 slots on each side. Each slot holds a card, and either side can also add RPM.
- Flow: you open "Trade" and get a code or QR. The other rider scans it, and both of you fill your 5 slots. Each side taps **Ready**. When both are ready, the server swaps everything in one step.
- If anyone changes a slot, both sides go back to not ready, so nobody can sneak in a switch.
- Cards in a live battle, own vehicle cards and scanned rider cards can't be traded.
- An open trade expires after 30 minutes, and anything held is returned.
- The current "offer RPM for one card" sale stays as a quick option.

## 2. Sets (one per maker)
- Each maker's Road and Race cards make a set. The deck screen shows how close you are (for example, Porsche 1/2).
- Finishing a set gives you:
  - a one-off RPM bonus (scaled to the set's value, about 50–150 RPM)
  - a set badge on those cards
  - a **maker dog tag** (for example, a Porsche Overdrive) that's stronger with that maker's vehicles.
- The server checks what you own and pays each set once, ever. Losing a card by trading it keeps the badge but turns off the maker tag's bonus until you get it back.

## 3. Daily contracts
- 3 contracts a day, drawn by the server, worth about 10–25 RPM each.
- Examples:
  - Win a Corners round with a bike
  - Win 2 battles against the computer
  - Knock out a card with an F1 car
  - Use Second chance and win
  - Play a battle with a full-condition deck
  - Win a round during an event
- Progress comes from finished battles: the server settles player battles, and computer battles report results within the existing daily limits. They reset at midnight.

## 4. Your own vehicle card (and scanned rider cards)
Today they fight with their closest catalog card's ratings. The new system lets real riding count, scaled by the card's tier, as you asked.

**How it would work (my suggestion):**
- Each own card has a **catalog base**: its closest catalog match, as today.
- Your ride figures (top speed, peak G, max lean, distance, corner score) are turned into Card Wars ratings on the same scale.
- Only the **gap above the base** counts, multiplied by the tier:
  - Bronze 25%
  - Silver 50%
  - Gold 100%
  - Ruby 125%
  - Diamond 150%
  - Obsidian 200%
- Example: base Corners 60, your riding works out to 80, so the gap is 20. Gold gives 80, Silver 70, Obsidian 100 (capped).
- If your riding comes out below the base, the card just stays at the base. Riding never makes a card worse.
- Cap: no rating goes above 100, and the overall card stays at or below the strongest MotoGP or F1 card, so riding makes a card rewarding without making it unbeatable.

**Privacy and fairness:**
- If peaks are hidden (Public Road Privacy off), the card uses the catalog base only, as today.
- Player battles: the server can't check ride data, so the phone sends only the final 4–5 ratings, never the raw figures. The server limits them to the tier's cap and lets each own card change its ratings at most once a week. This stops edited ratings mid-season.
- Computer battles use the full ride-based ratings on the phone.
- Scanned rider cards use the stats from the QR (already shared by that rider) under the same tier rules. They can't be traded, as you said.

**Extra ideas (yes or no):**
- **Fresh tyres for real:** a card ridden in the last 7 days gets +5% (it's "warmed up").
- **Mileage veteran:** every 1,000 mi / 1,600 km on the vehicle adds +1 Distance, up to +10.
- **Tier-up moment:** when your garage card ranks up a tier, the Card Wars deck shows the new multiplier with a flash.

## Technical details
- New tables: `cw_swaps` (code, two players, ready flags, status, expiry) and `cw_swap_items` (side, card or RPM). RPC `cw_swap_*` settle both sides under one lock and hold RPM in escrow, matching the sale functions.
- `cw_sets_claimed` stores which sets have paid out. `cw_set_claim` checks `cw_owned` against `cw_catalog` grouped by maker (a manufacturer column gets added to `cw_catalog`). Maker tags are stored in `cw_tags` with a `maker:` card reference, and `cw_tag_value` learns the maker bonus.
- `cw_contracts` (user, day, 3 contract ids, progress, paid). `cw_contract_progress` is fed from `cw_pay_out` and `cw_reward_offline`, with computer-battle facts limited by the existing rate limits.
- Own cards: `lib/ownRatings.ts` (pure function: archetype, ride figures, tier → ratings, capped). `cw_action` create/join accepts optional `_own` ratings for `own:` slots, limited per tier against `cw_catalog`, plus `cw_own_cards` (user, card, ratings, set_at) with a 7-day change lock.
- Server cap probes for the new features. `demoGuard` gets the new write functions, and AGENTS.md gets the rules.
