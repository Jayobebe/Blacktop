/**
 * Where the rider is, for hazard warnings. During a ride the ride's own GPS
 * feeds this (HazardAlerts subscribes to it); on the home map, BlacktopMap
 * pushes its fixes here, so warnings work whenever you're moving with Blacktop.
 */
export interface HazardFix {
  lat: number;
  lng: number;
  /** m/s, when the device reports it. */
  speed: number | null;
  t: number;
}

const listeners = new Set<(f: HazardFix) => void>();

export function pushHazardFix(fix: HazardFix) {
  listeners.forEach((l) => l(fix));
}

export function onHazardFix(cb: (f: HazardFix) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Last position seen (for reporting from anywhere). */
let last: (HazardFix & { heading: number | null }) | null = null;
export function setLastHazardPosition(p: HazardFix & { heading: number | null }) {
  last = p;
}
export function getLastHazardPosition() {
  return last && Date.now() - last.t < 60_000 ? last : null;
}
