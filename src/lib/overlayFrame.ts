import { formatDuration } from '@/lib/format';
import { drawGForceCircle } from '@/lib/gForceCircleCanvas';
import type { GMax } from '@/lib/gForceVector';
import { tr } from '@/lib/i18n';

/**
 * One frame of the ride overlay video (useLiveOverlayRecorder), drawn for
 * laying over action camera footage. Everything sits on solid dark panels on a
 * solid background, because recorded video keeps no transparency (browser
 * recording drops it and MP4 has none): a green screen by default, which any
 * editor keys out leaving the panels whole, or black, for editors that lay it
 * over with a Screen / Lighten blend. Two shapes, landscape 16:9 and vertical
 * 9:16, from the same panels.
 *
 * Landscape: max speed, ride time with the time of day (to line the overlay
 * up with the camera's own clock) and max lean along the top; the mini map
 * with the distance, the live speed under the lean arc, and the G meter along
 * the bottom. Vertical: the same three along the top, the map and G meter side
 * by side above the speed at the bottom.
 */

export type OverlayShape = 'landscape' | 'portrait';
export type OverlayBackground = 'green' | 'black';

export const OVERLAY_SIZE: Record<OverlayShape, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

/** The broadcast chroma green: what editors' green screen keyers expect. */
export const CHROMA_GREEN = 'rgb(0, 177, 64)';
/** Mini map dial diameter in video pixels. */
export const MINI_MAP_SIZE = 260;

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

const MARGIN = 48;
const GAP = 24;
const PANEL = 'rgb(12, 12, 15)';
const EDGE = 'rgba(255, 255, 255, 0.14)';
const LABEL = 'rgba(255, 255, 255, 0.55)';
const SANS = 'Inter, system-ui, sans-serif';
const DIGITS = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** The G meter's panel; the circle inside it is `G_SIZE` across. */
const G_PANEL = { w: 330, h: 300 };
const G_SIZE = 250;
const TOP_PANEL = { w: 280, h: 116 };
/** Vertical clips are watched on phones: everything is drawn this much bigger, the top panels a little narrower to fit three. */
const PORTRAIT_SCALE = 1.15;
const PORTRAIT_TOP_W = 260;

/** Distance to one decimal in the rider's units (the overlay's own; the app's formatDistance drops it past 10). */
function distanceFigure(miles: number, unit: 'miles' | 'km') {
  const v = unit === 'km' ? miles * 1.609344 : miles;
  return v < 1000 ? v.toFixed(1) : Math.round(v).toString();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = EDGE;
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = LABEL;
  ctx.font = `600 19px ${SANS}`;
  ctx.fillText(text, x, y);
}

/** A big figure with its unit after it, both on one baseline, left-aligned at x. */
function figure(ctx: CanvasRenderingContext2D, value: string, unit: string | null, x: number, baseline: number, size: number) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'white';
  ctx.font = `700 ${size}px ${DIGITS}`;
  ctx.fillText(value, x, baseline);
  if (unit) {
    const w = ctx.measureText(value).width;
    ctx.fillStyle = LABEL;
    ctx.font = `600 ${Math.round(size * 0.4)}px ${SANS}`;
    ctx.fillText(unit, x + w + 10, baseline);
  }
}

