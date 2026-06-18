## Goal

Bring `DemoShowcase.tsx` (the 16-slide animated walkthrough) up to date with features recently added since it was last touched.

## New features missing from the demo

1. **Mecha-Nick's Garage** — multi-bike support, hero photos, diorama, per-bike stats.
2. **Maintenance Tracker** — service intervals per part with progress bars and a "Serviced" reset action.
3. **Per-Ride Bike Assignment** — drop-down in Ride History to assign a ride to a specific bike; stats roll up into that bike's garage panel.

## Slides to add

Insert three new slides between the existing `stats` slide and the `privacy` slide (so they appear with the other "personal data" features):


| #   | id                | Title                 | Subtitle                 | Mockup                                                                                                                                                |
| --- | ----------------- | --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `garage`          | Mecha-Nick's Garage   | Your Bikes, Your Stats   | Diorama-style card with a pixel bike silhouette + bike name + odometer using the user's unit                                                          |
| 2   | `maintenance`     | Maintenance Tracker   | Never Miss a Service     | List of parts (Chain lube, Engine oil, Brake pads) with animated progress bars; one bar fills to ~85% then resets to 0% to demo the "Serviced" action |
| 3   | `bike-assignment` | Assign Rides to Bikes | History Knows Which Bike | History row mockup with an animated drop-down opening to pick a bike; arrow showing the ride's distance flowing into that bike's garage stats         |
| 4   | &nbsp;            | &nbsp;                | &nbsp;                   | &nbsp;                                                                                                                                                |


All three reuse the existing slide scaffolding (icon, color, mockup component) and the `formatSpeed` / `formatDistance` helpers so the demo itself respects the user's unit setting.

## Implementation notes (technical)

- File touched: `src/pages/DemoShowcase.tsx` only.
- Add 3 entries to the `features` array in the correct position.
- Add 3 small mockup components at the bottom of the file, matching the visual style of the existing ones (rounded card, accent borders, lucide icons, small CSS-only animations driven by `animationKey` / `setInterval` where useful).
- New lucide icons needed: `Wrench`, `Bike` (or reuse `Settings` / `Gauge`).
- No changes to routing, no new dependencies, no backend changes.
- Keep total slide count at 19 (was 16 → 19). Progress dots already render dynamically from the array length, so no other UI changes required.

## Out of scope

- No edits to the live Garage, Maintenance, History, or Settings screens — those already work; this is purely demo/onboarding content.
- No changes to the cinematic intro/outro slides.