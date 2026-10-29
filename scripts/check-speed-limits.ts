/**
 * npm run speedlimit:check
 *
 * Reads made-up maxspeed tags and plays made-up rides along made-up roads
 * through `RoadMatcher` (src/lib/speedLimitRoads.ts), and fails if a tag reads
 * wrong, or the limit shown isn't the road being ridden: a side road running
 * alongside, a bridge crossing overhead, a junction, GPS wobble, leaving the
 * roads. It tests the reasoning, not OpenStreetMap's data.
 */
import { decodeCellWays, LimitAsker, parseMaxspeed, RoadMatcher, type Way } from '../src/lib/speedLimitRoads';
import { CELL as CELL_SIZE, MARGIN as CELL_MARGIN, encodeCell } from '../supabase/functions/place-search/speedCells';

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

// ── When to ask Valhalla (LimitAsker): on a new road, never on a timer ─────
{
  const LAT0 = 51;
  const toLngLat = (e: number, n: number): [number, number] => [e / (111_320 * Math.cos((LAT0 * Math.PI) / 180)), LAT0 + n / 111_320];
  type Leg = { heading: number; metres: number; mps: number; seconds?: number };
  /**
   * Rides the legs a fix a second, keeping the trail as lib/speedLimit.ts does (12 m apart, the
   * last 8), and counts the questions; `road` is the answer (name, limit) at a spot. `oldRule`:
   * the schedule before 2026-10-29, every 10 s or 250 m.
   */
  const simulate = (legs: Leg[], road: (e: number, n: number) => [string, number], oldRule = false) => {
    const asker = new LimitAsker();
    let trail: Array<[number, number]> = [];
    let e = 0, n = 0, t = 0;
    let lastAsk = -1e9;
    let lastAskAt: [number, number] | null = null;
    const asks: Array<{ t: number; e: number; n: number }> = [];
    for (const leg of legs) {
      const steps = leg.seconds ?? Math.max(1, Math.round(leg.metres / Math.max(leg.mps, 0.001)));
      for (let i = 0; i < steps; i++) {
        t += 1000;
        e += Math.sin((leg.heading * Math.PI) / 180) * leg.mps;
        n += Math.cos((leg.heading * Math.PI) / 180) * leg.mps;
        const here = toLngLat(e, n);
        // As lib/speedLimit.ts: a new point once the newest is 12 m on from the one before it.
        const m = (p: [number, number], q: [number, number]) => Math.hypot((q[0] - p[0]) * 111_320 * Math.cos((LAT0 * Math.PI) / 180), (q[1] - p[1]) * 111_320);
        if (trail.length < 2 || m(trail[trail.length - 2], trail[trail.length - 1]) >= 12) trail = [...trail.slice(-7), here];
        else trail[trail.length - 1] = here;
        // lib/speedLimit.ts asks nothing below about 4 mph.
        if (leg.mps < 1.8 || trail.length < 3) continue;
        const due = oldRule
          ? !lastAskAt || t - lastAsk >= 10_000 || Math.hypot(e - lastAskAt[0], n - lastAskAt[1]) >= 250
          : asker.due(trail, t);
        if (!due) continue;
        asks.push({ t, e, n });
        lastAsk = t;
        lastAskAt = [e, n];
        asker.asked(trail, t);
        const [name, kmh] = road(e, n);
        asker.answered(name, kmh);
      }
    }
    return asks;
  };
  const oneRoad = (): [string, number] => ['High Street', 48];

  // A town at 30 mph (13.4 m/s), ten minutes on one road.
  const town = [{ heading: 0, metres: 8040, mps: 13.4 }];
  const oldTown = simulate(town, oneRoad, true).length;
  const newTown = simulate(town, oneRoad).length;
  check('ten minutes on one town road asks a fraction of what it did', newTown * 4 <= oldTown, `before ${oldTown}, now ${newTown}`);

  // 20 mph (8.9 m/s), fixes a second apart, under 12 m: still asks (it never did before 2026-10-29).
  const slow = simulate([{ heading: 0, metres: 1200, mps: 8.9 }], oneRoad);
  check('a slow town road at 20 mph asks at all', slow.length >= 1 && slow[0].n <= 60, slow.length ? `first at ${Math.round(slow[0].n)} m` : 'never asked');

  // A motorway at 70 mph (31.3 m/s), ten minutes.
  const mway = [{ heading: 90, metres: 18_780, mps: 31.3 }];
  const oldM = simulate(mway, () => ['M1', 113], true).length;
  const newM = simulate(mway, () => ['M1', 113]).length;
  check('a motorway asks about once a kilometre once it knows the road', newM <= 21 && newM * 3 <= oldM, `before ${oldM}, now ${newM} over 18.8 km`);

  // Five minutes stopped in traffic between two stretches: nothing while stopped.
  const go = { heading: 0, metres: 300, mps: 10 };
  const without = simulate([go, go], oneRoad).length;
  const withJam = simulate([go, { heading: 0, metres: 0, mps: 0, seconds: 300 }, go], oneRoad).length;
  check('standing in traffic asks nothing', withJam === without, `${without} without the jam, ${withJam} with it`);

  // A right turn at a junction: asked within 60 m of it, long before the next 500 m.
  const turn = simulate(
    [{ heading: 0, metres: 1500, mps: 13.4 }, { heading: 90, metres: 400, mps: 13.4 }],
    (e) => (e > 5 ? ['Mill Lane', 32] : ['High Street', 48]),
  );
  const afterTurn = turn.find((a) => a.e > 5);
  check('a turn onto a new road asks within 60 m of it', !!afterTurn && afterTurn.e <= 60, afterTurn ? `${Math.round(afterTurn.e)} m after the turn` : 'never asked');

  // Gentle bends (15 degrees either way) aren't turns.
  const bends = Array.from({ length: 20 }, (_, i) => ({ heading: i % 2 ? 15 : -15, metres: 200, mps: 20 }));
  const bendy = simulate(bends, () => ['B2135', 96]).length;
  check('gentle bends on one road ask no more than the distance check', bendy <= 6, `${bendy} over 4 km`);

  // A village's 30 on the same road, no turn: found within 500 m.
  const village = simulate([{ heading: 0, metres: 4000, mps: 22 }], (_e, n) => (n > 2000 ? ['A272', 48] : ['A272', 96]));
  const found = village.find((a) => a.n > 2000);
  check('a lower limit on the same road is found within 1 km of it', !!found && found.n - 2000 <= 1000, found ? `${Math.round(found.n - 2000)} m in` : 'never');

  // The longest it goes between questions while moving: 1 km.
  const asks = simulate(mway, () => ['M1', 113]);
  const gap = Math.max(...asks.map((a, i) => (i ? Math.hypot(a.e - asks[i - 1].e, a.n - asks[i - 1].n) : 0)));
  check('never more than 1 km between questions while moving', gap <= 1050, `${Math.round(gap)} m`);
}

