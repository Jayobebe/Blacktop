import type * as maplibregl from 'maplibre-gl';
import { mapRgb, type MapLookId, type NightLook } from '@/lib/mapTint';
import { sunTimes } from '@/features/calendar/lib/sun';
import type { AppSettings } from '@/features/settings/hooks/useSettings';

/**
 * The map's look (Settings → Navigation → Map look) and the night map on top
 * of it: the basemap's own colours swapped in place, first for the look
 * (infrared, night vision, CRT, noir), then, after sunset (or always), for a
 * dimmer night look so a bright map on the bars doesn't spoil the rider's
 * night vision. Only the basemap's layers change (anything drawn from the
 * `openmaptiles` tiles, and the background): the route, the rider, hazards,
 * cameras and every other pin of Blacktop's own keep their colours, so they
 * stand out more, not less. The colours go through `lib/mapTint.ts`; at night
 * icons drawn from the tiles (the place pins) step down to ICON_NIGHT of their
 * opacity.
 *
 * Paint properties are set, never a style reload (nothing is downloaded again)
 * and never a CSS filter over the canvas (a full-screen moving layer the
 * browser would redraw on the CPU every frame).
 */

const COLOR_PROPS = [
  'background-color',
  'fill-color',
  'fill-outline-color',
  'line-color',
  'text-color',
  'text-halo-color',
  'icon-color',
  'fill-extrusion-color',
  'circle-color',
] as const;

/** How much of their opacity the basemap's own place icons keep at night. */
const ICON_NIGHT = 0.6;
/** Marks a layer's icon opacity among its saved day values (a layer property, not a colour). */
const ICON_OPACITY = 'icon-opacity';

type Rgba = [number, number, number, number];

function parseColour(s: string): Rgba | null {
  const t = s.trim().toLowerCase();
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t);
  if (!m) return t === 'white' ? [1, 1, 1, 1] : t === 'black' ? [0, 0, 0, 1] : t === 'transparent' ? [0, 0, 0, 0] : null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p: string, scale: number) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / scale);
  const a = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if (m[1].startsWith('rgb')) return [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), a];
  const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
  const sat = num(parts[1], 100);
  const l = num(parts[2], 100);
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const hue = (x: number) => {
    const k = ((x % 1) + 1) % 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3), a];
}

/** What a map shows: the rider's map look, and the night look on top of it (null by day). */
export interface MapLook {
  day: MapLookId;
  night: NightLook | null;
}

const isPlain = (look: MapLook) => look.day === 'normal' && !look.night;

/** Every colour anywhere inside a paint value (plain, expression or legacy stops) through the look. */
function tintValue(v: unknown, look: MapLook): unknown {
  if (typeof v === 'string') {
    const c = parseColour(v);
    if (!c) return v;
    const [r, g, b] = mapRgb([c[0], c[1], c[2]], look.day, look.night);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+c[3].toFixed(3)})`;
  }
  if (Array.isArray(v)) return v.map((x) => tintValue(x, look));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tintValue(x, look)]));
  return v;
}

/** Each map's basemap colours as they were before a look touched them. */
const originals = new WeakMap<maplibregl.Map, Map<string, Record<string, unknown>>>();

function isBasemap(layer: { type: string; source?: unknown }): boolean {
  return layer.type === 'background' || layer.source === 'openmaptiles';
}

/**
 * Puts a map in a look (normal by day puts every colour back). Safe to call
 * again whenever layers have been added (a basemap layer added later, like 3D
 * buildings, is picked up); only what differs is set.
 */
export function applyMapLook(map: maplibregl.Map, look: MapLook): void {
  const plain = isPlain(look);
  let saved = originals.get(map);
  if (!saved) originals.set(map, (saved = new Map()));
  const style = map.getStyle?.();
  if (!style?.layers) return;
  for (const raw of style.layers) {
    const layer = raw as { id: string; type: string; source?: unknown; paint?: Record<string, unknown> };
    if (!isBasemap(layer)) continue;
    let base = saved.get(layer.id);
    if (!base) {
      if (plain) continue; // never touched: nothing to put back
      base = {};
      for (const p of COLOR_PROPS) if (layer.paint && p in layer.paint) base[p] = layer.paint[p];
      const raw = layer as { layout?: Record<string, unknown> };
      if (layer.type === 'symbol' && raw.layout && 'icon-image' in raw.layout) base[ICON_OPACITY] = layer.paint?.[ICON_OPACITY] ?? 1;
      saved.set(layer.id, base);
    }
    for (const [prop, day] of Object.entries(base)) {
      const want =
        prop === ICON_OPACITY
          ? look.night
            ? typeof day === 'number'
              ? day * ICON_NIGHT
              : ['*', day, ICON_NIGHT]
            : day
          : plain
            ? day
            : tintValue(day, look);
      if (JSON.stringify(layer.paint?.[prop]) === JSON.stringify(want)) continue;
      try {
        map.setPaintProperty(layer.id, prop as never, want as never);
      } catch {
        /* a value the map won't take: leave that one as it is */
      }
    }
  }
}

type NightSettings = Pick<AppSettings, 'nightMapEnabled' | 'nightMapStyle' | 'nightMapWhen'>;

/** Whether it's dark at a place and time: sunset to sunrise, polar night counted as dark. */
export function isDarkAt(lat: number, lng: number, at = Date.now()): boolean {
  const { rise, set } = sunTimes(new Date(at), lat, lng);
  // No sunrise or sunset today: polar day or polar night, told apart by the season.
  if (rise === null || set === null) return isPolarWinter(lat, at);
  return at < rise || at > set;
}

function isPolarWinter(lat: number, at: number): boolean {
  const month = new Date(at).getUTCMonth(); // 0 = January
  const northWinter = month <= 2 || month >= 9;
  return lat > 0 ? northWinter : !northWinter;
}

/** The look a map should have now, from the rider's settings and where the map is. */
export function nightLookFor(s: NightSettings, at: { lat: number; lng: number } | null, now = Date.now()): NightLook | null {
  if (!s.nightMapEnabled) return null;
  if (s.nightMapWhen === 'always') return s.nightMapStyle;
  if (!at) return null;
  return isDarkAt(at.lat, at.lng, now) ? s.nightMapStyle : null;
}
