import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, ArrowLeftRight, Check, ChevronLeft, ChevronRight, Flag, Minus, Pause, Play, Plus, Rewind, Save, Split, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { whenStyleReady } from '@/features/map';
import type { LatLng, TrackDef } from '../types';
import { Centerline, bearingOf, buildTrack, gateAt, loopGap, markersFromTrack, orderedSplits, resampleLoop, sectorsOf, type Markers } from '../lib/centerline';
import { SATELLITE_STYLE, SF_COLOR, SPLIT_COLOR, accentColor, sectorColor } from '../lib/mapStyle';
import { tr } from '@/lib/i18n';

/**
 * Track builder, part 2 (both methods): a camera runs round the lap, and the
 * rider plays, pauses, rewinds, speeds it up or slows it down to drop the
 * start/finish line and sector markers exactly where they want them.
 * Sectors fill themselves in: start/finish → marker 1 → marker 2 → … → back
 * to the start/finish. Markers are distances along the lap, so they can't
 * land off the track, and each timing line is squared to it. Reverse flips
 * the direction of travel (a lap built from roads can't know which way you
 * race); markers stay where they are on the track.
 */

type View = 'chase' | 'bird' | 'whole';

/** 1× plays the lap at 60 km/h. */
const BASE_MPS = 60 / 3.6;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
/** Closest two lines can be (m): closer than this and neither can time reliably. */
const MIN_MARKER_GAP_M = 30;
/** Heading change over ±15 m beyond which a line is "in a corner". */
const CORNER_TURN = (35 * Math.PI) / 180;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const angleDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

