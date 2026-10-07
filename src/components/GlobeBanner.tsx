import { useEffect, useId, useRef } from 'react';
import { isThermal } from '@/lib/thermal';

/**
 * The band that orbits Home's globe and names what a tap on it opens (the map,
 * or Blacktop World), film-studio style: a tilted ring in the mode's colour,
 * its word (white, with a hairline of black so it reads on any accent)
 * running round the front and passing behind the globe. It's drawn in
 * two layers, one under the globe's canvas (`back`: the far half of the ring,
 * with the globe itself cut out of it) and one over it (`front`: the near half
 * and the lettering). Both fill the globe's box and spill a little past it,
 * inside the notch the buttons leave. The lettering stands still in Thermal
 * mode and for riders who ask for less motion.
 *
 * When the globe changes what it opens, the band goes with it: its colour
 * fades to the new one over the same time as the globe's, and the lettering
 * whips round (`burst`) and coasts back to its usual pace while its word
 * changes. The lettering is moved from one small loop here (not SMIL, whose
 * speed can't be changed mid-run), ~30 times a second, every frame during a
 * burst, and not at all while the band is off screen or the page hidden.
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

/** The lettering's usual pace and the burst on top of it (ring units a second), and how long the burst takes to ease away. */
const PACE = 9;
const BURST_PEAK = 150;
const BURST_MS = 1500;
/** The same as the globe's own colour blend (HomeGlobe COLOR_MS). */
const COLOR_MS = 900;

const WHITE = '0 0% 98%';

export function GlobeBanner({ layer, word, color, dim, burst }: { layer: 'back' | 'front'; word: string; /** The band's colour, as `h s% l%`. */ color: string; /** The lettering fades out while the word is being changed. */ dim?: boolean; /** Changes to this send the lettering round fast for a moment (the globe's own burst). */ burst?: number }) {
  const id = useId().replace(/:/g, '');
  const still = isThermal() || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const label = word.toLocaleUpperCase();
  // One "WORD ·" takes this much of the ring; enough of them to go all the way round, and one spare to slide in.
  const unit = Math.max(30, Array.from(label).length * 5.9 + 11);
  const count = Math.ceil(CIRCUMFERENCE / unit) + 2;

  const svg = useRef<SVGSVGElement>(null);
  const run = useRef<SVGTextPathElement>(null);
  const motion = useRef({ offset: 0, burstAt: -1e9, unit });
  motion.current.unit = unit;
  const first = useRef(true);
  useEffect(() => {
    // Not on mount: only when the globe is switched.
    if (first.current) {
      first.current = false;
      return;
    }
    motion.current.burstAt = performance.now();
  }, [burst]);
  useEffect(() => {
    if (layer !== 'front' || still) return;
    let raf = 0;
    let last = performance.now();
    let drawn = 0;
    let seen = true;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => (seen = e.isIntersecting)) : null;
    if (svg.current) io?.observe(svg.current);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!seen || document.hidden) return;
      const m = motion.current;
      const since = now - m.burstAt;
      const bursting = since >= 0 && since < BURST_MS;
      // Eases away like the globe's own burst: fast off the release, coasting back to the usual pace.
      const speed = PACE + (bursting ? BURST_PEAK * (1 - since / BURST_MS) ** 2 : 0);
      // Against the globe's spin: the lettering runs right to left across the front.
      m.offset = (m.offset - speed * dt) % m.unit;
      if (!bursting && now - drawn < 33) return;
      drawn = now;
      run.current?.setAttribute('startOffset', m.offset.toFixed(2));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [layer, still]);

  return (
    <svg ref={svg} className="pointer-events-none absolute left-[-10%] top-[-10%] h-[120%] w-[120%] overflow-visible" viewBox="-60 -60 120 120" aria-hidden>
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
            <path d={ORBIT} fill="none" style={{ stroke: `hsl(${color})`, transition: still ? undefined : `stroke ${COLOR_MS}ms ease-in-out` }} strokeWidth={BAND} opacity={layer === 'back' ? 0.55 : 1} />
            {layer === 'front' && (
              <text style={{ opacity: dim ? 0 : 1, fill: `hsl(${WHITE})`, stroke: '#000', strokeWidth: 0.7, strokeLinejoin: 'round', paintOrder: 'stroke', transition: 'opacity 180ms linear' }} fontSize={6} fontWeight={800} dominantBaseline="central" textLength={unit * count} lengthAdjust="spacing" letterSpacing="0.12em">
                <textPath ref={run} href={`#${id}o`} startOffset={still ? -unit * 0.3 : 0}>
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
