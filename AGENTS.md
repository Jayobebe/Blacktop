# Architecture rules

- Keep feature functionality behind its public feature exports and use the existing singleton-store pattern for shared client state, so eager screens do not pull in unrelated heavy dependencies.
- Treat the active ride store as the owner of accumulated G-force peaks; seed each ride sensor from that ride on mount and persist vector changes independently of total acceleration, so reopening views never starts the trace again.
- Keep radio playback in its existing singleton player and wheel gesture state local to the overlay, so tuning never creates competing audio elements.