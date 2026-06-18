import { useSettings } from '@/features/settings';
import { formatDistance, formatDuration, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';
import { BikeStats } from '../hooks/useBikeStats';

interface Props {
  stats: BikeStats;
  baseOdometerKm: number;
}

const KM_TO_MI = 1 / 1.60934;

export function StatsPanel({ stats, baseOdometerKm }: Props) {
  const { settings } = useSettings();
  const odoMi = stats.odometerKm * KM_TO_MI;

  const items = [
    {
      label: 'On this bike',
      value: formatDistance(stats.totalDistanceMi, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      label: 'Top Speed',
      value: formatSpeed(stats.topSpeedMph, settings.speedUnit),
      unit: getSpeedLabel(settings.speedUnit),
    },
    {
      label: 'Max Lean',
      value: Math.round(Math.max(stats.maxLeanLeft, stats.maxLeanRight)),
      unit: '°',
    },
    { label: 'Rides', value: stats.totalRides, unit: null },
    { label: 'Time', value: formatDuration(stats.totalDurationSec), unit: null },
    {
      label: 'Longest ride',
      value: formatDistance(stats.longestRideMi, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
    },
    {
      label: 'Bought at',
      value: formatDistance(baseOdometerKm * KM_TO_MI, settings.distanceUnit),
      unit: getDistanceLabel(settings.distanceUnit),
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
