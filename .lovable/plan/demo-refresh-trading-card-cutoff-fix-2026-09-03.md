# Demo Refresh & Trading Card Cutoff Fix

All work is in `src/pages/DemoShowcase.tsx` (mockups are hand-built JSX, no image files).

## 1. Fix Trading Cards cutoff
- In `TradingCardsMockup`, the fixed `aspect-[5/7]` card clips the bottom tier caption (`BRONZE · 10+ RIDES`).
- Fix: let card height flex (`min-h` instead of strict aspect, or shrink the inner photo/stat blocks), add bottom padding inside the card, and verify the "swipe to see every tier" hint below the carousel is fully visible within the slide's scroll area.

## 2. Rebuild the Blacktop World mockup
Current mockup still shows the removed global-events system (Fire / Volcano / Flood / Quake legend, "live rider globe" label).
- Remove the events legend and its dots.
- Keep the spinning globe with the anonymous rider-glow dots, but retitle it (e.g. "crew hub").
- Add floating landmark chips on/around the globe matching the real `World.tsx` landmarks: **Crew Convoys**, **Crew Leaderboards**, **Join Crew**, **Crew QR** (plus Arcade), styled like the in-app beacon chips (dot + uppercase label pill).
- Update the caption text under the mockup.

## 3. Refresh the remaining in-use mockups to match the current app
- **Convoy**: reflect current lobby — QR join, lobby chat, leadership handover, lock/unlock crew listing.
- **Maps**: show waypoint carousel (max 5, finish button on last stop), satellite + 3D toggles, weather radar, red/orange eye camera markers.
- **Tracking**: match the current Active Ride layout (big live speed, lean + G gauges, Distance/Time/Max stats).
- **Rescue**: rescue button placement away from End Ride; auto-rescue check-in flow.
- **History**: ride receipt, overlay download with mini-map, voice recording option, 3D flyover button.
- **Garage**: Mecha-Nick garage backdrop with the red pixel-art demo bike, maintenance bars, tier chip.
- **Personalise**: current settings grouping (Ride Metrics, Safety, Demo, car display, accent swatches).
- **Intro / Burn / Complete**: light copy polish only if stale.

## 4. Remove dead code
Delete mockup components no longer referenced by any slide: `SoloMockup`, `DiscordMockup`, `LeanAngleMockup`, `StudioMockup`, `VoiceMockup`, `WaypointsMockup`, `AutoRescueMockup`, `BadgesMockup`, `StatsMockup`, `CardTradingMockup`, `BlacktopArcadeMockup`, `MaintenanceMockup`, `BikeAssignmentMockup`, `ReceiptMockup` (and any now-unused imports), so the demo file only carries what it renders.

## 5. Verify
- `npm run build` passes.
- Playwright pass through every demo slide at mobile viewport, screenshotting each; confirm no text is clipped (esp. trading card tier captions) and the Blacktop World slide shows crew landmarks.

## Out of scope
- The UI upgrade discussion (user will raise separately).
