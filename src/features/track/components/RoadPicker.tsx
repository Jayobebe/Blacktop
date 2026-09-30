import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowRight, Crosshair, Loader2, RefreshCcw, RotateCcw, ScanSearch, Search, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { searchPlaces, whenStyleReady, type MapSearchResult } from '@/features/map';
import type { LatLng } from '../types';
import { analyseLoop, buildEdges, initialRemovals, lapOptions, removalsFor, type RoadEdge, type RoadPiece } from '../lib/roadLoop';
import { Centerline, resampleLoop } from '../lib/centerline';
import { metres } from '../lib/geometry';
import { SATELLITE_STYLE, accentColor } from '../lib/mapStyle';
import { tr } from '@/lib/i18n';

/**
 * Track builder, method 1, part 1: frame the circuit with a box, and Blacktop
 * highlights every road inside it. On a real circuit (OSM `highway=raceway`)
 * only the race track is kept up front. The rider taps roads to drop (or
 * restore) them, or picks one of the laps found, flips the direction if
 * needed, and continues to place the timing lines.
 */

const MAX_AREA_M2 = 40_000_000;
const MIN_BOX_PX = 90;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Step = 'frame' | 'loading' | 'roads';

export function RoadPicker({ center, onLoop, onCancel }: { center?: LatLng; onLoop: (loop: LatLng[]) => void; onCancel: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [step, setStep] = useState<Step>('frame');
  const stepRef = useRef(step);
  stepRef.current = step;
  const [box, setBox] = useState<Box | null>(null);
  const [edges, setEdges] = useState<RoadEdge[]>([]);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Set<string>[]>([]);
  /** The rider's own road choices: lap options are found within these, so picking one doesn't hide the others. */
  const [optionBase, setOptionBase] = useState<Set<string>>(new Set());
  const [reversed, setReversed] = useState(false);

  // ── map ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapElRef.current) return;
    const map = new maplibregl.Map({
      pixelRatio: MAP_PIXEL_RATIO,
      container: mapElRef.current,
      style: SATELLITE_STYLE,
      center: center ? [center.lng, center.lat] : [-1.26, 52.07],
      zoom: center ? 15 : 5,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    if (!center) {
      navigator.geolocation?.getCurrentPosition(
        (p) => map.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15 }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
    const cancelLayers = whenStyleReady(map, () => {
      const accent = accentColor();
      map.addSource('roads', { type: 'geojson', data: EMPTY });
      map.addSource('junctions', { type: 'geojson', data: EMPTY });
      map.addSource('arrows', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'roads-removed', type: 'line', source: 'roads', filter: ['==', ['get', 'state'], 'removed'], paint: { 'line-color': '#ef4444', 'line-opacity': 0.55, 'line-width': 2, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'roads-trimmed', type: 'line', source: 'roads', filter: ['==', ['get', 'state'], 'trimmed'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 2 } });
      map.addLayer({
        id: 'roads-casing',
        type: 'line',
        source: 'roads',
        filter: ['in', ['get', 'state'], ['literal', ['kept', 'loop']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-opacity': 0.55, 'line-width': 10 },
      });
      map.addLayer({
        id: 'roads-kept',
        type: 'line',
        source: 'roads',
        filter: ['in', ['get', 'state'], ['literal', ['kept', 'loop']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'state'], 'loop', accent, '#ffffff'], 'line-width': 5 },
      });
      map.addLayer({ id: 'arrows', type: 'line', source: 'arrows', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-width': 3 } });
      map.addLayer({ id: 'roads-hit', type: 'line', source: 'roads', paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 28 } });
      map.addLayer({
        id: 'junctions',
        type: 'circle',
        source: 'junctions',
        paint: { 'circle-radius': 11, 'circle-color': '#f59e0b', 'circle-opacity': 0.9, 'circle-stroke-color': '#000000', 'circle-stroke-width': 2 },
      });
    });

    map.on('click', (e) => {
      if (stepRef.current !== 'roads') return;
      const { x, y } = e.point;
      const hits = map.queryRenderedFeatures([[x - 16, y - 16], [x + 16, y + 16]], { layers: ['roads-hit'] });
      if (!hits.length) return;
      // Nearest of the roads under the finger.
      const tap = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      let bestId: string | null = null;
      let bestD = Infinity;
      for (const f of hits) {
        const edge = edgesRef.current.find((ed) => ed.id === f.properties?.id);
        if (!edge) continue;
        const d = Math.min(...edge.coords.map((c) => metres(c, tap)));
        if (d < bestD) {
          bestD = d;
          bestId = edge.id;
        }
      }
      if (bestId) toggleRoad(bestId);
    });

    return () => {
      cancelLayers();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Default framing box: most of the map, clear of the top card and bottom bar.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || box) return;
    const { width, height } = el.getBoundingClientRect();
    const w = Math.round(width * 0.8);
    const h = Math.round(Math.min(height * 0.6, w * 1.2));
    setBox({ x: Math.round((width - w) / 2), y: Math.round((height - h) / 2 + height * 0.04), w, h });
  }, [box]);

  // ── roads ──────────────────────────────────────────────────────────────────
  const analysis = useMemo(() => analyseLoop(edges, removed), [edges, removed]);
  const options = useMemo(() => (edges.length ? lapOptions(edges, optionBase) : []), [edges, optionBase]);
  const loop = useMemo(() => {
    if (!analysis.loop) return null;
    return reversed ? [...analysis.loop].reverse() : analysis.loop;
  }, [analysis.loop, reversed]);

  // The map's tap handler is bound once, so it reads the latest choice through a ref.
  const removedRef = useRef(removed);
  removedRef.current = removed;
  function toggleRoad(id: string) {
    haptics.light();
    const prev = removedRef.current;
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHistory((h) => [...h.slice(-40), prev]);
    setRemoved(next);
    setOptionBase(next);
  }

  const pickLap = (i: number) => {
    haptics.light();
    setHistory((h) => [...h.slice(-40), removed]);
    setRemoved(removalsFor(edges, options[i]));
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setRemoved(prev);
  };

  const reset = () => {
    const base = initialRemovals(edges);
    setHistory((h) => [...h.slice(-40), removed]);
    setRemoved(base);
    setOptionBase(base);
  };

  // Paint roads, junctions and direction chevrons.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return whenStyleReady(map, () => {
      const loopIds = analysis.status === 'loop' ? analysis.kept : new Set<string>();
      const state = (e: RoadEdge) => (removed.has(e.id) ? 'removed' : analysis.trimmed.has(e.id) ? 'trimmed' : loopIds.has(e.id) ? 'loop' : 'kept');
      (map.getSource('roads') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: edges.map((e) => ({
          type: 'Feature',
          properties: { id: e.id, state: state(e) },
          geometry: { type: 'LineString', coordinates: e.coords.map((c) => [c.lng, c.lat]) },
        })),
      });
      (map.getSource('junctions') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: analysis.junctions.map((j) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [j.lng, j.lat] } })),
      });
      (map.getSource('arrows') as GeoJSONSource | undefined)?.setData(loop ? chevrons(loop) : EMPTY);
    });
  }, [edges, removed, analysis, loop]);

  // ── finding roads ─────────────────────────────────────────────────────────
  const findRoads = async () => {
    const map = mapRef.current;
    if (!map || !box) return;
    const a = map.unproject([box.x, box.y]);
    const b = map.unproject([box.x + box.w, box.y + box.h]);
    const bounds = { west: Math.min(a.lng, b.lng), east: Math.max(a.lng, b.lng), south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat) };
    const wM = metres({ lat: bounds.south, lng: bounds.west }, { lat: bounds.south, lng: bounds.east });
    const hM = metres({ lat: bounds.south, lng: bounds.west }, { lat: bounds.north, lng: bounds.west });
    if (wM * hM > MAX_AREA_M2) {
      toast.error(tr("That box is too big"), { description: tr("Zoom in so the box just covers the track.") });
      return;
    }
    setStep('loading');
    try {
      const { data, error } = await supabase.functions.invoke('place-search', { body: { kind: 'roads', ...bounds } });
      if (error) throw error;
      const pieces = (data?.pieces ?? []) as RoadPiece[];
      const built = buildEdges(pieces);
      if (!built.length) {
        toast(tr("No roads found in the box"), { description: tr("Move the box over the track, or record a lap with GPS instead.") });
        setStep('frame');
        return;
      }
      const base = initialRemovals(built);
      setEdges(built);
      setRemoved(base);
      setOptionBase(base);
      setHistory([]);
      setReversed(false);
      setStep('roads');
      map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 24, duration: 600 });
      if (base.size) toast(tr("Race track found"), { description: tr("Other roads are hidden. Tap one to bring it back.") });
    } catch (e) {
      console.warn('[Track] roads lookup failed', e);
      toast.error(tr("Couldn't load the roads"), { description: tr("The map data service is busy. Try again in a moment.") });
      setStep('frame');
    }
  };

  const backToFrame = () => {
    setEdges([]);
    setRemoved(new Set());
    setHistory([]);
    setStep('frame');
  };

  // ── ui ─────────────────────────────────────────────────────────────────────
  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const status =
    step !== 'roads'
      ? null
      : analysis.status === 'loop'
        ? { tone: 'ok', text: tr("Lap ready · {0}", [km(analysis.length)]), sub: tr("Check the arrows show the way you race. Tap a road to add or drop it.") }
        : analysis.status === 'junctions'
          ? {
              tone: 'warn',
              text: tr("{0} junction{1} to sort out", [analysis.junctions.length, analysis.junctions.length === 1 ? '' : 's']),
              sub: options.length ? tr("Pick a lap below, or tap the roads you don’t race on at the orange dots.") : tr("Tap the roads you don’t race on at the orange dots."),
            }
          : analysis.status === 'several'
            ? { tone: 'warn', text: tr("{0} separate loops", [analysis.components.length]), sub: tr("Pick the lap you race below, or tap a road on the others to drop them.") }
            : { tone: 'bad', text: tr("These roads don’t make a lap"), sub: tr("Tap faded roads to bring them back, reset, or change the box.") };
  const pickedLength = analysis.status === 'loop' ? analysis.length : null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        {/* Wrapped: maplibre's CSS makes its container position:relative, which would undo absolute sizing. */}
        <div className="absolute inset-0">
          <div ref={mapElRef} className="w-full h-full" />
        </div>

        {step !== 'roads' && box && <FrameBox box={box} bounds={wrapRef} onChange={setBox} disabled={step === 'loading'} />}

        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3 space-y-2">
          {step === 'roads' && status ? (
            <div className="rounded-xl frost-accent px-3 py-2 text-xs shadow-lg">
              <p className={cn('font-semibold', status.tone === 'ok' ? 'text-[#22c55e]' : status.tone === 'warn' ? 'text-[#f59e0b]' : 'text-destructive')}>{status.text}</p>
              <p className="mt-0.5 text-muted-foreground">{status.sub}</p>
            </div>
          ) : (
            <PlaceSearch map={mapRef} disabled={step === 'loading'} />
          )}
        </div>

        {step === 'frame' && (
          <p className="absolute bottom-3 inset-x-3 text-center text-[11px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {tr("Move the map and drag the corners so the box covers the whole track")}
          </p>
        )}
        {step === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="rounded-xl frost-accent px-4 py-3 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{" "}{tr("Finding roads…")}
            </div>
          </div>
        )}
        {step === 'frame' && (
          <button
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) => mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15 }))
            }
            className="absolute bottom-10 right-3 w-10 h-10 rounded-full frost-accent flex items-center justify-center"
            aria-label={tr("Centre on me")}
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-3 space-y-2 border-t border-border safe-bottom bg-background">
        {step === 'roads' && options.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-0.5">
            <span className="shrink-0 self-center text-[10px] uppercase tracking-widest text-muted-foreground mr-1">{tr("Laps")}</span>
            {options.map((o, i) => (
              <button
                key={i}
                onClick={() => pickLap(i)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-mono',
                  pickedLength !== null && Math.abs(pickedLength - o.length) < 1 ? 'border-accent bg-accent/15 text-foreground' : 'border-border text-muted-foreground',
                )}
              >
                {km(o.length)}
              </button>
            ))}
          </div>
        )}
        {step === 'roads' ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={backToFrame} aria-label={tr("Change the box")}>
              <ScanSearch className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={undo} disabled={!history.length} aria-label={tr("Undo")}>
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={reset} aria-label={tr("Reset roads")}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="secondary" className="gap-1" onClick={() => setReversed((r) => !r)} disabled={!loop}>
              <RefreshCcw className="w-4 h-4" />{" "}{tr("Reverse")}
            </Button>
            <Button className="flex-1 gap-1" disabled={!loop} onClick={() => loop && onLoop(loop)}>
              {tr("Continue")}{" "}<ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} className="gap-1">
              <X className="w-4 h-4" />{" "}{tr("Cancel")}
            </Button>
            <Button className="flex-1 gap-1" onClick={findRoads} disabled={step === 'loading' || !box}>
              <ScanSearch className="w-4 h-4" />{" "}{tr("Find roads in the box")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small arrowheads along the lap, every ~70 m, pointing the way it runs. */
function chevrons(loop: LatLng[]): GeoJSON.FeatureCollection {
  const line = new Centerline(resampleLoop(loop, 4));
  const every = Math.max(50, Math.min(120, line.length / 14));
  const features: GeoJSON.Feature[] = [];
  for (let d = every / 2; d < line.length; d += every) {
    const tip = line.pointAt(d + 5);
    const h = line.headingAt(d, 4, 4);
    const back = (side: number) => {
      const ang = h + Math.PI + side * 0.6;
      const len = 7;
      return [tip.lng + (Math.cos(ang) * len) / (111_320 * Math.cos((tip.lat * Math.PI) / 180)), tip.lat + (Math.sin(ang) * len) / 110_540];
    };
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [back(1), [tip.lng, tip.lat], back(-1)] } });
  }
  return { type: 'FeatureCollection', features };
}

