// npm run sharedroute:check — convoy route sharing (src/features/map/lib/sharedRoute.ts): a made-up
// convoy route cut to start where another rider is, the line's compact encoding, and the rules for
// when a convoy mate's route may be taken (the same plan and preferences, on the line, not past the
// first leg) and what a shared message must look like to be kept.
import {
  JOIN_M,
  decodeLine,
  encodeLine,
  findSharedRoute,
  receiveSharedRoute,
  setRouteLeading,
  setRoutePublisher,
  shareRoute,
  waitForSharedRoute,
  sliceRouteFrom,
} from '../src/features/map/lib/sharedRoute';
import type { RouteResult } from '../src/features/map/lib/routing';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

// A route due north from (51, 0): 6 km in two legs (a waypoint at 4 km), a point every 50 m,
// a manoeuvre every kilometre. 1e-5 degrees of latitude is 1.11 m.
const LAT0 = 51;
const north = (m: number): [number, number] => [0, LAT0 + m / 111_320];
const line: [number, number][] = Array.from({ length: 121 }, (_, i) => north(i * 50));
const step = (at: number, name: string, len: number) => ({ type: 'turn', modifier: 'straight', exit: null, location: north(at), name, ref: '', rotary: '', side: 'left' as const, distance: len, duration: len / 20 });
const route: RouteResult = {
  geometry: { type: 'LineString', coordinates: line },
  distanceMeters: 6000,
  durationSeconds: 300,
  legs: [
    { distance: 4000, duration: 200, steps: [step(0, 'High Street', 1000), step(1000, 'London Road', 1000), step(2000, 'A23', 2000), { ...step(4000, '', 0), type: 'arrive' }] },
    { distance: 2000, duration: 100, steps: [step(4000, 'A23', 2000), { ...step(6000, '', 0), type: 'arrive' }] },
  ],
  durationRangeSeconds: [280, 340],
};

// The line, compactly.
{
  const back = decodeLine(encodeLine(line));
  const worst = back ? Math.max(...back.map((p, i) => Math.max(Math.abs(p[0] - line[i][0]), Math.abs(p[1] - line[i][1])))) : 1;
  check('the line survives its encoding to within a metre', !!back && back.length === line.length && worst <= 0.000006, `${encodeLine(line).length} characters for ${line.length} points`);
  check('a garbled line is refused', decodeLine('\u0001\u0002') === null);
}

// Cutting it where a rider is.
{
  const at = { lat: LAT0 + 2300 / 111_320, lng: 10 / (111_320 * Math.cos((LAT0 * Math.PI) / 180)) };
  const cut = sliceRouteFrom(route, at);
  check('a rider 10 m off the line, 2.3 km along, takes it from there', !!cut && Math.abs(cut.distanceMeters - 3700) < 5, cut ? `${Math.round(cut.distanceMeters)} m left` : 'not taken');
  if (cut) {
    const first = cut.legs?.[0];
    check('the line starts at their spot on it', Math.abs(cut.geometry.coordinates[0][1] - at.lat) < 0.00001 && cut.geometry.coordinates[0][0] === 0);
    check('the manoeuvres behind them are gone, a depart where they join', first?.steps[0].type === 'depart' && first.steps[0].name === 'A23' && first.steps.length === 2, first?.steps.map((s) => `${s.type}:${s.name}`).join(' '));
    check('the first leg is what is left of it, the second unchanged', Math.abs((first?.distance ?? 0) - 1700) < 5 && cut.legs?.[1]?.distance === 2000 && cut.legs?.length === 2);
    check('times scale with what is left', Math.abs(cut.durationSeconds - 300 * (3700 / 6000)) < 1 && Math.abs((cut.durationRangeSeconds?.[0] ?? 0) - 280 * (3700 / 6000)) < 1);
  }
  const far = { lat: LAT0 + 2300 / 111_320, lng: (JOIN_M + 20) / (111_320 * Math.cos((LAT0 * Math.PI) / 180)) };
  check(`more than ${JOIN_M} m off the line, it isn't theirs`, sliceRouteFrom(route, far) === null);
  check('past the first leg (the stops after them differ), it is left alone', sliceRouteFrom(route, { lat: LAT0 + 5000 / 111_320, lng: 0 }) === null);
  check('right at the end of the first leg, too little left to take', sliceRouteFrom(route, { lat: LAT0 + 3900 / 111_320, lng: 0 }) === null);
}

