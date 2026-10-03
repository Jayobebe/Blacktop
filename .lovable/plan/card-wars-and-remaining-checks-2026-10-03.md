# Card Wars and remaining checks

## Controls and receipts
- Finish checking the radio wheel changes: tap to tune, drag to rotate, shortest-path movement between stations, and access while the map is open.
- Keep the receipt's small G-force ink stamp on the left and Mecha-Nick stamp on the right of the vehicle photo. Keep earned badges compact below the photo.
- Preserve the ride's G-force trace and peaks through map opening, closing and ride resumption; reset only for a new ride. The ride must keep collecting readings while covered by the map.

## Card Wars
Keep the entire experience inside opt-in Blacktop World, including its deck builder and battle invitations. No new Home tile or onboarding clutter.

### Deck and combat
- Build a deck in the vault with five vehicle cards and three dog tags. Each card has a health bar; knocked-out cards cannot be played again during that battle.
- Five rounds per battle, with a randomly chosen eligible telemetry category each round. Hidden or unavailable peaks never become zero or get revealed to another player; use balanced fictional game ratings for those categories instead.
- Dog tags grant one-use reroll, heal or damage powers. Matching vehicle types activate Ghost Tag Resonance.
- Penalty events occur in roughly one in eight battles, never in round one, and are shown before committing a card.

### Computer battles
- Opponents use labelled factory-machine and race-spec cards for cars and motorcycles. Game ratings are fictional, not claimed manufacturer specifications or real ride records.
- After a win, show the opponent's cards face-up, flip them down, visibly shuffle their positions, then let the winner pick exactly one to keep. Revealing the chosen card completes the reward; replaying or reloading cannot award extras.
- Reduced-motion players get a short fade and shuffle instead of moving cards.

### Player battles
- Invite another rider through a private battle code or QR, without publishing location. Disable real joining and scanning in demo mode and while riding.
- Use Overdrive as non-purchasable, non-cash game points. Start with a fixed, modest stake shown to both players before accepting; no card theft and no computer-style reward pick.
- Resolve rounds, balances, disconnects and rewards on the server so a modified phone cannot award itself points. Repeated settlement is safe; abandoning an accepted battle must not erase a loss. Network interruptions allow reconnection before a clearly displayed timeout.
- Computer battles remain available offline; player battles require a connection.

### Collection progression
- Five starting relics, with the Demo card unlocked after ten hours of recorded riding and the developer card after fifty. Show progress in the vault, not during a ride.
- Leave room for future influencer cards without inventing identities or photographs now.

## Technical details
- Use a dedicated feature module with a public barrel, existing design controls, translations, semantic colours and the module-store pattern.
- Store local deck/reward state under the app's existing Burn-cleared key prefixes; account-linked battle data must cascade on account deletion.
- Player battle tables need explicit grants, RLS and validated server operations. Gate new server functionality on deployment capability and add new write operations to the demo guard.
- Keep card artwork within Blacktop's existing vehicle-card presentation; distinguish fictional battle ratings from private riding telemetry.
- No manual builds or preview runs. Check source syntax, focused engine simulations and existing automatic error reports; real phone/interaction checks remain unverified unless requested.