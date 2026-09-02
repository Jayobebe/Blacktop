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
