// npm run reroute:check — when guidance asks for a new route (src/features/map/lib/rerouteRules.ts):
// made-up rides a fix a second, the ones that should reroute (off route, clearly off, a missed turn,
// riding the route backwards) and the ones that mustn't (GPS wobble, a junction's wobble, cutting a
// corner, lag on the way into a turn, pushing the bike the wrong way, asking again too soon).
import { RerouteWatch, type RerouteReason, type RerouteSample } from '../src/features/map/lib/rerouteRules';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

/** A ride: one sample a second from a starting state, each changed by `step(i)`. */
function ride(n: number, step: (i: number) => Partial<RerouteSample>, w = new RerouteWatch(), t0 = 100_000) {
  const out: Array<{ i: number; reason: RerouteReason }> = [];
  for (let i = 0; i < n; i++) {
    const s: RerouteSample = { now: t0 + i * 1000, offset: 5, along: i * 13, speed: 13, heading: 0, lineBearing: 0, nearestTurn: null, ...step(i) };
    const r = w.feed(s);
    if (r) out.push({ i, reason: r });
  }
  return { out, w };
}
// A little noise, the same every run.
let seed = 7;
const noise = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

// On the line with GPS wobble (up to 20 m): never.
check('riding the line with 20 m of GPS wobble never reroutes', ride(300, () => ({ offset: noise() * 20 })).out.length === 0);

// A junction's wobble: 50 m off for 2 s, then back.
check('50 m off for 2 s at a junction then back: no reroute', ride(20, (i) => ({ offset: i >= 5 && i < 7 ? 50 : 5 })).out.length === 0);

// Off route as before: 50 m off and staying off asks after 4 s.
{
  const r = ride(20, (i) => ({ offset: i >= 5 ? 55 : 5 })).out;
  check('50 m off and staying off asks after 4 s', r[0]?.reason === 'off-route' && r[0].i === 9, JSON.stringify(r[0]));
}

// Clearly off: 100 m in a couple of fixes asks within 2 s, not 4.
{
  const r = ride(20, (i) => ({ offset: i >= 5 ? 50 + (i - 5) * 30 : 5 })).out;
  check('clearly off the route asks sooner', r[0]?.reason === 'off-route' && r[0].i <= 8, JSON.stringify(r[0]));
}

// A missed turn: the route turns at 500 m, the rider carries straight on at 30 mph (13 m/s).
{
  // From 300 m before the turn: the match stops at the corner and the distance off grows as they go on.
  const r = ride(40, (i) => {
    const pastTurn = Math.max(0, 200 + i * 13 - 500);
    return { along: Math.min(200 + i * 13, 500), offset: pastTurn > 0 ? 3 + pastTurn * 0.9 : 3, nearestTurn: 500 };
  }).out;
  const at = r[0];
  const metresPast = at ? 200 + at.i * 13 - 500 : null;
  check('going straight past a turn asks at the junction', at?.reason === 'missed-turn' && metresPast != null && metresPast <= 70, at ? `${metresPast} m past the turn` : 'never');
}

// Taking the turn but cutting the corner (up to 22 m off around it): never.
check('cutting the corner of a turn never reroutes', ride(40, (i) => ({ along: i * 13, offset: Math.abs(i * 13 - 500) < 40 ? 22 : 4, nearestTurn: 500 })).out.length === 0);

// GPS lagging on the way into a turn (35 m off before it): not a missed turn, and too short for off route.
check('GPS lag before a turn is not a missed turn', ride(40, (i) => ({ along: i * 13, offset: i * 13 > 440 && i * 13 < 485 ? 35 : 4, nearestTurn: 500 })).out.length === 0);

// Riding the route backwards at 30 mph: asks after 5 s.
{
  const r = ride(20, (i) => ({ heading: i >= 3 ? 180 : 0 })).out;
  check('riding the route backwards asks after 5 s', r[0]?.reason === 'wrong-way' && r[0].i === 8, JSON.stringify(r[0]));
}

// Pushing the bike the wrong way at walking pace: never.
check('walking the bike back along the route never reroutes', ride(40, () => ({ heading: 180, speed: 1.4 })).out.length === 0);

// Asking again too soon: off route again 6 s after a new route waits for the 12 s; a missed turn may ask after 8 s.
{
  const w = new RerouteWatch();
  const first = ride(10, (i) => ({ offset: i >= 1 ? 100 : 5 }), w, 0).out;
  w.newRoute();
  const again = ride(14, () => ({ offset: 100 }), w, 4000).out;
  const asked = again[0] ? 4000 + again[0].i * 1000 - (first[0].i * 1000) : null;
  check('off route again soon after a new route waits 12 s from the last ask', asked != null && asked >= 12_000, `${asked} ms`);
  const w2 = new RerouteWatch();
  const f2 = ride(10, (i) => ({ offset: i >= 1 ? 100 : 5 }), w2, 0).out;
  w2.newRoute();
  const miss = ride(14, (i) => ({ along: 500, nearestTurn: 500, offset: i >= 1 ? 40 : 5 }), w2, 3000).out;
  const gap = miss[0] ? 3000 + miss[0].i * 1000 - f2[0].i * 1000 : null;
  check('a missed turn may ask 8 s after the last', gap != null && gap >= 8000 && gap < 12_000, `${gap} ms`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll reroute checks passed');
process.exit(failed ? 1 : 0);
