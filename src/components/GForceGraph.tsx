import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { buildGForcePoints, pointsToAreaPath, pointsToLinePath } from '@/lib/gForceGraph';
import { GForceSample } from '@/types/blacktop';

interface GForceGraphProps {
  samples: GForceSample[];
  className?: string;
  width?: number;
  height?: number;
  /** CSS color value for the trace, e.g. 'hsl(var(--accent))' or 'var(--ink)'. */
  color?: string;
}

/**
 * Low-opacity line+area trace of G-force over a ride. Meant to sit as a
 * subtle background layer (e.g. behind the receipt's vehicle photo) rather
 * than as a standalone readable chart - see GForceGauge for the live value.
 */
export function GForceGraph({ samples, className, width = 320, height = 80, color = 'hsl(var(--accent))' }: GForceGraphProps) {
  const points = useMemo(
    () => buildGForcePoints(samples.map((s) => s.g), width, height),
    [samples, width, height],
  );

  if (points.length === 0) return null;

  const linePath = pointsToLinePath(points);
  const areaPath = pointsToAreaPath(points, height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full h-auto', className)}
      aria-hidden
    >
      <path d={areaPath} fill={color} fillOpacity={0.08} stroke="none" />
      <path d={linePath} stroke={color} strokeOpacity={0.3} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
