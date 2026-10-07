import { Anchor, Armchair, Bike, CalendarDays, Gauge, Moon, Orbit, Route, Spline, type LucideIcon } from 'lucide-react';
import type { BadgeType } from '@/types/convoy';

/**
 * Each badge's icon, in the app's own line style: the badge wallet, ride
 * receipts and the demo ride all draw from here. (The emoji in BADGE_INFO are
 * only what older saved rides and share text still carry.)
 */
export const BADGE_ICON: Record<BadgeType, LucideIcon> = {
  'speed-demon': Gauge,
  journeyman: Route,
  'lean-fiend': Bike,
  'g-lock': Orbit,
  'corner-carver': Spline,
  'night-owl': Moon,
  'hard-ass': Armchair,
  'always-out': CalendarDays,
  fallback: Anchor,
};
