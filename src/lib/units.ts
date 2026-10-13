import { tr } from '@/lib/i18n';

/**
 * Distances and speeds written out in the rider's own units, for text that
 * isn't a gauge: Mecha-Nick's lines, toasts, a track's length, how far a
 * rescue call reaches. The units are read from Settings as stored, so this
 * works in module code and callbacks as well as components.
 */
export interface Units {
  distance: 'miles' | 'km';
  speed: 'mph' | 'kph';
}

const SETTINGS_KEY = 'blacktop-settings';
const KM_PER_MI = 1.609344;

/** The rider's units from Settings (miles / mph when unset). */
export function currentUnits(): Units {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as { distanceUnit?: string; speedUnit?: string };
    return { distance: s.distanceUnit === 'km' ? 'km' : 'miles', speed: s.speedUnit === 'kph' ? 'kph' : 'mph' };
  } catch {
    return { distance: 'miles', speed: 'mph' };
  }
}

const figure = (n: number, digits = 0) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A distance kept in kilometres, whole: "350 km" / "217 mi". */
export function kmText(km: number, unit = currentUnits().distance): string {
  return unit === 'km' ? tr("{0} km", [figure(Math.round(km))]) : tr("{0} mi", [figure(Math.round(km / KM_PER_MI))]);
}

/** A distance kept in miles, whole: "212 mi" / "341 km". */
export function milesText(miles: number, unit = currentUnits().distance): string {
  return kmText(miles * KM_PER_MI, unit);
}

/**
 * A distance kept in metres, to the size it is: "40 m", "1.2 km", "130 ft",
 * "0.8 mi". `digits` is the decimals once it's in km or miles.
 */
export function metresText(m: number, digits = 1, unit = currentUnits().distance): string {
  if (unit === 'km') return m < 1000 ? tr("{0} m", [figure(Math.round(m))]) : tr("{0} km", [figure(m / 1000, digits)]);
  const feet = m * 3.28084;
  return feet < 1000 ? tr("{0} ft", [figure(Math.round(feet / 5) * 5)]) : tr("{0} mi", [figure(m / 1000 / KM_PER_MI, digits)]);
}

/** "mph" or "km/h", as the rider reads speed. */
export function speedUnitText(unit = currentUnits().speed): string {
  return unit === 'kph' ? tr("km/h") : tr("mph");
}

/** A speed kept in mph as a figure in the rider's units. */
export function speedFigure(mph: number, unit = currentUnits().speed): number {
  return Math.round(unit === 'kph' ? mph * KM_PER_MI : mph);
}

/** A speed kept in mph: "104 mph" / "167 km/h". */
export function speedText(mph: number, unit = currentUnits().speed): string {
  return `${speedFigure(mph, unit)} ${speedUnitText(unit)}`;
}
