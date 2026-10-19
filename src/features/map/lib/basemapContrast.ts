import type { StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap's dark style is nearly black on black: minor roads at #181818 on
 * a #0c0c0c background, labels mid-grey with no halo. This keeps its look but
 * lifts what riders read: roads are coloured by class the way road atlases and
 * signs do it (motorways blue, primary routes green, A roads red, B roads
 * amber, smaller roads a muted yellow, the rest grey), toned down for the dark
 * so the route line stays the brightest thing; fields, parks and woods are dark
 * greens (the style had no layer for fields at all, so one is added); water and
 * buildings get a tint and every label a dark halo. Layers are matched by id;
 * anything missing is left alone, so a style update upstream can't break it.
 */
const ROAD = {
  motorway: 'hsl(214, 58%, 44%)',
  trunk: 'hsl(146, 44%, 32%)',
  primary: 'hsl(358, 52%, 42%)',
  secondary: 'hsl(32, 64%, 40%)',
  tertiary: 'hsl(50, 36%, 36%)',
} as const;
/** The major-road layers carry trunk, primary, secondary and tertiary together: coloured per class. */
const byClass = ['match', ['get', 'class'], 'trunk', ROAD.trunk, 'primary', ROAD.primary, 'secondary', ROAD.secondary, ROAD.tertiary];
const CASING = 'rgba(0, 0, 0, 0.6)';

/** Grass, meadows and farmland: the dark style draws none of them. */
const FIELDS = {
  id: 'bt_landcover_fields',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landcover',
  filter: ['match', ['get', 'class'], ['grass', 'farmland'], true, false],
  paint: { 'fill-color': 'hsl(126, 24%, 11%)', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 0.95] },
} as unknown as StyleSpecification['layers'][number];

const PAINT: Record<string, Record<string, unknown>> = {
  background: { 'background-color': 'hsl(220, 6%, 6%)' },
  water: { 'fill-color': 'hsl(212, 30%, 13%)' },
  waterway: { 'line-color': 'hsl(212, 30%, 17%)' },
  landuse_residential: { 'fill-color': 'hsl(220, 4%, 8%)' },
  landcover_wood: { 'fill-color': 'hsl(138, 30%, 9%)', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 0.95] },
  landuse_park: { 'fill-color': 'hsl(130, 26%, 12%)' },
  building: { 'fill-color': 'hsl(220, 4%, 14%)' },
  'aeroway-runway': { 'line-color': 'hsl(0, 0%, 24%)' },
  'aeroway-taxiway': { 'line-color': 'hsl(0, 0%, 20%)' },
  highway_path: { 'line-color': 'hsl(0, 0%, 30%)' },
  highway_minor: { 'line-color': 'hsl(0, 0%, 27%)' },
  highway_major_casing: { 'line-color': CASING },
  highway_major_inner: { 'line-color': byClass },
  highway_major_subtle: { 'line-color': byClass },
  highway_motorway_casing: { 'line-color': CASING },
  highway_motorway_inner: { 'line-color': ROAD.motorway },
  highway_motorway_subtle: { 'line-color': ROAD.motorway },
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
  const layers = style.layers.flatMap((raw) => {
    const layer = raw as Layer;
    const paint: Record<string, unknown> = { ...(layer.paint ?? {}), ...(PAINT[layer.id] ?? {}) };
    // Woods in a plain dark green: the style's tree pattern drew over any colour.
    if (layer.id === 'landcover_wood') delete paint['fill-pattern'];
    // Labels: a dark halo so they read over roads and buildings.
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
      paint['text-halo-color'] = 'rgba(0, 0, 0, 0.9)';
      paint['text-halo-width'] = 1.4;
    }
    const out = { ...layer, paint } as StyleSpecification['layers'][number];
    // Fields go in under the woods (where the tiles' source is there to draw them).
    return layer.id === 'landcover_wood' && style.sources?.openmaptiles ? [FIELDS, out] : [out];
  });
  return { ...style, layers };
}
