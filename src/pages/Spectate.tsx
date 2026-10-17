import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Eye, Flag, Pause, X } from 'lucide-react';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { loadDarkMapStyle, OPENFREEMAP_DARK_STYLE_URL } from '@/features/map/lib/darkStyle';
import { whenStyleReady } from '@/features/map/lib/whenStyleReady';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/features/profile';
import { useSettings } from '@/features/settings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { isThermal } from '@/lib/thermal';
import { tr } from '@/lib/i18n';
import { PEAK_HIDDEN } from '@/features/ride';
import { glideMarker } from '@/lib/markerGlide';
import { END_EVENT, LIVE_EVENT, spectateChannelName, type LiveRide } from '@/features/spectate/lib/live';
import { PageTips } from '@/features/guide';

/** No word from the rider for this long: say the signal's gone. */
const QUIET_MS = 20_000;
const TRAIL_MAX = 900;

/**
 * Spectating an unlocked ride from Crew Convoys: a map that follows the
 * leader (or the solo rider) with an overlay-style HUD in the corners, like
 * the ride overlay video: who, where to, live and top speed, distance, time,
 * and lean and G when the rider runs them. Joining the channel's presence is
 * what tells the riders someone is watching (by name) and what makes the
 * rider's phone start sending (lib/live.ts). Panning stops the follow until
 * the follow button. Ends when the ride does.
 */