// ── The shared speed-limit map: the server's cell file read back on the phone ─────
{
  const row = Math.floor(51.0 / CELL_SIZE);
  const col = Math.floor(-0.2 / CELL_SIZE);
  const south = row * CELL_SIZE;
  const west = col * CELL_SIZE;
  // A made-up Overpass answer: a 30 mph street across the cell, and a motorway that runs 30 km on past it.
  const street = Array.from({ length: 20 }, (_, i) => ({ lat: south + 0.007, lon: west + 0.0005 + i * 0.0007 }));
  const motorway = Array.from({ length: 400 }, (_, i) => ({ lat: south - 0.1 + i * 0.001, lon: west + 0.01 }));
  const overpass = {
    elements: [
      { type: 'way', tags: { highway: 'residential', maxspeed: '30 mph' }, geometry: street },
      { type: 'way', tags: { highway: 'motorway', maxspeed: 'GB:motorway' }, geometry: motorway },
      { type: 'node', lat: 0, lon: 0 },
    ],
  };
  const file = encodeCell(row, col, overpass, 1);
  const ways = decodeCellWays(file as never, CELL_SIZE, CELL_MARGIN);
  const worst = (() => {
    let d = 0;
    for (let i = 0; i < street.length; i++) {
      d = Math.max(d, Math.abs(ways[0].pts[i * 2] - street[i].lon), Math.abs(ways[0].pts[i * 2 + 1] - street[i].lat));
    }
    return d;
  })();
  check('a cell file reads back on the phone within a metre', ways.length === 2 && worst <= 0.000006, `${ways.length} roads, worst ${(worst * 111_320).toFixed(2)} m`);
  check('its limits read as tagged', ways[0].limit?.value === 30 && ways[0].limit?.unit === 'mph' && ways[1].limit?.value === 70, `${ways[0].limit?.value} / ${ways[1].limit?.value}`);
  const kept = ways[1].pts.length / 2;
  check('a road running far past the cell keeps only the stretch near it', kept < 40 && kept >= 15, `${kept} of 400 points`);
  const json = JSON.stringify(file);
  check('the file stays small', json.length < 1500, `${json.length} bytes`);
  // The matcher on the decoded roads: riding the street shows 30.
  const m = new RoadMatcher();
  let shown: string | null = null;
  for (let i = 2; i < 18; i++) {
    const r = m.step(street[i].lat + 0.00003, street[i].lon, 13, ways);
    shown = r ? String(r.value) : '-';
  }
  check('riding the decoded street shows its 30', shown === '30', String(shown));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll speed limit checks passed');
process.exit(failed ? 1 : 0);
