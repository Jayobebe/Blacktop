/**
 * Where the rider last was on the map, so it opens there (not London, then a
 * long pan) and only nudges to the fresh GPS fix.
 */
const KEY = 'blacktop_map_last_view';

export interface LastView {
  lat: number;
  lng: number;
  zoom: number;
}

export function getLastView(): LastView | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180) {
      return { lat: v.lat, lng: v.lng, zoom: Number.isFinite(v.zoom) ? Math.min(18, Math.max(3, v.zoom)) : 14 };
    }
  } catch {
    /* unreadable: start from the default */
  }
  return null;
}

let lastWrite = 0;

/** Remembers a position (throttled: GPS fixes arrive every second). */
export function saveLastView(view: LastView, force = false) {
  const now = Date.now();
  if (!force && now - lastWrite < 10_000) return;
  lastWrite = now;
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat: +view.lat.toFixed(5), lng: +view.lng.toFixed(5), zoom: +view.zoom.toFixed(1) }));
  } catch {
    /* storage full or blocked: not worth failing over */
  }
}
