import { supabase } from '@/integrations/supabase/client';

export interface TrafficCamera {
  id: string;
  lat: number;
  lng: number;
  type: 'speed' | 'alpr' | 'surveillance';
  direction: string | null;
  maxspeed: string | null;
}

export interface CameraBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Below this zoom the bbox is too large for a sensible Overpass query and the
// markers would just be noise — the layer hides itself under this level.
export const CAMERA_MIN_ZOOM = 13;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { cameras: TrafficCamera[]; fetchedAt: number }>();

// Quantize to ~0.02° grid cells so small pans reuse the previous fetch.
const CELL = 0.02;

function bucketKey(bounds: CameraBounds): string {
  const q = (n: number) => Math.floor(n / CELL);
  return `${q(bounds.west)}:${q(bounds.south)}:${q(bounds.east)}:${q(bounds.north)}`;
}

export async function fetchTrafficCameras(
  bounds: CameraBounds,
  zoom: number,
): Promise<TrafficCamera[]> {
  if (zoom < CAMERA_MIN_ZOOM) return [];

  const key = bucketKey(bounds);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.cameras;
  }

  try {
    const { data, error } = await supabase.functions.invoke('place-search', {
      body: { kind: 'cameras', ...bounds, zoom },
    });
    if (error || !Array.isArray(data)) return [];

    const cameras = (data as TrafficCamera[]).filter(
      (c) => Number.isFinite(c.lat) && Number.isFinite(c.lng),
    );
    cache.set(key, { cameras, fetchedAt: Date.now() });
    // Cap cache size so long sessions don't accumulate unbounded entries.
    if (cache.size > 60) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return cameras;
  } catch {
    return [];
  }
}

// ── Route camera scanning ────────────────────────────────────────────────────
// Cameras "on route" = OSM cameras within CORRIDOR_M of the route polyline.
const CORRIDOR_M = 60;

export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance from point to segment, in a local flat projection (fine at these scales).
function pointToSegmentMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - bx * t, py - by * t);
}

export function camerasOnRoute(
  cameras: TrafficCamera[],
  coordinates: [number, number][],
): TrafficCamera[] {
  if (coordinates.length < 2) return [];
  return cameras.filter((cam) => {
    for (let i = 1; i < coordinates.length; i++) {
      const a = { lng: coordinates[i - 1][0], lat: coordinates[i - 1][1] };
      const b = { lng: coordinates[i][0], lat: coordinates[i][1] };
      if (pointToSegmentMeters(cam, a, b) <= CORRIDOR_M) return true;
    }
    return false;
  });
}

// Cameras along a whole route: queries the route bbox (padded) at a zoom the
// backend accepts, then narrows to the corridor.
export async function fetchCamerasOnRoute(
  coordinates: [number, number][],
): Promise<TrafficCamera[]> {
  if (coordinates.length < 2) return [];
  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const pad = 0.01;
  const bounds: CameraBounds = {
    west: Math.min(...lngs) - pad,
    east: Math.max(...lngs) + pad,
    south: Math.min(...lats) - pad,
    north: Math.max(...lats) + pad,
  };
  const all = await fetchTrafficCameras(bounds, CAMERA_MIN_ZOOM);
  return camerasOnRoute(all, coordinates);
}