export function ChaseCamPlacer({
  loop,
  base,
  name: initialName,
  startHint,
  meta,
  attribution,
  onBack,
  backLabel = 'Back',
  onSave,
  onCancel,
}: {
  /** The lap in running order. */
  loop: LatLng[];
  /** Editing a saved track: its lines become the starting markers. */
  base?: TrackDef;
  /** Name to start with (a library layout's). */
  name?: string;
  /** Where the map says the start line is: pre-placed for the rider to check. */
  startHint?: LatLng;
  /** Saved with the track (where it came from). */
  meta?: Pick<TrackDef, 'source' | 'osmId'>;
  /** Credit for the lap's data, shown while placing. */
  attribution?: string;
  onBack?: () => void;
  backLabel?: string;
  onSave: (track: TrackDef) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(loop);
  const line = useMemo(() => new Centerline(resampleLoop(path, 2)), [path]);
  // The map and camera are built once; they read the current lap through this.
  const lineRef = useRef(line);
  lineRef.current = line;
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dotRef = useRef<maplibregl.Marker | null>(null);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);

  const [markers, setMarkers] = useState<Markers>(() => {
    if (!base) {
      const hint = startHint ? line.project(startHint) : null;
      return { sf: hint && hint.off <= 40 ? hint.d : null, splits: [] };
    }
    // Keep only lines that still sit on this lap (the roads may have changed).
    const m = markersFromTrack(line, base);
    const onLap = (p: LatLng) => line.project(p).off <= 40;
    return {
      sf: m.sf !== null && onLap(midpoint(base.startFinish.a, base.startFinish.b)) ? m.sf : null,
      splits: m.splits.filter((_, i) => onLap(midpoint(base.splits[i].a, base.splits[i].b))),
    };
  });
  const [view, setView] = useState<View>('chase');
  const [playing, setPlaying] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [speedIx, setSpeedIx] = useState(2);
  const [pos, setPos] = useState(() => markers.sf ?? 0);
  const [finishing, setFinishing] = useState(false);
  const [name, setName] = useState(base?.name ?? initialName ?? '');

  // Animation state lives in refs; React only hears about it ~10× a second.
  const posRef = useRef(pos);
  const playRef = useRef({ playing, dir, speed: SPEEDS[speedIx], view });
  playRef.current = { playing, dir, speed: SPEEDS[speedIx], view };

  const seek = (d: number) => {
    posRef.current = lineRef.current.wrap(d);
    setPos(posRef.current);
  };

  // ── map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapElRef.current) return;
    const start = lineRef.current.pointAt(posRef.current);
    const map = new maplibregl.Map({
      container: mapElRef.current,
      style: SATELLITE_STYLE,
      center: [start.lng, start.lat],
      zoom: 16,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const el = document.createElement('div');
    el.className = 'track-cam-dot';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 2 L20 20 L12 16 L4 20 Z" fill="currentColor" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    el.style.color = accentColor();
    dotRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([start.lng, start.lat]).addTo(map);

    const cancelLayers = whenStyleReady(map, () => {
      map.addSource('lap', { type: 'geojson', data: EMPTY });
      map.addSource('gates', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'lap-casing', type: 'line', source: 'lap', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-opacity': 0.5, 'line-width': 9 } });
      map.addLayer({ id: 'lap', type: 'line', source: 'lap', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
      map.addLayer({ id: 'gates-casing', type: 'line', source: 'gates', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-width': 8 } });
      map.addLayer({ id: 'gates', type: 'line', source: 'gates', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
    });

    // In the whole-track view, tap the lap to jump there.
    map.on('click', (e) => {
      if (playRef.current.view !== 'whole') return;
      const l = lineRef.current;
      const hit = l.project({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      const at = l.pointAt(hit.d);
      const on = map.project([at.lng, at.lat]);
      if (Math.hypot(e.point.x - on.x, e.point.y - on.y) > 40) return;
      setPlaying(false);
      seek(hit.d);
      haptics.light();
    });

    return () => {
      cancelLayers();
      labelMarkers.current.forEach((m) => m.remove());
      labelMarkers.current = [];
      dotRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Camera: chase / bird's-eye follow the dot; whole-track frames the lap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const interactive = view === 'whole';
    for (const h of [map.dragPan, map.scrollZoom, map.touchZoomRotate, map.doubleClickZoom, map.keyboard, map.dragRotate]) {
      if (interactive) h.enable();
      else h.disable();
    }
    if (view === 'whole') {
      setPlaying(false);
      const b = new maplibregl.LngLatBounds();
      for (const p of line.pts) b.extend([p.lng, p.lat]);
      map.fitBounds(b, { padding: 36, pitch: 0, bearing: 0, duration: 700 });
    }
  }, [view, line]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let raf = 0;
    let last = 0;
    let lastUi = 0;
    let camBearing: number | null = null;
    let lastCam = '';
    const frame = (now: number) => {
      const line = lineRef.current;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const p = playRef.current;
      if (p.playing) posRef.current = line.wrap(posRef.current + p.dir * p.speed * BASE_MPS * dt);
      const d = posRef.current;
      const at = line.pointAt(d);
      const heading = line.headingAt(d, 4, 4);
      dotRef.current?.setLngLat([at.lng, at.lat]).setRotation(bearingOf(heading));

      if (p.view !== 'whole') {
        // Look ahead so the camera swings into corners smoothly, not twitchily.
        const target = bearingOf(line.headingAt(d + (p.dir > 0 ? 0 : -30), 6, 30));
        camBearing = camBearing === null ? target : camBearing + angleDiff(camBearing, target) * Math.min(1, dt * 3.5 * Math.max(1, Math.sqrt(p.speed)));
        const chase = p.view === 'chase';
        const h = map.getContainer().clientHeight;
        const cam = { center: [at.lng, at.lat] as [number, number], bearing: camBearing, pitch: chase ? 62 : 0, zoom: chase ? 18 : 17, padding: { top: chase ? h * 0.42 : 0, bottom: 0, left: 0, right: 0 } };
        const key = `${at.lng.toFixed(7)},${at.lat.toFixed(7)},${camBearing.toFixed(2)},${p.view}`;
        if (key !== lastCam) {
          lastCam = key;
          map.jumpTo(cam);
        }
      } else {
        camBearing = null;
      }
      if (now - lastUi > 100) {
        lastUi = now;
        setPos(d);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Lap coloured by sector, timing lines, and their labels.
  const sectors = useMemo(() => sectorsOf(line, markers), [line, markers]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cancel = whenStyleReady(map, () => {
      const lapFeatures: GeoJSON.Feature[] = sectors.length
        ? sectors.map(([a, b], i) => ({
            type: 'Feature',
            properties: { color: sectorColor(i) },
            geometry: { type: 'LineString', coordinates: line.slice(a, b).map((p) => [p.lng, p.lat]) },
          }))
        : [{ type: 'Feature', properties: { color: accentColor() }, geometry: { type: 'LineString', coordinates: [...line.pts, line.pts[0]].map((p) => [p.lng, p.lat]) } }];
      (map.getSource('lap') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: lapFeatures });
      const gate = (d: number, color: string): GeoJSON.Feature => {
        const g = gateAt(line, d, 12);
        return { type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: [[g.a.lng, g.a.lat], [g.b.lng, g.b.lat]] } };
      };
      const gates = [
        ...(markers.sf !== null ? [gate(markers.sf, SF_COLOR)] : []),
        ...markers.splits.map((d) => gate(d, SPLIT_COLOR)),
      ];
      (map.getSource('gates') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: gates });
    });

    labelMarkers.current.forEach((m) => m.remove());
    labelMarkers.current = [];
    const label = (d: number, text: string, color: string) => {
      const p = line.pointAt(d);
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = `font:800 11px Inter,sans-serif;padding:2px 6px;border-radius:999px;background:${color};color:#000;border:1.5px solid #000;pointer-events:none;white-space:nowrap`;
      labelMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat([p.lng, p.lat]).addTo(map));
    };
    if (markers.sf !== null) label(markers.sf, 'S/F', SF_COLOR);
    orderedSplits(line, markers).forEach((s, i) => label((markers.sf ?? 0) + s, `M${i + 1}`, SPLIT_COLOR));
    return cancel;
  }, [line, markers, sectors]);

  // ── markers ──────────────────────────────────────────────────────────────
  const origin = markers.sf ?? 0;
  const rel = line.wrap(pos - origin);
  const tooClose = (d: number, except?: 'sf' | number) => {
    const others = [...(markers.sf !== null && except !== 'sf' ? [markers.sf] : []), ...markers.splits.filter((_, i) => i !== except)];
    return others.some((o) => loopGap(line, o, d) < MIN_MARKER_GAP_M);
  };
  const inCorner = (d: number) => Math.abs(angleDiff(bearingOf(line.headingAt(d, 15, 0)), bearingOf(line.headingAt(d, 0, 15)))) * (Math.PI / 180) > CORNER_TURN;
  const cornerNote = () => toast(tr("That line is in a corner"), { description: tr("Lines on straights time most accurately, but it will still work.") });

  const placeSf = () => {
    const d = posRef.current;
    if (tooClose(d, 'sf')) return toast.error(tr("Keep lines at least {0} m apart", [MIN_MARKER_GAP_M]));
    setMarkers((m) => ({ ...m, sf: d }));
    haptics.success();
    if (inCorner(d)) cornerNote();
  };
  const addSplit = () => {
    const d = posRef.current;
    if (tooClose(d)) return toast.error(tr("Keep lines at least {0} m apart", [MIN_MARKER_GAP_M]));
    if (markers.splits.length >= 19) return toast.error(tr("20 sectors is the most a lap can have"));
    setMarkers((m) => ({ ...m, splits: [...m.splits, d] }));
    haptics.medium();
    if (inCorner(d)) cornerNote();
  };
  const removeSplit = (d: number) => setMarkers((m) => ({ ...m, splits: m.splits.filter((x) => x !== d) }));
  const orderedMarkers = orderedSplits(line, markers).map((s) => line.wrap(origin + s));
  const sectorHere = markers.sf === null ? null : orderedSplits(line, markers).filter((s) => s <= rel).length;

  /** Flip the direction of travel. Markers and the camera stay on the same spot of track. */
  const reverseDirection = () => {
    const old = line;
    const flipped = [...path].reverse();
    const next = new Centerline(resampleLoop(flipped, 2));
    const move = (d: number) => next.project(old.pointAt(d)).d;
    setPath(flipped);
    setMarkers((m) => ({ sf: m.sf === null ? null : move(m.sf), splits: m.splits.map(move) }));
    posRef.current = move(posRef.current);
    lineRef.current = next;
    setPos(posRef.current);
    setPlaying(false);
    haptics.medium();
    toast(tr("Direction reversed"), { description: tr("Sectors are renumbered for the new direction.") });
  };

  const togglePlay = () => {
    if (view === 'whole') setView('chase');
    if (playing && dir === -1) return setDir(1);
    setDir(1);
    setPlaying((p) => !p);
  };
  const rewind = () => {
    if (view === 'whole') setView('chase');
    if (playing && dir === -1) return setPlaying(false);
    setDir(-1);
    setPlaying(true);
  };

  const complete = () => {
    if (markers.sf === null) return toast.error(tr("Place the start/finish line first"));
    setPlaying(false);
    setFinishing(true);
  };
  const save = () => {
    if (!name.trim()) return toast.error(tr("Name the track"));
    onSave(buildTrack(line, markers, name, base, meta));
  };

  // Scrub strip: the lap from the start/finish (or the loop start) round to it again.
  const stripStops = sectors.length
    ? sectors.map(([a, b], i) => `${sectorColor(i)} ${(((a - origin) / line.length) * 100).toFixed(2)}% ${(((b - origin) / line.length) * 100).toFixed(2)}%`).join(', ')
    : `${accentColor()} 0% 100%`;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="relative flex-1 min-h-[42dvh]">
        {/* Wrapped: maplibre's CSS makes its container position:relative, which would undo absolute sizing. */}
        <div className="absolute inset-0">
          <div ref={mapElRef} className="w-full h-full" />
        </div>
        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 right-3 flex items-start gap-2">
          <div className="flex-1 rounded-xl frost-accent px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold flex items-center gap-1.5">
              {markers.sf === null ? <Flag className="w-3.5 h-3.5" /> : <Split className="w-3.5 h-3.5" />}
              {markers.sf === null ? tr("Run the lap and stop on the start/finish line") : tr("Add sector markers where you want splits")}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {km(line.length)}{" "}{tr("lap")}{markers.sf !== null ? tr(" · {0} sector{1}", [sectors.length, sectors.length === 1 ? '' : 's']) : ''}
              {sectorHere !== null ? tr(" · you're in sector {0}", [sectorHere + 1]) : ''}
            </p>
            {startHint && !base && markers.sf !== null && <p className="mt-0.5 text-muted-foreground">{tr("Start/finish placed from the map. Check it, or move it.")}</p>}
            {attribution && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{attribution}</p>}
          </div>
          <div className="flex flex-col rounded-xl frost-accent overflow-hidden text-[11px] font-semibold shrink-0">
            {(['chase', 'bird', 'whole'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('px-2.5 py-1.5', view === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}>
                {v === 'chase' ? tr("Chase") : v === 'bird' ? tr("Bird’s-eye") : tr("Whole lap")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2.5 border-t border-border safe-bottom bg-background">
        {finishing ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{tr("Complete the track")}</p>
            <div className="flex flex-wrap gap-1.5">
              {sectors.map(([a, b], i) => (
                <span key={i} className="rounded-full border border-border px-2 py-0.5 text-[11px] font-mono" style={{ borderColor: sectorColor(i) }}>
                  {tr("S")}{i + 1} · {km(b - a)}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr("Sector")}{" "}{sectors.length}{" "}{tr("runs from")}{" "}{orderedMarkers.length ? tr("marker {0}", [orderedMarkers.length]) : tr("the start/finish")}{" "}{tr("back to the start/finish line.")}
            </p>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Track name (e.g. Brands Hatch Indy)")} maxLength={40} autoFocus />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setFinishing(false)} className="gap-1">
                <ArrowLeft className="w-4 h-4" />{" "}{tr("Keep editing")}
              </Button>
              <Button className="flex-1 gap-1" onClick={save}>
                <Save className="w-4 h-4" />{" "}{tr("Save track")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Position + scrub strip */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1">
                <button className="p-1 -m-1" onClick={() => { setPlaying(false); seek(posRef.current - 1); }} aria-label={tr("Back 1 metre")}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  {km(rel)} / {km(line.length)} {markers.sf !== null ? tr("from S/F") : ''}
                </span>
                <button className="p-1 -m-1" onClick={() => { setPlaying(false); seek(posRef.current + 1); }} aria-label={tr("Forward 1 metre")}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="relative h-7">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full" style={{ background: `linear-gradient(to right, ${stripStops})` }} />
                {markers.sf !== null && <span className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: 0 }} />}
                {orderedMarkers.map((d, i) => (
                  <span key={i} className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(line.wrap(d - origin) / line.length) * 100}%`, background: SPLIT_COLOR }} />
                ))}
                <input
                  type="range"
                  min={0}
                  max={line.length}
                  step={0.5}
                  value={rel}
                  onChange={(e) => {
                    setPlaying(false);
                    if (view === 'whole') setView('chase');
                    seek(origin + Number(e.target.value));
                  }}
                  className="track-scrub absolute inset-0 w-full"
                  aria-label={tr("Position on the lap")}
                />
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-2">
              <Button variant={playing && dir === -1 ? 'default' : 'secondary'} size="icon" onClick={rewind} aria-label={tr("Rewind")}>
                <Rewind className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" onClick={() => setSpeedIx((i) => Math.max(0, i - 1))} disabled={speedIx === 0} aria-label={tr("Slower")}>
                <Minus className="w-4 h-4" />
              </Button>
              <Button size="icon" className="w-14 h-11" onClick={togglePlay} aria-label={playing && dir === 1 ? tr("Pause") : tr("Play")}>
                {playing && dir === 1 ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>
              <Button variant="secondary" size="icon" onClick={() => setSpeedIx((i) => Math.min(SPEEDS.length - 1, i + 1))} disabled={speedIx === SPEEDS.length - 1} aria-label={tr("Faster")}>
                <Plus className="w-4 h-4" />
              </Button>
              <span className="w-10 text-center font-mono text-xs">{SPEEDS[speedIx]}×</span>
              <Button variant="secondary" size="sm" className="gap-1 text-xs" onClick={reverseDirection} aria-label={tr("Reverse the direction of travel")}>
                <ArrowLeftRight className="w-4 h-4" /> <span className="hidden min-[400px]:inline">{tr("Reverse")}</span>
              </Button>
            </div>

            {/* Placing */}
            {markers.sf === null ? (
              <Button className="w-full h-12 gap-2 font-bold" onClick={placeSf}>
                <Flag className="w-4 h-4" />{" "}{tr("Set start/finish line here")}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" className="h-12 gap-1 text-xs" onClick={placeSf}>
                  <Flag className="w-4 h-4" />{" "}{tr("Move S/F here")}
                </Button>
                <Button className="flex-1 h-12 gap-2 font-bold" style={{ background: SPLIT_COLOR, color: '#fff' }} onClick={addSplit}>
                  <Split className="w-4 h-4" />{" "}{tr("Sector marker here")}
                </Button>
              </div>
            )}

            {markers.sf !== null && (
              <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3">
                <button onClick={() => { setPlaying(false); seek(markers.sf!); }} className="shrink-0 rounded-full border border-white/70 px-2.5 py-1 text-[11px] font-semibold">
                  {tr("S/F")}
                </button>
                {orderedMarkers.map((d, i) => (
                  <span key={d} className="shrink-0 flex items-center rounded-full border px-1 py-0.5 text-[11px] font-semibold" style={{ borderColor: SPLIT_COLOR }}>
                    <button className="px-1.5" onClick={() => { setPlaying(false); seek(d); }}>
                      {tr("M")}{i + 1}
                    </button>
                    <button className="p-0.5 text-muted-foreground" onClick={() => removeSplit(d)} aria-label={tr("Remove marker {0}", [i + 1])}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {onBack ? (
                <Button variant="ghost" onClick={onBack} className="gap-1">
                  <ArrowLeft className="w-4 h-4" /> {backLabel}
                </Button>
              ) : null}
              <Button variant="ghost" size="icon" onClick={onCancel} aria-label={tr("Cancel")}>
                <X className="w-4 h-4" />
              </Button>
              <Button variant="secondary" className="flex-1 gap-1" onClick={complete} disabled={markers.sf === null}>
                <Check className="w-4 h-4" />{" "}{tr("Complete track")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}
