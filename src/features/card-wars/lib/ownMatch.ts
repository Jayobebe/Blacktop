import type { BattleCard, Category } from '../types';
import { BRAND_CARDS, cardIdentity } from './catalog';

/**
 * Which catalog card a rider's own vehicle battles as. It used to be picked by
 * a hash of the vehicle's id, so a twenty-year-old 600 could land on a World
 * Superbike. Now it's the Road card nearest to what the vehicle is: the app
 * only has its name and make / model, so this reads what it can from those
 * (the catalog card itself if it is one, otherwise engine size, year and the
 * kind of machine) and works out rough ratings on the catalogue's own scales.
 * A guess, deliberately on the modest side: an own card is a Road card, and
 * riding lifts it from there (ownRatings.ts), never into a race series.
 * Plain maths, nothing leaves the phone.
 */
const ROAD = BRAND_CARDS.filter((c) => c.spec === 'factory');

type Kind = 'sport' | 'naked' | 'adventure' | 'cruiser' | 'scooter';

const clamp = (v: number, lo = 10, hi = 99) => Math.max(lo, Math.min(hi, v));
const speedRating = (kmh: number) => clamp(20 + ((kmh - 150) / 220) * 79);
const gRating = (hp: number, kg: number) => clamp(20 + 20 * Math.log2(((hp / kg) * 1000) / 150));
const leanRating = (deg: number) => clamp(20 + ((deg - 40) / 24) * 79);

const BIKE_WORDS = /\b(cbr|cb\d|gsx|gsf|zx|zzr|yzf|fzs?|fazer|r1|r3|r6|r7|r125|mt-?\d|ninja|panigale|monster|multistrada|duke|triple|daytona|fireblade|hayabusa|vfr|sv\d|bandit|hornet|z\d{3,4}|tiger|bonneville|scooter|vespa|motorcycle|motorbike|bike|sportster|versys|tracer|tenere|africa twin|v-?strom|rsv|tuono|speed twin)\b/i;
const SPORT = /rr\b|\b(cbr|gsx-?r|zx-?\d|zzr|yzf|r1\b|r3\b|r6\b|r7\b|r125|ninja|panigale|rsv|rs ?\d{3}|daytona|fireblade|hayabusa|supersport|sport)/i;
const ADVENTURE = /\b(gs|gsa|adventure|tiger|tracer|v-?strom|africa twin|multistrada|tenere|versys|transalp)\b/i;
const CRUISER = /\b(harley|sportster|softail|bonneville|cruiser|shadow|vulcan|bobber|chopper|enfield|rebel|intruder|fat boy|dyna)\b/i;
const SCOOTER = /\b(scooter|vespa|pcx|nmax|xmax|forza|burgman|tmax)\b/i;
const SUPERCAR = /\b(ferrari|lamborghini|mclaren|911|gt3|gt2|gt-?r|amg gt|r8|huracan|aventador|corvette|viper|nsx)\b/i;
const SPORTS_CAR = /\b(m[2-5]|rs ?\d|amg|type ?r|gti|gr ?yaris|gr86|gt86|brz|sti|wrx|cupra|golf r|mx-?5|miata|supra|z4|boxster|cayman|mustang|camaro|s2000|370z|350z|focus st|fiesta st|i30 ?n|megane rs|clio rs|abarth|john cooper|jcw)\b/i;

/** Engine size in cc, from "600", "CBR600F", "ZX-6R", "MT-07", "R6"… */
function engineSize(text: string): number | null {
  const short = text.match(/\b(?:yzf-?)?r(1|3|6|7)\b/i);
  if (short) return { '1': 1000, '3': 320, '6': 600, '7': 690 }[short[1]] ?? null;
  const zx = text.match(/\bzx-?(\d{1,2})r/i);
  if (zx) return Number(zx[1]) * 100;
  const mt = text.match(/\bmt-?0?(\d{1,2})\b/i);
  if (mt) return Number(mt[1]) >= 10 ? 1000 : Number(mt[1]) * 100;
  for (const m of text.matchAll(/(\d{2,4})/g)) {
    const n = Number(m[1]);
    // A year isn't an engine.
    if (m[1].length === 4 && n >= 1950 && n <= 2035) continue;
    if (n >= 50 && n <= 2500) return n;
  }
  return null;
}

