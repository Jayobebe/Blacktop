import type { LatLng } from '../types';
import { metres, toLocal } from './geometry';

/**
 * Track builder, method 1: turn the roads inside a box into one closed lap.
 *
 * `place-search {kind:'roads'}` returns OSM ways cut at the box edge, with node
 * ids. `buildEdges` splits them at every junction into edges; the rider taps
 * edges to remove them, and `analyseLoop` works out what's left:
 *   - dead ends (and anything only reachable through them) are trimmed
 *     automatically, so removing one piece of an unwanted loop drops all of it;
 *   - a node still joining 3+ roads is a junction the rider has to resolve;
 *   - otherwise the kept roads are one loop (or several separate loops).
 */

export interface RoadPiece {
  id: string;
  hw: string;
  name?: string;
  raceway?: string;
  /** [lat, lng, osmNodeId] */
  pts: [number, number, number][];
}

export interface RoadEdge {
  id: string;
  /** Node keys at either end (OSM node ids). */
  a: string;
  b: string;
  coords: LatLng[];
  length: number;
  name?: string;
  raceway: boolean;
  /** Looks like a pit lane / paddock road: removed up front on a circuit. */
  pit: boolean;
}

export type LoopStatus = 'loop' | 'none' | 'junctions' | 'several';

export interface LoopAnalysis {
  status: LoopStatus;
  /** The lap, clockwise by default, first point not repeated at the end. */
  loop: LatLng[] | null;
  length: number;
  /** Edges that make up the lap (or the kept network when there's no single lap). */
  kept: Set<string>;
  /** Edges ignored because they lead nowhere. */
  trimmed: Set<string>;
  /** Where 3+ kept roads still meet. */
  junctions: LatLng[];
  /** Separate loops in the kept network (status 'several'). */
  components: string[][];
}

/**
 * Pit lanes by name ("Pit Lane", "Pits", "Pit Entry", "Disused Pit Lane"), not
 * corners like "Paddock Hill" or racing straights like Bathurst's "Pit Straight".
 */
const PIT = /^\s*pits?\s*$|\bpit(s|[ -]?(lane|entry|exit|road|in|out))\b/i;

/** A way that's a pit lane by its name or raceway tag (the rule laps use to leave pit lanes out). */
export const looksLikePit = (name?: string, raceway?: string) => PIT.test(name ?? '') || /pit/i.test(raceway ?? '');

function pathLength(coords: LatLng[]) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += metres(coords[i - 1], coords[i]);
  return d;
}

/** Splits road pieces at every node shared with another piece (or itself) and at their ends. */
export function buildEdges(pieces: RoadPiece[]): RoadEdge[] {
  const uses = new Map<number, number>();
  for (const p of pieces) for (const [, , n] of p.pts) uses.set(n, (uses.get(n) ?? 0) + 1);

  const edges: RoadEdge[] = [];
  for (const p of pieces) {
    const raceway = p.hw === 'raceway';
    const pit = PIT.test(p.name ?? '') || /pit/i.test(p.raceway ?? '');
    let start = 0;
    let k = 0;
    for (let i = 1; i < p.pts.length; i++) {
      const last = i === p.pts.length - 1;
      if (!last && (uses.get(p.pts[i][2]) ?? 0) < 2) continue;
      const run = p.pts.slice(start, i + 1);
      const coords = run.map(([lat, lng]) => ({ lat, lng }));
      edges.push({
        id: `${p.id}/${k++}`,
        a: String(run[0][2]),
        b: String(run[run.length - 1][2]),
        coords,
        length: pathLength(coords),
        name: p.name,
        raceway,
        pit,
      });
      start = i;
    }
  }
  return edges;
}

/** Up front: on a circuit, keep only the race track itself (minus pit lanes). */
export function initialRemovals(edges: RoadEdge[]): Set<string> {
  if (!edges.some((e) => e.raceway)) return new Set();
  return new Set(edges.filter((e) => !e.raceway || e.pit).map((e) => e.id));
}

export interface LapOption {
  /** Edge ids that make up this lap. */
  ids: string[];
  length: number;
}

