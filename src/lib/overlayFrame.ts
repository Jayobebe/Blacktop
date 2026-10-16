import { formatDuration } from '@/lib/format';
import { drawGForceCircle } from '@/lib/gForceCircleCanvas';
import type { GMax } from '@/lib/gForceVector';
import { tr } from '@/lib/i18n';

/**
 * One frame of the ride overlay video (useLiveOverlayRecorder), made to sit
 * over action camera footage people want to watch: small readouts tucked into
 * the corners and the bottom middle, no boxes. A soft dark fade (`vignette`)
 * hugs every border, darkest at the very edge, and swells a little behind each
 * readout, so the figures read over a bright sky without hiding the video.
 *
 *   top left      max speed and max lean
 *   top right     ride time, with the time of day under it (to line the
 *                 overlay up with the camera's own clock)
 *   bottom left   distance over the mini map
 *   bottom middle live speed under the lean arc
 *   bottom right  the G meter
 *
 * The same corners in both shapes (landscape 16:9, vertical 9:16, drawn a
 * little bigger). Backgrounds: transparent (the recording keeps it; it's
 * downloaded as WebM, never converted), or, for editors that can't read
 * transparency, a green screen to key out or black to blend. Those can't carry
 * a see-through fade, so there the figures get a dark outline instead.
 */

export type OverlayShape = 'landscape' | 'portrait';
export type OverlayBackground = 'transparent' | 'green' | 'black';

export const OVERLAY_SIZE: Record<OverlayShape, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

/** A recording made on a transparent background is kept with this in its type: it's downloaded as it is, never converted. */
export const TRANSPARENT_OVERLAY_TYPE = 'video/webm;alpha=1';
export const isTransparentOverlay = (blob: Blob) => /alpha=1/.test(blob.type);

/** The broadcast chroma green: what editors' green screen keyers expect. */
export const CHROMA_GREEN = 'rgb(0, 177, 64)';
/** Mini map dial diameter in video pixels. */
export const MINI_MAP_SIZE = 190;

export interface OverlayStats {
  speed: number;
  /** Peaks are null while Public Road Privacy is on: drawn as "--". */
  maxSpeed: number | null;
  distance: number;
  duration: number;
  leanAngle: number;
  maxLean: number | null;
  gForce: number;
  maxGForce: number | null;
  /** Friction circle (lib/gForceVector). */
  gVector?: { lateral: number; longitudinal: number; envelope: number[]; max: GMax; hidePeaks?: boolean };
  lat: number | null;
  lng: number | null;
  heading: number | null;
  /** Live convoy member positions (empty/omitted for solo rides). */
  members?: Array<{ lat: number; lng: number; name?: string; color?: string }>;
}

export interface OverlayLook {
  shape: OverlayShape;
  background: OverlayBackground;
  /** Literal CSS colour (canvas can't read CSS variables). */
  accent: string;
  /** "MPH" / "KM/H", as the rider reads speed. */
  speedUnit: string;
  /** "MI" / "KM". */
  distanceUnit: string;
  distanceIn: 'miles' | 'km';
  showLean: boolean;
  showGForce: boolean;
  showMiniMap: boolean;
  /** The time of day printed under the ride time. */
  now: Date;
}

/** Draws the mini map's dial centred at (cx, cy), `size` across; false when there's nothing to draw yet. */
export type MiniMapPainter = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => boolean;

const EDGE = 40;
const SANS = 'Inter, system-ui, sans-serif';
const DIGITS = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SOFT = 'rgba(255, 255, 255, 0.7)';
/** The G meter's circle, across. */
const G_SIZE = 220;
/** Vertical clips are watched on phones: drawn this much bigger. */
const PORTRAIT_SCALE = 1.12;

/** The vignette's own resolution: a quarter of the frame, scaled up smooth (it has no detail). */
const SHADE_SCALE = 4;
/** How far in from every border the fade reaches, and how dark it is right at the edge. */
const BORDER_DEPTH = 80;
const BORDER_DARK = 0.42;
/** How dark the swell behind a readout is at the edge it sits on. */
const POOL_DARK = 0.5;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The vignette: one smooth dark field over the whole frame, worked out per
 * pixel so nothing overlaps and there are no seams. Darkest right at every
 * border and falling off fast inward (squared, so it's mostly in the last few
 * pixels), the corners rounded rather than meeting at a mitre, and a gentle
 * swell (an ellipse anchored on the edge) behind each readout, joined to the
 * border by multiplying what light gets through, not by adding.
 */
