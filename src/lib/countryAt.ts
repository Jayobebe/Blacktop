import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';

/**
 * Which country a position is in, as the globe's own map numbers them (ISO
 * 3166 numeric). Worked out on the phone: the position itself goes nowhere.
 * This pulls in the world map, so load it with `import()`, never from a screen
 * that opens with the app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countries = (feature(countriesTopo as any, (countriesTopo as any).objects.countries) as any).features as Array<{ id?: string | number }>;

export function countryAt(lat: number, lng: number): number | null {
  for (const country of countries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (geoContains(country as any, [lng, lat])) {
      const id = Number(country.id);
      return Number.isFinite(id) && id > 0 ? id : null;
    }
  }
  return null;
}
