import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, Gauge, Activity, CloudRain, Video, Globe2, Radio, Wrench, Sparkles, Zap } from 'lucide-react';
import type { AppSettings } from '@/features/settings';
import type { ExperienceTerms } from './terms';
import type { RideMode, RideStyle } from './profile';
import { VEHICLES, type VehicleType } from './vehicles';

/**
 * The "Do you care about…?" deck. Each answer owns a set of opt-in feature
 * flags in AppSettings — yes switches them on, no switches them off and
 * hides the UI that depends on them.
 *
 * Answers are not stored separately: a question counts as "yes" whenever any
 * of its (applicable) features is on, so AppSettings stays the single source
 * of truth and manual changes in Settings flow back here automatically.
 */
export type CareId = 'safety' | 'speed' | 'performance' | 'routes' | 'garage' | 'content' | 'collect' | 'community' | 'music' | 'track';

type BoolFeature = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

export interface CareContext {
  vehicles: VehicleType[];
  rideMode: RideMode;
  terms: ExperienceTerms;
  canLean: boolean;
  motorised: boolean;
}

export interface CareQuestion {
  id: CareId;
  icon: LucideIcon;
  /** Short name for Settings and the preview ledger. */
  label: string;
  question: (c: CareContext) => string;
  pitch: (c: CareContext) => string;
  /** What saying yes turns on, as chips. */
  gets: (c: CareContext) => string[];
  /** What saying no hides, so the trade-off is explicit. */
  hides: (c: CareContext) => string;
  features: BoolFeature[];
  /** Drop features that make no sense for this rider (e.g. lean for cars). */
  featureApplies?: (f: BoolFeature, c: CareContext) => boolean;
  /** Skip the question entirely when nothing it controls applies. */
  applies?: (c: CareContext) => boolean;
  needsMotion?: boolean;
  recommendedFor: RideStyle[];
}

