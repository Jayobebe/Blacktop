import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { ACCENT_COLORS } from '@/features/settings';
import { useWakeLock } from '@/hooks/useWakeLock';
import { Heart, Skull } from 'lucide-react';
import type { DerezLobby, DerezPlayer } from '../../../types';
import {
  pointInPolygon, ringBounds, ringToGeoJson, segmentsIntersect, toMetres,
  type LngLat,
} from '../../../lib/derezGeo';

const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const ARENA_SRC = 'derez-arena';
const TRAIL_SRC = 'derez-trails';
const HEAD_SRC = 'derez-heads';
const OOB_LIMIT = 5; // seconds outside the arena before you lose a life
const SELF_GRACE_M = 12; // ignore this much of your own tail behind the head

function colorOf(id: string) {
  const c = ACCENT_COLORS.find(a => a.id === id) ?? ACCENT_COLORS[0];
  return `hsl(${c.hsl.trim().split(/\s+/).join(', ')})`;
}

interface Props {
  lobby: DerezLobby;
  players: DerezPlayer[];
  me: DerezPlayer;
  onDeath: () => void;
}

export function DerezGameView({ lobby, players, me, onDeath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);

  const trailsRef = useRef<Map<string, LngLat[]>>(new Map());
  const headsRef = useRef<Map<string, LngLat>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingRef = useRef<LngLat[]>([]);
  const deadRef = useRef(false);
  const oobSinceRef = useRef<number | null>(null);

  const [oobLeft, setOobLeft] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [speed, setSpeed] = useState(0);

  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
  useEffect(() => { requestWakeLock(); return () => { releaseWakeLock(); }; }, [requestWakeLock, releaseWakeLock]);

  const arenaRing = lobby.arena?.ring ?? [];

  // ---- Map -------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: arenaRing.length ? [arenaRing[0].lng, arenaRing[0].lat] : [0, 51],
      zoom: 18,
      attributionControl: false,
      interactive: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(ARENA_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: arenaRing.length ? [ringToGeoJson(arenaRing)] : [] } as any });
      map.addLayer({ id: `${ARENA_SRC}-fill`, type: 'fill', source: ARENA_SRC, paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.06 } });
      map.addLayer({ id: `${ARENA_SRC}-line`, type: 'line', source: ARENA_SRC, paint: { 'line-color': '#22d3ee', 'line-width': 3, 'line-opacity': 0.8 } });

      map.addSource(TRAIL_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any });
      map.addLayer({ id: `${TRAIL_SRC}-glow`, type: 'line', source: TRAIL_SRC, paint: { 'line-color': ['get', 'color'], 'line-width': 12, 'line-opacity': 0.22, 'line-blur': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: `${TRAIL_SRC}-core`, type: 'line', source: TRAIL_SRC, paint: { 'line-color': ['get', 'color'], 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

      map.addSource(HEAD_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any });
      map.addLayer({ id: `${HEAD_SRC}-dot`, type: 'circle', source: HEAD_SRC, paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-color': '#000' } });

      if (arenaRing.length > 2) map.fitBounds(ringBounds(arenaRing), { padding: 48, duration: 0 });
      readyRef.current = true;
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const render = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const trailFeatures: any[] = [];
    const headFeatures: any[] = [];
    for (const p of players) {
      const pts = trailsRef.current.get(p.userId) ?? [];
      const color = colorOf(p.accentColor);
      if (pts.length > 1) {
        trailFeatures.push({
          type: 'Feature', properties: { color },
          geometry: { type: 'LineString', coordinates: pts.map(q => [q.lng, q.lat]) },
        });
      }
      const head = headsRef.current.get(p.userId);
      if (head && p.isAlive) {
        headFeatures.push({ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: [head.lng, head.lat] } });
      }
    }
    (map.getSource(TRAIL_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: trailFeatures } as any);
    (map.getSource(HEAD_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: headFeatures } as any);
  }, [players]);

  // ---- Realtime trails --------------------------------------------------
  useEffect(() => {
    const channel = supabase.channel(`derez-${lobby.id}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const { u, pts, reset } = payload as { u: string; pts: [number, number][]; reset?: boolean };
        if (u === me.userId) return;
        const list = reset ? [] : (trailsRef.current.get(u) ?? []);
        for (const [lng, lat] of pts) list.push({ lng, lat });
        trailsRef.current.set(u, list);
        if (pts.length) headsRef.current.set(u, { lng: pts[pts.length - 1][0], lat: pts[pts.length - 1][1] });
        render();
      })
      .on('broadcast', { event: 'wipe' }, ({ payload }) => {
        const { u } = payload as { u: string };
        trailsRef.current.set(u, []);
        render();
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [lobby.id, me.userId, render]);

  // Broadcast buffered points ~5x/second
  useEffect(() => {
    const t = setInterval(() => {
      const pts = pendingRef.current;
      if (!pts.length || !channelRef.current) return;
      pendingRef.current = [];
      channelRef.current.send({
        type: 'broadcast', event: 'pos',
        payload: { u: me.userId, pts: pts.map(p => [p.lng, p.lat]) },
      });
    }, 200);
    return () => clearInterval(t);
  }, [me.userId]);

  // ---- Death ------------------------------------------------------------
  const die = useCallback(() => {
    if (deadRef.current) return;
    deadRef.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    if (navigator.vibrate) navigator.vibrate([80, 60, 160]);
    trailsRef.current.set(me.userId, []);
    pendingRef.current = [];
    oobSinceRef.current = null;
    setOobLeft(null);
    channelRef.current?.send({ type: 'broadcast', event: 'wipe', payload: { u: me.userId } });
    render();
    onDeath();
    // brief respawn immunity so you don't instantly re-die on the same spot
    setTimeout(() => { deadRef.current = false; }, 2500);
  }, [me.userId, onDeath, render]);

  // ---- High-frequency GPS ----------------------------------------------
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const point: LngLat = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setSpeed(Math.round(((pos.coords.speed ?? 0) * 2.23694) * 10) / 10);
        headsRef.current.set(me.userId, point);

        const map = mapRef.current;
        if (map) map.easeTo({ center: [point.lng, point.lat], duration: 250 });

        if (!me.isAlive || deadRef.current) { render(); return; }

        const mine = trailsRef.current.get(me.userId) ?? [];
        const prev = mine[mine.length - 1];

        // Out of bounds countdown
        if (arenaRing.length > 2 && !pointInPolygon(point, arenaRing)) {
          if (oobSinceRef.current == null) oobSinceRef.current = Date.now();
          const left = OOB_LIMIT - Math.floor((Date.now() - oobSinceRef.current) / 1000);
          setOobLeft(Math.max(0, left));
          if (left <= 0) { die(); return; }
        } else {
          oobSinceRef.current = null;
          setOobLeft(null);
        }

        if (prev) {
          const origin = prev;
          const a = toMetres(prev, origin);
          const b = toMetres(point, origin);
          // Only append meaningful movement (kills GPS jitter self-kills)
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.2) { render(); return; }

          // Collision against every trail, including our own (minus a grace tail)
          for (const p of players) {
            const pts = trailsRef.current.get(p.userId) ?? [];
            if (pts.length < 2) continue;
            const isSelf = p.userId === me.userId;
            let graceM = 0;
            const limit = pts.length - 1;
            for (let i = limit - 1; i >= 0; i--) {
              const s1 = toMetres(pts[i], origin);
              const s2 = toMetres(pts[i + 1], origin);
              if (isSelf) {
                graceM += Math.hypot(s2[0] - s1[0], s2[1] - s1[1]);
                if (graceM < SELF_GRACE_M) continue;
              }
              if (segmentsIntersect(a, b, s1, s2)) { die(); return; }
            }
          }
        }

        mine.push(point);
        trailsRef.current.set(me.userId, mine);
        pendingRef.current.push(point);
        render();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [arenaRing, die, me.isAlive, me.userId, players, render]);

  useEffect(() => { render(); }, [players, render]);

  const alive = players.filter(p => p.isAlive);

  return (
    <div className="relative flex-1 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />

      {flash && <div className="absolute inset-0 z-30 bg-red-600/50 animate-fade-in pointer-events-none" />}

      {/* HUD: lives + rider list */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
        <div className="rounded-xl bg-black/70 border border-white/10 backdrop-blur px-3 py-2">
          <p className="text-[9px] uppercase tracking-widest text-white/40">Lives</p>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: lobby.lives }).map((_, i) => (
              <Heart key={i} className={`w-4 h-4 ${i < me.livesLeft ? 'text-red-500 fill-red-500' : 'text-white/15'}`} />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-black/70 border border-white/10 backdrop-blur px-3 py-2 space-y-1">
          {players.map(p => (
            <div key={p.userId} className="flex items-center gap-2 text-[10px]">
              <span className="w-2 h-2 rounded-full" style={{ background: colorOf(p.accentColor), opacity: p.isAlive ? 1 : 0.25 }} />
              <span className={p.isAlive ? 'text-white' : 'text-white/30 line-through'}>{p.displayName}</span>
              <span className="text-white/40 tabular-nums">{p.livesLeft}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div className="absolute bottom-4 left-3 z-20 rounded-xl bg-black/70 border border-white/10 backdrop-blur px-3 py-2 pointer-events-none">
        <p className="font-mono text-2xl font-bold tabular-nums text-white leading-none">{speed.toFixed(0)}</p>
        <p className="text-[9px] uppercase tracking-widest text-white/40">mph</p>
      </div>

      <div className="absolute bottom-4 right-3 z-20 rounded-xl bg-black/70 border border-white/10 backdrop-blur px-3 py-2 pointer-events-none">
        <p className="text-[9px] uppercase tracking-widest text-white/40">Alive</p>
        <p className="font-mono text-xl font-bold text-white leading-none">{alive.length}</p>
      </div>

      {/* Out of bounds */}
      {oobLeft !== null && me.isAlive && (
        <div className="absolute inset-x-0 top-1/3 z-30 flex flex-col items-center pointer-events-none">
          <p className="font-mono text-xs tracking-widest uppercase text-red-400">Out of bounds</p>
          <p className="font-mono text-7xl font-bold text-red-500 tabular-nums" style={{ textShadow: '0 0 24px rgba(239,68,68,0.7)' }}>{oobLeft}</p>
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/50">Get back in the grid</p>
        </div>
      )}

      {/* Spectating */}
      {!me.isAlive && (
        <div className="absolute inset-x-0 top-1/3 z-30 flex flex-col items-center gap-1 pointer-events-none">
          <Skull className="w-8 h-8 text-white/50" />
          <p className="font-mono text-xs tracking-widest uppercase text-white/60">Derezzed — spectating</p>
        </div>
      )}
    </div>
  );
}
