import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, Gauge, Activity, CloudRain, Video, Globe2, Radio, Wrench, Sparkles, Zap } from 'lucide-react';
import type { AppSettings } from '@/features/settings';
import type { ExperienceTerms } from './terms';
import type { RideMode, RideStyle } from './profile';
import { VEHICLES, type VehicleType } from './vehicles';
import { tr } from '@/lib/i18n';

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
    label: tr("Crash rescue"),
    question: () => tr("Want help sent if you crash?"),
    pitch: (c) =>
      c.rideMode === 'solo'
        ? tr("If a hard impact is followed by a stop, Blacktop asks if you're okay. No answer and it alerts your Discord server (connect one in Settings).")
        : tr("If a hard impact is followed by a stop, Blacktop asks if you're okay. No answer and it alerts your group leader."),
    gets: () => [tr("Crash detection"), tr("Safety status on Home"), tr("\"Are you okay?\" check-in")],
    hides: () => tr("Crash detection stays off"),
    features: ['autoRescueEnabled'],
    needsMotion: true,
    recommendedFor: ['commute', 'fitness', 'leisure', 'performance', 'social'],
  },
  {
    id: 'speed',
    icon: Gauge,
    label: tr("Speed"),
    question: () => tr("Do you care about your speed?"),
    pitch: (c) =>
      c.terms.car
        ? tr("Live speed as the big number while you drive, plus top and average speed afterwards.")
        : tr("Live speed as the big number while you ride, plus top and average speed afterwards."),
    gets: () => [tr("Live speed readout"), tr("Top speed stats"), tr("Speed on receipts")],
    hides: (c) =>
      c.terms.car
        ? tr("Distance and time lead instead. Speed stays out of your way while you drive.")
        : tr("Distance and time lead instead. Speed stays out of your way while you ride."),
    features: ['speedFocusEnabled'],
    recommendedFor: ['performance', 'fitness', 'social'],
  },
  {
    id: 'performance',
    icon: Activity,
    label: tr("Cornering data"),
    question: (c) => (c.canLean ? tr("Want to see how far you lean?") : tr("Want to feel the G-forces?")),
    pitch: (c) =>
      c.canLean
        ? tr("Live lean angle and G-force from your phone, with a corner-by-corner report after each ride.")
        : tr("A live G-force gauge and a trace of every corner, brake and launch."),
    gets: (c) => (c.canLean ? [tr("Lean angle gauge"), tr("G-force gauge"), tr("Corner report")] : [tr("G-force gauge"), tr("G-force trace")]),
    hides: () => tr("No gauges, just the essentials"),
    features: ['leanAngleEnabled', 'gForceEnabled'],
    featureApplies: (f, c) => f !== 'leanAngleEnabled' || c.canLean,
    needsMotion: true,
    recommendedFor: ['performance'],
  },
  {
    id: 'routes',
    icon: CloudRain,
    label: tr("Routes & weather"),
    question: () => tr("Want to plan around the weather?"),
    pitch: (c) =>
      c.motorised
        ? tr("Rain radar on the map, drier route suggestions and speed camera warnings.")
        : tr("Rain radar on the map and drier route suggestions before you head out."),
    gets: (c) => (c.motorised ? [tr("Rain radar"), tr("Drier routes"), tr("Speed cameras")] : [tr("Rain radar"), tr("Drier routes")]),
    hides: () => tr("A clean map with just your route"),
    features: ['weatherOverlayEnabled', 'weatherRoutingEnabled', 'trafficCamerasEnabled'],
    featureApplies: (f, c) => f !== 'trafficCamerasEnabled' || c.motorised,
    recommendedFor: ['commute', 'leisure', 'fitness'],
  },
  {
    id: 'garage',
    icon: Wrench,
    label: tr("Garage"),
    question: (c) => tr("Want to keep your {0} in a garage?", [c.terms.vehicle]),
    pitch: (c) => tr("Photograph your {0}, log the miles on it and get reminded when servicing is due.", [c.terms.vehicle]),
    gets: (c) => [tr("Service reminders"), tr("{0} photo on receipts", [c.terms.Vehicle]), tr("Mileage per vehicle")],
    hides: (c) => tr("No garage tab, and no {0} on your receipts", [c.terms.vehicle]),
    features: ['garageEnabled'],
    recommendedFor: ['commute', 'leisure', 'performance'],
  },
  {
    id: 'content',
    icon: Video,
    label: tr("Film & share"),
    question: (c) => tr("Want to film and share your {0}?", [c.terms.rides]),
    pitch: () => tr("Export a video overlay with your stats for your helmet or dash cam footage, and replay any route as a 3D flyover."),
    gets: () => [tr("Overlay videos"), '3D flyovers'],
    hides: () => tr("No video tools"),
    features: ['rideOverlayEnabled', 'flyoverEnabled'],
    recommendedFor: ['leisure', 'performance', 'social'],
  },
  {
    id: 'collect',
    icon: Sparkles,
    label: tr("Collecting"),
    question: () => tr("Into collecting?"),
    pitch: (c) => tr("Earn badges and trading cards from your {0}, and find card drops hidden on the map.", [c.terms.rides]),
    gets: () => ['Badges', tr("Trading cards"), tr("Card drops on the map")],
    // Your own vehicle cards are minted from garage vehicles; badges and drops work without one.
    hides: () => tr("No badges or cards anywhere, including receipts"),
    features: ['collectiblesEnabled'],
    recommendedFor: ['social', 'performance'],
  },
  {
    id: 'community',
    icon: Globe2,
    label: tr("Community"),
    question: (c) => tr("Want to meet other {0}?", [c.terms.riders]),
    pitch: (c) =>
      c.terms.car
        ? tr("Blacktop World (press and hold the globe on Home): a live map of {0} and crews, crew leaderboards, weekly challenges and the arcade. While you drive, you appear on the globe as an anonymous glow, rounded to about 110 km.", [c.terms.riders])
        : tr("Blacktop World (press and hold the globe on Home): a live map of {0} and crews, crew leaderboards, weekly challenges and the arcade. While you ride, you appear on the globe as an anonymous glow, rounded to about 110 km.", [c.terms.riders]),
    gets: () => [tr("Blacktop World"), tr("Crews & leaderboards"), 'Challenges', tr("Anonymous glow on the globe")],
    hides: () => tr("Blacktop stays private to you and your convoys"),
    features: ['blacktopWorldEnabled'],
    recommendedFor: ['social', 'performance'],
  },
  {
    id: 'track',
    icon: Zap,
    label: tr("Track Day"),
    question: () => tr("Do you do track days?"),
    pitch: () =>
      tr("Lap and sector timing from your phone, live timing and a pit board for your pit crew on their phone, and lap-by-lap traces after every session."),
    gets: () => [tr("Lap & sector timing"), tr("Pit crew link"), tr("Pit board messages"), tr("Lap traces & export")],
    hides: () => tr("No Track Day button on Home"),
    features: ['trackPackEnabled'],
    applies: (c) => c.motorised,
    recommendedFor: ['performance'],
  },
  {
    id: 'music',
    icon: Radio,
    label: tr("Music"),
    question: (c) => (c.terms.car ? tr("Music while you drive?") : tr("Music while you ride?")),
    pitch: () => tr("Blacktop Radio: build stations from your own music files and flip between them from Home or mid-ride."),
    gets: () => [tr("Blacktop Radio"), tr("Radio button on Home")],
    hides: () => tr("No radio controls"),
    features: ['radioEnabled'],
    recommendedFor: ['leisure', 'commute'],
  },
];


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
