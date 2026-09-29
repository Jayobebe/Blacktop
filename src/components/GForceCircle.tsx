import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { ENVELOPE_BINS, type GMax } from '@/lib/gForceVector';

/**
 * Friction-circle G meter (lib/gForceVector): crosshair and rings, the peak
 * envelope traced as a dotted line, the live dot, and the peak figure for each
 * direction. Braking plots up, acceleration down, cornering to its side.
 * Leave out `lateral`/`longitudinal` for a finished ride (envelope only).
 */
interface GForceCircleProps {
  lateral?: number;
  longitudinal?: number;
  envelope: number[];
  max: GMax;
  /** Printed look for the paper receipt: everything in the surrounding text colour (the receipt's ink). */
  ink?: boolean;
  className?: string;
}

const SCALES = [1, 1.5, 2, 3];
const C = 120; // centre in the 240×240 viewBox
const R = 78; // full-scale radius

function fmt(v: number) {
  return (Math.max(0, v) + 1e-9).toFixed(1);
}

/** Fill empty bins by interpolating round the circle between lit neighbours. */
function fillEnvelope(env: number[]): number[] | null {
  const lit = env.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  if (lit.length < 3) return null;
  const n = env.length;
  return env.map((v, i) => {
    if (v > 0) return v;
    let prev = i;
    while (env[prev] <= 0) prev = (prev - 1 + n) % n;
    let next = i;
    while (env[next] <= 0) next = (next + 1) % n;
    const span = (next - prev + n) % n || n;
    const t = ((i - prev + n) % n) / span;
    return env[prev] + (env[next] - env[prev]) * t;
  });
}

export const GForceCircle = memo(function GForceCircle({ lateral, longitudinal, envelope, max, ink = false, className }: GForceCircleProps) {
  // Screen colours, or the receipt's ink (currentColor) at matching strengths.
  const k = ink
    ? { bezel: 'stroke-current opacity-15', ring: 'stroke-current opacity-35', cross: 'stroke-current opacity-70', trace: 'stroke-current', dot: 'fill-current', text: 'fill-current', caption: 'fill-current opacity-70', accentCaption: 'fill-current' }
    : { bezel: 'stroke-muted-foreground/15', ring: 'stroke-muted-foreground/35', cross: 'stroke-foreground/70', trace: 'stroke-accent', dot: 'fill-foreground', text: 'fill-foreground', caption: 'fill-muted-foreground', accentCaption: 'fill-accent' };
  const live = lateral !== undefined && longitudinal !== undefined;
  const peak = Math.max(max.left, max.right, max.brake, max.accel, ...envelope, live ? Math.hypot(lateral!, longitudinal!) : 0);
  const scale = SCALES.find((s) => peak <= s * 0.97) ?? SCALES[SCALES.length - 1];
  const toXY = (lat: number, lon: number) => ({ x: C + (lat / scale) * R, y: C - (lon / scale) * R });

  const trace = useMemo(() => {
    const filled = fillEnvelope(envelope);
    if (!filled) return null;
    return filled
      .map((g, i) => {
        const theta = (i / ENVELOPE_BINS) * 2 * Math.PI; // 0 = braking (up), clockwise
        const r = (Math.min(g, scale * 1.08) / scale) * R;
        return `${(C + r * Math.sin(theta)).toFixed(1)},${(C - r * Math.cos(theta)).toFixed(1)}`;
      })
      .join(' ');
  }, [envelope, scale]);

  const dot = live ? toXY(Math.max(-scale, Math.min(scale, lateral!)), Math.max(-scale, Math.min(scale, longitudinal!))) : null;

  return (
    <div className={cn('relative w-48 aspect-square', className)}>
      <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible" role="img" aria-label={tr("G-force")}>
        {/* Bezel: a heavy arc round the dial, like the reference meters */}
        <circle cx={C} cy={C} r={R + 14} fill="none" strokeWidth="7" className={k.bezel} />
        {/* Rings at a third and two thirds of full scale, and full scale */}
        {[1 / 3, 2 / 3, 1].map((f) => (
          <circle key={f} cx={C} cy={C} r={R * f} fill="none" strokeWidth={f === 1 ? 1.2 : 1} className={k.ring} />
        ))}
        {/* Crosshair */}
        <line x1={C - R} y1={C} x2={C + R} y2={C} strokeWidth="1.4" className={k.cross} />
        <line x1={C} y1={C - R} x2={C} y2={C + R} strokeWidth="1.4" className={k.cross} />

        {/* Peak envelope, dotted */}
        {trace && (
          <polygon
            points={trace}
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="0.1 4.2"
            className={k.trace}
          />
        )}

        {/* Live dot */}
        {dot && <circle cx={dot.x} cy={dot.y} r="6.5" className={k.dot} />}
        {!dot && <circle cx={C} cy={C} r="3" className={cn(k.dot, "opacity-60")} />}

        {/* Peak figures on each axis */}
        <text x={C} y={C - R - 24} textAnchor="middle" className={cn(k.text, "font-mono")} fontSize="22" fontWeight="600">{fmt(max.brake)}</text>
        <text x={C} y={C + R + 40} textAnchor="middle" className={cn(k.text, "font-mono")} fontSize="22" fontWeight="600">{fmt(max.accel)}</text>
        <text x={C - R - 18} y={C + 8} textAnchor="end" className={cn(k.text, "font-mono")} fontSize="22" fontWeight="600">{fmt(max.left)}</text>
        <text x={C + R + 18} y={C + 8} textAnchor="start" className={cn(k.text, "font-mono")} fontSize="22" fontWeight="600">{fmt(max.right)}</text>

        {/* Axis names, on the diagonals like the reference meters */}
        <text x={C - 66} y={C - 66} textAnchor="middle" transform={`rotate(-45 ${C - 66} ${C - 66})`} className={k.caption} fontSize="11" fontWeight="600" letterSpacing="1">{tr("LEFT")}</text>
        <text x={C + 66} y={C - 66} textAnchor="middle" transform={`rotate(45 ${C + 66} ${C - 66})`} className={k.caption} fontSize="11" fontWeight="600" letterSpacing="1">{tr("RIGHT")}</text>
        {/* Braking / acceleration captions beside their figures (braking plots up) */}
        <text x={C - 30} y={C - R - 29} textAnchor="end" className={k.accentCaption} fontSize="11" fontWeight="600" letterSpacing="1">{tr("BRAKE")}</text>
        <text x={C - 30} y={C + R + 35} textAnchor="end" className={k.caption} fontSize="11" fontWeight="600" letterSpacing="1">{tr("ACCEL")}</text>

        {/* Full-scale box */}
        <rect x={C + R + 4} y={C + R + 18} width="44" height="20" rx="2" fill="none" strokeWidth="1.2" className={k.cross} />
        <text x={C + R + 26} y={C + R + 33} textAnchor="middle" className={cn(k.text, "font-mono")} fontSize="13">{`${scale.toFixed(1)}G`}</text>
      </svg>
    </div>
  );
});