export const CARE_QUESTIONS: CareQuestion[] = [
  {
    id: 'safety',
    icon: ShieldCheck,
    label: 'Crash rescue',
    question: () => 'Want help sent if you crash?',
    pitch: (c) =>
      c.rideMode === 'solo'
        ? `If a hard impact is followed by a stop, Blacktop asks if you're okay. No answer and it alerts your Discord server (connect one in Settings).`
        : `If a hard impact is followed by a stop, Blacktop asks if you're okay. No answer and it alerts your group leader.`,
    gets: () => ['Crash detection', 'Safety status on Home', '"Are you okay?" check-in'],
    hides: () => 'Crash detection stays off',
    features: ['autoRescueEnabled'],
    needsMotion: true,
    recommendedFor: ['commute', 'fitness', 'leisure', 'performance', 'social'],
  },
  {
    id: 'speed',
    icon: Gauge,
    label: 'Speed',
    question: () => 'Do you care about your speed?',
    pitch: (c) => `Live speed as the big number while you ${c.terms.ride}, plus top and average speed afterwards.`,
    gets: () => ['Live speed readout', 'Top speed stats', 'Speed on receipts'],
    hides: (c) => `Distance and time lead instead. Speed stays out of your way while you ${c.terms.ride}.`,
    features: ['speedFocusEnabled'],
    recommendedFor: ['performance', 'fitness', 'social'],
  },
  {
    id: 'performance',
    icon: Activity,
    label: 'Cornering data',
    question: (c) => (c.canLean ? 'Want to see how far you lean?' : 'Want to feel the G-forces?'),
    pitch: (c) =>
      c.canLean
        ? 'Live lean angle and G-force from your phone, with a corner-by-corner report after each ride.'
        : 'A live G-force gauge and a trace of every corner, brake and launch.',
    gets: (c) => (c.canLean ? ['Lean angle gauge', 'G-force gauge', 'Corner report'] : ['G-force gauge', 'G-force trace']),
    hides: () => 'No gauges, just the essentials',
    features: ['leanAngleEnabled', 'gForceEnabled'],
    featureApplies: (f, c) => f !== 'leanAngleEnabled' || c.canLean,
    needsMotion: true,
    recommendedFor: ['performance'],
  },
  {
    id: 'routes',
    icon: CloudRain,
    label: 'Routes & weather',
    question: () => 'Want to plan around the weather?',
    pitch: (c) =>
      c.motorised
        ? 'Rain radar on the map, drier route suggestions and speed camera warnings.'
        : 'Rain radar on the map and drier route suggestions before you head out.',
    gets: (c) => (c.motorised ? ['Rain radar', 'Drier routes', 'Speed cameras'] : ['Rain radar', 'Drier routes']),
    hides: () => 'A clean map with just your route',
    features: ['weatherOverlayEnabled', 'weatherRoutingEnabled', 'trafficCamerasEnabled'],
    featureApplies: (f, c) => f !== 'trafficCamerasEnabled' || c.motorised,
    recommendedFor: ['commute', 'leisure', 'fitness'],
  },
  {
    id: 'garage',
    icon: Wrench,
    label: 'Garage',
    question: (c) => `Want to keep your ${c.terms.vehicle} in a garage?`,
    pitch: (c) => `Photograph your ${c.terms.vehicle}, log the miles on it and get reminded when servicing is due.`,
    gets: (c) => ['Service reminders', `${cap(c.terms.vehicle)} photo on receipts`, 'Mileage per vehicle'],
    hides: (c) => `No garage tab, and no ${c.terms.vehicle} on your receipts`,
    features: ['garageEnabled'],
    recommendedFor: ['commute', 'leisure', 'performance'],
  },
  {
    id: 'content',
    icon: Video,
    label: 'Film & share',
    question: (c) => `Want to film and share your ${c.terms.rides}?`,
    pitch: () => 'Export a video overlay with your stats for your helmet or dash cam footage, and replay any route as a 3D flyover.',
    gets: () => ['Overlay videos', '3D flyovers'],
    hides: () => 'No video tools',
    features: ['rideOverlayEnabled', 'flyoverEnabled'],
    recommendedFor: ['leisure', 'performance', 'social'],
  },
  {
    id: 'collect',
    icon: Sparkles,
    label: 'Collecting',
    question: () => 'Into collecting?',
    pitch: (c) => `Earn badges and trading cards from your ${c.terms.rides}, and find card drops hidden on the map.`,
    gets: () => ['Badges', 'Trading cards', 'Card drops on the map'],
    // Your own vehicle cards are minted from garage vehicles; badges and drops work without one.
    hides: () => 'No badges or cards anywhere, including receipts',
    features: ['collectiblesEnabled'],
    recommendedFor: ['social', 'performance'],
  },
  {
    id: 'community',
    icon: Globe2,
    label: 'Community',
    question: (c) => `Want to meet other ${c.terms.riders}?`,
    pitch: (c) => `Blacktop World (press and hold the globe on Home): a live map of ${c.terms.riders} and crews, crew leaderboards, weekly challenges and the arcade. While you ${c.terms.ride}, you appear on the globe as an anonymous glow, rounded to about 110 km.`,
    gets: () => ['Blacktop World', 'Crews & leaderboards', 'Challenges', 'Anonymous glow on the globe'],
    hides: () => 'Blacktop stays private to you and your convoys',
    features: ['blacktopWorldEnabled'],
    recommendedFor: ['social', 'performance'],
  },
  {
    id: 'track',
    icon: Zap,
    label: 'Track Pack',
    question: () => 'Do you do track days?',
    pitch: () =>
      'Lap and sector timing from your phone, live timing and a pit board for your pit crew on their phone, and lap-by-lap traces after every session.',
    gets: () => ['Lap & sector timing', 'Pit crew link', 'Pit board messages', 'Lap traces & export'],
    hides: () => 'No Track Pack button on Home',
    features: ['trackPackEnabled'],
    applies: (c) => c.motorised,
    recommendedFor: ['performance'],
  },
  {
    id: 'music',
    icon: Radio,
    label: 'Music',
    question: (c) => `Music while you ${c.terms.ride}?`,
    pitch: () => 'Blacktop Radio: build stations from your own music files and flip between them from Home or mid-ride.',
    gets: () => ['Blacktop Radio', 'Radio button on Home'],
    hides: () => 'No radio controls',
    features: ['radioEnabled'],
    recommendedFor: ['leisure', 'commute'],
  },
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function careContext(vehicles: VehicleType[], rideMode: RideMode, terms: ExperienceTerms): CareContext {
  return {
    vehicles,
    rideMode,
    terms,
    canLean: vehicles.some((v) => VEHICLES[v].canLean),
    motorised: vehicles.some((v) => VEHICLES[v].motorised),
  };
}

function featuresFor(q: CareQuestion, c: CareContext) {
  return q.featureApplies ? q.features.filter((f) => q.featureApplies!(f, c)) : q.features;
}

export function isCareOn(q: CareQuestion, settings: AppSettings, c: CareContext): boolean {
  return featuresFor(q, c).some((f) => settings[f]);
}

/** Settings patch for a yes/no answer. Non-applicable features are forced off. */
export function carePatch(q: CareQuestion, on: boolean, c: CareContext): Partial<AppSettings> {
  const patch: Record<string, boolean> = {};
  q.features.forEach((f) => {
    patch[f] = on && (!q.featureApplies || q.featureApplies(f, c));
  });
  return patch as Partial<AppSettings>;
}

/** Questions that apply, most relevant to the chosen style first. */
export function orderedQuestions(c: CareContext, style: RideStyle | null): CareQuestion[] {
  const applicable = CARE_QUESTIONS.filter((q) => !q.applies || q.applies(c));
  if (!style) return applicable;
  return [...applicable].sort(
    (a, b) => Number(b.recommendedFor.includes(style)) - Number(a.recommendedFor.includes(style))
  );
}

/** Resolves true when motion sensors are usable. Must be called from a user gesture on iOS. */
export async function requestMotionPermission(): Promise<boolean> {
  const anyMotion = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (anyMotion && typeof anyMotion.requestPermission === 'function') {
    try {
      return (await anyMotion.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}
