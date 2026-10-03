# Full-screen Card Wars

- Replacement lists show only cards not already equipped. Dog-tag lists omit equipped tags and incompatible powers.
- Fit the deck, battle arena, results and battle chooser within the available screen; only card and dog-tag selection lists scroll.
- Keep the two-over-three hands, side tags, complete card proportions and visible HP. Size each hand to the available space rather than stretch or clip cards.
- Keep Battle at the top and Forfeit as the only active-battle header action.

## Technical details
Use a viewport-sized Card Wars shell with measured available areas and proportionally sized hands/reveal. Keep long round histories out of the active arena and show the latest result without creating page scrolling. Verify replacement filtering and screen bounds in portrait and landscape, including the reveal animation.
