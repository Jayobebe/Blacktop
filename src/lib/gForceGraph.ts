export interface GraphPoint {
  x: number;
  y: number;
}

const MIN_SCALE_G = 1.5; // sane floor so a flat/calm ride doesn't blow up the trace
const HEADROOM = 1.1; // 10% headroom above the ride's own peak

/**
 * Maps a series of G-force readings onto an evenly-spaced width x height grid
 * (y=0 at top, increasing downward - matches both SVG and Canvas2D conventions).
 * Auto-scales to the series' own peak so calm rides still show a legible trace.
 */
export function buildGForcePoints(values: number[], width: number, height: number): GraphPoint[] {
  if (values.length === 0) return [];

  const peak = Math.max(...values, 0);
  const scale = Math.max(peak * HEADROOM, MIN_SCALE_G);

  if (values.length === 1) {
    const y = height - (Math.max(0, Math.min(scale, values[0])) / scale) * height;
    return [{ x: 0, y }, { x: width, y }];
  }

  return values.map((g, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - (Math.max(0, Math.min(scale, g)) / scale) * height,
  }));
}

/** SVG/Canvas2D path data for the trace line itself (consumable by <path d=...> or `new Path2D(d)`). */
export function pointsToLinePath(points: GraphPoint[]): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

/** Same trace, closed down to the baseline so it can be filled as an area. */
export function pointsToAreaPath(points: GraphPoint[], height: number): string {
  if (points.length === 0) return '';
  const line = pointsToLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`;
}