const yearOf = (text: string): number | null => {
  const m = text.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? Number(m[1]) : null;
};

/** Rough ratings for a vehicle known only by its name. */
export function guessRatings(text: string, bike: boolean): Record<Category, number> {
  const year = yearOf(text);
  // Machines from before about 2012 give away power, grip and lean to today's.
  const age = year && year < 2012 ? Math.min(0.2, (2012 - year) * 0.008) : 0;
  if (!bike) {
    const [hp, kg, vmax, distance, corners] = SUPERCAR.test(text) ? [520, 1500, 310, 60, 74] : SPORTS_CAR.test(text) ? [290, 1430, 250, 76, 66] : [150, 1400, 205, 82, 50];
    return { speed: speedRating(vmax * (1 - age / 2)), lean: 30, g: gRating(hp * (1 - age), kg), distance, corners: corners - Math.round(age * 30) };
  }
  const kind: Kind = SCOOTER.test(text) ? 'scooter' : ADVENTURE.test(text) ? 'adventure' : CRUISER.test(text) ? 'cruiser' : SPORT.test(text) ? 'sport' : 'naked';
  const cc = engineSize(text) ?? (kind === 'sport' ? 600 : kind === 'adventure' ? 900 : kind === 'scooter' ? 125 : 650);
  const perCc = kind === 'sport' ? (cc <= 400 ? 0.11 : cc < 900 ? 0.19 : 0.2) : kind === 'naked' ? 0.115 : kind === 'adventure' ? 0.105 : kind === 'cruiser' ? 0.06 : 0.09;
  const hp = cc * perCc * (1 - age);
  const kg = ({ sport: 190, naked: 185, adventure: 240, cruiser: 260, scooter: 130 }[kind] + (cc - 650) * 0.03) * (1 + age / 2);
  const vmax = 55 * Math.pow(hp, 0.32) * (kind === 'cruiser' ? 0.85 : kind === 'adventure' ? 0.92 : 1);
  const lean = { sport: 55, naked: 50, adventure: 45, cruiser: 36, scooter: 42 }[kind] - age * 15;
  const distance = { sport: 48, naked: 68, adventure: 90, cruiser: 74, scooter: 60 }[kind];
  const corners = { sport: 74, naked: 66, adventure: 50, cruiser: 40, scooter: 50 }[kind] - age * 30;
  return { speed: speedRating(vmax), lean: leanRating(lean), g: gRating(hp, kg), distance, corners: clamp(corners) };
}

/**
 * The Road card an own vehicle battles as. `taken` lists matches already given
 * to the rider's other cards: a player battle needs five different ones, so a
 * second similar bike takes the next nearest.
 */
export function matchOwn(name: string, makeModel: string | undefined, fallback: 'car' | 'bike', taken: string[] = []): BattleCard {
  const text = `${makeModel ?? ''} ${name}`.trim();
  const identity = cardIdentity(name, makeModel);
  const bike = identity.displayVehicle ? identity.displayVehicle === 'bike' : BIKE_WORDS.test(text) ? true : SUPERCAR.test(text) || SPORTS_CAR.test(text) ? false : fallback === 'bike';
  const pool = ROAD.filter((c) => (c.vehicle === 'bike') === bike);
  // The vehicle itself is in the catalogue (the road version).
  const lower = text.toLowerCase();
  const itself = pool.find((c) => c.manufacturer === identity.manufacturer && lower.includes(c.name.toLowerCase()));
  const guess = itself ? itself.ratings : guessRatings(text, bike);
  const cats: Category[] = bike ? ['speed', 'g', 'distance', 'corners', 'lean'] : ['speed', 'g', 'distance', 'corners'];
  const far = (c: BattleCard) => cats.reduce((sum, k) => sum + (c.ratings[k] - guess[k]) ** 2, 0);
  const ranked = pool.slice().sort((a, b) => far(a) - far(b));
  return ranked.find((c) => !taken.includes(c.id)) ?? ranked[0];
}