/**
 * Every distinct lap the kept roads allow (e.g. a circuit's GP and Indy
 * layouts), longest first, so the rider can pick one with a tap instead of
 * resolving junctions by hand. Chains of roads between junctions are
 * collapsed first, so this is a search over a handful of junctions.
 */
export function lapOptions(edges: RoadEdge[], removed: Set<string>, max = 6): LapOption[] {
  const { kept } = analyseLoop(edges, removed);
  const live = edges.filter((e) => kept.has(e.id));
  const byNode = new Map<string, RoadEdge[]>();
  for (const e of live) {
    for (const n of e.a === e.b ? [e.a] : [e.a, e.b]) byNode.set(n, [...(byNode.get(n) ?? []), e]);
  }
  const degree = (n: string) => (byNode.get(n) ?? []).reduce((d, e) => d + (e.a === e.b ? 2 : 1), 0);
  const isJunction = (n: string) => degree(n) > 2;

  // Collapse degree-2 runs into chains between junctions.
  interface Chain { from: string; to: string; ids: string[]; length: number }
  const chains: Chain[] = [];
  const used = new Set<string>();
  const loops: LapOption[] = [];
  const walk = (start: string, first: RoadEdge): Chain => {
    const ids: string[] = [];
    let length = 0;
    let at = start;
    let e = first;
    for (;;) {
      used.add(e.id);
      ids.push(e.id);
      length += e.length;
      at = e.a === at ? e.b : e.a;
      if (isJunction(at) || at === start) break;
      const next = (byNode.get(at) ?? []).find((x) => x !== e && !used.has(x.id));
      if (!next) break;
      e = next;
    }
    return { from: start, to: at, ids, length };
  };
  for (const n of byNode.keys()) {
    if (!isJunction(n)) continue;
    for (const e of byNode.get(n)!) if (!used.has(e.id)) chains.push(walk(n, e));
  }
  // Loops with no junction at all are laps on their own.
  for (const e of live) {
    if (used.has(e.id)) continue;
    const c = walk(e.a, e);
    loops.push({ ids: c.ids, length: c.length });
  }

  // Simple cycles over the junction graph (each found once: from its lowest node).
  const nodes = [...new Set(chains.flatMap((c) => [c.from, c.to]))];
  const rank = new Map(nodes.map((n, i) => [n, i]));
  const adj = new Map<string, Chain[]>();
  for (const c of chains) for (const n of c.from === c.to ? [c.from] : [c.from, c.to]) adj.set(n, [...(adj.get(n) ?? []), c]);
  const out = new Map<string, LapOption>();
  // Shared fairly between start nodes, so a busy road network can't starve the rest.
  const perStart = Math.max(2_000, Math.floor(200_000 / Math.max(1, nodes.length)));
  let budget = 0;
  for (const s of nodes) {
    budget = perStart;
    const sr = rank.get(s)!;
    const path: Chain[] = [];
    const onPath = new Set<string>([s]);
    const dfs = (at: string) => {
      for (const c of adj.get(at) ?? []) {
        if (--budget < 0) return;
        if (path.includes(c)) continue;
        const to = c.from === at ? c.to : c.to === at ? c.from : null;
        if (to === null) continue;
        if (to === s) {
          const ids = [...path, c].flatMap((x) => x.ids);
          const key = [...ids].sort().join(',');
          if (!out.has(key)) out.set(key, { ids, length: [...path, c].reduce((d, x) => d + x.length, 0) });
          continue;
        }
        if (onPath.has(to) || rank.get(to)! < sr) continue;
        path.push(c);
        onPath.add(to);
        dfs(to);
        path.pop();
        onPath.delete(to);
      }
    };
    dfs(s);
  }

  // Longest first; drop near-duplicates (a lap differing only by a few metres of slip road).
  const all = [...out.values(), ...loops].sort((a, b) => b.length - a.length);
  const picked: LapOption[] = [];
  for (const o of all) {
    if (picked.some((p) => Math.abs(p.length - o.length) < 15)) continue;
    picked.push(o);
    if (picked.length >= max) break;
  }
  return picked.filter((o) => o.length >= 100);
}

