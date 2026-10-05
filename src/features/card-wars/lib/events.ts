/**
 * Round events: now and then, once both cards are on the table and before the
 * category is drawn, something happens. The order is the server's (`cw_action`
 * logs an event as its index + 1). Plain data, so the scripts can run it.
 */
export const EVENTS = ['rain', 'tailwind', 'pitstop', 'redflag', 'oil', 'tyres', 'photo', 'safety', 'crowd', 'gremlin', 'rapture'] as const;
export type RoundEvent = (typeof EVENTS)[number];

/** About one round in six has an event; a rapture is far rarer (0.4% of rounds). */
export const EVENT_CHANCE = 1 / 6;
export const RAPTURE_CHANCE = 0.004;

export function rollEvent(random: () => number): RoundEvent | null {
  const r = random();
  if (r < RAPTURE_CHANCE) return 'rapture';
  if (r < EVENT_CHANCE) return EVENTS[Math.floor(random() * 10)];
  return null;
}

/** The server's number (1 to 11) as an event. */
export const eventAt = (n: number | null | undefined): RoundEvent | null => (typeof n === 'number' && n >= 1 && n <= EVENTS.length ? EVENTS[n - 1] : null);

export const EVENT_NUMBERS = {
  pitHeal: 15,
  tailwind: 15,
  crowd: 1.08,
  photoGap: 0.05,
  photoDamage: 10,
} as const;
