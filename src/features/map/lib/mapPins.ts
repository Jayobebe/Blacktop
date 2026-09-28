import type { GeoJSONSource, Map as MapLibreMap, MapStyleImageMissingEvent } from 'maplibre-gl';
import type { SavedPOI } from './poiStore';
import type { MapSearchResult } from './placeSearch';

/**
 * Pins on the map, Google-style:
 *   - nearby places straight from the basemap's own vector tiles (OpenMapTiles
 *     `poi` layer: no extra requests). Only the most important show when zoomed
 *     out; more appear as you zoom in (by the tiles' per-area `rank`);
 *   - the rider's saved places and recently visited destinations, always on
 *     top of the others.
 * Pin images are drawn here: a coloured circle per category with the style's
 * own icon recoloured white (the sprite's icons are dark, for light maps).
 * Hidden while the rider is moving, like the search bar.
 */

export const POI_LAYER = 'bt-poi';
export const MINE_LAYER = 'bt-mine';
const MINE_SOURCE = 'bt-mine';
const PIN_PREFIX = 'btpoi-';
const PR = 2; // images drawn at 2× for sharp pins

interface Group {
  color: string;
  label: string;
  classes: string[];
}

const GROUPS: Group[] = [
  { color: '#f97316', label: 'Food & drink', classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'pub', 'ice_cream', 'bakery', 'food_court', 'biergarten'] },
  { color: '#3b82f6', label: 'Fuel & vehicles', classes: ['fuel', 'charging_station', 'car', 'motorcycle', 'bicycle', 'parking', 'parking_garage', 'car_repair', 'bicycle_rental'] },
  { color: '#22c55e', label: 'Places to see', classes: ['attraction', 'museum', 'castle', 'monument', 'viewpoint', 'park', 'garden', 'campsite', 'picnic_site', 'art_gallery', 'zoo', 'aquarium', 'lighthouse', 'information', 'theatre', 'cinema', 'stadium', 'golf'] },
  { color: '#ec4899', label: 'Shops', classes: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'gift', 'furniture', 'hardware', 'florist', 'butcher', 'convenience', 'mall', 'music', 'books'] },
  { color: '#8b5cf6', label: 'Places to stay', classes: ['lodging'] },
  { color: '#ef4444', label: 'Health', classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'veterinary'] },
];
const OTHER: Group = { color: '#9ca3af', label: 'Place', classes: [] };
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
  const onMissing = (e: MapStyleImageMissingEvent) => {
    if (!e.id.startsWith(PIN_PREFIX) || map.hasImage(e.id)) return;
    map.addImage(e.id, drawPoiPin(e.id.slice(PIN_PREFIX.length)), { pixelRatio: PR });
  };
  map.on('styleimagemissing', onMissing);
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

  const click = (e: { features?: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry; layer: { id: string } }[] }) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== 'Point') return;
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    const mine = f.layer.id === MINE_LAYER;
    onPick({
      name: String(p.name ?? p['name:latin'] ?? 'Place'),
      category: mine ? (p.kind === 'saved' ? 'Saved place' : 'Visited recently') : groupOf(String(p.class)).label,
      kind: mine ? (p.kind as 'saved' | 'recent') : 'poi',
      id: mine ? String(p.id) : undefined,
      address: mine ? String(p.address ?? '') : undefined,
      lat,
      lng,
    });
  };
  const enter = () => (map.getCanvas().style.cursor = 'pointer');
  const leave = () => (map.getCanvas().style.cursor = '');
  for (const id of [POI_LAYER, MINE_LAYER]) {
    map.on('click', id, click as never);
    map.on('mouseenter', id, enter);
    map.on('mouseleave', id, leave);
  }
  return () => {
    map.off('styleimagemissing', onMissing);
    for (const id of [POI_LAYER, MINE_LAYER]) {
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
  for (const id of [POI_LAYER, MINE_LAYER]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}
