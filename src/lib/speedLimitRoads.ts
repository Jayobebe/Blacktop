/**
 * Speed limits from OpenStreetMap, the parts that need nothing else (so
 * `npm run speedlimit:check` can run them in Node): reading a `maxspeed` tag,
 * and matching GPS fixes to the road being ridden (`RoadMatcher`). The store
 * and the fetching are in `lib/speedLimit.ts`.
 */
export interface SpeedLimit {
  /** The limit in km/h. */
  kmh: number;
  /** The unit the sign is in (mph in Britain and the US). */
  unit: 'mph' | 'kmh';
  /** The figure on the sign, in that unit. */
  value: number;
}

/** A road: its limit (null when none is mapped) and its line, flattened [lng, lat, lng, lat, …]. */
export type Way = { limit: SpeedLimit | null; pts: ArrayLike<number> };

const MATCH_M = 25;
const MPH = 1.609344;

/** Implied limits ("DE:urban", "GB:nsl_single"): the common ones, in their own units. */
const IMPLIED: Record<string, [number, 'mph' | 'kmh']> = {
  'GB:nsl_single': [60, 'mph'], 'GB:nsl_dual': [70, 'mph'], 'GB:motorway': [70, 'mph'], 'GB:nsl_restricted': [30, 'mph'],
  'UK:nsl_single': [60, 'mph'], 'UK:nsl_dual': [70, 'mph'], 'UK:motorway': [70, 'mph'],
  'IE:urban': [50, 'kmh'], 'IE:rural': [80, 'kmh'], 'IE:national': [100, 'kmh'], 'IE:motorway': [120, 'kmh'],
  'DE:rural': [100, 'kmh'], 'AT:rural': [100, 'kmh'], 'AT:motorway': [130, 'kmh'], 'CH:rural': [80, 'kmh'], 'CH:motorway': [120, 'kmh'],
  'FR:rural': [80, 'kmh'], 'FR:motorway': [130, 'kmh'], 'IT:rural': [90, 'kmh'], 'IT:motorway': [130, 'kmh'],
  'ES:rural': [90, 'kmh'], 'ES:motorway': [120, 'kmh'], 'PT:rural': [90, 'kmh'], 'PT:motorway': [120, 'kmh'],
  'NL:rural': [80, 'kmh'], 'NL:motorway': [100, 'kmh'], 'BE:rural': [70, 'kmh'], 'BE-VLG:rural': [70, 'kmh'], 'BE-WAL:rural': [90, 'kmh'], 'BE:motorway': [120, 'kmh'],
  'DK:rural': [80, 'kmh'], 'DK:motorway': [130, 'kmh'], 'SE:rural': [70, 'kmh'], 'NO:rural': [80, 'kmh'], 'FI:rural': [80, 'kmh'],
  'PL:rural': [90, 'kmh'], 'PL:motorway': [140, 'kmh'], 'CZ:rural': [90, 'kmh'], 'CZ:motorway': [130, 'kmh'], 'HU:rural': [90, 'kmh'], 'HU:motorway': [130, 'kmh'],
  'RU:rural': [90, 'kmh'], 'RU:motorway': [110, 'kmh'], 'UA:rural': [90, 'kmh'], 'UA:motorway': [130, 'kmh'], 'TR:rural': [90, 'kmh'], 'TR:motorway': [120, 'kmh'],
};