// Between convoy mates.
{
  const sent: unknown[] = [];
  const stops = (lat: number) => [{ lat, lng: 0 }, { lat: LAT0 + 4000 / 111_320, lng: 0 }, { lat: LAT0 + 6000 / 111_320, lng: 0 }];
  check('out of a convoy nothing is shared or found', (shareRoute(stops(LAT0), 'moto', route), findSharedRoute(stops(LAT0 + 0.001), 'moto')) === null);
  setRoutePublisher((p) => sent.push(p));
  shareRoute(stops(LAT0), 'moto', route);
  check('a route from the server is shared with the convoy', sent.length === 1 && JSON.stringify(sent[0]).length < 20_000, `${JSON.stringify(sent[0]).length} bytes`);
  // Another phone: it hears the share.
  setRoutePublisher(null);
  setRoutePublisher(() => {});
  receiveSharedRoute(sent[0]);
  const mate = findSharedRoute(stops(LAT0 + 1500 / 111_320), 'moto');
  check('a convoy mate on the line takes the shared route', !!mate && Math.abs(mate.distanceMeters - 4500) < 5, mate ? `${Math.round(mate.distanceMeters)} m` : 'asked the server');
  check('one on a different vehicle or preferences asks the server', findSharedRoute(stops(LAT0 + 1500 / 111_320), 'car') === null);
  const otherPlan = [{ lat: LAT0 + 1500 / 111_320, lng: 0 }, { lat: LAT0 + 6000 / 111_320, lng: 0 }];
  check('one going somewhere else asks the server', findSharedRoute(otherPlan, 'moto') === null);
  // Junk off the channel is ignored.
  setRoutePublisher(null);
  setRoutePublisher(() => {});
  for (const junk of [null, 5, { v: 2 }, { ...(sent[0] as object), line: 'x'.repeat(10) }, { ...(sent[0] as object), legs: [{ distance: 'a' }] }, { ...(sent[0] as object), distance: Infinity }]) receiveSharedRoute(junk);
  check('malformed shares are ignored', findSharedRoute(stops(LAT0 + 1500 / 111_320), 'moto') === null);
  // Leaving the convoy forgets everything.
  receiveSharedRoute(sent[0]);
  setRoutePublisher(null);
  setRoutePublisher(() => {});
  check('leaving the convoy forgets its routes', findSharedRoute(stops(LAT0 + 1500 / 111_320), 'moto') === null);
}

// Setting off together: members wait a moment for the leader's route.
{
  const stops = (lat: number) => [{ lat, lng: 0 }, { lat: LAT0 + 4000 / 111_320, lng: 0 }, { lat: LAT0 + 6000 / 111_320, lng: 0 }];
  let leaderShare: unknown = null;
  setRoutePublisher((p) => (leaderShare = p));
  shareRoute(stops(LAT0), 'moto', route); // too soon after the last share: held back
  await new Promise((r) => setTimeout(r, 15_100));
  shareRoute(stops(LAT0), 'moto', route);
  setRoutePublisher(null);

  // A member at the lobby, 15 m from the leader, the same plan: waits, and takes it when it comes.
  setRoutePublisher(() => {});
  setRouteLeading(false);
  const t0 = Date.now();
  const waiting = waitForSharedRoute(stops(LAT0 + 15 / 111_320), 'moto', 3000);
  setTimeout(() => receiveSharedRoute(leaderShare), 400);
  const got = await waiting;
  check("a member setting off with the convoy takes the leader's route as it arrives", !!got && Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
  // A reroute on that plan (off the line): straight to the server, no wait.
  const t1 = Date.now();
  const again = await waitForSharedRoute(stops(LAT0 + 15 / 111_320), 'moto', 3000);
  check("a reroute on a plan already seen doesn't wait", again === null && Date.now() - t1 < 50);
  // The leader never waits.
  setRouteLeading(true);
  const newPlan = [{ lat: LAT0, lng: 0 }, { lat: LAT0 + 0.05, lng: 0 }];
  const t2 = Date.now();
  check('the leader never waits', (await waitForSharedRoute(newPlan, 'moto', 3000)) === null && Date.now() - t2 < 50);
  // Nothing comes: the member asks the server after the wait.
  setRouteLeading(false);
  const t3 = Date.now();
  const none = await waitForSharedRoute([{ lat: LAT0, lng: 0 }, { lat: LAT0 + 0.07, lng: 0 }], 'moto', 300);
  check('nothing shared: the member asks the server once the wait is up', none === null && Date.now() - t3 >= 290, `${Date.now() - t3} ms`);
  setRoutePublisher(null);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll shared route checks passed');
process.exit(failed ? 1 : 0);
