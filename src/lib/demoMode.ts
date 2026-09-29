import { useSyncExternalStore } from 'react';
import type { RideSession, RideStats } from '@/types/blacktop';
import type { ArcadeScores } from '@/features/arcade/types';
import type { Bike } from '@/features/garage/types';
import type { SharedCardPayload } from '@/features/cards/lib/cardCodec';
import type { RideChallenge } from '@/lib/challengeRun';
import demoBikeAsset from '@/assets/demo-bike.png.asset.json';
import { demoTrackData } from '@/lib/demoTrack';
import { tr } from '@/lib/i18n';
import { ENVELOPE_BINS } from '@/lib/gForceVector';

/** Local mirrors of CollectedCard / SpectreCard so demoMode stays leaf-level (no cycle). */
type CollectedCard = SharedCardPayload & { collectedAt: number; key: string; img?: string };
type SpectreCard = {
  key: string;
  card: SharedCardPayload;
  img?: string;
  setterName: string;
  timeSec: number;
  targetSec: number;
  earnedAt: number;
};

/**
 * Demo-mode store. When enabled, read-only overrides are surfaced for:
 *  - profile name
 *  - ride stats
 *  - arcade high scores
 *  - garage (demo bike), ride history (incl. starred rides and time-attack
 *    receipts) and the card vault (collected + Spectre cards)
 *  - "active riders" count on the World globe (fluctuates 12-47)
 *  - a friction-circle G trace on every demo ride
 *  - hazard reports around wherever the map looks (hazardStore)
 *  - an Enterprise workspace in Home's deck (enterprise/useEnterprise)
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

/**
 * A plausible friction-circle trace for a demo ride: cornering G from the
 * ride's lean (tan of the lean angle, as the live meter does for bikes), hard
 * braking up top, softer drive out of corners below, with trail-braking
 * rounding the shape between them.
 */
function demoGTrace(i: number, leanLeft: number, leanRight: number) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const max = {
    left: r2(Math.tan((leanLeft * Math.PI) / 180)),
    right: r2(Math.tan((leanRight * Math.PI) / 180)),
    brake: r2(0.72 + 0.34 * Math.abs(Math.sin(i * 1.7))),
    accel: r2(0.36 + 0.2 * Math.abs(Math.cos(i * 0.9))),
  };
  const envelope = Array.from({ length: ENVELOPE_BINS }, (_, b) => {
    const th = (b / ENVELOPE_BINS) * Math.PI * 2; // 0 = braking (up), clockwise
    const lat = Math.sin(th) >= 0 ? max.right : max.left;
    const lon = Math.cos(th) >= 0 ? max.brake : max.accel;
    const p = 1.7;
    const r = 1 / Math.pow(Math.pow(Math.abs(Math.sin(th)) / lat, p) + Math.pow(Math.abs(Math.cos(th)) / lon, p), 1 / p);
    const jitter = 0.94 + 0.06 * Math.sin(b * 2.3 + i);
    return r2(r * jitter);
  });
  return { gEnvelope: envelope, gMax: max };
}

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
      ...demoGTrace(i, Math.round(20 + 25 * Math.abs(Math.sin(i * 1.1))), Math.round(20 + 25 * Math.abs(Math.cos(i * 1.1)))),
    });
  }
  // A Track Day session (prints on blue stock and opens the demo session).
  // Rides 0-3 carry the time attacks; 9 is a solo ride nothing else claims.
  const { session, receipt } = demoTrackData();
  const lapDistance = session.laps.reduce((a, l) => a + l.distance, 0) / 1609.344;
  const lapDuration = (session.endedAt - session.startedAt) / 1000;
  rides[9] = {
    ...rides[9],
    name: 'Track day',
    track: receipt,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    distance: Math.round(lapDistance * 10) / 10,
    duration: Math.round(lapDuration),
    averageSpeed: Math.round((lapDistance / (lapDuration / 3600)) * 10) / 10,
    maxSpeed: Math.round(Math.max(...session.laps.map((l) => l.maxSpeed)) * 2.23694),
  };
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
    // Odometer includes the previous keeper's logbook (~9,260 km), so services sit near it.
    { id: 'demo-m-1', name: 'Chain lube', intervalKm: 500, lastServiceKm: 9150 },
    { id: 'demo-m-2', name: 'Engine oil', intervalKm: 5000, lastServiceKm: 8000 },
    { id: 'demo-m-3', name: 'Tyres', intervalKm: 8000, lastServiceKm: 4200 },
  ],
};