/** A maxspeed tag as a limit, or null when it gives none ("none", "signals", "walk", unknown). */
export function parseMaxspeed(raw: string | null | undefined): SpeedLimit | null {
  if (!raw) return null;
  const first = raw.split(';')[0].trim();
  const m = first.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
  if (m) {
    const value = Math.round(parseFloat(m[1]));
    if (!(value > 0) || value > 200) return null;
    const unit = m[2] && /mph/i.test(m[2]) ? 'mph' : 'kmh';
    return { value, unit, kmh: unit === 'mph' ? value * MPH : value };
  }
  const implied = IMPLIED[first];
  if (implied) return { value: implied[0], unit: implied[1], kmh: implied[1] === 'mph' ? implied[0] * MPH : implied[0] };
  // "DE:zone30", "zone:30", "XX:zone20": a zone's figure; "XX:urban" is 50 km/h nearly everywhere it's used.
  const zone = first.match(/zone:?(\d+)$/i);
  if (zone) {
    const value = parseInt(zone[1], 10);
    const unit = first.startsWith('GB') || first.startsWith('UK') ? 'mph' : 'kmh';
    return value > 0 ? { value, unit, kmh: unit === 'mph' ? value * MPH : value } : null;
  }
  if (/^[A-Z]{2}(-[A-Z]+)?:urban$/.test(first)) return { value: 50, unit: 'kmh', kmh: 50 };
  return null;
}

/**
 * Follows the rider from fix to fix: the nearest road line within `MATCH_M`,
 * preferring one running the way they're going (a road at right angles counts
 * as 31 m further away), so a side road or a bridge overhead doesn't take it.
 * A new limit has to agree on two fixes running (junctions don't flicker);
 * three fixes off every road clear it.
 */
export class RoadMatcher {
  current: SpeedLimit | null = null;
  private prev: { lat: number; lng: number } | null = null;
  private heading: number | null = null;
  private pending: { kmh: number | null; n: number } = { kmh: null, n: 0 };
  private missed = 0;

  /** A fix (speed in m/s when known) against the roads around it (null: not loaded yet, keep what's shown). Returns the limit now. */
  step(lat: number, lng: number, speed: number | null, ways: Way[] | null): SpeedLimit | null {
    if (this.prev) {
      const [e, n] = metres(this.prev.lat, this.prev.lng, lat, lng);
      if (Math.hypot(e, n) > 4) {
        this.heading = (Math.atan2(e, n) * 180) / Math.PI;
        this.prev = { lat, lng };
      }
    } else {
      this.prev = { lat, lng };
    }
    if (!ways) return this.current;
    const moving = speed == null || speed > 2;
    let best: { score: number; limit: SpeedLimit | null } | null = null;
    for (const w of ways) {
      const p = w.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const d = segmentDistance(lat, lng, p[i + 1], p[i], p[i + 3], p[i + 2]);
        if (d.m > MATCH_M) continue;
        let score = d.m;
        if (moving && this.heading != null) {
          const off = Math.abs((((d.bearing - this.heading) % 180) + 270) % 180 - 90); // 0 along the road (either way), 90 across it
          score += off * 0.35;
        }
        if (!best || score < best.score) best = { score, limit: w.limit };
      }
    }
    if (!best) {
      if (++this.missed >= 3) {
        this.pending = { kmh: null, n: 0 };
        this.current = null;
      }
      return this.current;
    }
    this.missed = 0;
    const kmh = best.limit?.kmh ?? null;
    if (this.current == null && kmh != null) {
      this.pending = { kmh, n: 2 };
      this.current = best.limit;
      return this.current;
    }
    this.pending = this.pending.kmh === kmh ? { kmh, n: this.pending.n + 1 } : { kmh, n: 1 };
    if (this.pending.n >= 2) this.current = best.limit;
    return this.current;
  }
}

function metres(aLat: number, aLng: number, bLat: number, bLng: number): [number, number] {
  const k = Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return [(bLng - aLng) * 111_320 * k, (bLat - aLat) * 111_320];
}

/** Distance from a point to a segment (metres), and the segment's bearing (degrees). */
function segmentDistance(lat: number, lng: number, aLat: number, aLng: number, bLat: number, bLng: number) {
  const [ax, ay] = metres(lat, lng, aLat, aLng);
  const [bx, by] = metres(lat, lng, bLat, bLng);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const m = Math.hypot(ax + dx * t, ay + dy * t);
  return { m, bearing: (Math.atan2(dx, dy) * 180) / Math.PI };
}
