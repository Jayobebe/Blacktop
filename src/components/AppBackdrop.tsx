import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app-wide backdrop, fixed behind every screen. Bottom to top:
 *   1. Lava-lamp glow: very soft accent blobs slowly drifting, bouncing and
 *      growing. Pure radial gradients moved with transforms (no blur filter),
 *      so they're cheap to animate.
 *   2. "BLACKTOP" wordmark, small and tightly packed, seen through an
 *      elongated fish-eye lens bigger than the screen (tall in portrait, wide
 *      in landscape). It's exactly the background colour, so it's invisible
 *      except where a blob's light shines through the gaps between letters.
 *   3. Mist: grain, haze and a soft vignette, for a
 *      frosted-glass finish.
 *
 * The lens is an SVG displacement filter on the static wordmark layer; the
 * map is drawn once per viewport size, so it costs nothing per frame.
 * `paused` freezes the blobs (active rides, open map) to save battery.
 */

const ROWS = 120;
const ROW_TEXT = Array.from({ length: 34 }, () => 'BLACKTOP').join(' ');
const FILTER_ID = 'bt-fisheye';

/** Peak magnification strength at the lens centre (0 = flat glass). */
const LENS_STRENGTH = 0.38;

/**
 * Lens radii as a multiple of the half-viewport. Both > 1 so the ellipse runs
 * off every edge (corners included: (1/1.55)² + (1/1.4)² < 1) and its boundary
 * is never on screen; the distortion just eases out towards the edges.
 */
const LENS_OVERSCAN_X = 1.55;
const LENS_OVERSCAN_Y = 1.4;

interface LensMap {
  url: string;
  width: number;
  height: number;
  scale: number;
}

/**
 * Barrel ("fish-eye") displacement map for an ellipse inscribed in the
 * viewport. Inside the lens each pixel samples from closer to the centre,
 * magnifying the middle and compressing towards the rim; outside it, nothing
 * moves. R channel = x offset, G = y offset, 0.5 = none.
 */
function buildLensMap(width: number, height: number): LensMap | null {
  const res = 4; // one map pixel per 4 CSS px; the filter scales it up smoothly
  const w = Math.max(2, Math.round(width / res));
  const h = Math.max(2, Math.round(height / res));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = width / 2;
  const cy = height / 2;
  const rx = cx * LENS_OVERSCAN_X;
  const ry = cy * LENS_OVERSCAN_Y;
  // Largest displacement is at r = 1/√3 of the radius along the long axis.
  const maxShift = LENS_STRENGTH * (2 / (3 * Math.sqrt(3))) * Math.max(rx, ry);
  const scale = maxShift * 2.2;

  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) * res - cx;
      const py = (y + 0.5) * res - cy;
      const u = px / rx;
      const v = py / ry;
      const r2 = u * u + v * v;
      let dx = 0;
      let dy = 0;
      if (r2 < 1) {
        const k = LENS_STRENGTH * (1 - r2);
        dx = -k * px;
        dy = -k * py;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((0.5 + dx / scale) * 255);
      img.data[i + 1] = Math.round((0.5 + dy / scale) * 255);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), width, height, scale };
}

function useLensMap(): LensMap | null {
  const [map, setMap] = useState<LensMap | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    let last = '';
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const key = `${w}x${h}`;
      if (key === last) return;
      last = key;
      setMap(buildLensMap(w, h));
    };
    update();
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, []);
  return map;
}

export const AppBackdrop = memo(function AppBackdrop({ paused = false }: { paused?: boolean }) {
  const lens = useLensMap();

  return (
    <div aria-hidden className={cn('app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden', paused && 'lava-paused')}>
      {/* 1. Lava lamp — kept dim: even a screen-filling blob only just reveals the wording */}
      <div className="absolute inset-0 opacity-60">
        <span className="lava-blob lava-blob-1" />
        <span className="lava-blob lava-blob-2" />
        <span className="lava-blob lava-blob-3" />
        <span className="lava-blob lava-blob-4" />
        <span className="lava-blob lava-blob-5" />
      </div>

      {/* 2. Wordmark through the fish-eye lens */}
      {lens && (
        <svg className="absolute w-0 h-0" aria-hidden focusable="false">
          <filter
            id={FILTER_ID}
            x="0"
            y="0"
            width={lens.width}
            height={lens.height}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage href={lens.url} x="0" y="0" width={lens.width} height={lens.height} preserveAspectRatio="none" result="lens" />
            <feDisplacementMap in="SourceGraphic" in2="lens" scale={lens.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <div className="backdrop-wordmark" style={lens ? { filter: `url(#${FILTER_ID})` } : undefined}>
        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} className={cn('backdrop-wordmark-row', r % 2 === 1 && 'backdrop-wordmark-row-offset')}>
            {ROW_TEXT}
          </div>
        ))}
      </div>

      {/* 3. Mist */}
      <div className="backdrop-mist" />
    </div>
  );
});
