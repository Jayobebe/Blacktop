import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Flag, Plus, Undo2, Save, X, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Gate, LatLng, TrackDef } from '../types';
import { metres } from '../lib/geometry';

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};

const MAX_SPLITS = 3;

/**
 * Draw a track's timing lines on satellite imagery: tap either edge of the
 * track for the start/finish line, then optionally add up to three sector
 * lines the same way (in running order).
 */
export function TrackEditor({ initial, onSave, onCancel }: { initial?: TrackDef; onSave: (t: TrackDef) => void; onCancel: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [startFinish, setStartFinish] = useState<Gate | null>(initial?.startFinish ?? null);
  const [splits, setSplits] = useState<Gate[]>(initial?.splits ?? []);
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<'sf' | 'split'>(initial ? 'split' : 'sf');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!containerRef.current) return;
    const center = initial ? [initial.startFinish.a.lng, initial.startFinish.a.lat] : [-1.26, 52.07];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: center as [number, number],
      zoom: initial ? 17 : 5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (!initial) {
      navigator.geolocation?.getCurrentPosition(
        (p) => map.jumpTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 17 }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
    map.on('load', () => {
      map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'lines',
        type: 'line',
        source: 'lines',
        paint: {
          'line-width': 5,
          'line-color': ['match', ['get', 'kind'], 'sf', '#ffffff', 'draft', '#facc15', '#a855f7'],
          'line-dasharray': [2, 1],
        },
      });
      map.addLayer({
        id: 'ends',
        type: 'circle',
        source: 'lines',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 6, 'circle-color': '#facc15', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 },
      });
    });
    map.on('click', (e) => {
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      const d = draftRef.current;
      if (!d) {
        setDraft(p);
        return;
      }
      if (metres(d, p) < 4) {
        toast('Tap the other edge of the track');
        return;
      }
      const gate = { a: d, b: p };
      setDraft(null);
      if (modeRef.current === 'sf') {
        setStartFinish(gate);
        setMode('split');
      } else {
        setSplits((s) => (s.length >= MAX_SPLITS ? s : [...s, gate]));
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw lines.
  useEffect(() => {
    const map = mapRef.current;
    const draw = () => {
      const src = map?.getSource('lines') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const line = (g: Gate, kind: string) => ({
        type: 'Feature' as const,
        properties: { kind },
        geometry: { type: 'LineString' as const, coordinates: [[g.a.lng, g.a.lat], [g.b.lng, g.b.lat]] },
      });
      src.setData({
        type: 'FeatureCollection',
        features: [
          ...(startFinish ? [line(startFinish, 'sf')] : []),
          ...splits.map((g) => line(g, 'split')),
          ...(draft ? [{ type: 'Feature' as const, properties: { kind: 'draft' }, geometry: { type: 'Point' as const, coordinates: [draft.lng, draft.lat] } }] : []),
        ],
      });
    };
    if (map?.isStyleLoaded()) draw();
    else map?.once('load', draw);
  }, [startFinish, splits, draft]);

  const undo = () => {
    if (draft) return setDraft(null);
    if (splits.length) return setSplits((s) => s.slice(0, -1));
    if (startFinish) {
      setStartFinish(null);
      setMode('sf');
    }
  };

  const save = () => {
    if (!startFinish) return toast.error('Draw the start / finish line first');
    if (!name.trim()) return toast.error('Name the track');
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim().slice(0, 40),
      startFinish,
      splits,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };

  const hint = draft
    ? 'Now tap the other edge of the track'
    : mode === 'sf'
      ? 'Tap one edge of the track at the start / finish line'
      : splits.length < MAX_SPLITS
        ? `Optional: tap across the track for sector split ${splits.length + 1} (in running order)`
        : 'All sector lines placed';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 right-16 rounded-xl bg-card/95 border border-border px-3 py-2 text-xs shadow-lg">
          <p className="flex items-center gap-1.5 font-semibold">
            {mode === 'sf' ? <Flag className="w-3.5 h-3.5 text-accent" /> : <Plus className="w-3.5 h-3.5 text-[#a855f7]" />}
            {hint}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Start/finish {startFinish ? '✓' : '—'} · Sectors {splits.length + (startFinish ? 1 : 0) || '—'} · Lines on straights time best
          </p>
        </div>
        <button
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((p) =>
              mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 17 }),
            )
          }
          className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-card/95 border border-border flex items-center justify-center"
          aria-label="Centre on me"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-2 border-t border-border safe-bottom">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Track name (e.g. Brands Hatch Indy)" maxLength={40} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} className="gap-1">
            <X className="w-4 h-4" /> Cancel
          </Button>
          <Button variant="secondary" onClick={undo} disabled={!startFinish && !draft} className="gap-1">
            <Undo2 className="w-4 h-4" /> Undo
          </Button>
          <Button onClick={save} className={cn('flex-1 gap-1', !startFinish && 'opacity-60')}>
            <Save className="w-4 h-4" /> Save track
          </Button>
        </div>
      </div>
    </div>
  );
}
