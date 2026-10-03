# Card Wars: real trading cards and a proper battle arena

## Trading cards
- Match the normal demo trading card: the same frame, vehicle picture area, vehicle name, manufacturer line, tier chip and boxed statistics.
- Factory cards use Silver; race-spec cards use Ruby. Collected cards keep their earned tier.
- Keep pictures ready for your manual artwork; do not invent vehicle photos or manufacturer specifications.
- Cars never display lean-angle statistics. Keep health bars immediately below every battle card, visible throughout the round.

## Battle layout
- Show the opponent’s five cards at the top and your five at the bottom in portrait; opponent on the right and you on the left in landscape.
- Use a central showdown area with both chosen cards and a Forza-style scrolling category wheel.
- Keep deck editing separate from the arena, inside Card Wars, with clear selected cards and dog tags.

## Round flow — both modes
1. Both sides select a living card while the category is hidden; the computer commits without knowing the category.
2. Lock choices, then spin the wheel to reveal the category.
3. Show the compared ratings, then animate the winning card striking the losing card and returning.
4. Shake the damaged card, vibrate supported phones, and update its health bar.
5. Continue to the next round, or show the outcome and the existing computer-only card reward shuffle.

Keep the existing five-round format, rare penalties, dog-tag powers, computer rewards and player Overdrive stakes. No cards are stolen in player battles.

## Technical details
- Reuse the normal card’s tier styles and boxed-stat presentation through the shared battle-card renderer.
- Separate card selection, wheel reveal, impact and round completion into explicit stages; avoid duplicate submissions or rewards on reload.
- Update player battle operations so the server hides the category until both choices are locked; authoritative damage and points remain server-controlled. Inspect the deployed operation before changing it because its definition is not present in the current local files.
- Respect reduced motion and Thermal Mode; keep animations short-lived and stop timers on exit.
- Verify portrait and landscape arena rendering, computer selection/reveal/impact/reward flow, and player operation responses. Two-phone testing will be reported separately if unavailable.
