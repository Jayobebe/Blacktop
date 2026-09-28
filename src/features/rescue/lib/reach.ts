import type { AppSettings } from '@/features/settings';

/**
 * Who a rescue call reaches, from Settings → Safety. Used by every way a
 * rescue is sent (the convoy rescue button, solo rescue, auto-rescue after a
 * crash) so they all follow the rider's choice.
 */
export interface RescueReach {
  /** The convoy you're riding with (their rescue card, map route and push). */
  convoy: boolean;
  /** Your crew, by push. */
  crew: boolean;
  /** Your Discord channel, when connected. */
  discord: boolean;
  /** Opted-in riders within this many km, by push (null = off). */
  nearbyKm: number | null;
}

export const RESCUE_RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;

export function rescueReach(s: Pick<AppSettings, 'rescueToConvoy' | 'rescueToCrew' | 'rescueToDiscord' | 'rescueToNearby' | 'rescueNearbyKm'>): RescueReach {
  return {
    convoy: s.rescueToConvoy !== false,
    crew: s.rescueToCrew !== false,
    discord: s.rescueToDiscord !== false,
    nearbyKm: s.rescueToNearby ? Math.min(50, Math.max(1, Number(s.rescueNearbyKm) || 10)) : null,
  };
}

/** "your convoy, your crew and riders within 10 km" */
export function describeReach(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? 'nobody';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
