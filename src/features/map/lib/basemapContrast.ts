import type { StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap's dark style is nearly black on black: minor roads at #181818 on
 * a #0c0c0c background, labels mid-grey with no halo. This keeps its look but
 * lifts what riders read: roads step up in brightness by importance, water and
 * green space get a faint tint, buildings show, and every label gets a dark
 * halo. Layers are matched by id; anything missing is left alone, so a style
 * update upstream can't break the map.
 */
const PAINT: Record<string, Record<string, unknown>> = {
  background: { 'background-color': 'hsl(220, 6%, 6%)' },
  water: { 'fill-color': 'hsl(212, 30%, 13%)' },
  waterway: { 'line-color': 'hsl(212, 30%, 17%)' },
  landuse_residential: { 'fill-color': 'hsl(220, 4%, 8%)' },
  landcover_wood: { 'fill-color': 'hsl(135, 12%, 10%)' },
  landuse_park: { 'fill-color': 'hsl(135, 14%, 11%)' },
  building: { 'fill-color': 'hsl(220, 4%, 14%)' },
  'aeroway-runway': { 'line-color': 'hsl(0, 0%, 24%)' },
  'aeroway-taxiway': { 'line-color': 'hsl(0, 0%, 20%)' },
  highway_path: { 'line-color': 'hsl(0, 0%, 30%)' },
  highway_minor: { 'line-color': 'hsl(0, 0%, 27%)' },
  highway_major_casing: { 'line-color': 'hsla(0, 0%, 48%, 0.9)' },
  highway_major_inner: { 'line-color': 'hsl(0, 0%, 33%)' },
  highway_major_subtle: { 'line-color': 'hsl(0, 0%, 30%)' },
  highway_motorway_casing: { 'line-color': 'hsla(0, 0%, 60%, 0.9)' },
  highway_motorway_subtle: { 'line-color': 'hsl(0, 0%, 34%)' },
  railway: { 'line-color': 'hsl(0, 0%, 30%)' },
  railway_minor: { 'line-color': 'hsl(0, 0%, 26%)' },
  railway_transit: { 'line-color': 'hsl(0, 0%, 28%)' },
  boundary_state: { 'line-color': 'hsl(0, 0%, 36%)' },
  'boundary_country_z0-4': { 'line-color': 'hsl(0, 0%, 42%)' },
  'boundary_country_z5-': { 'line-color': 'hsl(0, 0%, 42%)' },
  highway_name_other: { 'text-color': 'hsl(0, 0%, 66%)' },
  highway_name_motorway: { 'text-color': 'hsl(0, 0%, 74%)' },
  water_name: { 'text-color': 'hsl(212, 35%, 62%)' },
  place_other: { 'text-color': 'hsl(0, 0%, 66%)' },
  place_suburb: { 'text-color': 'hsl(0, 0%, 70%)' },
  place_village: { 'text-color': 'hsl(0, 0%, 74%)' },
  place_town: { 'text-color': 'hsl(0, 0%, 82%)' },
  place_city: { 'text-color': 'hsl(0, 0%, 88%)' },
  place_city_large: { 'text-color': 'hsl(0, 0%, 92%)' },
  place_state: { 'text-color': 'hsl(0, 0%, 62%)' },
};

type Layer = StyleSpecification['layers'][number] & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };

export function boostContrast(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((raw) => {
    const layer = raw as Layer;
    const paint = { ...(layer.paint ?? {}), ...(PAINT[layer.id] ?? {}) };
    // Labels: a dark halo so they read over roads and buildings.
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      paint['text-halo-color'] = 'rgba(0, 0, 0, 0.9)';
      paint['text-halo-width'] = 1.4;
    }
    return { ...layer, paint } as StyleSpecification['layers'][number];
  });
  return { ...style, layers };
}
