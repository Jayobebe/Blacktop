import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { LucideIcon } from 'lucide-react';
import type { SavedPOI } from './poiStore';
import type { MapSearchResult } from './placeSearch';
import { lucideImage } from '@/lib/iconImage';
import type { PriceInfo } from '@/lib/priceLevel';
import { tr } from '@/lib/i18n';

/**
 * Pins on the map:
 *   - nearby places straight from the basemap's own vector tiles (OpenMapTiles
 *     `poi` layer: no extra requests). Only the most important show when zoomed
 *     out; more appear as you zoom in (by the tiles' per-area `rank`);
 *   - the rider's saved places and recently visited destinations, always on
 *     top of the others;
 *   - a quick search's results (fuel, food, open 24h…): every place it found,
 *     as a tile in the category's colour with its icon, the nearest one bigger.
 *     While they're up the basemap's own places step aside.
 * Pin images are drawn here: a coloured circle per category with the style's
 * own icon recoloured white (the sprite's icons are dark, for light maps).
 * Hidden while the rider is moving, like the search bar.
 */

export const POI_LAYER = 'bt-poi';
export const MINE_LAYER = 'bt-mine';
const MINE_SOURCE = 'bt-mine';
export const CAT_LAYER = 'bt-cat';
const CAT_SOURCE = 'bt-cat';
const CAT_PREFIX = 'btcat-';
/** A quick search's pins are up (the basemap's places stay hidden until they go). */
let categoryUp = false;
/** Pins hidden while the rider is moving. */
let pinsShown = true;
const PIN_PREFIX = 'btpoi-';
const PR = 2; // images drawn at 2× for sharp pins

interface Group {
  color: string;
  label: string;
  classes: string[];
}

const GROUPS: Group[] = [
  { color: '#f97316', label: tr("Food & drink"), classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'pub', 'ice_cream', 'bakery', 'food_court', 'biergarten'] },
  { color: '#3b82f6', label: tr("Fuel & vehicles"), classes: ['fuel', 'charging_station', 'car', 'motorcycle', 'bicycle', 'parking', 'parking_garage', 'car_repair', 'bicycle_rental'] },
  { color: '#22c55e', label: tr("Places to see"), classes: ['attraction', 'museum', 'castle', 'monument', 'viewpoint', 'park', 'garden', 'campsite', 'picnic_site', 'art_gallery', 'zoo', 'aquarium', 'lighthouse', 'information', 'theatre', 'cinema', 'stadium', 'golf'] },
  { color: '#ec4899', label: tr("Shops"), classes: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'gift', 'furniture', 'hardware', 'florist', 'butcher', 'convenience', 'mall', 'music', 'books'] },
  { color: '#8b5cf6', label: tr("Places to stay"), classes: ['lodging'] },
  { color: '#ef4444', label: tr("Health"), classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'veterinary'] },
];
const OTHER: Group = { color: '#9ca3af', label: tr("Place"), classes: [] };
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.classes.map((c) => [c, g] as const)));
export const groupOf = (cls: string) => GROUP_OF.get(cls) ?? OTHER;

/** Classes that are clutter to a rider (stops, doors, schools…). */
const HIDDEN = ['bus', 'railway', 'entrance', 'school', 'college', 'kindergarten', 'place_of_worship', 'cemetery', 'post', 'atm', 'toilets', 'playground', 'pitch', 'town_hall', 'aerialway', 'office', 'bench', 'waste_basket', 'swimming', 'laundry', 'hairdresser', 'bank', 'library', 'police', 'fire_station', 'prison', 'embassy'];

// ── sprite (the style's own icons) ───────────────────────────────────────────

interface Sprite {
  img: HTMLImageElement;
  index: Record<string, { x: number; y: number; width: number; height: number; pixelRatio?: number }>;
}
let sprite: Sprite | null = null;

async function loadSprite(url: string): Promise<void> {
  if (sprite) return;
  const [index, img] = await Promise.all([
    fetch(`${url}@2x.json`).then((r) => r.json()),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = `${url}@2x.png`;
    }),
  ]);
  sprite = { img, index };
}

