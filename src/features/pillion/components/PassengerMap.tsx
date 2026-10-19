import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { Flag, UserRound, X } from 'lucide-react';
import { loadDarkMapStyle, OPENFREEMAP_DARK_STYLE_URL } from '@/features/map/lib/darkStyle';
import { getLastView, saveLastView } from '@/features/map/lib/lastView';
import { noteLocationGranted } from '@/lib/locationGrant';
import { isThermal } from '@/lib/thermal';
import { whenStyleReady } from '@/features/map/lib/whenStyleReady';
import { addPinLayers, setMyPins } from '@/features/map/lib/mapPins';
import { applyWaterWordmark } from '@/features/map/lib/waterWordmark';
import { getSavedPOIs } from '@/features/map/lib/poiStore';
import { getRecentLocations } from '@/features/map/lib/placeSearch';
import { useConvoyMembers, useConvoyState } from '@/features/convoy';
import { useProfile } from '@/features/profile';
import { useSettings } from '@/features/settings';
import { useSpeakingUsers } from '@/features/voice';
import { getMemberColorStyles } from '@/lib/memberColors';
import { formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { glideMarker } from '@/lib/markerGlide';
import { PEAK_HIDDEN, usePeaksHidden } from '@/features/ride';
import { RiderSwitch } from '@/features/spectate/components/RiderSwitch';

/** A passenger who pans away gets the map to themselves for this long after their last touch. */
const HOLD_AFTER_TOUCH_MS = 8000;
/** Moving faster than this (m/s, ~7 mph), the map turns to face the way the bike is going. */
const HEADING_SPEED = 3;
/** Standing still, the camera only follows a move of at least this many metres. */
const MIN_MOVE_M = 15;
const TRAIL_MAX = 900;
const MS_TO_MPH = 2.23694;
/** The passenger's own bike, as one of the things the map can follow. */
const BIKE = 'bike';
/** Who the map was following, so opening it again carries on with them. */
let lastFocus: string = BIKE;
const M_TO_MI = 1 / 1609.34;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** The accent as a colour MapLibre can use. */
function accentColour() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return raw ? `hsl(${raw.split(/\s+/).join(', ')})` : '#f97316';
}

/**
 * The passenger's map, in the spectator screen's look (pages/Spectate): the
 * Blacktop dark map following the bike, tilted, with the bike as the spectate
 * arrow and its trail since the map opened, a shade at the top and bottom
 * edges, and the corners read like the overlay video: who you're riding with
 * and where to at the top, the bike's speed (and the top speed and distance
 * since the map opened) at the bottom. It has the places a rider's map has
 * (nearby, saved, recent; a tap names one) and a pin for every other rider in
 * the convoy, glowing while they talk. It follows while the bike moves,
 * facing the way it's going, gliding between fixes; pinch and the wheel zoom
 * about the middle without breaking the follow, and a pan or a turn hands the
 * map over until the passenger has left it alone for a few seconds. It's an
 * overlay, not a page, so the passenger screen (and its voice chat) stays up
 * underneath; the X or Android's Back closes it.
 */
