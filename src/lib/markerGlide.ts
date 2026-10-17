import type { Marker } from 'maplibre-gl';
import { isThermal } from '@/lib/thermal';

/**
 * Moves a map pin to a new position by gliding there instead of jumping.
 * Other riders' positions arrive every few seconds, so a pin set straight to
 * each one hops from place to place; this eases it along over `ms` (about
 * the gap between updates), so it moves like the rider does. A new position
 * arriving mid-glide carries on from wherever the pin is. It jumps instead
 * for the first placement, a move of more than 3 km (a lost signal coming
 * back, a GPS error), under Thermal mode or reduced motion, and while the
 * page is hidden, so nothing animates where nobody can see it.
 */
const gliding = new WeakMap<Marker, number>();

const JUMP_M = 3000;

function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371e3;
}

export function glideMarker(marker: Marker, lng: number, lat: number, ms = 2500) {
  const prev = gliding.get(marker);
  if (prev) cancelAnimationFrame(prev);
  gliding.delete(marker);
  const from = marker.getLngLat();
  const still =
    isThermal() ||
    document.hidden ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    !Number.isFinite(from.lng) ||
    metres(from.lat, from.lng, lat, lng) > JUMP_M;
  if (still || (from.lng === lng && from.lat === lat)) {
    marker.setLngLat([lng, lat]);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    // Gentle ease-out: quick to respond, settling onto the new spot.
    const k = 1 - (1 - t) * (1 - t);
    marker.setLngLat([from.lng + (lng - from.lng) * k, from.lat + (lat - from.lat) * k]);
    if (t < 1) gliding.set(marker, requestAnimationFrame(step));
    else gliding.delete(marker);
  };
  gliding.set(marker, requestAnimationFrame(step));
}