function circleCanvas(color: string, size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2 * PR, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 1.5 * PR;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.stroke();
  return { c, g };
}

/** A coloured pin with the class's icon (white) in the middle. */
function drawPoiPin(cls: string): ImageData {
  const size = 24 * PR;
  const { c, g } = circleCanvas(groupOf(cls).color, size);
  const icon = sprite && (sprite.index[`${cls}_11`] ?? sprite.index[cls]);
  if (sprite && icon) {
    const tmp = document.createElement('canvas');
    tmp.width = icon.width;
    tmp.height = icon.height;
    const t = tmp.getContext('2d')!;
    t.drawImage(sprite.img, icon.x, icon.y, icon.width, icon.height, 0, 0, icon.width, icon.height);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, icon.width, icon.height);
    const box = 13 * PR;
    const scale = Math.min(box / icon.width, box / icon.height);
    const w = icon.width * scale;
    const h = icon.height * scale;
    g.drawImage(tmp, (size - w) / 2, (size - h) / 2, w, h);
  } else {
    g.beginPath();
    g.arc(size / 2, size / 2, 3 * PR, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
  }
  return g.getImageData(0, 0, size, size);
}

/** Saved place: accent pin with a star. Recent: grey pin with a clock. */
function drawMinePin(kind: 'saved' | 'recent', accent: string): ImageData {
  const size = 28 * PR;
  const { c, g } = circleCanvas(kind === 'saved' ? accent : '#64748b', size);
  void c;
  const cx = size / 2;
  const cy = size / 2;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  if (kind === 'saved') {
    const R = 7 * PR;
    const r = 3 * PR;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  } else {
    g.lineWidth = 1.8 * PR;
    g.beginPath();
    g.arc(cx, cy, 6.5 * PR, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy - 4 * PR);
    g.lineTo(cx, cy);
    g.lineTo(cx + 3 * PR, cy + 2 * PR);
    g.stroke();
  }
  return g.getImageData(0, 0, size, size);
}

/** A quick search's pin: a rounded tile in the category's colour, its icon in white; the nearest ringed in white. */
async function drawCategoryPin(color: string, Icon: LucideIcon, nearest: boolean): Promise<ImageData> {
  const size = 26 * PR;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const inset = 1.5 * PR;
  const r = 7 * PR;
  // A rounded square by hand: canvas roundRect is missing from older Android web views.
  const x0 = inset;
  const x1 = size - inset;
  g.beginPath();
  g.moveTo(x0 + r, x0);
  g.arcTo(x1, x0, x1, x1, r);
  g.arcTo(x1, x1, x0, x1, r);
  g.arcTo(x0, x1, x0, x0, r);
  g.arcTo(x0, x0, x1, x0, r);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = (nearest ? 2 : 1.5) * PR;
  g.strokeStyle = nearest ? '#ffffff' : 'rgba(0,0,0,0.85)';
  g.stroke();
  try {
    const img = await lucideImage(Icon, { color: '#ffffff', strokeWidth: 2.4 });
    const box = 15 * PR;
    g.drawImage(img, (size - box) / 2, (size - box) / 2, box, box);
  } catch {
    g.beginPath();
    g.arc(size / 2, size / 2, 3 * PR, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
  }
  return g.getImageData(0, 0, size, size);
}

// ── layers ───────────────────────────────────────────────────────────────────

function textColor(): unknown {
  const expr: unknown[] = ['match', ['get', 'class']];
  for (const g of GROUPS) expr.push(g.classes, lighten(g.color));
  expr.push('hsl(0, 0%, 78%)');
  return expr;
}
function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.35);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/**
 * Adds the pin layers (call once the style is ready). Returns a cleanup.
 * `accent` colours saved places; `onPick` gets taps on any pin.
 */
