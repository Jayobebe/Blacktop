import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Car,
  CarFront,
  CircleDashed,
  CloudFog,
  CloudRain,
  Construction,
  Droplets,
  Eye,
  Grip,
  Leaf,
  Package,
  PawPrint,
  Route,
  Snowflake,
  Timer,
  TrafficCone,
  TriangleAlert,
  Waves,
  Wrench,
} from 'lucide-react';

/**
 * What riders can report. Lifetimes mirror public.hazard_ttl() in
 * supabase/migrations/20261001090000_hazards.sql: keep them in sync.
 * "Hi-vis" is the police report: never called that anywhere in the app.
 */
export type HazardKind =
  | 'pothole' | 'debris' | 'oil' | 'gravel'
  | 'flooding' | 'ice' | 'mud' | 'fog'
  | 'crash' | 'breakdown' | 'roadworks' | 'closed' | 'standstill'
  | 'hivis' | 'animal' | 'jam' | 'other';

export type HazardCategoryId = 'surface' | 'conditions' | 'traffic' | 'other';

export interface HazardType {
  kind: HazardKind;
  category: HazardCategoryId;
  label: string;
  /** How it's said in a spoken warning ("Oil on road ahead, 300 metres"). */
  spoken: string;
  icon: LucideIcon;
  /** Unconfirmed lifetime, minutes (server is authoritative). */
  ttlMinutes: number;
}

export interface HazardCategory {
  id: HazardCategoryId;
  label: string;
  color: string;
  icon: LucideIcon;
}

export const HAZARD_CATEGORIES: HazardCategory[] = [
  { id: 'surface', label: 'Road surface', color: '#f59e0b', icon: Route },
  { id: 'conditions', label: 'Conditions', color: '#38bdf8', icon: CloudRain },
  { id: 'traffic', label: 'Traffic', color: '#ef4444', icon: TrafficCone },
  { id: 'other', label: 'Other', color: '#a78bfa', icon: TriangleAlert },
];

const H = 60;
const D = 24 * H;

export const HAZARD_TYPES: HazardType[] = [
  { kind: 'pothole', category: 'surface', label: 'Pothole', spoken: 'Pothole', icon: CircleDashed, ttlMinutes: 30 * D },
  { kind: 'debris', category: 'surface', label: 'Debris on road', spoken: 'Debris on the road', icon: Package, ttlMinutes: 2 * H },
  { kind: 'oil', category: 'surface', label: 'Oil / diesel spill', spoken: 'Oil on the road', icon: Droplets, ttlMinutes: 6 * H },
  { kind: 'gravel', category: 'surface', label: 'Gravel / loose chippings', spoken: 'Loose gravel', icon: Grip, ttlMinutes: 7 * D },
  { kind: 'flooding', category: 'conditions', label: 'Flooding / standing water', spoken: 'Flooding', icon: Waves, ttlMinutes: 12 * H },
  { kind: 'ice', category: 'conditions', label: 'Ice / frost', spoken: 'Ice', icon: Snowflake, ttlMinutes: 6 * H },
  { kind: 'mud', category: 'conditions', label: 'Mud / leaves', spoken: 'Mud on the road', icon: Leaf, ttlMinutes: 2 * D },
  { kind: 'fog', category: 'conditions', label: 'Fog / low visibility', spoken: 'Fog', icon: CloudFog, ttlMinutes: 3 * H },
  { kind: 'crash', category: 'traffic', label: 'Crash', spoken: 'Crash', icon: CarFront, ttlMinutes: 2 * H },
  { kind: 'breakdown', category: 'traffic', label: 'Broken-down vehicle', spoken: 'Broken-down vehicle', icon: Wrench, ttlMinutes: 2 * H },
  { kind: 'roadworks', category: 'traffic', label: 'Roadworks', spoken: 'Roadworks', icon: Construction, ttlMinutes: 7 * D },
  { kind: 'closed', category: 'traffic', label: 'Road closed', spoken: 'Road closed', icon: Ban, ttlMinutes: 24 * H },
  { kind: 'standstill', category: 'traffic', label: 'Heavy traffic (standstill)', spoken: 'Standstill traffic', icon: Timer, ttlMinutes: 20 },
  { kind: 'hivis', category: 'other', label: 'Hi-vis', spoken: 'Hi-vis', icon: Eye, ttlMinutes: H },
  { kind: 'animal', category: 'other', label: 'Animal on road', spoken: 'Animal on the road', icon: PawPrint, ttlMinutes: 30 },
  { kind: 'jam', category: 'other', label: 'Traffic jam', spoken: 'Traffic jam', icon: Car, ttlMinutes: 45 },
  { kind: 'other', category: 'other', label: 'Other hazard', spoken: 'Hazard', icon: TriangleAlert, ttlMinutes: 2 * H },
];

export const HAZARD_BY_KIND = Object.fromEntries(HAZARD_TYPES.map((t) => [t.kind, t])) as Record<HazardKind, HazardType>;
export const CATEGORY_BY_ID = Object.fromEntries(HAZARD_CATEGORIES.map((c) => [c.id, c])) as Record<HazardCategoryId, HazardCategory>;
export const hazardColor = (kind: HazardKind) => CATEGORY_BY_ID[HAZARD_BY_KIND[kind]?.category ?? 'other'].color;

/** A live report, as the server returns it (anonymous: `mine` is all you learn about the reporter). */
export interface Hazard {
  id: string;
  kind: HazardKind;
  lat: number;
  lng: number;
  /** Reporter's direction of travel, degrees, when known. */
  heading: number | null;
  createdAt: number;
  expiresAt: number;
  confirmations: number;
  denials: number;
  mine: boolean;
  /** This rider's "still there?" answer, if they gave one. */
  myVote: boolean | null;
}
