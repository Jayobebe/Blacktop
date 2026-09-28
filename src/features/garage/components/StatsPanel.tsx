import { useSettings } from '@/features/settings';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { BikeStats } from '../hooks/useBikeStats';
import { tr } from '@/lib/i18n';

interface Props {
  stats: BikeStats;
  baseOdometerKm: number;
}

export function StatsPanel({ stats, baseOdometerKm }: Props) {
  const { settings } = useSettings();

  const items = [
    {
      label: tr("On this vehicle"),
      value: formatDistance(stats.totalDistanceMi, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      label: tr("Top Speed"),
      value: formatSpeed(stats.topSpeedMph, settings.speedUnit),
      unit: getSpeedLabel(settings.speedUnit),
    },
    {
      label: tr("Max Lean"),
      value: Math.round(Math.max(stats.maxLeanLeft, stats.maxLeanRight)),
      unit: '°',
    },
    { label: tr("Rides"), value: stats.totalRides, unit: null },
    { label: tr("Time"), value: formatDuration(stats.totalDurationSec), unit: null },
    {
      label: tr("Max G"),
      value: stats.maxGForce > 0 ? stats.maxGForce.toFixed(1) : '—',
      unit: stats.maxGForce > 0 ? 'G' : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div key={it.label} className="bg-card/50 rounded-2xl p-3 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">{it.label}</p>
          <p className="text-lg font-mono font-bold tracking-tighter leading-tight">
            {it.value}
            {it.unit && <span className="text-xs text-muted-foreground/70 ml-0.5 font-normal">{it.unit}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
