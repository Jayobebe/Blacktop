/**
 * npm run crash:check
 *
 * Plays made-up rides through the crash check (`CrashDetector`) and fails if
 * it asks when it shouldn't or stays quiet when it should ask. It tests the
 * reasoning, not the sensors: what a real crash looks like to a phone still
 * has to be learnt on the road (the trace on /device-check is for that).
 */
import { CRASH, CrashDetector, type CrashEvent } from '../src/features/ride/lib/crashDetector';

const G = 5; // the default threshold
const STOP = 10; // the default stop window, seconds

interface Step {
  /** Seconds this stretch lasts. */
  for: number;
  /** Speed in mph: a figure, or from → to across the stretch. */
  mph: number | [number, number];
  /** GPS fixes arriving? Default yes (one a second). */
  gps?: boolean;
  /** Background G the phone feels (1.0 = lying still). Default: 1.5 moving, 1.02 stopped. */
  shake?: number;
  /** A knock of this many G at the start of the stretch. */
  hit?: number;
}

function run(steps: Step[], threshold = G, stop = STOP) {
  const events: CrashEvent[] = [];
  const d = new CrashDetector(threshold, stop, (e) => events.push(e));
  let now = 1_000_000;
  let fixAt: number | null = now;
  let mph = 0;
  const fired: number[] = [];
  const start = now;
  for (const s of steps) {
    const [from, to] = Array.isArray(s.mph) ? s.mph : [s.mph, s.mph];
    const ticks = Math.round(s.for * 20);
    for (let i = 0; i < ticks; i++) {
      const real = from + ((to - from) * i) / Math.max(1, ticks - 1);
      // One fix a second while GPS is up; the speed on hand only changes with a fix.
      if (s.gps !== false && i % 20 === 0) {
        mph = real;
        fixAt = now;
      }
      d.speed(mph, now, fixAt);
      const base = s.shake ?? (real > 1 ? 1.5 : 1.02);
      d.sample(i === 0 && s.hit ? s.hit : base, now);
      if (i % 10 === 0 && d.tick(now)) fired.push((now - start) / 1000);
      now += 50;
    }
  }
  return { fired, events };
}

const ride: Step[] = [{ for: 20, mph: [0, 50] }, { for: 30, mph: 50 }];
let failed = 0;
function check(name: string, steps: Step[], want: 'asks' | 'quiet', more?: (r: ReturnType<typeof run>) => string | null) {
  const r = run(steps);
  const asked = r.fired.length > 0;
  let why = asked === (want === 'asks') ? null : `expected it to ${want === 'asks' ? 'ask' : 'stay quiet'}, it ${asked ? `asked at ${r.fired[0].toFixed(1)} s` : 'stayed quiet'}`;
  why ??= more?.(r) ?? null;
  if (why) failed++;
  console.log(`${why ? 'FAIL' : ' ok '}  ${name}${why ? `: ${why}` : ''}`);
}

check('A crash at 50 mph, stopped in four seconds', [...ride, { for: 4, mph: [50, 0], hit: 9 }, { for: 20, mph: 0 }], 'asks', (r) =>
  r.fired[0] > 50 + 4 + STOP - 1.5 && r.fired[0] < 50 + 4 + STOP + 3 ? null : `asked at ${r.fired[0].toFixed(1)} s, not a stop window after coming to rest`,
);
check('A crash where the phone loses GPS and lies still', [...ride, { for: 3, mph: [50, 0], hit: 9, gps: false, shake: 2 }, { for: 30, mph: 0, gps: false }], 'asks', (r) =>
  r.events.some((e) => e.kind === 'fired' && e.by === 'motion') ? null : 'it should have judged the stop by the phone lying still',
);
check('A slide: impact, then nine seconds coming to rest', [...ride, { for: 9, mph: [50, 0], hit: 7 }, { for: 20, mph: 0 }], 'asks');
check('Stopped, got going for a moment, stopped again', [...ride, { for: 3, mph: [50, 0], hit: 8 }, { for: 3, mph: 0 }, { for: 2, mph: 6 }, { for: 20, mph: 0 }], 'asks');
check('A pothole at 50 mph, ridden on from', [...ride, { for: 40, mph: 50, hit: 8 }], 'quiet', (r) => (r.events.some((e) => e.kind === 'rode-on') ? null : 'the impact was never let go'));
check('A pothole, then lights half a minute later', [...ride, { for: 30, mph: 50, hit: 8 }, { for: 5, mph: [50, 0] }, { for: 30, mph: 0 }], 'quiet');
check('A pothole in a tunnel (no GPS), ridden on from', [...ride, { for: 40, mph: 50, hit: 8, gps: false }], 'quiet');
check('Hard braking to a stop, no impact', [...ride, { for: 3, mph: [50, 0], shake: 2.2 }, { for: 30, mph: 0 }], 'quiet');
check('The phone knocked while parked', [...ride, { for: 5, mph: [50, 0] }, { for: 20, mph: 0 }, { for: 30, mph: 0, hit: 9 }], 'quiet', (r) =>
  r.events.some((e) => e.kind === 'standstill') ? null : 'the knock should be noted as taken at a standstill',
);
check('A knock before the ride has got going', [{ for: 10, mph: 5 }, { for: 20, mph: 0, hit: 9 }], 'quiet');
check('A knock under the threshold, then a stop', [...ride, { for: 4, mph: [50, 0], hit: G - 0.5 }, { for: 30, mph: 0 }], 'quiet');
check('Two crashes inside the cool-down ask once', [...ride, { for: 3, mph: [50, 0], hit: 9 }, { for: 15, mph: 0 }, { for: 10, mph: [0, 40] }, { for: 3, mph: [40, 0], hit: 9 }, { for: 30, mph: 0 }], 'asks', (r) =>
  r.fired.length === 1 ? null : `asked ${r.fired.length} times inside ${CRASH.cooldownMs / 1000} s`,
);

// Known and accepted, so a change that alters it is seen: a hard knock in the first seconds after pulling up asks.
check('Known: the bike dropped on its stand three seconds after stopping', [...ride, { for: 4, mph: [50, 0] }, { for: 3, mph: 0 }, { for: 30, mph: 0, hit: 6 }], 'asks');

if (failed) {
  console.error(`\n${failed} crash check${failed === 1 ? '' : 's'} failed`);
  process.exit(1);
}
console.log('\nCrash check: all scenarios pass');
