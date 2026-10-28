/**
 * Keeps the rider's drawn pin on the road (imports nothing).
 *
 * GPS is good to a few metres at best and the reckoned position between fixes
 * runs straight on round a bend, so a pin drawn where the phone says drifts off
 * the road lines, more so on curves. Given the lines near the rider (the route
 * being guided, and the basemap's own roads), `snap` moves a point onto the
 * nearest one that runs the rider's way, when it's close enough to believe:
 * the route within `ROUTE_M`, any road within `ROAD_M`. Off every road (a car
 * park, a field, a road the map hasn't got) it leaves the point alone.
 *
 * It sticks to the line it snapped to last while that's still close, so two
 * roads side by side (a slip road, a service road) don't swap the pin back and
 * forth, and a turn onto another road takes over once that road is clearly the
 * nearer.
 */
export type LngLat = [number, number];

const M_PER_DEG = 111_320;
/** The route being guided: the rider is on it unless clearly not. */
const ROUTE_M = 30;
/** Any other road: only when the point is already nearly on it. */
const ROAD_M = 14;
/** The road snapped to last keeps the pin until another is this much nearer. */
const STICKY_M = 4;
/** A road at more than this to the rider's heading isn't the one they're on (either way along it). */
const ALIGN_DEG = 50;

interface Seg {
  /** Metres east / north of the frame's origin. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Which line it belongs to (sticky), and whether it's the route. */
  line: number;
  route: boolean;
}

export class RoadSnapper {
  private segs: Seg[] = [];
  private origin: { lat: number; lng: number } | null = null;
  private kx = M_PER_DEG;
  private lastLine = -1;

  /** The lines to snap to: the route (may be empty) and the roads near the rider, as [lng, lat] points. */
  setLines(route: LngLat[] | null, roads: LngLat[][], near: { lat: number; lng: number }, radiusM = 600) {
    this.origin = near;
    this.kx = M_PER_DEG * Math.cos((near.lat * Math.PI) / 180);
    const segs: Seg[] = [];
    const add = (pts: LngLat[], line: number, isRoute: boolean) => {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = this.local(pts[i - 1]);
        const [bx, by] = this.local(pts[i]);
        // Only what's near the rider: a segment with an end in the box, or crossing it.
        if (Math.min(ax, bx) > radiusM || Math.max(ax, bx) < -radiusM || Math.min(ay, by) > radiusM || Math.max(ay, by) < -radiusM) continue;
        if (ax === bx && ay === by) continue;
        segs.push({ ax, ay, bx, by, line, route: isRoute });
      }
    };
    if (route && route.length > 1) add(route, 0, true);
    roads.forEach((r, i) => add(r, i + 1, false));
    this.segs = segs;
    this.lastLine = -1;
  }

  /** Where the lines were last gathered round (to know when to gather them again). */
  get centre() {
    return this.origin;
  }

  get empty() {
    return this.segs.length === 0;
  }

  /**
   * The point moved onto the road the rider is on, or itself when there isn't
   * one close enough. `heading` (degrees) when the rider is moving, else null:
   * standing still any road will do, but only the very nearest.
   */
  snap(lat: number, lng: number, heading: number | null): { lat: number; lng: number } {
    if (!this.origin || !this.segs.length) return { lat, lng };
    const [px, py] = this.local([lng, lat]);
    let best: { d: number; x: number; y: number; line: number; route: boolean } | null = null;
    let sticky: { d: number; x: number; y: number; line: number; route: boolean } | null = null;
    for (const s of this.segs) {
      const limit = s.route ? ROUTE_M : ROAD_M;
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len2 = dx * dx + dy * dy;
      const u = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
      const x = s.ax + dx * u;
      const y = s.ay + dy * u;
      const d = Math.hypot(px - x, py - y);
      if (d > limit) continue;
      if (heading != null) {
        const segDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const off = Math.abs(((((segDeg - heading) % 180) + 270) % 180) - 90);
        if (off > ALIGN_DEG) continue;
      }
      // The route counts as a few metres nearer than a road the same distance off: it's where they're going.
      const score = s.route ? d - 6 : d;
      if (!best || score < best.d) best = { d: score, x, y, line: s.line, route: s.route };
      if (s.line === this.lastLine && (!sticky || score < sticky.d)) sticky = { d: score, x, y, line: s.line, route: s.route };
    }
    const pick = sticky && best && sticky.d - best.d < STICKY_M ? sticky : best;
    if (!pick) {
      this.lastLine = -1;
      return { lat, lng };
    }
    this.lastLine = pick.line;
    return this.global(pick.x, pick.y);
  }

  private local([lng, lat]: LngLat): [number, number] {
    const o = this.origin!;
    return [(lng - o.lng) * this.kx, (lat - o.lat) * M_PER_DEG];
  }

  private global(x: number, y: number): { lat: number; lng: number } {
    const o = this.origin!;
    return { lat: o.lat + y / M_PER_DEG, lng: o.lng + x / this.kx };
  }
}
