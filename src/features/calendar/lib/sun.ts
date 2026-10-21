/**
 * Sunrise and sunset for any day and place, worked out on the phone (the
 * standard solar-position formula, as suncalc uses it), so the calendar has
 * daylight for every day, not just the forecast's fortnight. Good to a minute
 * or two; null when the sun doesn't rise or set that day (polar summer or winter).
 */
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // obliquity of the Earth

const toJulian = (ms: number) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;
const toDays = (ms: number) => toJulian(ms) - J2000;

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}
const declination = (l: number) => Math.asin(Math.sin(E) * Math.sin(l));

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/** Sunrise and sunset (ms) on the day containing `date`, at `lat`, `lng`. */
export function sunTimes(date: Date, lat: number, lng: number): { rise: number | null; set: number | null } {
  const noon = new Date(date);
  noon.setHours(12, 0, 0, 0);
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(noon.getTime());
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);
  const h0 = RAD * -0.833; // the sun's top edge at the horizon, with refraction
  const cosW = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return { rise: null, set: null };
  const w = Math.acos(cosW);
  const a = approxTransit(w, lw, n);
  const Jset = solarTransitJ(a, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
}
