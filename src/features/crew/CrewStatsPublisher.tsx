import { useEffect, useRef } from 'react';
import { useRideHistory } from '@/features/ride';
import { useArcadeScores } from '@/features/arcade';
import { useProfile } from '@/features/profile';
import { useSettings } from '@/features/settings';
import { useDemoMode } from '@/lib/demoMode';
import { nudgePush } from '@/features/notifications';
import { useCrew } from './useCrew';
import { crewTotals, publishCrewTotals, publishWeekStats, weekStats } from './stats';

const PUBLISHED_KEY = 'bt.crew.published_ride.v1';

/**
 * After every ride (with Blacktop World on), publishes the rider's crew-board
 * totals and this week's challenge stats — the same rows the crew screens
 * publish — so crew mates can be notified when they're passed or a challenge
 * is decided without anyone having to open those screens first.
 */
export function CrewStatsPublisher() {
  const { rides, burnedTotals } = useRideHistory();
  const { scores } = useArcadeScores();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const { enabled: demo } = useDemoMode();
  const crew = useCrew();

  const latest = useRef({ rides, burnedTotals, scores });
  latest.current = { rides, burnedTotals, scores };
  const latestRideId = rides[0]?.id ?? null;

  useEffect(() => {
    if (demo || !settings.blacktopWorldEnabled || !latestRideId) return;
    let published: string | null = null;
    try {
      published = localStorage.getItem(PUBLISHED_KEY);
    } catch {
      /* treat as unpublished */
    }
    if (published === `${crew.code}:${latestRideId}`) return;

    let cancelled = false;
    (async () => {
      const { rides: r, burnedTotals: b, scores: s } = latest.current;
      const name = profile.name || 'Rider';
      const [a, w] = await Promise.all([
        publishCrewTotals(crew.code, name, crewTotals(r, b, s)),
        publishWeekStats(crew.code, name, weekStats(r)),
      ]);
      if (cancelled || !(a && w)) return;
      try {
        localStorage.setItem(PUBLISHED_KEY, `${crew.code}:${latestRideId}`);
      } catch {
        /* publishes again next time: harmless */
      }
      nudgePush();
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, settings.blacktopWorldEnabled, latestRideId, crew.code, profile.name]);

  return null;
}
