import { Bike } from '../types';
import { BikeStats } from '../hooks/useBikeStats';

/**
 * Builds Mecha-Nick's dialogue from the actual state of the garage.
 * Only lines that are true for the current bike/stats are returned, so he
 * never congratulates you on numbers you haven't ridden.
 */
export function buildNickLines(bike: Bike | null, stats: BikeStats): string[] {
  if (!bike) {
    return [
      'Garage is empty, partner. Roll something in.',
      'Add a vehicle and I\'ll start keeping the log.',
      'No bike, no work for me. Sort it out.',
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
    lines.push(`Your ${m.name.toLowerCase()} is overdue. Don't make me ask twice.`),
  );

  const soon = bike.maintenance
    .map((m) => ({ m, dueIn: m.lastServiceKm + m.intervalKm - stats.odometerKm }))
    .filter((x) => x.dueIn > 0 && x.dueIn <= 200)
    .sort((a, b) => a.dueIn - b.dueIn);
  soon.slice(0, 2).forEach(({ m, dueIn }) =>
    lines.push(`${m.name} due in about ${Math.round(dueIn)} km. Plan for it.`),
  );

  if (bike.maintenance.length === 0) {
    lines.push('No service items logged yet. Add some so I can nag properly.');
  }

  // Zero-ride state.
  if (stats.totalRides === 0) {
    lines.push(`${name}'s clean sheet — no rides logged yet.`);
    lines.push('Nothing on the clock. Take her out and I\'ll do the maths.');
    lines.push('Tyres go square sitting still, you know.');
    return lines;
  }

  // Ride milestones.
  if (stats.totalRides === 1) lines.push('One ride in the books. Good start.');
  else lines.push(`${stats.totalRides} rides logged on ${name}.`);

  if (km > 0) lines.push(`That's ${km} km through my workshop door.`);
  if (odo > 0) lines.push(`Odometer reads about ${odo} km. She's earning her keep.`);
  if (hours >= 1) lines.push(`${Math.round(hours)} hours in the saddle. Stretch your back.`);

  if (stats.topSpeedMph > 0) {
    lines.push(
      stats.topSpeedMph > 100
        ? `Top speed of ${Math.round(stats.topSpeedMph)} mph. Brakes need checking then.`
        : `Best you've seen is ${Math.round(stats.topSpeedMph)} mph. Steady.`,
    );
  }
  const lean = Math.max(stats.maxLeanLeft, stats.maxLeanRight);
  if (lean > 5) {
    lines.push(
      lean > 40
        ? `${Math.round(lean)} degrees of lean. Check your chicken strips — there aren't any.`
        : `${Math.round(lean)} degrees max lean. Room to lean more, carefully.`,
    );
  }
  if (stats.maxGForce > 0.5) {
    lines.push(`${stats.maxGForce.toFixed(1)}g peak. Someone's been grabbing brake.`);
  }
  if (stats.longestRideMi > 0) {
    lines.push(`Longest run: ${Math.round(stats.longestRideMi * 1.60934)} km in one go.`);
  }

  lines.push('Chain lube and tyre pressure. Every week. No excuses.');
  return lines;
}
