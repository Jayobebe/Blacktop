// GPX import: reads routes (rtept), tracks (trkpt) or waypoints (wpt) from a
// .gpx file and boils them down to the planner's shape (up to 5 stops + a
// destination), picking evenly spaced points so the router follows the file.

export interface GpxPoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface GpxRoute {
  name: string;
  destination: GpxPoint;
  stops: GpxPoint[];
}

const MAX_STOPS = 5;

function readPoints(doc: Document, tag: string): GpxPoint[] {
  return Array.from(doc.getElementsByTagName(tag))
    .map((el) => ({
      lat: parseFloat(el.getAttribute('lat') ?? ''),
      lng: parseFloat(el.getAttribute('lon') ?? ''),
      name: el.getElementsByTagName('name')[0]?.textContent?.trim() || undefined,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}

export function parseGpx(text: string, fallbackName = 'GPX route'): GpxRoute | null {
  if (text.length > 20 * 1024 * 1024) return null;
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;

  let pts = readPoints(doc, 'rtept');
  if (pts.length < 2) pts = readPoints(doc, 'trkpt');
  if (pts.length < 2) pts = readPoints(doc, 'wpt');
  if (pts.length < 2) return null;

  const destination = pts[pts.length - 1];
  const body = pts.slice(0, -1);
  let stops: GpxPoint[];
  if (body.length <= MAX_STOPS) stops = body;
  else {
    stops = [];
    for (let i = 1; i <= MAX_STOPS; i++) stops.push(body[Math.round((i * (body.length - 1)) / (MAX_STOPS + 1))]);
  }
  const name =
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    doc.querySelector('trk > name, rte > name')?.textContent?.trim() ||
    fallbackName;
  return {
    name,
    destination: { ...destination, name: destination.name ?? name },
    stops: stops.map((s, i) => ({ ...s, name: s.name ?? `GPX point ${i + 1}` })),
  };
}
