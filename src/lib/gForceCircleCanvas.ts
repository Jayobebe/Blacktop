import { ENVELOPE_BINS, type GMax } from './gForceVector';

/**
 * Canvas version of components/GForceCircle, for the live overlay video: the
 * same rings, crosshair, dotted peak envelope, live dot and peak figures,
 * drawn at `size` px wide centred on (cx, cy). Keep the two in step.
 */

const SCALES = [1, 1.5, 2, 3];

function fillEnvelope(env: number[]): number[] | null {
  const n = env.length;
  if (env.filter((v) => v > 0).length < 3) return null;
  return env.map((v, i) => {
    if (v > 0) return v;
    let prev = i;
    while (env[prev] <= 0) prev = (prev - 1 + n) % n;
    let next = i;
    while (env[next] <= 0) next = (next + 1) % n;
    const span = (next - prev + n) % n || n;
    return env[prev] + (env[next] - env[prev]) * (((i - prev + n) % n) / span);
  });
}

export function drawGForceCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  g: { lateral: number; longitudinal: number; envelope: number[]; max: GMax },
  accent: string,
  labels: { left: string; right: string; brake: string; accel: string },
) {
  const u = size / 240; // the SVG's viewBox units
  const R = 78 * u;
  const peak = Math.max(g.max.left, g.max.right, g.max.brake, g.max.accel, ...g.envelope, Math.hypot(g.lateral, g.longitudinal));
  const scale = SCALES.find((s) => peak <= s * 0.97) ?? SCALES[SCALES.length - 1];

  ctx.save();
  ctx.lineCap = 'round';

  // Bezel, rings, crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 7 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 14 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  for (const f of [1 / 3, 2 / 3, 1]) {
    ctx.lineWidth = (f === 1 ? 1.2 : 1) * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // Dotted peak envelope
  const filled = fillEnvelope(g.envelope);
  if (filled) {
    ctx.fillStyle = accent;
    const steps = 180;
    for (let i = 0; i < steps; i++) {
      const pos = (i / steps) * ENVELOPE_BINS;
      const a = Math.floor(pos) % ENVELOPE_BINS;
      const b = (a + 1) % ENVELOPE_BINS;
      const val = filled[a] + (filled[b] - filled[a]) * (pos - Math.floor(pos));
      const theta = (pos / ENVELOPE_BINS) * Math.PI * 2;
      const r = (Math.min(val, scale * 1.08) / scale) * R;
      ctx.beginPath();
      ctx.arc(cx + r * Math.sin(theta), cy - r * Math.cos(theta), 1.4 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Live dot
  const clamp = (v: number) => Math.max(-scale, Math.min(scale, v));
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(cx + (clamp(g.lateral) / scale) * R, cy - (clamp(g.longitudinal) / scale) * R, 6.5 * u, 0, Math.PI * 2);
  ctx.fill();

  // Figures and captions
  const fmt = (v: number) => (Math.max(0, v) + 1e-9).toFixed(1);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'white';
  ctx.font = `600 ${22 * u}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(fmt(g.max.brake), cx, cy - R - 24 * u);
  ctx.fillText(fmt(g.max.accel), cx, cy + R + 40 * u);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(g.max.left), cx - R - 18 * u, cy + 8 * u);
  ctx.textAlign = 'left';
  ctx.fillText(fmt(g.max.right), cx + R + 18 * u, cy + 8 * u);

  ctx.font = `600 ${11 * u}px system-ui`;
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.fillText(labels.brake, cx - 30 * u, cy - R - 29 * u);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(labels.accel, cx - 30 * u, cy + R + 35 * u);
  for (const [text, x, rot] of [[labels.left, -66, -Math.PI / 4], [labels.right, 66, Math.PI / 4]] as const) {
    ctx.save();
    ctx.translate(cx + x * u, cy - 66 * u);
    ctx.rotate(rot);
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Full-scale box
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.2 * u;
  ctx.strokeRect(cx + R + 4 * u, cy + R + 18 * u, 44 * u, 20 * u);
  ctx.fillStyle = 'white';
  ctx.font = `${13 * u}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${scale.toFixed(1)}G`, cx + R + 26 * u, cy + R + 33 * u);
  ctx.restore();
}
