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
  className?: string;
}

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
 * position/size the wrapper.
 */
export function HomeGlobe({ accentColor, className }: HomeGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frostRef = useRef<HTMLDivElement>(null);

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
      if (now - last < 32) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1); // clamp after tab throttling
      last = now;
      rotation = (rotation + ROTATION_DEG_PER_SEC * dt) % 360;
      projection.rotate([rotation, -AXIS_TILT_DEG]);

      if (size > 0) {
        // Frosted land. Every other frame (~15 a second) is plenty at this spin speed (the
        // clip moves well under a pixel between updates, under the coastline).
        if (frost && frame++ % 2 === 0) {
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
        ctx.strokeStyle = accentColor;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Rim outline — the circle the tiles curve around.
        ctx.beginPath();
        path(SPHERE);
        ctx.lineWidth = RIM_WIDTH;
        ctx.strokeStyle = accentColor;
        ctx.stroke();
      }

      // Thermal / High-Speed Mode: this one frame, then no more.
      raf = isThermal() ? 0 : requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
    };
  }, [accentColor]);

  return (
    <div className={cn('relative', className)}>
      <div ref={frostRef} aria-hidden className="absolute inset-0 pointer-events-none" style={LAND_FROST} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
