import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import '@/lib/maplibreWorker';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { ArrowLeft, LocateFixed, MapPin, Flag, Save, Download, Plus, Waves, Navigation, X, Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { kmText } from '@/lib/units';
import { isThermal } from '@/lib/thermal';
import { noteLocationGranted } from '@/lib/locationGrant';
import { loadDarkMapStyle, OPENFREEMAP_DARK_STYLE_URL } from '@/features/map/lib/darkStyle';
import { whenStyleReady } from '@/features/map/lib/whenStyleReady';
import { searchPlaces, type MapSearchResult } from '@/features/map/lib/placeSearch';
import { fetchRouteThroughStops, type RouteResult } from '@/features/map/lib/routing';
import { routeStyleVias, type RouteStyle } from '@/features/map/lib/routeStyle';
import { switchLegs, playLegs } from '@/features/map/lib/switchCamera';
import { travelTime, etaSpread } from '@/features/map/lib/eta';
import { tilesForCorridor, estimateTiles, downloadPack, formatBytes, tileTemplatesFor, type PackBounds } from '@/features/map/lib/offlinePacks';
import { saveRoute, type SavedRouteEnd } from '@/features/map/lib/savedRoutes';
import { getSavedPOIs, type SavedPOI } from '@/features/map/lib/poiStore';
import { useSettings, ACCENT_COLORS } from '@/features/settings';
import '@/features/map/components/blacktopMap.css';
import { PageTips } from '@/features/guide';
import { PixelLoader } from '@/components/PixelLoader';

const ORBIT_DEG_PER_S = 9;
const GROUND = 16.8;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Plan a route (from Blacktop Console's quick action, and its suggestion card's Plan a route for later): a plain map with a list
 * of searches, the start (your position to begin with, or anywhere searched),
 * then where to, then as many stops after it as the rider adds until the route
 * is right (each can be taken off). Picking a stop works as the Blacktop map
 * does: the switch camera jumps out to it and circles it, and its card asks how
 * to get there, Twisty (the accent) or Direct (the second accent, white without
 * one); either one pulls back over the whole route so far, with Add a stop and
 * Save route. A twisty leg keeps its bends on the stop (`shape`), so the saved
 * route rides them. The way through them in order is drawn, with how far, how
 * long and what its map costs to keep; Save stores the route (lib/savedRoutes)
 * and downloads its map tiles along the line as an offline pack, so it draws
 * with no signal. Saved routes are then in the map's search like saved places.
 */
export default function PlanRoute() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const accent = useMemo(() => {
    const hsl = ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.hsl ?? '38 92% 50%';
    return `hsl(${hsl.trim().split(/\s+/).join(', ')})`;
  }, [settings.accentColor]);

  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  /** The start (null: where the phone is), then each point after it in order (null: not picked yet). */
  const [from, setFrom] = useState<SavedRouteEnd | null>(null);
  const [legs, setLegs] = useState<(SavedRouteEnd | null)[]>([null]);
  /** A place just picked for a stop, being circled until a way there is chosen. */
  const [candidate, setCandidate] = useState<{ index: number; place: SavedRouteEnd } | null>(null);
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  const [arrived, setArrived] = useState(false);
  const [styleBusy, setStyleBusy] = useState<RouteStyle | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [fitSeq, setFitSeq] = useState(0);
  /** A field's search is open: it and its list take the screen (on a phone the keyboard leaves little room). */
  const [openFields, setOpenFields] = useState(0);
  const searching = openFields > 0;
  const fieldOpen = (open: boolean) => setOpenFields((n) => Math.max(0, n + (open ? 1 : -1)));
  const picked = legs.filter((p): p is SavedRouteEnd => !!p);
  const to = picked.length ? picked[picked.length - 1] : null;
  const via = picked.slice(0, -1);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Where the phone is: the start until another is picked.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        noteLocationGranted();
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);
  const start: SavedRouteEnd | null = from ?? (here ? { ...here, name: tr("My location") } : null);

  // The way through them all (each stop's twisty bends before it), whenever a point changes.
  const shaped = picked.flatMap((p) => [...(p.shape ?? []), p]);
  const key = [start, ...shaped].map((p) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : '-')).join('|');
  useEffect(() => {
    if (!start || !to) {
      setRoute(null);
      return;
    }
    let live = true;
    setRouting(true);
    void fetchRouteThroughStops([start, ...shaped], { quiet: true }).then((r) => {
      if (!live) return;
      setRouting(false);
      setRoute(r);
      if (!r) toast.error(tr("Couldn't find a route between those places"));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Its name until the rider types one.
  useEffect(() => {
    if (!named && start && to) setName(`${start.name} → ${to.name}`);
  }, [start?.name, to?.name, named]);

  // ── The map ──
  const boxRef = useRef<HTMLDivElement>(null);
  const hazeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    if (!boxRef.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    // With no signal the style can't be fetched: hand MapLibre its address, as the ride's maps do, rather than throw.
    void loadDarkMapStyle()
      .catch((): string => OPENFREEMAP_DARK_STYLE_URL)
      .then((style) => {
      if (cancelled || !boxRef.current) return;
      map = new maplibregl.Map({
        container: boxRef.current,
        style,
        center: [-1.5, 52.5],
        zoom: 5,
        attributionControl: { compact: true },
        pixelRatio: MAP_PIXEL_RATIO,
      });
      mapRef.current = map;
      setMapReady(true);
      whenStyleReady(map, () => void tileTemplatesFor(map!).then(setTemplates));
    });
    return () => {
      cancelled = true;
      markers.current.forEach((m) => m.remove());
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // The pins: A for the start, a letter for each stop, and the place being looked at (white).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const pin = (p: { lat: number; lng: number }, label: string, ghost = false) => {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:26px;height:26px;border-radius:9999px;background:${ghost ? '#fff' : accent};color:#000;font:800 12px Inter,sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #000;box-shadow:0 2px 6px rgba(0,0,0,.5)">${label}</div>`;
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    };
    if (start) pin(start, 'A');
    let n = 0;
    legs.forEach((p, i) => {
      if (!p) return;
      const label = String.fromCharCode(66 + n++);
      if (candidate?.index !== i) pin(p, label); // being replaced: the candidate's pin stands in
    });
    if (candidate) pin(candidate.place, String.fromCharCode(66 + legs.slice(0, candidate.index).filter(Boolean).length), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, accent, candidate, mapReady]);

  // The route line, and the camera pulled back over the whole route (not while a place is being circled).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return whenStyleReady(map, () => {
      const data = route ? { type: 'Feature' as const, geometry: route.geometry, properties: {} } : { type: 'FeatureCollection' as const, features: [] };
      const src = map.getSource('plan-route') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        map.addSource('plan-route', { type: 'geojson', data });
        map.addLayer({ id: 'plan-route-casing', type: 'line', source: 'plan-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-width': 8, 'line-opacity': 0.5 } });
        map.addLayer({ id: 'plan-route-line', type: 'line', source: 'plan-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': accent, 'line-width': 4.5 } });
      }
      if (candidateRef.current) return;
      const pts: [number, number][] = route ? (route.geometry.coordinates as [number, number][]) : [start, ...picked].filter(Boolean).map((p) => [p!.lng, p!.lat]);
      if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 12, pitch: 0, bearing: 0, duration: 900 });
      else if (pts.length > 1) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        const cam = map.cameraForBounds(b, { padding: 48, maxZoom: 15 });
        if (cam) map.easeTo({ ...cam, pitch: 0, bearing: 0, duration: 1100 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, key, accent, fitSeq, mapReady]);

  // A stop picked: the switch camera out to it, then circling it until a way there is chosen (or Back).
  useEffect(() => {
    const map = mapRef.current;
    const c = candidate;
    if (!map || !c) return;
    const spot: [number, number] = [c.place.lng, c.place.lat];
    let alive = true;
    let raf = 0;
    let stopLegs: (() => void) | null = null;
    setArrived(false);
    const orbit = () => {
      setArrived(true);
      let last = 0;
      let bearing = map.getBearing();
      const spin = (now: number) => {
        if (!alive) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        bearing = (bearing + dt * ORBIT_DEG_PER_S) % 360;
        map.jumpTo({ center: spot, bearing });
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || isThermal()) {
      map.jumpTo({ center: spot, zoom: GROUND, pitch: 60 });
      setArrived(true);
    } else {
      const { legs: path, high } = switchLegs(map, { center: spot, zoom: GROUND, bearing: 0, pitch: 60 }, { orbit: ORBIT_DEG_PER_S });
      stopLegs = playLegs(map, path, { high, ground: GROUND, haze: hazeRef.current, alive: () => alive, onDone: orbit });
    }
    // A hand on the map stops it where it's got to, card up.
    const stopSpin = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      cancelAnimationFrame(raf);
      stopLegs?.();
      setArrived(true);
    };
    const events = ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const;
    events.forEach((ev) => map.on(ev, stopSpin));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopLegs?.();
      events.forEach((ev) => map.off(ev, stopSpin));
    };
  }, [candidate]);

  /** The point a stop is reached from (the start, or the stop before it). */
  const before = (index: number) => legs.slice(0, index).filter((p): p is SavedRouteEnd => !!p).pop() ?? start;

  /** A way there chosen: the stop goes on the route (Twisty with its bends), and the camera pulls back over it all. */
  const choose = async (style: RouteStyle) => {
    const c = candidate;
    if (!c || styleBusy) return;
    haptics.tick();
    let shape: { lat: number; lng: number }[] | undefined;
    const prev = before(c.index);
    if (style === 'twisty' && prev) {
      setStyleBusy('twisty');
      const vias = await routeStyleVias('twisty', [prev, c.place]);
      setStyleBusy(null);
      if (candidateRef.current !== c) return;
      if (!vias) toast(tr("No twistier way there, so it's the direct one"));
      shape = vias ?? undefined;
    }
    setLegs((l) => l.map((x, j) => (j === c.index ? { ...c.place, shape } : x)));
    setCandidate(null);
    setFitSeq((n) => n + 1);
  };

  const back = () => {
    setCandidate(null);
    setFitSeq((n) => n + 1);
  };

  const addStop = () => {
    haptics.tick();
    setFocusIndex(legs.length);
    setLegs((l) => [...l, null]);
  };

  // The map was hidden while searching: give it back its size.
  useEffect(() => {
    if (!searching) requestAnimationFrame(() => mapRef.current?.resize());
  }, [searching]);

  // What keeping its map costs.
  const corridor = useMemo(() => (route ? tilesForCorridor(route.geometry.coordinates as [number, number][]) : null), [route]);
  const estimate = corridor && templates.length ? estimateTiles(corridor, templates) : null;

  const save = async () => {
    if (!start || !to || !route || progress) return;
    haptics.tick();
    const coords = route.geometry.coordinates as [number, number][];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const bounds: PackBounds = { west: Math.min(...lngs), east: Math.max(...lngs), south: Math.min(...lats), north: Math.max(...lats) };
    const title = name.trim() || `${start.name} → ${to.name}`;
    let packId: string | undefined;
    if (estimate && !estimate.tooLarge && corridor) {
      setProgress({ done: 0, total: estimate.tileCount });
      const pack = await downloadPack({ name: tr("Route · {0}", [title]), bounds, templates, tiles: corridor, onProgress: (p) => setProgress({ done: p.done, total: p.total }) });
      setProgress(null);
      if (pack) packId = pack.id;
      else toast.error(tr("Offline download failed"));
    }
    saveRoute({ name: title, from: start, via, to, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, packId });
    toast.success(tr("Route saved"), {
      description: estimate?.tooLarge ? tr("It's too long to keep its map offline, so it's saved without it.") : tr("It's in the map's search, under Saved routes."),
    });
    navigate(-1);
  };

  const prev = candidate ? before(candidate.index) : null;

  return (
    <div className="h-dvh flex flex-col p-4 safe-top safe-bottom md:p-5 gap-3">
      <PageHeader title={tr("Plan a route")} />

      <div className={cn('grid gap-2 overflow-y-auto content-start', searching ? 'flex-1 min-h-0' : 'max-h-[40dvh]')}>
        <PlaceField
          icon={<LocateFixed className="w-4 h-4 text-accent" />}
          placeholder={tr("From")}
          value={from}
          fallback={here ? tr("My location") : ''}
          onPick={(p) => {
            setFrom(p);
            // The first stop's bends were from the old start.
            setLegs((l) => l.map((x, j) => (j === 0 && x ? { ...x, shape: undefined } : x)));
          }}
          onMine={here ? () => setFrom(null) : undefined}
          onOpenChange={fieldOpen}
          near={here}
        />
        {legs.map((p, i) => (
          <PlaceField
            key={i}
            icon={i === legs.length - 1 ? <Flag className="w-4 h-4 text-accent" /> : <MapPin className="w-4 h-4 text-accent" />}
            placeholder={tr("Where to?")}
            value={candidate?.index === i ? candidate.place : p}
            autoFocus={focusIndex === i}
            onPick={(v) => setCandidate({ index: i, place: v })}
            onOpenChange={fieldOpen}
            onRemove={
              legs.length > 1
                ? () => {
                    if (candidate?.index === i) setCandidate(null);
                    // The stop after this one is now reached from the one before: its bends no longer fit.
                    setLegs((l) => l.filter((_, j) => j !== i).map((x, j) => (j === i && x ? { ...x, shape: undefined } : x)));
                    setFitSeq((n) => n + 1);
                  }
                : undefined
            }
            near={here}
          />
        ))}
      </div>

      <div className={cn('relative flex-1 min-h-[180px] rounded-2xl overflow-hidden border border-border/60', searching && 'hidden')}>
        {/* MapLibre makes its container position: relative, so it sits inside the placed box. */}
        <div className="absolute inset-0"><div ref={boxRef} className="w-full h-full" /></div>
        <div ref={hazeRef} aria-hidden className="map-switch-haze" />
        {routing && !candidate && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <PixelLoader className="w-6 h-6 text-accent" />
          </div>
        )}

        {/* The place being circled: how to get there, Twisty or Direct. */}
        <PageTips
          page="plan-route-pick"
          when={!!candidate && arrived}
          tips={[{ target: '[data-tip="route-twisty"]', text: tr("Twisty takes the bendy roads to this stop, Direct the quickest way. Either one adds it to your route.") }]}
        />
        {candidate && arrived && (
          <div className="absolute left-2 right-2 bottom-2 z-10 rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur p-3 animate-slide-up">
            <p className="font-semibold text-sm truncate">{candidate.place.name}</p>
            {candidate.place.address && <p className="text-xs text-muted-foreground truncate">{candidate.place.address}</p>}
            {prev && <p className="text-xs text-foreground/90 mt-0.5 truncate">{tr("{0} from {1}", [kmText(haversineM(prev, candidate.place) / 1000), prev.name])}</p>}
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={back}>
                <ArrowLeft className="w-3.5 h-3.5" /> {tr("Back")}
              </Button>
              <Button size="sm" data-tip="route-twisty" disabled={!!styleBusy} className="flex-1 gap-1 bg-accent text-accent-foreground hover:bg-accent hover:brightness-110" onClick={() => void choose('twisty')}>
                {styleBusy === 'twisty' ? <PixelLoader className="w-3.5 h-3.5" /> : <Waves className="w-3.5 h-3.5" />} {tr("Twisty")}
              </Button>
              <Button size="sm" disabled={!!styleBusy} className="flex-1 gap-1 btn-accent-2" onClick={() => void choose('direct')}>
                <Navigation className="w-3.5 h-3.5" /> {tr("Direct")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {route && start && to && !candidate && !searching && (
        <div className="rounded-2xl frost p-3 space-y-2.5 animate-slide-up">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-mono font-bold text-lg">{kmText(route.distanceMeters / 1000)}</span>
            <span className="font-mono font-bold text-lg">{travelTime(route.durationSeconds, etaSpread(route))}</span>
            {estimate && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="w-3.5 h-3.5" />
                {estimate.tooLarge ? tr("Too long to keep offline") : tr("{0} to download", [formatBytes(estimate.bytes)])}
              </span>
            )}
          </div>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNamed(true);
            }}
            aria-label={tr("Name")}
            maxLength={60}
            className="w-full h-11 rounded-xl bg-background/60 border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-accent/50"
          />
          {progress ? (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">{tr("Saving…")}</p>
            </div>
          ) : (
            <div className="flex gap-2">
              {/* Another stop after the last, until the route's right. */}
              {legs.length < 8 && legs[legs.length - 1] && (
                <Button variant="outline" onClick={addStop} className="h-12 rounded-2xl font-semibold gap-1.5">
                  <Plus className="w-4 h-4" /> {tr("Add a stop")}
                </Button>
              )}
              <Button onClick={() => void save()} className="flex-1 h-12 rounded-2xl font-semibold">
                <Save className="w-4 h-4 mr-2" />
                {tr("Save route")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One end of the route: a search with its own list of places (and, for the start, "My location"). */
function PlaceField({
  icon,
  placeholder,
  value,
  fallback,
  onPick,
  onMine,
  onRemove,
  near,
  autoFocus,
  onOpenChange,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: SavedRouteEnd | null;
  /** Shown when nothing's picked (the start: "My location"). */
  fallback?: string;
  onPick: (p: SavedRouteEnd) => void;
  /** Back to the phone's own position. */
  onMine?: () => void;
  /** Take this stop off the route. */
  onRemove?: () => void;
  near: { lat: number; lng: number } | null;
  /** Focused as it appears (a stop just added). */
  autoFocus?: boolean;
  /** Its search opened or closed. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<MapSearchResult[]>([]);
  // Places saved on the map: all of them before typing, the ones whose name matches after.
  const [saved, setSaved] = useState<SavedPOI[]>(() => getSavedPOIs());
  useEffect(() => {
    const refresh = () => setSaved(getSavedPOIs());
    window.addEventListener('blacktop-poi-saved', refresh);
    return () => window.removeEventListener('blacktop-poi-saved', refresh);
  }, []);
  const savedHits = q.trim() ? saved.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : saved;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A field taken away while open (a stop removed) closes its count too.
  useEffect(() => () => {
    if (wasOpen.current) onOpenChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    // The free search service allows about one request a second.
    timer.current = window.setTimeout(() => {
      setBusy(true);
      void searchPlaces(q, null, near, null)
        .then((r) => id === seq.current && setResults(r))
        .finally(() => id === seq.current && setBusy(false));
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pick = (p: SavedRouteEnd) => {
    haptics.tick();
    onPick(p);
    setQ('');
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="relative">
      <label className="flex items-center gap-2 h-12 rounded-2xl frost-accent bg-card/80 px-3">
        {icon}
        <input
          value={open ? q : value?.name ?? (fallback || '')}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          autoFocus={autoFocus}
          className="flex-1 min-w-0 bg-transparent text-[15px] outline-none"
        />
        {busy && <PixelLoader className="w-4 h-4 text-muted-foreground" />}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={tr("Remove")} className="glove-hit p-1 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </label>
      {open && (onMine || savedHits.length > 0 || results.length > 0) && (
        <ul className="mt-1.5 max-h-64 overflow-y-auto rounded-xl bg-card/95 border border-border shadow-2xl backdrop-blur">
          {onMine && !q && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onMine(); setOpen(false); }} className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10">
                <LocateFixed className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">{tr("My location")}</span>
              </button>
            </li>
          )}
          {savedHits.map((p) => (
            <li key={`poi:${p.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick({ lat: p.lat, lng: p.lng, name: p.name })}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 border-t border-border/50 first:border-t-0"
              >
                <Bookmark className="w-4 h-4 text-accent shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{p.name}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{tr("Saved location")}</span>
                </span>
              </button>
            </li>
          ))}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick({ lat: r.lat, lng: r.lng, name: r.name, address: r.address })}
                className={cn('w-full flex items-center gap-3 p-3 text-left hover:bg-accent/10 border-t border-border/50 first:border-t-0')}
              >
                <MapPin className="w-4 h-4 text-accent shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{r.name}</span>
                  {r.address && <span className="block text-[11px] text-muted-foreground truncate">{r.address}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
