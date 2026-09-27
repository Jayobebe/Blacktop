import type { TrackSession } from '../types';

/** CSV of every telemetry sample: opens in spreadsheets and track-data tools. */
export function sessionCsv(s: TrackSession): string {
  const rows = [
    'time_ms,time_iso,lap,lap_distance_m,lat,lng,speed_kph,speed_mph,lean_deg,g',
    ...s.samples.map((p) =>
      [
        p.t,
        new Date(p.t).toISOString(),
        p.lap,
        p.d.toFixed(1),
        p.lat.toFixed(7),
        p.lng.toFixed(7),
        (p.v * 3.6).toFixed(2),
        (p.v * 2.23694).toFixed(2),
        p.lean != null ? p.lean.toFixed(1) : '',
        p.g != null ? p.g.toFixed(2) : '',
      ].join(','),
    ),
  ];
  return rows.join('\n');
}

/** Lap summary CSV (one row per lap with sectors). */
export function lapsCsv(s: TrackSession): string {
  const sectors = s.splitsCount + 1;
  const head = ['lap', 'lap_ms', 'lap_time', ...Array.from({ length: sectors }, (_, i) => `s${i + 1}_ms`), 'valid', 'max_speed_kph', 'max_lean_deg'];
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
  return [
    head.join(','),
    ...s.laps.map((l) =>
      [l.n, l.ms, fmt(l.ms), ...Array.from({ length: sectors }, (_, i) => l.sectors[i] ?? ''), l.valid, (l.maxSpeed * 3.6).toFixed(1), l.maxLean?.toFixed(1) ?? ''].join(','),
    ),
  ].join('\n');
}

export function sessionGpx(s: TrackSession): string {
  const esc = (x: string) => x.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  const pts = s.samples
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time><extensions><speed>${p.v.toFixed(2)}</speed></extensions></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Blacktop Track Pack" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(s.trackName)} ${new Date(s.startedAt).toISOString()}</name></metadata>
  <trk>
    <name>${esc(s.trackName)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

/** Share (mobile) or download (desktop) a text file. */
export async function shareFile(name: string, text: string, mime: string) {
  const file = new File([text], name, { type: mime });
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return;
    }
  } catch {
    /* fall through to download */
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fileStem(s: TrackSession) {
  const d = new Date(s.startedAt);
  const slug = s.trackName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
  return `${slug}-${d.toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
}