function clock(d: Date) {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function topRow(ctx: CanvasRenderingContext2D, W: number, s: OverlayStats, look: OverlayLook) {
  const h = TOP_PANEL.h;
  const w = look.shape === 'portrait' ? PORTRAIT_TOP_W : TOP_PANEL.w;
  const y = MARGIN;
  // Max speed, left.
  panel(ctx, MARGIN, y, w, h);
  label(ctx, tr("MAX SPEED"), MARGIN + 24, y + 20);
  figure(ctx, s.maxSpeed == null ? '--' : `${Math.round(s.maxSpeed)}`, s.maxSpeed == null ? null : look.speedUnit, MARGIN + 24, y + h - 22, 52);
  // Ride time and the time of day, centre.
  const cx = (W - w) / 2;
  panel(ctx, cx, y, w, h);
  label(ctx, tr("RIDE TIME"), cx + 24, y + 20);
  label(ctx, clock(look.now), cx + w - 24, y + 20, 'right');
  figure(ctx, formatDuration(Math.max(0, Math.floor(s.duration))), null, cx + 24, y + h - 22, 52);
  // Max lean, right (vehicles that lean).
  if (look.showLean) {
    const rx = W - MARGIN - w;
    panel(ctx, rx, y, w, h);
    label(ctx, tr("MAX LEAN"), rx + 24, y + 20);
    figure(ctx, s.maxLean == null ? '--' : `${Math.round(s.maxLean)}°`, null, rx + 24, y + h - 22, 52);
  }
}

/** Distance, with the mini map under it when there is one. Returns the panel's height. */
function mapPanel(ctx: CanvasRenderingContext2D, x: number, bottom: number, s: OverlayStats, look: OverlayLook, paint: MiniMapPainter | null): { w: number; h: number } {
  const withMap = look.showMiniMap && paint !== null && s.lat != null && s.lng != null;
  const w = MINI_MAP_SIZE + 48;
  const h = withMap ? MINI_MAP_SIZE + 128 : 116;
  const y = bottom - h;
  panel(ctx, x, y, w, h);
  label(ctx, tr("DISTANCE"), x + 24, y + 20);
  figure(ctx, distanceFigure(s.distance, look.distanceIn), look.distanceUnit, x + 24, y + 94, 50);
  if (withMap) {
    const drawn = paint!(ctx, x + w / 2, y + 104 + MINI_MAP_SIZE / 2, MINI_MAP_SIZE);
    if (!drawn) {
      // The map is still loading: a quiet ring where it will be.
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 104 + MINI_MAP_SIZE / 2, MINI_MAP_SIZE / 2, 0, Math.PI * 2);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  return { w, h };
}

/** Live speed under the lean arc. Returns the panel's size. */
function speedPanel(ctx: CanvasRenderingContext2D, cx: number, bottom: number, s: OverlayStats, look: OverlayLook): { w: number; h: number } {
  const w = 420;
  const h = look.showLean ? 250 : 170;
  const x = cx - w / 2;
  const y = bottom - h;
  panel(ctx, x, y, w, h);

  if (look.showLean) {
    // The arc: 45° either way across the top of the panel, a dot at the lean.
    const R = 150;
    const acy = y + 186;
    const a0 = Math.PI * 1.2;
    const a1 = Math.PI * 1.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, acy, R, a0, a1);
    ctx.stroke();
    const lean = Math.max(-45, Math.min(45, s.leanAngle));
    const at = (a0 + a1) / 2 + (lean / 45) * ((a1 - a0) / 2);
    // The swept part, from upright to the lean, in the accent.
    ctx.strokeStyle = look.accent;
    ctx.beginPath();
    ctx.arc(cx, acy, R, Math.min(at, (a0 + a1) / 2), Math.max(at, (a0 + a1) / 2));
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(at) * R, acy + Math.sin(at) * R, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 26px ${DIGITS}`;
    ctx.fillText(`${Math.abs(Math.round(s.leanAngle))}°`, cx, y + 54);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'white';
  ctx.font = `800 104px ${DIGITS}`;
  ctx.fillText(`${Math.round(s.speed)}`, cx, y + h - 46);
  ctx.fillStyle = LABEL;
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText(look.speedUnit, cx, y + h - 14);
  return { w, h };
}

/** The friction circle on its own solid panel. */
function gPanel(ctx: CanvasRenderingContext2D, x: number, bottom: number, s: OverlayStats, look: OverlayLook) {
  if (!look.showGForce || !s.gVector) return;
  const { w, h } = G_PANEL;
  const y = bottom - h;
  panel(ctx, x, y, w, h);
  drawGForceCircle(ctx, x + w / 2 - 8, y + h / 2 + 2, G_SIZE, s.gVector, look.accent, {
    left: tr("LEFT"),
    right: tr("RIGHT"),
    brake: tr("BRAKE"),
    accel: tr("ACCEL"),
  });
}

export function drawOverlayFrame(ctx: CanvasRenderingContext2D, s: OverlayStats, look: OverlayLook, paintMap: MiniMapPainter | null) {
  const size = OVERLAY_SIZE[look.shape];
  ctx.save();
  ctx.fillStyle = look.background === 'green' ? CHROMA_GREEN : 'black';
  ctx.fillRect(0, 0, size.width, size.height);
  // Laid out in design units: the frame itself, or a smaller frame scaled up for vertical clips.
  const k = look.shape === 'portrait' ? PORTRAIT_SCALE : 1;
  ctx.scale(k, k);
  const W = size.width / k;
  const H = size.height / k;

  topRow(ctx, W, s, look);

  const bottom = H - MARGIN;
  if (look.shape === 'landscape') {
    mapPanel(ctx, MARGIN, bottom, s, look, paintMap);
    speedPanel(ctx, W / 2, bottom, s, look);
    gPanel(ctx, W - MARGIN - G_PANEL.w, bottom, s, look);
  } else {
    const sp = speedPanel(ctx, W / 2, bottom, s, look);
    const row = bottom - sp.h - GAP;
    mapPanel(ctx, MARGIN, row, s, look, paintMap);
    gPanel(ctx, W - MARGIN - G_PANEL.w, row, s, look);
  }
  ctx.restore();
}
