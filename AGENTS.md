# Architecture rules

- Keep feature functionality behind its public feature exports and use the existing singleton-store pattern for shared client state, so eager screens do not pull in unrelated heavy dependencies.
- Treat the active ride store as the owner of accumulated G-force peaks; seed each ride sensor from that ride on mount and persist vector changes independently of total acceleration, so reopening views never starts the trace again.
- Keep radio playback in its existing singleton player and wheel gesture state local to the overlay, so tuning never creates competing audio elements.
- Keep Card Wars offline runs and rewards in a Burn-cleared singleton vault, with deck editing confined to the game and a lightweight collection export for read-only won cards; resolve player battles through locked server operations using catalog ratings, never client scores or road telemetry, to prevent point forgery and privacy leaks.
- Place Card Wars navigation under Arcade, retaining a query-preserving redirect for legacy World invitations so existing battle links remain valid.
- Keep Card Wars artwork and manufacturer/vehicle presentation separate from authoritative catalog ratings; reuse saved collection images without uploading telemetry or changing battle scoring.
- Keep battle choices category-blind and reveal server-settled rounds through a cancellable presentation sequence; the arena never calculates online damage or transfers points.