/** The framing box: dims everything outside it; drag a corner to resize. */
function FrameBox({ box, bounds, onChange, disabled }: { box: Box; bounds: React.RefObject<HTMLDivElement>; onChange: (b: Box) => void; disabled?: boolean }) {
  const drag = (corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, ...box };
    const rect = bounds.current?.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      let { x, y, w, h } = start;
      if (corner.includes('w')) {
        x = Math.min(start.x + dx, start.x + start.w - MIN_BOX_PX);
        w = start.w + (start.x - x);
      } else w = Math.max(MIN_BOX_PX, start.w + dx);
      if (corner.includes('n')) {
        y = Math.min(start.y + dy, start.y + start.h - MIN_BOX_PX);
        h = start.h + (start.y - y);
      } else h = Math.max(MIN_BOX_PX, start.h + dy);
      if (rect) {
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = Math.min(w, rect.width - x);
        h = Math.min(h, rect.height - y);
      }
      onChange({ x, y, w, h });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  const handle = 'absolute w-7 h-7 -m-3.5 rounded-full bg-accent border-2 border-black shadow-lg touch-none pointer-events-auto';
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        className="absolute rounded-lg border-2 border-dashed border-accent"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
      >
        <span className={cn(handle, 'cursor-nwse-resize')} style={{ left: 0, top: 0 }} onPointerDown={drag('nw')} />
        <span className={cn(handle, 'cursor-nesw-resize')} style={{ left: '100%', top: 0 }} onPointerDown={drag('ne')} />
        <span className={cn(handle, 'cursor-nesw-resize')} style={{ left: 0, top: '100%' }} onPointerDown={drag('sw')} />
        <span className={cn(handle, 'cursor-nwse-resize')} style={{ left: '100%', top: '100%' }} onPointerDown={drag('se')} />
      </div>
    </div>
  );
}

/** Jump the map to a circuit by name ("Brands Hatch", "PF International"). */
function PlaceSearch({ map, disabled }: { map: React.MutableRefObject<MapLibreMap | null>; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const b = map.current?.getBounds();
        const bias = b ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : null;
        setResults((await searchPlaces(query, bias, null, null)).slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, map]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr("Find a circuit or place")}
        className="pl-9 frost-accent h-10"
        disabled={disabled}
      />
      {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      {results.length > 0 && (
        <div className="absolute mt-1 inset-x-0 rounded-xl frost-accent shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b border-border/40 last:border-0"
              onClick={() => {
                map.current?.flyTo({ center: [r.lng, r.lat], zoom: 15.5, duration: 900 });
                setResults([]);
                setQ(r.name);
              }}
            >
              <span className="block font-semibold truncate">{r.name}</span>
              <span className="block text-muted-foreground truncate">{r.address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