export function addPinLayers(map: MapLibreMap, accent: string, onPick: (pin: PinInfo) => void): () => void {
  const style = map.getStyle();
  // Same message MapLibre uses, so whenStyleReady retries once the style is in.
  if (!style) throw new Error('Style is not done loading');
  // MapLibre 6: only the resolver can supply an image mid-request (a
  // `styleimagemissing` listener is notify-only).
  map.setMissingStyleImageResolver((id) => {
    if (!id.startsWith(PIN_PREFIX) || map.hasImage(id)) return;
    map.addImage(id, drawPoiPin(id.slice(PIN_PREFIX.length)), { pixelRatio: PR });
  });
  const spriteUrl = typeof style.sprite === 'string' ? style.sprite : null;
  if (spriteUrl) {
    // Pins drawn before the icons arrive get redrawn with them.
    loadSprite(spriteUrl)
      .then(() => {
        for (const id of map.listImages?.() ?? []) {
          if (id.startsWith(PIN_PREFIX)) map.updateImage(id, drawPoiPin(id.slice(PIN_PREFIX.length)));
        }
      })
      .catch(() => {
        /* plain dots then */
      });
  }

  for (const kind of ['saved', 'recent'] as const) {
    if (!map.hasImage(`btpin-${kind}`)) map.addImage(`btpin-${kind}`, drawMinePin(kind, accent), { pixelRatio: PR });
  }

  const hasTiles = !!map.getSource('openmaptiles');
  if (hasTiles && !map.getLayer(POI_LAYER)) {
    map.addLayer({
      id: POI_LAYER,
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 13,
      filter: [
        'all',
        ['has', 'name'],
        ['!', ['in', ['get', 'class'], ['literal', HIDDEN]]],
        // Fewer, more important places zoomed out; everything close in.
        ['<=', ['coalesce', ['get', 'rank'], 99], ['step', ['zoom'], 2, 14, 6, 15, 14, 16, 40, 17, 999]],
      ],
      layout: {
        'icon-image': ['concat', PIN_PREFIX, ['get', 'class']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 1],
        'icon-padding': 3,
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 1.1],
        'text-max-width': 9,
        'text-optional': true,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: { 'text-color': textColor() as never, 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.4 },
    });
  }

  if (!map.getSource(MINE_SOURCE)) map.addSource(MINE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer(MINE_LAYER)) {
    map.addLayer({
      id: MINE_LAYER,
      type: 'symbol',
      source: MINE_SOURCE,
      minzoom: 8,
      layout: {
        'icon-image': ['concat', 'btpin-', ['get', 'kind']],
        'icon-allow-overlap': true,
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11.5,
        'text-anchor': 'top',
        'text-offset': [0, 1.3],
        'text-max-width': 9,
        'text-optional': true,
        'symbol-sort-key': ['match', ['get', 'kind'], 'saved', 0, 1],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 },
    });
  }

  // A quick search's results: filled by showCategoryPins.
  if (!map.getSource(CAT_SOURCE)) map.addSource(CAT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer(CAT_LAYER)) {
    map.addLayer({
      id: CAT_LAYER,
      type: 'symbol',
      source: CAT_SOURCE,
      layout: {
        'icon-image': ['get', 'img'],
        'icon-size': ['case', ['get', 'near'], 1.25, 1],
        'icon-allow-overlap': true,
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': ['case', ['get', 'near'], ['literal', [0, 1.5]], ['literal', [0, 1.25]]],
        'text-max-width': 9,
        'text-optional': true,
        // The nearest first: its name is the one kept where labels collide.
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 },
    });
  }

  const click = (e: { features?: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry; layer: { id: string } }[] }) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== 'Point') return;
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    const mine = f.layer.id === MINE_LAYER;
    const found = f.layer.id === CAT_LAYER;
    // A quick search's tile carries what the search found; a basemap place only its kind, to be looked up.
    const level = Number(p.price);
    onPick({
      name: String(p.name ?? p['name:latin'] ?? 'Place'),
      category: mine ? (p.kind === 'saved' ? tr("Saved place") : tr("Visited recently")) : found ? String(p.label ?? '') : groupOf(String(p.class)).label,
      kind: mine ? (p.kind as 'saved' | 'recent') : 'poi',
      id: mine ? String(p.id) : undefined,
      address: mine || found ? String(p.address ?? '') : undefined,
      lat,
      lng,
      ...(found
        ? { hours: p.hours ? String(p.hours) : undefined, price: level === 0 ? { free: true as const } : level > 0 ? { level } : null }
        : !mine && p.subclass
          ? { osm: String(p.subclass) }
          : {}),
    });
  };
  const enter = () => (map.getCanvas().style.cursor = 'pointer');
  const leave = () => (map.getCanvas().style.cursor = '');
  for (const id of [POI_LAYER, MINE_LAYER, CAT_LAYER]) {
    map.on('click', id, click as never);
    map.on('mouseenter', id, enter);
    map.on('mouseleave', id, leave);
  }
  return () => {
    map.setMissingStyleImageResolver(null);
    for (const id of [POI_LAYER, MINE_LAYER, CAT_LAYER]) {
      map.off('click', id, click as never);
      map.off('mouseenter', id, enter);
      map.off('mouseleave', id, leave);
    }
  };
}

