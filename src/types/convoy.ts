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

export interface ConvoyState {
  id: string | null;
  code: string | null;
  isLeader: boolean;
  members: ConvoyMemberInfo[];
  isActive: boolean;
  destination: ConvoyDestination | null;
  waypoints: ConvoyWaypoint[];
  isPaused: boolean;
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
}

export type BadgeType = 'speed-demon' | 'journeyman' | 'rocksteady';

export interface MemberBadge {
  type: BadgeType;
  label: string;
  emoji: string;
}

export function calculateBadges(members: ConvoyMemberInfo[]): Map<string, MemberBadge[]> {
  const badges = new Map<string, MemberBadge[]>();
  
  if (members.length === 0) return badges;

  // Initialize empty arrays for all members
  members.forEach(m => badges.set(m.userId, []));

  // Speed Demon - highest top speed
  const speedDemon = members.reduce((prev, curr) => 
    (curr.topSpeed || 0) > (prev.topSpeed || 0) ? curr : prev
  );
  if ((speedDemon.topSpeed || 0) > 0) {
    badges.get(speedDemon.userId)?.push({ 
      type: 'speed-demon', 
      label: 'Speed Demon', 
      emoji: '⚡' 
    });
  }

  // Journeyman - most distance covered
  const journeyman = members.reduce((prev, curr) => 
    (curr.distanceDriven || 0) > (prev.distanceDriven || 0) ? curr : prev
  );
  if ((journeyman.distanceDriven || 0) > 0) {
    badges.get(journeyman.userId)?.push({ 
      type: 'journeyman', 
      label: 'Journeyman', 
      emoji: '🛣️' 
    });
  }

  // Rocksteady - longest time at 0 speed
  const rocksteady = members.reduce((prev, curr) => 
    (curr.stationaryTime || 0) > (prev.stationaryTime || 0) ? curr : prev
  );
  if ((rocksteady.stationaryTime || 0) > 0) {
    badges.get(rocksteady.userId)?.push({ 
      type: 'rocksteady', 
      label: 'Rocksteady', 
      emoji: '🪨' 
    });
  }

  return badges;
}
