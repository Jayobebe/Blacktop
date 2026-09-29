import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { lucideImage } from '@/lib/iconImage';
import { HAZARD_TYPES, hazardColor, type Hazard, type HazardKind } from '../types';

/**
 * Hazards on the Blacktop map: a pin per report in its category colour with
 * the hazard's own icon (the same lucide icon as the report picker) in white.
 * Unlike place pins these stay up while riding: that's when they matter.
 */
export const HAZARD_LAYER = 'bt-hazards';
const SOURCE = 'bt-hazards';
const PR = 2;
const W = 30 * PR;
const H = 38 * PR;

/** Map-pin shape: rounded square with a point, category colour, black edge, icon in the middle. */
function drawPin(color: string, icon: HTMLImageElement | null): ImageData {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = 7 * PR;
  const s = W - 4 * PR; // square side
  const x = 2 * PR;
  const y = 2 * PR;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + s, y, x + s, y + s, r);
  g.arcTo(x + s, y + s, x, y + s, r);
  g.lineTo(W / 2 + 5 * PR, y + s);
  g.lineTo(W / 2, H - 2 * PR);
  g.lineTo(W / 2 - 5 * PR, y + s);
  g.arcTo(x, y + s, x, y, r);
  g.arcTo(x, y, x + s, y, r);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 1.6 * PR;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.stroke();
  if (icon) {
    const size = 17 * PR;
    g.drawImage(icon, x + (s - size) / 2, y + (s - size) / 2, size, size);
  }
  return g.getImageData(0, 0, W, H);
}

let images: Promise<Map<HazardKind, ImageData>> | null = null;
function pinImages() {
  if (!images) {
    let missing = false;
    images = Promise.all(
      HAZARD_TYPES.map(async (t) => {
        let icon: HTMLImageElement | null = null;
        try {
          icon = await lucideImage(t.icon, { color: '#ffffff', strokeWidth: 2.4 });
        } catch {
          missing = true; // plain pin for now; drawn again next time
        }
        return [t.kind, drawPin(hazardColor(t.kind), icon)] as const;
      }),
    ).then((pairs) => {
      if (missing) images = null;
      return new Map(pairs);
    });
  }
  return images;
}

/** Adds the hazard layer (style must be ready). Returns a cleanup. */
export function addHazardLayer(map: MapLibreMap, onPick: (id: string) => void): () => void {
  if (!map.getStyle()) throw new Error('Style is not done loading');
  if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  let cancelled = false;
  void pinImages().then((imgs) => {
    if (cancelled) return;
    for (const [kind, data] of imgs) {
      const id = `bthaz-${kind}`;
      if (map.hasImage(id)) map.updateImage(id, data);
      else map.addImage(id, data, { pixelRatio: PR });
    }
    if (!map.getLayer(HAZARD_LAYER)) {
      map.addLayer({
        id: HAZARD_LAYER,
        type: 'symbol',
        source: SOURCE,
        minzoom: 9,
        layout: {
          'icon-image': ['concat', 'bthaz-', ['get', 'kind']],
          'icon-anchor': 'bottom',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 14, 1],
          'icon-allow-overlap': true,
          'symbol-sort-key': ['get', 'order'],
        },
      });
    }
  });
  const click = (e: { features?: { properties: Record<string, unknown> }[] }) => {
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === 'string') onPick(id);
  };
  const enter = () => (map.getCanvas().style.cursor = 'pointer');
  const leave = () => (map.getCanvas().style.cursor = '');
  map.on('click', HAZARD_LAYER, click as never);
  map.on('mouseenter', HAZARD_LAYER, enter);
  map.on('mouseleave', HAZARD_LAYER, leave);
  return () => {
    cancelled = true;
    map.off('click', HAZARD_LAYER, click as never);
    map.off('mouseenter', HAZARD_LAYER, enter);
    map.off('mouseleave', HAZARD_LAYER, leave);
  };
}

export function setHazardData(map: MapLibreMap, hazards: Hazard[]) {
  const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'FeatureCollection',
    // Newest on top.
    features: hazards.map((h) => ({
      type: 'Feature',
      properties: { id: h.id, kind: h.kind, order: -h.createdAt / 1000 },
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
    })),
  });
}
