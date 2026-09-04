export interface ConvoyDestination {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface ConvoyWaypoint {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  orderIndex: number;
  isCompleted: boolean;
  completedAt?: string;
}

// Bare coordinates for a route stop - the only shape sent over the
// waypoints-updated Realtime broadcast, so members can redraw the route line
// without waiting on a DB round trip or ever shipping route geometry on the wire.
export interface RouteStop {
  lat: number;
  lng: number;
}

export interface ConvoyState {
  id: string | null;
  code: string | null;
  isLeader: boolean;
  members: ConvoyMemberInfo[];
  isActive: boolean;
  isRestoring: boolean;
  destination: ConvoyDestination | null;
  waypoints: ConvoyWaypoint[];
  isPaused: boolean;
  realtimeSuspended: boolean; // true while the Realtime channel is intentionally disconnected (e.g. inactivity guard)
}

export interface ConvoyMemberInfo {
  id: string;
  userId: string;
  name: string;
  isLeader: boolean;
  isReady: boolean;
  hasNavigated: boolean;
  joinedAt: string;
  accentColor?: string; // User's selected accent color
  // Live stats
  currentSpeed?: number;
  topSpeed?: number;
  distanceDriven?: number;
  stationaryTime?: number; // seconds at 0 speed
  currentLat?: number | null;
  currentLng?: number | null;
  maxLean?: number; // deepest lean angle this ride (degrees)
  maxGForce?: number; // peak total G magnitude this ride
  cornerScore?: number; // corner report score this ride (0-100)
}

export type BadgeType =
  | 'speed-demon'
  | 'journeyman'
  | 'lean-fiend'
  | 'g-lock'
  | 'corner-carver'
  | 'night-owl'
  | 'hard-ass'
  | 'always-out'
  | 'fallback';

export interface MemberBadge {
  type: BadgeType;
  label: string;
  emoji: string;
}

// Single source of truth for badge label/emoji/points, shared by
// calculateBadges (live convoy stats), the badge wallet economy and any place
// rendering a ride's already-earned BadgeType[] without a member roster
// (e.g. a historical receipt in Ride History).
export const BADGE_INFO: Record<
  BadgeType,
  { label: string; emoji: string; points: number; description: string }
> = {
  'speed-demon': { label: 'Speed Demon', emoji: '⚡', points: 1, description: 'Highest top speed' },
  journeyman: { label: 'Journeyman', emoji: '🛣️', points: 1, description: 'Most distance' },
  'lean-fiend': { label: 'Lean Fiend', emoji: '🏍️', points: 1, description: 'Deepest lean angle' },
  'g-lock': { label: 'G-Lock', emoji: '🌀', points: 1, description: 'Highest g-force' },
  'corner-carver': { label: 'Corner Carver', emoji: '🌊', points: 1, description: 'Best corner score' },
  'night-owl': { label: 'Night Owl', emoji: '🌙', points: 1, description: 'Rode after dark' },
  'hard-ass': { label: 'Hard Ass', emoji: '🪑', points: 1, description: '150+ mile ride' },
  'always-out': { label: 'Always Out', emoji: '📅', points: 1, description: '3 rides in a day' },
  fallback: { label: 'Fallback', emoji: '🪨', points: -1, description: 'Longest stationary' },
};

/** Display / sort order for badges across the app. */
export const BADGE_ORDER: BadgeType[] = [
  'speed-demon',
  'journeyman',
  'lean-fiend',
  'g-lock',
  'corner-carver',
  'night-owl',
  'hard-ass',
  'always-out',
  'fallback',
];

export function calculateBadges(members: ConvoyMemberInfo[]): Map<string, MemberBadge[]> {
  const badges = new Map<string, MemberBadge[]>();

  if (members.length === 0) return badges;

  // Initialize empty arrays for all members
  members.forEach(m => badges.set(m.userId, []));

  // Award a badge to whichever member has the highest value for a metric.
  // Metrics that no member reported (all zero/absent) award nothing.
  const awardMax = (type: BadgeType, pick: (m: ConvoyMemberInfo) => number) => {
    const winner = members.reduce((prev, curr) => (pick(curr) > pick(prev) ? curr : prev));
    if (pick(winner) > 0) {
      badges.get(winner.userId)?.push({ type, ...BADGE_INFO[type] });
    }
  };

  awardMax('speed-demon', m => m.topSpeed || 0);
  awardMax('journeyman', m => m.distanceDriven || 0);
  awardMax('lean-fiend', m => m.maxLean || 0);
  awardMax('g-lock', m => m.maxGForce || 0);
  awardMax('corner-carver', m => m.cornerScore || 0);
  awardMax('fallback', m => m.stationaryTime || 0);

  return badges;
}