export interface PinInfo {
  name: string;
  category: string;
  kind: 'poi' | 'saved' | 'recent';
  /** Saved place id (to remove it). */
  id?: string;
  address?: string;
  lat: number;
  lng: number;
  /** OpenStreetMap's `opening_hours`, where known. */
  hours?: string;
  /** How dear it is next to its kind, where known. */
  price?: PriceInfo | null;
  /** The basemap tile's own word for it ("cafe"), to look its hours and price up by. */
  osm?: string;
  /** Picked from the search list: the camera flies along the route to it before circling. */
  fromList?: boolean;
}

/** The rider's own places: saved (on top) and recently visited (not duplicating a saved one). */
export function setMyPins(map: MapLibreMap, saved: SavedPOI[], recent: MapSearchResult[]) {
  const src = map.getSource(MINE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.abs(a.lat - b.lat) < 2e-4 && Math.abs(a.lng - b.lng) < 2e-4;
  const features: GeoJSON.Feature[] = [
    ...saved.map((s) => ({ type: 'Feature' as const, properties: { kind: 'saved', id: s.id, name: s.name }, geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] } })),
    ...recent
      .filter((r) => !saved.some((s) => near(s, r)))
      .slice(0, 12)
      .map((r) => ({ type: 'Feature' as const, properties: { kind: 'recent', id: r.id, name: r.name, address: r.address }, geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] } })),
  ];
  src.setData({ type: 'FeatureCollection', features });
}

export function setPinsVisible(map: MapLibreMap, visible: boolean) {
  pinsShown = visible;
  for (const id of [POI_LAYER, MINE_LAYER, CAT_LAYER]) {
    // The basemap's places stay hidden while a quick search's are up.
    const on = visible && !(id === POI_LAYER && categoryUp);
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}

/** What a quick search needs to draw its pins: the category's name, colour and icon. */
export interface PinCategory {
  id: string;
  label: string;
  color: string;
  Icon: LucideIcon;
}

/**
 * Puts a quick search's results on the map, nearest first (the nearest drawn
 * bigger and ringed), and stands the basemap's own places down meanwhile.
 */
export async function showCategoryPins(map: MapLibreMap, cat: PinCategory, results: MapSearchResult[]) {
  for (const nearest of [false, true]) {
    const id = `${CAT_PREFIX}${cat.id}${nearest ? '-near' : ''}`;
    if (map.hasImage(id)) continue;
    const data = await drawCategoryPin(cat.color, cat.Icon, nearest);
    if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: PR });
  }
  const src = map.getSource(CAT_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    features: results.map((r, i) => ({
      type: 'Feature' as const,
      properties: {
        name: r.name,
        address: r.address,
        label: cat.label,
        img: `${CAT_PREFIX}${cat.id}${i === 0 ? '-near' : ''}`,
        near: i === 0,
        rank: i,
        hours: r.hours ?? '',
        // 0 free, a level, or -1 unknown (properties are flat).
        price: r.price ? ('free' in r.price ? 0 : r.price.level) : -1,
      },
      geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
    })),
  });
  categoryUp = results.length > 0;
  setPinsVisible(map, pinsShown);
}

/** Takes a quick search's pins off the map and brings the basemap's places back. */
export function clearCategoryPins(map: MapLibreMap) {
  const src = map.getSource(CAT_SOURCE) as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: [] });
  categoryUp = false;
  setPinsVisible(map, pinsShown);
}
