import type * as maplibregl from 'maplibre-gl';
import { windText } from '@/lib/units';
import { windColour } from './windWarning';
import type { WindStretch } from './windRoute';

/**
 * Wind drawn on the map: arrows on the route where the side gusts are
 * (map/lib/windRoute), and the wind layer (map/hooks/useWindOverlay), a grid
 * of arrows over the view like the rain radar. One arrow sprite, tinted per
 * arrow (`sdf`), turned with the map.
 */
const ARROW = 'bt-wind-arrow';
const ROUTE_SOURCE = 'bt-wind-route';
const ROUTE_LAYER = 'bt-wind-route';
export const OVERLAY_SOURCE = 'bt-wind-overlay';
const OVERLAY_LAYER = 'bt-wind-overlay';
const PR = 2;

/** A plain arrow pointing up (north), white for tinting. */
function arrowImage(): ImageData {
  const size = 48 * PR;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  const m = size / 2;
  const u = size / 48;
  g.moveTo(m, 4 * u);
  g.lineTo(m + 13 * u, 20 * u);
  g.lineTo(m + 5 * u, 20 * u);
  g.lineTo(m + 5 * u, 44 * u);
  g.lineTo(m - 5 * u, 44 * u);
  g.lineTo(m - 5 * u, 20 * u);
  g.lineTo(m - 13 * u, 20 * u);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, size, size);
}

function ensureArrow(map: maplibregl.Map) {
  if (!map.hasImage(ARROW)) map.addImage(ARROW, arrowImage(), { pixelRatio: PR, sdf: true });
}

const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

/** The route's wind arrows, above the route line and under the labels and pins (call when the style is ready). */
export function addWindRouteLayer(map: maplibregl.Map) {
  ensureArrow(map);
  if (!map.getSource(ROUTE_SOURCE)) map.addSource(ROUTE_SOURCE, { type: 'geojson', data: empty() });
  if (map.getLayer(ROUTE_LAYER)) return;
  map.addLayer({
    id: ROUTE_LAYER,
    type: 'symbol',
    source: ROUTE_SOURCE,
    layout: {
      'icon-image': ARROW,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 0.8],
      'icon-rotate': ['get', 'towards'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-offset': [0, 1.7],
      'text-allow-overlap': true,
      'text-optional': true,
    },
    paint: {
      'icon-color': ['get', 'colour'],
      'icon-halo-color': 'rgba(0,0,0,0.85)',
      'icon-halo-width': 2,
      'text-color': ['get', 'colour'],
      'text-halo-color': 'rgba(0,0,0,0.9)',
      'text-halo-width': 1.5,
    },
  });
}

export function setWindRouteData(map: maplibregl.Map, stretches: WindStretch[]) {
  const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: stretches.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { towards: s.towards, colour: windColour(s.level), label: windText(s.crossKmh) },
    })),
  });
}

export interface WindCell {
  lat: number;
  lng: number;
  speedKmh: number;
  gustKmh: number;
  towards: number;
}

/** Calm to gale, the arrows' colour by the wind's speed (km/h). */
const SPEED_COLOURS: Array<[number, string]> = [
  [0, '#7dd3fc'],
  [20, '#38bdf8'],
  [35, '#a3e635'],
  [50, '#f59e0b'],
  [70, '#ef4444'],
  [90, '#d946ef'],
];

/** The wind layer: an arrow per cell, under the route and the labels (call when the style is ready). */
export function addWindOverlayLayer(map: maplibregl.Map, beforeId?: string) {
  ensureArrow(map);
  if (!map.getSource(OVERLAY_SOURCE)) map.addSource(OVERLAY_SOURCE, { type: 'geojson', data: empty() });
  if (map.getLayer(OVERLAY_LAYER)) return;
  map.addLayer(
    {
      id: OVERLAY_LAYER,
      type: 'symbol',
      source: OVERLAY_SOURCE,
      layout: {
        'icon-image': ARROW,
        // Bigger for a stronger wind.
        'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.35, 30, 0.55, 70, 0.8],
        'icon-rotate': ['get', 'towards'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.5],
        'text-optional': true,
      },
      paint: {
        'icon-color': ['interpolate', ['linear'], ['get', 'speed'], ...SPEED_COLOURS.flat()] as never,
        'icon-opacity': 0.85,
        'icon-halo-color': 'rgba(0,0,0,0.7)',
        'icon-halo-width': 1.5,
        'text-color': 'rgba(255,255,255,0.8)',
        'text-halo-color': 'rgba(0,0,0,0.9)',
        'text-halo-width': 1.2,
      },
    },
    beforeId,
  );
}

export function setWindOverlayData(map: maplibregl.Map, cells: WindCell[]) {
  const src = map.getSource(OVERLAY_SOURCE) as maplibregl.GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: cells.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { towards: c.towards, speed: c.speedKmh, label: windText(c.speedKmh) },
    })),
  });
}

export function removeWindOverlayLayer(map: maplibregl.Map) {
  try {
    if (!map.getStyle()) return;
    if (map.getLayer(OVERLAY_LAYER)) map.removeLayer(OVERLAY_LAYER);
    if (map.getSource(OVERLAY_SOURCE)) map.removeSource(OVERLAY_SOURCE);
  } catch {
    /* map gone */
  }
}
