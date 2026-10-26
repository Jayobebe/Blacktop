/**
 * npm run speedlimit:check
 *
 * Reads made-up maxspeed tags and plays made-up rides along made-up roads
 * through `RoadMatcher` (src/lib/speedLimitRoads.ts), and fails if a tag reads
 * wrong, or the limit shown isn't the road being ridden: a side road running
 * alongside, a bridge crossing overhead, a junction, GPS wobble, leaving the
 * roads. It tests the reasoning, not OpenStreetMap's data.
 */
import { parseMaxspeed, RoadMatcher, type Way } from '../src/lib/speedLimitRoads';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

// ── Tags ──
const tags: [string | null, string | null][] = [
  ['50', '50 kmh'],
  ['30 mph', '30 mph'],
  ['70mph', '70 mph'],
  ['100 km/h', '100 kmh'],
  ['80;60', '80 kmh'],
  ['GB:nsl_single', '60 mph'],
  ['GB:nsl_dual', '70 mph'],
  ['DE:urban', '50 kmh'],
  ['DE:rural', '100 kmh'],
  ['FR:motorway', '130 kmh'],
  ['DE:zone30', '30 kmh'],
  ['GB:zone20', '20 mph'],
  ['none', null],
  ['signals', null],
  ['walk', null],
  ['DE:motorway', null],
  [null, null],
  ['0', null],
];
for (const [raw, want] of tags) {
  const got = parseMaxspeed(raw);
  const text = got ? `${got.value} ${got.unit}` : null;
  check(`tag ${JSON.stringify(raw)}`, text === want, `${text}`);
}

// ── Roads (a small made-up grid near 51.5 N) ──
const LAT = 51.5;
const LNG = -0.1;
const M = 111_320;
const K = Math.cos((LAT * Math.PI) / 180);
/** A point `e` metres east and `n` metres north of the origin, as [lng, lat]. */
const at = (e: number, n: number): [number, number] => [LNG + e / (M * K), LAT + n / M];
const line = (...pts: [number, number][]) => pts.flatMap(([e, n]) => at(e, n));
const way = (tag: string | null, ...pts: [number, number][]): Way => ({ limit: parseMaxspeed(tag), pts: line(...pts) });

// A 40 mph road running north, a 20 mph side road 18 m to its east alongside it for 300 m,
// a 70 mph motorway crossing under at n = 600 (east-west), a 30 mph road turning off east at n = 900.
const roads: Way[] = [
  way('40 mph', [0, -200], [0, 1200]),
  way('20 mph', [18, 100], [18, 400]),
  way('70 mph', [-800, 600], [800, 600]),
  way('30 mph', [0, 900], [800, 900]),
];

type Fix = { e: number; n: number; v: number };
function ride(fixes: Fix[]) {
  const m = new RoadMatcher();
  return fixes.map((f) => {
    const [lng, lat] = at(f.e, f.n);
    const l = m.step(lat, lng, f.v, roads);
    return l ? `${l.value}` : '-';
  });
}
const north = (from: number, to: number, step: number, wobble = 0, e = 0): Fix[] => {
  const out: Fix[] = [];
  for (let n = from, i = 0; n <= to; n += step, i++) out.push({ e: e + (i % 2 ? wobble : -wobble), n, v: step });
  return out;
};

{
  const shown = ride(north(-150, 1100, 15));
  check('riding the 40 shows 40 all the way, past the side road and over the motorway', shown.every((s) => s === '40'), shown.join(' '));
}
{
  const shown = ride(north(-150, 1100, 15, 8));
  check('the same with 8 m of GPS wobble', shown.every((s) => s === '40'), shown.join(' '));
}
{
  // Up the 40, then right at the junction onto the 30.
  const fixes = [...north(700, 890, 15), ...Array.from({ length: 30 }, (_, i) => ({ e: 15 + i * 15, n: 900, v: 15 }))];
  const shown = ride(fixes);
  const turnAt = north(700, 890, 15).length;
  const after = shown.slice(turnAt + 3);
  check('turning onto the 30 shows 30 within a few fixes', after.every((s) => s === '30'), shown.join(' '));
  check('and never the motorway or the side road', shown.every((s) => s === '40' || s === '30'), shown.join(' '));
}
{
  // Along the motorway under the bridge: the 40 crossing overhead mustn't take it.
  const fixes = Array.from({ length: 60 }, (_, i) => ({ e: -500 + i * 20, n: 600, v: 20 }));
  const shown = ride(fixes);
  check('riding the motorway under the 40 stays 70', shown.every((s) => s === '70'), shown.join(' '));
}
{
  // Off into a field for a while: no limit after three fixes.
  const fixes = [...north(0, 150, 15), ...Array.from({ length: 6 }, (_, i) => ({ e: 100 + i * 10, n: 150, v: 5 }))];
  const shown = ride(fixes);
  const firstOff = north(0, 150, 15).length;
  check('leaving the roads clears the limit on the third fix off them', shown[firstOff + 1] === '40' && shown[firstOff + 2] === '-' && shown[shown.length - 1] === '-', shown.join(' '));
}
{
  // One stray fix on the side road doesn't flip it.
  const fixes = [...north(0, 150, 15), { e: 18, n: 165, v: 15 }, ...north(180, 300, 15)];
  const shown = ride(fixes);
  check('one stray fix towards the side road changes nothing', shown.every((s) => s === '40'), shown.join(' '));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll speed limit checks passed');
process.exit(failed ? 1 : 0);
