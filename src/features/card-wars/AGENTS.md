# Card Wars rules

- Keep Card Wars round events in step between `lib/events.ts` (order, odds, numbers) and `cw_action` (event index + 1 in the log); a rapture restores the card server-side (player battles always, computer battles at most once a day), so a forged report gains little.
- Card sales go only through the `cw_trade_*` server functions, with offered RPM held in escrow and refunded on decline, cancel, expiry or delete, so cards and RPM always move together.
- Card-for-card swaps settle only in `cw_swap_ready` once both sides are ready, re-checking ownership and balances under lock; any slot change resets both, so nobody can switch what's offered.
- Own and scanned cards battle with `lib/ownRatings.ts` (catalog match plus the riding gap scaled by tier, capped at the catalogue's best per category and overall); player battles send only the finished ratings, which the server bounds and locks for 7 days in `cw_own_cards`.
- Daily contracts and maker sets are server-held (`cw_contracts`, `cw_contract_report`, `cw_sets`, `cw_set_claim`); battles report facts once per battle id, capped per day, so a forged report can earn at most a day's contracts.
