import { useEffect, useRef, type CSSProperties } from 'react';
import { geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';
import { cn } from '@/lib/utils';
import { isThermal } from '@/lib/thermal';

// Pre-extract the world land outline once at module load. Stroking these
// polygons (no fill) draws thin coastlines; the 110m resolution keeps the
// per-frame path cheap enough to redraw at 60fps on a small mobile canvas.
const land = feature(
  landTopo as unknown as Parameters<typeof feature>[0],
  (landTopo as unknown as { objects: { land: unknown } }).objects.land as never,
) as unknown as GeoPermissibleObjects;

const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

// Visual tuning.
const ROTATION_DEG_PER_SEC = 6; // slow, ambient spin
const AXIS_TILT_DEG = 18; // slight tilt so it reads as a globe, not a clock face
const COASTLINE_WIDTH = 0.7;
const RIM_WIDTH = 1.0;

interface HomeGlobeProps {
  /** Concrete color string (canvas can't read CSS vars) for coastlines + rim. */
  accentColor: string;
  /** Changes to this start a burst: the globe whips round about once more and settles back to its usual spin. */
  burst?: number;
  className?: string;
}

/** The burst: how fast it starts (degrees a second) and how long it takes to ease away. */
const BURST_PEAK = 760;
const BURST_MS = 1500;
/** A change of colour is blended over this long, round the colour wheel the short way. */
const COLOR_MS = 900;

type Hsl = [number, number, number];
const parseHsl = (c: string): Hsl | null => {
  const m = c.match(/-?\d+(\.\d+)?/g);
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : null;
};
const mixHsl = (a: Hsl, b: Hsl, t: number): string => {
  const dh = ((((b[0] - a[0]) % 360) + 540) % 360) - 180;
  return `hsl(${(a[0] + dh * t + 360) % 360}, ${a[1] + (b[1] - a[1]) * t}%, ${a[2] + (b[2] - a[2]) * t}%)`;
};

/** The same glass as the ride tiles (the global bg-card frost rule). */
const LAND_FROST: CSSProperties = {
  backgroundColor: 'hsl(var(--card) / 0.5)',
  backdropFilter: 'blur(18px) saturate(150%)',
  WebkitBackdropFilter: 'blur(18px) saturate(150%)',
  clipPath: 'inset(50%)', // nothing until the first frame cuts the land out
};

/**
 * A slowly rotating orthographic-projection globe: faint sphere fill for the
 * oceans, land in the ride tiles' frosted glass (a real backdrop blur, clipped
 * to the land's outline each frame, since a canvas can't blur what's behind
 * it), thin accent coastlines conforming to the curvature, and an accent rim.
 * Self-sizes to its container (square, DPR-aware), so the parent only has to
 * position/size the wrapper. A new colour is blended in rather than cut to, and
 * `burst` spins it fast for a moment (Home's globe changing between the map and
 * Blacktop World); the spin itself never restarts.
 */
export function HomeGlobe({ accentColor, burst, className }: HomeGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frostRef = useRef<HTMLDivElement>(null);
  // What the draw loop reads: the colour being blended from and to, when the last burst began, and a way to ask for a frame.
  const paint = useRef<{ from: Hsl | null; to: Hsl | null; plain: string; since: number; burstAt: number; kick: () => void }>({ from: null, to: parseHsl(accentColor), plain: accentColor, since: -1e9, burstAt: -1e9, kick: () => {} });
  const shown = useRef<string>(accentColor);

  useEffect(() => {
    const p = paint.current;
    const next = parseHsl(accentColor);
    if (p.plain === accentColor) return;
    // Blend from whatever is on screen now (it may itself be mid-blend).
    p.from = isThermal() ? null : parseHsl(shown.current);
    p.to = next;
    p.plain = accentColor;
    p.since = performance.now();
    p.kick();
  }, [accentColor]);

  useEffect(() => {
    if (burst === undefined) return;
    paint.current.burstAt = performance.now();
    paint.current.kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let size = 0; // CSS px (square edge)
    const projection = geoOrthographic().clipAngle(90); // cull the back hemisphere
    const path = geoPath(projection, ctx);
    // The same land as an SVG path string (CSS px), for the frost's clip.
    const outline = geoPath(projection).digits(1);
    const frost = frostRef.current;
    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      size = Math.min(rect.width, rect.height);
      if (size <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1); // 3x only costs at this size
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px, render at device res
      const r = size / 2;
      // Inset by the rim width so the outline stroke isn't clipped at the edge.
      projection.scale(r - RIM_WIDTH).translate([r, r]);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let rotation = 0;
    let last = performance.now();
    // Only while on screen (Home's deck can be on an Enterprise card), at ~30 fps:
    // at 6°/s the spin is under a pixel a frame, and each frame re-projects every coastline.
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);

    const draw = (now: number) => {
      if (!visible) {
        raf = 0;
        return;
      }
      const p = paint.current;
      const sinceBurst = now - p.burstAt;
      const bursting = sinceBurst >= 0 && sinceBurst < BURST_MS && !isThermal();
      // Every frame during a burst (it's moving fast); ~30 a second the rest of the time.
      if (!bursting && now - last < 32) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1); // clamp after tab throttling
      last = now;
      const boost = bursting ? BURST_PEAK * Math.pow(1 - sinceBurst / BURST_MS, 2) : 0;
      rotation = (rotation + (ROTATION_DEG_PER_SEC + boost) * dt) % 360;
      const blend = p.from && p.to ? Math.min(1, (now - p.since) / COLOR_MS) : 1;
      const color = p.from && p.to && blend < 1 ? mixHsl(p.from, p.to, blend * blend * (3 - 2 * blend)) : p.plain;
      shown.current = color;
      projection.rotate([rotation, -AXIS_TILT_DEG]);

      if (size > 0) {
        // Frosted land. Every other frame (~15 a second) is plenty at this spin speed (the
        // clip moves well under a pixel between updates, under the coastline).
        if (frost && (bursting || frame++ % 2 === 0)) {
          const d = outline(land);
          const clip = d ? `path('${d}')` : 'inset(50%)';
          frost.style.clipPath = clip;
          frost.style.setProperty('-webkit-clip-path', clip);
        }

        ctx.clearRect(0, 0, size, size);

        // Faint sphere body so the rotating coastlines sit on a subtle disc.
        ctx.beginPath();
        path(SPHERE);
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fill();

        // Coastlines — thin, accent, slightly soft.
        ctx.beginPath();
        path(land);
        ctx.lineWidth = COASTLINE_WIDTH;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Rim outline — the circle the tiles curve around.
        ctx.beginPath();
        path(SPHERE);
        ctx.lineWidth = RIM_WIDTH;
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // Thermal / High-Speed Mode: this one frame, then no more.
      raf = isThermal() ? 0 : requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // Thermal mode draws one frame and stops: a new colour asks for one more.
    paint.current.kick = () => {
      if (!raf && visible) {
        last = performance.now() - 40;
        raf = requestAnimationFrame(draw);
      }
    };

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      paint.current.kick = () => {};
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div className={cn('relative', className)}>
      <div ref={frostRef} aria-hidden className="absolute inset-0 pointer-events-none" style={LAND_FROST} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
