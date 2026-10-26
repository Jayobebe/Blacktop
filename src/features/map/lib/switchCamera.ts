/**
 * The switch camera: one camera timeline of legs, played frame by frame with
 * `jumpTo`, so every move (out to a place, back to the rider) is the same
 * three jumps up into a haze, across high above with a swing, and three jumps
 * down. Each pause waits for the basemap's tiles out of one short allowance for
 * the whole move. BlacktopMap uses it for a place picked from the list (landing
 * in the orbit) and for Back out of an orbit (landing on the rider in the follow
 * view, or on the view the rider left).
 */
import type * as maplibregl from 'maplibre-gl';
import { eventSound } from '@/lib/appSound';

type MapLibreMap = maplibregl.Map;

type Padding = { top: number; bottom: number; left: number; right: number };
/** `padding`: where on screen `center` lands (the follow view keeps the rider low); eased in over the leg that sets it. */
export type Cam = { center: [number, number]; zoom: number; bearing: number; pitch: number; padding?: Padding };

/**
 * One stretch of the camera's path. `spinIn` winds a turn up over it at `spinIn`
 * degrees a second by its end (the orbit's speed, so the orbit carries on from it).
 * `hold`: at its end, wait up to this long for the tiles in view before going on.
 * `swerve`: a swing of the bearing and a lift of the pitch that rise and fall over the leg.
 */
export type Leg = {
  ms: number;
  to: Cam;
  ease: (u: number) => number;
  whoosh?: boolean;
  spinIn?: number;
  hold?: number;
  swerve?: { bearing: number; pitch: number };
};

export const outExpo = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
export const outCubic = (u: number) => 1 - Math.pow(1 - u, 3);
export const inOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The camera's padding now, every side filled in. */
function padOf(map: MapLibreMap): Padding {
  const p = map.getPadding();
  return { top: p.top ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0, right: p.right ?? 0 };
}

/** The basemap's own tiles are in (radar, hazards and the rest can keep loading behind). */
function basemapReady(map: MapLibreMap) {
  try {
    return map.getSource('openmaptiles') ? map.isSourceLoaded('openmaptiles') : map.areTilesLoaded();
  } catch {
    return true;
  }
}

/** The haze's opacity and scale, set straight on the element (no React). */
export function setHaze(haze: HTMLElement | null, o: number, scale = 1) {
  if (!haze) return;
  haze.style.opacity = o > 0.005 ? o.toFixed(3) : '0';
  haze.style.transform = `scale(${scale.toFixed(3)})`;
}

/**
 * The switch from where the camera is to `to`: up in three jumps over where it
 * is, flattening north-up, across high enough to have both ends in view with a
 * swing towards the way it's heading, down in three jumps, and a last leg that
 * tilts and turns into `to`'s pitch and bearing (or, with `orbit`, into a
 * 60-degree view with the orbit's turn winding up as it lands).
 */
export function switchLegs(map: MapLibreMap, to: Cam, opts: { orbit?: number } = {}): { legs: Leg[]; high: number } {
  const c = map.getCenter();
  const start: [number, number] = [c.lng, c.lat];
  const z0 = map.getZoom();
  const ground = to.zoom;
  const canvas = map.getCanvas();
  const room = Math.max(120, Math.min(canvas.clientWidth, canvas.clientHeight) - 160);
  const lat = ((c.lat + to.center[1]) / 2) * (Math.PI / 180);
  const spanM = Math.max(50, haversineM(c.lat, c.lng, to.center[1], to.center[0]));
  const fit = Math.log2((156543.03 * Math.cos(lat) * room) / spanM);
  // High enough to have both ends in view, and always three real jumps up and down.
  const high = Math.max(2, Math.min(fit, ground - 3.6, z0 - 2.4));
  const up = (k: number) => z0 + ((high - z0) * k) / 3;
  const down = (k: number) => high + ((ground - high) * k) / 3;
  const DRIFT = 0.14; // each jump overshoots a touch and drifts back, so it never stops dead
  const pitchUp = map.getPitch();
  const bearingUp = map.getBearing();
  const legs: Leg[] = [];
  for (let k = 1; k <= 3; k++) {
    const p = k === 1 ? pitchUp * 0.35 : 0;
    const b = k === 1 ? bearingUp * 0.4 : 0;
    legs.push({ ms: 260, to: { center: start, zoom: up(k) - DRIFT, bearing: b, pitch: p }, ease: outExpo, whoosh: true, swerve: { bearing: 0, pitch: 6 } });
    legs.push({ ms: k === 3 ? 160 : 210, to: { center: start, zoom: up(k), bearing: b, pitch: p }, ease: outCubic, hold: 450 });
  }
  const dLng = (to.center[0] - c.lng) * Math.cos(lat);
  const east = to.center[0] >= c.lng ? 1 : -1;
  const sideways = Math.min(1, Math.abs(dLng) / Math.max(1e-9, Math.hypot(dLng, to.center[1] - c.lat)));
  legs.push({
    ms: Math.round(750 + 300 * Math.min(1, spanM / 20_000)),
    to: { center: to.center, zoom: high, bearing: 0, pitch: 0 },
    ease: inOutCubic,
    swerve: { bearing: east * (4 + 8 * sideways), pitch: 24 },
  });
  legs.push({ ms: 140, to: { center: to.center, zoom: high + 0.05, bearing: 0, pitch: 0 }, ease: outCubic, hold: 600 });
  for (let k = 1; k <= 3; k++) {
    legs.push({ ms: 240, to: { center: to.center, zoom: down(k) + (k === 3 ? -0.1 : DRIFT), bearing: 0, pitch: 0 }, ease: outExpo, whoosh: true, swerve: { bearing: 0, pitch: 6 }, hold: k === 3 ? 450 : 0 });
    if (k < 3) legs.push({ ms: 190, to: { center: to.center, zoom: down(k), bearing: 0, pitch: 0 }, ease: outCubic, hold: 450 });
  }
  legs.push(
    opts.orbit
      ? { ms: 650, to: { center: to.center, zoom: ground, bearing: 0, pitch: 60 }, ease: outCubic, spinIn: opts.orbit }
      : { ms: 650, to, ease: outCubic },
  );
  return { legs, high };
}

