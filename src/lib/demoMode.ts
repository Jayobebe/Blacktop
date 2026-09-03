import { useSyncExternalStore } from 'react';
import type { RideSession, RideStats } from '@/types/blacktop';
import type { ArcadeScores } from '@/features/arcade/types';
import type { Bike } from '@/features/garage/types';
import type { SharedCardPayload } from '@/features/cards/lib/cardCodec';
import demoBikeAsset from '@/assets/demo-bike.png.asset.json';

/** Local mirror of CollectedCard so demoMode stays leaf-level (no cycle). */
type CollectedCard = SharedCardPayload & { collectedAt: number; key: string };

/**
 * Demo-mode store. When enabled, read-only overrides are surfaced for:
 *  - profile name
 *  - ride stats
 *  - arcade high scores
 *  - "active riders" count on the World globe (fluctuates 12-47)
 *
 * Real user data is never written or overwritten — toggling off restores
 * personal data exactly as it was.
 */

const LS_KEY = 'blacktop_demo_mode';

export const DEMO_NAME = 'Demo Rider';

export const DEMO_STATS: RideStats = {
  totalRides: 47,
  totalDistance: 1234, // miles
  totalDuration: 89 * 3600 + 12 * 60, // ~89h 12m
  personalTopSpeed: 142,
  personalMaxGForce: 1.6,
  averageRideLength: 1234 / 47,
  convoyRides: 18,
  badges: { speedDemon: 12, journeyman: 9, fallback: 4 },
};

/**
 * Deterministically build 47 demo rides whose aggregate stats match DEMO_STATS:
 *   47 rides | 1234 mi | 89h12m | 18 convoy | top 142 mph | max 1.6 G
 *   badges: 12 speed-demon, 9 journeyman, 4 fallback
 *
 * No GPS / lean / G samples — RideDetail tolerates empty arrays.
 */
function buildDemoRides(): RideSession[] {
  const COUNT = 47;
  const TARGET_DISTANCE = 1234;
  const TARGET_DURATION = 89 * 3600 + 12 * 60;
  const TOP_SPEED = 142;
  const TOP_G = 1.6;

  // 18 convoy rides spaced evenly across the 47.
  const convoySet = new Set<number>();
  for (let i = 0; i < 18; i++) convoySet.add(Math.floor((i * COUNT) / 18));
  const convoyIndices = [...convoySet].sort((a, b) => a - b);

  // Distribute 25 badge instances across the 18 convoy rides.
  const badgePool: ('speed-demon' | 'journeyman' | 'fallback')[] = [
    ...Array(12).fill('speed-demon'),
    ...Array(9).fill('journeyman'),
    ...Array(4).fill('fallback'),
  ];
  const ridesBadges: Record<number, ('speed-demon' | 'journeyman' | 'fallback')[]> = {};
  badgePool.forEach((badge, i) => {
    const rideIdx = convoyIndices[i % convoyIndices.length];
    (ridesBadges[rideIdx] ||= []).push(badge);
  });

  // Sinusoidal raw distances → scale to exact total.
  const raw: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    raw.push(26 + 18 * Math.sin(i * 0.7) + 6 * Math.cos(i * 1.3));
  }
  const lifted = raw.map(v => v - Math.min(...raw) + 6);
  const liftedSum = lifted.reduce((s, v) => s + v, 0);
  const distances = lifted.map(v => (v / liftedSum) * TARGET_DISTANCE);

  // Durations via varying avg speed; scale to exact total.
  const rawDur = distances.map((d, i) => {
    const avg = 18 + 14 * ((Math.sin(i * 0.9) + 1) / 2);
    return (d / avg) * 3600;
  });
  const durSum = rawDur.reduce((s, v) => s + v, 0);
  const durations = rawDur.map(v => (v / durSum) * TARGET_DURATION);

  const now = Date.now();
  const DAY = 86_400_000;
  const rides: RideSession[] = [];
  for (let i = 0; i < COUNT; i++) {
    const distance = Math.round(distances[i] * 10) / 10;
    const duration = Math.round(durations[i]);
    const averageSpeed = Math.round((distance / (duration / 3600)) * 10) / 10;
    const maxSpeed = i === 0 ? TOP_SPEED : Math.min(135, Math.round(averageSpeed * 1.9 + 10));
    const maxGForce = i === 0 ? TOP_G : Math.round((0.8 + 0.4 * Math.abs(Math.sin(i))) * 100) / 100;
    const startedAt = new Date(now - (i + 1) * (DAY * 0.95)).toISOString();
    const endedAt = new Date(new Date(startedAt).getTime() + duration * 1000).toISOString();
    const isConvoyRide = convoySet.has(i);
    rides.push({
      id: `demo-ride-${i.toString().padStart(2, '0')}`,
      startedAt,
      endedAt,
      isConvoyRide,
      distance,
      duration,
      averageSpeed,
      maxSpeed,
      maxLeanLeft: Math.round(20 + 25 * Math.abs(Math.sin(i * 1.1))),
      maxLeanRight: Math.round(20 + 25 * Math.abs(Math.cos(i * 1.1))),
      maxGForce,
      gpsPoints: [],
      earnedBadges: isConvoyRide ? ridesBadges[i] : undefined,
    });
  }
  return rides;
}

export const DEMO_RIDES: RideSession[] = buildDemoRides();



// Demo bike — pixel-art Streetfighter image (background removed).
const DEMO_BIKE_HERO = demoBikeAsset.url;

