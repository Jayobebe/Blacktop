# Modern Pass: Noir + Chrome

The current screens read dated because everything is the same soft charcoal rectangle at the same elevation: uniform radius, uniform border, uniform text weight, no hierarchy, no craft in the details. The fix is not more blur — it is contrast, precision and restraint.

Layouts stay exactly as they are. This is a materials and typography pass only.

## Direction

Noir + Chrome, restrained depth (level 2). Black base, chrome/steel edges and highlights, your accent kept for signal only. Glass stays subtle — thin, crisp, precise, closer to machined metal than frosted plastic.

## What changes

**1. Deepen the base, brighten the edges**
- Background goes true noir (#08080a to #141416) instead of the current mid-charcoal, so panels read as objects sitting on darkness rather than blending into it.
- Panel fills get darker and less blurred; the definition comes from a hairline chrome stroke (top edge brighter than bottom, like light catching an edge) rather than from a flat 1px grey border.
- Reduce blur radius across the glass primitives. Depth 2 means clarity over frost.

**2. Real hierarchy between surfaces**
- Three distinct elevations instead of one: page background, resting tile, raised/interactive control. Each with its own fill, stroke brightness and shadow — currently they are nearly identical.
- Tighter, more consistent radii (large panels vs small controls should differ, not match).

**3. Typography with contrast**
- Keep Space Grotesk / DM Sans.
- Section labels: smaller, wider tracking, dimmed chrome-grey — currently they compete with content.
- Numerics: larger, tighter, tabular, near-white. Stats should be the loudest thing on screen, not the labels.
- Reduce the number of type sizes in play so screens feel composed rather than assembled.

**4. Chrome details (the "not vibe coded" part)**
- Hairline separators at 1px with a gradient fade instead of flat lines.
- Icon treatment unified: single weight, single size scale, muted chrome by default and accent only when active.
- Pressed/active states get a real physical response (slight inset, edge highlight shift) rather than an opacity change.
- Focus rings restyled to match the chrome language.

**5. Accent discipline**
- Accent (your amber, or whatever the user picks) reserved for live/active/danger states and primary CTAs only. Everywhere else goes chrome. Right now accent is sprinkled on labels and icons, which flattens its meaning.
- Burn button colour untouched.

## Scope

- Tokens and primitives: `src/index.css`, `tailwind.config.ts`
- Shared components: Card, Button, CollapsibleSection, separators
- Screen-level touch-ups where a surface still hardcodes old colours: Home, Settings, Lobby, Stats, Ride History
- Active Ride, maps, car display and the recorded overlay keep their current readability rules — only colour tokens flow through, no layout or contrast regressions there.

## Technical notes

- All values land as HSL semantic tokens; no hardcoded colour utilities in components.
- Tyre-mark texture stays but drops to background only, at lower opacity, so it never sits under text.
- Blur budget lowered (backdrop-filter is the main perf cost on mid-range Android during rides); glass primitives get a reduced-blur fallback for low-power conditions.
- Verification: typecheck, production build, and Playwright screenshots of Home, Settings, Stats and Active Ride in both portrait and landscape.
