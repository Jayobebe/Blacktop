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
import { tr } from '@/lib/i18n';

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
  { id: 'surface', label: tr("Road surface"), color: '#f59e0b', icon: Route },
  { id: 'conditions', label: tr("Conditions"), color: '#38bdf8', icon: CloudRain },
  { id: 'traffic', label: tr("Traffic"), color: '#ef4444', icon: TrafficCone },
  { id: 'other', label: tr("Other"), color: '#a78bfa', icon: TriangleAlert },
];

const H = 60;
const D = 24 * H;

export const HAZARD_TYPES: HazardType[] = [
  { kind: 'pothole', category: 'surface', label: tr("Pothole"), spoken: tr("Pothole"), icon: CircleDashed, ttlMinutes: 30 * D },
  { kind: 'debris', category: 'surface', label: tr("Debris on road"), spoken: tr("Debris on the road"), icon: Package, ttlMinutes: 2 * H },
  { kind: 'oil', category: 'surface', label: tr("Oil / diesel spill"), spoken: tr("Oil on the road"), icon: Droplets, ttlMinutes: 6 * H },
  { kind: 'gravel', category: 'surface', label: tr("Gravel / loose chippings"), spoken: tr("Loose gravel"), icon: Grip, ttlMinutes: 7 * D },
  { kind: 'flooding', category: 'conditions', label: tr("Flooding / standing water"), spoken: tr("Flooding"), icon: Waves, ttlMinutes: 12 * H },
  { kind: 'ice', category: 'conditions', label: tr("Ice / frost"), spoken: tr("Ice"), icon: Snowflake, ttlMinutes: 6 * H },
  { kind: 'mud', category: 'conditions', label: tr("Mud / leaves"), spoken: tr("Mud on the road"), icon: Leaf, ttlMinutes: 2 * D },
  { kind: 'fog', category: 'conditions', label: tr("Fog / low visibility"), spoken: tr("Fog"), icon: CloudFog, ttlMinutes: 3 * H },
  { kind: 'crash', category: 'traffic', label: tr("Crash"), spoken: tr("Crash"), icon: CarFront, ttlMinutes: 2 * H },
  { kind: 'breakdown', category: 'traffic', label: tr("Broken-down vehicle"), spoken: tr("Broken-down vehicle"), icon: Wrench, ttlMinutes: 2 * H },
  { kind: 'roadworks', category: 'traffic', label: tr("Roadworks"), spoken: tr("Roadworks"), icon: Construction, ttlMinutes: 7 * D },
  { kind: 'closed', category: 'traffic', label: tr("Road closed"), spoken: tr("Road closed"), icon: Ban, ttlMinutes: 24 * H },
  { kind: 'standstill', category: 'traffic', label: tr("Heavy traffic (standstill)"), spoken: tr("Standstill traffic"), icon: Timer, ttlMinutes: 20 },
  { kind: 'hivis', category: 'other', label: tr("Hi-vis"), spoken: tr("Hi-vis"), icon: Eye, ttlMinutes: H },
  { kind: 'animal', category: 'other', label: tr("Animal on road"), spoken: tr("Animal on the road"), icon: PawPrint, ttlMinutes: 30 },
  { kind: 'jam', category: 'other', label: tr("Traffic jam"), spoken: tr("Traffic jam"), icon: Car, ttlMinutes: 45 },
  { kind: 'other', category: 'other', label: tr("Other hazard"), spoken: tr("Hazard"), icon: TriangleAlert, ttlMinutes: 2 * H },
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