export default function PassengerMap({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const members = useConvoyMembers();
  const { convoy } = useConvoyState();
  const { user } = useProfile();
  const { settings } = useSettings();
  const speaking = useSpeakingUsers();
  const peaksHidden = usePeaksHidden();
  const pins = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>());
  const [speed, setSpeed] = useState<number | null>(null);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [focus, setFocus] = useState(lastFocus);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const touchedAtRef = useRef(0);

  const leader = convoy.members.find((m) => m.isLeader);
  const destination = convoy.destination;

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
        // MapLibre positions the outer box by its transform, so the badge (and its speaking scale) is inside it.
        const box = document.createElement('div');
        const el = document.createElement('div');
        el.className = 'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-transform cursor-pointer';
        box.appendChild(el);
        box.addEventListener('click', () => setFocus(m.userId));
        p = { el, marker: new maplibregl.Marker({ element: box }).setLngLat([m.currentLng, m.currentLat]).addTo(map) };
        pins.current.set(m.userId, p);
      } else {
        glideMarker(p.marker, m.currentLng, m.currentLat);
      }
      const c = getMemberColorStyles(m.accentColor);
      const talking = speaking.has(m.userId);
      p.el.textContent = (m.name.trim()[0] || '?').toUpperCase();
      p.el.style.backgroundColor = c.bg;
      p.el.style.borderColor = c.border;
      p.el.style.color = c.text;
      const followed = m.userId === focus;
      p.el.style.boxShadow = followed ? '0 0 0 3px white, 0 0 0 6px rgb(0 0 0 / 0.5)' : talking ? c.glow : 'none';
      p.el.style.transform = followed || talking ? 'scale(1.15)' : 'scale(1)';
    }
    // Following a rider: the camera goes with their updates (every few seconds), gliding at their pace.
    const target = shown.find((m) => m.userId === focus);
    if (target && Date.now() - touchedAtRef.current >= HOLD_AFTER_TOUCH_MS) {
      map.easeTo({ center: [target.currentLng, target.currentLat], duration: isThermal() ? 0 : 1200, essential: true });
    }
  }, [map, members, speaking, user?.id, focus]);

  useEffect(() => {
    const all = pins.current;
    return () => {
      all.forEach((p) => p.marker.remove());
      all.clear();
    };
  }, []);

  // The map, the bike's arrow and trail, and the follow.
  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map | null = null;
    let bike: maplibregl.Marker | null = null;
    let cancelled = false;
    let watchId: number | null = null;
    let touchedAt = 0;
    let last: { lat: number; lng: number } | null = null;
    let lastFixAt = 0;
    const trail: [number, number][] = [];
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
          pitch: 45,
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
          if (e.originalEvent) touchedAt = touchedAtRef.current = Date.now();
        };
        map.on('dragstart', hold);
        map.on('rotatestart', hold);
        whenStyleReady(map, () => {
          if (!map || map.getSource('passenger-trail')) return;
          map.addSource('passenger-trail', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail } } });
          map.addLayer({
            id: 'passenger-trail',
            type: 'line',
            source: 'passenger-trail',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': accentColour(), 'line-width': 4, 'line-opacity': 0.85 },
          });
        });

        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            noteLocationGranted();
            if (!map) return;
            const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const mps = pos.coords.speed;
            const moving = (mps ?? 0) >= HEADING_SPEED;
            const heading = pos.coords.heading;
            const facing = moving && heading != null && Number.isFinite(heading) ? heading : null;
            if (mps != null && Number.isFinite(mps)) {
              const mph = mps * MS_TO_MPH;
              setSpeed(mph);
              setMaxSpeed((m) => Math.max(m, mph));
            }
            const gap = lastFixAt ? Math.min(2000, Math.max(250, Date.now() - lastFixAt)) : 1000;
            lastFixAt = Date.now();
            const first = !last;
            if (!first && !moving && last && metres(last, here) < MIN_MOVE_M) return;
            if (last) setDistance((d) => d + metres(last!, here) * M_TO_MI);
            last = here;

            // The bike: the spectate arrow, gliding over the gap between fixes, and its trail.
            trail.push([here.lng, here.lat]);
            if (trail.length > TRAIL_MAX) trail.shift();
            (map.getSource('passenger-trail') as maplibregl.GeoJSONSource | undefined)?.setData({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: trail },
            });
            if (!bike) {
              const el = document.createElement('div');
              el.className = 'spectate-marker';
              el.innerHTML = '<span></span>';
              bike = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([here.lng, here.lat]).addTo(map);
            } else {
              glideMarker(bike, here.lng, here.lat, gap, 'linear');
            }
            if (facing != null) bike.setRotation(facing);
            bike.getElement().classList.toggle('spectate-marker-dir', facing != null);

            if (Date.now() - touchedAt < HOLD_AFTER_TOUCH_MS || focusRef.current !== BIKE) return;
            map.easeTo({
              center: [here.lng, here.lat],
              ...(first && map.getZoom() < 12 ? { zoom: 15.5 } : {}),
              ...(facing != null ? { bearing: facing } : {}),
              duration: first || isThermal() ? 0 : gap,
              easing: (t) => t,
              essential: true,
            });
            saveLastView({ ...here, zoom: map.getZoom() });
          },
          () => {
            /* no fix: the map stays where it opened */
          },
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
        );
      });

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      bike?.remove();
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

  const speedUnit = getSpeedLabel(settings.speedUnit);
  const riders = convoy.members.length;
  // The bike first, then every other rider with a position: the arrows move between them.
  const others = members.filter((m) => m.userId !== user?.id && Number.isFinite(m.currentLat) && Number.isFinite(m.currentLng));
  const order = [BIKE, ...others.map((m) => m.userId)];
  const focusKey = order.includes(focus) ? focus : BIKE;
  const followed = others.find((m) => m.userId === focusKey) ?? null;
  useEffect(() => {
    lastFocus = focusKey;
  }, [focusKey]);
  const step = (by: number) => {
    const i = order.indexOf(focusKey);
    setFocus(order[(i + by + order.length) % order.length]);
    touchedAtRef.current = 0;
  };
  // What the corners show: the bike's own figures, or the followed rider's (as the convoy has them).
  const shownSpeed = followed ? followed.currentSpeed ?? null : speed;
  const shownMax = followed ? followed.topSpeed ?? null : peaksHidden ? null : maxSpeed;
  const shownDistance = followed ? followed.distanceDriven ?? 0 : distance;

  return (
    <div role="dialog" data-state="open" aria-label={tr("Map")} className="fixed inset-0 z-[150] bg-background map-shell">
      {/* MapLibre makes its container position: relative, so the map sits in a box that fills this one. */}
      <div className="absolute inset-0">
        <div ref={box} className="h-full w-full" />
      </div>

      {/* Edge shade so the corners read over any map, as on the spectator screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.7), transparent 22%, transparent 70%, rgb(0 0 0 / 0.8))' }}
      />

      {/* Top: whose convoy, where to, close */}
      <div className="absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(1rem+var(--safe-left))] right-[calc(1rem+var(--safe-right))] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            <UserRound className="w-3 h-3" />
            {tr("Passenger")}
          </p>
          <RiderSwitch name={followed ? followed.name : tr("Your bike")} index={order.indexOf(focusKey)} total={order.length} onStep={step} />
          <p className="text-xs text-white/80 truncate">{leader ? tr("{0}'s convoy", [leader.name]) : tr("Convoy")}</p>
          {destination?.name && (
            <p className="flex items-center gap-1 text-xs text-white/80 truncate">
              <Flag className="w-3 h-3 text-accent flex-shrink-0" />
              {destination.name}
            </p>
          )}
          {riders > 1 && <p className="text-[11px] text-white/60">{tr("{0} riders", [riders])}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Back to ride")}
          className="h-12 w-12 rounded-full frost-accent flex items-center justify-center touch-target flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom: the bike's speed, and since the map opened its top speed and distance */}
      {shownSpeed != null && (
        <div className="absolute bottom-[calc(1rem+var(--safe-bottom))] left-[calc(1rem+var(--safe-left))] right-[calc(1rem+var(--safe-right))] flex items-end justify-between gap-4 text-white pointer-events-none">
          <div>
            <p className="font-mono font-bold leading-none text-6xl short:text-5xl">
              {formatSpeed(shownSpeed, settings.speedUnit)}
              <span className="text-sm font-semibold text-white/70 ml-1">{speedUnit}</span>
            </p>
            <p className="text-[11px] uppercase tracking-widest text-white/70 mt-1 font-mono">
              {tr("Max")} {shownMax == null ? PEAK_HIDDEN : `${formatSpeed(shownMax, settings.speedUnit)} ${speedUnit}`}
            </p>
          </div>
          <div className="text-right font-mono">
            <p className="text-[9px] uppercase tracking-widest text-white/60">{tr("Distance")}</p>
            <p className="text-lg font-bold leading-tight">{`${formatDistance(shownDistance, settings.distanceUnit)} ${getDistanceLabel(settings.distanceUnit)}`}</p>
          </div>
        </div>
      )}

      <p className="absolute bottom-[calc(0.15rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-10 text-[9px] text-white/40 pointer-events-none whitespace-nowrap">
        {tr("Map © OpenStreetMap contributors, OpenFreeMap")}
      </p>
    </div>
  );
}
