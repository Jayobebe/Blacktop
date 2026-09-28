import type { StyleSpecification } from 'maplibre-gl';

/** Satellite imagery for the track builder: you can see the tarmac, kerbs and run-off. */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};

/** The rider's accent colour as a CSS colour MapLibre can paint with. */
export function accentColor(): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return raw ? `hsl(${raw.replace(/\s+/g, ', ')})` : '#f97316';
  } catch {
    return '#f97316';
  }
}

/** Start/finish, then one colour per sector (cycled). Sector lines stay purple, as on the minimap. */
export const SF_COLOR = '#ffffff';
export const SPLIT_COLOR = '#a855f7';
export const SECTOR_COLORS = ['#22d3ee', '#facc15', '#f472b6', '#4ade80', '#fb923c', '#60a5fa', '#e879f9', '#a3e635'];
export const sectorColor = (i: number) => SECTOR_COLORS[i % SECTOR_COLORS.length];
