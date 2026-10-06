import { useId } from 'react';
import { isThermal } from '@/lib/thermal';

/**
 * The band that orbits Home's globe and names what a tap on it opens (the map,
 * or Blacktop World), film-studio style: a tilted ring in the mode's colour,
 * its word running round the front and passing behind the globe. It's drawn in
 * two layers, one under the globe's canvas (`back`: the far half of the ring,
 * with the globe itself cut out of it) and one over it (`front`: the near half
 * and the lettering). Both fill the globe's box and spill a little past it,
 * inside the notch the buttons leave. The lettering stands still in Thermal
 * mode and for riders who ask for less motion.
 *
 * Units: the globe is a circle of radius 50 at the origin.
 */
// Kept tight to the globe: the ring's outer edge is 1.1 radii out, inside the notch the buttons leave at every globe size.
const RX = 51;
const RY = 13;
const TILT = -14;
const BAND = 8;
// From the top (behind the globe) round the left to the front, where it runs left to right.
const ORBIT = `M0,${-RY} A${RX},${RY} 0 0 0 ${-RX},0 A${RX},${RY} 0 0 0 0,${RY} A${RX},${RY} 0 0 0 ${RX},0 A${RX},${RY} 0 0 0 0,${-RY}`;
const CIRCUMFERENCE = 2 * Math.PI * Math.sqrt((RX * RX + RY * RY) / 2);

const WHITE = '0 0% 98%';
const GREY = '240 5% 62%';

/** Relative luminance of an `h s% l%` colour. */
function luminance(hsl: string): number {
  const [h, s, l] = hsl.replace(/[,%]/g, ' ').trim().split(/\s+/).map(Number);
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Title white or subheading grey, whichever reads better on the band. */
export const bannerInk = (band: string) => (contrast(GREY, band) > contrast(WHITE, band) ? GREY : WHITE);

export function GlobeBanner({ layer, word, color, dim }: { layer: 'back' | 'front'; word: string; /** The band's colour, as `h s% l%`. */ color: string; /** The lettering fades out while the word is being changed. */ dim?: boolean }) {
  const id = useId().replace(/:/g, '');
  const still = isThermal() || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const label = word.toLocaleUpperCase();
  // One "WORD ·" takes this much of the ring; enough of them to go all the way round, and one spare to slide in.
  const unit = Math.max(30, Array.from(label).length * 5.9 + 11);
  const count = Math.ceil(CIRCUMFERENCE / unit) + 2;

  return (
    <svg className="pointer-events-none absolute left-[-10%] top-[-10%] h-[120%] w-[120%] overflow-visible" viewBox="-60 -60 120 120" aria-hidden>
      <defs>
        <clipPath id={`${id}h`}>{layer === 'back' ? <rect x={-70} y={-40} width={140} height={40} /> : <rect x={-70} y={0} width={140} height={40} />}</clipPath>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={-70} y={-70} width={140} height={140}>
          <rect x={-70} y={-70} width={140} height={140} fill="white" />
          <circle r={50} fill="black" />
        </mask>
        <path id={`${id}o`} d={ORBIT} />
      </defs>
      <g mask={layer === 'back' ? `url(#${id}m)` : undefined}>
        <g transform={`rotate(${TILT})`}>
          <g clipPath={`url(#${id}h)`}>
            <path d={ORBIT} fill="none" stroke={`hsl(${color})`} strokeWidth={BAND} opacity={layer === 'back' ? 0.55 : 1} />
            {layer === 'front' && (
              <text style={{ opacity: dim ? 0 : 1, transition: 'opacity 180ms linear' }} fill={`hsl(${bannerInk(color)})`} fontSize={6} fontWeight={800} dominantBaseline="central" textLength={unit * count} lengthAdjust="spacing" letterSpacing="0.12em">
                <textPath href={`#${id}o`} startOffset={still ? -unit * 0.3 : 0}>
                  {/* Against the globe's spin: the lettering runs right to left across the front. */}
                  {!still && <animate attributeName="startOffset" from={0} to={-unit} dur={`${(unit / 9).toFixed(1)}s`} repeatCount="indefinite" />}
                  {Array.from({ length: count }, () => `${label} · `).join('')}
                </textPath>
              </text>
            )}
          </g>
        </g>
      </g>
    </svg>
  );
}