export default function Spectate() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const opened = useLocation().state as { name?: string; riding?: boolean } | null;
  const startName = opened?.name ?? '';
  // Opened from a lobby: nothing arrives until the leader sets off.
  const notStarted = opened?.riding === false;
  const { profile, user } = useProfile();
  const { settings } = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const trail = useRef<[number, number][]>([]);
  const followRef = useRef(true);
  const [follow, setFollow] = useState(true);
  const [live, setLive] = useState<LiveRide | null>(null);
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wakeLock = useWakeLock();
  useEffect(() => {
    void wakeLock.request();
    return () => {
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map.
  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    void loadDarkMapStyle()
      .catch((): string => OPENFREEMAP_DARK_STYLE_URL)
      .then((style) => {
        if (cancelled || !box.current) return;
        map = new maplibregl.Map({
          container: box.current,
          style,
          center: [0, 20],
          zoom: 2,
          pixelRatio: MAP_PIXEL_RATIO,
          attributionControl: false,
          fadeDuration: isThermal() ? 0 : 300,
        });
        mapRef.current = map;
        const stop = (e: { originalEvent?: unknown }) => {
          if (!e.originalEvent) return;
          followRef.current = false;
          setFollow(false);
        };
        map.on('dragstart', stop);
        map.on('rotatestart', stop);
        whenStyleReady(map, () => {
          if (!map || map.getSource('spectate-trail')) return;
          map.addSource('spectate-trail', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail.current } } });
          const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
          map.addLayer({
            id: 'spectate-trail',
            type: 'line',
            source: 'spectate-trail',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': accent ? `hsl(${accent.split(/\s+/).join(', ')})` : '#f59e0b', 'line-width': 4, 'line-opacity': 0.85 },
          });
        });
      });
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // The channel: be seen watching, and hear the ride.
  useEffect(() => {
    if (!id || !user?.id) return;
    const ch = supabase.channel(spectateChannelName(id), { config: { broadcast: { self: false }, presence: { key: user.id } } });
    ch.on('broadcast', { event: LIVE_EVENT }, ({ payload }) => setLive(payload as LiveRide));
    ch.on('broadcast', { event: END_EVENT }, () => setEnded(true));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ name: profile.name || tr("A crew member") });
    });
    return () => {
      void supabase.removeChannel(ch);
    };
    // The name is sent once, on joining.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // A clock for "last heard".
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Each update: the marker, the trail and the follow camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !live) return;
    const at: [number, number] = [live.lng, live.lat];
    const last = trail.current[trail.current.length - 1];
    if (!last || last[0] !== at[0] || last[1] !== at[1]) {
      trail.current.push(at);
      if (trail.current.length > TRAIL_MAX) trail.current.shift();
      const src = map.getSource('spectate-trail') as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trail.current } });
    }
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'spectate-marker';
      el.innerHTML = '<span></span>';
      markerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(at).addTo(map);
      map.jumpTo({ center: at, zoom: 15.5 });
    } else {
      // Updates come every 2 s: glide in step with the camera rather than hop.
      glideMarker(markerRef.current, at[0], at[1], 1800);
    }
    markerRef.current.setRotation(live.heading ?? 0);
    markerRef.current.getElement().classList.toggle('spectate-marker-dir', live.heading != null);
    if (followRef.current) {
      map.easeTo({
        center: at,
        ...(live.heading != null ? { bearing: live.heading } : {}),
        pitch: 45,
        duration: isThermal() ? 0 : 1800,
        easing: (t) => t,
        essential: true,
      });
    }
  }, [live]);

  const name = live?.name || startName || tr("Rider");
  const heardAgo = live ? now - live.at : null;
  const quiet = !ended && live != null && heardAgo != null && heardAgo > QUIET_MS;
  const speedUnit = getSpeedLabel(settings.speedUnit);
  const distUnit = getDistanceLabel(settings.distanceUnit);
  const back = () => navigate('/crew/convoys');

  // Portaled: the route's page wrapper is transformed, which would size a fixed layer to itself.
  return createPortal(
    <div className="fixed inset-0 z-40 bg-background map-shell" data-no-pull>
      <div className="absolute inset-0" data-tip="spectate-map">
        <div ref={box} className="h-full w-full" />
      </div>
      <PageTips
        page="spectate"
        when={!!live}
        tips={[
          { target: '[data-tip="spectate-who"]', text: tr("The riders can see you're watching: your name shows in their convoy list."), },
          { target: '[data-tip="spectate-map"]', text: tr("The map follows the rider. Drag it to look around; Follow brings it back to them.") },
        ]}
      />

      {/* Edge shade so the corners read over any map, as on the overlay video. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.7), transparent 22%, transparent 70%, rgb(0 0 0 / 0.8))' }}
      />

      {/* Top: who, where to, close */}
      <div className="absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(1rem+var(--safe-left))] right-[calc(1rem+var(--safe-right))] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            <span className={`w-2 h-2 rounded-full ${ended || quiet ? 'bg-white/40' : 'bg-red-500 animate-pulse'}`} />
            <Eye className="w-3 h-3" />
            {tr("Spectating")}
          </p>
          <p data-tip="spectate-who" className="text-xl font-bold text-white truncate">{name}</p>
          {live?.destination && (
            <p className="flex items-center gap-1 text-xs text-white/80 truncate">
              <Flag className="w-3 h-3 text-accent flex-shrink-0" />
              {live.destination}
            </p>
          )}
          {live && live.riders > 1 && <p className="text-[11px] text-white/60">{tr("{0} riders", [live.riders])}</p>}
        </div>
        <button
          type="button"
          onClick={back}
          aria-label={tr("Stop spectating")}
          className="h-12 w-12 rounded-full frost-accent flex items-center justify-center touch-target flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Middle: what's going on when there's nothing to show */}
      {(!live || ended || quiet) && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
          <p className="inline-block rounded-xl bg-black/70 px-4 py-3 text-sm text-white">
            {ended
              ? tr("{0}'s ride has ended.", [name])
              : quiet
                ? tr("Lost {0}'s signal. Waiting for them to come back…", [name])
                : notStarted
                  ? tr("Waiting for {0} to set off. The map follows them as soon as they do.", [name])
                  : tr("Waiting for {0}'s next update…", [name])}
          </p>
        </div>
      )}

      {/* Bottom: the figures */}
      {live && (
        <div className="absolute bottom-[calc(1rem+var(--safe-bottom))] left-[calc(1rem+var(--safe-left))] right-[calc(1rem+var(--safe-right))] flex items-end justify-between gap-4 text-white">
          <div>
            {live.paused && (
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-warning mb-1">
                <Pause className="w-3 h-3" />
                {tr("PAUSED")}
              </p>
            )}
            <p className="font-mono font-bold leading-none text-6xl short:text-5xl">
              {formatSpeed(live.speed, settings.speedUnit)}
              <span className="text-sm font-semibold text-white/70 ml-1">{speedUnit}</span>
            </p>
            <p className="text-[11px] uppercase tracking-widest text-white/70 mt-1 font-mono">
              {tr("Max")}{' '}
              {live.maxSpeed == null ? PEAK_HIDDEN : `${formatSpeed(live.maxSpeed, settings.speedUnit)} ${speedUnit}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right font-mono">
            <HudFigure label={tr("Distance")} value={`${formatDistance(live.distance, settings.distanceUnit)} ${distUnit}`} />
            <HudFigure label={tr("Time")} value={formatDuration(live.duration)} />
            {live.lean != null && (
              <HudFigure
                label={tr("Lean")}
                value={`${Math.abs(live.lean)}° ${live.lean < -1 ? tr("L") : live.lean > 1 ? tr("R") : ''}`.trim()}
                sub={live.maxLean == null ? undefined : tr("max {0}°", [live.maxLean])}
              />
            )}
            {live.g && (
              <HudFigure
                label={tr("G-force")}
                value={Math.hypot(live.g.lat, live.g.lng).toFixed(2)}
                sub={live.maxG == null ? undefined : tr("max {0}", [live.maxG.toFixed(2)])}
              />
            )}
          </div>
        </div>
      )}

      {!follow && live && (
        <button
          type="button"
          onClick={() => {
            followRef.current = true;
            setFollow(true);
            mapRef.current?.easeTo({ center: [live.lng, live.lat], zoom: 15.5, bearing: live.heading ?? 0, pitch: 45, duration: 600 });
          }}
          className="absolute right-[calc(1rem+var(--safe-right))] top-1/2 h-12 px-4 rounded-full frost-accent flex items-center gap-2 text-sm font-semibold touch-target"
        >
          <Crosshair className="w-4 h-4" />
          {tr("Follow")}
        </button>
      )}

      <p className="absolute bottom-[calc(0.15rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 text-[9px] text-white/40 pointer-events-none whitespace-nowrap">
        {tr("Map © OpenStreetMap contributors, OpenFreeMap")}
      </p>
    </div>,
    document.body,
  );
}

function HudFigure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-white/60">{label}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-white/60">{sub}</p>}
    </div>
  );
}