/**
 * Card-challenge (time-attack) demo rides — a win that claimed the card, a
 * narrow loss and a route the demo rider set themselves. These drive the pink
 * time-attack receipt in ride history.
 */
function demoRoute(lat: number, lng: number, n = 24) {
  return Array.from({ length: n }, (_, i) => ({
    lat: lat + i * 0.0009 + Math.sin(i / 3) * 0.0004,
    lng: lng + i * 0.0012 + Math.cos(i / 4) * 0.0005,
  }));
}

const DEMO_CHALLENGES: RideChallenge[] = [
  {
    dropId: 'demo-drop-01',
    vehicleName: "Rico\u2019s Panigale",
    ownerName: 'Rico',
    tier: 'Gold',
    role: 'attempt',
    targetSec: 238,
    timeSec: 221,
    result: 'won',
    route: demoRoute(51.5074, -0.1278),
  },
  {
    dropId: 'demo-drop-02',
    vehicleName: "Marlowe\u2019s R1",
    ownerName: 'Marlowe',
    tier: 'Silver',
    role: 'attempt',
    targetSec: 184,
    timeSec: 199,
    result: 'lost',
    route: demoRoute(51.49, -0.09),
  },
  {
    dropId: 'demo-drop-03',
    vehicleName: 'V4 Ducati',
    ownerName: DEMO_NAME,
    tier: 'Gold',
    role: 'set',
    targetSec: null,
    timeSec: 305,
    route: demoRoute(51.46, -0.16),
  },
  {
    // Raced their own line again and beat it: own Spectre card, no badges.
    dropId: 'demo-drop-03',
    vehicleName: 'V4 Ducati',
    ownerName: DEMO_NAME,
    tier: 'Gold',
    role: 'attempt',
    targetSec: 305,
    timeSec: 297,
    result: 'won',
    route: demoRoute(51.46, -0.16),
    own: true,
  },
];

// Staple the challenges onto the three most recent demo rides.
DEMO_CHALLENGES.forEach((challenge, i) => {
  const ride = DEMO_RIDES[i];
  if (!ride) return;
  ride.challenge = challenge;
  ride.duration = Math.round(challenge.timeSec);
  // ~0.9 mi a minute (≈ 54 mph average) over a time-attack run.
  ride.distance = Math.round((challenge.timeSec / 60) * 0.9 * 10) / 10;
  ride.averageSpeed = Math.round((ride.distance / (ride.duration / 3600)) * 10) / 10;
  ride.maxSpeed = Math.max(ride.maxSpeed, Math.round(ride.averageSpeed * 1.6));
  ride.endedAt = new Date(new Date(ride.startedAt).getTime() + ride.duration * 1000).toISOString();
  ride.isConvoyRide = false;
  ride.earnedBadges = challenge.own
    ? undefined
    : challenge.result === 'won'
    ? ['speed-demon', 'speed-demon', 'speed-demon']
    : challenge.result === 'lost'
      ? ['fallback']
      : undefined;
});

// Tag every demo ride against the demo bike so Garage / VehicleCards roll up.
DEMO_RIDES.forEach((r) => { r.bikeId = DEMO_BIKE_ID; });

