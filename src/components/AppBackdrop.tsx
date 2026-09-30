import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings';
import { createBackdropRenderer, ROW_HEIGHT } from '@/lib/backdropGL';
import {
  registerBackdropBelts,
  registerBackdropRenderer,
  scrollBackdrop,
  setBackdropFlat,
  setBackdropFrozen,
} from '@/lib/backdropMotion';

/**
 * The app-wide backdrop, fixed behind every screen. Bottom to top:
 *   1. Lava-lamp glow: very soft accent blobs slowly drifting, bouncing and
 *      growing. Pure radial gradients moved with transforms (no blur filter),
 *      so they're cheap to animate.
 *   2. "BLACKTOP" wordmark, small and tightly packed, seen through an
 *      elongated fish-eye lens bigger than the screen. It's exactly the
 *      background colour, so it's invisible except where a blob's light shines
 *      through the gaps between letters. Every row is a conveyor belt drifting
 *      slowly left or right (alternating, each at its own speed), and the rows
 *      form an endless vertical loop that follows page scrolling through the
 *      lens. Drawn on the GPU by lib/backdropGL (one WebGL quad) and driven by
 *      lib/backdropMotion; without WebGL, plain CSS rows with no lens.
 *   3. Mist: grain, haze and a soft vignette, for a frosted-glass finish.
 *
 * `paused` freezes it (while the map covers everything) to save battery; `flat`
 * drops the lens and draws fewer frames (the ride screens, on all ride).
 */

/** Extra fallback rows above and below the screen, so wrapping rows are never seen. */
const ROW_OVERSCAN = 10;
/** One belt period. Rendered twice per row and scrolled by half, so it loops seamlessly. */
const ROW_TEXT = Array.from({ length: 40 }, () => 'BLACKTOP ').join('');

const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const belt = (r: number) => ({
  reverse: r % 2 === 1,
  duration: 110 + Math.round(hash(r + 1) * 90),
  delay: -Math.round(hash(r + 101) * 200),
});

/**
 * Feed every vertical scroll in the app (window or any inner scroller) to the
 * backdrop as a delta. Jumps bigger than a screen (scroll restoration, a new
 * page resetting to the top) are ignored rather than whipping the rows past.
 */
function useScrollFollow(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const last = new WeakMap<object, number>();
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : (e.target as Element | null);
      if (!el) return;
      const top = el.scrollTop;
      const prev = last.get(el) ?? 0;
      last.set(el, top);
      const delta = top - prev;
      if (Math.abs(delta) < window.innerHeight) scrollBackdrop(delta);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [enabled]);
}

/** The GPU wordmark, or false once WebGL has turned out unavailable (then the CSS rows draw it). */
function useGpuWordmark(canvas: React.RefObject<HTMLCanvasElement>, probe: React.RefObject<HTMLDivElement>) {
  const [ok, setOk] = useState(true);
  useLayoutEffect(() => {
    if (!canvas.current || !probe.current) return;
    const r = createBackdropRenderer(canvas.current, probe.current);
    if (!r) {
      setOk(false);
      return;
    }
    registerBackdropRenderer(r);
    // Size from the canvas's own box (window resize events miss some viewport changes).
    let timer: number | undefined;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        r.resize();
        registerBackdropRenderer(r);
      }, 100);
    });
    ro.observe(canvas.current);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      registerBackdropRenderer(null);
      r.dispose();
    };
  }, [canvas, probe]);
  return ok;
}

function FallbackRows() {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rows = useMemo(
    () => Array.from({ length: Math.ceil(viewportHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2 }, (_, r) => belt(r)),
    [viewportHeight],
  );
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    registerBackdropBelts({ root, slots: Array.from(root.children) as HTMLElement[], rowHeight: ROW_HEIGHT, viewportHeight });
    return () => registerBackdropBelts(null);
  }, [rows, viewportHeight]);
  return (
    <div ref={ref} className="backdrop-wordmark">
      {rows.map((b, r) => (
        <div key={r} className="backdrop-belt-slot">
          <div className={cn('backdrop-belt', b.reverse && 'backdrop-belt-reverse')} style={{ animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}>
            <span>{ROW_TEXT}</span>
            <span>{ROW_TEXT}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const AppBackdrop = memo(function AppBackdrop(props: { paused?: boolean; front?: boolean; flat?: boolean }) {
  const { settings } = useSettings();
  // Thermal / High-Speed Mode: no WebGL, no blobs, no mist; plain black.
  if (settings.thermalMode) return <div aria-hidden className={cn('pointer-events-none fixed inset-0 bg-black', props.front ? 'z-[999]' : '-z-10')} />;
  return <LiveBackdrop {...props} />;
});

function LiveBackdrop({ paused = false, front = false, flat = false }: { paused?: boolean; front?: boolean; flat?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const gpu = useGpuWordmark(canvasRef, probeRef);

  useEffect(() => setBackdropFlat(flat), [flat]);
  useEffect(() => setBackdropFrozen(paused), [paused]);
  useScrollFollow(!paused);

  return (
    // `front`: over the page (under the map overlay) while the map loads, so the backdrop is the loading screen.
    <div ref={probeRef} aria-hidden className={cn('app-backdrop pointer-events-none fixed inset-0 overflow-hidden', front ? 'z-[999]' : '-z-10', paused && 'lava-paused')}>
      {/* 1. Lava lamp — kept dim: even a screen-filling blob only just reveals the wording */}
      <div className="absolute inset-0 opacity-60">
        <span className="lava-blob lava-blob-1" />
        <span className="lava-blob lava-blob-2" />
        <span className="lava-blob lava-blob-3" />
        <span className="lava-blob lava-blob-4" />
        <span className="lava-blob lava-blob-5" />
      </div>

      {/* 2. Wordmark through the fish-eye lens (GPU), or plain rows */}
      {gpu ? <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" /> : <FallbackRows />}

      {/* 3. Mist */}
      <div className="backdrop-mist" />
    </div>
  );
}
