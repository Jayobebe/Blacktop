# Blacktop UI Revamp — Frosted Glass, Liquid Foreground

A polished glassmorphic pass: frosted, tyre-marked background layers over dark graphite/black/silver, with clean "liquid" foreground surfaces. Accent colour stays user-chosen; the Burn button keeps its existing red identity untouched.

## Visual direction

- **Background (frosted):** layered near-black to graphite gradient with a silver sheen, a fine noise/frost grain, and whisper-level stylised tyre-mark texture (3-5% opacity) — background only, never on foreground panels.
- **Foreground (liquid):** clean translucent panels — soft blur, a single hairline top highlight, subtle inner shadow, generous radius. No texture, no heavy borders, no drop-shadow stacking.
- **Accent:** driven by the existing user accent token (default amber). Burn keeps `--burn` / `--burn-glow` exactly as-is.
- **Type:** Space Grotesk for headings/numerics, DM Sans for body. Tabular numerals for all live stats so speed/lean/G values don't jitter.
- **Restraint rules:** one glass elevation per screen region, no rainbow gradients, no glow unless it carries meaning (speaking, alerts, thresholds).

## Scope — pass one (tokens + core surfaces)

1. **Design tokens** — add frost/liquid layer tokens (surface tints, blur levels, hairline highlight, silver stroke, elevation shadows) and register the fonts. Existing semantic tokens keep their names so nothing breaks.
2. **Shared glass primitives** — a small set of reusable classes/variants (`glass-panel`, `glass-tile`, `glass-control`) plus a background component that renders the frost + tyre-mark layer, so screens compose instead of restyling ad hoc.
3. **shadcn variants** — Card, Button, Switch, Dialog/Sheet, Tabs, Input get glass-aware variants so the look propagates automatically.
4. **Core screens** — Home, Settings, Lobby restyled onto the new primitives.
5. **Later passes (not this plan):** Active Ride, Stats/Ride History, Garage, Trading Cards, Blacktop World.

## Constraints

- Behaviour, layout structure, routing, and data logic unchanged — presentation only.
- Active Ride legibility rules (large speed cluster, glove-friendly targets, high contrast) are preserved; no blur behind critical live numbers.
- Map overlays stay readable: controls get liquid-glass treatment but no background texture over map tiles.
- Car Display mode and recorded overlay rendering keep their current dark, contrast-first styling.
- Colour utilities stay semantic — no hardcoded hex in components.

## Technical notes

- Tokens in `src/index.css` (HSL) + `tailwind.config.ts` extensions for blur, radius, shadows, and the two font families.
- Tyre-mark texture as an inline SVG/CSS layer (no image asset weight), masked and opacity-capped.
- Blur is capped and applied to a bounded number of layers per screen to protect mid-range Android performance during active rides.
- Verification: typecheck, production build, and Playwright screenshots of Home, Settings, and Lobby in portrait and landscape.
