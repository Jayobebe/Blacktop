import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Undo2, X, Crosshair } from 'lucide-react';
import { simplifyPx, polygonAreaM2, ringToGeoJson, type LngLat } from '../../../lib/derezGeo';

const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const SRC = 'derez-arena';

interface Props {
  initialRing?: LngLat[] | null;
  accentColor: string;
  onCancel: () => void;
  onConfirm: (ring: LngLat[]) => void;
}

export function DerezArenaDrawer({ initialRing, accentColor, onCancel, onConfirm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ring, setRing] = useState<LngLat[]>(initialRing ?? []);
  const [drawing, setDrawing] = useState(false);
  const strokeRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [0, 51],
      zoom: 17,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any });
      map.addLayer({ id: `${SRC}-fill`, type: 'fill', source: SRC, paint: { 'fill-color': accentColor, 'fill-opacity': 0.15 } });
      map.addLayer({ id: `${SRC}-line`, type: 'line', source: SRC, paint: { 'line-color': accentColor, 'line-width': 3 } });
      setReady(true);
    });

    navigator.geolocation?.getCurrentPosition(
      (pos) => map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 18 }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );

    return () => { map.remove(); mapRef.current = null; };
  }, [accentColor]);

  // Render the ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(ring.length > 2
      ? ({ type: 'FeatureCollection', features: [ringToGeoJson(ring)] } as any)
      : ({ type: 'FeatureCollection', features: [] } as any));
  }, [ring, ready]);

  // Drawing mode disables map panning so the finger draws instead
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing) { map.dragPan.disable(); map.dragRotate.disable(); map.touchZoomRotate.disable(); }
    else { map.dragPan.enable(); map.dragRotate.enable(); map.touchZoomRotate.enable(); }
  }, [drawing]);

  const [preview, setPreview] = useState<string>('');

  const pointFromEvent = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!drawing) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokeRef.current = [pointFromEvent(e)];
    setPreview('');
  }, [drawing]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || !drawingRef.current) return;
    const p = pointFromEvent(e);
    const last = strokeRef.current[strokeRef.current.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) {
      strokeRef.current.push(p);
      setPreview(strokeRef.current.map(pt => pt.join(',')).join(' '));
    }
  }, [drawing]);

  const onPointerUp = useCallback(() => {
    if (!drawing || !drawingRef.current) return;
    drawingRef.current = false;
    const map = mapRef.current;
    const pts = simplifyPx(strokeRef.current, 4);
    strokeRef.current = [];
    setPreview('');
    if (!map || pts.length < 3) return;
    const next = pts.map(([x, y]) => {
      const ll = map.unproject([x, y]);
      return { lng: ll.lng, lat: ll.lat };
    });
    setRing(next);
    setDrawing(false);
  }, [drawing]);

  const area = ring.length > 2 ? polygonAreaM2(ring) : 0;

  return (
    <div className="fixed inset-0 z-[1200] bg-background flex flex-col">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Draw surface */}
      <div
        className="absolute inset-0"
        style={{ touchAction: drawing ? 'none' : 'auto', pointerEvents: drawing ? 'auto' : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {preview && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polyline points={preview} fill="none" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 safe-top px-4 pt-3 flex items-center justify-between">
        <button onClick={onCancel} className="p-2.5 rounded-xl bg-card/90 border border-border/40 backdrop-blur" aria-label="Cancel arena">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Draw the arena</p>
          <p className="text-[10px] text-muted-foreground">
            {drawing ? 'Trace the boundary with your finger' : ring.length > 2 ? `${Math.round(area).toLocaleString()} m²` : 'Tap Draw, then trace the play area'}
          </p>
        </div>
        <button
          onClick={() => navigator.geolocation?.getCurrentPosition(
            (pos) => mapRef.current?.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 18 }),
            () => {}, { enableHighAccuracy: true },
          )}
          className="p-2.5 rounded-xl bg-card/90 border border-border/40 backdrop-blur"
          aria-label="Centre on me"
        >
          <Crosshair className="w-5 h-5" />
        </button>
      </div>

      {/* Controls */}
      <div className="relative z-10 mt-auto safe-bottom px-4 pb-4 flex items-center gap-2">
        <button
          onClick={() => setDrawing(d => !d)}
          className="flex-1 py-3 rounded-xl border-2 font-semibold text-sm"
          style={{ borderColor: accentColor, color: drawing ? '#000' : accentColor, background: drawing ? accentColor : 'transparent' }}
        >
          {drawing ? 'Drawing…' : ring.length > 2 ? 'Redraw' : 'Draw'}
        </button>
        {ring.length > 2 && (
          <button onClick={() => setRing([])} className="p-3 rounded-xl bg-card/90 border border-border/40" aria-label="Clear arena">
            <Undo2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={() => onConfirm(ring)}
          disabled={ring.length < 3}
          className="flex-1 py-3 rounded-xl bg-card/90 border border-border/40 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> Confirm
        </button>
      </div>
    </div>
  );
}