// Name a spread of rides the way a real rider would, so history reads lived-in.
([
  [4, 'Box Hill loop'],
  [8, 'Commute, the long way'],
  [10, 'Ace Cafe bike night'],
  [12, 'Rain, rain and more rain'],
  [19, 'Chain stretched, limped home'],
  [23, 'South Downs with Rico'],
  [27, 'Sunset run'],
  [31, 'First ride after service'],
  [36, 'Wales weekend day 1'],
  [37, 'Wales weekend day 2'],
  [42, 'Picked her up'],
] as const).forEach(([i, name]) => {
  if (DEMO_RIDES[i]) DEMO_RIDES[i].name = name;
});

// A few starred favourites, so Burn Trips has rides it keeps.
([
  [0, 'Rico time attack'],
  [6, 'Sunday twisties'],
  [15, 'Coast run with the crew'],
] as const).forEach(([i, name]) => {
  const ride = DEMO_RIDES[i];
  if (!ride) return;
  ride.starred = true;
  ride.name = name;
});

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

/**
 * Spectre cards: one from beating Rico's time attack, one from the demo
 * rider beating their own challenge on the V4 Ducati.
 */
export const DEMO_SPECTRE_CARDS: SpectreCard[] = [
  {
    key: 'demo-drop-01',
    card: { ...DEMO_COLLECTED_CARDS[0], ts: Date.now() - 2 * 86_400_000 },
    setterName: 'Rico',
    timeSec: 221,
    targetSec: 238,
    earnedAt: Date.now() - 2 * 86_400_000,
  },
  {
    key: 'demo-drop-03',
    card: {
      v: 1,
      i: DEMO_BIKE_ID.replace(/-/g, ''),
      n: DEMO_BIKE.name,
      m: DEMO_BIKE.makeModel,
      o: DEMO_NAME,
      t: 'gold',
      tl: 'Gold',
      s: { totalRides: 74, totalDistanceMi: 1234, totalDurationSec: 89 * 3600 + 12 * 60, topSpeedMph: 142, maxLean: 45, maxGForce: 1.6 },
      ts: Date.now() - 4 * 86_400_000,
    },
    img: DEMO_BIKE_HERO,
    setterName: DEMO_NAME,
    timeSec: 297,
    targetSec: 305,
    earnedAt: Date.now() - 4 * 86_400_000,
  },
];

/**
 * The demo V4 Ducati's logbook history: bought second-hand from Marco, whose
 * rides (and older, already-burned trips) came with it.
 */
const DEMO_BOUGHT_AT = DEMO_BIKE.createdAt;
const DEMO_PREVIOUS_KEEPER = 'Marco';
const demoInheritedRides = ([
  // [days before hand-over, name, miles, minutes, top mph, lean L, lean R, convoy]
  [12, 'Last ride with Marco', 64, 88, 131, 44, 47, false],
  [26, 'Alps pass day', 142, 236, 118, 51, 49, true],
  [33, '', 38, 55, 109, 39, 42, false],
  [47, 'Track day warm-up', 22, 34, 149, 55, 56, false],
  [61, '', 51, 70, 116, 41, 38, true],
  [80, 'Coast to coast', 188, 301, 124, 43, 45, true],
  [102, '', 29, 44, 98, 35, 37, false],
  [131, 'Running-in done', 73, 110, 94, 31, 33, false],
] as const).map(([daysBefore, name, mi, mins, top, ll, lr, convoy], i) => {
  const start = DEMO_BOUGHT_AT - daysBefore * 86_400_000;
  return {
    id: `demo-inherited-${i}`,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + mins * 60_000).toISOString(),
    name: name || undefined,
    isConvoyRide: convoy,
    distance: mi,
    duration: mins * 60,
    averageSpeed: Math.round((mi / (mins / 60)) * 10) / 10,
    maxSpeed: top,
    maxLeanLeft: ll,
    maxLeanRight: lr,
    maxGForce: Math.round((1 + (ll + lr) / 200) * 100) / 100,
    owner: DEMO_PREVIOUS_KEEPER,
  };
});

