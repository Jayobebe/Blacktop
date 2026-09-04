import type { RideSession } from '@/types/blacktop';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { analyseCorners } from './cornerScoring';

/**
 * Shareable ride recap card — a single square image rendered on-device from
 * the ride's own data. Nothing is uploaded; the user gets a blob to share or
 * save wherever they like.
 */

export interface RecapOptions {
  riderName?: string;
  bikeName?: string | null;
  /** 'miles' | 'km' */
  unit?: 'miles' | 'km';
  accent?: string;
}

const MI_TO_KM = 1.60934;

function readAccent(): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (raw) return `hsl(${raw.split(/\s+/).join(', ')})`;
  } catch {}
  return '#f59e0b';
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  ride: RideSession,
  box: { x: number; y: number; w: number; h: number },
  accent: string,
) {
  const pts = (ride.gpsPoints ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return;

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(1e-5, maxLat - minLat);
  const lngSpan = Math.max(1e-5, maxLng - minLng);
  const scale = Math.min(box.w / lngSpan, box.h / latSpan) * 0.86;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const project = (p: { lat: number; lng: number }) => ({
    x: cx + (p.lng - midLng) * scale,
    y: cy - (p.lat - midLat) * scale,
  });

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Glow pass then crisp pass.
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 18;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const { x, y } = project(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 6;
  ctx.stroke();

  // Start / end markers
  const start = project(pts[0]);
  const end = project(pts[pts.length - 1]);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(start.x, start.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 11, 0, Math.PI * 2);
  ctx.fill();
}

export async function renderRecapCard(ride: RideSession, opts: RecapOptions = {}): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const accent = opts.accent ?? readAccent();
  const isMiles = (opts.unit ?? 'miles') === 'miles';
  const distance = isMiles ? ride.distance : ride.distance * MI_TO_KM;
  const distanceLabel = isMiles ? 'mi' : 'km';
  const speed = isMiles ? ride.maxSpeed : ride.maxSpeed * MI_TO_KM;
  const speedLabel = isMiles ? 'mph' : 'km/h';
  const corners = analyseCorners(ride);

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.42, 60, size * 0.5, size * 0.42, size * 0.75);
  grad.addColorStop(0, `${accent}22`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Header
  ctx.fillStyle = accent;
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '10px';
  ctx.fillText('BLACKTOP', 70, 72);
  ctx.letterSpacing = '0px';

  const title = ride.name || new Date(ride.startedAt).toLocaleDateString();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 62px system-ui, -apple-system, sans-serif';
  ctx.fillText(title.slice(0, 22), 70, 122);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '28px system-ui, -apple-system, sans-serif';
  const sub = [
    opts.riderName?.trim(),
    opts.bikeName?.trim(),
    new Date(ride.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
  ].filter(Boolean).join('  ·  ');
  ctx.fillText(sub, 70, 200);

  // Route
  drawRoute(ctx, ride, { x: 70, y: 262, w: size - 140, h: 400 }, accent);

  // Stat grid
  const stats: { label: string; value: string }[] = [
    { label: `Distance (${distanceLabel})`, value: distance.toFixed(1) },
    { label: 'Duration', value: fmtDuration(ride.duration) },
    { label: `Top speed (${speedLabel})`, value: String(Math.round(speed)) },
    { label: 'Max lean', value: `${Math.round(Math.max(ride.maxLeanLeft || 0, ride.maxLeanRight || 0))}°` },
    { label: 'Peak G', value: ride.maxGForce ? `${ride.maxGForce.toFixed(1)}g` : '—' },
    { label: 'Corners', value: corners.count ? `${corners.count} · ${corners.grade}` : '—' },
  ];

  const gridTop = 712;
  const colW = (size - 140) / 3;
  stats.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 70 + col * colW;
    const y = gridTop + row * 132;

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText(s.label.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
    ctx.fillText(s.value, x, y + 34);
  });

  // Footer rule + tag
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, size - 108);
  ctx.lineTo(size - 70, size - 108);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 24px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(ride.isConvoyRide ? 'CONVOY RIDE' : 'SOLO RIDE', 70, size - 78);
  ctx.letterSpacing = '0px';

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to render recap'))), 'image/png');
  });
}

/** Share via the OS sheet where supported, otherwise download the PNG. */
export async function shareRecapCard(ride: RideSession, opts: RecapOptions = {}): Promise<'shared' | 'downloaded'> {
  const blob = await renderRecapCard(ride, opts);
  const base = (ride.name || new Date(ride.startedAt).toLocaleDateString())
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();
  const filename = `${base || 'ride'}-recap.png`;

  // Native shells can't anchor-download; save to the Documents folder instead.
  if (Capacitor.isNativePlatform()) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read recap'));
      reader.readAsDataURL(blob);
    });
    await Filesystem.writeFile({
      path: `Blacktop/${filename}`,
      data: dataUrl.split(',')[1],
      directory: Directory.Documents,
      recursive: true,
    });
    return 'downloaded';
  }

  const file = new File([blob], filename, { type: 'image/png' });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Blacktop ride recap' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
