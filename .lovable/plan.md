# Slight player advantage in computer battles

- Match computer deck strength to the player's current five cards, including worn ratings, aiming for a 51% player win chance.
- Choose only real, earnable factory/race cards; do not alter their stats, random categories, damage, rewards or player-versus-player battles.
- Check balance with repeatable simulated battles across weaker, stronger and mixed decks. Treat 51% as a target, not a guaranteed outcome: card choices, dog tags and catalog limits affect actual results.

## Technical details
- Adjust computer deck generation in the existing offline engine only, using bounded pre-battle simulations to rank candidate decks.
- Keep the chosen deck persisted with the run and add regression checks for unique cards and unchanged combat rules.