/**
 * Plays legs one after another from where the camera is. `high` is the top of
 * the climb (for the haze; null for a move with no haze) and `ground` the zoom
 * it comes down to. `alive` is asked every frame (false stops it where it is);
 * `onDone` runs once the last leg has landed. Returns a stop.
 */
export function playLegs(
  map: MapLibreMap,
  legs: Leg[],
  opts: { high: number | null; ground: number; haze: HTMLElement | null; alive: () => boolean; onDone: () => void },
): () => void {
  const { high, ground, haze, alive, onDone } = opts;
  const c = map.getCenter();
  let from: Cam = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), padding: padOf(map) };
  let i = 0;
  let raf = 0;
  let began = performance.now();
  let flashAt = -1e9;
  let spun = 0;
  let heldFrom = 0;
  // Waiting for tiles shares one allowance across the whole move, so a slow connection can't make it drag.
  let holdLeft = 800;
  let lastHeld = 0;
  const startLeg = (now: number) => {
    began = now;
    spun = 0;
    heldFrom = 0;
    if (legs[i].whoosh) {
      flashAt = now;
      eventSound('whoosh');
    }
  };
  startLeg(began);
  const step = (now: number) => {
    if (!alive()) {
      setHaze(haze, 0);
      return;
    }
    let leg = legs[i];
    let u = Math.min(1, (now - began) / leg.ms);
    if (u >= 1 && leg.hold && !basemapReady(map)) {
      // Hold the pose (the haze stays up) until the tiles have caught up, or the wait runs out.
      if (!heldFrom) heldFrom = now;
      if (lastHeld) holdLeft -= now - lastHeld;
      lastHeld = now;
      if (now - heldFrom < leg.hold && holdLeft > 0) {
        raf = requestAnimationFrame(step);
        return;
      }
      lastHeld = 0;
    }
    if (u >= 1) {
      const padding = leg.to.padding ?? from.padding;
      map.jumpTo({ ...leg.to, bearing: leg.to.bearing + spun, padding });
      from = { ...leg.to, bearing: leg.to.bearing + spun, padding };
      if (++i >= legs.length) {
        setHaze(haze, 0);
        onDone();
        return;
      }
      startLeg(now);
      leg = legs[i];
      u = 0;
    }
    const e = leg.ease(u);
    const lerp = (a: number, b: number) => a + (b - a) * e;
    // Winding a turn up from still: the speed rises in a straight line, so the turn is its square.
    spun = leg.spinIn ? (leg.spinIn * (leg.ms / 1000) * u * u) / 2 : 0;
    const zoom = lerp(from.zoom, leg.to.zoom);
    const sway = leg.swerve ? Math.sin(Math.PI * e) : 0;
    map.jumpTo({
      center: [lerp(from.center[0], leg.to.center[0]), lerp(from.center[1], leg.to.center[1])],
      zoom,
      bearing: from.bearing + turn(from.bearing, leg.to.bearing) * e + spun + sway * (leg.swerve?.bearing ?? 0),
      pitch: lerp(from.pitch, leg.to.pitch) + sway * (leg.swerve?.pitch ?? 0),
      ...(leg.to.padding && from.padding
        ? {
            padding: {
              top: lerp(from.padding.top, leg.to.padding.top),
              bottom: lerp(from.padding.bottom, leg.to.padding.bottom),
              left: lerp(from.padding.left, leg.to.padding.left),
              right: lerp(from.padding.right, leg.to.padding.right),
            },
          }
        : {}),
    });
    if (high != null) {
      // Thicker the higher the camera, a flash of it at every jump, and the cloud swelling as the camera drops through it.
      const alt = Math.min(1, Math.max(0, (ground - zoom) / Math.max(0.5, ground - high)));
      const flash = Math.max(0, 1 - (now - flashAt) / 320);
      setHaze(haze, Math.min(0.9, 0.72 * Math.pow(alt, 0.75) + 0.35 * flash), 1.25 - 0.25 * alt);
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    setHaze(haze, 0);
  };
}