function shadeField(W: number, H: number, pools: Array<[number, number, number, number]>): HTMLCanvasElement {
  const w = Math.ceil(W / SHADE_SCALE);
  const h = Math.ceil(H / SHADE_SCALE);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const round = 36;
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * SHADE_SCALE;
    const dy = Math.min(y, H - y);
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * SHADE_SCALE;
      const dx = Math.min(x, W - x);
      // Distance to the nearest border, with the corners rounded (a smooth minimum of the two).
      const d = -round * Math.log(Math.exp(-dx / round) + Math.exp(-dy / round));
      const edge = 1 - smoothstep(0, BORDER_DEPTH, Math.max(0, d));
      let light = 1 - BORDER_DARK * edge * edge;
      for (const [px, py, rx, ry] of pools) {
        const q = Math.hypot((x - px) / rx, (y - py) / ry);
        const p = 1 - smoothstep(0, 1, q);
        light *= 1 - POOL_DARK * Math.pow(p, 1.5);
      }
      img.data[(j * w + i) * 4 + 3] = Math.round((1 - light) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let shadeCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Draws the vignette for this layout (worked out once, then reused every frame). */
function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, look: OverlayLook, withMap: boolean, withG: boolean) {
  const key = [W, H, look.showLean, withMap, withG].join(':');
  if (shadeCache?.key !== key) {
    // Each swell is centred on its readout and a little bigger than it (centre x, y, radius x, y).
    const r = MINI_MAP_SIZE / 2;
    const pools: Array<[number, number, number, number]> = [
      [EDGE + 110, EDGE + (look.showLean ? 55 : 30), 260, look.showLean ? 140 : 110],
      [W - EDGE - 90, EDGE + 40, 230, 120],
      withMap ? [EDGE + r, H - EDGE - r - 20, 230, 270] : [EDGE + 90, H - EDGE - 15, 230, 110],
      [W / 2, H - EDGE - (look.showLean ? 70 : 40), 240, look.showLean ? 190 : 130],
    ];
    if (withG) pools.push([W - EDGE - G_SIZE * 0.6, H - EDGE - G_SIZE * 0.52, 250, 240]);
    shadeCache = { key, canvas: shadeField(W, H, pools) };
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(shadeCache.canvas, 0, 0, W, H);
  ctx.restore();
}

/** Text with the shadow every readout carries (and a dark edge where there's no fade behind it). */
function text(ctx: CanvasRenderingContext2D, look: OverlayLook, value: string, x: number, y: number, font: string, colour = 'white', align: CanvasTextAlign = 'left') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 1;
  if (look.background !== 'transparent') {
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(value, x, y);
  }
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** A small caption followed by its figure on one line: "MAX 92 MPH". Returns the line's width. */
function captioned(ctx: CanvasRenderingContext2D, look: OverlayLook, caption: string, value: string, unit: string | null, x: number, y: number) {
  ctx.font = `700 15px ${SANS}`;
  const cw = ctx.measureText(caption).width;
  text(ctx, look, caption, x, y - 6, `700 15px ${SANS}`, SOFT);
  text(ctx, look, value, x + cw + 10, y, `700 34px ${DIGITS}`);
  ctx.font = `700 34px ${DIGITS}`;
  const vw = ctx.measureText(value).width;
  if (unit) text(ctx, look, unit, x + cw + 10 + vw + 6, y - 2, `700 15px ${SANS}`, SOFT);
}

function clock(d: Date) {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** Distance to one decimal in the rider's units (the app's formatDistance drops it past 10). */
function distanceFigure(miles: number, unit: 'miles' | 'km') {
  const v = unit === 'km' ? miles * 1.609344 : miles;
  return v < 1000 ? v.toFixed(1) : Math.round(v).toString();
}

function topLeft(ctx: CanvasRenderingContext2D, s: OverlayStats, look: OverlayLook) {
  captioned(ctx, look, tr("MAX"), s.maxSpeed == null ? '--' : `${Math.round(s.maxSpeed)}`, s.maxSpeed == null ? null : look.speedUnit, EDGE, EDGE + 34);
  if (look.showLean) captioned(ctx, look, tr("LEAN"), s.maxLean == null ? '--' : `${Math.round(s.maxLean)}°`, null, EDGE, EDGE + 80);
}

function topRight(ctx: CanvasRenderingContext2D, W: number, s: OverlayStats, look: OverlayLook) {
  text(ctx, look, formatDuration(Math.max(0, Math.floor(s.duration))), W - EDGE, EDGE + 34, `700 34px ${DIGITS}`, 'white', 'right');
  text(ctx, look, clock(look.now), W - EDGE, EDGE + 66, `600 18px ${DIGITS}`, SOFT, 'right');
}

function bottomLeft(ctx: CanvasRenderingContext2D, H: number, s: OverlayStats, look: OverlayLook, paint: MiniMapPainter | null) {
  const withMap = look.showMiniMap && paint !== null && s.lat != null && s.lng != null;
  const r = MINI_MAP_SIZE / 2;
  const mapY = H - EDGE - r;
  const figureY = withMap ? mapY - r - 16 : H - EDGE;
  ctx.font = `700 34px ${DIGITS}`;
  const value = distanceFigure(s.distance, look.distanceIn);
  text(ctx, look, value, EDGE, figureY, `700 34px ${DIGITS}`);
  text(ctx, look, look.distanceUnit, EDGE + ctx.measureText(value).width + 8, figureY - 2, `700 15px ${SANS}`, SOFT);
  if (withMap && !paint!(ctx, EDGE + r, mapY, MINI_MAP_SIZE)) {
    // Still loading: a faint ring where it will be.
    ctx.beginPath();
    ctx.arc(EDGE + r, mapY, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function bottomMiddle(ctx: CanvasRenderingContext2D, W: number, H: number, s: OverlayStats, look: OverlayLook) {
  const cx = W / 2;
  const speedY = H - EDGE - 26;
  if (look.showLean) {
    // A thin arc over the speed, 45° either way; the lean side fills in the accent.
    const R = 118;
    const acy = speedY - 6;
    const a0 = Math.PI * 1.22;
    const a1 = Math.PI * 1.78;
    const mid = (a0 + a1) / 2;
    const lean = Math.max(-45, Math.min(45, s.leanAngle));
    const at = mid + (lean / 45) * ((a1 - a0) / 2);
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx, acy, R, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, acy, R, Math.min(at, mid), Math.max(at, mid));
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(at) * R, acy + Math.sin(at) * R, 7, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, look, `${Math.abs(Math.round(s.leanAngle))}°`, cx, acy - R + 30, `700 20px ${DIGITS}`, SOFT, 'center');
  }
  text(ctx, look, `${Math.round(s.speed)}`, cx, speedY, `800 76px ${DIGITS}`, 'white', 'center');
  text(ctx, look, look.speedUnit, cx, H - EDGE, `700 16px ${SANS}`, SOFT, 'center');
}

function bottomRight(ctx: CanvasRenderingContext2D, W: number, H: number, s: OverlayStats, look: OverlayLook) {
  if (!look.showGForce || !s.gVector) return;
  // The circle's figures reach about 0.55 of its size out from the centre.
  const cx = W - EDGE - G_SIZE * 0.6;
  const cy = H - EDGE - G_SIZE * 0.52;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6;
  drawGForceCircle(ctx, cx, cy, G_SIZE, s.gVector, look.accent, {
    left: tr("LEFT"),
    right: tr("RIGHT"),
    brake: tr("BRAKE"),
    accel: tr("ACCEL"),
  });
  ctx.restore();
}

export function drawOverlayFrame(ctx: CanvasRenderingContext2D, s: OverlayStats, look: OverlayLook, paintMap: MiniMapPainter | null) {
  const size = OVERLAY_SIZE[look.shape];
  ctx.save();
  if (look.background === 'transparent') ctx.clearRect(0, 0, size.width, size.height);
  else {
    ctx.fillStyle = look.background === 'green' ? CHROMA_GREEN : 'black';
    ctx.fillRect(0, 0, size.width, size.height);
  }
  // Laid out in design units: the frame itself, or a smaller frame scaled up for vertical clips.
  const k = look.shape === 'portrait' ? PORTRAIT_SCALE : 1;
  ctx.scale(k, k);
  const W = size.width / k;
  const H = size.height / k;
  if (look.background === 'transparent') {
    vignette(ctx, W, H, look, look.showMiniMap && paintMap !== null && s.lat != null && s.lng != null, look.showGForce && !!s.gVector);
  }

  topLeft(ctx, s, look);
  topRight(ctx, W, s, look);
  bottomLeft(ctx, H, s, look, paintMap);
  bottomMiddle(ctx, W, H, s, look);
  bottomRight(ctx, W, H, s, look);
  ctx.restore();
}
