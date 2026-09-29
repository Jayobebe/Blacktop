import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

/**
 * Card drops on the Blacktop map, drawn by MapLibre like the hazard pins (not
 * DOM markers): they show from the same zoom as hazards, grow with the zoom,
 * and a refetch just swaps the data instead of rebuilding every marker (which
 * made them blink). Each look (edge colour, glow, count badge, time-attack
 * pip) is drawn once into a sprite.
 */
export const CARD_DROP_LAYER = 'bt-card-drops';
const SOURCE = 'bt-card-drops';
const PR = 2;
const PAD = 8; // room above and to the sides for the badge and glow

export interface CardPinLook {
  edge: string;
  /** Hot-spot glow colour and size (px); null for the plain drop shadow. */
  glow: { color: string; size: number } | null;
  badge: string | null;
  badgeBg: string;
  challenge: boolean;
  big: boolean;
}

export interface CardPin {
  key: string;
  lat: number;
  lng: number;
  look: CardPinLook;
}

// lucide "id-card"-style card glyph (24×24 grid).
const GLYPH = [
  'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  'M7 15h.01M11 15h2',
  'M11 10a2 2 0 1 1-4 0a2 2 0 1 1 4 0',
];

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const lookId = (l: CardPinLook) =>
  `btcard|${l.edge}|${l.glow ? `${l.glow.color}/${l.glow.size}` : '-'}|${l.badge ?? '-'}|${l.badgeBg}|${l.challenge ? 1 : 0}|${l.big ? 1 : 0}`;

function drawCardPin(l: CardPinLook): ImageData {
  const bw = l.big ? 34 : 30;
  const bh = l.big ? 42 : 38;
  const W = bw + PAD * 2;
  const H = bh + PAD;
  const c = document.createElement('canvas');
  c.width = W * PR;
  c.height = H * PR;
  const g = c.getContext('2d')!;
  g.scale(PR, PR);
  const x = PAD;
  const y = PAD;

  // Body (with the hot-spot glow or a soft drop shadow)
  g.save();
  if (l.glow) {
    g.shadowColor = l.glow.color;
    g.shadowBlur = l.glow.size;
  } else {
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
  }
  const fill = g.createLinearGradient(x, y, x + bw, y + bh);
  fill.addColorStop(0, 'rgba(30,30,32,0.96)');
  fill.addColorStop(1, 'rgba(10,10,12,0.96)');
  g.fillStyle = fill;
  roundRect(g, x, y, bw, bh, 6);
  g.fill();
  g.restore();
  g.lineWidth = 1.5;
  g.strokeStyle = l.edge;
  roundRect(g, x + 0.75, y + 0.75, bw - 1.5, bh - 1.5, 5.25);
  g.stroke();

  // Card glyph
  g.save();
  g.translate(x + bw / 2 - 8, y + bh / 2 - 8);
  g.scale(16 / 24, 16 / 24);
  g.strokeStyle = l.edge;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const d of GLYPH) g.stroke(new Path2D(d));
  g.restore();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Count / collected badge, top right
  if (l.badge) {
    g.font = '800 10px Inter, system-ui, sans-serif';
    const bwid = Math.max(15, g.measureText(l.badge).width + 6);
    const bx = x + bw + 6 - bwid;
    const by = y - 6;
    g.fillStyle = l.badgeBg;
    roundRect(g, bx, by, bwid, 15, 7.5);
    g.fill();
    g.fillStyle = '#04140a';
    g.fillText(l.badge, bx + bwid / 2, by + 8);
  }
  // Time-attack pip, bottom left (inside the sprite so it isn't clipped)
  if (l.challenge) {
    const cx = x + 2;
    const cy = y + bh - 8;
    g.fillStyle = l.badgeBg;
    g.beginPath();
    g.arc(cx, cy, 8, 0, Math.PI * 2);
    g.fill();
    // stopwatch
    g.strokeStyle = '#04140a';
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy + 0.8, 4, 0, Math.PI * 2);
    g.moveTo(cx, cy + 0.8);
    g.lineTo(cx, cy - 1.6);
    g.moveTo(cx - 1.4, cy - 4.8);
    g.lineTo(cx + 1.4, cy - 4.8);
    g.stroke();
  }
  return g.getImageData(0, 0, W * PR, H * PR);
}

/** Adds the card-drop layer (style must be ready). Returns a cleanup. */
export function addCardDropLayer(map: MapLibreMap, onPick: (key: string) => void): () => void {
  if (!map.getStyle()) throw new Error('Style is not done loading');
  if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer(CARD_DROP_LAYER)) {
    map.addLayer({
      id: CARD_DROP_LAYER,
      type: 'symbol',
      source: SOURCE,
      // Same rule as hazard reports: from zoom 9, growing to full size at 14.
      minzoom: 9,
      layout: {
        'icon-image': ['get', 'img'],
        'icon-anchor': 'bottom',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 14, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'order'],
      },
    });
  }
  const click = (e: { features?: { properties: Record<string, unknown> }[] }) => {
    const key = e.features?.[0]?.properties?.key;
    if (typeof key === 'string') onPick(key);
  };
  const enter = () => (map.getCanvas().style.cursor = 'pointer');
  const leave = () => (map.getCanvas().style.cursor = '');
  map.on('click', CARD_DROP_LAYER, click as never);
  map.on('mouseenter', CARD_DROP_LAYER, enter);
  map.on('mouseleave', CARD_DROP_LAYER, leave);
  return () => {
    map.off('click', CARD_DROP_LAYER, click as never);
    map.off('mouseenter', CARD_DROP_LAYER, enter);
    map.off('mouseleave', CARD_DROP_LAYER, leave);
    if (map.getLayer(CARD_DROP_LAYER)) map.removeLayer(CARD_DROP_LAYER);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  };
}

export function setCardDropData(map: MapLibreMap, pins: CardPin[]) {
  const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  const features = pins.map((p, i) => {
    const img = lookId(p.look);
    if (!map.hasImage(img)) map.addImage(img, drawCardPin(p.look), { pixelRatio: PR });
    return {
      type: 'Feature' as const,
      // Hotter stacks draw on top.
      properties: { key: p.key, img, order: (p.look.glow?.size ?? 0) * 1000 + i },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    };
  });
  src.setData({ type: 'FeatureCollection', features });
}