export const DEMO_LOGBOOK = {
  owners: [{ name: DEMO_PREVIOUS_KEEPER, from: DEMO_BOUGHT_AT - 540 * 86_400_000, to: DEMO_BOUGHT_AT }],
  rides: demoInheritedRides,
  // Marco's older trips, burned from his history before the sale.
  archived: {
    rides: 19,
    convoyRides: 6,
    distance: 1310,
    duration: 19 * 5400,
    maxSpeed: 152,
    maxGForce: 1.5,
    maxLeanLeft: 48,
    maxLeanRight: 50,
    longestRide: 214,
    badges: { speedDemon: 2, journeyman: 3, fallback: 1 },
  },
  passport: 'BT-D4C1-0417',
  notes: [
    { id: 'demo-note-1', author: DEMO_PREVIOUS_KEEPER, at: DEMO_BOUGHT_AT - 400 * 86_400_000, text: tr("Termignoni slip-on fitted, stock can in the loft. Ask if you want it.") },
    { id: 'demo-note-2', author: DEMO_PREVIOUS_KEEPER, at: DEMO_BOUGHT_AT - 90 * 86_400_000, text: tr("Front tyre scrubbed in at the track day. Rear has maybe 2,000 miles left.") },
    { id: 'demo-note-3', author: DEMO_PREVIOUS_KEEPER, at: DEMO_BOUGHT_AT - 2 * 86_400_000, text: tr("Look after her. Warm-up takes a good five minutes when it is cold.") },
    { id: 'demo-note-4', author: DEMO_NAME, at: DEMO_BOUGHT_AT + 30 * 86_400_000, text: tr("Swapped to Pirelli Rosso IVs. Grip is unreal.") },
    { id: 'demo-note-5', author: DEMO_NAME, at: Date.now() - 60 * 86_400_000, text: tr("Chain adjusted at 8,900 km. Keep an eye on the rear sprocket.") },
    { id: 'demo-note-6', author: DEMO_NAME, at: Date.now() - 6 * 86_400_000, text: tr("Wales trip: 612 miles in two days, zero issues. Best bike I have owned.") },
  ],
};

/** Badge wallet: every badge type earned over a year of riding, two card copies already traded. */
export const DEMO_WALLET = {
  counts: {
    'speed-demon': 15,
    journeyman: 9,
    'lean-fiend': 6,
    'g-lock': 4,
    'corner-carver': 7,
    'night-owl': 5,
    'hard-ass': 3,
    'always-out': 2,
    fallback: 5,
  },
  spent: 20,
  kickbacks: 6,
};

/** Saved spots and recent searches on the Blacktop map. */
export const DEMO_SAVED_POIS = [
  { id: 'demo-poi-1', name: 'Home', lat: 51.4613, lng: -0.1156, createdAt: new Date(Date.now() - 300 * 86_400_000).toISOString() },
  { id: 'demo-poi-2', name: 'Ace Cafe London', lat: 51.5413, lng: -0.2789, createdAt: new Date(Date.now() - 200 * 86_400_000).toISOString() },
  { id: 'demo-poi-3', name: 'Box Hill viewpoint', lat: 51.2525, lng: -0.3107, createdAt: new Date(Date.now() - 150 * 86_400_000).toISOString() },
  { id: 'demo-poi-4', name: "Rico's garage", lat: 51.4012, lng: -0.2551, createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() },
];

export const DEMO_RECENT_LOCATIONS = [
  { id: 'demo-recent-1', name: 'Loomies Cafe', address: 'West Meon, Hampshire', lat: 51.0386, lng: -1.0848 },
  { id: 'demo-recent-2', name: 'Bwlch y Groes', address: 'Gwynedd, Wales', lat: 52.7869, lng: -3.6497 },
  { id: 'demo-recent-3', name: 'Devil\u2019s Punch Bowl', address: 'Hindhead, Surrey', lat: 51.1195, lng: -0.7196 },
];

export const DEMO_SCORES: ArcadeScores = {
  'hit-heavy': 14,    // peak Gs
  'petrol-head': 83,  // seconds survived
  'legacy-derez': 6,  // wins
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
