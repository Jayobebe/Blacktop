import { useEffect, useRef } from 'react';
import { geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

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

/**
 * A slowly rotating orthographic-projection globe rendered to a 2D canvas:
 * faint sphere fill, thin accent coastlines conforming to the curvature, and
 * an accent rim outline. Self-sizes to its container (square, DPR-aware), so
 * the parent only has to position/size the wrapper.
 */
export function HomeGlobe({ accentColor, className }: HomeGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let size = 0; // CSS px (square edge)
    const projection = geoOrthographic().clipAngle(90); // cull the back hemisphere
    const path = geoPath(projection, ctx);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      size = Math.min(rect.width, rect.height);
      if (size <= 0) return;
      const dpr = window.devicePixelRatio || 1;
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

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); // clamp after tab throttling
      last = now;
      rotation = (rotation + ROTATION_DEG_PER_SEC * dt) % 360;
      projection.rotate([rotation, -AXIS_TILT_DEG]);

      if (size > 0) {
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

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [accentColor]);

  return <canvas ref={canvasRef} className={className} />;
}
