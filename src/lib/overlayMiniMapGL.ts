// The overlay video's mini map, drawn with the app's own map: a small hidden
// MapLibre map in the Blacktop dark style (water wordmark and all) that follows
// the rider heading-up, with the route and convoy members as layers. Each video
// frame copies its canvas into a circular dial with an accent ring, a rider
// arrow and a north marker. Only created while an overlay recording with the
// mini map is running, and MapLibre is loaded on demand.
import '@/lib/maplibreWorker';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { loadDarkMapStyle } from '@/features/map/lib/darkStyle';
import { applyWaterWordmark } from '@/features/map/lib/waterWordmark';

const ZOOM = 15.2;
const ROUTE_SRC = 'overlay-route';
const MEMBERS_SRC = 'overlay-members';

export interface OverlayMiniMapMember {
  lat: number;
  lng: number;
  color?: string;
}

export class OverlayMiniMapGL {
  private map: MapLibreMap;
  private container: HTMLDivElement;
  private ready = false;
  private accent: string;
  private lastRouteLen = -1;

  private constructor(map: MapLibreMap, container: HTMLDivElement, accent: string) {
    this.map = map;
    this.container = container;
    this.accent = accent;
  }

  /** `size` is the dial's diameter in video pixels; the map renders at that size. */
  static async create(size: number, accent: string, center: { lat: number; lng: number }): Promise<OverlayMiniMapGL> {
    const container = document.createElement('div');
    // On the page but off screen: WebGL needs a real, sized element.
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${size}px;height:${size}px;pointer-events:none;`;
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const style = await loadDarkMapStyle();
    const map = new maplibregl.Map({
      container,
      style,
      center: [center.lng, center.lat],
      zoom: ZOOM,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 1,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const mm = new OverlayMiniMapGL(map, container, accent);
    map.once('load', () => mm.onLoad());
    return mm;
  }

  private onLoad() {
    const map = this.map;
    try {
      applyWaterWordmark(map, this.accent);
    } catch {
      /* the plain water colour is fine */
    }
    map.addSource(ROUTE_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: `${ROUTE_SRC}-glow`, type: 'line', source: ROUTE_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.accent, 'line-width': 14, 'line-opacity': 0.25, 'line-blur': 6 } });
    map.addLayer({ id: `${ROUTE_SRC}-line`, type: 'line', source: ROUTE_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': this.accent, 'line-width': 5 } });
    map.addSource(MEMBERS_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${MEMBERS_SRC}-dots`,
      type: 'circle',
      source: MEMBERS_SRC,
      paint: {
        'circle-radius': 7,
        'circle-color': ['coalesce', ['get', 'color'], '#7cc4ff'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });
    this.ready = true;
  }

  /** Follow the rider (heading-up) and refresh the route / convoy. Call on each stats update (~1Hz). */
  update(center: { lat: number; lng: number; heading: number | null }, route: Array<{ lat: number; lng: number }>, members?: OverlayMiniMapMember[]) {
    const map = this.map;
    map.jumpTo({ center: [center.lng, center.lat], bearing: center.heading ?? map.getBearing(), zoom: ZOOM });
    if (!this.ready) return;
    if (route.length !== this.lastRouteLen) {
      this.lastRouteLen = route.length;
      const pts = route.length > 600 ? route.slice(-600) : route;
      (map.getSource(ROUTE_SRC) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: pts.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) } }] : [],
      });
    }
    (map.getSource(MEMBERS_SRC) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: (members ?? [])
        .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
        .map((m) => ({ type: 'Feature', properties: { color: m.color ?? null }, geometry: { type: 'Point', coordinates: [m.lng, m.lat] } })),
    });
  }

  /** True once the map has drawn something worth showing. */
  get hasFrame(): boolean {
    return this.ready && this.map.loaded();
  }

  /** Draw the dial: the map in a circle, accent ring, north marker, rider arrow. */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, heading: number | null) {
    const r = size / 2;
    ctx.save();

    // Soft shadow behind the dial so it lifts off any footage.
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(12,12,14)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // The map, clipped to the circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.map.getCanvas(), cx - r, cy - r, size, size);
    // Vignette so the edge fades into the ring.
    const vignette = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(cx - r, cy - r, size, size);
    ctx.restore();

    // Rings: dark bezel, then the accent line.
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(10,10,12,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // North marker on the rim (the map is heading-up, so north moves round).
    const north = (-(heading ?? 0) * Math.PI) / 180;
    const nx = cx + Math.sin(north) * (r - 16);
    const ny = cy - Math.cos(north) * (r - 16);
    ctx.fillStyle = 'rgba(10,10,12,0.9)';
    ctx.beginPath();
    ctx.arc(nx, ny, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 1);

    // Rider arrow at the centre, pointing up (direction of travel).
    ctx.translate(cx, cy);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(12, 13);
    ctx.lineTo(0, 6);
    ctx.lineTo(-12, 13);
    ctx.closePath();
    ctx.fillStyle = this.accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'white';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  destroy() {
    this.map.remove();
    this.container.remove();
  }
}