export const DEMO_BIKE_ID = 'demo-bike-01';

export const DEMO_BIKE: Bike = {
  id: DEMO_BIKE_ID,
  name: 'V4 Ducati',
  makeModel: 'Ducati Streetfighter V4',
  createdAt: Date.now() - 365 * 86_400_000,
  photos: { hero: DEMO_BIKE_HERO },
  baseOdometerKm: 4200,
  maintenance: [
    { id: 'demo-m-1', name: 'Chain lube', intervalKm: 500, lastServiceKm: 4800 },
    { id: 'demo-m-2', name: 'Engine oil', intervalKm: 5000, lastServiceKm: 4200 },
    { id: 'demo-m-3', name: 'Tyres', intervalKm: 8000, lastServiceKm: 4200 },
  ],
};

// Tag every demo ride against the demo bike so Garage / VehicleCards roll up.
DEMO_RIDES.forEach((r) => { r.bikeId = DEMO_BIKE_ID; });

export const DEMO_COLLECTED_CARDS: CollectedCard[] = [
  {
    v: 1,
    i: 'demo-card-01',
    n: 'Rico\u2019s Panigale',
    m: 'Ducati Panigale V4',
    o: 'Rico',
    t: 'gold',
    tl: 'Gold',
    s: { totalRides: 84, totalDistanceMi: 2410, totalDurationSec: 612000, topSpeedMph: 168, maxLean: 52, maxGForce: 1.4 },
    ts: Date.now() - 9 * 86_400_000,
    key: 'demo-card-01::Rico::Rico\u2019s Panigale',
    collectedAt: Date.now() - 9 * 86_400_000,
  },
  {
    v: 1,
    i: 'demo-card-02',
    n: 'Marlowe\u2019s R1',
    m: 'Yamaha YZF-R1',
    o: 'Marlowe',
    t: 'silver',
    tl: 'Silver',
    s: { totalRides: 31, totalDistanceMi: 980, totalDurationSec: 248000, topSpeedMph: 154, maxLean: 47, maxGForce: 1.2 },
    ts: Date.now() - 21 * 86_400_000,
    key: 'demo-card-02::Marlowe::Marlowe\u2019s R1',
    collectedAt: Date.now() - 21 * 86_400_000,
  },
  {
    v: 1,
    i: 'demo-card-03',
    n: 'Jules\u2019 Speed Triple',
    m: 'Triumph Speed Triple 1200 RS',
    o: 'Jules',
    t: 'diamond',
    tl: 'Diamond',
    s: { totalRides: 212, totalDistanceMi: 6840, totalDurationSec: 1620000, topSpeedMph: 178, maxLean: 55, maxGForce: 1.7 },
    ts: Date.now() - 3 * 86_400_000,
    key: 'demo-card-03::Jules::Jules\u2019 Speed Triple',
    collectedAt: Date.now() - 3 * 86_400_000,
  },
  {
    v: 1,
    i: 'demo-card-04',
    n: 'Nora\u2019s SV650',
    m: 'Suzuki SV650',
    o: 'Nora',
    t: 'bronze',
    tl: 'Bronze',
    s: { totalRides: 14, totalDistanceMi: 320, totalDurationSec: 96000, topSpeedMph: 121, maxLean: 38, maxGForce: 1.0 },
    ts: Date.now() - 40 * 86_400_000,
    key: 'demo-card-04::Nora::Nora\u2019s SV650',
    collectedAt: Date.now() - 40 * 86_400_000,
  },
];

export const DEMO_SCORES: ArcadeScores = {
  'hit-heavy': 14,    // peak Gs
  'petrol-head': 83,  // seconds survived
};

const ACTIVE_MIN = 12;
const ACTIVE_MAX = 47; // strictly < 50

function randomActive(prev: number): number {
  // Very slow random walk — at most ±1 per tick, clamped inside bounds.
  const delta = Math.random() < 0.5 ? -1 : 1;
  let next = prev + delta;
  if (next < ACTIVE_MIN) next = ACTIVE_MIN + 1;
  if (next > ACTIVE_MAX) next = ACTIVE_MAX - 1;
  return next;
}

/**
 * ISO 3166-1 numeric country codes used by world-atlas/countries-110m.
 * Demo-mode glow weights (higher = brighter). Slightly varied so the
 * map feels alive without strobing.
 */
export const DEMO_COUNTRY_LIGHTS: Record<number, number> = {
  840: 14, // United States
  826: 9,  // United Kingdom
  380: 7,  // Italy
  764: 5,  // Thailand
  156: 11, // China
};

interface DemoState {
  enabled: boolean;
  activeRiders: number;
}

let state: DemoState = {
  enabled: (() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  })(),
  activeRiders: 24,
};

const listeners = new Set<() => void>();
let tickHandle: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const l of listeners) l();
}

function startTicker() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    // ~40% chance to actually move each tick — keeps the count drifting
    // very slowly (a step every ~30-50s on average).
    if (Math.random() > 0.4) return;
    state = { ...state, activeRiders: randomActive(state.activeRiders) };
    emit();
  }, 18000);
}

function stopTicker() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

if (state.enabled) startTicker();

export function setDemoMode(on: boolean) {
  if (state.enabled === on) return;
  state = { ...state, enabled: on };
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch {}
  if (on) startTicker(); else stopTicker();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return state;
}

export function useDemoMode() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return s;
}

/** Non-reactive read for callers that don't need to re-render on toggle. */
export function isDemoModeActive(): boolean {
  return state.enabled;
}
