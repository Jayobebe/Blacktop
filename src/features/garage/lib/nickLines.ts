import { Bike } from '../types';
import { BikeStats } from '../hooks/useBikeStats';

import { tr, lowerName } from '@/lib/i18n';
/**
 * Builds Mecha-Nick's dialogue from the actual state of the garage.
 * Only lines that are true for the current bike/stats are returned, so he
 * never congratulates you on numbers you haven't ridden.
 */
export interface NickContext {
  /** Main vehicle kind — changes the shop talk ("saddle" vs "wheel", chain vs oil). */
  vehicle: 'motorcycle' | 'car' | 'bicycle' | 'ebike' | 'escooter';
  /** Rider's setup answers: Nick only mentions numbers they said they care about. */
  speed: boolean;
  lean: boolean;
  g: boolean;
  ride: string;
  rides: string;
}

const DEFAULT_CONTEXT: NickContext = { vehicle: 'motorcycle', speed: true, lean: true, g: true, ride: tr("ride"), rides: tr("rides") };

const UPKEEP_LINE: Record<NickContext['vehicle'], string> = {
  motorcycle: tr("Chain lube and tyre pressure. Every week. No excuses."),
  bicycle: tr("Clean chain, pumped tyres. Every week. No excuses."),
  ebike: tr("Charge it, lube the chain, check the tyres. No excuses."),
  escooter: tr("Tyre pressure and a bolt check. Every week. No excuses."),
  car: tr("Tyre pressures and oil level. Every month. No excuses."),
};

export function buildNickLines(bike: Bike | null, stats: BikeStats, ctx: NickContext = DEFAULT_CONTEXT): string[] {
  if (!bike) {
    return [
      tr("Garage is empty, partner. Roll something in."),
      tr("Add a vehicle and I'll start keeping the log."),
      tr("Nothing to fix, no work for me. Sort it out."),
    ];
  }

  const lines: string[] = [];
  const name = bike.name;
  const km = Math.round(stats.totalDistanceKm);
  const odo = Math.round(stats.odometerKm);
  const hours = stats.totalDurationSec / 3600;

  // Maintenance first — these matter most.
  const overdue = bike.maintenance.filter(
    (m) => stats.odometerKm >= m.lastServiceKm + m.intervalKm,
  );
  overdue.forEach((m) =>
    lines.push(tr("Your {0} is overdue. Don't make me ask twice.", [lowerName(m.name)])),
  );

  const soon = bike.maintenance
    .map((m) => ({ m, dueIn: m.lastServiceKm + m.intervalKm - stats.odometerKm }))
    .filter((x) => x.dueIn > 0 && x.dueIn <= 200)
    .sort((a, b) => a.dueIn - b.dueIn);
  soon.slice(0, 2).forEach(({ m, dueIn }) =>
    lines.push(tr("{0} due in about {1} km. Plan for it.", [m.name, Math.round(dueIn)])),
  );

  if (bike.maintenance.length === 0) {
    lines.push(tr("No service items logged yet. Add some so I can nag properly."));
  }

  // Zero-ride state.
  if (stats.totalRides === 0) {
    lines.push(tr("{0}'s clean sheet — no {1} logged yet.", [name, ctx.rides]));
    lines.push(tr("Nothing on the clock. Take her out and I'll do the maths."));
    lines.push(tr("Tyres go square sitting still, you know."));
    return lines;
  }

  // Ride milestones.
  if (stats.totalRides === 1) lines.push(tr("One {0} in the books. Good start.", [ctx.ride]));
  else lines.push(tr("{0} {1} logged on {2}.", [stats.totalRides, ctx.rides, name]));

  if (km > 0) lines.push(tr("That's {0} km through my workshop door.", [km]));
  if (odo > 0) lines.push(tr("Odometer reads about {0} km. She's earning her keep.", [odo]));
  if (hours >= 1) lines.push(
      ctx.vehicle === 'car'
        ? tr("{0} hours behind the wheel. Stretch your back.", [Math.round(hours)])
        : tr("{0} hours in the saddle. Stretch your back.", [Math.round(hours)]),
    );

  if (ctx.speed && stats.topSpeedMph > 0) {
    lines.push(
      stats.topSpeedMph > 100
        ? tr("Top speed of {0} mph. Brakes need checking then.", [Math.round(stats.topSpeedMph)])
        : tr("Best you've seen is {0} mph. Steady.", [Math.round(stats.topSpeedMph)]),
    );
  }
  const lean = Math.max(stats.maxLeanLeft, stats.maxLeanRight);
  if (ctx.lean && lean > 5) {
    lines.push(
      lean > 40
        ? tr("{0} degrees of lean. Check your chicken strips — there aren't any.", [Math.round(lean)])
        : tr("{0} degrees max lean. Room to lean more, carefully.", [Math.round(lean)]),
    );
  }
  if (ctx.g && stats.maxGForce > 0.5) {
    lines.push(tr("{0}g peak. Someone's been grabbing brake.", [stats.maxGForce.toFixed(1)]));
  }
  if (stats.longestRideMi > 0) {
    lines.push(tr("Longest run: {0} km in one go.", [Math.round(stats.longestRideMi * 1.60934)]));
  }

  lines.push(UPKEEP_LINE[ctx.vehicle]);
  return lines;
}
