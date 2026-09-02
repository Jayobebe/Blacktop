// Live mini-map renderer for the downloadable ride overlay.
//
// Draws dark-styled tiles into a small rounded region of the recording canvas,
// centred on the rider, with the route polyline projected on top and a
// heading-oriented user dot in the middle. Tiles are fetched on demand and
// kept in an in-memory Image cache keyed by z/x/y so a normal ride only
// downloads each surrounding tile once.

const TILE_ZOOM = 16;
const TILE_SIZE = 256;
const TILE_RADIUS = 2; // 2 → 5x5 grid around the centre tile, plenty of headroom for the mini map

// OpenStreetMap standard raster tiles (free, no API key). They're light
// themed, so we invert + dim them at draw time to keep the mini map dark.
const TILE_SUBDOMAINS = ['a', 'b', 'c'] as const;

interface TileCoord { z: number; x: number; y: number; }

const imageCache = new Map<string, HTMLImageElement>();

function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

function tileUrl(z: number, x: number, y: number): string {
  const sd = TILE_SUBDOMAINS[(x + y) % TILE_SUBDOMAINS.length];
  return `https://${sd}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// Canvas filter that turns light OSM tiles into a dark basemap. Tiles are
// pre-filtered once into an offscreen canvas so per-frame draws stay cheap.
const DARK_TILE_FILTER = 'invert(0.92) hue-rotate(180deg) brightness(0.9) contrast(0.85) saturate(0.6)';

const darkTileCache = new Map<string, HTMLCanvasElement>();

function toDarkTile(img: HTMLImageElement): HTMLCanvasElement | null {
  const key = img.src;
  const cached = darkTileCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cctx = c.getContext('2d');
  if (!cctx) return null;
  cctx.filter = DARK_TILE_FILTER;
  cctx.drawImage(img, 0, 0);
  darkTileCache.set(key, c);
  return c;
}

function loadTile(z: number, x: number, y: number): HTMLImageElement | null {
  const key = tileKey(z, x, y);
  let img = imageCache.get(key);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;

  img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = tileUrl(z, x, y);
  imageCache.set(key, img);
  return null;
}

// Web Mercator pixel coordinates at zoom z. Returns fractional pixels so we
// can offset the tile grid smoothly under the user.
function lonLatToPixel(lat: number, lng: number, z: number): { px: number; py: number } {
  const scale = TILE_SIZE * Math.pow(2, z);
  const px = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const py = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { px, py };
}

export interface MiniMapCenter {
  lat: number;
  lng: number;
  heading: number | null; // degrees, 0 = north
}

export interface MiniMapRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface MiniMapMember {
  lat: number;
  lng: number;
  name?: string;
  color?: string;
}

export interface MiniMapDrawOptions {
  ctx: CanvasRenderingContext2D;
  region: MiniMapRegion;
  center: MiniMapCenter;
  route: Array<{ lat: number; lng: number }>;
  /** Overall opacity of the mini map so background video shows through. */
  opacity: number;
  accent: string;
  /** Optional text drawn just below the user dot (e.g. formatted duration). */
  durationLabel?: string;
  /** Live convoy member positions drawn as secondary dots. */
  members?: MiniMapMember[];
}

export function drawMiniMap({ ctx, region, center, route, opacity, accent, durationLabel, members }: MiniMapDrawOptions): void {
  const { x, y, width, height, radius } = region;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const bearingRad = ((center.heading ?? 0) * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Clip to rounded rect so tiles / route stay inside the mini-map card.
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  // Dark backing so the region reads as a card even before tiles resolve.
  ctx.fillStyle = 'rgba(10, 10, 12, 1)';
  ctx.fillRect(x, y, width, height);

  // Draw tiles + route in a rotated frame where the user is always at (cx, cy)
  // and their heading points up. The bearing is negated so a 90° heading
  // (east) rotates the map so east appears at the top.
  ctx.translate(cx, cy);
  ctx.rotate(-bearingRad);

  const centerPx = lonLatToPixel(center.lat, center.lng, TILE_ZOOM);
  const centerTileX = Math.floor(centerPx.px / TILE_SIZE);
  const centerTileY = Math.floor(centerPx.py / TILE_SIZE);
  const originOffsetX = centerTileX * TILE_SIZE - centerPx.px;
  const originOffsetY = centerTileY * TILE_SIZE - centerPx.py;

  const pending: TileCoord[] = [];
  for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy++) {
    for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
      const tx = centerTileX + dx;
      const ty = centerTileY + dy;
      const img = loadTile(TILE_ZOOM, tx, ty);
      const drawX = originOffsetX + dx * TILE_SIZE;
      const drawY = originOffsetY + dy * TILE_SIZE;
      if (img) {
        const dark = toDarkTile(img);
        if (dark) ctx.drawImage(dark, drawX, drawY, TILE_SIZE, TILE_SIZE);
      } else {
        pending.push({ z: TILE_ZOOM, x: tx, y: ty });
      }
    }
  }

  // Route polyline (last ~200 points is plenty for a mini-map preview).
  if (route.length > 1) {
    const points = route.length > 200 ? route.slice(-200) : route;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = lonLatToPixel(points[i].lat, points[i].lng, TILE_ZOOM);
      const px = p.px - centerPx.px;
      const py = p.py - centerPx.py;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Convoy member dots — positioned in map space, counter-rotated so the dot
  // and its label stay upright regardless of the rider's heading.
  if (members && members.length > 0) {
    for (const m of members) {
      if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
      const p = lonLatToPixel(m.lat, m.lng, TILE_ZOOM);
      const dx = p.px - centerPx.px;
      const dy = p.py - centerPx.py;
      // Skip members far outside the visible card to avoid edge clutter.
      const maxDist = Math.max(width, height);
      if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(bearingRad);

      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = m.color || 'rgba(120, 190, 255, 0.95)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();

      if (m.name) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = 'bold 13px system-ui';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(m.name.slice(0, 10), 0, -9);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }
  }

  ctx.restore(); // pop the clip so we can draw the border + user dot on top

  // Rider dot — kept in screen space so it doesn't rotate with the map.
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.stroke();

  // Optional duration label sits just under the user dot when provided.
  if (durationLabel) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px monospace';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(durationLabel, cx, cy + 18);
    ctx.shadowBlur = 0;
  }

  // Subtle border around the whole card.
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, radius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();

  // Kick off any missing tile fetches after we finish drawing so the next
  // frame can pick them up. loadTile inserted the Image already; we just
  // need to keep them referenced so onload triggers a redraw on the next RAF.
  void pending;
}
