import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import type { Fix } from './timing';

/**
 * Track Pack's own GPS watch at the fastest rate the phone allows. It runs
 * while walking a track, waiting on the grid and racing, independent of the
 * ride tracker (which only starts at launch), so no fix around the start is
 * ever missed.
 */
type Listener = (fix: Fix) => void;

const listeners = new Set<Listener>();
let watchId: string | number | null = null;
let starting = false;

function emit(lat: number, lng: number, speed: number | null | undefined, accuracy: number | null | undefined, t: number) {
  const fix: Fix = {
    t,
    lat,
    lng,
    speed: speed != null && speed >= 0 ? speed : null,
    accuracy: accuracy ?? null,
  };
  listeners.forEach((l) => l(fix));
}

async function start() {
  if (watchId !== null || starting) return;
  starting = true;
  try {
    if (Capacitor.isNativePlatform()) {
      await Geolocation.requestPermissions().catch(() => {});
      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, interval: 100, minimumUpdateInterval: 0, maximumAge: 0, timeout: 10000 },
        (p: Position | null) => {
          if (p) emit(p.coords.latitude, p.coords.longitude, p.coords.speed, p.coords.accuracy, p.timestamp);
        },
      );
    } else if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (p) => emit(p.coords.latitude, p.coords.longitude, p.coords.speed, p.coords.accuracy, p.timestamp),
        (e) => console.warn('[TrackGPS]', e?.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    }
  } finally {
    starting = false;
  }
}

async function stop() {
  const id = watchId;
  watchId = null;
  if (id === null) return;
  if (Capacitor.isNativePlatform()) await Geolocation.clearWatch({ id: id as string }).catch(() => {});
  else navigator.geolocation?.clearWatch(id as number);
}

/** Subscribe to high-rate fixes; the watch runs while anyone is subscribed. */
export function subscribeTrackGps(l: Listener): () => void {
  listeners.add(l);
  void start();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) void stop();
  };
}
