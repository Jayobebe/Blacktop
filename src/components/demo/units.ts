import { tr } from '@/lib/i18n';
import { useSettings } from '@/features/settings';
import { useProfile } from '@/features/profile';
import { formatDistance, formatSpeed, getDistanceLabel, getSpeedLabel } from '@/lib/format';

/** The rider's units, for any speed or distance a scene shows. */
export function useSceneUnits() {
  const { settings } = useSettings();
  const km = settings.distanceUnit === 'km';
  return {
    speed: (mph: number) => formatSpeed(mph, settings.speedUnit),
    speedLabel: getSpeedLabel(settings.speedUnit),
    dist: (mi: number) => formatDistance(mi, settings.distanceUnit),
    distLabel: getDistanceLabel(settings.distanceUnit),
    /** A distance ahead as the turn banner shows it (`shortDistance`): feet or metres, then miles or km. */
    ahead: (ft: number) => {
      if (!km) return ft < 1000 ? tr("{0} ft", [Math.max(50, Math.round(ft / 50) * 50)]) : tr("{0} mi", [(ft / 5280).toFixed(1)]);
      const m = ft * 0.3048;
      const step = m < 300 ? 10 : 50;
      return m < 1000 ? tr("{0} m", [Math.max(10, Math.round(m / step) * step)]) : tr("{0} km", [(m / 1000).toFixed(1)]);
    },
    amber: settings.amberSpeedThreshold,
    red: settings.redSpeedThreshold,
  };
}

/**
 * The rider's own name, for the convoy they lead and the call they send in the
 * tour. Before setup (the tour opens from the welcome screen) there's none yet,
 * so a made-up rider stands in, like the crew around them.
 */
export function useRiderName(): string {
  const { profile } = useProfile();
  return profile.name?.trim() || 'Alex';
}

/** The letter on the rider's own pin: their initial, as the map shows it. */
export function useRiderLetter(): string {
  return useRiderName()[0].toUpperCase();
}