/** Removals that leave exactly this lap. */
export function removalsFor(edges: RoadEdge[], lap: LapOption): Set<string> {
  const keep = new Set(lap.ids);
  return new Set(edges.filter((e) => !keep.has(e.id)).map((e) => e.id));
}

/** Signed area in m² (positive = anticlockwise). */
function signedArea(ring: LatLng[]) {
  const ref = ring[0];
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = toLocal(ring[i], ref);
    const q = toLocal(ring[(i + 1) % ring.length], ref);
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function analyseLoop(edges: RoadEdge[], removed: Set<string>): LoopAnalysis {
  const active = edges.filter((e) => !removed.has(e.id));
  const byNode = new Map<string, Set<RoadEdge>>();
  const pos = new Map<string, LatLng>();
  const add = (n: string, e: RoadEdge) => {
    if (!byNode.has(n)) byNode.set(n, new Set());
    byNode.get(n)!.add(e);
  };
  for (const e of active) {
    add(e.a, e);
    add(e.b, e);
    pos.set(e.a, e.coords[0]);
    pos.set(e.b, e.coords[e.coords.length - 1]);
  }
  // A closed way (a === b) counts twice at its node.
  const degree = (n: string) => {
    let d = 0;
    for (const e of byNode.get(n) ?? []) d += e.a === e.b ? 2 : 1;
    return d;
  };

  // Trim dead ends until none are left.
  const trimmed = new Set<string>();
  const queue = [...byNode.keys()].filter((n) => degree(n) === 1);
  while (queue.length) {
    const n = queue.pop()!;
    if (degree(n) !== 1) continue;
    const [e] = byNode.get(n)!;
    trimmed.add(e.id);
    byNode.get(e.a)?.delete(e);
    byNode.get(e.b)?.delete(e);
    const other = e.a === n ? e.b : e.a;
    if (degree(other) === 1) queue.push(other);
  }
  const keptEdges = active.filter((e) => !trimmed.has(e.id));
  const kept = new Set(keptEdges.map((e) => e.id));
  const base = { kept, trimmed, length: 0, loop: null as LatLng[] | null };

  if (!keptEdges.length) return { ...base, status: 'none', junctions: [], components: [] };

  const junctionNodes = [...byNode.keys()].filter((n) => degree(n) > 2);
  if (junctionNodes.length) {
    return { ...base, status: 'junctions', junctions: junctionNodes.map((n) => pos.get(n)!), components: [] };
  }

  // Every node now joins exactly two roads: walk each loop.
  const seen = new Set<string>();
  const loops: { ids: string[]; coords: LatLng[] }[] = [];
  for (const first of keptEdges) {
    if (seen.has(first.id)) continue;
    const ids: string[] = [];
    const coords: LatLng[] = [];
    let edge = first;
    let from = first.a;
    for (;;) {
      seen.add(edge.id);
      ids.push(edge.id);
      const forward = edge.a === from;
      const pts = forward ? edge.coords : [...edge.coords].reverse();
      coords.push(...(coords.length ? pts.slice(1) : pts));
      if (edge.a === edge.b) break; // a closed way is a loop on its own
      const at = forward ? edge.b : edge.a;
      const next = [...(byNode.get(at) ?? [])].find((e) => e !== edge);
      if (!next || seen.has(next.id)) break;
      from = at;
      edge = next;
    }
    if (coords.length > 1 && metres(coords[0], coords[coords.length - 1]) < 0.5) coords.pop();
    loops.push({ ids, coords });
  }

  if (loops.length > 1) {
    loops.sort((a, b) => pathLength(b.coords) - pathLength(a.coords));
    return { ...base, status: 'several', junctions: [], components: loops.map((l) => l.ids) };
  }

  let loop = loops[0].coords;
  if (loop.length < 3) return { ...base, status: 'none', junctions: [], components: [] };
  if (signedArea(loop) > 0) loop = [...loop].reverse(); // clockwise by default
  return {
    ...base,
    status: 'loop',
    loop,
    length: pathLength([...loop, loop[0]]),
    junctions: [],
    components: [loops[0].ids],
  };
}
