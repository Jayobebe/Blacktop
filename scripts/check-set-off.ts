/**
 * npm run setoff:check
 *
 * Plays made-up fixes through Home's "On the move?" reasoning
 * (`setOffDetector`) and fails if it would ask when the rider hasn't set off,
 * or stay quiet when they have. It tests the reasoning, not a phone's GPS.
 */
import { ANCHOR_MAX_MS, SetOffDetector, coarseMoved, setOffRuleFor, type CoarseFix } from '../src/features/ride/lib/setOffDetector';

const MPH = 2.2369;
const LAT = 51.5;
const M_PER_DEG = 111320;

interface Leg {
  /** Seconds this stretch lasts. */
  for: number;
  /** mph: a figure, or from → to across the stretch. */
  mph: number | [number, number];
}
interface Gps {
  /** The phone gives its own speed. Default yes. */
  ownSpeed?: boolean;
  /** How vague the position is, metres. Default 8. */
  accuracy?: number;
  /** A position wobble of this many metres, alternating each second. Default 0. */
  wobble?: number;
  /** Seconds (from the start) at which the phone's own speed reads this many mph, once. */
  spike?: [number, number];
}

/** Seconds until the GPS stage says "moving", or null. */
function sharp(motorised: boolean, legs: Leg[], gps: Gps = {}): number | null {
  const d = new SetOffDetector(setOffRuleFor(motorised), motorised);
  let t = 0;
  let north = 0;
  for (const leg of legs) {
    for (let s = 0; s < leg.for; s++, t++) {
      const mph = typeof leg.mph === 'number' ? leg.mph : leg.mph[0] + ((leg.mph[1] - leg.mph[0]) * s) / leg.for;
      north += mph / MPH;
      const off = gps.wobble ? (t % 2 ? gps.wobble : -gps.wobble) : 0;
      const own = gps.spike && gps.spike[0] === t ? gps.spike[1] : mph;
      const hit = d.next({
        lat: LAT + (north + off) / M_PER_DEG,
        lng: 0,
        t: t * 1000,
        deviceMph: gps.ownSpeed === false ? null : own,
        accuracy: gps.accuracy ?? 8,
      });
      if (hit) return t;
    }
  }
  return null;
}

/** Whether rough fixes every `every` seconds would wake the GPS, given a pace and how vague they are. */
function coarse(motorised: boolean, mph: number, seconds: number, accuracy: number, every = 15, jitter = 0): boolean {
  const rule = setOffRuleFor(motorised);
  let anchor: CoarseFix | null = null;
  for (let t = 0; t <= seconds; t += every) {
    const off = jitter ? ((t / every) % 2 ? jitter : -jitter) : 0;
    const fix: CoarseFix = { lat: LAT + ((mph / MPH) * t + off) / M_PER_DEG, lng: 0, t: t * 1000, accuracy, speed: null };
    if (coarseMoved(anchor, fix, rule)) return true;
    if (!anchor || fix.t - anchor.t > ANCHOR_MAX_MS) anchor = fix;
  }
  return false;
}

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const asks = (name: string, at: number | null, by: number) => check(name, at != null && at <= by, at == null ? 'never asked' : `asked at ${at} s`);
const quiet = (name: string, at: number | null) => check(name, at == null, at == null ? '' : `asked at ${at} s`);

// The GPS stage
asks('motorcycle pulls away', sharp(true, [{ for: 5, mph: 0 }, { for: 6, mph: [0, 30] }, { for: 30, mph: 30 }]), 25);
asks('car in slow traffic at 14 mph', sharp(true, [{ for: 40, mph: 14 }]), 15);
asks('bicycle at 11 mph', sharp(false, [{ for: 5, mph: 0 }, { for: 40, mph: 11 }]), 30);
asks('bicycle, phone gives no speed', sharp(false, [{ for: 40, mph: 11 }], { ownSpeed: false }), 30);
quiet('standing still', sharp(true, [{ for: 120, mph: 0 }]));
quiet('walking at 3 mph', sharp(true, [{ for: 120, mph: 3 }]));
quiet('walking, bicycle rider', sharp(false, [{ for: 120, mph: 3.5 }]));
quiet('standing still, position wobbling 15 m, no speed from the phone', sharp(true, [{ for: 120, mph: 0 }], { ownSpeed: false, wobble: 15 }));
quiet('standing still, one 40 mph reading', sharp(true, [{ for: 120, mph: 0 }], { spike: [30, 40] }));
quiet('a burst to 20 mph for 4 s, then stopped', sharp(true, [{ for: 4, mph: 20 }, { for: 60, mph: 0 }]));
quiet('moving but the GPS is vague (120 m)', sharp(true, [{ for: 60, mph: 30 }], { accuracy: 120 }));

// The rough-fix stage that wakes it
check('rough fixes: car at 25 mph wakes the GPS', coarse(true, 25, 90, 40));
check('rough fixes: bicycle at 10 mph wakes the GPS', coarse(false, 10, 120, 30));
check('rough fixes: standing still, 60 m jitter, stays asleep', !coarse(true, 0, 600, 80, 15, 60));
check('rough fixes: walking at 3 mph stays asleep', !coarse(false, 3, 600, 30));
check('rough fixes: very vague (800 m) at 20 mph stays asleep', !coarse(true, 20, 60, 800));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll set-off checks passed');
