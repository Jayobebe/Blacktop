import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { X } from 'lucide-react';
import { loadDarkMapStyle, OPENFREEMAP_DARK_STYLE_URL } from '@/features/map/lib/darkStyle';
import { getLastView, saveLastView } from '@/features/map/lib/lastView';
import { noteLocationGranted } from '@/lib/locationGrant';
import { isThermal } from '@/lib/thermal';
import { whenStyleReady } from '@/features/map/lib/whenStyleReady';
import { addPinLayers, setMyPins } from '@/features/map/lib/mapPins';
import { applyWaterWordmark } from '@/features/map/lib/waterWordmark';
import { getSavedPOIs } from '@/features/map/lib/poiStore';
import { getRecentLocations } from '@/features/map/lib/placeSearch';
import { useConvoyMembers } from '@/features/convoy';
import { useProfile } from '@/features/profile';
import { useSpeakingUsers } from '@/features/voice';
import { getMemberColorStyles } from '@/lib/memberColors';
import { tr } from '@/lib/i18n';

/** A passenger who pans away gets the map to themselves for this long after their last touch. */
const HOLD_AFTER_TOUCH_MS = 8000;
/** Moving faster than this (m/s, ~7 mph), the map turns to face the way the bike is going. */
const HEADING_SPEED = 3;
/** Standing still, the camera only follows a move of at least this many metres. */
const MIN_MOVE_M = 15;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The passenger's map: the Blacktop dark map following the bike, with the
 * places a rider's map has (nearby places from the map itself, saved places,
 * recent destinations; a tap names one) and a pin for every other rider in the
 * convoy, but none for the passenger and no controls: one button back to the
 * passenger screen. It follows while the bike moves, facing the way it's
 * going; pinch and the wheel zoom about the middle without breaking the
 * follow, and a pan or a turn hands the map over until the passenger has left
 * it alone for a few seconds. It's an overlay, not a page, so the passenger
 * screen (and its voice chat) stays up underneath.
 */
/** The accent as a colour MapLibre can use. */
function accentColour() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return raw ? `hsl(${raw.split(/\s+/).join(', ')})` : '#f97316';
}

export default function PassengerMap({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const members = useConvoyMembers();
  const { user } = useProfile();
  const speaking = useSpeakingUsers();
  const pins = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>());

  // Places: the same pins as a rider's map, and the water drawn as the wordmark.
  useEffect(() => {
    if (!map) return;
    let removePins: (() => void) | null = null;
    const refreshMine = () => setMyPins(map, getSavedPOIs(), getRecentLocations());
    const cancel = whenStyleReady(map, () => {
      try {
        applyWaterWordmark(map, accentColour());
        removePins = addPinLayers(map, accentColour(), (p) => toast(p.name, p.address ? { description: p.address } : undefined));
        refreshMine();
      } catch (err) {
        if (/not done loading/i.test(String((err as Error)?.message ?? err))) throw err;
        console.warn('[PassengerMap] Pins unavailable:', err);
      }
    });
    return () => {
      cancel();
      removePins?.();
    };
  }, [map]);

  // Every other rider in the convoy, as on a rider's map: their first letter in their colour, glowing while they talk.
  useEffect(() => {
    if (!map) return;
    const shown = members.filter(
      (m): m is typeof m & { currentLat: number; currentLng: number } =>
        m.userId !== user?.id && Number.isFinite(m.currentLat) && Number.isFinite(m.currentLng),
    );
    const keep = new Set(shown.map((m) => m.userId));
    pins.current.forEach((p, id) => {
      if (!keep.has(id)) {
        p.marker.remove();
        pins.current.delete(id);
      }
    });
    for (const m of shown) {
      let p = pins.current.get(m.userId);
      if (!p) {
        const el = document.createElement('div');
        el.className = 'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-transform';
        p = { el, marker: new maplibregl.Marker({ element: el }).setLngLat([m.currentLng, m.currentLat]).addTo(map) };
        pins.current.set(m.userId, p);
      } else {
        p.marker.setLngLat([m.currentLng, m.currentLat]);
      }
      const c = getMemberColorStyles(m.accentColor);
      const talking = speaking.has(m.userId);
      p.el.textContent = (m.name.trim()[0] || '?').toUpperCase();
      p.el.style.backgroundColor = c.bg;
      p.el.style.borderColor = c.border;
      p.el.style.color = c.text;
      p.el.style.boxShadow = talking ? c.glow : 'none';
      p.el.style.transform = talking ? 'scale(1.15)' : 'scale(1)';
    }
  }, [map, members, speaking, user?.id]);

  useEffect(() => {
    const all = pins.current;
    return () => {
      all.forEach((p) => p.marker.remove());
      all.clear();
    };
  }, []);

  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    let watchId: number | null = null;
    let touchedAt = 0;
    let last: { lat: number; lng: number } | null = null;
    const start = getLastView();

    void loadDarkMapStyle()
      .catch((): string => OPENFREEMAP_DARK_STYLE_URL)
      .then((style) => {
      if (cancelled || !box.current) return;
      map = new maplibregl.Map({
        container: box.current,
        style,
        center: start ? [start.lng, start.lat] : [0, 20],
        zoom: start ? Math.max(start.zoom, 14) : 2,
        pixelRatio: MAP_PIXEL_RATIO,
        attributionControl: false,
        pitchWithRotate: false,
        fadeDuration: isThermal() ? 0 : 300,
      });
      setMap(map);
      // Zooming keeps the bike in the middle, so it never takes the map off the follow.
      map.touchZoomRotate.enable({ around: 'center' });
      map.scrollZoom.enable({ around: 'center' });
      const hold = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) touchedAt = Date.now();
      };
      map.on('dragstart', hold);
      map.on('rotatestart', hold);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          noteLocationGranted();
          if (!map) return;
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const speed = pos.coords.speed ?? 0;
          const first = !last;
          if (Date.now() - touchedAt < HOLD_AFTER_TOUCH_MS) return;
          if (!first && speed < HEADING_SPEED && last && metres(last, here) < MIN_MOVE_M) return;
          last = here;
          const heading = pos.coords.heading;
          map.easeTo({
            center: [here.lng, here.lat],
            ...(first && map.getZoom() < 12 ? { zoom: 15 } : {}),
            ...(speed >= HEADING_SPEED && heading != null && Number.isFinite(heading) ? { bearing: heading } : {}),
            duration: first || isThermal() ? 0 : 900,
            essential: true,
          });
          saveLastView({ ...here, zoom: map.getZoom() });
        },
        () => { /* no fix: the map stays where it opened */ },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
      );
    });

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      map?.remove();
      map = null;
      setMap(null);
    };
  }, []);

  // Android's back button closes the top dialog by sending Escape (NativeBridge).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" data-state="open" aria-label={tr("Map")} className="fixed inset-0 z-[150] bg-background map-shell">
      {/* MapLibre makes its container position: relative, so the map sits in a box that fills this one. */}
      <div className="absolute inset-0">
        <div ref={box} className="h-full w-full" />
      </div>
      <p className="absolute bottom-[calc(0.25rem+var(--safe-bottom))] left-[calc(0.5rem+var(--safe-left))] z-10 text-[9px] text-white/50 pointer-events-none">
        {tr("Map © OpenStreetMap contributors, OpenFreeMap")}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="absolute z-10 bottom-[calc(1.25rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 h-14 px-6 rounded-full frost-accent flex items-center gap-2 text-base font-semibold touch-target pressable"
      >
        <X className="w-5 h-5" />
        {tr("Back to ride")}
      </button>
    </div>
  );
}
