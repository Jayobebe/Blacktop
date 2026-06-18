# Download Vehicle Card as Image

Add a download button to each vehicle card that exports it as a PNG, matching how the ride receipts are saved.

## Approach

Use the same `html-to-image` library already in the project (`toPng`) so behavior stays consistent with ride receipts. Each `VehicleCard` gets its own `ref` and a small download button overlaid in the top-left corner (mirroring the tier chip in the top-right). Tapping it serializes that card's DOM node to a PNG and triggers a browser download.

## Files to edit

- **`src/features/cards/components/VehicleCard.tsx`**
  - Add `useRef<HTMLDivElement>` on the card root.
  - Add a small circular icon button (`Download` from lucide-react) in the top-left of the card, styled the same as the tier chip but with the card's neutral chip background so it reads on every tier.
  - On click: call `toPng(ref.current, { cacheBust: true, pixelRatio: 3, backgroundColor: 'transparent' })`, create an `<a>` with `download="{vehicle-name}-{tier}-card.png"`, click it, show a `toast.success('Card downloaded')`. Wrap in try/catch with `toast.error('Could not save card')`.
  - Button is hidden during the export itself (set a `isExporting` state, hide button while true) so it doesn't appear in the saved image.
  - Locked cards still get the button so users can save their "X / 10 rides" progress card if they want — same behavior.

No other files change. The carousel, hook, and tier logic stay as-is.

## Filename format

`{slugified bike name}-{tier}-card.png`, e.g. `street-triple-gold-card.png`. Fall back to `vehicle-card.png` if the name is empty.

## Notes

- The card uses conic gradients and CSS variables; `html-to-image` handles both. We already use it successfully on the receipt which also has gradients and custom backgrounds.
- `pixelRatio: 3` matches the receipt export for crisp output on retina/share targets.
- No native share sheet — keep parity with the receipt's simple "download to device" flow.
