# Architecture rules

- Keep Arcade tour scenes demo-only and on the shared scene kit, so the tour never imports game engines or live gameplay state.

- Keep feature functionality behind its public feature exports and use the existing singleton-store pattern for shared client state, so eager screens do not pull in unrelated heavy dependencies.
- Treat the active ride store as the owner of accumulated G-force peaks; seed each ride sensor from that ride on mount and persist vector changes independently of total acceleration, so reopening views never starts the trace again.
- Keep radio playback in its existing singleton player and wheel gesture state local to the overlay, so tuning never creates competing audio elements.
- Keep Card Wars offline runs and rewards in a Burn-cleared singleton vault, with deck editing confined to the game and a lightweight collection export for read-only won cards; resolve player battles through locked server operations using catalog ratings, never client scores or road telemetry, to prevent point forgery and privacy leaks.
- Place Card Wars navigation under Arcade, retaining a query-preserving redirect for legacy World invitations so existing battle links remain valid.
- Keep Card Wars artwork and manufacturer/vehicle presentation separate from authoritative catalog ratings; reuse saved collection images without uploading telemetry or changing battle scoring.
- Normalize supplied Card Wars cutouts to a shared transparent canvas, visible width and baseline before asset upload; resolve missing saved-run artwork from the catalog without changing saved battle data.
- Keep battle choices category-blind and reveal server-settled rounds through a cancellable presentation sequence; the arena never calculates online damage or transfers points.

- Reuse the vault card face for battle cards and all dog-tag selectors, scaling the complete face at a stable design size and injecting game ratings separately from private ride statistics.
- Size battle hands through identical two-over-three grids with reserved tag rails and intrinsic card ratios; fit them to available viewport areas without stretching, and limit scrolling to replacement lists.

- Animate reward cards by stable identity through measured slot swaps and persist the settled shuffle flag with the run, so selection and reopening keep the same card positions.
- Edit decks through indexed replacement dialogs sharing the battle hand grid; resolve normal combat only on whole-deck knockout, keeping player settlement server-authoritative.
- Keep one server-held Card Wars condition per card, changed only by locked settlement and a rate-limited offline report, with the vault caching it, so clients can never forge or split condition.
- Keep Card Wars RPM, card ownership, purchases and every wheel spin on the server (cw_buy, cw_spin, cw_reward_offline, cw_owned), with player battles rejecting unowned bank cards, so the economy cannot be forged on the phone.
- Let the Card Wars shop own its single page header and flex-sized content area, with scrolling only in the product list, so nested headers and viewport clipping cannot recur.
- Match computer decks through bounded, category-blind pre-battle simulations of current player ratings; never alter catalog stats or live outcomes, so difficulty tuning stays separate from rewards and PvP settlement.
