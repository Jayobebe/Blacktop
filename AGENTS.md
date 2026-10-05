# Architecture rules

- Keep Arcade tour scenes demo-only and on the shared scene kit, so the tour never imports game engines or live gameplay state.

- Keep feature functionality behind its public feature exports and use the existing singleton-store pattern for shared client state, so eager screens do not pull in unrelated heavy dependencies.
- Treat the active ride store as the owner of accumulated G-force peaks; seed each ride sensor from that ride on mount and persist vector changes independently of total acceleration, so reopening views never starts the trace again.
- Keep radio playback in its existing singleton player and wheel gesture state local to the overlay, so tuning never creates competing audio elements.
- Keep Card Wars offline runs and rewards in a Burn-cleared singleton vault, with deck editing confined to the game and a lightweight collection export for read-only won cards; resolve player battles through locked server operations using catalog ratings, never client scores or road telemetry, to prevent point forgery and privacy leaks.
- Place Card Wars navigation under Arcade, retaining a query-preserving redirect for legacy World invitations so existing battle links remain valid.
- Keep Card Wars artwork and manufacturer/vehicle presentation separate from authoritative catalog ratings; reuse saved collection images without uploading telemetry or changing battle scoring.
- Trim supplied Card Wars cutouts to visible bounds and fit them proportionally inside a centered dedicated photo area; resolve missing saved-run artwork from the catalog without changing saved battle data.
- Keep battle choices category-blind and reveal server-settled rounds through a cancellable presentation sequence; the arena never calculates online damage or transfers points.

- Draw every Card Wars card with the one `CwCard` face (thumb, tile or full, sized by container units) and every dog tag with `DogTagPlate`; game ratings stay separate from private ride statistics.
- Keep the battle on one screen without scrolling: each hand is a strip of five, the table between them shows the round, and cards move between the two by measured flights; all motion stops under Thermal mode and reduced motion.

- Animate reward cards by stable identity through measured slot swaps and persist the settled shuffle flag with the run, so selection and reopening keep the same card positions.
- Edit decks from the Card Wars home (`Garage`) through its sheets; resolve combat only on whole-deck knockout (or the stalemate draw), keeping player settlement server-authoritative.
- Keep one server-held Card Wars condition per card, changed only by locked settlement and a rate-limited offline report, with the vault caching it, so clients can never forge or split condition.
- Queue computer-battle wear reports with the vault and send them oldest first; never block a new battle on the queue, never overwrite pending condition with a stale read, and drop a report the server refuses for good.
- Keep Card Wars RPM, card ownership, purchases and every wheel spin on the server (cw_buy, cw_spin, cw_reward_offline, cw_owned), with player battles rejecting unowned bank cards, so the economy cannot be forged on the phone.
- Give each Card Wars page the app's scrolling page layout and one `PageHeader`; only the battle is fixed to the screen.
- Match computer decks through bounded, category-blind pre-battle simulations of current player ratings, without the player's own cards where others their size exist; never alter catalog stats or live outcomes.
- Keep Card Wars numbers in step across `lib/rules.ts`, `lib/catalog.ts` (`BALANCE`, `SPIN_COST`), `lib/tagRules.ts` and the server (`cw_rules`, `cw_catalog`, `cw_spin_cost`, `cw_tag_value`): change them with `npm run cardwars:balance` and a migration together, never one side alone.
- Card Wars artwork lives in `public/card-wars/<cars|bikes>/<id>.png` (made by `scripts/make-card-wars-art.py`), not in `src/assets`; every user-facing string is a literal `tr("…")`, never `tr(variable)`.
- Keep Card Wars round events in step between `lib/events.ts` (order, odds, numbers) and `cw_action` (event index + 1 in the log); a rapture restores the card server-side (player battles always, computer battles at most once a day), so a forged report gains little.
- Card sales go only through the `cw_trade_*` server functions, with offered RPM held in escrow and refunded on decline, cancel, expiry or delete, so cards and RPM always move together.
