import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_PIXEL_RATIO } from '@/lib/maplibreWorker';
import { loadDarkMapStyle, OPENFREEMAP_DARK_STYLE_URL } from '@/features/map/lib/darkStyle';
import { whenStyleReady } from '@/features/map/lib/whenStyleReady';
import { getMemberColorStyles } from '@/lib/memberColors';
import { addHazardLayer, setHazardData, useHazards } from '@/features/hazards';
import { isThermal } from '@/lib/thermal';
import { getLastView } from '@/features/map/lib/lastView';

export interface MiniMapMember {
  userId: string;
  name: string;
  accentColor?: string | null;
  lat: number;
  lng: number;
}

interface Props {
  position: { lat: number; lng: number } | null;
  /** Direction of travel, degrees; the map turns so it points up. */
  heading: number | null;
  zoom: number;
  route: Array<[number, number]> | null;
  members: MiniMapMember[];
  accent: string;
  /** On screen: the camera only moves while it is. */
  active: boolean;
}

const ROUTE = 'mini-route';

/**
 * The ride screen's mini map (inside RideDial): the Blacktop dark map in a
 * circle, centred on the rider and turned to face the way they're going, with
 * the route being guided along, hazard reports (the big map's own pins) and
 * the other riders in the convoy (on the rim when they're out of view). Not
 * interactive (a tap flips the dial); zoom comes from the dial's buttons.
 * Lazy-loaded, so MapLibre stays out of the ride screen's first load.
 */
export default function RideMiniMap({ position, heading, zoom, route, members, accent, active }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const pins = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLDivElement; lng: number; lat: number }>());
  const start = useRef({ position, zoom });

  useEffect(() => {
    if (!box.current) return;
    let cancelled = false;
    let made: maplibregl.Map | null = null;
    void loadDarkMapStyle()
      .catch((): string => OPENFREEMAP_DARK_STYLE_URL)
      .then((style) => {
        if (cancelled || !box.current) return;
        // Before the first fix: where the rider last was on the map, never the middle of the world.
        const last = getLastView();
        const at = start.current.position ?? (last ? { lat: last.lat, lng: last.lng } : null);
        made = new maplibregl.Map({
          container: box.current,
          style,
          center: at ? [at.lng, at.lat] : [0, 20],
          zoom: at ? start.current.zoom : 2,
          interactive: false,
          attributionControl: false,
          pixelRatio: MAP_PIXEL_RATIO,
          fadeDuration: 0,
        });
        setMap(made);
      });
    return () => {
      cancelled = true;
      made?.remove();
      setMap(null);
    };
  }, []);

  // The route line, under everything else.
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => {
      const data: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route ?? [] } };
      const src = map.getSource(ROUTE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        return;
      }
      map.addSource(ROUTE, { type: 'geojson', data });
      map.addLayer({ id: `${ROUTE}-casing`, type: 'line', source: ROUTE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': 8, 'line-opacity': 0.6 } });
      map.addLayer({ id: ROUTE, type: 'line', source: ROUTE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': 5 } });
    });
  }, [map, route, accent]);

  // Hazard reports, drawn exactly as on the Blacktop map (the warning engine already loads the ones round the rider).
  const hazards = useHazards();
  const hazardsRef = useRef(hazards);
  hazardsRef.current = hazards;
  useEffect(() => {
    if (!map) return;
    let remove: (() => void) | null = null;
    const cancel = whenStyleReady(map, () => {
      remove = addHazardLayer(map, () => {});
      // Filled straight away: reports already loaded won't change to fill it later.
      setHazardData(map, hazardsRef.current);
    });
    return () => {
      cancel();
      remove?.();
    };
  }, [map]);
  useEffect(() => {
    if (!map) return;
    return whenStyleReady(map, () => setHazardData(map, hazards));
  }, [map, hazards]);

  // Follow the rider, heading up, at the dial's zoom.
  useEffect(() => {
    if (!map || !active || !position) return;
    map.easeTo({
      center: [position.lng, position.lat],
      zoom,
      ...(heading != null ? { bearing: heading } : {}),
      duration: isThermal() ? 0 : 700,
      essential: true,
    });
  }, [map, active, position?.lat, position?.lng, heading, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // The other riders, the same letter pins as the big map, smaller.
  useEffect(() => {
    if (!map) return;
    const keep = new Set(members.map((m) => m.userId));
    pins.current.forEach((p, id) => {
      if (!keep.has(id)) {
        p.marker.remove();
        pins.current.delete(id);
      }
    });
    for (const m of members) {
      let p = pins.current.get(m.userId);
      if (!p) {
        const el = document.createElement('div');
        el.className = 'flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold';
        p = { el, lng: m.lng, lat: m.lat, marker: new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map) };
        pins.current.set(m.userId, p);
      } else {
        p.lng = m.lng;
        p.lat = m.lat;
      }
      const c = getMemberColorStyles(m.accentColor ?? undefined);
      p.el.textContent = (m.name.trim()[0] || '?').toUpperCase();
      p.el.style.backgroundColor = c.bg;
      p.el.style.borderColor = c.border;
      p.el.style.color = c.text;
    }
    placePins();
  }, [map, members]); // eslint-disable-line react-hooks/exhaustive-deps

  // A rider outside the circle sits on its rim, faded, in their direction (a radar), not lost off the edge.
  const placePins = () => {
    if (!map) return;
    const box = map.getContainer();
    const cx = box.clientWidth / 2;
    const cy = box.clientHeight / 2;
    const rim = Math.min(cx, cy) - 11;
    pins.current.forEach((p) => {
      const pt = map.project([p.lng, p.lat]);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const d = Math.hypot(dx, dy);
      if (d <= rim) {
        p.marker.setLngLat([p.lng, p.lat]);
        p.el.style.opacity = '1';
      } else {
        p.marker.setLngLat(map.unproject([cx + (dx / d) * rim, cy + (dy / d) * rim]));
        p.el.style.opacity = '0.6';
      }
    });
  };
  const placeRef = useRef(placePins);
  placeRef.current = placePins;
  useEffect(() => {
    if (!map) return;
    const onMove = () => placeRef.current();
    map.on('move', onMove);
    return () => {
      map.off('move', onMove);
    };
  }, [map]);

  useEffect(() => {
    const all = pins.current;
    return () => {
      all.forEach((p) => p.marker.remove());
      all.clear();
    };
  }, []);

  // MapLibre makes its container position: relative, so it sits in a box that fills this one.
  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}
