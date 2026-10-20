export interface LngLat { lng: number; lat: number; }

/** Metres per degree longitude at a given latitude. */
export function metresPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}
export const METRES_PER_DEG_LAT = 110540;

/** Project lng/lat into a local metre plane around an origin. */
export function toMetres(p: LngLat, origin: LngLat): [number, number] {
  return [
    (p.lng - origin.lng) * metresPerDegLng(origin.lat),
    (p.lat - origin.lat) * METRES_PER_DEG_LAT,
  ];
}

export function distanceM(a: LngLat, b: LngLat) {
  const [x, y] = toMetres(b, a);
  return Math.hypot(x, y);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
}

/** True when segment p1-p2 crosses segment p3-p4 (in a flat metre plane). */
export function segmentsIntersect(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number],
) {
  const d1 = orient(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
  const d2 = orient(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
  const d3 = orient(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
  const d4 = orient(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance (metres) from point p to segment a-b, all in metre space. */
export function pointSegmentDistance(p: [number, number], a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/** Ray-casting point-in-polygon on raw lng/lat rings. */
export function pointInPolygon(p: LngLat, ring: LngLat[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const hit = (yi > p.lat) !== (yj > p.lat)
      && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Approximate polygon area in m². */
export function polygonAreaM2(ring: LngLat[]) {
  if (ring.length < 3) return 0;
  const origin = ring[0];
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = toMetres(ring[i], origin);
    const [xj, yj] = toMetres(ring[j], origin);
    area += xj * yi - xi * yj;
  }
  return Math.abs(area / 2);
}

/** Ramer-Douglas-Peucker on screen-space points (pixels). */
export function simplifyPx(points: [number, number][], tolerance = 3): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(points[i], points[first], points[last]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Bounding box of a ring -> [[west, south], [east, north]] */
export function ringBounds(ring: LngLat[]): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of ring) {
    w = Math.min(w, p.lng); e = Math.max(e, p.lng);
    s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  return [[w, s], [e, n]];
}

export function ringToGeoJson(ring: LngLat[]) {
  const coords = ring.map(p => [p.lng, p.lat]);
  if (coords.length) coords.push(coords[0]);
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  };
}
